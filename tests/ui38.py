# Browser test (v1.6.4): Move / Rotate is one command: axis arrows, plane squares, turning arcs, Shift = whole numbers.
# Run: python3 ui38.py <fixtures folder> [path to index.html]
import sys,os,json,math
from playwright.sync_api import sync_playwright
F=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(n,c,x=''):
    global fails; print(('ok   ' if c else 'FAIL ')+n+('  '+str(x) if x!='' else '')); fails+=(not c)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1400,'height':850},offline=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+PAGE)
    pg.set_input_files('#file',[F+'/boss.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); pg.wait_for_timeout(300)
    pg.evaluate("__mrt.S.sel.add(__mrt.S.bodies[0])"); pg.click('[data-tool=move]'); pg.wait_for_timeout(300)
    ok('Version 1.6.4',pg.evaluate("document.getElementById('appVer').textContent")=='v1.6.4')
    ok('Rotate button gone, one Move / Rotate tool',pg.locator('[data-tool=rotate]').count()==0)
    r=pg.evaluate("(()=>{const c=document.querySelector('#view canvas, canvas').getBoundingClientRect();return [c.left,c.top]})()")
    G=lambda: pg.evaluate("(()=>{const g=__mrt.S.giz;return {p:g.p,ends:g.ends,quads:g.quads,arcs:g.arcs.map(a=>a[10])}})()")
    T="Array.from(__mrt.S.bodies[0].matrix).map(v=>+v.toFixed(4))"
    def drag(a,bb,shift=False):
        pg.mouse.move(r[0]+a[0],r[1]+a[1]); pg.wait_for_timeout(50)
        if shift: pg.keyboard.down('Shift')
        pg.mouse.down(); 
        for k in range(1,9): pg.mouse.move(r[0]+a[0]+(bb[0]-a[0])*k/8, r[1]+a[1]+(bb[1]-a[1])*k/8); pg.wait_for_timeout(15)
        pg.mouse.up()
        if shift: pg.keyboard.up('Shift')
        pg.wait_for_timeout(100)
    g=G(); m0=pg.evaluate(T)
    # axis X drag
    e=g['ends'][0]; pm=[(g['p'][0]+e[0])/2,(g['p'][1]+e[1])/2]
    drag(pm,[pm[0]+60,pm[1]+20],True); m1=pg.evaluate(T)
    ok('Axis X: moves only along X, whole mm with Shift',abs(m1[12]-m0[12])>0.5 and abs(m1[12]-m0[12]-round(m1[12]-m0[12]))<1e-3 and m1[13]==m0[13] and m1[14]==m0[14],(m1[12]-m0[12],m1[13]-m0[13],m1[14]-m0[14]))
    # plane XY square (normal Z, index 2)
    g=G(); q=g['quads'][2]; c=[sum(x[0] for x in q)/4,sum(x[1] for x in q)/4]
    drag(c,[c[0]-40,c[1]+35],True); m2=pg.evaluate(T)
    dx,dy,dz=m2[12]-m1[12],m2[13]-m1[13],m2[14]-m1[14]
    ok('Square XY: moves in X and Y only, whole mm',abs(dz)<1e-6 and (abs(dx)>0.5 or abs(dy)>0.5) and abs(dx-round(dx))<1e-3 and abs(dy-round(dy))<1e-3,(dx,dy,dz))
    # arc about Z (index 2)
    g=G(); a=g['arcs'][2]; ctr=g['p']
    v=[a[0]-ctr[0],a[1]-ctr[1]]; tgt=[a[0]-v[1]*0.5,a[1]+v[0]*0.5]
    drag(a,tgt,True); m3=pg.evaluate(T)
    ang=math.degrees(math.atan2(m3[4],m3[0]))
    ok('Arc about Z: turns about Z by whole degrees',abs(ang)>0.5 and abs(ang-round(ang))<1e-2 and abs(m3[10]-1)<1e-4,(round(ang,3),m3[10]))
    ok('Rotation fields show the angle, axis Z',pg.evaluate("[rotAx.value, Math.abs(+rotA.value)>0]")==['2',True])
    pg.click('#bUndo'); pg.click('#bUndo'); pg.click('#bUndo'); pg.wait_for_timeout(100)
    ok('Three undo steps back to the start',pg.evaluate(T)==m0)
    ok('No page errors',not errs,errs); b.close()
print('FAILS',fails)
sys.exit(1 if fails else 0)
