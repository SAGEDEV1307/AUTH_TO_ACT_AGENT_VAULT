# MCP Integration

VaultAgent connects to multiple MCP servers and also exposes its own MCP endpoint.

## Outbound MCP connections (agent uses these)

| Server | What it does | How connected |
|--------|-------------|---------------|
| DeepSeek MCP | DeepSeek API via MCP protocol | stdio via npx |
| Ollama MCP | Local DeepSeek-R1 | stdio via npx |
| Filesystem MCP | Read/write `./data` directory | stdio via npx |
| Memory MCP | Key-value memory store | stdio via npx |

These start automatically when VaultAgent starts. Non-fatal if unavailable.

## Inbound MCP endpoint (clients connect to this)

SSE endpoint exposed by Express:
```
GET  /mcp/sse      — open SSE stream
POST /mcp/message  — send JSON-RPC 2.0 messages
```

Available tools via inbound MCP:
- `web_search` — search the web
- `http_request` — make HTTPS requests
- `blockchain_read` — read ETH data
- `blockchain_send` — send transactions (HITL gated)

## Connecting an MCP client

```bash
# Get auth token first
curl -k -X POST https://localhost:8443/auth/token \
  -H "Content-Type: application/json" \
  -d '{"api_key": "YOUR_MASTER_KEY"}'

# Connect via SSE (returns X-MCP-Session header)
curl -N http://localhost:3000/mcp/sse \
  -H "Authorization: Bearer TOKEN"
```
