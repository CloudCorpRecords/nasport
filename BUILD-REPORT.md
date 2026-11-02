# nasport — Build Report

Tranche #101+ Batch 1, MCP Rebuild 1000 program. Clean-room rebuild of
dinglebear-ai/unraid — flagship Python server `unraid-mcp` (candidate
ai.dinglebear/unraid, rank 22, 146 stars). The repo's second registry
entry is the Rust sibling (runraid) with the same surface; this one
rebuild covers both. Spec source only: `unraid-py/README.md` in the
repo, retrieved 2026-10-26 (fixture `_source` records this). Local
build only — nothing pushed or published.

Identity: repo `nasport`, npm `@reneturcios/nasport`,
MCP name `io.github.CloudCorpRecords/nasport`, version `0.1.0`.
Build dir: `~/workspace/mcp-rebuild-100/builds/nasport/`

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `nasport: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Unraid server operations router:
  system, array, Docker, VMs and more." = **69 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/nasport:0.1.0` carries **no** `version`
  field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/nasport"`
- `tsconfig.json` (copied unchanged from clockport), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`call <action> <subaction>
  [--params <json>] [--confirm]`, `help`, `mcp`, `--version`;
  unknown command exits 2), `src/mcp.ts`, `src/types.ts`,
  `src/nasport.ts` (core logic, `VERSION = "0.1.0"`)
- `test/nasport.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from clockport; image name and smoke-test server name changed to nasport)

Fixture created first:
`~/workspace/mcp-rebuild-100/harness/fixtures/unraid-tools-original.json`
— 1 tool (`unraid`), with the exact `_source` text specified for this
build.

## Implementation notes

- **Low-level SDK `Server` API with explicit schema literals** exactly
  as the fixture — NOT McpServer+zod schema conversion (per standing
  rule; the high-level helper injects `$schema`/`additionalProperties`
  keys absent from the spec). Zod still validates call arguments.
- **Local catalogue** in `src/nasport.ts`: action → {subactions,
  destructive set}. Group sizes: system 25, health 4 (check,
  test_connection, diagnose, setup), array 14, disk 6, docker 27,
  vm 9, notification 13, key 13, plugin 8, rclone 4, setting 6,
  connect 8, customization 7, plus subscriptions and help.
  Unknown action or subaction returns an `isError` result listing
  the valid options — real local validation, before any upstream call.
- **Destructive gate:** all 24 documented destructive subactions
  (array/stop_array, array/remove_disk, array/clear_disk_stats,
  disk/flash_backup, docker/remove_container,
  docker/reset_template_mappings, docker/delete_entries,
  vm/force_stop, vm/reset, notification/delete,
  notification/delete_archived, key/delete, plugin/remove,
  plugin/install, plugin/install_language, rclone/delete_remote,
  setting/configure_ups, setting/update_ssh,
  setting/update_system_time, connect/update_api_settings,
  connect/sign_in, connect/sign_out, connect/setup_remote_access,
  connect/enable_dynamic_remote_access) refuse with an `isError`
  naming the subaction unless `confirm=true` — checked **before**
  any upstream call (tests assert zero fetch calls).
- **help:** `action=help` (any subaction) or `subaction=help` returns
  the catalogue as structured text locally — no upstream call, works
  with no env set.
- **Upstream:** all other calls POST via an injectable `FetchFn` to
  `UNRAID_API_URL` with header `x-api-key: UNRAID_API_KEY`. Missing
  `UNRAID_API_URL` is reported first, then missing `UNRAID_API_KEY`,
  each naming the variable. GraphQL shaping (documented local
  contract): body `{query: "query NasportOp { <action>_<subaction> }",
  variables: params}`; operation name is action+Subaction in
  PascalCase. A GraphQL `errors` array surfaces as `isError` with the
  first message; `data` is returned as JSON text.
- One fix during the build: the MCP handler initially returned the
  core `ToolResult` type directly, which the SDK's handler type
  rejects; it now maps to a plain `{content, isError?}` result
  (clockport pattern). Re-verified after the fix: tsc, tests, parity,
  and live checks all re-run green.

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo tsc_exit=$?
tsc_exit=0
```
`dist/` produced (cli.js, nasport.js, mcp.js, index.js, types.js,
plus .d.ts/.js.map).

### 2. Tests — 15 tests, fake-fetch only, no network, no live Unraid claimed
```
ℹ tests 15
ℹ pass 15
ℹ fail 0
```
Covers: catalogue group sizes and destructive markings, unknown
action/subaction validation listing valid options, destructive gate
refusals (missing and `confirm=false`) **with a no-fetch assertion**,
destructive call allowed with `confirm=true`, help without env and
without fetch (both `action=help` and `subaction=help`), missing-env
ordering (URL before KEY), `x-api-key` header and GraphQL body
shaping, `operationName`/`buildGraphQLBody` contract, GraphQL error
surfacing, and the subscriptions not-implemented path (no fetch).

### 3. Parity
```
$ python3 parity.py --original harness/fixtures/unraid-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/nasport/dist/cli.js mcp" \
    --out builds/nasport/parity-out
verdict=PASS parity_pct=100.0 original_tools=1 rebuild_tools=1 missing=[] extra=[] schema_diffs=[]
parity_exit=0
```
(Fixture is tools-file mode, so `fixture_results:
SKIPPED-TOOLS-FILE-MODE` — expected harness semantics.)

### 4. Live checks (stdio, foreground, no env set)
- initialize → `serverInfo: {"name":"nasport","version":"0.1.0"}`
- tools/call `action=help, subaction=help` → local success, excerpt:
  `nasport catalogue (action: subactions [* = destructive, requires confirm=true])\nsystem: overview, info, version, uptime, cpu, memory, network, processes, logs, services, status, hostname, timezone, locale, power, reboot, shutdown, restart_service, stop_service, start_service, users, shares, config, diagnostics, update_check\nhealth: check, test_connection, diagnose, setup\narray: overview, status, list, start, stop, start_array, stop_array*, add_disk, ...` (full response 1990 chars)
- tools/call `action=system, subaction=overview` with no env →
  `isError: true`, exact text: **"Missing UNRAID_API_URL: set
  UNRAID_API_URL to the Unraid GraphQL endpoint URL."**
- CLI: `--version` → `0.1.0`; unknown command → Usage, exit 2.

## Lockfile status

**Clean lockfile (Route 3, verified).** `package.json` alone was
copied to a fresh `/tmp/nasport-lock/` and
`npm install --package-lock-only --ignore-scripts --offline`
completed in ~14s (rc=0). The produced `package-lock.json` parses,
its `name` is `@reneturcios/nasport`, version `0.1.0`, 128 package
entries; it was copied into the build dir. `node_modules` in this
build dir is a `cp -a` copy of clockport's (local build only,
gitignored).

## Gaps

- **GraphQL field shaping is reconstructed.** The exact upstream
  GraphQL field schema is not in the README, so the query shaping
  above is a documented local contract, not a probed one.
  **Field-level drift against a real Unraid server is the first
  live-smoke check** before any parity claim beyond tool/schema.
- **WebSocket subscriptions not implemented.** The `subscriptions`
  action returns an honest not-implemented `isError` (naming the
  requested subaction) instead of routing to a diagnostics shaping;
  no fetch is attempted.
- **OAuth / HTTP-transport auth of the original not reproduced** —
  stdio transport with the env-key model (`UNRAID_API_URL` /
  `UNRAID_API_KEY`) only.
- Subaction name lists for groups other than health are
  catalogue reconstructions sized to the documented counts (25/14/6/
  27/9/13/13/8/4/6/8/7), anchored on the documented destructive
  subactions, which are all present and gated; per-subaction naming
  drift is possible against the live server.
- No live Unraid server was available or claimed; all upstream
  behaviour is verified against fake fetch only.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
