/**
 * nasport core: unified Unraid action/subaction router.
 *
 * Local catalogue derived from the documented action groups in
 * unraid-py/README.md (dinglebear-ai/unraid). Subaction-level fidelity
 * is via this catalogue, not separate MCP tools.
 *
 * Behaviour:
 * - Unknown action/subaction => error listing valid options (local).
 * - Destructive subactions require confirm=true, checked before any
 *   upstream call.
 * - help returns the catalogue locally, no upstream, no env needed.
 * - subscriptions returns an honest not-implemented error (WebSocket
 *   subscriptions are not reproduced in this stdio rebuild).
 * - All other calls POST a GraphQL body to UNRAID_API_URL with header
 *   x-api-key: UNRAID_API_KEY. Missing env is reported in order:
 *   UNRAID_API_URL first, then UNRAID_API_KEY.
 *
 * GraphQL shaping is a documented local reconstruction: the exact
 * upstream GraphQL field schema is not in the README, so the query is
 * shaped as { query: "query NasportOp { <action>_<subaction> }",
 * variables: params } and the operation name is action+Subaction in
 * PascalCase. Field-level drift is the first live-smoke check.
 */
import type { FetchFn, NasportDeps, ToolResult, UnraidArgs } from "./types.js";

export const VERSION = "0.1.0";

interface Group {
  subactions: string[];
  destructive: Set<string>;
}

export const CATALOGUE: Record<string, Group> = {
  system: {
    subactions: ["overview","info","version","uptime","cpu","memory","network","processes","logs","services","status","hostname","timezone","locale","power","reboot","shutdown","restart_service","stop_service","start_service","users","shares","config","diagnostics","update_check"],
    destructive: new Set<string>(),
  },
  health: {
    subactions: ["check","test_connection","diagnose","setup"],
    destructive: new Set<string>(),
  },
  array: {
    subactions: ["overview","status","list","start","stop","start_array","stop_array","add_disk","remove_disk","clear_disk_stats","parity_check","parity_status","cancel_parity","config"],
    destructive: new Set(["stop_array","remove_disk","clear_disk_stats"]),
  },
  disk: {
    subactions: ["list","info","status","smart","flash_backup","spin_down"],
    destructive: new Set(["flash_backup"]),
  },
  docker: {
    subactions: ["list","overview","info","status","logs","start","stop","restart","pause","unpause","create","remove_container","update","inspect","stats","networks","volumes","images","pull","reset_template_mappings","delete_entries","templates","autostart","enable","disable","exec","compose_list"],
    destructive: new Set(["remove_container","reset_template_mappings","delete_entries"]),
  },
  vm: {
    subactions: ["list","overview","info","status","start","stop","force_stop","reset","logs"],
    destructive: new Set(["force_stop","reset"]),
  },
  notification: {
    subactions: ["list","create","update","delete","delete_archived","archive","unarchive","mark_read","mark_unread","overview","types","agents","test"],
    destructive: new Set(["delete","delete_archived"]),
  },
  key: {
    subactions: ["list","create","delete","info","overview","validate","rotate","enable","disable","permissions","usage","export","import"],
    destructive: new Set(["delete"]),
  },
  plugin: {
    subactions: ["list","info","install","remove","update","install_language","check_updates","overview"],
    destructive: new Set(["install","remove","install_language"]),
  },
  rclone: {
    subactions: ["list_remotes","create_remote","delete_remote","sync"],
    destructive: new Set(["delete_remote"]),
  },
  setting: {
    subactions: ["overview","configure_ups","update_ssh","update_system_time","get","update"],
    destructive: new Set(["configure_ups","update_ssh","update_system_time"]),
  },
  connect: {
    subactions: ["overview","status","update_api_settings","sign_in","sign_out","setup_remote_access","enable_dynamic_remote_access","disable_dynamic_remote_access"],
    destructive: new Set(["update_api_settings","sign_in","sign_out","setup_remote_access","enable_dynamic_remote_access"]),
  },
  customization: {
    subactions: ["overview","themes","list_themes","apply_theme","banners","language","appearance"],
    destructive: new Set<string>(),
  },
  subscriptions: {
    subactions: ["status","diagnose","list"],
    destructive: new Set<string>(),
  },
  help: {
    subactions: ["help","overview","list"],
    destructive: new Set<string>(),
  },
};

function text(textValue: string): ToolResult {
  return { content: [{ type: "text", text: textValue }] };
}
function err(textValue: string): ToolResult {
  return { content: [{ type: "text", text: textValue }], isError: true };
}

export function catalogueText(): string {
  const lines: string[] = ["nasport catalogue (action: subactions [* = destructive, requires confirm=true])"];
  for (const [action, group] of Object.entries(CATALOGUE)) {
    const subs = group.subactions.map((s) => (group.destructive.has(s) ? `${s}*` : s)).join(", ");
    lines.push(`${action}: ${subs}`);
  }
  lines.push("help: returns this catalogue locally without any upstream call.");
  lines.push("subscriptions: WebSocket subscriptions are not implemented in this rebuild; calls return a not-implemented error.");
  return lines.join("\n");
}

export function isDestructive(action: string, subaction: string): boolean {
  return CATALOGUE[action]?.destructive.has(subaction) ?? false;
}

function pascal(s: string): string {
  return s.split("_").map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p)).join("");
}

export function operationName(action: string, subaction: string): string {
  return `${pascal(action)}${pascal(subaction)}`;
}

export function buildGraphQLBody(args: UnraidArgs): { query: string; variables: Record<string, unknown> } {
  return {
    query: `query NasportOp { ${args.action}_${args.subaction} }`,
    variables: args.params ?? {},
  };
}

const defaultFetch: FetchFn = (async (url: string, init?: unknown) => {
  const res = await fetch(url, init as RequestInit);
  return {
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
    json: () => res.json() as Promise<unknown>,
  };
}) as FetchFn;

export async function callUnraid(args: UnraidArgs, deps: NasportDeps = {}): Promise<ToolResult> {
  const action = typeof args?.action === "string" ? args.action : "";
  const subaction = typeof args?.subaction === "string" ? args.subaction : "";

  // help: local, no env, no upstream
  if (action === "help" || subaction === "help") {
    return text(catalogueText());
  }

  const group = CATALOGUE[action];
  if (!group) {
    return err(`Unknown action: '${action}'. Valid actions: ${Object.keys(CATALOGUE).join(", ")}`);
  }
  if (!group.subactions.includes(subaction)) {
    return err(`Unknown subaction: '${subaction}' for action '${action}'. Valid subactions for ${action}: ${group.subactions.join(", ")}`);
  }

  // destructive gate before any upstream call
  if (group.destructive.has(subaction) && args.confirm !== true) {
    return err(`Destructive subaction '${action}/${subaction}' requires explicit confirmation: set confirm=true to run it. Refusing to run '${subaction}' without confirmation.`);
  }

  if (action === "subscriptions") {
    return err(`Subscriptions are not implemented in nasport: the original's WebSocket subscription transport is not reproduced in this stdio rebuild. Requested subaction '${subaction}' cannot be served; use the polling action groups instead.`);
  }

  const env = deps.env ?? process.env;
  const url = env.UNRAID_API_URL;
  if (!url) return err("Missing UNRAID_API_URL: set UNRAID_API_URL to the Unraid GraphQL endpoint URL.");
  const apiKey = env.UNRAID_API_KEY;
  if (!apiKey) return err("Missing UNRAID_API_KEY: set UNRAID_API_KEY to the Unraid API key.");

  const fetchFn = deps.fetchFn ?? defaultFetch;
  const body = buildGraphQLBody({ action, subaction, params: args.params, confirm: args.confirm });
  // operationName is part of the local contract documentation
  void operationName(action, subaction);

  let response: Awaited<ReturnType<FetchFn>>;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return err(`Unraid request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const raw = await response.text().catch(() => "");
    return err(`Unraid request failed with status ${response.status}: ${raw}`);
  }

  if (payload && typeof payload === "object") {
    const p = payload as { errors?: Array<{ message?: string }>; data?: unknown };
    if (Array.isArray(p.errors) && p.errors.length > 0) {
      return err(`Unraid GraphQL error: ${p.errors[0]?.message ?? JSON.stringify(p.errors[0])}`);
    }
    if ("data" in p) {
      return text(JSON.stringify(p.data, null, 2));
    }
  }
  if (!response.ok) {
    return err(`Unraid request failed with status ${response.status}: ${JSON.stringify(payload)}`);
  }
  return text(JSON.stringify(payload, null, 2));
}
