# Browser test: the Mate tool (face to face, axis to axis, flip). Run: node tests/make_split_meshes.js <folder>; python3 tests/ui10.py <folder>
from playwright.sync_api import sync_playwright
import sys,os
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(n,c,x=''):
    global fails
    print(('ok   ' if c else 'FAIL ')+n+('  '+str(x) if x!='' else ''))
    if not c: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1680,'height':950}).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE)); pg.wait_for_timeout(200)
    pg.set_input_files('#file',[S+'/m_plate.stl',S+'/m_peg.stl',S+'/m_box.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); pg.wait_for_timeout(400)
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked)e.click()})()")
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def bb(i): return pg.evaluate("i=>{const b=__mrt.S.bodies[i],P=b.geo.positions,m=b.matrix,mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let k=0;k<P.length;k+=3){const x=P[k],y=P[k+1],z=P[k+2],w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],w[j]);mx[j]=Math.max(mx[j],w[j])}}return [mn,mx].map(a=>a.map(v=>+v.toFixed(3)))}",i)
    def clk(pt): q=scr(pt); pg.mouse.move(*q); pg.wait_for_timeout(60); pg.mouse.click(*q); pg.wait_for_timeout(120)
    pg.click('[data-tool=mate]'); print('tpop', pg.is_visible('#tpMate'))
    clk([-58,14,11]); print(pg.inner_text('#status')[:80]); clk([35,25,10]); print(pg.inner_text('#status')[:60])
    B=bb(2); ok('box top face mated face to face onto the plate top',B==[[-72,0,10],[-44,28,18]],B)
    pg.click('#bMateFlip'); pg.wait_for_timeout(100); B=bb(2); ok('flip: same direction, top face on the plate top',B==[[-72,0,2],[-44,28,10]],B)
    pg.evaluate("document.getElementById('gl')"); 
    clk([85,31,17]); print(pg.inner_text('#status')[:80]); clk([16.5,18.5,8]); print(pg.inner_text('#status')[:60])
    B=bb(1); ok('peg axis on the hole axis, upright',abs(B[0][0]-15)<1e-2 and abs(B[1][1]-20)<1e-2 and abs(B[1][2]-B[0][2]-30)<1e-2,B)
    ok('no page errors',not errs,errs)
    b.close()
print('all passed' if not fails else str(fails)+' FAILED'); sys.exit(1 if fails else 0)
