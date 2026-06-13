import asyncio
from pathlib import Path

from playwright.async_api import async_playwright


APP_URL = 'https://a-ten-mauve.vercel.app/'
APP_JS_URL = 'https://a-ten-mauve.vercel.app/app.js'
REMOTE_URL = 'https://a-ten-mauve.vercel.app/remote-store.js'
EXEC_URL = 'https://script.google.com/macros/s/AKfycbySZeitDAPXKM-z5HPgS3nL0a28rDla8547j0FN296ZSzGeTy4GHVfMTCU6-Vp7Rlsy3w/exec'


async def main():
    remote_body = Path('remote-store.js').read_text(encoding='utf-8')
    probe_app = """
      (async function () {
        console.log('APP_ROUTE_EXECUTED');
        const banner = document.getElementById('syncBanner');
        try {
          const result = await Promise.race([
            VolleyballRemoteStore.loadAppState(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('LOAD_TIMEOUT')), 5000))
          ]);
          console.log('LOAD_OK', JSON.stringify(result.sync));
          if (banner) banner.textContent = result.sync.notice || (result.sync.remoteEnabled ? 'REMOTE_OK' : 'REMOTE_OFF');
        } catch (error) {
          console.error('LOAD_ERR', error && error.message ? error.message : String(error));
          if (banner) banner.textContent = error && error.message ? error.message : String(error);
        }
      }());
    """

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.on('console', lambda m: print(f'CONSOLE[{m.type}]: {m.text}'))
        page.on('pageerror', lambda e: print(f'PAGEERROR: {e}'))
        page.on('request', lambda r: print(f'REQUEST: {r.url}') if r.url.endswith('/app.js') or r.url.endswith('/remote-store.js') else None)

        async def handle_exec(route):
          response = await route.fetch()
          body = await response.text()
          body = body.replace('window.parent', 'window.top')
          await route.fulfill(status=response.status, headers=response.headers, body=body)

        async def handle_remote(route):
          print('ROUTE: remote-store.js')
          await route.fulfill(status=200, headers={'content-type': 'application/javascript; charset=utf-8'}, body=remote_body)

        async def handle_app(route):
          print('ROUTE: app.js')
          await route.fulfill(status=200, headers={'content-type': 'application/javascript; charset=utf-8'}, body=probe_app)

        await page.route(EXEC_URL, handle_exec)
        await page.route(REMOTE_URL, handle_remote)
        await page.route(APP_JS_URL, handle_app)
        await page.goto(APP_URL, wait_until='networkidle', timeout=60000)
        await page.wait_for_timeout(5000)
        banner = await page.locator('#syncBanner').inner_text()
        print({'banner': banner})
        await browser.close()


asyncio.run(main())
