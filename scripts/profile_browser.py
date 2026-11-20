"""Reproducible rendering/process measurements against the development game."""
import json,time
from pathlib import Path
import psutil
from playwright.sync_api import sync_playwright
out={}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-precise-memory-info'])
    cdp=browser.new_browser_cdp_session()
    page=browser.new_page(viewport={'width':1200,'height':800})
    def memory():
        rows=[]
        for item in cdp.send('SystemInfo.getProcessInfo')['processInfo']:
            try:
                info=psutil.Process(int(item['id'])).memory_info()
                rows.append({'type':item['type'],'rss':info.rss,'private':getattr(info,'private',0)})
            except psutil.Error:pass
        return {'rss':sum(r['rss'] for r in rows),'private':sum(r['private'] for r in rows),'processes':rows}
    page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle');out['idleMemory']=memory()
    page.get_by_role('button',name='Open Drift Break',exact=True).click();page.get_by_role('button',name='Start Drive',exact=True).click();page.get_by_role('button',name='Choose circuit',exact=True).click();page.get_by_role('button',name='Head to the start',exact=True).click()
    out['gpu']=page.evaluate('''()=>{const gl=window.__drift.renderer.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):'unavailable'};}''')
    for label,mode,w,h,quality in [('sidebar','sidebar',300,600,'auto'),('editor','editor',1200,800,'auto'),('maximized','maximized',1600,1000,'auto'),('editorLow','editor',1200,800,'low')]:
        page.evaluate('window.__drift.pause()');page.set_viewport_size({'width':w,'height':h})
        page.evaluate('''args=>{const g=window.__drift;g.state.settings.quality=args.quality;g.receive({type:'mode',mode:args.mode});}''',{'mode':mode,'quality':quality})
        page.mouse.move(w/2,h/2);page.evaluate('window.__drift.start()')
        page.wait_for_timeout(8000)
        start=page.evaluate('({frames:window.__drift.loop.frames,updates:window.__drift.loop.updates,now:performance.now()})')
        page.wait_for_timeout(2500)
        end=page.evaluate('({frames:window.__drift.loop.frames,updates:window.__drift.loop.updates,now:performance.now()})')
        seconds=(end['now']-start['now'])/1000
        out[label]={'fps':(end['frames']-start['frames'])/seconds,'simulationHz':(end['updates']-start['updates'])/seconds,'diagnostics':page.evaluate('window.__drift.diagnostics()'),'memory':memory()}
    page.evaluate('window.__drift.receive({type:"visibility",visible:false})');before=page.evaluate('window.__drift.loop.updates');page.wait_for_timeout(1000)
    out['hidden']={'canvases':page.locator('canvas').count(),'updatesInOneSecond':page.evaluate('window.__drift.loop.updates')-before,'memory':memory()}
    browser.close()
Path('test-results/profile.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps({k:{'fps':v['fps'],'simulationHz':v['simulationHz'],'privateMiB':v['memory']['private']/1048576} for k,v in out.items() if isinstance(v,dict)and'fps'in v},indent=2))
print(out['gpu'])
