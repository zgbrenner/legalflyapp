"""Real Chromium + complete MaleCNS worker. No browser mocks or synthetic graph."""
import json, os, pathlib, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(os.getenv('EVIDENCE_DIR', '/mnt/data/village-evidence'))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.getenv('SITE_URL', 'http://127.0.0.1:4173')
with sync_playwright() as p:
    executable = os.getenv('CHROMIUM_EXECUTABLE')
    if not executable and pathlib.Path('/usr/bin/chromium').exists():
        executable = '/usr/bin/chromium'
    browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440,'height':1100}, accept_downloads=True, reduced_motion='reduce')
    page = context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('request', lambda r: requests.append({'url':r.url,'method':r.method,'data':r.post_data}))
    page.goto(URL)
    assert page.title() == 'The Village Lawyer'
    assert page.locator('#petition-title').inner_text() == 'The pig in the cabbages'
    assert page.locator('#consult').is_disabled()
    page.screenshot(path=str(OUT/'office-desktop.png'), full_page=True)
    t=time.perf_counter()
    page.locator('#load').click()
    page.wait_for_function("document.querySelector('#consult').disabled === false", timeout=120000)
    load_seconds=time.perf_counter()-t
    assert '166,700 neurons' in page.locator('#load-description').inner_text()
    page.locator('#consult').click()
    page.wait_for_function("!document.querySelector('#advice').hidden && document.querySelector('#cancel').hidden", timeout=120000)
    assert page.locator('#advice-title').inner_text()
    first_advice=page.locator('#advice-title').inner_text()
    page.locator('#record').click()
    assert page.locator('#book-count').inner_text() == '1'
    assert page.locator('#record').is_disabled()
    page.screenshot(path=str(OUT/'office-advice.png'), full_page=True)
    page.locator('#teaching summary').click()
    page.locator('#lesson').select_option('4')
    page.locator('#teach').click()
    page.wait_for_function("document.querySelector('#cancel').hidden", timeout=30000)
    assert '49' in page.locator('#lessons').inner_text()
    taught_advice=page.locator('#advice-title').inner_text()
    page.locator('[data-tab="nervous-system"]').click()
    with page.expect_download() as d:
        page.locator('#export-model').click()
    model_path=OUT/'model.json'; d.value.save_as(str(model_path))
    model=json.loads(model_path.read_text()); assert model['lessons']==49
    model['fingerprint']='0'*64
    bad=OUT/'bad-model.json'; bad.write_text(json.dumps(model))
    page.locator('#import-model').set_input_files(str(bad))
    page.wait_for_function("document.querySelector('#operation').classList.contains('error')",timeout=30000)
    assert 'different graph' in page.locator('#status').inner_text()
    page.locator('#import-model').set_input_files(str(model_path))
    page.wait_for_function("document.querySelector('#status').textContent.startsWith('Model ready.')",timeout=30000)
    page.once('dialog', lambda d:d.accept());page.locator('#reset-model').click()
    page.wait_for_function("document.querySelector('#lessons').textContent.startsWith('48')")
    page.locator('#run-audit').click()
    page.wait_for_timeout(200);page.locator('#cancel').click()
    page.wait_for_function("document.querySelector('#cancel').hidden",timeout=30000)
    assert 'Stopped' in page.locator('#status').inner_text()
    assert page.locator('#run-audit').is_enabled()
    page.locator('#run-audit').click()
    page.wait_for_function("document.querySelector('#status').textContent.startsWith('The held-out test is complete.')",timeout=180000)
    assert page.locator('#audit-rows tr').count()==4
    assert page.locator('#audit-rows tr').first.locator('td').nth(1).inner_text()=='20 / 24'
    page.screenshot(path=str(OUT/'nervous-system.png'),full_page=True)
    with page.expect_download() as d:
        page.locator('#export-audit').click()
    d.value.save_as(str(OUT/'browser-audit.json'))
    page.locator('[data-tab="casebook"]').click()
    assert page.locator('.ledger-entry').count()==1
    with page.expect_download() as d:
        page.locator('#export-book').click()
    book_path=OUT/'casebook.json';d.value.save_as(str(book_path))
    page.once('dialog',lambda d:d.accept());page.locator('#clear-book').click()
    assert page.locator('#book-count').inner_text()=='0'
    page.locator('#import-book').set_input_files(str(book_path))
    page.wait_for_function("document.querySelector('#book-count').textContent === '1'")
    page.screenshot(path=str(OUT/'casebook.png'),full_page=True)
    page.locator('[data-tab="office"]').click()
    page.locator('#new-petition').click()
    page.locator('#note-input').fill('<script>alert("private note")</script> The wheel broke.')
    page.locator('#issue').select_option('damage')
    page.locator('#loss').select_option('2')
    page.locator('#consult').click()
    page.wait_for_function("!document.querySelector('#advice').hidden && document.querySelector('#cancel').hidden",timeout=120000)
    page.locator('#record').click();assert page.locator('#book-count').inner_text()=='2'
    page.locator('[data-tab="casebook"]').click()
    assert '<script>' in page.locator('.ledger-entry').nth(1).inner_text()
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-tab="office"]').click()
    page.locator('.queue button').first.click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT/'office-mobile.png'),full_page=True)
    page.locator('#consult').click();page.wait_for_timeout(100);page.locator('#cancel').click()
    page.wait_for_function("document.querySelector('#cancel').hidden",timeout=30000)
    assert page.locator('#advice').is_hidden()
    assert page.locator('#consult').is_enabled()
    external=[r for r in requests if not r['url'].startswith(URL)]
    writes=[r for r in requests if r['method'] not in ('GET','HEAD') or r['data']]
    assert not external, external
    assert not writes, writes
    assert not errors, errors
    summary={'browser':'Chromium','browserPlugin':'Absent; Python Playwright fallback','viewports':[[1440,1100],[390,844]],'loadSeconds':load_seconds,'firstAdvice':first_advice,'taughtAdvice':taught_advice,'requests':len(requests),'externalRequests':len(external),'textOrWriteRequests':len(writes),'consoleErrors':errors,'checks':['real graph load','real inference','feedback changes learned model','model export/import','invalid provenance rejection','reset','audit cancellation','full held-out browser audit','casebook export/import','custom petition','safe text rendering','mobile overflow','inference cancellation']}
    (OUT/'browser-verification.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps(summary,indent=2),flush=True)
    context.close();browser.close()
