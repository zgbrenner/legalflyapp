"""Verify the Legal Dreaming hero, scroll cue, responsive layout, and decorative-icon rules."""
import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    out = Path(os.environ.get("QA_ARTIFACTS_DIR", "/tmp/legalfly-qa"))
    out.mkdir(parents=True, exist_ok=True)
    base = os.environ.get("QA_BASE_URL", "http://127.0.0.1:3000")
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
        page = await context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(base, wait_until="networkidle")
        await page.get_by_role("heading", name="Can a fruit fly retain legal concepts after the text is gone?", exact=True).wait_for()
        assert await page.locator(".fly-head-hero").count() == 1
        assert await page.locator(".fly-head-brain").count() == 1
        scroll = page.get_by_role("link", name="Scroll to test the experiment", exact=True)
        assert await scroll.get_attribute("href") == "#dream-lab"
        body = await page.locator("body").inner_text()
        assert "↗" not in body and "↘" not in body
        await page.screenshot(path=str(out / "hero-desktop.png"), full_page=False)
        await scroll.click()
        await page.wait_for_timeout(350)
        top = await page.locator("#dream-lab").evaluate("el => Math.abs(el.getBoundingClientRect().top)")
        assert top < 180
        assert not errors, errors
        await context.close()

        mobile = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, reduced_motion="reduce")
        page = await mobile.new_page()
        await page.goto(base, wait_until="networkidle")
        await page.get_by_role("heading", name="Can a fruit fly retain legal concepts after the text is gone?", exact=True).wait_for()
        assert await page.locator(".fly-head-hero.is-still").count() == 1
        await page.screenshot(path=str(out / "hero-mobile.png"), full_page=False)
        await mobile.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
