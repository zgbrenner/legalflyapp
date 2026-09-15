"""Native Chromium acceptance against acquired MaleCNS, never a substitute graph."""
import asyncio
import base64
import json
import os
import time
from pathlib import Path

from playwright.async_api import async_playwright


async def main():
    out = Path(os.environ.get("QA_ARTIFACTS_DIR", "/tmp/legalfly-full-qa"))
    out.mkdir(parents=True, exist_ok=True)
    base = os.environ.get("QA_BASE_URL", "http://127.0.0.1:3000")
    measurements, errors = {}, []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        context = await browser.new_context(viewport={"width": 1440, "height": 1000}, record_video_dir=str(out / "video"))
        page = await context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        started = time.monotonic()
        await page.goto(base, wait_until="domcontentloaded")
        manifest_response = await context.request.get(base + "/legalfly/manifest.json")
        manifest = await manifest_response.json()
        assert manifest["available"] is True
        assert manifest["graph"]["neurons"] == 165122
        assert manifest["graph"]["connections"] == 25563197
        measurements["graph"] = manifest["graph"]
        teach = page.get_by_role("button", name="Teach the ledger", exact=True).first
        await teach.wait_for()
        await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Teach the ledger' && !b.disabled)", timeout=180_000)
        measurements["load_seconds"] = time.monotonic() - started
        # The real soma map must be visible BEFORE any model is trained.
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
        await page.screenshot(path=str(out / "desktop-idle.png"), full_page=True)
        # Small browser-produced previews in logs allow review through text-only
        # CI connectors. Full-resolution evidence remains in the private artifact.
        print("CHAMBER_DESKTOP_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25)).decode(), flush=True)
        started = time.monotonic()
        await teach.click()
        hear = page.get_by_role("button", name="Hear the case", exact=True).first
        await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Hear the case' && !b.disabled)", timeout=300_000)
        measurements["teaching_seconds"] = time.monotonic() - started
        await page.get_by_role("complementary", name="Petitioner docket").get_by_role("button").nth(1).click()
        started = time.monotonic()
        await hear.click()
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
            value = await page.locator(".lf-neuron-record").get_by_text("activation", exact=False).inner_text()
            if abs(float(value.split()[-1])) > 0:
                nonzero = True
                break
        assert nonzero, "No nonzero actual activation reached the neuron inspector"
        measurements["neuron_record"] = await page.locator(".lf-neuron-record").inner_text()
        measurements["recommendation"] = await page.locator(".lf-advice").inner_text()
        measurements["memory"] = await page.evaluate("performance.memory ? {usedJSHeapSize: performance.memory.usedJSHeapSize, note: 'main realm only, worker memory excluded'} : null")
        await page.screenshot(path=str(out / "desktop-advice.png"), full_page=True)
        await canvas.scroll_into_view_if_needed()
        print("CHAMBER_NEURONS_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25)).decode(), flush=True)
        await page.get_by_role("button", name="File in casebook", exact=True).click()
        await page.get_by_text("1 filed", exact=True).wait_for()
        async with page.expect_download() as export:
            await page.get_by_role("button", name="Export model", exact=True).click()
        model_file = out / "verified-model.json"
        await (await export.value).save_as(model_file)
        await page.get_by_role("button", name="Reset model", exact=True).click()
        await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Teach the ledger' && !b.disabled)")
        await page.locator('input[type="file"]').nth(0).set_input_files(model_file)
        await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Hear the case' && !b.disabled)")
        for width, height in [(768, 1024), (390, 844)]:
            await page.set_viewport_size({"width": width, "height": height})
            await page.emulate_media(reduced_motion="reduce")
            await page.wait_for_timeout(200)
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            bounds = await canvas.bounding_box()
            assert bounds and bounds["height"] > 50 and bounds["width"] > 50
            await page.screenshot(path=str(out / f"chamber-{width}.png"), full_page=True)
            if width == 390:
                await hear.scroll_into_view_if_needed()
                button_bounds = await hear.bounding_box()
                assert button_bounds and 0 <= button_bounds["y"] < height
                print("CHAMBER_PHONE_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25)).decode(), flush=True)
        measurements["browser"] = browser.version
        measurements["page_errors"] = errors
        measurements["mode"] = "native Chromium; official full MaleCNS; no injected graph or activity"
        assert not errors, errors
        (out / "measurements.json").write_text(json.dumps(measurements, indent=2))
        print(json.dumps({k: v for k, v in measurements.items() if k != "graph"}, indent=2))
        await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
