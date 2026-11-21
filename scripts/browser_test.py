"""Run against `npm run dev`. Development-only probes do not ship in production."""
import json,os,time
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

OUT=Path('test-results'); OUT.mkdir(exist_ok=True)
SHOTS=Path(os.environ.get('DRIFT_TEST_SCREENSHOTS','test-results/browser')); SHOTS.mkdir(parents=True,exist_ok=True)
metrics={}; errors=[]; external=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--enable-precise-memory-info'])
    url = os.environ.get('DRIFT_TEST_URL', 'http://127.0.0.1:5173')
    # A newly expanded Explorer view can be considerably shorter than 600px.
    short = browser.new_page(viewport={'width': 240, 'height': 150})
    short.goto(url)
    short.wait_for_load_state('networkidle')
    assert short.locator('#title-heading').bounding_box()['y'] >= 0, 'Title heading is clipped above its scroll area'
    short.get_by_role('button', name='Play', exact=True).click()
    expect(short.get_by_role('button', name='Solo', exact=True)).to_be_in_viewport(ratio=1)
    expect(short.get_by_role('button', name='1v1', exact=True)).to_be_in_viewport(ratio=1)
    short.get_by_role('button', name='Solo', exact=True).click()
    short.get_by_role('button', name='Previous car', exact=True).click(timeout=5000)
    expect(short.locator('[data-selection=car]')).to_have_attribute('data-selected','solace')
    short.get_by_role('button', name='Next circuit', exact=True).click(timeout=5000)
    expect(short.locator('[data-selection=track]')).to_have_attribute('data-selected','alpine')
    short.get_by_role('button', name='Head to the start', exact=True).click(timeout=5000)
    assert short.locator('#focus-hint').is_visible()
    short.close()

    page=browser.new_page(viewport={'width':1200,'height':800},device_scale_factor=1)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' and 'WebGLProgram' in msg.text else None)
    page.on('request',lambda req: external.append(req.url) if not req.url.startswith(('http://127.0.0.1','ws://127.0.0.1','data:')) else None)
    page.goto(url);page.wait_for_load_state('networkidle')
    assert page.locator('canvas').count()==0,'Idle view allocated WebGL'
    expect(page.locator('#title-heading')).to_have_text('Drift 68')
    assert page.evaluate('document.fonts.check("400 20px Outfit")')
    page.screenshot(path=str(SHOTS/'title.png'))
    page.get_by_role('button',name='Licenses',exact=True).click()
    assert 'Permission is hereby granted' in page.locator('#game-license').inner_text()
    page.get_by_text('Third-party notices',exact=True).click()
    assert 'Three.js' in page.locator('#third-party-notices').inner_text()
    page.get_by_role('button',name='Back',exact=True).click()
    page.get_by_role('button',name='Play',exact=True).click()
    page.wait_for_selector('[data-screen=modes]')
    assert page.locator('canvas').count()==0,'Mode selection allocated WebGL'
    assert page.evaluate('window.__drift.loop.running') is False
    page.get_by_role('button',name='Solo',exact=True).click()
    page.wait_for_selector('[data-screen=garage]')
    page.screenshot(path=str(SHOTS/'garage.png'))
    expect(page.get_by_role('region',name='Car',exact=True)).to_be_focused()
    page.keyboard.press('ArrowRight')
    expect(page.locator('.car-detail h2')).to_have_text('Ironback V8')
    page.keyboard.press('ArrowDown')
    expect(page.get_by_role('region',name='Circuit',exact=True)).to_be_focused()
    page.keyboard.press('ArrowRight')
    expect(page.locator('[data-selection=track]')).to_have_attribute('data-selected','alpine')
    page.screenshot(path=str(SHOTS/'circuits.png'))
    page.keyboard.press('ArrowLeft')
    page.keyboard.press('ArrowUp')
    page.keyboard.press('ArrowLeft')
    expect(page.locator('[data-selection=car]')).to_have_attribute('data-selected','rearwind')
    assert page.locator('.setup-preview canvas').count()==1
    for track in ['coastal','alpine','autumn']:
        if page.locator('[data-selection=track]').get_attribute('data-selected') != track:
            page.get_by_role('button',name='Next circuit',exact=True).click()
        assert page.evaluate('window.__drift.simulation.path.config.id')==track
        for car in ['rearwind','ironback','streetline','solace']:
            if page.locator('[data-selection=car]').get_attribute('data-selected') != car:
                page.get_by_role('button',name='Next car',exact=True).click()
            assert page.evaluate('window.__drift.state.car')==car
            # Exercise actual race scene construction for every picker combination.
            page.evaluate('''()=>{const g=window.__drift;g.renderer.load(g.state,g.simulation.path);}''')
            assert page.evaluate('window.__drift.renderer.renderer.info.render.calls')>0
            assert page.locator('canvas').count()==1
        metrics[track]=page.evaluate('window.__drift.renderer.diagnostics()')
    page.get_by_role('button',name='Next circuit',exact=True).click()
    page.get_by_role('button',name='Next car',exact=True).click()
    page.get_by_role('button',name='Head to the start',exact=True).click()
    assert page.evaluate('window.__drift.loop.running') is False,'Driving started without viewport focus'
    page.locator('#scene').click(position={'x':700,'y':400});page.keyboard.down('w');page.wait_for_function('window.__drift.state.vehicle.speed>8',timeout=15000);page.keyboard.up('w')
    assert page.evaluate('window.__drift.state.vehicle.speed')>8
    assert page.evaluate('window.__drift.active')
    page.keyboard.down('v')
    assert page.evaluate('window.__drift.state.settings.camera') == 1
    page.keyboard.down('v')
    assert page.evaluate('window.__drift.state.settings.camera') == 1, 'Holding V cycled the camera twice'
    page.keyboard.up('v')
    page.keyboard.press('c')
    assert page.evaluate('window.__drift.state.settings.camera') == 2
    page.keyboard.press('v')
    assert page.evaluate('window.__drift.state.settings.camera') == 3
    for key, setting in [('m','sound'),('n','minimap'),('h','advancedHud')]:
        previous=page.evaluate(f'window.__drift.state.settings.{setting}')
        page.keyboard.press(key)
        assert page.evaluate(f'window.__drift.state.settings.{setting}') is not previous
        assert page.evaluate(f'JSON.parse(localStorage.getItem("driftBreak.save.v1")).settings.{setting}') is not previous
        if key in ['n','h']:
            assert page.locator('.minimap' if key=='n' else '#lap-time').is_hidden()
        page.keyboard.press(key)
        assert page.evaluate(f'window.__drift.state.settings.{setting}') is previous
    assert page.evaluate('window.__drift.active')
    page.wait_for_function('window.__drift.renderer.activeCamera.isPerspectiveCamera === true')
    assert page.evaluate('''() => {
        const game = window.__drift;
        const car = game.state.vehicle;
        const camera = game.renderer.activeCamera.position;
        return (camera.x - car.x) * Math.sin(car.heading) + (camera.z - car.z) * Math.cos(car.heading) < -6;
    }''')
    page.keyboard.down('w');page.wait_for_function('window.__drift.state.vehicle.speed > 16',timeout=15000)
    page.keyboard.down('a');page.keyboard.down('Space')
    page.wait_for_function('window.__drift.renderer.effects.smoke.geometry.drawRange.count >= 8',timeout=15000)
    page.keyboard.up('a');page.keyboard.up('Space');page.keyboard.up('w')
    assert page.evaluate('Math.abs(window.__drift.state.vehicle.lateral)')>.1
    assert page.evaluate('window.__drift.renderer.effects.marks.count') > 0
    assert page.evaluate('''()=>{const e=new KeyboardEvent('keydown',{code:'KeyC',ctrlKey:true,bubbles:true,cancelable:true});document.querySelector('#game-root').dispatchEvent(e);return !e.defaultPrevented;}''')
    metrics['editor']=page.evaluate('window.__drift.diagnostics()')
    page.screenshot(path=str(SHOTS/'rear-chase.png'))
    page.screenshot(path=str(SHOTS/'driving.png'))
    page.keyboard.press('Escape');assert page.evaluate('window.__drift.active') is False
    shortcuts=page.locator('.pause-shortcuts')
    assert shortcuts.get_attribute('open') is None
    shortcuts.get_by_text('Keyboard shortcuts',exact=True).click()
    expect(shortcuts.locator('dd')).to_have_count(12)
    expect(shortcuts).to_contain_text('Choose car or circuit in setup')
    shortcuts.get_by_text('Keyboard shortcuts',exact=True).click()
    before=page.evaluate('window.__drift.loop.updates');page.wait_for_timeout(350);assert page.evaluate('window.__drift.loop.updates')==before
    page.get_by_role('button',name='Settings',exact=True).click()
    page.get_by_role('switch',name='Sound',exact=True).check()
    page.get_by_label('Graphics quality',exact=True).select_option('low')
    page.get_by_label('Camera',exact=True).select_option(label='Overhead')
    page.get_by_label('Camera',exact=True).select_option(label='Rear chase')
    page.get_by_role('switch',name='Minimap',exact=True).uncheck()
    assert page.evaluate('JSON.parse(localStorage.getItem("driftBreak.save.v1")).settings.quality')=='low'
    page.get_by_role('button',name='Back',exact=True).click()
    page.get_by_role('button',name='Resume drive',exact=True).click()
    page.mouse.move(700,400);page.keyboard.down('w');page.wait_for_timeout(200)
    page.evaluate('document.querySelector("[data-action=pause]").focus()')
    assert page.evaluate('window.__drift.active') is False
    page.keyboard.up('w')
    assert page.evaluate('window.__drift.input.keys.size')==0
    # The native host uses this same visibility message when coding regains focus.
    page.evaluate('window.__drift.receive({type:"visibility",visible:false})')
    assert page.locator('canvas').count()==0
    assert page.evaluate('window.__drift.loop.running') is False
    page.evaluate('window.__drift.receive({type:"visibility",visible:true})')
    assert page.locator('canvas').count()==1
    assert page.evaluate('window.__drift.loop.running') is False
    # Repeated loads/resets must keep GPU geometry bounded.
    geometries=[]
    for i in range(18):
        page.evaluate('''i=>{let g=window.__drift;g.state.track=['coastal','alpine','autumn'][i%3];g.simulation.restart();g.loadScene();}''',i)
        geometries.append(page.evaluate('window.__drift.renderer.renderer.info.memory.geometries'))
    assert max(geometries)-min(geometries)<12,geometries
    metrics['repeatedLoads']={'geometryCounts':geometries,'heap':page.evaluate('performance.memory?performance.memory.usedJSHeapSize:null')}
    # Real WebGL loss and restore: pause, retain state, render on recovery.
    page.evaluate('window.__drift.renderer.renderer.forceContextLoss()');page.wait_for_timeout(200)
    assert page.evaluate('window.__drift.loop.running') is False
    page.evaluate('window.__drift.renderer.renderer.forceContextRestore()');page.wait_for_timeout(600)
    assert page.evaluate('window.__drift.renderer.contextLost') is False
    assert page.evaluate('window.__drift.renderer.renderer.info.render.calls')>0
    # Finish via the actual segment-crossing/checkpoint path, never a mocked results screen.
    page.evaluate('''()=>{const g=window.__drift;g.state.track='coastal';g.state.zen=false;g.state.screen='drive';g.simulation.restart();g.state.score.banked=1234;const p=g.simulation.path;
      // Cross each next checkpoint using adjacent points, through Simulation.step.
      for(let n=g.state.lap.next;n<=12;n++){const cp=p.checkpoints[n%12],v=g.state.vehicle;v.x=cp.x-cp.tx*.05;v.z=cp.z-cp.tz*.05;v.heading=Math.atan2(cp.tx,cp.tz);v.vx=cp.tx*12;v.vz=cp.tz*12;g.active=true;g.update(1/60);if(g.state.screen==='results')break;}
    }''')
    assert page.evaluate('window.__drift.state.lap.finished')
    assert page.locator('[data-screen=results]').count()==1
    assert page.evaluate('JSON.parse(localStorage.getItem("driftBreak.save.v1")).records["coastal:rearwind"].score')>=1234
    page.screenshot(path=str(SHOTS/'results.png'))
    page.get_by_role('button',name='Unwind in Zen Drive',exact=True).click()
    assert page.evaluate('window.__drift.state.zen') is True
    page.locator('#scene').click(position={'x':700,'y':400})
    page.evaluate('''()=>{const g=window.__drift,p=g.simulation.path;g.state.lap.next=12;const cp=p.checkpoints[0],v=g.state.vehicle;v.x=cp.x-cp.tx*.05;v.z=cp.z-cp.tz*.05;v.heading=Math.atan2(cp.tx,cp.tz);v.vx=cp.tx*12;v.vz=cp.tz*12;g.simulation.step({throttle:0,brake:0,steer:0,handbrake:false,boost:false},1/60);}''')
    assert page.evaluate('window.__drift.state.screen')=='drive'
    assert page.evaluate('window.__drift.state.lap.finished') is False
    page.keyboard.press('Escape')
    # 240px sidebar: no horizontal overflow and all menu controls remain scrollable.
    page.set_viewport_size({'width':240,'height':600})
    page.evaluate('window.__drift.receive({type:"mode",mode:"sidebar"})')
    page.get_by_role('button',name='Solo setup',exact=True).click()
    assert page.evaluate('document.querySelector(".setup-screen").scrollWidth')<=240
    page.screenshot(path=str(SHOTS/'sidebar-garage.png'))
    page.get_by_role('button',name='Begin Zen Drive',exact=True).click()
    page.locator('#scene').click(position={'x':120,'y':280})
    page.keyboard.down('w');page.wait_for_function('window.__drift.state.vehicle.speed > 14',timeout=15000)
    page.keyboard.down('a');page.keyboard.down('Space')
    page.wait_for_function('window.__drift.renderer.effects.smoke.geometry.drawRange.count >= 2',timeout=15000)
    page.keyboard.up('a');page.keyboard.up('Space');page.keyboard.up('w')
    assert page.evaluate('''() => {
        const renderer = window.__drift.renderer;
        const car = renderer.car.group.position.clone().project(renderer.activeCamera);
        return renderer.activeCamera.isPerspectiveCamera && Math.abs(car.x) < .8 && Math.abs(car.y) < .8;
    }''')
    assert page.evaluate('!window.__drift.state.score.active')
    metrics['sidebar']=page.evaluate('window.__drift.diagnostics()')
    page.screenshot(path=str(SHOTS/'sidebar-driving.png'))
    # Clear keys and pause when the pointer leaves, then disconnect a gamepad safely.
    page.locator('#game-root').dispatch_event('pointerleave')
    assert page.evaluate('window.__drift.loop.running') is False
    page.evaluate('window.dispatchEvent(new Event("gamepaddisconnected"))')
    assert page.evaluate('window.__drift.input.keys.size')==0
    # Maximize changes host presentation, and browser rendering stays responsive.
    page.set_viewport_size({'width':1600,'height':1000})
    page.evaluate('window.__drift.receive({type:"mode",mode:"maximized"})')
    metrics['maximized']=page.evaluate('window.__drift.diagnostics()')
    # Persistent preferences and records survive a fresh document.
    page.reload();page.wait_for_load_state('networkidle');page.get_by_role('button',name='Play',exact=True).click()
    assert page.evaluate('window.__drift.state.settings.quality')=='low'
    assert page.evaluate('window.__drift.state.settings.camera')==3
    assert page.evaluate('window.__drift.data.records["coastal:rearwind"].score')>=1234
    # Verify cleanup for a released session.
    page.evaluate('window.__drift.receive({type:"suspend",token:1})')
    assert page.locator('canvas').count()==0
    assert page.evaluate('window.__drift.loop.running') is False
    browser.close()
metrics['errors']=errors;metrics['externalRequests']=external
(OUT/'browser-metrics.json').write_text(json.dumps(metrics,indent=2),encoding='utf-8')
assert not errors,errors
assert not external,external
print(json.dumps(metrics,indent=2))
print('PASS: browser flows, 12 combinations, input, settings, laps, Zen, lifecycle, resize, context recovery and cleanup')
