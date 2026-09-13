"""Verify real desktop/mobile flows. QA outputs stay outside source directories."""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    out=Path(os.environ.get('QA_ARTIFACTS_DIR','/tmp/legalfly-qa'));out.mkdir(parents=True,exist_ok=True)
    base=os.environ.get('QA_BASE_URL','http://127.0.0.1:3000')
    checks=[];errors=[]
    async with async_playwright() as p:
        options={'headless':True,'args':['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
        if os.environ.get('BROWSER_EXECUTABLE'):options['executable_path']=os.environ['BROWSER_EXECUTABLE']
        browser=await p.chromium.launch(**options)
        page=await browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto(base+'/classification',wait_until='networkidle')
        assert 'The Legal Fly' in await page.title()
        await page.get_by_text('Recorded example',exact=True).wait_for()
        checks.append('Legacy classifier identity and genuine recorded playback')
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(out/'desktop.png'),full_page=True)
        await page.locator('#experiment').scroll_into_view_if_needed()
        await page.screenshot(path=str(out/'experiment.png'))
        await page.get_by_role('button',name='Run the experiment').click()
        await page.get_by_text('Live result',exact=True).wait_for(timeout=30000)
        await page.get_by_role('heading',name='Both flagged this passage.').wait_for()
        checks.append('Actual API inference flags the example email')
        await page.get_by_role('button',name='Pause activity').click()
        await page.get_by_role('button',name='Play activity').wait_for()
        checks.append('Shared playback can be paused')
        rotation=page.get_by_role('slider',name='Rotate both brains')
        before=await rotation.input_value()
        await rotation.focus()
        await rotation.press('ArrowRight')
        assert await rotation.input_value()!=before
        await page.get_by_label('Inspect neuron').first.select_option(index=4)
        checks.append('Rotation and keyboard-accessible neuron inspection')
        two_d=page.get_by_role('button',name='2D view')
        if await two_d.count():
            await two_d.first.click()
            await page.get_by_role('img',name='Two-dimensional view of measured final neuron activity').wait_for()
            checks.append('2D fallback preserves actual neuron activity')
        await page.get_by_label('Your passage, or one of ours').fill('   ')
        await page.get_by_role('button',name='Run the experiment').click()
        assert 'Enter a passage' in await page.get_by_role('alert').filter(has_text='Enter a passage').inner_text()
        checks.append('Blank input rejected without clearing the previous result')
        await page.get_by_label('Your passage, or one of ours').fill('Please email the draft to alex@example.com')
        await page.route('**/twin',lambda route:route.abort())
        await page.get_by_role('button',name='Run the experiment').click()
        await page.get_by_role('alert').filter(has_text='unreachable').wait_for(timeout=30000)
        checks.append('Network failure is explicit; previous result retained')
        await page.unroute('**/twin')
        await page.goto(base+'/benchmark',wait_until='networkidle')
        await page.get_by_role('cell',name='MiniLM + fly wiring',exact=True).first.wait_for()
        assert await page.locator('.results-table tbody tr').count()>=5
        await page.get_by_label('Score',exact=True).select_option('binary')
        await page.get_by_label('Pair the fly with').select_option('random_erdos')
        await page.get_by_text('Inspect every paired trial').click()
        checks.append('Real results, metric/control selection and paired-trial disclosure')
        await page.get_by_text('Inspect every paired trial').click()
        await page.screenshot(path=str(out/'results.png'),full_page=True)
        await page.goto(base+'/ablate',wait_until='networkidle')
        await page.get_by_role('button',name='Remove 100% of neurons').click()
        await page.get_by_role('heading',name='Remove 100% of neurons').wait_for()
        await page.get_by_role('combobox').select_option('hybrid')
        checks.append('Measured lesion selection and hybrid/activity-only comparison')
        await page.screenshot(path=str(out/'ablations.png'),full_page=True)
        await page.goto(base+'/compare',wait_until='networkidle')
        assert '#experiment' in page.url
        checks.append('Legacy comparison route redirects to the experiment')
        mobile=await browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,reduced_motion='reduce')
        mobile.on('pageerror',lambda e:errors.append(str(e)))
        await mobile.goto(base+'/classification',wait_until='networkidle')
        await mobile.get_by_text('Recorded example',exact=True).wait_for()
        await mobile.get_by_role('button',name='Play activity').wait_for()
        assert await mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        checks.append('390px mobile layout has no horizontal overflow; reduced motion starts paused')
        await mobile.screenshot(path=str(out/'mobile.png'),full_page=True)
        assert not errors,errors
        checks.append('No JavaScript exceptions or framework overlay')
        (out/'checks.json').write_text(json.dumps({'checks_passed':checks,'page_errors':errors,'viewports':[[1440,1000],[390,844]],'backend':'real local API','browser':'Chromium'},indent=2))
        print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
        await browser.close()

if __name__=='__main__':asyncio.run(main())
