import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


async def main():
    async with Stealth().use_async(async_playwright()) as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(storage_state="playwright/.auth/state.json")
        page = await context.new_page()
        await page.goto("https://codepen.io/")
        input()
        await context.storage_state(path="playwright/.auth/state.json")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
