import assert from "node:assert/strict";
import { test } from "node:test";
import { apiOrigin, createIssue, findAttachment } from "./langboard.js";

test("the user selects an exact HTTPS API origin", () => {
  assert.equal(apiOrigin("https://board.example"), "https://board.example");
  for (const address of ["http://board.example", "https://user@board.example", "https://board.example/other"]) {
    assert.throws(() => apiOrigin(address));
  }
});

test("app card retries retain the same external identity and API destination", async (context) => {
  const bodies = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://board.example/apps/v1/boards/Board000001/cards");
    assert.equal(options.redirect, "error");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer fixture");
    bodies.push(JSON.parse(options.body));
    return Response.json({ card_uid: "Card0000001", created: bodies.length === 1 });
  });
  const issue = { external_id: "fixture-issue", resource_uid: "Site0000001", title: "Sample", card_type: "element_feedback" };
  assert.equal(await createIssue("https://board.example", "fixture", "Board000001", issue), "Card0000001");
  assert.equal(await createIssue("https://board.example", "fixture", "Board000001", issue), "Card0000001");
  assert.deepEqual(bodies, [issue, issue]);
});

test("attachment reconciliation follows the native continuation and checks identity", async () => {
  const attachment = { uid: "Media000001", filename: "full-page.jpg" };
  const client = { callTool: async ({ name, arguments: args }) => {
    assert.equal(name, "get_card_bundle");
    return { structuredContent: args.section_cursor
      ? { continuation: { page: { items: [attachment], next_cursor: null } } }
      : { card: { attachments: { items: [], next_cursor: "fixture-cursor" } } } };
  } };
  assert.deepEqual(await findAttachment(client, "Board000001", "Card0000001", attachment.filename), attachment);
  assert.equal(await findAttachment(client, "Board000001", "Card0000001", "missing.jpg"), undefined);
});
