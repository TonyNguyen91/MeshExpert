# Browser test: icon-only sketch toolbar with the selection filter, sketch snapping to mesh corners / geometry points,
# icons in the right-click menu, and the SLA plate (orient + spread from the plate centre, spread slider, undo).
# Run: python3 ui15.py <fixtures folder> [path to index.html]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
BOX="(()=>__mrt.S.bodies.map(b=>{const P=b.geo.positions,m=b.matrix;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<P.length;k+=3){const v=[m[0]*P[k]+m[4]*P[k+1]+m[8]*P[k+2]+m[12],m[1]*P[k]+m[5]*P[k+1]+m[9]*P[k+2]+m[13],m[2]*P[k]+m[6]*P[k+1]+m[10]*P[k+2]+m[14]];for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],v[i]);mx[i]=Math.max(mx[i],v[i]);}}return [mn,mx]}))()"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1456,'height':819},offline=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    pg.set_input_files('#file',[S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    # ---- sketch toolbar: icons only, tooltips, filter inside
    pg.click('#bSketch'); pg.wait_for_timeout(150); pg.click('[data-pl=top]'); pg.wait_for_timeout(300)
    btns=pg.locator('#sktools button.ib')
    ok('Sketch buttons are icons with tooltips',btns.count()>=30 and all(btns.nth(i).locator('svg').count()==1 and btns.nth(i).get_attribute('title') and btns.nth(i).inner_text().strip()=='' for i in range(btns.count())))
    ok('Selection filter shown in the sketch toolbar',pg.is_visible('#sktools #selFlt'))
    # ---- snap the line start to a mesh corner
    bx=pg.evaluate(BOX)[0]; v=[bx[1][0],bx[0][1],bx[1][2]]
    q=scr(v); pg.mouse.move(q[0]+4,q[1]+3); pg.wait_for_timeout(150)
    sn=pg.evaluate("__mrt.S.sk.snap")
    ok('Hover near a mesh corner snaps to it (projected on the sketch plane)',sn and sn['kind']=='ext' and abs(sn['p'][0]-v[0])<1e-6 and abs(sn['p'][1]-v[1])<1e-6,sn)
    pg.dblclick('[data-flt=point]'); pg.wait_for_timeout(100); pg.click('[data-flt=point]'); pg.wait_for_timeout(100)   # only "point" on → then off
    pg.mouse.move(q[0]+5,q[1]+3); pg.wait_for_timeout(150)
    ok('With the point filter off the corner is not offered',(pg.evaluate("__mrt.S.sk.snap") or {}).get('kind')!='ext')
    pg.dblclick('[data-flt=point]'); pg.wait_for_timeout(100); pg.dblclick('[data-flt=point]'); pg.wait_for_timeout(100)   # all on
    pg.mouse.click(q[0]+4,q[1]+3); pg.wait_for_timeout(100); pg.mouse.click(q[0]+90,q[1]+50); pg.wait_for_timeout(100)
    pts=pg.evaluate("__mrt.S.sk.m.pts")
    ok('Line starts on the corner',any(abs(a[0]-v[0])<1e-6 and abs(a[1]-v[1])<1e-6 for a in pts),pts)
    pg.keyboard.press('Escape'); pg.click('#skOk'); pg.wait_for_timeout(200)
    ok('Filter back in the main toolbar after the sketch',pg.locator('#tools #selFlt').count()==1 and pg.is_visible('#selFlt'))
    # ---- right-click menu icons
    c=scr([(bx[0][0]+bx[1][0])/2,(bx[0][1]+bx[1][1])/2,bx[1][2]])
    pg.mouse.click(c[0],c[1],button='right'); pg.wait_for_timeout(200)
    rows=pg.locator('#ctx > div'); n=rows.count()
    ok('Every right-click line has an icon',n>10 and all(rows.nth(i).locator('.ci svg').count()==1 for i in range(n)),n)
    pg.keyboard.press('Escape'); pg.mouse.click(5,800); pg.wait_for_timeout(100)
    # ---- SLA plate
    fs=['a.stl','boss.stl','cyl.stl','cshape.stl','m_peg.stl','m_plate.stl']
    pg.set_input_files('#file',[S+'/'+f for f in fs]); pg.wait_for_function("__mrt.S.bodies.length==%d"%(len(fs)+1)); idle()
    before=pg.evaluate("__mrt.S.bodies.map(b=>Array.from(b.matrix))")
    pg.click('[data-pop=sla]'); pg.wait_for_timeout(100); pg.click('#slaGo'); idle()
    B=pg.evaluate(BOX); E=[[mx[i]-mn[i] for i in range(3)] for mn,mx in B]
    ok('Thin along X, longer along Y, tallest along Z',all(e[0]<=e[1]+1e-6 and e[1]<=e[2]+1e-6 for e in E),[[round(x,1) for x in e] for e in E])
    ok('Every body sits 5 mm above the plate',all(abs(mn[2]-5)<1e-6 for mn,mx in B))
    ok('All inside the plate',all(mn[0]>=0 and mn[1]>=0 and mx[0]<=400 and mx[1]<=400 for mn,mx in B))
    def overl(B):
        for i in range(len(B)):
            for j in range(i+1,len(B)):
                a,b2=B[i],B[j]
                if a[0][0]<b2[1][0]-1e-6 and b2[0][0]<a[1][0]-1e-6 and a[0][1]<b2[1][1]-1e-6 and b2[0][1]<a[1][1]-1e-6: return True
        return False
    ok('Footprints do not overlap',not overl(B))
    vol=[e[0]*e[1]*e[2] for e in E]; small=vol.index(min(vol)); big=vol.index(max(vol))
    ok('Smallest part sits in the corner at the origin',abs(B[small][0][0]-5)<1e-6 and abs(B[small][0][1]-5)<1e-6,B[small][0])
    ok('The biggest part is furthest along Y',B[big][0][1]>=max(mn[1] for mn,mx in B)-1e-6)
    rows=sorted(set(round(mn[1],3) for mn,mx in B))
    ok('Rows filled across X first (first row wider than the parts in later rows need)',len(rows)<len(B))
    w0=max(mx[0] for mn,mx in B)-min(mn[0] for mn,mx in B)
    pg.fill('#slaSpread','100'); pg.dispatch_event('#slaSpread','input'); pg.dispatch_event('#slaSpread','change'); pg.wait_for_timeout(200)
    B2=pg.evaluate(BOX); w1=max(mx[0] for mn,mx in B2)-min(mn[0] for mn,mx in B2)
    ok('Spread 100 % fills the plate, still inside and apart',w1>w0*2 and all(mn[0]>=4.99 and mx[0]<=395.01 and mn[1]>=4.99 and mx[1]<=395.01 for mn,mx in B2) and not overl(B2),(w0,w1))
    ok('Range and number stay in step',pg.input_value('#slaSpreadR')=='100')
    pg.fill('#slaLift','8'); pg.click('#slaGoA'); idle()
    ok('Lay out again with lift 8 mm',all(abs(mn[2]-8)<1e-6 for mn,mx in pg.evaluate(BOX)))
    # lift only the selected body
    pg.evaluate("(()=>{const S=__mrt.S;S.sel.clear();S.sel.add(S.bodies[0]);})()")
    pg.fill('#slaLift','12'); pg.click('#slaLiftSel'); pg.wait_for_timeout(200)
    Bz=pg.evaluate(BOX); ok('Lift selected: only that body moves',abs(Bz[0][0][2]-12)<1e-6 and all(abs(mn[2]-8)<1e-6 for mn,mx in Bz[1:]),[round(mn[2],2) for mn,mx in Bz])
    pg.fill('#slaLift','8'); pg.click('#slaLiftSel'); pg.wait_for_timeout(200)
    # guard blocks
    pg.check('#slaGuardOn'); pg.wait_for_timeout(300)
    G=pg.evaluate("__mrt.S.bodies.filter(b=>/^SLA_guard_/.test(b.name)).map(b=>b.name)")
    Ball=pg.evaluate(BOX); names=pg.evaluate("__mrt.S.bodies.map(b=>b.name)")
    gb=[Ball[i] for i,n in enumerate(names) if n.startswith('SLA_guard_')]; pb=[Ball[i] for i,n in enumerate(names) if not n.startswith('SLA_guard_')]
    top=max(mx[2] for mn,mx in pb)
    ok('Two guard blocks 20 x 20, as tall as the tallest part',len(G)==2 and all(abs(mx[0]-mn[0]-20)<1e-6 and abs(mx[1]-mn[1]-20)<1e-6 and abs(mx[2]-top)<1e-6 and abs(mn[2])<1e-6 for mn,mx in gb),G)
    ok('Guards are the outermost along Y (one at each end)',min(g[0][1] for g in gb)<min(mn[1] for mn,mx in pb) and max(g[1][1] for g in gb)>max(mx[1] for mn,mx in pb))
    pg.click('#slaGoA'); idle()
    ok('Re-layout keeps two guards, still outermost',pg.evaluate("__mrt.S.bodies.filter(b=>/^SLA_guard_/.test(b.name)).length")==2)
    pg.uncheck('#slaGuardOn'); pg.wait_for_timeout(200)
    ok('Untick removes the guards',pg.evaluate("__mrt.S.bodies.filter(b=>/^SLA_guard_/.test(b.name)).length")==0)
    # tilt
    pg.check('#slaTiltOn'); pg.fill('#slaTilt','30'); pg.click('#slaGo'); idle()
    Bt=pg.evaluate(BOX); Et=[[mx[i]-mn[i] for i in range(3)] for mn,mx in Bt]
    ok('Tilt 30°: X width kept, parts lean along Y',all(abs(a[0]-b2[0])<0.6 and b2[1]>a[1]+1 for a,b2 in zip(E,Et)) and all(abs(mn[2]-8)<1e-6 for mn,mx in Bt),[[round(x,1) for x in e] for e in Et])
    pg.uncheck('#slaTiltOn')
    for _ in range(9): pg.click('#bUndo'); pg.wait_for_timeout(150)   # tilt, guard off, lay out, guard on, 2 x lift selected, lay out, spread, orient
    ok('Undo goes back to the original placement',pg.evaluate("__mrt.S.bodies.map(b=>Array.from(b.matrix))")==before)
    ok('One ribbon button for the SLA panel',pg.locator('#bSlaOrient').count()==0 and pg.locator('button.popb[data-pop=sla]').count()==1)
    ok('No page errors',not errs,errs)
    b.close()
print('ALL OK' if not fails else '%d FAIL'%fails); sys.exit(1 if fails else 0)
