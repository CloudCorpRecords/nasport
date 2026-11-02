#!/usr/bin/env node
/**
 * nasport CLI.
 *
 *   nasport call <action> <subaction> [--params <json>] [--confirm]
 *   nasport help
 *   nasport mcp
 *   nasport --version
 *
 * Exit codes: 0 success, 1 tool error, 2 usage error.
 */
import { callUnraid, catalogueText, VERSION } from "./nasport.js";

function usage(): never {
  console.error(`Usage:
  nasport call <action> <subaction> [--params <json>] [--confirm]
  nasport help
  nasport mcp
  nasport --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(catalogueText());
    return;
  }
  if (cmd === "call") {
    const [action, subaction, ...flags] = rest;
    if (!action || !subaction) usage();
    let params: Record<string, unknown> | undefined;
    let confirm: boolean | undefined;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === "--confirm") confirm = true;
      else if (flags[i] === "--params") {
        const raw = flags[++i];
        if (!raw) usage();
        try { params = JSON.parse(raw) as Record<string, unknown>; }
        catch { console.error("error: --params must be valid JSON"); process.exit(2); }
      } else usage();
    }
    const result = await callUnraid({ action, subaction, params, confirm });
    const textOut = result.content.map((c) => c.text).join("\n");
    if (result.isError) { console.error(textOut); process.exit(1); }
    console.log(textOut);
    return;
  }
  usage();
}

void main();
