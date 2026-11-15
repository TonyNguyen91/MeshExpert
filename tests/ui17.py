# Browser test: Reverse Design → Basic Surface Recognition. Click a patch (it grows over the smooth surface and turns red),
# paint with the brush (Ctrl erases), recognise plane / cylinder / sphere / cone, and build B-rep solids plus axis / centre geometry.
# Run: python3 make_rd_meshes.py <fixtures>; python3 ui17.py <fixtures folder> [path to index.html]
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
    pg=b.new_context(viewport={'width':1456,'height':819},offline=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def view(R,target,zoom=None):
        pg.evaluate("a=>{const c=__mrt.cam();c.R=a[0];c.target=a[1];if(a[2])c.zoom=a[2];}",[R,target,zoom]); pg.wait_for_timeout(250)
    FRONT=[1,0,0, 0,0,1, 0,-1,0]
    pg.set_input_files('#file',[S+'/cyl.stl',S+'/rd_sphere.stl',S+'/rd_cone.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    nb0=pg.evaluate("__mrt.S.bodies.length"); ng0=pg.evaluate("__mrt.S.geos.length")
    ok('Reverse Design group on the ribbon',pg.locator('#ribbon button.popb[data-pop=rd]').count()==1 and 'Reverse Design' in pg.inner_text('#ribbon'))
    pg.click('#ribbon button.popb[data-pop=rd]'); pg.wait_for_timeout(150)
    view(FRONT,[0,0,12])
    # ---- click the cylinder side: the whole side, not the caps
    c=scr([0,-8,12]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(250)
    n=pg.evaluate("__mrt.S.rd.n"); f=pg.evaluate("(()=>{const F=__mrt.S.rd.fit;return F&&F.f?{k:F.k,r:F.f.r,a:F.f.a,len:F.f.t1-F.f.t0,rms:F.f.rms}:null})()")
    ok('Click picks the smooth side only (stops at the sharp cap edges)',n==96,n)
    ok('Automatic: recognised as a cylinder R 8, length 25, axis Z',f and f['k']=='cyl' and abs(f['r']-8)<0.05 and abs(f['len']-25)<0.05 and abs(abs(f['a'][2])-1)<1e-3,f)
    rc=scr([4.6,-6.55,6]); px=pg.screenshot(clip={'x':rc[0]-2,'y':rc[1]-2,'width':4,'height':4})
    from PIL import Image; import io
    im=Image.open(io.BytesIO(px)).convert('RGB').getpixel((2,2))
    ok('Picked triangles are drawn red',im[0]>150 and im[1]<90 and im[2]<90,im)
    pg.click('#rdOk'); idle()
    B=pg.evaluate("__mrt.S.bodies.slice(-1)[0]"); bs=pg.evaluate("(()=>{const b=__mrt.S.bodies.slice(-1)[0];return {name:b.name,brep:!!b.geoBrep,type:b.solid&&b.solid.type,mesh:!!b.solid&&b.solid.fromMesh,min:b.geo.min,max:b.geo.max}})()")
    ok('Apply builds a B-rep cylinder solid of the same size',pg.evaluate("__mrt.S.bodies.length")==nb0+1 and bs['brep'] and bs['type']=='extrude' and abs(bs['max'][2]-bs['min'][2]-25)<0.1 and abs(bs['max'][0]-bs['min'][0]-16)<0.1,bs)
    ok('…plus its axis as geometry',pg.evaluate("__mrt.S.geos.length")==ng0+1 and pg.evaluate("__mrt.S.geos.slice(-1)[0].type")=='axis')
    ok('Selection cleared after Apply',pg.evaluate("__mrt.S.rd.n")==0)
    pg.evaluate("(()=>{const b=__mrt.S.bodies.slice(-1)[0];b.visible=false;})()"); pg.wait_for_timeout(100)
    # ---- top cap: plane
    view([1,0,0, 0,1,0, 0,0,1],[0,0,25])
    c=scr([2,2,25]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(200)
    f=pg.evaluate("(()=>{const F=__mrt.S.rd.fit;return F&&F.f?{k:F.k,n:F.f.n,rms:F.f.rms}:null})()")
    ok('Top cap recognised as a plane, normal Z',f and f['k']=='plane' and abs(abs(f['n'][2])-1)<1e-4,f)
    pg.click('#rdOk'); idle()
    ok('A plane becomes Plane geometry',pg.evaluate("__mrt.S.geos.slice(-1)[0].type")=='plane' and pg.evaluate("__mrt.S.bodies.length")==nb0+1)
    # ---- sphere
    view(FRONT,[50,0,10])
    c=scr([50,-10,10]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(250)
    f=pg.evaluate("(()=>{const F=__mrt.S.rd.fit;return F&&F.f?{k:F.k,r:F.f.r,c:F.f.c}:null})()")
    ok('Sphere recognised (R 10, centre 50,0,10)',f and f['k']=='sphere' and abs(f['r']-10)<0.15 and math.dist(f['c'],[50,0,10])<0.1,f)
    pg.click('#rdOk'); idle()
    s=pg.evaluate("(()=>{const b=__mrt.S.bodies.slice(-1)[0];return {brep:!!b.geoBrep,t:b.solid&&b.solid.type,d:b.geo.max[0]-b.geo.min[0]}})()")
    ok('Sphere solid built (B-rep revolve, Ø ≈ 20) with its centre point',s['brep'] and s['t']=='revolve' and abs(s['d']-f['r']*2)<0.2 and pg.evaluate("__mrt.S.geos.slice(-1)[0].type")=='point',s)
    pg.evaluate("(()=>{const b=__mrt.S.bodies.slice(-1)[0];b.visible=false;})()")
    # ---- cone: forced method, and brush painting
    view(FRONT,[-50,0,10])
    pg.check('#rdModeB'); pg.fill('#rdBrush','3'); pg.dispatch_event('#rdBrush','input')
    a=scr([-50,-9.2,4]); z=scr([-50,-5.6,16])
    pg.mouse.move(a[0],a[1]); pg.mouse.down(); pg.mouse.move(z[0],z[1],steps=12); pg.mouse.up(); pg.wait_for_timeout(250)
    n1=pg.evaluate("__mrt.S.rd.n"); ok('Brush paints triangles',n1>10,n1)
    e1=scr([-50,-7.4,10]); pg.keyboard.down('Control'); pg.mouse.move(e1[0],e1[1]); pg.mouse.down(); pg.mouse.up(); pg.keyboard.up('Control'); pg.wait_for_timeout(250)
    n2=pg.evaluate("__mrt.S.rd.n"); ok('Ctrl + brush erases',n2<n1,(n1,n2))
    pg.check('#rdModeC'); pg.click('#rdClr'); c=scr([-50,-7,10]); pg.mouse.click(c[0],c[1]); pg.wait_for_timeout(250)
    f=pg.evaluate("(()=>{const F=__mrt.S.rd.fit;return F&&F.f?{k:F.k,half:F.f.half,r0:F.f.r0+F.f.k*F.f.t0,r1:F.f.r0+F.f.k*F.f.t1}:null})()")
    want=math.degrees(math.atan(6/20))
    ok('Cone recognised automatically (half angle ≈ %.2f°, R 10 → 4)'%want,f and f['k']=='cone' and abs(f['half']-want)<0.3 and abs(min(f['r0'],f['r1'])-4)<0.15 and abs(max(f['r0'],f['r1'])-10)<0.15,f)
    pg.check('input[name=rdMeth][value=cyl]'); pg.wait_for_timeout(150)
    ok('Forcing Cylinder reports a large error',pg.evaluate("__mrt.S.rd.fit.k")=='cyl' and 'warn' in pg.get_attribute('#rdRes','class'))
    pg.check('input[name=rdMeth][value=auto]'); pg.wait_for_timeout(100)
    pg.click('#rdOk'); idle()
    s=pg.evaluate("(()=>{const b=__mrt.S.bodies.slice(-1)[0];return {brep:!!b.geoBrep,t:b.solid&&b.solid.type,h:b.geo.max[2]-b.geo.min[2],w:b.geo.max[0]-b.geo.min[0]}})()")
    ok('Cone solid built (B-rep revolve, height 20, Ø 20)',s['brep'] and s['t']=='revolve' and abs(s['h']-20)<0.2 and abs(s['w']-20)<0.3,s)
    pg.click('#bUndo'); idle()
    ok('Undo removes the cone solid and its geometry',pg.evaluate("__mrt.S.bodies.length")==nb0+2)
    ok('No page errors',not errs,errs)
    b.close()
print('ALL OK' if not fails else '%d FAIL'%fails); sys.exit(1 if fails else 0)
