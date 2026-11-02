# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `nasport call <action> <subaction> [--params <json>] [--confirm]`
  runs one routed operation; `nasport help` prints the local catalogue.
  Both share the MCP tool's validation and destructive gate.
- MCP server (`nasport mcp`, stdio) with one tool: `unraid`, a unified
  action/subaction router covering system, health, array, disk, docker,
  vm, notification, key, plugin, rclone, setting, connect,
  customization, subscriptions, and help.
- Local catalogue validates action and subaction before any upstream
  call; destructive subactions require `confirm=true`.
- Upstream calls POST a GraphQL body to `UNRAID_API_URL` with header
  `x-api-key: UNRAID_API_KEY`. GraphQL shaping is a documented
  reconstruction (see README).
- WebSocket subscriptions are not implemented; the subscriptions action
  returns an explicit not-implemented error.
