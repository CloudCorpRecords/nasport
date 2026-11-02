# nasport

nasport routes operations for an Unraid server through a single tool.
Instead of dozens of separate tools, a caller names an action group
and a subaction inside it — `docker` / `list`, `system` / `overview`,
`vm` / `start` — and nasport validates the pair against a local
catalogue, applies a confirmation gate to destructive operations, and
forwards everything else to the server's GraphQL endpoint.

## Install

```bash
npx @reneturcios/nasport help
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/nasport
```

The container defaults to the MCP server. Pass CLI arguments to use
it as a CLI instead.

## Configuration

Two environment variables configure the upstream connection:

- `UNRAID_API_URL` — the Unraid GraphQL endpoint URL (checked first)
- `UNRAID_API_KEY` — the API key, sent as the `x-api-key` header

Calls that need the upstream fail with an error naming the missing
variable. The `help` action and all catalogue validation work with
no environment set at all.

## CLI

```bash
# Print the full local catalogue (no upstream call)
nasport help

# Run one routed operation
nasport call system overview
nasport call docker list
nasport call docker logs --params '{"container_id":"abc"}'

# Destructive operations need the explicit flag
nasport call vm force_stop --params '{"vm_id":"win11"}' --confirm

nasport --version
```

Exit codes: `0` on success, `1` on a tool error (unknown action,
destructive gate, missing env, upstream or GraphQL error), `2` for
usage errors.

## MCP server

```bash
npx -y @reneturcios/nasport mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "nasport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/nasport", "mcp"],
      "env": {
        "UNRAID_API_URL": "http://your-unraid.local/graphql",
        "UNRAID_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Tool

| Tool | Input | What it does |
| --- | --- | --- |
| `unraid` | `action` (string, required), `subaction` (string, required), `params` (object, optional), `confirm` (boolean, optional) | Routes to the named operation. Unknown pairs are errors listing valid options. Destructive subactions refuse without `confirm: true`. `action=help` returns the catalogue locally. |

Action groups: `system` (25 subactions), `health` (check,
test_connection, diagnose, setup), `array` (14), `disk` (6),
`docker` (27), `vm` (9), `notification` (13), `key` (13),
`plugin` (8), `rclone` (4), `setting` (6), `connect` (8),
`customization` (7), plus `subscriptions` and `help`.

Destructive subactions include `array/stop_array`,
`docker/remove_container`, `vm/force_stop`, `vm/reset`,
`key/delete`, `plugin/remove`, `plugin/install`,
`rclone/delete_remote`, `notification/delete`, and the connect
sign-in / remote-access operations. The full list, with destructive
entries marked, is what `nasport help` prints.

### GraphQL shaping and known gaps

The upstream GraphQL field schema is not published in the source
documentation this rebuild is based on, so the request shaping is a
documented local reconstruction: the body is
`{ "query": "query NasportOp { <action>_<subaction> }", "variables": <params> }`
and the operation name is the action and subaction in PascalCase.
A GraphQL `errors` array in the response is surfaced as a tool error
with its first message; `data` is returned as JSON text. Field-level
drift against a live server is the first live-smoke check.

- WebSocket subscriptions are not implemented: the `subscriptions`
  action returns an explicit not-implemented error.
- The original's OAuth / HTTP-transport authentication is not
  reproduced; this rebuild is stdio-only with the env-key model above.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
