# Browser test (v1.6.5): after undo / redo every body keeps its own uid, so a click on one body in the drawing tree
# picks only that body and the eye hides only that body.
# Run: python3 ui39.py <fixtures folder> [path to index.html]
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
    pg.set_input_files('#file',[S+'/steps.stl',S+'/boss.stl',S+'/m_peg.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==4"); pg.wait_for_timeout(300)
    U="(()=>{const u=__mrt.S.bodies.map(b=>b.uid);return u.every(x=>!!x)&&new Set(u).size==u.length})()"
    pg.evaluate("__mrt.S.sel.add(__mrt.S.bodies[0])"); pg.click('[data-tool=move]'); pg.fill('#mvX','5'); pg.click('#bMove'); pg.wait_for_timeout(150)
    pg.click('#bUndo'); pg.wait_for_timeout(150)
    ok('After undo every body still has its own uid',pg.evaluate(U))
    pg.click('#bRedo'); pg.wait_for_timeout(150)
    ok('After redo too',pg.evaluate(U))
    pg.click('[data-tool=select]')
    pg.click('#b_dws'); pg.wait_for_function("(__mrt.v6().nprev||0)>=1",timeout=90000); pg.wait_for_timeout(500)
    pg.locator('#dwsTree .dwsNode.body').nth(1).locator('.nm').click(); pg.wait_for_timeout(200)
    n=pg.locator('#dwsTree .dwsNode.body.on').count()
    ok('A click on one body picks only that body',n==1,n)
    pg.locator('#dwsTree .dwsNode.body').nth(2).locator('.eye').click(); pg.wait_for_timeout(300)
    h=pg.locator('#dwsTree .dwsNode.body.hid').count()
    ok('The eye hides only that body',h==1,h)
    ok('No page errors',not errs,errs)
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
