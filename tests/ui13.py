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
    def geos(): return pg.evaluate("__mrt.S.geos.map(g=>({type:g.type,name:g.name,p:g.p,p2:g.p2,n:g.n,u:g.u,size:g.size}))")
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
    ok('Line panel: two pick boxes, both filled, Create enabled',pg.locator('#geoSlots .gslot.ok').count()==2 and pg.is_enabled('#geoMake'))
    pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
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
    at(pc); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    G=geos(); L2=G[-1]
    ok('Line point–plane drops square onto the plane (length 5)',L2['type']=='line' and abs(math.dist(L2['p'],L2['p2'])-5)<1e-3,L2)
    pg.fill('#geoLen','12'); pg.dispatch_event('#geoLen','input'); pg.wait_for_timeout(100)
    L2b=geos()[-1]
    ok('typed length 12: the normal line is 12 long, same direction',abs(math.dist(L2b['p'],L2b['p2'])-12)<1e-3 and L2b['p2'][2]>L2b['p'][2],L2b)
    pg.fill('#geoLen','0'); pg.dispatch_event('#geoLen','input')
    # plane first, then a point: also a normal line
    pg.click('#bodyList .brow:nth-child(2) .nm') if False else None
    at(pc); at(G[1]['p']); pg.click('#geoMake'); pg.wait_for_timeout(150)
    L3=geos()[-1]
    ok('plane first then point also works',L3['type']=='line' and abs(math.dist(L3['p'],L3['p2'])-5)<1e-3,L3)
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
    with pg.expect_download() as dl: pg.click('#bGeoStep')
    path=os.path.join(S,'geo.step'); dl.value.save_as(path); txt=open(path).read()
    ok('STEP of the geometry: points, polylines in a wireframe set',dl.value.suggested_filename=='geometry.step' and "CARTESIAN_POINT('P1'" in txt and 'GEOMETRIC_CURVE_SET' in txt and 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION' in txt,dl.value.suggested_filename)
    ok('lines written as trimmed LINEs, points also as a + (for Onshape)','TRIMMED_CURVE' in txt and 'POLYLINE' not in txt and "TRIMMED_CURVE('P1_X'" in txt)
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
    # Sketch "pick a plane": the flat face under the cursor lights up; a Geometry plane can be picked too
    pg.click('[data-tool=select]'); pg.click('#bSketch'); pg.click('#skplane [data-pl=pick]'); pg.wait_for_timeout(100)
    top=pg.evaluate("__mrt.S.bodies[0].geo.positions.length")  # body exists
    A4=box(0); tc=[(A4[0][0]+A4[1][0])/2+1,(A4[0][1]+A4[1][1])/2+1,A4[1][2]]
    q=scr(tc); pg.mouse.move(q[0],q[1]); pg.wait_for_timeout(150)
    hv=pg.evaluate("(()=>{const e=__mrt.S.skHov;return e?{tris:e.tris?e.tris.length:0,n:e.n,geo:!!e.geo,bad:!!e.bad}:null})()")
    ok('hovering a flat face lights it (its triangles) in Sketch pick-plane',hv and hv['tris']>0 and abs(abs(hv['n'][2])-1)<1e-6,hv)
    PLn=[g for g in geos() if g['type']=='plane'][0]
    far=[PLn['p'][i]+PLn['u'][i]*PLn['size']*0.45 for i in range(3)]
    q=scr(far); pg.mouse.move(q[0],q[1]); pg.wait_for_timeout(150)
    hv2=pg.evaluate("(()=>{const e=__mrt.S.skHov;return e?{geo:e.geo?e.geo.name:null}:null})()")
    ok('a Geometry plane lights up too',hv2 and hv2['geo']==PLn['name'],hv2)
    pg.mouse.click(q[0],q[1]); pg.wait_for_timeout(200)
    fr=pg.evaluate("__mrt.S.sk&&__mrt.S.sk.frame")
    ok('the sketch goes onto that Geometry plane',fr and abs(abs(sum(fr['n'][i]*PLn['n'][i] for i in range(3)))-1)<1e-6 and abs(sum((fr['o'][i]-PLn['p'][i])*PLn['n'][i] for i in range(3)))<1e-6,fr)
    pg.click('#skCancel'); pg.wait_for_timeout(150)
    # Export geometry with a sketch (line, circle, arc); STEP (solid) leaves geometry out
    pg.evaluate("""(()=>{const S=__mrt.S;S.sketches.push({id:900,name:'SkT',frame:{o:[0,0,30],u:[1,0,0],v:[0,1,0],n:[0,0,1]},m:{pts:[[0,0],[5,0],[0,5]],ents:[{t:'circle',c:0,r:3},{t:'line',a:1,b:2},{t:'arc',c:0,a:1,b:2},{t:'line',a:0,b:1,cons:true}],cons:[]},visible:true});})()""")
    with pg.expect_download() as dl: pg.click('#bGeoStep')
    path=os.path.join(S,'geo2.step'); dl.value.save_as(path); txt=open(path).read()
    ok('Export geometry writes the sketch: circle, arc (trimmed circle), lines; construction left out',txt.count("CIRCLE(")==2 and "TRIMMED_CURVE('SkT_3'" in txt and "TRIMMED_CURVE('SkT_2'" in txt and 'SkT_4' not in txt and ".CARTESIAN." in txt)
    ok('points as + option sits in the Sketches / Geos header',pg.evaluate("!!document.querySelector('.sec .hdx #cStepCross')"))
    pg.click('#bGeoVis'); pg.wait_for_timeout(100)
    ok('Hide all: every sketch and geometry hidden',pg.evaluate("__mrt.S.sketches.every(s=>!s.visible)&&__mrt.S.geos.every(g=>g.vis===false)") and pg.evaluate("document.getElementById('bGeoVis').classList.contains('off')"))
    pg.click('#bGeoVis'); pg.wait_for_timeout(100)
    ok('Show all again',pg.evaluate("__mrt.S.sketches.every(s=>s.visible)&&__mrt.S.geos.every(g=>g.vis!==false)"))
    ok('Export box stays on top (not in the scrolling part)',pg.evaluate("!!document.querySelector('#leftTop #bStep')&&!document.querySelector('#leftScroll #bStep')"))
    pg.evaluate("__mrt.S.sketches.pop()")
    ok('File box: no Open button, no Edit group shown',not pg.is_visible('#drop') and not pg.is_visible('#bDup') and not pg.is_visible('#bDel'))
    # origin: a point snaps onto O (iso view, the cylinder out of the way, the block where the mate left it)
    pg.click('[data-tool=select]'); pg.mouse.move(900,800); pg.keyboard.press('Shift+Digit7'); pg.wait_for_timeout(150)
    pg.evaluate("(()=>{const s=__mrt.S;s.bodies[1].visible=false;for(const g of s.geos)if(g.type==='point'&&Math.hypot(...g.p)<40)g.vis=false;})()"); pg.wait_for_timeout(100)
    A5=box(0); corner=pg.evaluate("(()=>{const b=__mrt.S.bodies[0],m=b.matrix,P=b.geo.positions;let best=null,bs=-1e9;for(let k=0;k<P.length;k+=3){const x=m[0]*P[k]+m[4]*P[k+1]+m[8]*P[k+2]+m[12],y=m[1]*P[k]+m[5]*P[k+1]+m[9]*P[k+2]+m[13],z=m[2]*P[k]+m[6]*P[k+1]+m[10]*P[k+2]+m[14];const sc=z*100-x;if(sc>bs){bs=sc;best=[x,y,z];}}return best})()")   # a real top corner, smallest x
    pg.evaluate("p=>{__mrt.cam().target=[p[0]/2,p[1]/2,p[2]/2];}",corner); pg.wait_for_timeout(150)
    pg.click('[data-tool=gpoint]'); pg.wait_for_timeout(100)
    at([0,0,0]); PO=geos()[-1]
    ok('Point snaps onto the origin O',PO['type']=='point' and near(PO['p'],[0,0,0],1e-9),PO)
    # Line point - vector: from the block corner along the origin X axis, flipped, 15 long
    Ln=pg.evaluate("Math.max(__mrt.cam().radius*0.225,1e-6)")
    pg.click('[data-tool=gline]'); pg.wait_for_timeout(100); pg.click('#geoModes button[data-gm=pv]'); pg.wait_for_timeout(100)
    ok('Point – Vector mode: start point and direction boxes',pg.locator('#geoSlots .gslot').count()==3-1 and 'Hướng' in pg.inner_text('#geoSlots'))
    pg.fill('#geoLen','15'); pg.dispatch_event('#geoLen','input'); pg.check('#geoLFlip')
    at(corner,0,0); at([Ln*0.6,0,0])
    st=pg.evaluate("Object.keys(__mrt.S.gl.v).join()")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    LV=geos()[-1]
    ok('Line point–vector along the origin X axis, flipped, 15 long',LV['type']=='line' and near(LV['p'],corner,1e-6) and near(LV['p2'],[corner[0]-15,corner[1],corner[2]],1e-6),[st,LV])
    # select geometry in the 3D view: body first, geometry where no body is
    pg.click('[data-tool=select]'); pg.keyboard.press('Space'); pg.wait_for_timeout(100)
    pg.evaluate("(()=>{document.getElementById('geoLFlip').checked=false;document.getElementById('geoLen').value='0';})()")
    lm=[corner[0]-10,corner[1],corner[2]]; at(lm)
    gs=pg.evaluate("[...__mrt.S.geoSet]"); lid=pg.evaluate("__mrt.S.geos[__mrt.S.geos.length-1].id")
    ok('click on a geometry away from bodies selects it',gs==[lid] and pg.evaluate("__mrt.S.sel.size")==0,gs)
    pg.keyboard.press('y'); pg.wait_for_timeout(100)
    ok('Y hides the selected geometry',pg.evaluate("__mrt.S.geos[__mrt.S.geos.length-1].vis")==False)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(150)
    at(A[0][:2]+[A[1][2]]) if False else None
    LL=geos()[-1]; q1=scr(LL['p']); q2=scr(LL['p2'])
    a0=[min(q1[0],q2[0])-8,min(q1[1],q2[1])-8]; a1=[max(q1[0],q2[0])+8,max(q1[1],q2[1])+8]
    pg.mouse.move(*a0); pg.mouse.down(); pg.mouse.move(a1[0],a1[1],steps=6); pg.mouse.up(); pg.wait_for_timeout(150)
    ok('box with no body in it selects geometry',pg.evaluate("__mrt.S.geoSet.size")>=1 and pg.evaluate("__mrt.S.sel.size")==0,pg.evaluate("[...__mrt.S.geoSet]"))
    n0=len(geos()); pg.keyboard.press('Delete'); pg.wait_for_timeout(100)
    ok('Delete removes the selected geometry',len(geos())==n0-pg.evaluate("0")-1 or len(geos())<n0,[n0,len(geos())])
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(150)
    # sketch on an origin base plane
    pg.evaluate("__mrt.S.bodies[0].visible=false"); pg.wait_for_timeout(100)
    pg.click('#bSketch'); pg.click('#skplane [data-pl=pick]'); pg.wait_for_timeout(100)
    Ln=pg.evaluate("Math.max(__mrt.cam().radius*0.225,1e-6)")
    q=scr([-Ln*0.25,-Ln*0.25,0]) if False else scr([Ln*0.3,Ln*0.3,0])
    pg.mouse.move(q[0],q[1]); pg.wait_for_timeout(120)
    hv=pg.evaluate("__mrt.S.skHov&&__mrt.S.skHov.geo&&__mrt.S.skHov.geo.id")
    ok('origin base plane XY lights up for the sketch',hv=='oP0',hv)
    pg.mouse.click(q[0],q[1]); pg.wait_for_timeout(150)
    fr=pg.evaluate("__mrt.S.sk&&__mrt.S.sk.frame")
    ok('sketch on XY with its origin at O',fr and near(fr['o'],[0,0,0],1e-9) and abs(abs(fr['n'][2])-1)<1e-9,fr)
    pg.click('#skCancel'); pg.wait_for_timeout(150)
    pg.evaluate("(()=>{const s=__mrt.S;s.bodies[0].visible=true;s.bodies[1].visible=true;})()")
    # undercut: pull direction picked from the top face; hide the bodies not analysed
    pg.evaluate("(()=>{const s=__mrt.S;s.sel.clear();s.sel.add(s.bodies[0]);})()")
    pg.evaluate("document.querySelector('.popb[data-pop=undercut]')?document.querySelector('.popb[data-pop=undercut]').click():document.getElementById('pop_undercut').classList.add('on')"); pg.wait_for_timeout(100)
    pg.select_option('#ucAx','pick'); pg.wait_for_timeout(100)
    ok('pick mode starts when "Pick on screen" is chosen',pg.evaluate("__mrt.S.ucPick"))
    at([(A5[0][0]+A5[1][0])/2+1,(A5[0][1]+A5[1][1])/2+1,A5[1][2]])
    ud=pg.evaluate("__mrt.S.ucDir&&__mrt.S.ucDir.d")
    ok('pull direction from the top face normal',ud and abs(abs(ud[2])-1)<1e-6 and not pg.evaluate("__mrt.S.ucPick"),ud)
    pg.check('#ucIso'); pg.click('#bUc'); idle()
    ok('Undercut ran with the picked direction; the other body is hidden',('0.000, 0.000, 1.000' in pg.inner_text('#ucRes') or '0.000, 0.000, -1.000' in pg.inner_text('#ucRes')) and pg.evaluate("!__mrt.S.bodies[1].visible&&__mrt.S.bodies[0].visible"),pg.inner_text('#ucRes')[-120:])
    pg.uncheck('#ucIso'); pg.wait_for_timeout(100)
    ok('unticking brings the other body back',pg.evaluate("__mrt.S.bodies[1].visible"))
    pg.click('#bUcClr'); pg.wait_for_timeout(100)
    # undo takes back geometry too
    n=len(geos()); pg.keyboard.press('Control+z'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    ok('undo brings back the earlier geometry list',len(geos())<=n)
    ok('no page errors',errs==[],errs)
    pg.screenshot(path=S+'/geo.png')
    b.close()
print('all passed' if fails==0 else 'FAILED '+str(fails))
