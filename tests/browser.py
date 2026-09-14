"""Real Chromium end-to-end test; FULL_CNS=1 requires actual verified data."""
from __future__ import annotations
import json
import base64
import io
from PIL import Image
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'results'
FULL = os.getenv('FULL_CNS') == '1'
OUT.mkdir(exist_ok=True)
server = subprocess.Popen(['node', 'tools/serve.mjs'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env={**os.environ, 'PORT': '3017'})
base = 'http://127.0.0.1:3017'
try:
    for _ in range(80):
        try:
            with urllib.request.urlopen(base, timeout=1) as r:
                if r.status == 200:
                    break
        except OSError:
            time.sleep(.1)
    with sync_playwright() as p:
        executable = os.getenv('CHROMIUM_PATH')
        browser = p.chromium.launch(**({'executable_path': executable} if executable else {}), headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True, reduced_motion='reduce')
        page.set_default_timeout(30000)
        errors, writes, external = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def inspect(request):
            if request.method not in ('GET', 'HEAD'):
                writes.append(request.url)
            if not request.url.startswith((base, 'blob:', 'data:')):
                external.append(request.url)
        page.context.on('request', inspect)
        page.goto(base, wait_until='networkidle')
        expect(page).to_have_title('The Village Lawyer')
        expect(page.locator('.queue-item')).to_have_count(6)
        page.locator('.queue-item').nth(1).click()
        expect(page.locator('#case-title')).to_have_text('One hen short')
        page.locator('#fact-details summary').click()
        expect(page.locator('#fact-evidence')).to_have_value('record')
        page.locator('#fact-details summary').click()
        checks = {'navigation': True, 'caseSelection': True, 'fixtureFallback': False}
        if FULL:
            assert page.locator('#painting').evaluate('(img)=>img.complete && img.naturalWidth>0'), 'Actual museum artwork must load.'
            page.screenshot(path=str(OUT / 'chamber-desktop.png'), full_page=True)
            preview=Image.open(OUT/'chamber-desktop.png').convert('RGB')
            preview.thumbnail((640,680))
            image_bytes=io.BytesIO()
            preview.save(image_bytes,format='WEBP',quality=20)
            print('SCREENSHOT_WEBP_BASE64 '+base64.b64encode(image_bytes.getvalue()).decode(),flush=True)
            page.locator('#primary').click()
            expect(page.locator('#brain-state')).to_have_text('Complete MaleCNS loaded', timeout=180000)
            page.locator('#primary').click()
            expect(page.locator('#message')).to_contain_text('Apprenticeship complete', timeout=600000)
            expect(page.locator('#teaching-count')).to_have_text('64 LESSONS')
            page.locator('#primary').click()
            expect(page.locator('#advice-result')).to_be_visible(timeout=60000)
            expect(page.locator('#advice-margin')).to_contain_text('306,995,256 edge evaluations')
            first_title = page.locator('#advice-title').inner_text()
            page.locator('#keep-advice').click()
            expect(page.locator('#ledger-count')).to_have_text('1')
            page.locator('#feedback details summary').click()
            page.locator('#correction').select_option('4')
            page.locator('#correct').click()
            expect(page.locator('#message')).to_contain_text('readout has been corrected')
            page.locator('[data-nav="schoolroom"]').click()
            expect(page.locator('#model-status')).to_contain_text('1 human corrections')
            with page.expect_download() as event:
                page.locator('#export-model').click()
            model_file = OUT / 'browser-model.json'
            event.value.save_as(model_file)
            saved = json.loads(model_file.read_text())
            assert saved['corrections'] == 1 and saved['dim'] == 128
            page.locator('#train').click()
            expect(page.locator('#operation')).to_be_visible()
            page.locator('#cancel').click()
            expect(page.locator('#message')).to_contain_text('cancelled', timeout=60000)
            expect(page.locator('#model-status')).to_contain_text('1 human corrections')
            page.locator('#model-file').set_input_files(str(model_file))
            expect(page.locator('#message')).to_contain_text('Model imported')
            bad = {**saved, 'graph': '0'*64}
            page.locator('#model-file').set_input_files({'name':'foreign.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
            expect(page.locator('#message')).to_contain_text('different graph')
            expect(page.locator('#model-status')).to_contain_text('1 human corrections')
            page.locator('[data-nav="chamber"]').click()
            page.locator('#new-case').click()
            page.locator('#custom-name').fill('A synthetic visitor')
            page.locator('#custom-story').fill('A fictional goat crossed a disputed boundary.')
            page.locator('#fact-danger').select_option('grave')
            page.locator('#primary').click()
            expect(page.locator('#advice-result')).to_be_visible(timeout=60000)
            page.locator('#keep-advice').click()
            expect(page.locator('#ledger-count')).to_have_text('2')
            page.locator('[data-nav="casebook"]').click()
            expect(page.locator('.ledger-entry')).to_have_count(2)
            expect(page.locator('.ledger-entry').first).to_contain_text('A synthetic visitor')
            with page.expect_download() as event:
                page.locator('#export-ledger').click()
            ledger_file=OUT/'browser-casebook.json'
            event.value.save_as(ledger_file)
            assert len(json.loads(ledger_file.read_text())['entries']) == 2
            page.locator('[data-nav="inside"]').click()
            expect(page.locator('#activity-caption')).to_contain_text('1,536 sampled neurons')
            page.screenshot(path=str(OUT/'neural-activity.png'),full_page=True)
            page.locator('[data-nav="schoolroom"]').click()
            page.locator('#benchmark').click()
            expect(page.locator('#message')).to_contain_text('Comparison complete', timeout=600000)
            expect(page.locator('#benchmark-rows')).not_to_contain_text('Not run')
            with page.expect_download() as event:
                page.locator('#export-benchmark').click()
            comparison_file=OUT/'browser-comparison.json'
            event.value.save_as(comparison_file)
            comparison=json.loads(comparison_file.read_text())
            assert comparison['neurons']==166700 and comparison['connections']==25582938
            assert comparison['train']==64 and comparison['test']==32
            assert comparison['biological']['total']==32 and comparison['disconnected']['correct']==4
            print('BROWSER_BENCHMARK '+json.dumps(comparison),flush=True)
            checks.update({'benchmarkExport':True,'completeCNSLoad':True,'browserWorkerTraining':True,'inference':True,'firstAdvice':first_title,'feedback':True,'cancellationPreservesModel':True,'modelRoundtrip':True,'foreignModelRejected':True,'customCase':True,'casebookExport':True,'computedActivity':True,'artworkLoaded':True})
        else:
            page.locator('#primary').click()
            expect(page.locator('#message')).to_contain_text('not installed', timeout=60000)
            expect(page.locator('#advice-result')).to_be_hidden()
            checks['missingDataFailsClosed'] = True
        for width,height in [(1440,1000),(390,844)]:
            page.set_viewport_size({'width':width,'height':height})
            for view in ['chamber','schoolroom','casebook','inside']:
                page.locator(f'[data-nav="{view}"]').click()
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'{view} overflows at {width}'
            page.locator('[data-nav="chamber"]').click()
            page.screenshot(path=str(OUT/f'chamber-{width}.png'),full_page=True)
            if width==390:
                image=Image.open(OUT/f'chamber-{width}.png').convert('RGB')
                image.thumbnail((330,1000))
                encoded=io.BytesIO()
                image.save(encoded,format='WEBP',quality=25)
                print('MOBILE_SCREENSHOT_WEBP_BASE64 '+base64.b64encode(encoded.getvalue()).decode(),flush=True)
        assert not errors, errors
        assert not writes, writes
        assert not external, external
        checks.update({'desktopAndMobileOverflow':False,'javascriptErrors':errors,'outgoingWrites':writes,'externalRequests':external,'fullGraphRun':FULL,'browser':browser.version})
        (OUT/'browser-verification.json').write_text(json.dumps(checks,indent=2)+'\n')
        print('BROWSER_VERIFICATION '+json.dumps(checks))
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
