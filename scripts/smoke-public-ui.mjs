import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const base = new URL(process.argv[2] ?? "http://localhost:3000/");
if (!base.pathname.endsWith("/")) base.pathname += "/";
const profile = await mkdtemp(join(tmpdir(), "le-grande-smoke-"));
const chrome = spawn(process.env.CHROME_BIN ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "chromium"), [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const stopped = new Promise(resolve => { chrome.once("exit", resolve); chrome.once("error", resolve); });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Chrome did not start: ${stderr}`)), 15_000);
    chrome.once("error", error => { clearTimeout(timer); reject(error); });
    chrome.once("exit", code => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}): ${stderr}`)); });
    chrome.stderr.on("data", chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const discovery = new URL(endpoint);
  discovery.protocol = "http:";
  discovery.pathname = "/json/list";
  const targets = await (await fetch(discovery)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const { id, result, error } = JSON.parse(data);
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    if (error) request.reject(new Error(error.message));
    else request.resolve(result);
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(fn, ...args) {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression: `(${fn})(${args.map(arg => JSON.stringify(arg)).join(",")})`, returnByValue: true, awaitPromise: true,
    });
    assert(!exceptionDetails, exceptionDetails?.exception?.description ?? exceptionDetails?.text);
    return result.value;
  }
  async function waitFor(fn, ...args) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const value = await evaluate(fn, ...args);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`UI condition timed out: ${fn}`);
  }
  async function click(selector) {
    await evaluate(selector => document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "instant" }), selector);
    const point = await waitFor(selector => {
      const element = document.querySelector(selector);
      if (!element || element.disabled) return false;
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      return box.width && box.height && element.contains(document.elementFromPoint(x, y)) && { x, y };
    }, selector);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  }
  async function escape() {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  const viewport = width => send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  const dialog = '[role="dialog"]';
  await send("Page.bringToFront");
  await viewport(1366);
  if (process.argv[3] === "--startup-only") {
    const startup = "[data-ui-loading-screen]";
    await send("Page.enable");
    await send("Runtime.enable");
    // Hold a genuine readiness dependency to exercise slow-asset, skip and deadline behavior.
    const heldDecode = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__startupDecodes = [];
      window.__releaseStartup = () => window.__startupDecodes.splice(0).forEach(resolve => resolve());
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        return this.fetchPriority === "high"
          ? new Promise(resolve => window.__startupDecodes.push(resolve))
          : decode.call(this);
      };
    ` });
    for (const width of [1366, 390]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: width === 390 ? "reduce" : "no-preference" }] });
      await send("Page.navigate", { url: base.href });
      await waitFor(() => window.__startupDecodes?.length > 0);
      await waitFor(selector => {
        const image = document.querySelector(`${selector} img`);
        return image?.complete && image.naturalWidth > 0;
      }, startup);
      const presentation = await evaluate(selector => {
        const screen = document.querySelector(selector);
        const box = screen.getBoundingClientRect();
        const image = screen.querySelector("img");
        return {
          ready: screen.dataset.ready,
          visible: getComputedStyle(screen).visibility,
          coversViewport: box.x === 0 && box.y === 0 && box.width === innerWidth && box.height === innerHeight,
          logo: image?.src === document.querySelector("header img")?.src,
          reduced: [...screen.getAnimations({ subtree: true })].filter(animation => animation.effect?.target !== screen).length === 0,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      }, startup);
      assert.equal(presentation.ready, "false");
      assert.equal(presentation.visible, "visible");
      assert(presentation.coversViewport && presentation.logo && !presentation.overflow, `invalid startup surface at ${width}px`);
      if (width === 390) assert(presentation.reduced, "reduced motion still animates the orbit");
      if (process.env.SMOKE_SCREENSHOT_DIR) {
        await mkdir(process.env.SMOKE_SCREENSHOT_DIR, { recursive: true });
        const shot = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(join(process.env.SMOKE_SCREENSHOT_DIR, `startup-${width}.png`), Buffer.from(shot.data, "base64"));
      }
      if (width === 1366) await evaluate(() => window.__releaseStartup());
      else await click(`${startup} button`);
      await waitFor(selector => document.querySelector(selector)?.dataset.ready === "true" && getComputedStyle(document.querySelector(selector)).visibility === "hidden", startup);
      if (width === 390) await click("header summary");
      await click(`header nav[aria-label="${width === 390 ? "Điều hướng chính trên điện thoại" : "Điều hướng chính"}"] a[href="/tong-quan/"]`);
      await waitFor(() => !!document.querySelector("#letter"));
      assert.equal(await evaluate(selector => document.querySelector(selector)?.dataset.ready, startup), "true", "startup replayed on client navigation");
      await click('header a[aria-label="Le Grande Centre — Trang chủ"]');
      await waitFor(() => !!document.querySelector("#home-title"));
      assert.equal(await evaluate(selector => document.querySelector(selector)?.dataset.ready, startup), "true", "startup replayed on homepage return");
      console.log(`PASS startup ${width}px: real logo, full viewport, readiness/skip, no route replay, reduced motion.`);
    }
    await send("Emulation.setEmulatedMedia", { features: [] });
    await send("Page.navigate", { url: base.href });
    await waitFor(() => window.__startupDecodes?.length > 0);
    await escape();
    await waitFor(selector => document.querySelector(selector)?.dataset.ready === "true", startup);
    await send("Page.navigate", { url: base.href });
    await waitFor(() => window.__startupDecodes?.length > 0);
    await waitFor(selector => document.querySelector(selector)?.dataset.ready === "true", startup);
    console.log("PASS startup: Escape and bounded deadline release stalled assets.");
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: heldDecode.identifier });
    await send("Page.navigate", { url: base.href });
    await waitFor(selector => document.querySelector(selector)?.dataset.ready === "true" && getComputedStyle(document.querySelector(selector)).visibility === "hidden", startup);
    assert.equal(await evaluate(() => getComputedStyle(document.querySelector("#home-title")).opacity), "1");
    console.log("PASS startup: genuine image/font readiness releases the normal homepage.");
    await send("Emulation.setScriptExecutionDisabled", { value: true });
    await send("Page.navigate", { url: base.href });
    await waitFor(() => document.readyState === "complete" && !!document.querySelector("#home-title"));
    assert.equal(await evaluate(selector => getComputedStyle(document.querySelector(selector)).display, startup), "none", "no-JS visitor is blocked by the loader");
    assert(await evaluate(() => document.querySelector("#home-title").checkVisibility()), "no-JS homepage remains hidden inside the streamed shell");
    await send("Emulation.setScriptExecutionDisabled", { value: false });
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: [new URL("_next/static/chunks/*.js", base).href] });
    await send("Page.navigate", { url: base.href });
    await waitFor(selector => !!document.querySelector(selector), startup);
    await waitFor(selector => getComputedStyle(document.querySelector(selector)).visibility === "hidden", startup);
    assert(await evaluate(() => !!document.querySelector("#home-title")), "HTML content missing when scripts fail");
    await send("Network.setBlockedURLs", { urls: [] });
    console.log("PASS startup: no-JS bypass and CSS fail-open when hydration scripts fail.");
  } else {
  await send("Page.navigate", { url: new URL("tong-quan/", base).href });
  await waitFor(() => document.readyState === "complete" && !!document.querySelector("#letter"));
  await sleep(300);
  const backdropStates = await evaluate(() => new Promise(resolve => {
    const letter = document.querySelector("#letter");
    const top = letter.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.8;
    window.scrollTo({ top, behavior: "instant" });
    const samples = [];
    const started = performance.now();
    const sample = now => {
      const style = getComputedStyle(letter);
      samples.push({ backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor, opacity: style.opacity });
      if (now - started < 1400) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  }));
  const backgroundImage = backdropStates[0]?.backgroundImage ?? "";
  assert(backgroundImage.includes("linear-gradient") && backgroundImage.includes("rgba(250, 248, 240, 0.91)") && backgroundImage.includes("url("), "investor-letter background is missing its paper-tinted image layers");
  assert(await evaluate(() => document.querySelector("#letter > img") === null), "investor-letter backdrop must not be a reveal-animated child image");
  assert(backdropStates.every(state => state.backgroundImage === backgroundImage && state.backgroundColor === "rgb(250, 248, 240)" && state.opacity === "1"), "investor-letter background layer changed during reveal");
  if (process.argv[3] === "--investor-letter-only") {
    console.log("PASS investor-letter: tinted CSS background remains static through reveal.");
  } else {
    await send("Page.navigate", { url: new URL("mat-bang/", base).href });
    await waitFor(() => !!document.querySelector('button[id="leasing-plan-A.1"]'));
  await evaluate(() => document.fonts.ready.then(() => true));
  for (const width of [1366, 1201, 1200, 1100, 720, 390, 320]) {
    await viewport(width);
    const compact = width <= 1200;
    if (compact) await click("header summary");
    assert(await evaluate(() => document.documentElement.scrollWidth === innerWidth), `header overflow at ${width}px`);
    assert(await evaluate(() => Math.abs(document.querySelector("header").getBoundingClientRect().height - parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--public-header-height"))) < 1), `header/token mismatch at ${width}px`);
    if (compact) {
      await escape();
      await waitFor(() => !document.querySelector("header details").open && document.activeElement === document.querySelector("header summary"));
    }
  }
  await viewport(1366);
  const slot = 'button[id="leasing-plan-A.1"]';
  await click(slot);
  await waitFor(() => document.querySelector('[role="dialog"] h2')?.textContent === "Mặt bằng A.1");
  assert.equal(await evaluate(() => location.pathname.replace(/\/$/, "")), new URL("mat-bang/", base).pathname.replace(/\/$/, ""), "slot click navigated before detail action");
  await escape();
  await waitFor(() => !document.querySelector('[role="dialog"]') && document.activeElement.id === "leasing-plan-A.1");
  await click('button[aria-label="Xem danh sách (List)"]');
  await waitFor(() => document.querySelector("#leasing-floor-content")?.dataset.view === "list");
  assert(await evaluate(() => !document.querySelector('button[id^="leasing-plan-"]')), "map remains rendered while the list is selected");
  await click('button[id="leasing-list-A.1"]');
  await waitFor(() => document.querySelector('[role="dialog"] h2')?.textContent === "Mặt bằng A.1");
  await click(`${dialog} a[href*="/mat-bang/"]`);
  await waitFor(() => location.pathname.endsWith("/mat-bang/A.1") || location.pathname.endsWith("/mat-bang/A.1/"));
  await waitFor(() => !!document.querySelector('button[aria-label^="Mở ảnh:"]'));
  await click('button[aria-label^="Mở ảnh:"]');
  await waitFor(() => !!document.querySelector('[role="dialog"] button[aria-label="Phóng to ảnh"]:not([disabled])'));
  await click(`${dialog} button[aria-label="Phóng to ảnh"]`);
  await waitFor(() => [...document.querySelectorAll('[role="dialog"] [aria-live]')].some(el => el.textContent === "125%"));
  await click(`${dialog} button[aria-label="Ảnh tiếp theo"]`);
  await waitFor(() => [...document.querySelectorAll('[role="dialog"] [aria-live]')].some(el => el.textContent.startsWith("2 / 5")));
  assert(await evaluate(() => [...document.querySelectorAll('[role="dialog"] [aria-live]')].some(el => el.textContent === "100%")), "photo change did not reset zoom");
  await escape();
  await waitFor(() => !document.querySelector('[role="dialog"]') && document.activeElement.matches('button[aria-label^="Mở ảnh:"]'));
  assert(await evaluate(() => document.querySelector('[aria-label^="Ảnh dự án tham khảo"] p[aria-live]').textContent.startsWith("2 / 5")), "modal/gallery selection diverged");
  console.log("PASS public UI: responsive navigation, header token, slot popup/detail, exclusive map/list, image zoom/selection/focus, static investor-letter backdrop.");
  }
  }
} finally {
  socket?.close();
  chrome.kill();
  await stopped;
  await rm(profile, { recursive: true, force: true });
}
