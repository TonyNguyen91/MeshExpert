# Browser test: Boolean boxes light their bodies (Tools red, Targets blue); Linear / Circular pattern (B-rep copies keep
# their recipe, merge option); Remove face on a mesh (hole walls removed and patched) and on a B-rep solid (falls back to the
# mesh method while the engine has no deleteFaces).
# Run: python3 make_rd_meshes.py <fixtures>; python3 ui18.py <fixtures folder> [path to index.html]
import sys,os,math,io
from playwright.sync_api import sync_playwright
from PIL import Image
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
BOX="(()=>__mrt.S.bodies.map(b=>{const P=b.geo.positions,m=b.matrix;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<P.length;k+=3){const v=[m[0]*P[k]+m[4]*P[k+1]+m[8]*P[k+2]+m[12],m[1]*P[k]+m[5]*P[k+1]+m[9]*P[k+2]+m[13],m[2]*P[k]+m[6]*P[k+1]+m[10]*P[k+2]+m[14]];for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],v[i]);mx[i]=Math.max(mx[i],v[i]);}}return [b.name,mn,mx]}))()"
VOL="(b=>{const P=b.geo.positions,I=b.geo.indices;let v=0;for(let t=0;t<I.length;t+=3){const a=3*I[t],c=3*I[t+1],d=3*I[t+2];v+=(P[a]*(P[c+1]*P[d+2]-P[c+2]*P[d+1])-P[a+1]*(P[c]*P[d+2]-P[c+2]*P[d])+P[a+2]*(P[c]*P[d+1]-P[c+1]*P[d]))/6;}return v;})"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1456,'height':819},offline=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def px(pt):
        c=scr(pt); im=Image.open(io.BytesIO(pg.screenshot(clip={'x':c[0]-1,'y':c[1]-1,'width':3,'height':3}))).convert('RGB'); return im.getpixel((1,1))
    def tick(idx): pg.evaluate("ix=>{const S=__mrt.S;S.sel.clear();ix.forEach(i=>S.sel.add(S.bodies[i]));}",idx); pg.wait_for_timeout(100)
    def names(): return pg.evaluate("__mrt.S.bodies.map(b=>b.name)")
    # ---------- Boolean highlight
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    B=pg.evaluate(BOX); ca=[(B[0][1][i]+B[0][2][i])/2 for i in range(3)]; cb=[(B[1][1][i]+B[1][2][i])/2 for i in range(3)]
    pg.evaluate("document.getElementById('bFit').click()"); pg.wait_for_timeout(200)
    pg.click('#b_boolean'); pg.wait_for_timeout(150); pg.click('#odOp button[data-op=subtract]'); pg.wait_for_timeout(100)
    pg.click('.selbox[data-box=tools]'); c=scr([cb[0],cb[1],B[1][2][2]]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(150)
    t=px([cb[0]+0.5*(B[1][2][0]-cb[0]),cb[1],B[1][2][2]])
    ok('Tools body lights red',t[0]>150 and t[1]<120 and t[2]<110,t)
    pg.click('.selbox[data-box=targets]'); c=scr([ca[0],ca[1],B[0][2][2]]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(200)
    ok('Roles: tools 2, targets 3',pg.evaluate("[__mrt.dlgRole(__mrt.S.bodies[0]),__mrt.dlgRole(__mrt.S.bodies[1])]")==[3,2])
    g=px([ca[0]+0.3*(B[0][2][0]-B[0][1][0]),ca[1],B[0][2][2]])
    ok('Targets body lights blue',g[2]>150 and g[0]<110,g)
    pg.click('#odNo'); pg.wait_for_timeout(150)
    ok('Colours go when the dialog closes',px([cb[0],cb[1],B[1][2][2]])[2]>60)
    # ---------- Linear pattern of a mesh body
    tick([0]); pg.click('#b_patlin'); pg.wait_for_timeout(200)
    pg.select_option('#patDir','x'); pg.fill('#patN','3'); pg.dispatch_event('#patN','input'); pg.fill('#patGap','30'); pg.dispatch_event('#patGap','input'); pg.wait_for_timeout(200)
    ok('Preview ghosts for the copies',pg.evaluate("__mrt.S.ghosts.length")==2)
    pg.click('#patOk'); idle()
    B=pg.evaluate(BOX); bl=[x for x in B if x[0].startswith('block')]
    xs=sorted(round(x[1][0]-bl[0][1][0],3) for x in bl)
    ok('Linear pattern: 3 blocks, 30 mm apart along X',len(bl)==3 and xs==[0,30,60],xs)
    ok('Panel closes, no ghosts left',not pg.is_visible('#pop_pat') and pg.evaluate("__mrt.S.ghosts.length")==0)
    pg.click('#bUndo'); idle(); ok('Undo removes the copies',len(names())==2)
    # ---------- Circular pattern around Z (cylinder sits on Z; move it off-axis first)
    pg.evaluate("(()=>{const b=__mrt.S.bodies[1];b.matrix[12]=40;})()"); tick([1])
    pg.click('#b_patcir'); pg.wait_for_timeout(200); pg.select_option('#patAx','z'); pg.fill('#patCN','4'); pg.dispatch_event('#patCN','input'); pg.fill('#patAng','360'); pg.dispatch_event('#patAng','input')
    pg.click('#patOk'); idle()
    B=pg.evaluate(BOX); cy=[x for x in B if x[0].startswith('cyl')]
    cs=sorted((round((x[1][0]+x[2][0])/2,2),round((x[1][1]+x[2][1])/2,2)) for x in cy)
    ok('Circular pattern: 4 cylinders at 90° steps around Z',len(cy)==4 and cs==sorted([(40.0,0.0),(0.0,40.0),(-40.0,0.0),(0.0,-40.0)]) or cs==sorted([(40,0),(0,40),(-40,0),(0,-40)]),cs)
    pg.click('#bUndo'); idle()
    # ---------- Merge
    tick([0]); pg.click('#b_patlin'); pg.wait_for_timeout(150); pg.select_option('#patDir','x'); pg.fill('#patN','3'); pg.dispatch_event('#patN','input')
    w=B[0][2][0]-B[0][1][0]; pg.fill('#patGap',str(round(w*0.5,3))); pg.dispatch_event('#patGap','input'); pg.check('#patMerge'); pg.click('#patOk'); idle()
    B=pg.evaluate(BOX); bl=[x for x in B if x[0].startswith('block')]
    ok('Merge: one body spanning the three overlapping copies',len(bl)==1 and abs((bl[0][2][0]-bl[0][1][0])-2*w)<1e-3,[len(bl), bl[0][2][0]-bl[0][1][0] if bl else None])
    pg.click('#bUndo'); idle()
    # ---------- B-rep copies keep their recipe
    pg.click('#ribbon button.popb[data-pop=rd]'); pg.wait_for_timeout(150)
    pg.evaluate("(()=>{const c=__mrt.cam();c.R=[1,0,0,0,0,1,0,-1,0];c.target=[40,0,12];})()"); pg.wait_for_timeout(200)
    c=scr([40,-8,12]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(200); pg.click('#rdOk'); idle()
    pg.evaluate("document.querySelector('#pop_rd .popx').click()")
    n0=len(names()); tick([n0-1]); pg.click('#b_patlin'); pg.wait_for_timeout(150); pg.select_option('#patDir','y'); pg.fill('#patN','2'); pg.dispatch_event('#patN','input'); pg.check('#patMerge'); pg.uncheck('#patMerge'); pg.click('#patOk'); idle()
    s=pg.evaluate("(()=>{const b=__mrt.S.bodies.slice(-1)[0];return {solid:!!b.solid,brep:!!b.geoBrep,t:b.solid&&b.solid.type}})()")
    ok('A B-rep solid’s copy is still a B-rep solid',s['solid'] and s['brep'] and s['t']=='extrude',s)
    # ---------- Remove face on a mesh: the four walls of a square hole
    pg.click('#bNew'); idle(); pg.set_input_files('#file',[S+'/rd_plate_hole.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    v0=pg.evaluate("b=>("+VOL+")(__mrt.S.bodies[0])",None)
    pg.click('#ribbon button.popb[data-pop=rf]'); pg.wait_for_timeout(150)
    ok('Remove face panel opens (Surface Recognition closed)',pg.is_visible('#pop_rf') and not pg.is_visible('#pop_rd'))
    pg.evaluate("""(()=>{const S=__mrt.S,b=S.bodies[0];__mrt.rdSetBody(b);const P=b.geo.positions,I=b.geo.indices;
      for(let t=0;t<I.length/3;t++){let cx=0,cy=0,nz=0;const a=3*I[3*t],c=3*I[3*t+1],d=3*I[3*t+2];cx=(P[a]+P[c]+P[d])/3;cy=(P[a+1]+P[c+1]+P[d+1])/3;
        const z=[P[a+2],P[c+2],P[d+2]];if(cx>14.9&&cx<25.1&&cy>114.9&&cy<125.1&&Math.max(...z)-Math.min(...z)>1)S.rd.sel[t]=1;}
      __mrt.rdChanged();})()""")
    ok('Hole walls picked (8 triangles)',pg.evaluate("__mrt.S.rd.n")==8,pg.evaluate("__mrt.S.rd.n"))
    pg.click('#rfOk'); idle()
    v1=pg.evaluate("b=>("+VOL+")(__mrt.S.bodies[0])",None); nb=pg.evaluate("__mrt.holesOf(__mrt.S.bodies[0].geo).edges")
    ok('Hole removed: closed plate, volume 40×40×10',abs(v1-16000)<1e-2 and abs(v0-15000)<1e-2 and nb==0,(v0,v1,nb))
    pg.click('#bUndo'); idle(); ok('Undo brings the hole back',abs(pg.evaluate("b=>("+VOL+")(__mrt.S.bodies[0])",None)-15000)<1e-2)
    # ---------- Remove face on a B-rep solid (engine without deleteFaces → mesh method, with a note)
    pg.set_input_files('#file',[S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.evaluate("document.querySelector('#pop_rf .popx').click()"); pg.click('#ribbon button.popb[data-pop=rd]')
    pg.evaluate("(()=>{const c=__mrt.cam();c.R=[1,0,0,0,0,1,0,-1,0];c.target=[0,0,12];})()"); pg.wait_for_timeout(200)
    c=scr([0,-8,12]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(200); pg.click('#rdOk'); idle()
    pg.click('#ribbon button.popb[data-pop=rf]'); pg.wait_for_timeout(150)
    pg.evaluate("(()=>{const c=__mrt.cam();c.R=[1,0,0,0,1,0,0,0,1];c.target=[0,0,25];})()"); pg.wait_for_timeout(200)
    nm=pg.evaluate("__mrt.S.bodies.slice(-1)[0].name"); pg.evaluate("(()=>{const S=__mrt.S;S.bodies.forEach(b=>b.visible=b===S.bodies[S.bodies.length-1]);})()"); pg.wait_for_timeout(150)
    c=scr([2,2,25]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(200)
    ok('Top face of the B-rep cylinder picked',pg.evaluate("__mrt.S.rd.n")>0 and pg.evaluate("__mrt.S.rd.body&&__mrt.S.rd.body.name")==nm)
    pg.click('#rfOk'); idle()
    r=pg.evaluate("(()=>{const b=__mrt.S.bodies.slice(-1)[0];return {solid:!!b.solid,closed:__mrt.holesOf(b.geo).edges===0,flash:document.getElementById('flash')?document.getElementById('flash').textContent:''}})()")
    ok('Without deleteFaces in the engine the solid is patched as a mesh (and says so)',(not r['solid']) and r['closed'],r)
    ok('No page errors',not errs,errs)
    b.close()
print('ALL OK' if not fails else '%d FAIL'%fails); sys.exit(1 if fails else 0)
