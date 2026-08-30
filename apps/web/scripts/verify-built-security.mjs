#!/usr/bin/env node
/* eslint-disable no-console -- CLI verification output is the public interface. */

const baseUrl = process.env.BUILT_WEB_URL;
if (!baseUrl) {
  console.log('[built-security] BUILT_WEB_URL not set; live verification skipped.');
  process.exit(0);
}

const url = new URL(baseUrl);
const response = await fetch(url);
const required = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': null,
};

for (const [name, expected] of Object.entries(required)) {
  const value = response.headers.get(name);
  if (!value) throw new Error(`[built-security] Missing ${name}`);
  if (expected && value !== expected) {
    throw new Error(`[built-security] ${name} expected ${expected}, got ${value}`);
  }
}

const csp = response.headers.get('content-security-policy');
if (!/script-src[^;]*'nonce-[^']+'/.test(csp)) {
  throw new Error('[built-security] CSP does not contain a per-response script nonce');
}
if (csp.includes("'unsafe-eval'")) {
  throw new Error('[built-security] CSP must not allow unsafe-eval');
}

console.log(`[built-security] passed (${response.status}) for ${url.origin}`);
