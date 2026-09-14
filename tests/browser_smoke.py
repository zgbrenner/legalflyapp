"""Real Chromium + complete MaleCNS worker, with the production CSP intact."""
import json, os, pathlib, re, struct, time
from playwright.sync_api import sync_playwright, expect
OUT = pathlib.Path(os.getenv('EVIDENCE_DIR', '/tmp/village-evidence'))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.getenv('SITE_URL', 'http://127.0.0.1:4173')
with sync_playwright() as p:
    executable = os.getenv('CHROMIUM_EXECUTABLE')
    browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440,'height':1100}, accept_downloads=True, reduced_motion='reduce')
    page = context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    # Context scope includes requests made by the simulation worker.
    context.on('request', lambda r: requests.append({'url':r.url,'method':r.method,'data':r.post_data}))
    def idle(timeout=30000):
        expect(page.locator('#cancel')).to_be_hidden(timeout=timeout)
    def consulted():
        expect(page.locator('#advice')).to_be_visible(timeout=120000)
        idle(120000)
    def checkpoint(name):
        print(name + ': ' + page.locator('#status').inner_text(), flush=True)
    try:
        response=page.goto(URL)
        assert response and "script-src 'self'" in response.headers.get('content-security-policy','')
        assert 'unsafe-eval' not in response.headers.get('content-security-policy','')
        assert page.title() == 'The Village Lawyer'
        expect(page.locator('#petition-title')).to_have_text('The pig in the cabbages')
        expect(page.locator('#consult')).to_be_disabled()
        page.screenshot(path=str(OUT/'office-desktop.png'), full_page=True)
        t=time.perf_counter()
        page.locator('#load').click()
        expect(page.locator('#consult')).to_be_enabled(timeout=120000)
        load_seconds=time.perf_counter()-t
        assert '166,700 neurons' in page.locator('#load-description').inner_text()
        checkpoint('Loaded complete graph')
        page.locator('#consult').click();consulted()
        first_advice=page.locator('#advice-title').inner_text()
        assert first_advice
        page.locator('#record').click()
        expect(page.locator('#book-count')).to_have_text('1')
        expect(page.locator('#record')).to_be_disabled()
        page.screenshot(path=str(OUT/'office-advice.png'), full_page=True)
        page.locator('#teaching summary').click()
        page.locator('#lesson').select_option('4')
        page.locator('#teach').click();idle()
        expect(page.locator('#lessons')).to_have_text(re.compile(r'^49'))
        taught_advice=page.locator('#advice-title').inner_text()
        checkpoint('Consultation and teaching')
        page.locator('[data-tab="nervous-system"]').click()
        with page.expect_download() as d:
            page.locator('#export-model').click()
        model_path=OUT/'model.json'; d.value.save_as(str(model_path));idle()
        model=json.loads(model_path.read_text()); assert model['lessons']==49
        model['fingerprint']='0'*64
        bad=OUT/'bad-model.json'; bad.write_text(json.dumps(model))
        page.locator('#import-model').set_input_files(str(bad))
        expect(page.locator('#operation')).to_have_class(re.compile(r'error'),timeout=30000)
        assert 'different graph' in page.locator('#status').inner_text()
        idle()
        page.locator('#import-model').set_input_files(str(model_path))
        expect(page.locator('#status')).to_have_text(re.compile(r'^Model ready\.'),timeout=30000)
        idle()
        page.once('dialog', lambda d:d.accept());page.locator('#reset-model').click()
        expect(page.locator('#lessons')).to_have_text(re.compile(r'^48'))
        idle();checkpoint('Model import, rejection and reset')
        page.locator('#run-audit').click()
        page.wait_for_timeout(200);page.locator('#cancel').click();idle()
        assert 'Stopped' in page.locator('#status').inner_text()
        expect(page.locator('#run-audit')).to_be_enabled()
        page.locator('#run-audit').click()
        expect(page.locator('#status')).to_have_text(re.compile(r'^The held-out test is complete\.'),timeout=180000)
        expect(page.locator('#audit-rows tr')).to_have_count(4)
        expect(page.locator('#audit-rows tr').first.locator('td').nth(1)).to_have_text('20 / 24')
        page.screenshot(path=str(OUT/'nervous-system.png'),full_page=True)
        with page.expect_download() as d:
            page.locator('#export-audit').click()
        d.value.save_as(str(OUT/'browser-audit.json'))
        checkpoint('Complete browser audit')
        page.locator('[data-tab="casebook"]').click()
        expect(page.locator('.ledger-entry')).to_have_count(1)
        with page.expect_download() as d:
            page.locator('#export-book').click()
        book_path=OUT/'casebook.json';d.value.save_as(str(book_path))
        page.once('dialog',lambda d:d.accept());page.locator('#clear-book').click()
        expect(page.locator('#book-count')).to_have_text('0')
        page.locator('#import-book').set_input_files(str(book_path))
        expect(page.locator('#book-count')).to_have_text('1')
        page.screenshot(path=str(OUT/'casebook.png'),full_page=True)
        page.locator('[data-tab="office"]').click()
        page.locator('#new-petition').click()
        page.locator('#note-input').fill('<script>alert("private note")</script> The wheel broke.')
        page.locator('#issue').select_option('damage')
        page.locator('#loss').select_option('2')
        page.locator('#consult').click();consulted()
        page.locator('#record').click()
        expect(page.locator('#book-count')).to_have_text('2')
        page.locator('[data-tab="casebook"]').click()
        assert '<script>' in page.locator('.ledger-entry').nth(1).inner_text()
        checkpoint('Casebook round trip and safe custom text')
        page.set_viewport_size({'width':390,'height':844})
        page.locator('[data-tab="office"]').click()
        page.locator('.queue button').first.click()
        # A full-page screenshot grows to the scroll width if a child overflows.
        # Read its PNG header rather than using string-eval in a strict-CSP page.
        png=page.screenshot(path=str(OUT/'office-mobile.png'),full_page=True)
        assert struct.unpack('>I',png[16:20])[0]==390, 'Horizontal mobile overflow'
        page.locator('#consult').click();page.wait_for_timeout(100);page.locator('#cancel').click();idle()
        expect(page.locator('#advice')).to_be_hidden()
        expect(page.locator('#consult')).to_be_enabled()
        external=[r for r in requests if not r['url'].startswith(URL)]
        writes=[r for r in requests if r['method'] not in ('GET','HEAD') or r['data']]
        assert any('/data/weights-' in r['url'] for r in requests), 'Worker network activity was not observed'
        assert not external, external
        assert not writes, writes
        assert not errors, errors
        summary={'browser':'Chromium','browserVersion':browser.version,'browserPlugin':'Absent; Python Playwright fallback','strictCspRetained':True,'viewports':[[1440,1100],[390,844]],'loadSeconds':load_seconds,'firstAdvice':first_advice,'taughtAdvice':taught_advice,'requests':len(requests),'externalRequests':len(external),'textOrWriteRequests':len(writes),'consoleErrors':errors,'checks':['real graph load','real inference','feedback changes learned model','model export/import','invalid provenance rejection','reset','audit cancellation','full held-out browser audit','casebook export/import','custom petition','safe text rendering','mobile overflow','inference cancellation','worker network privacy']}
        (OUT/'browser-verification.json').write_text(json.dumps(summary,indent=2))
        print(json.dumps(summary,indent=2),flush=True)
    except Exception:
        try:
            page.screenshot(path=str(OUT/'failure.png'),full_page=True)
            (OUT/'failure.json').write_text(json.dumps({'status':page.locator('#status').inner_text(),'errors':errors,'requests':requests},indent=2))
        except Exception as diagnostic_error:
            print('Diagnostic capture failed: '+str(diagnostic_error),flush=True)
        raise
    finally:
        context.close();browser.close()
