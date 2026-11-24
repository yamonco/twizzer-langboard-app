const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
function captureFailure(kind, reason) {
  return { kind, status: "failed", reason, captured_at: (/* @__PURE__ */ new Date()).toISOString(), width: 0, height: 0, sha256: "", bytes: 0 };
}
async function capturePage(tab, selection, stillCurrent) {
  const result = [];
  const tabId = tab.id;
  const check = async () => {
    const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tabId) throw new Error("tab_inactive");
    if (!await stillCurrent()) throw new Error("cancelled");
  };
  const image = async (blob, kind, width, height, reason = "none") => {
    if (blob.size > 6 * 1024 * 1024) return captureFailure(kind, "memory_limit");
    const bytes = await blob.arrayBuffer();
    let binary = "";
    for (let offset = 0; offset < bytes.byteLength; offset += 8192) binary += String.fromCharCode(...new Uint8Array(bytes, offset, Math.min(8192, bytes.byteLength - offset)));
    return {
      kind,
      status: reason === "none" ? "complete" : "partial",
      reason,
      captured_at: (/* @__PURE__ */ new Date()).toISOString(),
      width,
      height,
      bytes: bytes.byteLength,
      sha256: await digest(bytes),
      data_url: `data:image/jpeg;base64,${btoa(binary)}`
    };
  };
  const shot = async () => {
    await check();
    const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 85 });
    await check();
    return await (await fetch(url)).blob();
  };
  const pageMessage = async (message) => {
    let timer;
    try {
      return await Promise.race([
        chrome.tabs.sendMessage(tabId, message),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("capture_failed")), 5e3);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  let prepared = false;
  let metrics;
  try {
    await check();
    prepared = true;
    metrics = await pageMessage({ type: "capture:prepare" });
    if (!metrics || !metrics.width || !metrics.height) throw new Error("capture_failed");
    const viewportBlob = await shot();
    const viewportBitmap = await createImageBitmap(viewportBlob);
    result.push(await image(viewportBlob, "viewport", viewportBitmap.width, viewportBitmap.height));
    const bitmapWidth = viewportBitmap.width;
    const bitmapHeight = viewportBitmap.height;
    const scaleX = bitmapWidth / metrics.width;
    const scaleY = bitmapHeight / metrics.height;
    const clip = metrics.clip;
    const tile = clip ?? { left: 0, top: 0, width: metrics.width, height: metrics.height };
    const shellWidth = metrics.width - tile.width;
    const shellHeight = metrics.height - tile.height;
    const width = Math.min(metrics.page_width, 16384 / scaleX - shellWidth);
    const pixelWidth = Math.ceil((width + shellWidth) * scaleX);
    const maxPixelHeight = Math.min(16384, Math.floor(24e6 / pixelWidth));
    const height = Math.min(metrics.page_height, maxPixelHeight / scaleY - shellHeight);
    if (width <= 0 || height <= 0) {
      viewportBitmap.close();
      throw new Error("too_large");
    }
    let reason = width < metrics.page_width || height < metrics.page_height ? "too_large" : "none";
    const canvas = new OffscreenCanvas(pixelWidth, Math.ceil((height + shellHeight) * scaleY));
    const ctx = canvas.getContext("2d");
    try {
      if (clip) {
        const left = clip.left * scaleX, top = clip.top * scaleY;
        const right = (clip.left + clip.width) * scaleX, bottom = (clip.top + clip.height) * scaleY;
        const end = (clip.top + height) * scaleY;
        const band = (x, y, w, h, dx, dy, dh = h) => {
          if (w > 0 && h > 0 && dh > 0) ctx.drawImage(viewportBitmap, x, y, w, h, dx, dy, w, dh);
        };
        band(0, 0, bitmapWidth, top, 0, 0);
        band(0, bottom, bitmapWidth, bitmapHeight - bottom, 0, end);
        for (const [x, w] of [[0, left], [right, bitmapWidth - right]]) {
          band(x, top, w, Math.min(bottom, end) - top, x, top);
          band(x, bottom - 1, w, 1, x, bottom, end - bottom);
        }
      }
    } finally {
      viewportBitmap.close();
    }
    const start = Date.now();
    let tiles = 0;
    for (let y = 0; y < height; y += tile.height) {
      for (let x = 0; x < width; x += tile.width) {
        if (++tiles > 40 || Date.now() - start > 3e4) throw new Error("too_large");
        await check();
        const at = await pageMessage({ type: "capture:scroll", x, y });
        await delay(560);
        const bitmap = await createImageBitmap(await shot());
        try {
          if (at.page_height !== metrics.page_height || at.page_width !== metrics.page_width || at.width !== metrics.width || at.height !== metrics.height || JSON.stringify(at.clip) !== JSON.stringify(clip) || bitmap.width !== bitmapWidth || bitmap.height !== bitmapHeight) throw new Error("page_changed");
          const coveredWidth = Math.min(tile.width, width - x);
          const coveredHeight = Math.min(tile.height, height - y);
          if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || at.x > x || at.y > y || at.x + tile.width < x + coveredWidth || at.y + tile.height < y + coveredHeight) throw new Error("unsupported_scroll");
          const sx = (tile.left + x - at.x) * scaleX;
          const sy = (tile.top + y - at.y) * scaleY;
          ctx.drawImage(bitmap, sx, sy, coveredWidth * scaleX, coveredHeight * scaleY, (tile.left + x) * scaleX, (tile.top + y) * scaleY, coveredWidth * scaleX, coveredHeight * scaleY);
          if (at.nested_scroll) reason = "unsupported_scroll";
        } finally {
          bitmap.close();
        }
      }
    }
    if (metrics.nested_scroll || !clip && metrics.page_height <= metrics.height && selection.rect.y + selection.rect.height > metrics.page_height) reason = "unsupported_scroll";
    result.push(await image(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 }), "full_page", canvas.width, canvas.height, reason));
  } catch (error) {
    const candidate = error instanceof Error ? error.message : "capture_failed";
    const reason = ["too_large", "page_changed", "tab_inactive", "cancelled", "unsupported_scroll", "memory_limit"].includes(candidate) ? candidate : "capture_failed";
    if (!result.some((item) => item.kind === "viewport")) result.push(captureFailure("viewport", reason));
    if (!result.some((item) => item.kind === "full_page")) result.push(captureFailure("full_page", reason));
  } finally {
    if (prepared) await pageMessage({ type: "capture:restore" }).catch(() => {
    });
  }
  return result;
}
export {
  captureFailure,
  capturePage,
  digest
};
