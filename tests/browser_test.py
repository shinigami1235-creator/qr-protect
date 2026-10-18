# Loads the app in a phone-sized Chromium, scans pictures, pasted text and a fake camera.
import http.server, threading, functools, os, sys
from playwright.sync_api import sync_playwright
root = os.path.abspath('.')
shots = sys.argv[1]
os.makedirs(shots, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
H.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=[
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture=' + root + '/tests/fixtures/camera.y4m'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://127.0.0.1:8765')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto('http://127.0.0.1:8765/')
    page.wait_for_timeout(500)
    page.screenshot(path=shots + '/01-home.png')

    # Picture of a fake GCash code
    page.set_input_files('#filePick', 'tests/fixtures/fake-gcash.png')
    page.wait_for_selector('#sheet:not([hidden])', timeout=8000); page.wait_for_timeout(400)
    check('Don' in page.inner_text('#rTitle'), 'fake GCash picture shows a danger title: ' + page.inner_text('#rTitle'))
    check(page.inner_text('#rReg') == 'gcash-payments.com', 'site shown as gcash-payments.com')
    page.screenshot(path=shots + '/02-fake-gcash.png')
    page.click('text=Open anyway')
    page.wait_for_timeout(200)
    check(page.is_visible('#confirmBox'), 'Open anyway asks first')
    page.screenshot(path=shots + '/03-confirm.png')
    page.click('#confirmNo')
    page.click('#againBtn')

    # QR Ph payment picture
    page.set_input_files('#filePick', 'tests/fixtures/qrph.png')
    page.wait_for_selector('#sheet:not([hidden])', timeout=8000); page.wait_for_timeout(400)
    check('RICO SANTOS' in page.inner_text('#rDetails'), 'payment shows receiver name')
    check('GCash' in page.inner_text('#rDetails'), 'payment shows GCash as the wallet')
    page.screenshot(path=shots + '/04-qrph.png')
    page.click('#againBtn')

    # Two codes in one picture
    page.set_input_files('#filePick', 'tests/fixtures/two-codes.jpg')
    page.wait_for_selector('#sheet:not([hidden])', timeout=8000); page.wait_for_timeout(400)
    many = page.is_visible('#rMany')
    check(page.locator('#rMany button').count() == 2, 'two codes found in one picture')
    check(page.inner_text('#rReg') == 'gcash-payments.com', 'riskier code shown first')
    print('INFO two-code picture listed', page.locator('#rMany button').count(), 'codes (BarcodeDetector finds both, jsQR finds one)')
    page.screenshot(path=shots + '/05-two-codes.png')
    page.click('#againBtn')

    # Pasted text
    page.fill('#textIn', 'tel:*21*09171234567#')
    page.click('text=Check')
    page.wait_for_selector('#sheet:not([hidden])'); page.wait_for_timeout(400)
    check("dial" in page.inner_text('#rTitle'), 'call-forward code blocked: ' + page.inner_text('#rTitle'))
    page.click('#againBtn')
    page.fill('#textIn', 'https://www.bdo.com.ph/personal')
    page.click('text=Check')
    page.wait_for_selector('#sheet:not([hidden])'); page.wait_for_timeout(400)
    check(page.inner_text('#rTitle') == 'Official site', 'real BDO site clear')
    page.screenshot(path=shots + '/06-official.png')
    page.click('#againBtn')

    # No code in picture
    page.set_input_files('#filePick', 'icons/icon-512.png')
    page.wait_for_timeout(1500)
    check(page.is_hidden('#sheet'), 'picture without a code leaves the sheet closed')

    # Camera
    page.click('#startCam')
    page.wait_for_selector('#sheet:not([hidden])', timeout=10000); page.wait_for_timeout(400)
    check(page.inner_text('#rReg') == 'gcash-payments.com', 'camera scan found the fake GCash code')
    page.screenshot(path=shots + '/07-camera.png')
    page.click('#againBtn')
    page.wait_for_timeout(300)
    page.screenshot(path=shots + '/08-history.png', full_page=True)
    check(page.locator('#historyList li').count() >= 4, 'recent scans listed')

    # Service worker and manifest
    page.reload(); page.wait_for_timeout(1500)
    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))")
    check(sw, 'service worker active')
    mf = page.evaluate("fetch('manifest.webmanifest').then(r => r.json()).then(j => j.share_target.action)")
    check(mf == './share', 'manifest share target')
    check(not errors, 'no console errors ' + str(errors))
    b.close()
srv.shutdown()
print('FAILED: ' + str(len(fails)) if fails else 'all passed')
