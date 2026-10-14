#!/usr/bin/env python3
"""GitHub webhook listener for Kestrel auto-deploy.

Listens on port 9000. Receives push events from GitHub, validates the
HMAC-SHA256 signature against WEBHOOK_SECRET, and runs docker-update.sh
in the background.

Stdlib only — no pip packages needed.
"""

import hashlib
import hmac
import json
import os
import signal
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").strip()
UPDATE_SCRIPT = "/opt/kestrel/scripts/docker-update.sh"
PORT = int(os.environ.get("WEBHOOK_PORT", "9000"))
MAX_BODY_BYTES = 1_048_576  # 1 MiB ceiling to prevent memory exhaustion


def verify_signature(body: bytes, signature_header: str) -> bool:
    """Constant-time HMAC-SHA256 comparison. Fails closed when secret is unset."""
    if not WEBHOOK_SECRET or not signature_header:
        return False
    try:
        algo, sig_hex = signature_header.split("=", 1)
        if algo != "sha256":
            return False
    except ValueError:
        return False
    expected = hmac.new(
        WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_hex)


class WebhookHandler(BaseHTTPRequestHandler):
    """Handles POST /hooks/update from GitHub."""

    def do_POST(self):
        if self.path != "/hooks/update":
            self.send_error(404, "Not Found")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "Invalid Content-Length")
            return

        if content_length < 0 or content_length > MAX_BODY_BYTES:
            self.send_error(413, "Payload Too Large")
            return

        body = self.rfile.read(content_length) if content_length > 0 else b""

        # Validate HMAC signature first before trusting headers or JSON body
        signature = self.headers.get("X-Hub-Signature-256", "")
        if not verify_signature(body, signature):
            self.send_error(403, "Invalid signature")
            return

        event = self.headers.get("X-GitHub-Event", "")
        if event != "push":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"ignored","reason":"not a push event"}\n')
            return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        ref = payload.get("ref", "")
        if ref != "refs/heads/main":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                b'{"status":"ignored","reason":"not main branch"}\n'
            )
            return

        print(
            f"[webhook] push to main detected — running {UPDATE_SCRIPT}",
            flush=True,
        )
        subprocess.Popen(
            [UPDATE_SCRIPT],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        self.send_response(202)
        self.end_headers()
        self.wfile.write(b'{"status":"accepted"}\n')

    def log_message(self, format, *args):
        print(f"[webhook] {args[0]}", flush=True)


def main():
    if hasattr(signal, "SIGCHLD"):
        signal.signal(signal.SIGCHLD, signal.SIG_IGN)
    print(f"[webhook] starting on port {PORT}", flush=True)
    server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
