/**
 * nasport types.
 */

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export interface UnraidArgs {
  action: string;
  subaction: string;
  params?: Record<string, unknown>;
  confirm?: boolean;
}

export interface NasportDeps {
  fetchFn?: FetchFn;
  env?: Record<string, string | undefined>;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
