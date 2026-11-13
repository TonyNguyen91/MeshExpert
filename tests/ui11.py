# Browser test: exact solids from the embedded B-rep engine (extrude, fillet, shell) and STEP export, offline.
# Run: python3 ui11.py <scratch folder> [path to index.html]
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
    ctx=b.new_context(viewport={'width':1680,'height':950},offline=True,accept_downloads=True); pg=ctx.new_page()
    errs=[]; net=[]; warns=[]
    pg.on('console',lambda m: (errs.append(m.text) if m.type=='error' else warns.append(m.text) if m.type=='warning' else None))
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('request',lambda r: net.append(r.url) if not r.url.startswith(('file:','data:','blob:')) else None)
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def uv(u,v): return pg.evaluate("p=>{const f=__mrt.S.sk.frame,w=[f.o[0]+p[0]*f.u[0]+p[1]*f.v[0],f.o[1]+p[0]*f.u[1]+p[1]*f.v[1],f.o[2]+p[0]*f.u[2]+p[1]*f.v[2]];const q=__mrt.project(w);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",[u,v])
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def click(u,v): q=uv(u,v); pg.mouse.move(*q); pg.wait_for_timeout(30); pg.mouse.click(*q); pg.wait_for_timeout(50)
    def body(i=0): return pg.evaluate("i=>{const b=__mrt.S.bodies[i];if(!b)return null;const s=__mrt.core.stats(b.geo.positions,b.geo.indices),t=__mrt.core.topology(b.geo.indices,b.geo.positions.length/3);return {vol:s.volume,border:t.border,nm:t.nonManifold,brep:!!b.geoBrep,feats:b.solid&&b.solid.feats?b.solid.feats.length:0,min:s.min,max:s.max}}",i)
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==false){e.click()}})()")
    # 40 x 30 rectangle with a Ø12 circle, extruded 20
    pg.click('#bSketch'); pg.click('#skplane [data-pl=top]'); pg.wait_for_timeout(200)
    pg.evaluate("(()=>{const c=__mrt.cam();c.zoom=60;c.target=[20,15,0];})()"); pg.uncheck('#skGrid')
    pg.click('#sktools [data-sk=rect]'); click(0,0); click(40,30)
    pg.click('#sktools [data-sk=circle]'); pg.fill('#skD','12'); click(20,15)
    pg.keyboard.press('Escape'); pg.click('#skOk'); pg.wait_for_timeout(200)
    sz=pg.evaluate("(()=>{const s=__mrt.S.sketches[0];const f=__mrt.core.skFlat(s.m);const l=f.filter(e=>e.t==='line');const xs=l.flatMap(e=>[e.a[0],e.b[0]]),ys=l.flatMap(e=>[e.a[1],e.b[1]]);return [Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),f.filter(e=>e.t==='circle').map(e=>e.r)]})()")
    pg.click('#sketchList .srow:nth-child(1)'); pg.keyboard.press('e'); pg.wait_for_timeout(200)
    pg.fill('#fDepth','20'); pg.dispatch_event('#fDepth','input'); pg.wait_for_timeout(200)
    pg.click('#fOk'); idle(); B=body()
    W,H,R=sz[0],sz[1],sz[2][0]
    ok('body list and message say B-rep',' · B-rep' in pg.inner_text('#bodyList') and 'B-rep' in pg.inner_text('#status'),[pg.inner_text('#status')])
    exact=20*(W*H-math.pi*R*R)
    ok('extrude built by the B-rep engine: closed, exact volume (round hole, not a polygon)',B and B['brep'] and B['border']==0 and B['nm']==0 and abs(B['vol']-exact)<0.001*exact,[B,exact])
    # fillet the top front edge R3
    pg.evaluate("document.getElementById('bFit').click()"); pg.evaluate("document.getElementById('bIso').click()"); pg.wait_for_timeout(200)
    pg.click('#bodyList .brow:nth-child(1)'); pg.keyboard.press('Shift+F'); pg.wait_for_timeout(150)
    mn=B['min']; mx=B['max']
    q=scr([(mn[0]+mx[0])/2,mn[1],mx[2]]); pg.mouse.move(*q); pg.wait_for_timeout(60); pg.mouse.click(*q); pg.wait_for_timeout(80)
    pg.fill('#odV','3'); pg.dispatch_event('#odV','input'); pg.wait_for_timeout(1500); idle()
    v1=B['vol']; pg.click('#odOk'); idle(); B=body()
    ok('fillet R3 by B-rep: removes (1-π/4)·9·length',B['brep'] and B['border']==0 and B['feats']==1 and abs((v1-B['vol'])-(1-math.pi/4)*9*W)<0.03*(1-math.pi/4)*9*W,[v1-B['vol'],(1-math.pi/4)*9*W])
    # shell 2 open at the bottom
    pg.click('#b_shell'); pg.wait_for_timeout(100)
    pg.evaluate("(()=>{const c=__mrt.cam();c.R=[1,0,0, 0,-1,0, 0,0,-1];})()"); pg.wait_for_timeout(100)
    q=scr([mn[0]+3,mn[1]+3,mn[2]]); pg.mouse.click(*q); pg.wait_for_timeout(80)
    pg.fill('#odV','2'); pg.dispatch_event('#odV','input'); pg.wait_for_timeout(1500); idle()
    v1=B['vol']; pg.click('#odOk'); idle(); B=body()
    ok('shell 2 by B-rep: closed and much lighter',B['brep'] and B['border']==0 and B['nm']==0 and B['vol']<0.5*v1 and B['feats']==2,[v1,B['vol']])
    pg.evaluate("document.getElementById('bIso').click()"); pg.wait_for_timeout(200); pg.screenshot(path=S+'/brep1.png')
    # STEP export of the ticked solid
    pg.evaluate("(()=>{const S=__mrt.S;S.sel=new Set([S.bodies[0]]);})()")
    with pg.expect_download() as d: pg.click('#bStep')
    dl=d.value; path=os.path.join(S,'out.step'); dl.save_as(path); txt=open(path).read()
    ok('STEP file written with exact faces',dl.suggested_filename.endswith('.step') and 'ISO-10303-21' in txt and 'ADVANCED_FACE' in txt and 'CYLINDRICAL_SURFACE' in txt,[dl.suggested_filename,len(txt)])
    ok('no network requests',net==[],net)
    ok('no page errors',errs==[],errs)
    ok('no B-rep fallbacks',not [w for w in warns if 'B-rep' in w],[w for w in warns if 'B-rep' in w])
    b.close()
print('all passed' if fails==0 else 'FAILED '+str(fails))
