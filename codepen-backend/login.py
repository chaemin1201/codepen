import asyncio
import os
from playwright.async_api import async_playwright

# [FIX-SECRET] 실제 CodePen 세션 쿠키 값이 소스코드에 그대로 하드코딩되어 있었음.
# git 이력에 한 번이라도 커밋되면 이후 삭제해도 계속 남아있고, 저장소를 볼 수 있는
# 사람 누구나 해당 계정으로 로그인할 수 있게 됨 -> 반드시 해당 cp_session 값은
# CodePen 쪽에서 폐기(로그아웃/비밀번호 변경 등으로 세션 무효화)하고,
# 아래처럼 환경변수로 주입받도록 변경. (.env, .gitignore 처리 필수)
CP_SESSION = os.environ["CP_SESSION"]

async def main():
    p = await async_playwright().__aenter__()
    browser = await p.chromium.launch(headless=False, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = await browser.new_context()
    await ctx.add_cookies([{
        "name": "cp_session",
        "value": CP_SESSION,
        "domain": "codepen.io",
        "path": "/",
        "httpOnly": True,
        "secure": True,
        "sameSite": "None",
    }])
    page = await ctx.new_page()
    await page.goto("https://codepen.io", timeout=60000)
    await page.wait_for_timeout(5000)
    logged_in = await page.locator("a[data-test-id='login-button']").is_hidden()
    print(f"Logged in: {logged_in}")
    if logged_in:
        await ctx.storage_state(path="playwright/.auth/state.json")
        print("state.json saved!")
    else:
        print("Login failed")
    await browser.close()

asyncio.run(main())
