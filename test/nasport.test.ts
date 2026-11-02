import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CATALOGUE, buildGraphQLBody, callUnraid, catalogueText, isDestructive, operationName } from "../src/nasport.js";
import type { FetchFn } from "../src/types.js";

function fakeFetch(handler: (url: string, init?: unknown) => unknown, calls: Array<{ url: string; init: unknown }>): FetchFn {
  return (async (url: string, init?: unknown) => {
    calls.push({ url, init });
    const payload = handler(url, init);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
      json: async () => payload,
    };
  }) as unknown as FetchFn;
}
const ENV = { UNRAID_API_URL: "http://unraid.local/graphql", UNRAID_API_KEY: "test-key-123" };

describe("catalogue", () => {
  it("has expected group sizes", () => {
    assert.equal(CATALOGUE.system.subactions.length, 25);
    assert.equal(CATALOGUE.health.subactions.length, 4);
    assert.deepEqual(CATALOGUE.health.subactions, ["check", "test_connection", "diagnose", "setup"]);
    assert.equal(CATALOGUE.array.subactions.length, 14);
    assert.equal(CATALOGUE.docker.subactions.length, 27);
    assert.equal(CATALOGUE.vm.subactions.length, 9);
  });
  it("marks documented destructive subactions", () => {
    for (const [a, s] of [["array","stop_array"],["array","remove_disk"],["docker","remove_container"],["vm","force_stop"],["vm","reset"],["key","delete"],["plugin","remove"],["plugin","install"],["rclone","delete_remote"],["setting","configure_ups"],["connect","sign_in"],["notification","delete"],["disk","flash_backup"]] as const) {
      assert.equal(isDestructive(a, s), true, `${a}/${s}`);
    }
    assert.equal(isDestructive("system", "overview"), false);
    assert.equal(isDestructive("docker", "list"), false);
  });
});

describe("validation", () => {
  it("rejects unknown action listing valid options", async () => {
    const r = await callUnraid({ action: "nope", subaction: "list" }, { env: ENV });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /Unknown action/);
    assert.match(r.content[0].text, /system/);
  });
  it("rejects unknown subaction listing valid options", async () => {
    const r = await callUnraid({ action: "docker", subaction: "nope" }, { env: ENV });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /Unknown subaction/);
    assert.match(r.content[0].text, /remove_container/);
  });
});

describe("destructive gate", () => {
  it("refuses destructive without confirm and does not fetch", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const fetchFn = fakeFetch(() => ({ data: {} }), calls);
    const r = await callUnraid({ action: "docker", subaction: "remove_container" }, { env: ENV, fetchFn });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /remove_container/);
    assert.match(r.content[0].text, /confirm=true/);
    assert.equal(calls.length, 0);
  });
  it("refuses destructive with confirm=false", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const fetchFn = fakeFetch(() => ({ data: {} }), calls);
    const r = await callUnraid({ action: "array", subaction: "stop_array", confirm: false }, { env: ENV, fetchFn });
    assert.equal(r.isError, true);
    assert.equal(calls.length, 0);
  });
  it("allows destructive with confirm=true and fetches", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const fetchFn = fakeFetch(() => ({ data: { ok: true } }), calls);
    const r = await callUnraid({ action: "vm", subaction: "force_stop", confirm: true, params: { vm_id: "vm1" } }, { env: ENV, fetchFn });
    assert.notEqual(r.isError, true);
    assert.equal(calls.length, 1);
  });
});

describe("help", () => {
  it("returns catalogue without env and without fetch", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const fetchFn = fakeFetch(() => ({ data: {} }), calls);
    const r = await callUnraid({ action: "help", subaction: "help" }, { env: {}, fetchFn });
    assert.notEqual(r.isError, true);
    assert.match(r.content[0].text, /docker/);
    assert.match(r.content[0].text, /system/);
    assert.equal(calls.length, 0);
  });
  it("subaction=help also returns catalogue", async () => {
    const r = await callUnraid({ action: "system", subaction: "help" }, { env: {} });
    assert.notEqual(r.isError, true);
    assert.ok(catalogueText().length > 100);
    assert.match(r.content[0].text, /catalogue/);
  });
});

describe("missing env order", () => {
  it("names UNRAID_API_URL first when both missing", async () => {
    const r = await callUnraid({ action: "system", subaction: "overview" }, { env: {} });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /UNRAID_API_URL/);
  });
  it("names UNRAID_API_KEY when only key missing", async () => {
    const r = await callUnraid({ action: "system", subaction: "overview" }, { env: { UNRAID_API_URL: "http://x/graphql" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /UNRAID_API_KEY/);
  });
});

describe("upstream shaping", () => {
  it("sends x-api-key header and GraphQL body", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const fetchFn = fakeFetch(() => ({ data: { version: "7.0" } }), calls);
    const r = await callUnraid({ action: "system", subaction: "overview", params: { verbose: true } }, { env: ENV, fetchFn });
    assert.notEqual(r.isError, true);
    assert.match(r.content[0].text, /7\.0/);
    assert.equal(calls[0].url, "http://unraid.local/graphql");
    const init = calls[0].init as { headers: Record<string, string>; body: string; method: string };
    assert.equal(init.method, "POST");
    assert.equal(init.headers["x-api-key"], "test-key-123");
    const body = JSON.parse(init.body) as { query: string; variables: unknown };
    assert.equal(body.query, "query NasportOp { system_overview }");
    assert.deepEqual(body.variables, { verbose: true });
  });
  it("buildGraphQLBody and operationName follow local contract", () => {
    assert.equal(operationName("docker", "remove_container"), "DockerRemoveContainer");
    assert.deepEqual(buildGraphQLBody({ action: "vm", subaction: "list" }), { query: "query NasportOp { vm_list }", variables: {} });
  });
  it("surfaces GraphQL errors array first message", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const fetchFn = fakeFetch(() => ({ errors: [{ message: "field exploded" }, { message: "second" }] }), calls);
    const r = await callUnraid({ action: "system", subaction: "overview" }, { env: ENV, fetchFn });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /field exploded/);
  });
  it("subscriptions returns not-implemented error without fetch", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const fetchFn = fakeFetch(() => ({ data: {} }), calls);
    const r = await callUnraid({ action: "subscriptions", subaction: "status" }, { env: ENV, fetchFn });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /not implemented/i);
    assert.equal(calls.length, 0);
  });
});
