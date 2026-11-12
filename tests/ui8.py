# Browser test: sketch mode, extrude / revolve solids, editing a solid, solid -> mesh, booleans.
# Run: python3 ui8.py <scratch folder for screenshots> [path to index.html]
import sys,os,math
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
def near(a,b,rel=1e-3): return abs(a-b)<=rel*abs(b)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1680,'height':950}).new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def uv(u,v):   # a point of the active sketch plane on screen
        return pg.evaluate("p=>{const f=__mrt.S.sk.frame,w=[f.o[0]+p[0]*f.u[0]+p[1]*f.v[0],f.o[1]+p[0]*f.u[1]+p[1]*f.v[1],f.o[2]+p[0]*f.u[2]+p[1]*f.v[2]];const q=__mrt.project(w);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",[u,v])
    def click(u,v): q=uv(u,v); pg.mouse.move(*q); pg.wait_for_timeout(40); pg.mouse.click(*q); pg.wait_for_timeout(60)
    def body(i): return pg.evaluate("i=>{const b=__mrt.S.bodies[i];if(!b)return null;const s=__mrt.core.stats(b.geo.positions,b.geo.indices),t=__mrt.core.topology(b.geo.indices,b.geo.positions.length/3);return {name:b.name,solid:!!b.solid,vol:s.volume,border:t.border,nm:t.nonManifold,min:s.min,max:s.max}}",i)
    def row(i): return f'#bodyList .brow:nth-child({i+1})'
    def ents(): return pg.evaluate("__mrt.S.sk?__mrt.S.sk.ents.length:(__mrt.S.sketch?__mrt.S.sketch.ents.length:-1)")
    pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); pg.uncheck('#cInfo')
    poly=lambda n,r: n/2*r*r*math.sin(2*math.pi/n)
    # ---- sketch: rectangle 40 x 30 with a circle Ø10 hole ----
    pg.click('#bSketch'); pg.click('#skplane [data-pl=top]'); pg.wait_for_timeout(200)
    ok('sketch mode: own toolbar, normal view of the plane',pg.is_visible('#sktools') and not pg.is_visible('#tools') and pg.evaluate("Math.abs(__mrt.cam().R[8]-1)<1e-9"))
    pg.uncheck('#skGrid')
    pg.click('#sktools [data-sk=rect]'); pg.fill('#skW','40'); pg.fill('#skH','30'); click(0,0); click(7,5)
    pg.click('#sktools [data-sk=circle]'); pg.fill('#skD','10'); click(12,15)
    ok('typed sizes: 4 lines + 1 circle',ents()==5 and pg.evaluate("(()=>{const e=__mrt.S.sk.ents;return e[1].b[0]===40&&e[1].b[1]===30&&e[4].r===5})()"),ents())
    # a line chain closed into a triangle, then undone
    pg.click('#sktools [data-sk=line]'); click(50,0); click(60,0); click(55,8); click(50,0)
    ok('line chain closes on its first point',ents()==8 and pg.evaluate("__mrt.S.sk.pts.length")==0)
    pg.screenshot(path=S+'/m1.png')
    for i in range(3): pg.click('#skUndo')
    ok('sketch undo',ents()==5)
    # fillet one corner, trim test on a crossing line
    pg.click('#sktools [data-sk=fillet]'); pg.fill('#skR','4'); q=uv(40,30); pg.mouse.click(q[0]-2,q[1]+2); pg.wait_for_timeout(80)
    ok('corner fillet R4 adds an arc and shortens the lines',ents()==6 and pg.evaluate("(()=>{const e=__mrt.S.sk.ents;return Math.abs(e[5].r-4)<1e-9&&Math.abs(e[1].b[1]-26)<1e-9})()"))
    pg.click('#sktools [data-sk=line]'); click(20,-5); click(20,35); pg.keyboard.press('Escape')
    pg.click('#sktools [data-sk=trim]'); click(20,-2); click(20,33); pg.wait_for_timeout(60)
    ok('trim removes the two overhanging ends of a crossing line',ents()==7 and pg.evaluate("(()=>{const e=__mrt.S.sk.ents[6];return Math.abs(e.a[1])<1e-9&&Math.abs(e.b[1]-30)<1e-9})()"),pg.evaluate("JSON.stringify(__mrt.S.sk.ents[6])"))
    pg.click('#sktools [data-sk=select]'); click(20,22); pg.keyboard.press('Delete'); ok('select + Delete',ents()==6)
    pg.click('#skOk'); pg.wait_for_timeout(150)
    ok('finished: back to the normal tools, 1 closed profile reported',pg.is_visible('#tools') and '1' in pg.inner_text('#status'),pg.inner_text('#status'))
    # ---- extrude ----
    area=1200-16*(1-math.pi/4)-poly(72,5)   # rectangle - the corner cut off by the fillet - the hole (as drawn: 72-gon)
    pg.click('#bExtrude'); pg.wait_for_timeout(150); pg.fill('#fDepth','10'); pg.click('#bIso'); pg.wait_for_timeout(200); pg.screenshot(path=S+'/m2.png')
    ok('extrude dialog shows a preview outline',pg.evaluate("__mrt.S.fd&&__mrt.S.fd.lines&&__mrt.S.fd.lines.length>5"))
    pg.click('#fOk'); pg.wait_for_timeout(200); B=body(0)
    ok('extrude new: closed solid with the right volume',B and B['solid'] and B['border']==0 and B['nm']==0 and near(B['vol'],area*10,1e-3),[B and round(B['vol'],2),round(area*10,2)])
    ok('solid is marked in the list',pg.inner_text(row(1)).strip().startswith('◆'),pg.inner_text(row(1))[:20])
    # edit the solid: depth 20, draft 2, top chamfer 1
    pg.click(row(1),button='right'); pg.click("#ctx div:has-text('Sửa khối solid')"); pg.wait_for_timeout(150)
    ok('edit reopens the dialog with its values',pg.input_value('#fDepth')=='10')
    pg.fill('#fDepth','20'); pg.click('#fOk'); pg.wait_for_timeout(200); B=body(0)
    ok('edited solid: volume doubles, still a solid',B['solid'] and near(B['vol'],area*20,1e-3) and abs(B['max'][2]-20)<1e-5,round(B['vol'],2))
    pg.click(row(1),button='right'); pg.click("#ctx div:has-text('Sửa khối solid')"); pg.select_option('#fEdge','fillet'); pg.fill('#fEdgeS','1'); pg.fill('#fShell','1.5'); pg.wait_for_timeout(100)
    pg.screenshot(path=S+'/m3.png'); pg.click('#fOk'); pg.wait_for_timeout(200); B2=body(0)
    ok('fillet + shell: still closed, lighter',B2['border']==0 and B2['nm']==0 and B2['vol']<0.6*B['vol'],round(B2['vol'],1))
    pg.click('#bUndo'); pg.wait_for_timeout(150)
    # ---- remove: cut a slot through it from a sketch on its top face ----
    pg.keyboard.press('Space'); pg.click('#bSketch'); pg.click('#skplane [data-pl=pick]'); q=scr([30,6,20]); pg.mouse.click(*q); pg.wait_for_timeout(250)
    fr=pg.evaluate("__mrt.S.sk&&__mrt.S.sk.frame")
    ok('sketch plane picked on the top face of the solid',fr is not None and abs(fr['n'][2]-1)<1e-6 and abs(fr['o'][2]-20)<1e-4,fr)
    pg.uncheck('#skGrid'); pg.click('#sktools [data-sk=rect]'); pg.fill('#skW','6'); pg.fill('#skH','8')
    o=fr['o']; u=fr['u']; v=fr['v']; loc=lambda X,Y:[(X-o[0])*u[0]+(Y-o[1])*u[1],(X-o[0])*v[0]+(Y-o[1])*v[1]]
    a=loc(28,3); c=loc(31,5); click(*a); click(*c); pg.click('#skOk'); pg.wait_for_timeout(100)
    w=pg.evaluate("(()=>{const e=__mrt.S.sketch.ents;return [Math.abs(e[0].b[0]-e[0].a[0])+Math.abs(e[0].b[1]-e[0].a[1]),Math.abs(e[1].b[0]-e[1].a[0])+Math.abs(e[1].b[1]-e[1].a[1])]})()")
    pg.click(row(1)); pg.click('#bExtrude'); pg.click('#fOp [data-op=remove]'); pg.check('#fFlip'); pg.fill('#fDepth','5'); pg.wait_for_timeout(100); pg.click('#fOk'); idle(); B3=body(0)
    ok('remove: pocket 6 x 8 x 5 cut from the top face, result closed',B3['border']==0 and B3['nm']==0 and near(B['vol']-B3['vol'],240,5e-3) and not B3['solid'],[round(B['vol']-B3['vol'],3),w])
    pg.screenshot(path=S+'/m4.png')
    # ---- revolve ----
    pg.click('#bClear'); pg.click('#bSketch'); pg.click('#skplane [data-pl=front]'); pg.uncheck('#skGrid')
    pg.click('#sktools [data-sk=rect]'); pg.fill('#skW','5'); pg.fill('#skH','20'); click(5,0); click(7,3); pg.click('#skOk')
    pg.click('#bRevolve'); pg.select_option('#fAxis','v'); pg.wait_for_timeout(100); pg.click('#fOk'); pg.wait_for_timeout(200); R=body(0)
    ok('revolve about the sketch V axis: tube, closed',R and R['solid'] and R['border']==0 and near(R['vol'],math.pi*75*20,5e-3) and abs(R['max'][2]-20)<1e-4,R and [round(R['vol'],1),R['min'],R['max']])
    pg.click('#bToMesh'); pg.wait_for_timeout(100); ok('solid -> mesh',body(0)['solid']==False and not pg.inner_text(row(1)).strip().startswith('◆'))
    # ---- boolean panel ----
    pg.click('#bClear')
    def box(x0,y0,w,h,d,sym):
        pg.click('#bSketch'); pg.click('#skplane [data-pl=top]'); pg.uncheck('#skGrid'); pg.click('#sktools [data-sk=rect]'); pg.fill('#skW',str(w)); pg.fill('#skH',str(h)); click(x0,y0); click(x0+1,y0+1); pg.click('#skOk')
        pg.click('#bExtrude'); pg.fill('#fDepth',str(d)); (pg.check('#fSym') if sym else pg.uncheck('#fSym')); pg.click('#fOk'); pg.wait_for_timeout(150)
    box(0,0,20,20,20,False); box(11.3,9.7,20,20,30,True)
    ov=8.7*10.3*15
    def tick(order):
        pg.keyboard.press('Space')
        for i in order: pg.click(row(i))
    for op,want,first in [('union',8000+12000-ov,[1,2]),('subtract',8000-ov,[1,2]),('subtract',12000-ov,[2,1]),('intersect',ov,[1,2])]:
        tick(first); pg.click(f'#boolOp [data-op={op}]'); info=pg.inner_text('#boolInfo').replace('\n',' | '); pg.click('#bBool'); idle()
        n=pg.evaluate("__mrt.S.bodies.length"); r=body(0)
        ok(f'{op} (ticked in order {first}): one closed body with the right volume',n==1 and r['border']==0 and r['nm']==0 and near(r['vol'],want,1e-3),[info,round(r['vol'],2),round(want,2)])
        if op=='union': pg.screenshot(path=S+'/m5.png')
        pg.click('#bUndo'); pg.wait_for_timeout(150)
    tick([1,2]); pg.click('#boolOp [data-op=intersect]'); pg.check('#boolKeep'); pg.click('#bBool'); idle()
    ok('keep tools: both bodies stay, the result is a third',pg.evaluate("__mrt.S.bodies.length")==3 and near(body(2)['vol'],ov,1e-3),pg.evaluate("__mrt.S.bodies.map(b=>b.name)"))
    ok('booleans ran in the embedded Manifold library',pg.evaluate("__mrt.boolEngine()")=='manifold',pg.evaluate("__mrt.boolEngine()"))
    # two boxes that share a whole face (the hard case for home-made booleans): union is one clean box
    r=pg.evaluate("""(async()=>{const c=__mrt.core;const box=(x0,y0,z0,x1,y1,z1)=>{const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[2,3,7],[2,7,6],[1,2,6],[1,6,5],[3,0,4],[3,4,7]],a=[];for(const t of f)for(const i of t)a.push(...v[i]);return c.weld(new Float32Array(a),null)};
      const u=await __mrt.boolRun(box(0,0,0,10,10,10),box(0,0,10,10,10,20),'union'),s=c.stats(u.positions,u.indices),t=c.topology(u.indices,u.positions.length/3);
      const d=await __mrt.boolRun(box(0,0,0,10,10,10),box(5,0,0,15,10,10),'subtract'),s2=c.stats(d.positions,d.indices),t2=c.topology(d.indices,d.positions.length/3);
      let open=''; try{await __mrt.boolRun({positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2])},box(0,0,0,1,1,1),'union')}catch(e){open=e.message}
      return [s.volume,t.border,t.nonManifold,s2.volume,t2.border,t2.nonManifold,open]})()""")
    ok('face-to-face boxes: union 2000, flush subtract 500, both closed',abs(r[0]-2000)<1e-3 and r[1]==0 and r[2]==0 and abs(r[3]-500)<1e-3 and r[4]==0 and r[5]==0,r[:6])
    ok('an open mesh is refused with a clear message','kín' in r[6],r[6])
    print('console errors:',errs)
    if errs: fails+=1
    b.close()
print('FAILED '+str(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
