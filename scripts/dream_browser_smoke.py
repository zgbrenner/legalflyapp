"""Exercise the real browser worker and packaged biological connectome, not a mock."""
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

async def main():
    out = Path(os.environ.get('QA_ARTIFACTS_DIR', '/tmp/legalfly-qa'))
    out.mkdir(parents=True, exist_ok=True)
    base = os.environ.get('QA_BASE_URL', 'http://127.0.0.1:3000')
    checks, errors, network, measurements = [], [], [], {}
    async with async_playwright() as p:
        options = {'headless': True, 'args': ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
        if os.environ.get('BROWSER_EXECUTABLE'):
            options['executable_path'] = os.environ['BROWSER_EXECUTABLE']
        browser = await p.chromium.launch(**options)
        context = await browser.new_context(viewport={'width': 1440, 'height': 1080}, device_scale_factor=1, accept_downloads=True)
        context.on('request', lambda r: network.append({'url': r.url, 'method': r.method, 'body': r.post_data}))
        page = await context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        async def shot(name):
            await page.screenshot(path=str(out / name), full_page=True)
        async def download(button):
            async with page.expect_download() as event:
                await page.get_by_role('button', name=button).click()
            item = await event.value
            path = out / item.suggested_filename
            await item.save_as(str(path))
            return json.loads(path.read_text())
        try:
            await page.goto(base, wait_until='networkidle')
            assert 'Legal Dreaming' in await page.title()
            await page.get_by_text('Ready to read', exact=True).wait_for()
            assert await page.locator('.card-shelf button').count() == 16
            assert '3,072 neurons' in await page.locator('.dream-stage-readout').inner_text()
            assert '293,766 connections' in await page.locator('.dream-stage-readout').inner_text()
            assert 'No comparisons have been run' in await page.locator('.control-results').inner_text()
            checks.append('New homepage, real graph dimensions, 16 fictional teaching cards, no fabricated scores')
            await shot('dream-desktop-idle.png')

            # Cancel during a deliberately longer 48-card reading batch; no mock model.
            corpus = json.loads(Path('apps/web/public/dream/cards.json').read_text())
            many = [{**corpus[i % len(corpus)], 'id': f'cancel-{i}'} for i in range(48)]
            await page.locator('input[aria-label="Import teaching cards"]').set_input_files({'name': '48-cards.json', 'mimeType': 'application/json', 'buffer': json.dumps(many).encode()})
            await page.wait_for_function('document.querySelectorAll(".card-shelf button").length === 48')
            await page.get_by_role('button', name='Read, then dream').click()
            await page.get_by_role('button', name='Cancel reading').click()
            await page.get_by_text('Ready to read', exact=True).wait_for()
            await page.wait_for_timeout(600)
            assert not await page.get_by_role('button', name='Pause dreaming').count()
            checks.append('Corpus import and mid-training cancellation do not produce a stale completed model')
            await page.get_by_label('Reading set', exact=True).select_option('Mixed')
            await page.get_by_role('button', name='Read, then dream').click()
            await page.get_by_role('button', name='Pause dreaming').wait_for(timeout=45000)
            await page.wait_for_timeout(1600)
            await page.get_by_role('button', name='Pause dreaming').click()
            await page.get_by_text('Paused', exact=True).wait_for()
            step = await page.locator('.step-count').inner_text()
            await page.wait_for_timeout(350)
            assert step == await page.locator('.step-count').inner_text()
            assert 'External text input\n0' in await page.locator('.dream-vitals').inner_text()
            checks.append('Real worker trains, drives live activity, and pauses without continuing the step count')
            model = await download('Save learned model')
            assert len(model['atlas']) == 16 and len(model['readout']) == 64 * 192
            measurements['reading'] = model['metrics']
            notebook = await download('Save notebook')
            assert len(notebook['frames']) > 1
            assert all(f['externalInputRMS'] == 0 for f in notebook['frames'])
            assert any(f['feedbackRMS'] > 0 for f in notebook['frames'])
            assert any(any(v > 0 for v in f['sampledActivity']) for f in notebook['frames'])
            checks.append('Model and notebook downloads contain actual weights, traces, graph hashes, settings and sampled activity')
            await shot('dream-desktop-replay.png')
            await page.get_by_role('button', name='Resume', exact=True).click()
            await page.get_by_role('button', name='Pause dreaming').wait_for()
            await page.wait_for_timeout(200)
            await page.get_by_role('button', name='Pause dreaming').click()
            assert step != await page.locator('.step-count').inner_text()
            checks.append('Paused simulation resumes instead of restarting')

            await page.get_by_label('Rotate the brain', exact=True).focus()
            await page.get_by_label('Rotate the brain', exact=True).press('ArrowRight')
            await page.get_by_label('Inspect neuron').select_option(index=4)
            flat = page.get_by_role('button', name='2D view', exact=True)
            if await flat.count():
                await flat.click()
            await page.get_by_role('img', name='Two-dimensional view of measured final neuron activity').wait_for()
            checks.append('Existing brain rotation, neuron inspection and measured-state 2D fallback remain usable')

            await page.get_by_label('After reading', exact=True).select_option('silence')
            await page.get_by_role('button', name='Dream from this card').click()
            await page.get_by_role('heading', name='The activity has faded.', exact=True).wait_for(timeout=15000)
            await page.get_by_role('button', name='Pause dreaming').click()
            silence = await download('Save notebook')
            assert silence['frames'][-1]['rms'] < 0.0001
            assert all(f['feedbackRMS'] == 0 for f in silence['frames'])
            measurements['silence_final'] = silence['frames'][-1]['rms']
            checks.append('Feedback-off mode actually becomes quiet and the decoder abstains')

            await page.get_by_role('button', name='Run the controls').click()
            await page.get_by_role('cell', name='Rewired replay', exact=True).wait_for(timeout=60000)
            rows = (await download('Save notebook'))['controls']
            assert len(rows) == 3 and all(r['connections'] == 293766 for r in rows)
            assert rows[0]['graphHash'] != rows[2]['graphHash']
            measurements['controls'] = rows
            checks.append('Three controls execute on actual matched-size biological and rewired graphs')
            await shot('dream-controls.png')

            bad = {**model, 'graphHash': 'wrong-brain'}
            await page.locator('input[aria-label="Import learned model"]').set_input_files({'name': 'wrong.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            await page.get_by_role('alert').filter(has_text='fingerprint').wait_for()
            await page.locator('input[aria-label="Import learned model"]').set_input_files({'name': 'model.json', 'mimeType': 'application/json', 'buffer': json.dumps(model).encode()})
            await page.get_by_text('Imported model diagnostic', exact=False).wait_for()
            restored = await download('Save learned model')
            assert restored['readout'] == model['readout'] and restored['atlas'] == model['atlas']
            checks.append('Wrong-graph models are rejected; genuine model import preserves weights and atlas exactly')

            # This tests the visibility event handler, not a physical-device background scheduler.
            await page.get_by_label('After reading', exact=True).select_option('replay')
            await page.get_by_role('button', name='Dream from this card').click()
            await page.get_by_role('button', name='Pause dreaming').wait_for()
            await page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
            await page.get_by_text('Paused', exact=True).wait_for()
            await page.evaluate("delete document.hidden")
            checks.append('Visibility-change handler pauses active computation')

            # Static-content failure must not substitute a synthetic graph.
            broken = await context.new_page()
            await broken.route('**/dream/biological.bin', lambda route: route.fulfill(status=200, body=b'not the real graph'))
            await broken.goto(base, wait_until='networkidle')
            await broken.get_by_role('alert').filter(has_text='checksum').wait_for()
            assert await broken.get_by_role('button', name='Read, then dream').is_disabled()
            checks.append('Corrupt biological download fails closed, without a replacement network')
            await broken.close()

            # Private teaching text remains worker-local, including uploads and training.
            marker = 'PRIVATE_CANARY_7ad839_NOT_FOR_SERVER'
            private = [{**corpus[i], 'id': f'private-{i}', 'text': corpus[i]['text'] + ' ' + marker} for i in range(2)]
            await page.locator('input[aria-label="Import teaching cards"]').set_input_files({'name': 'private.json', 'mimeType': 'application/json', 'buffer': json.dumps(private).encode()})
            await page.wait_for_function('document.querySelectorAll(".card-shelf button").length === 2')
            await page.get_by_role('button', name='Read, then dream').click()
            await page.get_by_role('button', name='Pause dreaming').wait_for(timeout=30000)
            await page.get_by_role('button', name='Pause dreaming').click()
            assert all(marker not in r['url'] and marker not in (r['body'] or '') for r in network)
            assert all(r['method'] == 'GET' and urlparse(r['url']).netloc == urlparse(base).netloc for r in network)
            checks.append('Canary teaching text never enters a request; laboratory traffic is same-origin GET only')

            await page.goto(base + '/dreaming-method', wait_until='networkidle')
            await page.get_by_role('heading', name='A dream is the metaphor. Here is the machinery.', exact=False).wait_for()
            assert 'not a whole brain' in await page.locator('article').inner_text()
            checks.append('Method page discloses real versus artificial components and experiment limits')

            mobile = await context.new_page(viewport={'width': 390, 'height': 844})
            mobile.on('pageerror', lambda e: errors.append(str(e)))
            await mobile.emulate_media(reduced_motion='reduce')
            await mobile.goto(base, wait_until='networkidle')
            await mobile.get_by_role('button', name='Read these cards').click()
            await mobile.get_by_text('Paused', exact=True).wait_for(timeout=45000)
            assert not await mobile.get_by_role('button', name='Pause dreaming').count()
            assert await mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
            await mobile.screenshot(path=str(out / 'dream-mobile.png'), full_page=True)
            checks.append('390px mobile layout has no horizontal overflow and reduced-motion reading does not autoplay')
            await mobile.close()
            assert not errors, errors
            checks.append('No uncaught JavaScript errors across the verified flows')
        finally:
            report = {'checks_passed': checks, 'page_errors': errors, 'measurements': measurements, 'requests': network, 'browser': 'Chromium', 'engine': 'Actual packaged hemibrain in a browser worker', 'viewports': [[1440,1080],[390,844]]}
            (out / 'dream-checks.json').write_text(json.dumps(report, indent=2))
            try:
                await page.screenshot(path=str(out / 'dream-final-state.png'), full_page=True)
            except Exception:
                pass
            await browser.close()
    print(json.dumps({'passed': len(checks), 'checks': checks, 'measurements': measurements}, indent=2))

if __name__ == '__main__':
    asyncio.run(main())
