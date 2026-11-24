const scope = globalThis;
if (!scope.twizzerController) {
  scope.twizzerController = true;
  let picker;
  let restoring;
  const cancel = (event) => {
    if (event.key !== "Escape" || !picker) return;
    event.preventDefault();
    cleanup();
    void chrome.runtime.sendMessage({ type: "picker:cancelled" }).catch(() => {
    });
  };
  const cleanup = () => {
    picker?.destroy();
    picker = void 0;
    removeEventListener("keydown", cancel, true);
  };
  const nestedScrollAreas = () => Array.from(document.querySelectorAll("body *")).filter((element) => {
    if (element === document.scrollingElement) return false;
    if (element.clientWidth < 1 || element.clientHeight < 1) return false;
    const bounds = element.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.right <= 0 || bounds.top >= innerHeight || bounds.left >= innerWidth) return false;
    const style = getComputedStyle(element);
    return element.scrollHeight > element.clientHeight + 2 && /auto|scroll/.test(style.overflowY) || element.scrollWidth > element.clientWidth + 2 && /auto|scroll/.test(style.overflowX);
  });
  const rootWidth = () => Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
  const rootHeight = () => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
  const clip = (target) => {
    const bounds = target.getBoundingClientRect();
    return {
      left: bounds.left + target.clientLeft,
      top: bounds.top + target.clientTop,
      width: target.clientWidth,
      height: target.clientHeight
    };
  };
  const metrics = () => {
    const target = restoring?.target;
    return {
      width: innerWidth,
      height: innerHeight,
      x: target?.scrollLeft ?? scrollX,
      y: target?.scrollTop ?? scrollY,
      page_width: target?.clientWidth ?? rootWidth(),
      page_height: target?.scrollHeight ?? rootHeight(),
      clip: target && target.isConnected ? clip(target) : void 0,
      nested_scroll: nestedScrollAreas().some((area) => area !== target)
    };
  };
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === "picker:select") {
      cleanup();
      const marker = document.createElement("div");
      Object.assign(marker.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "2147483647",
        border: "2px solid #9333ea",
        boxSizing: "border-box",
        display: "none"
      });
      marker.setAttribute("aria-hidden", "true");
      document.documentElement.append(marker);
      const highlight = (event) => {
        if (!(event.target instanceof Element)) return;
        const box = event.target.getBoundingClientRect();
        Object.assign(marker.style, {
          display: "block",
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`
        });
      };
      const choose = (event) => {
        if (!(event.target instanceof Element)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const { x, y, height, width } = event.target.getBoundingClientRect();
        const selection = {
          tag: event.target.localName,
          rect: { x: x + scrollX, y: y + scrollY, height, width },
          page: location.origin + location.pathname
        };
        cleanup();
        void chrome.runtime.sendMessage({ type: "selection", selection }).catch(() => {
        });
      };
      picker = { destroy() {
        marker.remove();
        removeEventListener("pointermove", highlight, true);
        removeEventListener("click", choose, true);
      } };
      addEventListener("pointermove", highlight, true);
      addEventListener("click", choose, true);
      addEventListener("keydown", cancel, true);
      reply({ ok: true });
    } else if (message.type === "picker:off") {
      cleanup();
      reply({ ok: true });
    } else if (message.type === "capture:prepare") {
      cleanup();
      const areas = nestedScrollAreas();
      let target;
      if (rootHeight() <= innerHeight && rootWidth() <= innerWidth) {
        const dominant = areas.filter((area) => {
          const at = clip(area);
          return at.width >= innerWidth / 2 && at.height >= innerHeight / 2 && area.scrollWidth <= at.width && at.left >= 0 && at.top >= 0 && at.left + at.width <= innerWidth && at.top + at.height <= innerHeight;
        });
        if (dominant.length === 1) target = dominant[0];
      }
      const style = (target || document.documentElement).style;
      restoring = { x: target?.scrollLeft ?? scrollX, y: target?.scrollTop ?? scrollY, behavior: style.scrollBehavior, target };
      style.scrollBehavior = "auto";
      reply(metrics());
    } else if (message.type === "capture:scroll") {
      const position = { left: message.x, top: message.y, behavior: "instant" };
      if (restoring?.target) restoring.target.scrollTo(position);
      else scrollTo(position);
      requestAnimationFrame(() => requestAnimationFrame(() => reply(metrics())));
      return true;
    } else if (message.type === "capture:restore") {
      if (restoring) {
        const position = { left: restoring.x, top: restoring.y, behavior: "instant" };
        if (restoring.target) restoring.target.scrollTo(position);
        else scrollTo(position);
        (restoring.target || document.documentElement).style.scrollBehavior = restoring.behavior;
        restoring = void 0;
      }
      reply({ ok: true });
    }
  });
  addEventListener("pagehide", () => {
    cleanup();
    void chrome.runtime.sendMessage({ type: "page:clear" }).catch(() => {
    });
  }, { once: true });
}
