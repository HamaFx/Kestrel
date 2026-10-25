# Connecting a remote MCP server

Kestrel uses `@mastra/mcp`'s `MCPClient` to connect a custom agent to a remote
Model Context Protocol server. Tools are namespaced by server id, so a server
with id `market` and a tool `quote` appears as `market_quote`.

## Configuration

```json
{
  "id": "market",
  "url": "https://mcp.example.com/mcp",
  "authorization": "Bearer <token>"
}
```

- `id`: lowercase kebab-case, unique within the agent.
- `url`: must be `https://` unless the host is loopback. The operator can allow
  plain HTTP with `MCP_ALLOW_INSECURE_URLS=1`.
- `authorization`: optional. It is encrypted at rest (`enc:v1:`) and never
  returned to the browser.
- At most 2 servers per agent by default (operator setting up to 5).

## Network boundary

Remote MCP URLs are an SSRF surface. Kestrel blocks loopback, private,
link-local and CGNAT hosts unless the operator sets
`MCP_ALLOW_PRIVATE_HOSTS=1`. It also forbids credentials inside the URL. The
operator should still run untrusted MCP servers behind an egress proxy.

## Failure behaviour

Discovery has a 15-second timeout. If a server is down, the agent runs with its
other tools and the UI shows that MCP tools were unavailable. A failed MCP
server never fails the chat turn.

## Trust

MCP tool output is untrusted external content. A custom agent must never follow
instructions found in it. The canonical safety suffix and the input guardrail
enforce this, but agent instructions should repeat it for MCP-heavy roles.
