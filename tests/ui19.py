# Browser test: Replace face takes a curved face (the chamfer of a cylinder) and flattens it onto a target plane;
# Pattern is one command (Linear / Circular) whose direction / axis can be picked in the view (flat face normal,
# cylinder axis, straight edge).
# Run: python3 make_rd_meshes.py <fixtures>; python3 ui19.py <fixtures folder> [path to index.html]
import sys,os,math
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
VOL="(b=>{const P=b.geo.positions,I=b.geo.indices;let v=0;for(let t=0;t<I.length;t+=3){const a=3*I[t],c=3*I[t+1],d=3*I[t+2];v+=(P[a]*(P[c+1]*P[d+2]-P[c+2]*P[d+1])-P[a+1]*(P[c]*P[d+2]-P[c+2]*P[d])+P[a+2]*(P[c]*P[d+1]-P[c+1]*P[d]))/6;}return v;})"
BOX="(()=>__mrt.S.bodies.map(b=>{const P=b.geo.positions,m=b.matrix;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<P.length;k+=3){const v=[m[0]*P[k]+m[4]*P[k+1]+m[8]*P[k+2]+m[12],m[1]*P[k]+m[5]*P[k+1]+m[9]*P[k+2]+m[13],m[2]*P[k]+m[6]*P[k+1]+m[10]*P[k+2]+m[14]];for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],v[i]);mx[i]=Math.max(mx[i],v[i]);}}return [b.name,mn,mx]}))()"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1456,'height':819},offline=True).new_page()
    errs=[]; pg.on('console',lambda m: print('CON',m.text) if 'B-rep' in m.text else None); pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def click(pt): c=scr(pt); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(200)
    def tick(idx): pg.evaluate("ix=>{const S=__mrt.S;S.sel.clear();ix.forEach(i=>S.sel.add(S.bodies[i]));}",idx); pg.wait_for_timeout(100)
    def view():   # looking down at the cylinder from the front (-Y) and above
        pg.evaluate("(()=>{const c=__mrt.cam();const a=0.75;c.R=[1,0,0,0,Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a)];c.target=[0,0,10];})()"); pg.wait_for_timeout(250)
    pg.set_input_files('#file',[S+'/rd_chamf.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    pg.evaluate("document.getElementById('bFit').click()"); pg.wait_for_timeout(200); view()
    v0=pg.evaluate("("+VOL+")(__mrt.S.bodies[0])")
    # ---------- Replace face: the chamfer onto the top plane
    pg.click('#b_replace'); pg.wait_for_timeout(200)
    click([0,-9,19])
    n=pg.evaluate("document.querySelector('.selbox[data-box=faces] .cnt').textContent")
    ok('The chamfer (curved face) can be picked as a face to replace',n=='1',n)
    pg.click('.selbox[data-box=target]'); click([0,-2,20])
    ok('Top plane picked as the target',pg.evaluate("document.querySelector('.selbox[data-box=target] .cnt').textContent")=='1')
    pg.click('#odOk'); idle()
    B=pg.evaluate(BOX)[0]; v1=pg.evaluate("("+VOL+")(__mrt.S.bodies[0])")
    exact=24*100*math.sin(2*math.pi/48)*20
    cl=pg.evaluate("(()=>{const b=__mrt.S.bodies[0];const t=__mrt.core.topology(b.geo.indices,b.geo.positions.length/3);return t.border==0&&t.nonManifold==0})()")
    ok('Chamfer gone: a plain cylinder 20 high, closed, right volume',abs(B[2][2]-20)<1e-3 and abs(v1-exact)<1 and cl,[round(v0,1),round(v1,1),round(exact,1),B[2][2],cl])
    pg.click('#bUndo'); idle()
    ok('Undo brings the chamfer back',abs(pg.evaluate("("+VOL+")(__mrt.S.bodies[0])")-v0)<0.5)
    # ---------- Pattern: one ribbon button
    ok('One Pattern button (no separate Linear / Circular buttons)',pg.locator('#b_pattern').count()==1 and pg.locator('#b_patlin').count()==0 and pg.locator('#b_patcir').count()==0)
    tick([0]); pg.click('#b_pattern'); pg.wait_for_timeout(200)
    ok('Pattern panel opens with Linear / Circular choice',pg.is_visible('#pop_pat') and pg.is_visible('#patSeg button[data-k=cir]'))
    pg.click('#patSeg button[data-k=lin]'); pg.click('#patPickD'); pg.wait_for_timeout(100)
    click([0,-2,20])     # the top face: its normal (+Z)
    r=pg.evaluate("[document.getElementById('patDir').value,__mrt.S.pat.pickD&&__mrt.S.pat.pickD.d]")
    ok('Direction picked from a flat face normal',r[0]=='pickD' and r[1] and abs(abs(r[1][2])-1)<1e-6,r)
    pg.fill('#patN','2'); pg.dispatch_event('#patN','input'); pg.fill('#patGap','30'); pg.dispatch_event('#patGap','input'); pg.wait_for_timeout(200)
    pg.click('#patOk'); idle()
    B=pg.evaluate(BOX); zs=sorted(round(x[1][2],3) for x in B)
    ok('Linear copy 30 mm along the picked normal',len(B)==2 and zs==[0,30],zs)
    pg.click('#bUndo'); idle()
    # circular: axis from the cylinder side, pattern a small copy placed off the axis
    pg.evaluate("(()=>{const b=__mrt.S.bodies[0];})()")
    tick([0]); pg.click('#b_pattern'); pg.wait_for_timeout(200); pg.click('#patSeg button[data-k=cir]'); pg.click('#patPickA'); pg.wait_for_timeout(100)
    click([0,-10,8])     # the cylindrical side: its axis (Z through the origin)
    r=pg.evaluate("[document.getElementById('patAx').value,__mrt.S.pat.pickA&&__mrt.S.pat.pickA.d,__mrt.S.pat.pickA&&__mrt.S.pat.pickA.p]")
    ok('Axis picked from a cylindrical face',r[0]=='pickA' and abs(abs(r[1][2])-1)<1e-3 and math.hypot(r[2][0],r[2][1])<0.05,r)
    # an edge: the straight seam is not there, so check a box edge on a second body
    pg.evaluate("document.querySelector('#pop_pat .popx').click()"); pg.wait_for_timeout(150)
    pg.set_input_files('#file',[S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    B=pg.evaluate(BOX)[1]; mn,mx=B[1],B[2]
    pg.evaluate("document.getElementById('bFit').click()"); pg.wait_for_timeout(200)
    tick([1]); pg.click('#b_pattern'); pg.wait_for_timeout(200); pg.click('#patSeg button[data-k=lin]'); pg.click('#patPickD'); pg.wait_for_timeout(100)
    click([(mn[0]+mx[0])/2+3,mn[1],mx[2]])   # the top front edge (along X)
    r=pg.evaluate("[__mrt.S.pat.pickD.n,__mrt.S.pat.pickD.d]")
    ok('Direction picked from a straight edge',abs(abs(r[1][0])-1)<1e-3,r)
    # ---------- Remove face on a B-rep solid: the fillet of a block comes off and the solid stays B-rep
    pg.click('#bNew'); idle()
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e&&e.checked!==false){e.click()}})()")
    def skclick(x,y):
        c=scr([x,y,0]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(120)
    pg.click('#bSketch'); pg.click('#skplane [data-pl=top]'); pg.wait_for_timeout(200)
    pg.evaluate("(()=>{const c=__mrt.cam();c.zoom=60;c.target=[20,15,0];})()"); pg.uncheck('#skGrid')
    pg.click('#sktools [data-sk=rect]'); skclick(0,0); skclick(40,30)
    pg.keyboard.press('Escape'); pg.click('#skOk'); pg.wait_for_timeout(200)
    pg.click('#sketchList .srow:nth-child(1)'); pg.keyboard.press('e'); pg.wait_for_timeout(200)
    pg.fill('#fDepth','20'); pg.dispatch_event('#fDepth','input'); pg.wait_for_timeout(200); pg.click('#fOk'); idle()
    B=pg.evaluate(BOX)[0]; mn,mx=B[1],B[2]; W=mx[0]-mn[0]
    pg.evaluate("document.getElementById('bFit').click()"); pg.evaluate("document.getElementById('bIso').click()"); pg.wait_for_timeout(200)
    pg.click('#bodyList .brow:nth-child(1)'); pg.keyboard.press('Shift+F'); pg.wait_for_timeout(150)
    q=scr([(mn[0]+mx[0])/2,mn[1],mx[2]]); pg.mouse.move(*q); pg.wait_for_timeout(60); pg.mouse.click(*q); pg.wait_for_timeout(80)
    pg.fill('#odV','3'); pg.dispatch_event('#odV','input'); pg.wait_for_timeout(1500); idle(); pg.click('#odOk'); idle()
    v1=pg.evaluate("("+VOL+")(__mrt.S.bodies[0])")
    pg.click('#ribbon button.popb[data-pop=rf]'); pg.wait_for_timeout(150)
    pg.evaluate("""(()=>{const S=__mrt.S,b=S.bodies[0];__mrt.rdSetBody(b);const P=b.geo.positions,I=b.geo.indices;
      for(let t=0;t<I.length/3;t++){const a=3*I[t],c=3*I[t+1],d=3*I[t+2];const u=[P[c]-P[a],P[c+1]-P[a+1],P[c+2]-P[a+2]],w=[P[d]-P[a],P[d+1]-P[a+1],P[d+2]-P[a+2]];
        const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],l=Math.hypot(...n);if(l<1e-12)continue;
        if(Math.max(Math.abs(n[0]),Math.abs(n[1]),Math.abs(n[2]))/l<0.999)S.rd.sel[t]=1;}
      __mrt.rdChanged();})()""")
    pg.click('#rfOk'); idle()
    r=pg.evaluate("(()=>{const b=__mrt.S.bodies[0];return {solid:!!b.solid,brep:!!(b.geo&&b.geo.brep),feats:b.solid&&b.solid.feats?b.solid.feats.map(f=>f.type):null}})()")
    v2=pg.evaluate("("+VOL+")(__mrt.S.bodies[0])")
    ok('B-rep Remove face: fillet removed by the engine, solid stays B-rep, sharp block volume',r['solid'] and r['brep'] and abs(v2-W*(mx[1]-mn[1])*(mx[2]-mn[2]))<0.5 and v1<v2-1,[r,round(v1,2),round(v2,2),W*(mx[1]-mn[1])*(mx[2]-mn[2])])
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
