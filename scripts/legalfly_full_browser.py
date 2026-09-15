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
        launch_options = {"headless": True, "args": ["--no-sandbox"]}
        if os.environ.get("BROWSER_EXECUTABLE"):
            launch_options["executable_path"] = os.environ["BROWSER_EXECUTABLE"]
        browser = await playwright.chromium.launch(**launch_options)
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
        await page.screenshot(path=str(out / "desktop-idle.png"), full_page=True, caret="initial")
        # Small browser-produced previews in logs allow review through text-only
        # CI connectors. Full-resolution evidence remains in the private artifact.
        print("CHAMBER_DESKTOP_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25, caret="initial")).decode(), flush=True)
        started = time.monotonic()
        await teach.click()
        hear = page.get_by_role("button", name="Hear the case", exact=True).first
        confirm = page.get_by_role("button", name="Confirm these eight facts", exact=True)
        await confirm.wait_for(timeout=300_000)
        measurements["teaching_seconds"] = time.monotonic() - started
        await page.get_by_role("complementary", name="Petitioner docket").get_by_role("button").nth(1).click()
        await confirm.click()
        await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Hear the case' && !b.disabled)")
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
        await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Teach the ledger' && !b.disabled)")
        await page.locator('input[type="file"]').nth(0).set_input_files(model_file)
        await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Hear the case' && !b.disabled)")
        responsive = {}
        viewports = [(1440, 1000), (1101, 900), (1100, 900), (1024, 900), (721, 900), (720, 900), (390, 844), (320, 740)]
        for width, height in viewports:
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
            bounds = await canvas.bounding_box()
            assert bounds and bounds["height"] > 50 and bounds["width"] > 50
            responsive[str(width)] = {
                "document": document_size,
                "petition": petition_bounds,
                "docket": docket_bounds,
                "primary_controls": primary_controls,
            }
            await page.screenshot(path=str(out / f"chamber-{width}.png"), full_page=True, caret="initial")
            if width == 390:
                await hear.scroll_into_view_if_needed()
                button_bounds = await hear.bounding_box()
                assert button_bounds and 0 <= button_bounds["y"] < height
                print("CHAMBER_PHONE_JPEG=" + base64.b64encode(await page.screenshot(type="jpeg", quality=25, caret="initial")).decode(), flush=True)
        measurements["responsive"] = responsive
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
