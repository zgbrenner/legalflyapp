"""Exercise the current chamber in CI without substituting a fixture connectome."""
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright


async def main():
    out = Path(os.environ.get("QA_ARTIFACTS_DIR", "/tmp/legalfly-qa"))
    out.mkdir(parents=True, exist_ok=True)
    base = os.environ.get("QA_BASE_URL", "http://127.0.0.1:3000")
    checks, errors = [], []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base, wait_until="networkidle")
        assert "The Legal Fly" in await page.title()
        await page.get_by_role("heading", name="The Legal Fly").wait_for()
        checks.append("Current village chamber renders")

        alert = page.get_by_role("alert").filter(has_text="MaleCNS")
        await alert.wait_for(timeout=10_000)
        assert "MaleCNS" in await alert.inner_text()
        assert await page.get_by_role("button", name="Teach the ledger").is_disabled()
        checks.append("Missing full graph fails closed and disables teaching")

        await page.get_by_role("region", name="Brain visualization and controls").wait_for()
        await page.get_by_text("Counsel's nervous system", exact=True).wait_for()
        checks.append("Neural inspection remains accessible")

        await page.get_by_role("button", name="Write a custom petition", exact=False).click()
        await page.get_by_label("Petition narrative").fill("A goat has eaten the cabbages.")
        assert await page.get_by_label("Petition narrative").input_value() == "A goat has eaten the cabbages."
        checks.append("Custom petition remains editable without a graph")
        await page.screenshot(path=str(out / "legalfly-desktop.png"), full_page=True)

        mobile = await browser.new_page(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            reduced_motion="reduce",
        )
        mobile.on("pageerror", lambda error: errors.append(str(error)))
        await mobile.goto(base, wait_until="networkidle")
        await mobile.get_by_role("heading", name="The Legal Fly").wait_for()
        assert await mobile.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        checks.append("Narrow reduced-motion layout has no horizontal overflow")
        await mobile.screenshot(path=str(out / "legalfly-mobile.png"), full_page=True)

        assert not errors, errors
        (out / "legalfly-checks.json").write_text(json.dumps({
            "checks": checks,
            "page_errors": errors,
            "mode": "full MaleCNS intentionally absent; fail-closed interface only",
            "viewports": [[1440, 1000], [390, 844]],
        }, indent=2))
        print(json.dumps({"passed": len(checks), "checks": checks}, indent=2))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
