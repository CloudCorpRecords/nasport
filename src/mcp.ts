/**
 * nasport MCP server. Tool: unraid.
 *
 * Low-level Server API with explicit schema literals exactly as the
 * fixture, NOT McpServer+zod conversion, so tools/list matches the
 * spec byte-for-byte in schema terms. Zod still validates call args.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { callUnraid, VERSION } from "./nasport.js";

const UnraidArgs = z.object({
  action: z.string().describe("Action group: system, health, array, disk, docker, vm, notification, key, plugin, rclone, setting, connect, customization, subscriptions, or help."),
  subaction: z.string().describe("Operation within the action group, e.g. overview, list, start, stop."),
  params: z.object({}).passthrough().optional().describe("Parameters for the subaction (named in the per-group documentation), e.g. container_id, vm_id, disk_id."),
  confirm: z.boolean().optional().describe("Must be true to run a destructive subaction."),
});

const TOOLS = [
  {
    name: "unraid",
    description: "Unified action/subaction router for Unraid server operations: system inspection, management operations, live telemetry, and destructive actions gated by explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action group: system, health, array, disk, docker, vm, notification, key, plugin, rclone, setting, connect, customization, subscriptions, or help." },
        subaction: { type: "string", description: "Operation within the action group, e.g. overview, list, start, stop." },
        params: { type: "object", description: "Parameters for the subaction (named in the per-group documentation), e.g. container_id, vm_id, disk_id." },
        confirm: { type: "boolean", description: "Must be true to run a destructive subaction." },
      },
      required: ["action", "subaction"],
    },
  },
];

const server = new Server(
  { name: "nasport", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== "unraid") throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const parsed = UnraidArgs.parse(args ?? {});
    const result = await callUnraid({
      action: parsed.action,
      subaction: parsed.subaction,
      params: parsed.params as Record<string, unknown> | undefined,
      confirm: parsed.confirm,
    });
    return result.isError
      ? { content: result.content, isError: true }
      : { content: result.content };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
