# Browser test (v1.6.5): SLA panel as a temporary workspace, light theme, Settings ▸ General, drawing tree icons.
# Run: python3 ui37.py <fixtures folder> [path to index.html]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html'); fails=0
def ok(n,c,x=''):
    global fails
    print(('ok   ' if c else 'FAIL ')+n+('  '+str(x) if x!='' else '')); fails+=(not c)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1600,'height':900},offline=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    ok('Version 1.6.5',pg.evaluate("document.getElementById('appVer').textContent")=='v1.6.5')
    pg.set_input_files('#file',[S+'/steps.stl',S+'/boss.stl',S+'/m_peg.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==4"); pg.wait_for_timeout(300)
    # ---- SLA
    M="JSON.stringify(__mrt.S.bodies.map(b=>b.matrix.map(v=>+v.toFixed(6))))"
    m0=pg.evaluate(M); u0=pg.evaluate("document.getElementById('bUndo').disabled"); c0=pg.evaluate("JSON.stringify(__mrt.cam())")
    ok('Plate 450 x 450 by default',pg.evaluate("[slaW.value,slaD.value]")==['450','450'])
    ok('Orient + lay out is not lit orange',pg.evaluate("!slaGo.classList.contains('primary')"))
    pg.click('.popb[data-pop=sla]'); pg.wait_for_timeout(300)
    pg.evaluate("__mrt.S.bodies.forEach(b=>__mrt.S.sel.add(b))"); pg.click('#slaGo'); pg.wait_for_timeout(1500)
    ok('Inside the panel: bodies laid out, guard blocks added',pg.evaluate(M)!=m0 and pg.evaluate("__mrt.S.bodies.length")==6)
    pg.click('#pop_sla .popx'); pg.wait_for_timeout(300)
    ok('Closing: every body back where it was',pg.evaluate(M)==m0)
    ok('Closing: guard blocks gone',pg.evaluate("__mrt.S.bodies.length")==4)
    ok('Closing: undo history and view as before',pg.evaluate("document.getElementById('bUndo').disabled")==u0 and pg.evaluate("JSON.stringify(__mrt.cam())")==c0)
    # ---- Settings ▸ General
    ok('Invert zoom is not on the ribbon any more',pg.evaluate("!document.getElementById('cZoomInv').closest('#ribbon') && !!document.getElementById('cZoomInv').closest('#setdlg')"))
    pg.click('#bSet'); pg.wait_for_timeout(150)
    ok('Settings opens on General',pg.evaluate("document.querySelector('#setTabs button.on').dataset.k")=='gen')
    pg.click('#cZoomInv'); pg.click('#themeSeg [data-t=light]'); pg.wait_for_timeout(300)
    ok('Light theme on',pg.evaluate("document.documentElement.classList.contains('light') && getComputedStyle(document.body).backgroundColor")!=False and pg.evaluate("getComputedStyle(document.getElementById('setdlg')).backgroundColor")=='rgb(255, 255, 255)')
    pg.reload(); pg.wait_for_timeout(500)
    ok('Theme and zoom direction remembered',pg.evaluate("document.documentElement.classList.contains('light') && document.getElementById('cZoomInv').checked"))
    pg.evaluate("localStorage.removeItem('mx.theme');localStorage.removeItem('mx.zoomInv')")
    # ---- drawing tree icons
    pg.set_input_files('#file',[S+'/steps.stl',S+'/boss.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); pg.wait_for_timeout(300)
    pg.click('#b_dws'); pg.wait_for_function("(__mrt.v6().nprev||0)>=1",timeout=90000); pg.wait_for_timeout(500)
    ok('Body rows: cube icon + eye drawn as SVG',pg.evaluate("Array.from(document.querySelectorAll('#dwsTree .dwsNode.body')).every(n=>n.querySelectorAll('svg path').length>=4 && n.querySelector('.eye svg'))"))
    pg.click('#dwsTree .dwsNode.body .eye'); pg.wait_for_timeout(400)
    ok('Hidden body: crossed-out eye',pg.evaluate("!!document.querySelector('#dwsTree .dwsNode.body.hid .eye.off svg')"))
    ok('No page errors',not errs,errs)
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
