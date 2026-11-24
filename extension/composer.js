import { capturePage } from "./capture.js";
import { apiOrigin, call, connectLangboard, createIssue, findAttachment } from "./langboard.js";

const byId = (id) => document.getElementById(id);
const connection = byId("connection");
const feedback = byId("feedback");
const signIn = connection.querySelector("button");
const board = byId("board");
const submit = byId("submit");
const status = byId("status");
const pick = byId("pick");
const previews = byId("previews");
const fields = ["board", "resource", "title", "details"].map(byId);
const uid = /^[A-Za-z0-9]{11}$/;
let client;
let origin;
let pendingTab;
let selection;
let images = [];
let draft;
let submitting = false;
const uncertainUploads = new Set();

function report(message) { status.textContent = message; }
function errorMessage(error) {
  return error instanceof Error ? error.message : "The operation failed.";
}
function updateSubmit() {
  submit.disabled = submitting || !client || images.length !== 2 || images.some((item) => item.status !== "complete");
}
function resetCapture() {
  selection = null;
  images = [];
  byId("selection").textContent = "";
  previews.replaceChildren();
  updateSubmit();
}
function renderCaptures() {
  const titles = { viewport: "Current screen", full_page: "Full page" };
  previews.replaceChildren(...images.map((capture) => {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    caption.textContent = titles[capture.kind];
    figure.append(caption);
    if (capture.data_url) {
      const image = document.createElement("img");
      image.src = capture.data_url;
      image.alt = titles[capture.kind];
      figure.append(image);
    }
    return figure;
  }));
}
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

connection.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  signIn.disabled = true;
  submit.disabled = true;
  try {
    const target = apiOrigin(byId("server").value);
    if (draft && target !== origin) throw new Error("Sign in to the same Langboard API to finish this card.");
    if (!(await chrome.permissions.request({ origins: [target + "/*"] }))) throw new Error("Langboard host permission was declined.");
    report("Signing in to Langboard…");
    const nextClient = await connectLangboard(target);
    try {
      const result = await call(nextClient, "get_projects", {});
      if (!Array.isArray(result?.projects)) throw new Error("Langboard did not return your boards.");
      const projects = result.projects.filter((item) => uid.test(item?.uid ?? "") && typeof item.title === "string");
      if (draft && !projects.some((item) => item.uid === draft.board)) throw new Error("This account cannot access the draft’s board.");
      await client?.close().catch(() => {});
      client = nextClient;
      if (origin !== target) byId("credential").value = "";
      origin = target;
      board.replaceChildren(new Option("Choose a board", ""), ...projects.map((item) => new Option(item.title, item.uid)));
      board.value = draft?.board ?? "";
      feedback.hidden = false;
      report(projects.length ? "Signed in. Select a board to send feedback." : "This account has no available boards.");
    } catch (error) {
      await nextClient.close().catch(() => {});
      throw error;
    }
  } catch (error) {
    report(errorMessage(error));
  } finally {
    signIn.disabled = false;
    updateSubmit();
  }
});

pick.addEventListener("click", async () => {
  pick.disabled = true;
  resetCapture();
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https?:/.test(tab.url ?? "")) throw new Error("Open a web page to select an element.");
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    pendingTab = tab;
    await chrome.tabs.sendMessage(tab.id, { type: "picker:select" });
    report("Click the element on the page. Press Escape to cancel.");
  } catch (error) {
    pendingTab = null;
    pick.disabled = false;
    report(errorMessage(error));
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.frameId !== 0 || sender.tab?.id !== pendingTab?.id || !pendingTab) return;
  if (message.type === "picker:cancelled" || message.type === "page:clear") {
    pendingTab = null;
    pick.disabled = false;
    report("Selection ended.");
    return;
  }
  if (message.type !== "selection") return;
  const tab = pendingTab;
  pendingTab = null;
  selection = message.selection;
  byId("selection").textContent = "Selected element: " + selection.tag;
  report("Capturing the current screen and full page…");
  void capturePage(tab, selection, async () => (await chrome.tabs.get(tab.id)).url === tab.url)
    .then((captures) => {
      images = captures;
      renderCaptures();
      report(images.every((item) => item.status === "complete")
        ? "Review both screenshots before sending."
        : "Both captures are required. Select the element again to retry.");
    })
    .catch((error) => report(errorMessage(error)))
    .finally(() => { pick.disabled = false; updateSubmit(); });
});

feedback.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting || submit.disabled || !uid.test(board.value) || !byId("title").value.trim()) return;
  submitting = true;
  submit.disabled = true;
  signIn.disabled = true;
  pick.disabled = true;
  fields.forEach((field) => { field.disabled = true; });
  draft ??= {
    board: board.value,
    issue: {
      resource_uid: byId("resource").value,
      external_id: crypto.randomUUID(),
      title: byId("title").value.trim(),
      description: JSON.stringify({ feedback: byId("details").value.trim(), element: selection }, null, 2),
      card_type: "element_feedback",
    },
    card: null,
  };
  try {
    if (!draft.card) {
      report("Creating the app card…");
      draft.card = await createIssue(origin, byId("credential").value, draft.board, draft.issue);
    }
    for (const image of images) {
      const filename = `twizzer-${draft.issue.external_id}-${image.kind}.jpg`;
      const exists = () => findAttachment(client, draft.board, draft.card, filename);
      if (await exists()) continue;
      if (uncertainUploads.has(filename)) throw new Error(`Upload still unconfirmed for ${image.kind}. Check the card attachments.`);
      report(`Uploading ${image.kind === "viewport" ? "the current screen" : "the full page"}…`);
      uncertainUploads.add(filename);
      try {
        await call(client, "update_card", { project_uid: draft.board, card_uid: draft.card,
          change: { action: "attachment_upload", filename, file_data_base64: image.data_url.split(",", 2)[1] } });
      } catch (error) {
        if (!(await exists())) throw error;
      }
      if (!(await exists())) throw new Error("Attachment upload was not visible in the card.");
    }
    const created = draft.card;
    draft = null;
    uncertainUploads.clear();
    fields.forEach((field) => { field.disabled = false; });
    pick.disabled = false;
    resetCapture();
    byId("title").value = "";
    byId("details").value = "";
    report(`App card ${created} created. Both attachments are on the card.`);
  } catch (error) {
    report(draft.card ? `App card ${draft.card}. ${errorMessage(error)}` : errorMessage(error));
  } finally {
    submitting = false;
    signIn.disabled = false;
    updateSubmit();
  }
});

window.addEventListener("pagehide", () => {
  if (pendingTab) void chrome.tabs.sendMessage(pendingTab.id, { type: "picker:off" }).catch(() => {});
  void client?.close().catch(() => {});
}, { once: true });
