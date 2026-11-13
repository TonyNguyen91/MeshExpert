# Browser test: STEP button lights for ticked B-rep solids, convert to mesh updates the list, measurement callouts
# (circle to circle: min / max / centre rows, hover shows the line, drag the callout, Delete removes it, whatever the filter).
# Run: python3 ui12.py <scratch folder> [path to index.html]
import sys,os,math
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1680,'height':950},offline=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def uv(u,v): return pg.evaluate("p=>{const f=__mrt.S.sk.frame,w=[f.o[0]+p[0]*f.u[0]+p[1]*f.v[0],f.o[1]+p[0]*f.u[1]+p[1]*f.v[1],f.o[2]+p[0]*f.u[2]+p[1]*f.v[2]];const q=__mrt.project(w);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",[u,v])
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def click(u,v): q=uv(u,v); pg.mouse.move(*q); pg.wait_for_timeout(30); pg.mouse.click(*q); pg.wait_for_timeout(50)
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==false){e.click()}})()")
    # plate 60 x 30 with two holes Ø10 and Ø6, extruded 10 (B-rep)
    pg.click('#bSketch'); pg.click('#skplane [data-pl=top]'); pg.wait_for_timeout(200)
    pg.evaluate("(()=>{const c=__mrt.cam();c.zoom=60;c.target=[30,15,0];})()"); pg.uncheck('#skGrid')
    pg.click('#sktools [data-sk=rect]'); click(0,0); click(60,30)
    pg.click('#sktools [data-sk=circle]'); pg.fill('#skD','10'); click(15,15); pg.fill('#skD','6'); click(45,15)
    pg.keyboard.press('Escape'); pg.click('#skOk'); pg.wait_for_timeout(200)
    C=pg.evaluate("(()=>{const f=__mrt.core.skFlat(__mrt.S.sketches[0].m);return f.filter(e=>e.t==='circle').map(e=>[e.c[0],e.c[1],e.r])})()")
    pg.click('#sketchList .srow:nth-child(1)'); pg.keyboard.press('e'); pg.wait_for_timeout(200)
    pg.fill('#fDepth','10'); pg.dispatch_event('#fDepth','input'); pg.click('#fOk'); idle()
    ok('extruded plate is B-rep',pg.evaluate("!!__mrt.S.bodies[0].geo.brep"))
    pg.click('[data-tool=select]'); pg.mouse.move(800,700); pg.keyboard.press('Space'); pg.wait_for_timeout(150)
    ok('STEP button plain with nothing ticked',not pg.evaluate("document.getElementById('bStep').classList.contains('primary')"))
    pg.click('#bodyList .brow:nth-child(2) .nm')
    pg.wait_for_timeout(150)
    ok('STEP button lights when a B-rep solid is ticked',pg.evaluate("__mrt.S.sel.size")==1 and pg.evaluate("document.getElementById('bStep').classList.contains('primary')"))
    # circle to circle with only "Circle" in the filter
    pg.evaluate("(()=>{const c=__mrt.cam();c.R=[1,0,0, 0,1,0, 0,0,1];c.zoom=40;c.target=[30,15,10];})()"); pg.wait_for_timeout(150)
    pg.dblclick('[data-flt=circle]'); pg.wait_for_timeout(150)
    pg.click('[data-tool=dist]'); pg.wait_for_timeout(100)
    for (cx,cy,r) in C:
        q=scr([cx+r*math.cos(0.7),cy+r*math.sin(0.7),10]); pg.mouse.move(*q); pg.wait_for_timeout(120); pg.mouse.click(*q); pg.wait_for_timeout(150)
    m=pg.evaluate("(()=>{const m=__mrt.S.measures[__mrt.S.measures.length-1];return m?{type:m.type,v:m.v,mx:!!m.mx,cd:!!m.cd,n:__mrt.S.measures.length}:null})()")
    d=abs(C[1][0]-C[0][0]); 
    ok('circle to circle: min / max / centre distances',m and m['type']=='dist' and m['mx'] and m['cd'] and abs(m['v']-(d-C[0][2]-C[1][2]))<0.1,[m,d-C[0][2]-C[1][2]])
    pg.wait_for_timeout(200)
    box=pg.evaluate("__mrt.S.labBoxes[__mrt.S.labBoxes.length-1]"); r=pg.evaluate("document.getElementById('gl').getBoundingClientRect().toJSON()")
    ok('the callout has 3 rows',box and box['n']==3,box)
    # hover the "Max" row: only then its line is drawn
    pg.mouse.move(r['x']+box['x']+20, r['y']+box['y']+2+box['rh']*1.5); pg.wait_for_timeout(200)
    hv=pg.evaluate("__mrt.S.hovLab"); pg.screenshot(path=S+'/c1.png')
    ok('hovering the Max row marks it',hv and hv['row']==1,hv)
    pg.mouse.move(r['x']+50, r['y']+600); pg.wait_for_timeout(200)
    ok('moving away clears it',pg.evaluate("__mrt.S.hovLab")==None)
    # drag the callout 150 px right, 80 px down (still in the distance tool, filter = circle only)
    x0=r['x']+box['x']+20; y0=r['y']+box['y']+8
    pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move(x0+60,y0+30,steps=4); pg.mouse.move(x0+150,y0+80,steps=4); pg.mouse.up(); pg.wait_for_timeout(200)
    b2=pg.evaluate("__mrt.S.labBoxes[__mrt.S.labBoxes.length-1]")
    ok('callout dragged, nothing new measured',abs(b2['x']-box['x']-150)<2 and abs(b2['y']-box['y']-80)<2 and pg.evaluate("__mrt.S.measures.length")==m['n'] and pg.evaluate("__mrt.S.tmp.length")==0,[b2['x']-box['x'],b2['y']-box['y']])
    pg.screenshot(path=S+'/c2.png')
    # angle between two planes: the arc is drawn and the callout shows the angle
    pg.dblclick('[data-flt=circle]'); pg.wait_for_timeout(100)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(150)
    ok('Delete removes the picked callout (not the body, not the sketch)',pg.evaluate("__mrt.S.measures.length")==m['n']-1 and pg.evaluate("__mrt.S.bodies.length")==1 and pg.evaluate("__mrt.S.sketches.length")==1)
    # convert to mesh from the right-click menu
    pg.click('[data-tool=select]'); pg.evaluate("__mrt.S.sel=new Set()")
    q=scr([30,5,10]); pg.mouse.click(q[0],q[1],button='right'); pg.wait_for_timeout(200)
    pg.locator('text=Chuyển solid → mesh').click(); pg.wait_for_timeout(200)
    ok('convert to mesh: list badge says mesh, STEP plain, triangles shown',pg.inner_text('#bodyList .kind')=='Lưới' and not pg.evaluate("!!__mrt.S.bodies[0].geo.brep||!!__mrt.S.bodies[0].solid"),pg.inner_text('#bodyList .kind'))
    ok('no page errors',errs==[],errs)
    b.close()
print('all passed' if fails==0 else 'FAILED '+str(fails))
