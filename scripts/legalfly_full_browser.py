"""Native Chromium acceptance against acquired MaleCNS and the browser MiniMind bundle.

Never a substitute graph, never a substitute model. One asyncio run drives three
browser contexts against a production server:

* ``journey``: first MiniMind download, cached reload, corrupt-cache recovery,
  the full MaleCNS journey with a petition-privacy canary, and the responsive
  matrix with the compact ready indicator on screen;
* ``cancel``: cancel-then-retry from an empty Cache Storage;
* ``manual``: the manual-facts path without ever enabling MiniMind.

Every request from every context is recorded through both ``page.on("request")``
and a ``context.route`` pass-through so dedicated-worker traffic is captured.
"""
import asyncio
import base64
import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Request,
    Route,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

CACHE_NAME = "legalfly-minimind-browser-v1"
MANIFEST_SCHEMA = "legalfly-minimind-browser/1"
MANIFEST_PATH = "/minimind/manifest.json"
ARTIFACT_CACHE_CONTROL = "public, max-age=31536000, immutable"
READY_TEXT = "MiniMind ready · runs on this device"
DOWNLOADING_TEXT = "Downloading MiniMind to this browser."
CACHED_TEXT = "Found saved MiniMind files. Checking them on this device."
WASM_TEXT = "Starting MiniMind with the browser compatibility engine."
WEBGPU_TEXT = "Starting MiniMind with this device's graphics engine."
POST_DATA_PREVIEW_LIMIT = 2048
READY_TIMEOUT_MS = 600_000
VIEWPORTS = [(1440, 1000), (1101, 900), (1100, 900), (1024, 900), (721, 900), (720, 900), (390, 844), (320, 740)]
TEACH_ENABLED = "Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Teach the ledger' && !b.disabled)"
HEAR_ENABLED = "Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Hear the case' && !b.disabled)"
# Installed before any page script: records every rendered download percentage
# and every MiniMind status line so fast localhost downloads are still observed.
MINIMIND_TRACE_SCRIPT = """
(() => {
  const trace = { progress: [], statuses: [], gpu: 'gpu' in navigator };
  window.__lfMiniMind = trace;
  const observe = () => {
    const bar = document.querySelector('progress[aria-label="MiniMind download progress"]');
    if (bar) {
      const value = Number(bar.getAttribute('aria-valuenow'));
      if (Number.isFinite(value) && trace.progress[trace.progress.length - 1] !== value) trace.progress.push(value);
    }
    const status = document.querySelector('.lf-minimind-status');
    const ready = document.querySelector('.lf-minimind-ready');
    const text = status ? status.textContent.trim() : ready ? ready.textContent.trim() : null;
    if (text !== null && trace.statuses[trace.statuses.length - 1] !== text) trace.statuses.push(text);
  };
  new MutationObserver(observe).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
})();
"""
SETUP_STATE_SCRIPT = """() => {
  const visible = (element) => Boolean(element) && element.getClientRects().length > 0;
  const button = (label) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === label);
  return {
    ready: visible(document.querySelector('.lf-minimind-ready')),
    enable: visible(button('Enable MiniMind')),
    retry: visible(button('Retry MiniMind')),
    cancel: visible(button('Cancel download')),
    status: document.querySelector('.lf-minimind-status')?.textContent.trim() ?? null,
    statuses: window.__lfMiniMind ? window.__lfMiniMind.statuses.slice() : [],
  };
}"""
CACHE_KEYS_SCRIPT = """async (name) => {
  if (!(await caches.has(name))) return { exists: false, keys: [] };
  const cache = await caches.open(name);
  return { exists: true, keys: (await cache.keys()).map(request => request.url) };
}"""
CACHE_ENTRY_SCRIPT = """async ({ name, url, hash }) => {
  if (!(await caches.has(name))) return { present: false };
  const response = await (await caches.open(name)).match(url);
  if (!response) return { present: false };
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!hash) return { present: true, bytes: bytes.byteLength };
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { present: true, bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
}"""
CORRUPT_ENTRY_SCRIPT = """async ({ name, url, body }) => {
  const cache = await caches.open(name);
  const before = (await cache.keys()).map(request => request.url);
  await cache.put(url, new Response(new TextEncoder().encode(body), { headers: { 'content-type': 'application/octet-stream' } }));
  return before;
}"""
CANARY_SCAN_SCRIPT = """async (canary) => {
  const hits = [];
  for (const [label, store] of [['localStorage', window.localStorage], ['sessionStorage', window.sessionStorage]]) {
    try {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        const value = store.getItem(key) ?? '';
        if (key.includes(canary) || value.includes(canary)) hits.push(`${label}:${key}`);
      }
    } catch (error) { hits.push(`${label} unreadable: ${error}`); }
  }
  // Cached bodies include the multi-hundred-megabyte model, so search bytes
  // rather than decoding the body into a string.
  const needle = new TextEncoder().encode(canary);
  const containsNeedle = (bytes) => {
    for (let at = bytes.indexOf(needle[0]); at !== -1 && at <= bytes.length - needle.length; at = bytes.indexOf(needle[0], at + 1)) {
      let matched = true;
      for (let offset = 1; offset < needle.length; offset += 1) if (bytes[at + offset] !== needle[offset]) { matched = false; break; }
      if (matched) return true;
    }
    return false;
  };
  const scanned = [];
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (request.url.includes(canary)) hits.push(`cache key ${name}:${request.url}`);
      const response = await cache.match(request);
      const bytes = response ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array();
      scanned.push({ cache: name, url: request.url, bytes: bytes.byteLength });
      if (containsNeedle(bytes)) hits.push(`cache body ${name}:${request.url}`);
    }
  }
  return { hits, scanned };
}"""


class TrafficLog:
    """Requests, console output, and page errors for every context in the run."""

    def __init__(self, base: str):
        self.base = urlsplit(base)
        self.started = time.monotonic()
        self.entries: list[dict] = []
        self.full_bodies: list[str] = []
        self.console: list[dict] = []
        self.page_errors: list[str] = []
        self.route_failures: list[dict] = []
        self.worker_urls: set[str] = set()
        # label -> (url predicate, seconds): hold a matching request before it
        # is released to the server, giving cancel a deterministic window.
        self.delays: dict[str, tuple] = {}

    def now(self) -> float:
        return time.monotonic() - self.started

    async def attach_context(self, context: BrowserContext, label: str) -> None:
        async def passthrough(route: Route, request: Request) -> None:
            self.record(request, "route", label)
            delay = self.delays.get(label)
            if delay and delay[0](request.url):
                await asyncio.sleep(delay[1])
            try:
                await route.continue_()
            except Exception as error:  # the page may have aborted the request meanwhile
                self.route_failures.append({"context": label, "url": request.url, "error": str(error)})

        await context.add_init_script(MINIMIND_TRACE_SCRIPT)
        await context.route("**/*", passthrough)

    def attach_page(self, page: Page, label: str) -> None:
        page.on("request", lambda request: self.record(request, "page", label))
        page.on("worker", lambda worker: self.worker_urls.add(worker.url))
        page.on("console", lambda message: self.console.append({"context": label, "type": message.type, "text": message.text}))
        page.on("pageerror", lambda error: self.page_errors.append(f"{label}: {error}"))

    def record(self, request: Request, channel: str, label: str) -> None:
        try:
            headers = request.headers
        except Exception:
            headers = {}
        try:
            service_worker = getattr(request, "service_worker", None) is not None
        except Exception:
            service_worker = False
        entry = {
            "t": round(self.now(), 3),
            "context": label,
            "channel": channel,
            "url": request.url,
            "method": request.method,
            "resource_type": request.resource_type,
            "referer": headers.get("referer"),
            "service_worker": service_worker,
        }
        try:
            post = request.post_data
        except Exception:
            post = None
        if post is not None:
            self.full_bodies.append(post)
            entry["post_data_bytes"] = len(post.encode("utf-8", "surrogatepass"))
            entry["post_data"] = post[:POST_DATA_PREVIEW_LIMIT]
            entry["post_data_truncated"] = len(post) > POST_DATA_PREVIEW_LIMIT
        self.entries.append(entry)

    def from_worker(self, entry: dict) -> bool:
        return bool(entry.get("referer")) and entry["referer"] in self.worker_urls

    def is_same_origin(self, url: str) -> bool:
        parts = urlsplit(url)
        if parts.scheme in ("data", "blob", "about"):
            return True
        return parts.scheme == self.base.scheme and parts.netloc == self.base.netloc

    def urls(self, label: str | None = None, since: float = 0.0, predicate=None) -> list[str]:
        seen = []
        for entry in self.entries:
            if label and entry["context"] != label:
                continue
            if entry["t"] < since:
                continue
            if predicate and not predicate(entry["url"]):
                continue
            if entry["url"] not in seen:
                seen.append(entry["url"])
        return seen

    def artifact_urls(self, label: str | None = None, since: float = 0.0) -> list[str]:
        return self.urls(label, since, lambda url: urlsplit(url).path.startswith("/minimind/"))

    def cross_origin_urls(self) -> list[str]:
        return self.urls(predicate=lambda url: not self.is_same_origin(url))

    def persist(self, path: Path) -> None:
        payload = {
            "origin": f"{self.base.scheme}://{self.base.netloc}",
            "worker_urls": sorted(self.worker_urls),
            "route_failures": self.route_failures,
            "entries": [{**entry, "from_worker": self.from_worker(entry)} for entry in self.entries],
        }
        path.write_text(json.dumps(payload, indent=1))


def teach_button(page: Page):
    return page.get_by_role("button", name="Teach the ledger", exact=True).first


def hear_button(page: Page):
    return page.get_by_role("button", name="Hear the case", exact=True).first


def ready_indicator(page: Page):
    return page.locator('p.lf-minimind-ready[role="status"]')


def setup_card(page: Page):
    return page.locator('section[aria-labelledby="minimind-setup-title"]')


def enable_button(page: Page):
    return page.get_by_role("button", name="Enable MiniMind", exact=True)


def retry_button(page: Page):
    return page.get_by_role("button", name="Retry MiniMind", exact=True)


def cancel_button(page: Page):
    return page.get_by_role("button", name="Cancel download", exact=True)


def draft_button(page: Page):
    return page.get_by_role("button", name="Draft facts with MiniMind", exact=True)


def artifact_url(base: str, file: str) -> str:
    return f"{base}/minimind/{file}"


async def new_chamber_context(browser: Browser, log: TrafficLog, label: str, **options) -> BrowserContext:
    context = await browser.new_context(viewport={"width": 1440, "height": 1000}, **options)
    await log.attach_context(context, label)
    return context


async def open_chamber(context: BrowserContext, log: TrafficLog, label: str, base: str) -> Page:
    page = await context.new_page()
    log.attach_page(page, label)
    await page.goto(base, wait_until="domcontentloaded")
    return page


async def wait_for_graph(page: Page) -> None:
    await teach_button(page).wait_for()
    await page.wait_for_function(TEACH_ENABLED, timeout=180_000)


async def setup_state(page: Page) -> dict:
    return await page.evaluate(SETUP_STATE_SCRIPT)


async def minimind_trace(page: Page) -> dict:
    return await page.evaluate("window.__lfMiniMind")


async def wait_for_ready(page: Page, timeout_ms: int = READY_TIMEOUT_MS) -> None:
    await ready_indicator(page).wait_for(state="visible", timeout=timeout_ms)
    text = (await ready_indicator(page).text_content()).strip()
    assert text == READY_TEXT, f"Ready indicator text was {text!r}"


async def assert_setup_gone(page: Page) -> None:
    assert await setup_card(page).count() == 0, "MiniMind setup card is still rendered in the ready state"
    assert await enable_button(page).count() == 0, "Enable MiniMind button is still rendered in the ready state"
    assert await draft_button(page).count() == 1, "Draft facts with MiniMind is missing in the ready state"


def observed_backend(statuses: list[str]) -> str:
    """The engine that reached ready is the last loading line rendered; headless
    Chromium exposes navigator.gpu without an adapter, so a WebGPU attempt may
    precede the WASM fallback."""
    attempts = [status for status in statuses if status in (WEBGPU_TEXT, WASM_TEXT)]
    if not attempts:
        return "not observed"
    return "webgpu" if attempts[-1] == WEBGPU_TEXT else "wasm"


def backend_attempts(statuses: list[str]) -> list[str]:
    return ["webgpu" if status == WEBGPU_TEXT else "wasm" for status in statuses if status in (WEBGPU_TEXT, WASM_TEXT)]


async def cache_keys(page: Page) -> dict:
    return await page.evaluate(CACHE_KEYS_SCRIPT, CACHE_NAME)


async def cache_entry(page: Page, url: str, hash: bool = True) -> dict:
    return await page.evaluate(CACHE_ENTRY_SCRIPT, {"name": CACHE_NAME, "url": url, "hash": hash})


async def wait_until(page: Page, probe, timeout_ms: int, description: str, interval_ms: int = 250):
    """Poll an async Python probe; wait_for_function cannot await async page predicates."""
    deadline = time.monotonic() + timeout_ms / 1000
    while True:
        result = await probe()
        if result:
            return result
        assert time.monotonic() < deadline, f"Timed out waiting for {description}"
        await page.wait_for_timeout(interval_ms)


def summarize_samples(samples: list) -> dict:
    return {"count": len(samples), "first": samples[:5], "last": samples[-5:]}


async def verify_minimind_delivery(context: BrowserContext, base: str) -> tuple[dict, dict]:
    """Fetch the manifest and artifacts outside the page and check delivery headers."""
    response = await context.request.get(base + MANIFEST_PATH)
    assert response.status == 200, f"Manifest returned {response.status}"
    manifest = await response.json()
    assert manifest["schema"] == MANIFEST_SCHEMA, manifest.get("schema")
    files = manifest["files"]
    assert len(files) == 5, [entry["file"] for entry in files]
    onnx = [entry for entry in files if entry["file"].endswith(".onnx")]
    assert len(onnx) == 1, [entry["file"] for entry in files]
    manifest_cache_control = response.headers.get("cache-control", "")
    assert "immutable" not in manifest_cache_control, f"Manifest must revalidate, got {manifest_cache_control!r}"
    delivery = {"manifest_cache_control": manifest_cache_control, "files": {}}
    for entry in files:
        url = artifact_url(base, entry["file"])
        probe = await context.request.get(url, headers={"Range": "bytes=0-0"})
        assert probe.status in (200, 206), (url, probe.status)
        headers = probe.headers
        assert headers.get("cache-control") == ARTIFACT_CACHE_CONTROL, (url, headers.get("cache-control"))
        assert headers.get("accept-ranges") == "bytes", (url, headers.get("accept-ranges"))
        delivery["files"][entry["file"]] = {"bytes": entry["bytes"], "probe_status": probe.status, "cache_control": headers.get("cache-control")}
        if not entry["file"].endswith(".onnx"):
            body = await (await context.request.get(url)).body()
            assert len(body) == entry["bytes"], (url, len(body), entry["bytes"])
            assert hashlib.sha256(body).hexdigest() == entry["sha256"], f"Served {entry['file']} does not match its manifest hash"
    onnx_url = artifact_url(base, onnx[0]["file"])
    ranged = await context.request.get(onnx_url, headers={"Range": "bytes=0-99"})
    assert ranged.status == 206, f"Ranged .onnx request returned {ranged.status}"
    content_range = ranged.headers.get("content-range", "")
    assert content_range.startswith("bytes 0-99/") and content_range.endswith(f"/{onnx[0]['bytes']}"), content_range
    assert len(await ranged.body()) == 100, "Ranged .onnx body was not 100 bytes"
    delivery["onnx_range"] = {"status": ranged.status, "content_range": content_range}
    return manifest, delivery


async def first_download(page: Page, log: TrafficLog, label: str, manifest: dict, out: Path) -> dict:
    """Click Enable MiniMind on an empty cache and assert progress, ready, and setup removal."""
    before = log.artifact_urls(label)
    assert not before, f"MiniMind artifacts were requested before Enable MiniMind: {before}"
    await enable_button(page).click()
    started = time.monotonic()
    await page.wait_for_function("window.__lfMiniMind && window.__lfMiniMind.progress.length > 0", timeout=120_000)
    await page.screenshot(path=str(out / "minimind-downloading.png"), full_page=False, caret="initial")
    await wait_for_ready(page)
    seconds = time.monotonic() - started
    trace = await minimind_trace(page)
    statuses = trace["statuses"]
    assert DOWNLOADING_TEXT in statuses, f"Downloading status copy never rendered: {statuses}"
    samples = trace["progress"]
    assert samples == sorted(samples), f"Download progress went backwards: {samples[:20]}"
    assert len(set(samples)) >= 2, f"Download progress never increased: {samples}"
    assert READY_TEXT in statuses, statuses
    await assert_setup_gone(page)
    await page.screenshot(path=str(out / "minimind-ready.png"), full_page=False, caret="initial")
    print("CHAMBER_MINIMIND_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25, caret="initial")).decode(), flush=True)
    requested = log.artifact_urls(label)
    for entry in manifest["files"]:
        assert any(url.endswith("/minimind/" + entry["file"]) for url in requested), f"{entry['file']} was never requested: {requested}"
    return {
        "seconds": seconds,
        "bytes": sum(entry["bytes"] for entry in manifest["files"]),
        "progress_samples": summarize_samples(samples),
        "statuses": statuses,
        "backend_observed": observed_backend(statuses),
        "backend_attempts": backend_attempts(statuses),
        "navigator_gpu": trace["gpu"],
        "artifact_requests": requested,
    }


async def cached_reload(page: Page, log: TrafficLog, label: str) -> dict:
    """Reload in the ready context and assert readiness returns without model bytes."""
    mark = log.now()
    started = time.monotonic()
    await page.reload(wait_until="domcontentloaded")
    await wait_for_ready(page)
    seconds = time.monotonic() - started
    trace = await minimind_trace(page)
    statuses = trace["statuses"]
    assert DOWNLOADING_TEXT not in statuses, f"Cached reload downloaded again: {statuses}"
    assert READY_TEXT in statuses, statuses
    # React may batch the brief "cached" render away while the graph worker is
    # busy, so the cached path is proven by the absence of model requests below
    # and the transient copy is recorded when it was painted.
    after = log.artifact_urls(label, since=mark)
    model_bytes = [url for url in after if url.endswith(".onnx")]
    assert not model_bytes, f".onnx requested after cached reload: {model_bytes}"
    unexpected = [url for url in after if not url.endswith(MANIFEST_PATH)]
    assert not unexpected, f"Non-manifest MiniMind requests after cached reload: {unexpected}"
    await assert_setup_gone(page)
    return {
        "seconds": seconds,
        "statuses": statuses,
        "cached_status_observed": CACHED_TEXT in statuses,
        "backend_observed": observed_backend(statuses),
        "requests_after_reload": after,
    }


async def corrupt_cache_recovery(page: Page, log: TrafficLog, label: str, manifest: dict, base: str) -> dict:
    """Overwrite the cached .onnx with garbage and assert the app never claims ready from it."""
    onnx = next(entry for entry in manifest["files"] if entry["file"].endswith(".onnx"))
    onnx_url = artifact_url(base, onnx["file"])
    expected_keys = {base + MANIFEST_PATH, *[artifact_url(base, entry["file"]) for entry in manifest["files"]]}
    before = await page.evaluate(CORRUPT_ENTRY_SCRIPT, {"name": CACHE_NAME, "url": onnx_url, "body": "not a MiniMind model"})
    missing = expected_keys - set(before)
    assert not missing, f"Cache was not manifest-complete before corruption: missing {missing}"
    corrupted = await cache_entry(page, onnx_url)
    assert corrupted["present"] and corrupted["bytes"] == len("not a MiniMind model"), corrupted
    mark = log.now()
    await page.reload(wait_until="domcontentloaded")
    # Settled means: ready (re-download path), or an enable/retry control with
    # the corrupt entry already evicted or replaced by a full-size artifact.
    async def settled_probe():
        state = await setup_state(page)
        if state["ready"]:
            return state
        if state["cancel"] or state["status"] == CACHED_TEXT or not (state["enable"] or state["retry"]):
            return None
        entry = await cache_entry(page, onnx_url, hash=False)
        return state if not entry["present"] or entry["bytes"] == onnx["bytes"] else None

    settled = await wait_until(page, settled_probe, READY_TIMEOUT_MS, "the corrupt cache to settle")
    statuses = settled["statuses"]
    after_reload = log.artifact_urls(label, since=mark)
    if settled["ready"]:
        path = "re-download"
        assert DOWNLOADING_TEXT in statuses, f"Ready after corruption without an observed download: {statuses}"
        assert any(url.endswith(".onnx") for url in after_reload), f"Ready after corruption without a model request: {after_reload}"
    else:
        path = "retry" if settled["retry"] else "setup"
        assert READY_TEXT not in statuses, f"Ready was claimed from a corrupt cache: {statuses}"
        evicted = await cache_entry(page, onnx_url)
        assert not evicted["present"] or (evicted["bytes"] == onnx["bytes"] and evicted["sha256"] == onnx["sha256"]), f"Corrupt bytes remain cached: {evicted}"
        await page.wait_for_timeout(2_000)
        assert await ready_indicator(page).count() == 0, "Ready appeared late from a corrupt cache"
        await (retry_button(page) if settled["retry"] else enable_button(page)).click()
        await wait_for_ready(page)
    trace = await minimind_trace(page)
    restored = await cache_entry(page, onnx_url)
    assert restored["present"] and restored["bytes"] == onnx["bytes"] and restored["sha256"] == onnx["sha256"], f"Recovered cache does not match the manifest: {restored}"
    keys = await cache_keys(page)
    assert expected_keys <= set(keys["keys"]), f"Recovered cache is not manifest-complete: {keys}"
    await assert_setup_gone(page)
    return {
        "path": path,
        "settled_state": {key: settled[key] for key in ("ready", "enable", "retry", "status")},
        "statuses": trace["statuses"],
        "backend_observed": observed_backend(trace["statuses"]),
        "requests_after_reload": log.artifact_urls(label, since=mark),
        "restored_entry": restored,
    }


async def run_journey(page: Page, out: Path, measurements: dict) -> None:
    """The existing full MaleCNS journey: soma map, teach, hear, inspect, file, export, import."""
    started = time.monotonic()
    canvas = page.get_by_role("img", name="Actual sampled MaleCNS activity mapped to released soma coordinates")
    await canvas.wait_for(state="visible", timeout=10_000)
    assert await page.get_by_label("Inspect displayed neuron").locator("option").count() > 0
    assert await canvas.evaluate("c => c.width > 1 && c.height > 1 && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)")
    hero = page.locator(".lf-hero")
    initial = await hero.bounding_box()
    for _ in range(5):
        await page.wait_for_timeout(400)
        current = await hero.bounding_box()
        assert abs(current["height"] - initial["height"]) < 3, (initial, current)
    await page.screenshot(path=str(out / "desktop-idle.png"), full_page=True, caret="initial")
    # Small browser-produced previews in logs allow review through text-only
    # CI connectors. Full-resolution evidence remains in the private artifact.
    print("CHAMBER_DESKTOP_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25, caret="initial")).decode(), flush=True)
    started = time.monotonic()
    await teach_button(page).click()
    confirm = page.get_by_role("button", name="Confirm these eight facts", exact=True)
    await confirm.wait_for(timeout=300_000)
    measurements["teaching_seconds"] = time.monotonic() - started
    await page.get_by_role("complementary", name="Petitioner docket").get_by_role("button").nth(1).click()
    await confirm.click()
    await page.wait_for_function(HEAR_ENABLED)
    started = time.monotonic()
    await hear_button(page).click()
    await page.get_by_role("button", name="File in casebook", exact=True).wait_for(timeout=120_000)
    measurements["consultation_seconds"] = time.monotonic() - started
    assert await canvas.is_visible()
    await page.get_by_text("update 4/4", exact=True).wait_for()
    assert await page.locator(".lf-neuron-record").get_by_text("activation", exact=False).count() == 1
    # Idle anatomy has zero activation. Select the displayed sampled neurons
    # until a real nonzero computation value is found, using the actual UI.
    neurons = page.get_by_label("Inspect displayed neuron")
    choices = await neurons.locator("option").evaluate_all("items => items.map(o => o.value)")
    nonzero = False
    for choice in choices[:30]:
        await neurons.select_option(choice)
        value = await page.locator(".lf-neuron-record").get_by_text("activation", exact=False).text_content()
        if abs(float(value.split()[-1])) > 0:
            nonzero = True
            break
    assert nonzero, "No nonzero actual activation reached the neuron inspector"
    measurements["neuron_record"] = await page.locator(".lf-neuron-record").text_content()
    measurements["recommendation"] = await page.locator(".lf-advice").text_content()
    measurements["memory"] = await page.evaluate("performance.memory ? {usedJSHeapSize: performance.memory.usedJSHeapSize, note: 'main realm only, worker memory excluded'} : null")
    await page.screenshot(path=str(out / "desktop-advice.png"), full_page=True, caret="initial")
    await canvas.scroll_into_view_if_needed()
    print("CHAMBER_NEURONS_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25, caret="initial")).decode(), flush=True)
    await page.get_by_role("button", name="File in casebook", exact=True).click()
    await page.get_by_text("1 filed", exact=True).wait_for()
    async with page.expect_download() as export:
        await page.get_by_role("button", name="Export model", exact=True).click()
    model_file = out / "verified-model.json"
    await (await export.value).save_as(model_file)
    await page.get_by_role("button", name="Reset model", exact=True).click()
    await page.wait_for_function(TEACH_ENABLED)
    await page.locator('input[type="file"]').nth(0).set_input_files(model_file)
    await page.wait_for_function(HEAR_ENABLED)


async def privacy_canary(page: Page, log: TrafficLog, out: Path) -> dict:
    """Draft facts and hear a canary petition, then prove the canary left no trace."""
    canary = f"CANARY-{uuid.uuid4()}"
    petition = f"{canary} private goat petition. My neighbor's goat ate the fence posts I had stacked for the market."
    docket = page.get_by_role("complementary", name="Petitioner docket")
    await docket.get_by_role("button").filter(has_text="Write a custom petition").click()
    narrative = page.get_by_label("Petition narrative")
    await narrative.fill(petition)
    assert await narrative.input_value() == petition
    await draft_button(page).wait_for(state="visible")
    await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Draft facts with MiniMind' && !b.disabled)")
    started = time.monotonic()
    await draft_button(page).click()
    receipt = page.locator(".lf-language-receipt")
    await page.wait_for_function("document.querySelector('.lf-language-receipt') || document.querySelector('.lf-language-error')", timeout=120_000)
    language_error = page.locator(".lf-language-error")
    assert await language_error.count() == 0, f"MiniMind draft failed: {await language_error.text_content()}"
    await receipt.get_by_text("MiniMind draft", exact=True).wait_for()
    draft_seconds = time.monotonic() - started
    draft_text = await receipt.text_content()
    await receipt.get_by_role("button", name="Use these facts", exact=True).click()
    confirm = page.get_by_role("button", name="Confirm these eight facts", exact=True)
    if await confirm.count():
        await confirm.click()
    await page.get_by_role("button", name="Facts confirmed", exact=True).wait_for()
    await page.wait_for_function(HEAR_ENABLED)
    started = time.monotonic()
    await hear_button(page).click()
    await page.get_by_role("button", name="File in casebook", exact=True).wait_for(timeout=120_000)
    boundary = page.locator(".lf-boundary-note span")
    await page.wait_for_function("document.querySelector('.lf-boundary-note span')?.textContent === 'MiniMind rendering' || document.querySelector('.lf-language-error')", timeout=120_000)
    assert await language_error.count() == 0, f"MiniMind counsel note failed: {await language_error.text_content()}"
    assert await boundary.text_content() == "MiniMind rendering"
    note_seconds = time.monotonic() - started
    note = await page.locator(".lf-advice").text_content()
    await page.screenshot(path=str(out / "desktop-canary-advice.png"), full_page=True, caret="initial")
    url_hits = [entry["url"] for entry in log.entries if canary in entry["url"]]
    assert not url_hits, f"Canary appeared in request URLs: {url_hits}"
    body_hits = sum(1 for body in log.full_bodies if canary in body)
    assert body_hits == 0, f"Canary appeared in {body_hits} request bodies"
    scan = await page.evaluate(CANARY_SCAN_SCRIPT, canary)
    assert not scan["hits"], f"Canary persisted in browser storage: {scan['hits']}"
    console_hits = [message for message in log.console if canary in message["text"]]
    assert not console_hits, f"Canary appeared in console output: {console_hits}"
    cross_origin = log.cross_origin_urls()
    assert not cross_origin, f"Requests left the origin: {cross_origin}"
    return {
        "canary": canary,
        "draft_seconds": draft_seconds,
        "note_seconds": note_seconds,
        "draft_receipt": draft_text,
        "counsel_note": note,
        "boundary": "MiniMind rendering",
        "storage_scanned": scan["scanned"],
        "requests_checked": len(log.entries),
        "bodies_checked": len(log.full_bodies),
        "console_messages_checked": len(log.console),
    }


async def responsive_matrix(page: Page, out: Path) -> dict:
    """The width matrix, run with the compact ready indicator on screen."""
    responsive = {}
    canvas = page.get_by_role("img", name="Actual sampled MaleCNS activity mapped to released soma coordinates")
    hear = hear_button(page)
    for width, height in VIEWPORTS:
        await page.set_viewport_size({"width": width, "height": height})
        await page.emulate_media(reduced_motion="reduce")
        await page.wait_for_timeout(200)
        document_size = await page.evaluate("({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth})")
        assert document_size["scrollWidth"] <= document_size["clientWidth"], (width, document_size)
        petition_bounds = await page.locator(".lf-petition-panel").bounding_box()
        docket_bounds = await page.locator(".lf-docket").bounding_box()
        assert petition_bounds and docket_bounds
        if 721 <= width <= 1100:
            assert petition_bounds["width"] > width * 0.45, (width, petition_bounds)
            assert petition_bounds["x"] > docket_bounds["x"], (width, docket_bounds, petition_bounds)
        if width <= 720:
            assert petition_bounds["y"] >= docket_bounds["y"] + docket_bounds["height"] - 1, (width, docket_bounds, petition_bounds)
        primary_controls = await page.locator(".lf-button.primary").evaluate_all("""items => items
            .filter(item => { const style = getComputedStyle(item); return style.display !== 'none' && style.visibility !== 'hidden'; })
            .map(item => { const rect = item.getBoundingClientRect(); return {text: item.textContent.trim(), height: rect.height, left: rect.left, right: rect.right}; })""")
        assert primary_controls, (width, "No visible primary controls")
        assert all(control["height"] >= 44 for control in primary_controls), (width, primary_controls)
        assert all(control["left"] >= 0 and control["right"] <= width + 1 for control in primary_controls), (width, primary_controls)
        step_guide = page.locator("ol.lf-step-guide")
        assert await step_guide.count() == 1, (width, "Step guide is missing")
        guide = await step_guide.evaluate("""el => ({
            scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, right: el.getBoundingClientRect().right,
            items: Array.from(el.children).map(li => Math.round(li.getBoundingClientRect().right)) })""")
        assert guide["scrollWidth"] <= guide["clientWidth"] + 1, (width, "Step guide overflows horizontally", guide)
        assert guide["right"] <= width + 1 and all(right <= width + 1 for right in guide["items"]), (width, "Step guide extends past the viewport", guide)
        indicator = ready_indicator(page)
        assert await indicator.count() == 1 and await indicator.is_visible(), (width, "Ready indicator is not visible")
        indicator_bounds = await indicator.bounding_box()
        assert indicator_bounds and indicator_bounds["x"] >= 0 and indicator_bounds["x"] + indicator_bounds["width"] <= width + 1, (width, indicator_bounds)
        bounds = await canvas.bounding_box()
        assert bounds and bounds["height"] > 50 and bounds["width"] > 50
        responsive[str(width)] = {
            "document": document_size,
            "petition": petition_bounds,
            "docket": docket_bounds,
            "primary_controls": primary_controls,
            "step_guide": guide,
            "ready_indicator": indicator_bounds,
        }
        await page.screenshot(path=str(out / f"chamber-{width}.png"), full_page=True, caret="initial")
        if width == 390:
            await indicator.scroll_into_view_if_needed()
            in_view = await indicator.bounding_box()
            assert in_view and 0 <= in_view["y"] and in_view["y"] + in_view["height"] <= height, (width, in_view)
            await hear.scroll_into_view_if_needed()
            button_bounds = await hear.bounding_box()
            assert button_bounds and 0 <= button_bounds["y"] < height
            print("CHAMBER_PHONE_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25, caret="initial")).decode(), flush=True)
    return responsive


async def cancel_and_retry(browser: Browser, log: TrafficLog, base: str, manifest: dict, out: Path) -> dict:
    """Fresh context: cancel a first download, prove nothing is ready or cached, then retry."""
    label = "cancel"
    context = await new_chamber_context(browser, log, label)
    # Hold the model request so the downloading state is long enough to cancel.
    log.delays[label] = (lambda url: url.endswith(".onnx"), 3.0)
    try:
        page = await open_chamber(context, log, label, base)
        await enable_button(page).wait_for(state="visible")
        assert not log.artifact_urls(label), f"MiniMind artifacts requested before enable in cancel context: {log.artifact_urls(label)}"
        await enable_button(page).click()
        await cancel_button(page).wait_for(state="visible", timeout=30_000)
        progress_seen = True
        try:
            await page.wait_for_function("window.__lfMiniMind && window.__lfMiniMind.progress.length > 0", timeout=2_500)
        except PlaywrightTimeoutError:
            progress_seen = False
        await cancel_button(page).click(timeout=5_000)
        await page.wait_for_function(f"() => {{ const s = ({SETUP_STATE_SCRIPT})(); return !s.cancel && (s.enable || s.retry); }}", timeout=30_000)
        await page.wait_for_timeout(5_000)
        state = await setup_state(page)
        assert state["enable"] or state["retry"], state
        assert not state["ready"] and READY_TEXT not in state["statuses"], f"Ready appeared after cancel: {state}"
        assert await ready_indicator(page).count() == 0
        keys = await cache_keys(page)
        assert base + MANIFEST_PATH not in keys["keys"], f"Canceled download left a manifest-complete cache: {keys}"
        log.delays.pop(label, None)
        canceled_requests = log.artifact_urls(label)
        await (retry_button(page) if state["retry"] else enable_button(page)).click()
        started = time.monotonic()
        await wait_for_ready(page)
        retry_seconds = time.monotonic() - started
        await assert_setup_gone(page)
        trace = await minimind_trace(page)
        final_keys = await cache_keys(page)
        assert base + MANIFEST_PATH in final_keys["keys"], final_keys
        await page.screenshot(path=str(out / "minimind-retry-ready.png"), full_page=False, caret="initial")
        return {
            "progress_seen_before_cancel": progress_seen,
            "state_after_cancel": {key: state[key] for key in ("ready", "enable", "retry", "status")},
            "cache_keys_after_cancel": keys["keys"],
            "requests_before_cancel": canceled_requests,
            "retry_seconds": retry_seconds,
            "statuses": trace["statuses"],
            "backend_observed": observed_backend(trace["statuses"]),
            "route_failures": [failure for failure in log.route_failures if failure["context"] == label],
        }
    finally:
        log.delays.pop(label, None)
        await context.close()


async def manual_flow(browser: Browser, log: TrafficLog, base: str, out: Path) -> dict:
    """Fresh context: manual facts through to a recommendation without enabling MiniMind."""
    label = "manual"
    context = await new_chamber_context(browser, log, label)
    try:
        page = await open_chamber(context, log, label, base)
        await wait_for_graph(page)
        await page.get_by_role("button", name="Continue with manual facts", exact=True).click()
        await page.get_by_role("button", name="Keep using manual facts", exact=True).wait_for(state="visible")
        status = (await page.locator(".lf-minimind-status").text_content()).strip()
        assert status == "MiniMind has not been downloaded.", status
        await teach_button(page).click()
        confirm = page.get_by_role("button", name="Confirm these eight facts", exact=True)
        await confirm.wait_for(timeout=300_000)
        await page.get_by_role("complementary", name="Petitioner docket").get_by_role("button").nth(1).click()
        await confirm.click()
        await page.wait_for_function(HEAR_ENABLED)
        await hear_button(page).click()
        await page.get_by_role("button", name="File in casebook", exact=True).wait_for(timeout=120_000)
        recommendation = (await page.locator(".lf-advice h2").text_content()).strip()
        assert recommendation, "Manual flow produced no recommendation"
        boundary = (await page.locator(".lf-boundary-note span").text_content()).strip()
        assert boundary == "Authored fallback", boundary
        assert await ready_indicator(page).count() == 0
        artifacts = log.artifact_urls(label)
        assert not artifacts, f"Manual flow requested MiniMind artifacts: {artifacts}"
        await page.screenshot(path=str(out / "manual-advice.png"), full_page=True, caret="initial")
        return {"recommendation": recommendation, "boundary": boundary, "status": status, "artifact_requests": artifacts}
    finally:
        await context.close()


async def main():
    out = Path(os.environ.get("QA_ARTIFACTS_DIR", "/tmp/legalfly-full-qa"))
    out.mkdir(parents=True, exist_ok=True)
    base = os.environ.get("QA_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
    measurements: dict = {}
    log = TrafficLog(base)
    async with async_playwright() as playwright:
        launch_options = {"headless": True, "args": ["--no-sandbox"]}
        if os.environ.get("BROWSER_EXECUTABLE"):
            launch_options["executable_path"] = os.environ["BROWSER_EXECUTABLE"]
        browser = await playwright.chromium.launch(**launch_options)
        try:
            label = "journey"
            context = await new_chamber_context(browser, log, label, record_video_dir=str(out / "video"))
            started = time.monotonic()
            page = await open_chamber(context, log, label, base)
            manifest_response = await context.request.get(base + "/legalfly/manifest.json")
            manifest = await manifest_response.json()
            assert manifest["available"] is True
            assert manifest["graph"]["neurons"] == 165122
            assert manifest["graph"]["connections"] == 25563197
            measurements["graph"] = manifest["graph"]
            await wait_for_graph(page)
            measurements["load_seconds"] = time.monotonic() - started
            # MiniMind: nothing may be fetched from /minimind/ before the explicit enable.
            assert not log.artifact_urls(), f"MiniMind artifacts requested before enable: {log.artifact_urls()}"
            minimind_manifest, delivery = await verify_minimind_delivery(context, base)
            assert not log.artifact_urls(), "APIRequest checks must not be attributed to the page"
            minimind = {
                "manifest": {key: minimind_manifest[key] for key in ("schema", "model", "revision", "quantization")},
                "files": [entry["file"] for entry in minimind_manifest["files"]],
                "delivery": delivery,
                "first_download": await first_download(page, log, label, minimind_manifest, out),
                "cached_reload": await cached_reload(page, log, label),
                "corrupt_cache": await corrupt_cache_recovery(page, log, label, minimind_manifest, base),
            }
            await wait_for_graph(page)
            await run_journey(page, out, measurements)
            minimind["privacy_canary"] = await privacy_canary(page, log, out)
            measurements["responsive"] = await responsive_matrix(page, out)
            await context.close()
            minimind["cancel_and_retry"] = await cancel_and_retry(browser, log, base, minimind_manifest, out)
            minimind["manual_flow"] = await manual_flow(browser, log, base, out)
            measurements["minimind"] = minimind
            measurements["browser"] = browser.version
        finally:
            log.persist(out / "requests.json")
            await browser.close()
    cross_origin = log.cross_origin_urls()
    artifact_requests = log.artifact_urls()
    measurements["requests"] = {
        "total_events": len(log.entries),
        "unique_urls": len(log.urls()),
        "worker_urls": sorted(log.worker_urls),
        "minimind_requests_from_worker": sum(1 for entry in log.entries if log.from_worker(entry) and urlsplit(entry["url"]).path.startswith("/minimind/")),
        "minimind_artifact_urls": artifact_requests,
        "cross_origin": cross_origin,
        "console_messages": len(log.console),
        "console_errors": [message for message in log.console if message["type"] == "error"],
    }
    measurements["page_errors"] = log.page_errors
    measurements["mode"] = "native Chromium; official full MaleCNS; same-origin browser MiniMind downloaded, cached, verified, and run on this device; no injected graph, activity, or model"
    assert not cross_origin, f"Requests left the origin: {cross_origin}"
    assert not log.page_errors, log.page_errors
    (out / "measurements.json").write_text(json.dumps(measurements, indent=2))
    print(json.dumps({k: v for k, v in measurements.items() if k != "graph"}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
