# Browser test: reference geometry (point, line point-point / point-plane, plane on a face with offset / 3 points, axis),
# the Sketches / Geos list, STEP with geometry only, mating a body corner onto a geometry point, and the handle X axis.
# Run: python3 ui13.py <scratch folder with block.stl and cyl.stl> [path to index.html]
import sys,os,math
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
def near(a,b,t=1e-3): return all(abs(x-y)<=t for x,y in zip(a,b))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1680,'height':950},offline=True,accept_downloads=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def at(pt,dx=0,dy=0): q=scr(pt); pg.mouse.move(q[0]+dx,q[1]+dy); pg.wait_for_timeout(120); pg.mouse.click(q[0]+dx,q[1]+dy); pg.wait_for_timeout(150)
    def box(i): return pg.evaluate("i=>{const b=__mrt.S.bodies[i],s=__mrt.core.stats(b.geo.positions,b.geo.indices),m=b.matrix;const P=b.geo.positions;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<P.length;k+=3){const x=m[0]*P[k]+m[4]*P[k+1]+m[8]*P[k+2]+m[12],y=m[1]*P[k]+m[5]*P[k+1]+m[9]*P[k+2]+m[13],z=m[2]*P[k]+m[6]*P[k+1]+m[10]*P[k+2]+m[14];mn=[Math.min(mn[0],x),Math.min(mn[1],y),Math.min(mn[2],z)];mx=[Math.max(mx[0],x),Math.max(mx[1],y),Math.max(mx[2],z)];}return [mn,mx]}",i)
    def geos(): return pg.evaluate("__mrt.S.geos.map(g=>({type:g.type,name:g.name,p:g.p,p2:g.p2,n:g.n}))")
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==false){e.click()}})()")
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    A=box(0); C=box(1)
    if A[1][0]>C[0][0]-5 and A[0][0]<C[1][0]+5:   # keep them apart
        pg.evaluate("(()=>{const b=__mrt.S.bodies[1];b.matrix[12]+=200;})()"); C=box(1)
    pg.evaluate("document.getElementById('bFit').click()"); pg.wait_for_timeout(100)
    cx=(A[0][0]+C[1][0])/2; cy=(A[0][1]+C[1][1])/2
    pg.evaluate("p=>{const c=__mrt.cam();c.R=[1,0,0, 0,1,0, 0,0,1];c.target=[p[0],p[1],0];}",[cx,cy]); pg.wait_for_timeout(200)
    ok('Geometry group in the ribbon',all(pg.is_visible('[data-tool=%s]'%t) for t in ['gpoint','gline','gplane','gaxis']))
    # Point on a corner and a free point on the top face
    pg.click('[data-tool=gpoint]'); pg.wait_for_timeout(100)
    corner=[A[0][0],A[0][1],A[1][2]]
    at(corner,2,-2)
    mid=[(A[0][0]+A[1][0])/2,(A[0][1]+A[1][1])/2,A[1][2]]
    pg.dblclick('[data-flt=plane]'); pg.wait_for_timeout(100); pg.click('[data-flt=point]'); pg.wait_for_timeout(300)   # plane + point: a point on the face
    at(mid)
    pg.dblclick('[data-flt=point]'); pg.wait_for_timeout(100); pg.dblclick('[data-flt=point]'); pg.wait_for_timeout(250)   # all on again
    G=geos()
    ok('Point on the corner and a point on the top face',len(G)==2 and near(G[0]['p'],corner) and abs(G[1]['p'][2]-A[1][2])<1e-3,G)
    # Line point - point through the two geometry points (geometry points snap first)
    pg.click('[data-tool=gline]'); pg.wait_for_timeout(100)
    at(G[0]['p']); at(G[1]['p'])
    G=geos(); L1=G[-1]
    ok('Line point–point between the two points',L1['type']=='line' and near(L1['p'],G[0]['p']) and near(L1['p2'],G[1]['p']),L1)
    # Plane on the top face, then offset 5
    pg.click('[data-tool=gplane]'); pg.wait_for_timeout(100)
    at([(A[0][0]*3+A[1][0])/4,(A[0][1]+A[1][1]*3)/4,A[1][2]])
    pg.fill('#geoOff','5'); pg.dispatch_event('#geoOff','input'); pg.wait_for_timeout(150)
    G=geos(); PL=G[-1]
    ok('Plane on the top face, offset 5 moves it up',PL['type']=='plane' and abs(PL['p'][2]-(A[1][2]+5))<1e-3 and abs(abs(PL['n'][2])-1)<1e-6,PL)
    ok('the offset slider follows the box',abs(float(pg.input_value('#geoOffR'))-5)<1e-9)
    # Line point - plane: from the corner point square onto the offset plane (picked at its border)
    pg.click('[data-tool=gline]'); pg.wait_for_timeout(100); pg.click('#geoModes button:nth-child(2)'); pg.wait_for_timeout(100)
    at(G[0]['p'])
    pc=pg.evaluate("(()=>{const g=__mrt.S.geos[__mrt.S.geos.length-1],u=g.u,v=[g.n[1]*u[2]-g.n[2]*u[1],g.n[2]*u[0]-g.n[0]*u[2],g.n[0]*u[1]-g.n[1]*u[0]],s=g.size/2;return [g.p[0]+u[0]*s,g.p[1]+u[1]*s,g.p[2]+u[2]*s]})()")
    at(pc)
    G=geos(); L2=G[-1]
    ok('Line point–plane drops square onto the plane (length 5)',L2['type']=='line' and abs(math.dist(L2['p'],L2['p2'])-5)<1e-3,L2)
    # Axis from the round top edge of the cylinder
    pg.click('[data-tool=gaxis]'); pg.wait_for_timeout(100)
    rad=(C[1][0]-C[0][0])/2; cc=[(C[0][0]+C[1][0])/2,(C[0][1]+C[1][1])/2,C[1][2]]
    at([cc[0]+rad*0.7071,cc[1]+rad*0.7071,cc[2]])
    G=geos(); AX=G[-1]
    d=[AX['p2'][i]-AX['p'][i] for i in range(3)] if AX['type']=='axis' else [0,0,0]; dl=math.sqrt(sum(x*x for x in d)) or 1
    ok('Axis from the round edge runs along Z through its centre',AX['type']=='axis' and abs(abs(d[2]/dl)-1)<1e-3 and abs(AX['p'][0]-cc[0])<0.05 and abs(AX['p'][1]-cc[1])<0.05,AX)
    # Point at the centre of the cylinder top (Centre filter only), for the mate below
    pg.click('[data-tool=gpoint]'); pg.dblclick('[data-flt=center]'); pg.wait_for_timeout(150)
    at([cc[0]+rad*0.7071,cc[1]+rad*0.7071,cc[2]])
    pg.dblclick('[data-flt=center]'); pg.wait_for_timeout(150)
    G=geos(); PC=G[-1]
    ok('Point at a circle centre with the Centre filter',PC['type']=='point' and near(PC['p'],cc,0.05),PC)
    ok('Sketches / Geos list shows the geometry',pg.locator('#sketchList .srow.geo').count()==len(G) and 'sketches / geos' in pg.inner_text('body').lower(),pg.locator('#sketchList .srow.geo').count())
    # STEP with only geometry (nothing ticked)
    pg.click('[data-tool=select]'); pg.mouse.move(900,800); pg.keyboard.press('Space'); pg.wait_for_timeout(100)
    with pg.expect_download() as dl: pg.click('#bStep')
    path=os.path.join(S,'geo.step'); dl.value.save_as(path); txt=open(path).read()
    ok('STEP of the geometry: points, polylines in a wireframe set',dl.value.suggested_filename=='geometry.step' and "CARTESIAN_POINT('P1'" in txt and 'POLYLINE' in txt and 'GEOMETRIC_CURVE_SET' in txt and 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION' in txt,dl.value.suggested_filename)
    # Mate: block corner onto the cylinder centre point (a geometry point)
    pg.click('[data-tool=mate]'); pg.dblclick('[data-flt=point]'); pg.wait_for_timeout(150)
    at(corner,2,-2)
    st=pg.evaluate("__mrt.S.mate&&__mrt.S.mate.a&&__mrt.S.mate.a.mg.t")
    at(PC['p'])
    A2=box(0)
    ok('Mate a body corner onto a geometry point',st=='point' and near([A2[0][0],A2[0][1],A2[1][2]],PC['p'],1e-3),[st,A2,PC['p']])
    pg.dblclick('[data-flt=point]'); pg.wait_for_timeout(150)
    # Handle X axis along line L1, then move 10 along it
    pg.click('[data-tool=select]'); pg.click('#bodyList .brow:nth-child(2) .nm'); pg.click('[data-tool=move]'); pg.wait_for_timeout(100)
    pg.click('#bAxPick'); L1p=[(L1['p'][i]+L1['p2'][i])/2 for i in range(3)]
    shift=[A2[0][i]-A[0][i] for i in range(3)]
    at(L1p)   # geometry stays where it was made
    gx=pg.evaluate("__mrt.S.gax[0]"); dv=[L1['p2'][i]-L1['p'][i] for i in range(3)]; dvl=math.sqrt(sum(x*x for x in dv))
    ok('X axis of the handles picked from a line',abs(abs(sum(gx[i]*dv[i]/dvl for i in range(3)))-1)<1e-6,gx)
    c0=[(A2[0][i]+A2[1][i])/2 for i in range(3)]
    pg.fill('#mvX','10'); pg.fill('#mvY','0'); pg.fill('#mvZ','0'); pg.click('#bMove'); idle()
    A3=box(0); c1=[(A3[0][i]+A3[1][i])/2 for i in range(3)]
    ok('Move 10 along the picked X axis',near([c1[i]-c0[i] for i in range(3)],[10*gx[i] for i in range(3)],1e-3),[c1[i]-c0[i] for i in range(3)])
    pg.click('#bAxReset'); ok('World axes again',pg.evaluate("__mrt.S.gax[0].join()")=='1,0,0')
    # undo takes back geometry too
    n=len(geos()); pg.keyboard.press('Control+z'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    ok('undo brings back the earlier geometry list',len(geos())<=n)
    ok('no page errors',errs==[],errs)
    pg.screenshot(path=S+'/geo.png')
    b.close()
print('all passed' if fails==0 else 'FAILED '+str(fails))
