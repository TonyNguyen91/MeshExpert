# Browser test: Drawing > Exploded view: PVC grades (all named PVC, different densities, one "Tổng PVC" line);
# Combine (right-click a part > Combine, parts of the same mass light up, click to add -> one picture "name  x2", Uncombine,
# saved with the session); zoom / pan of the preview (wheel, slider, drag an empty spot, double-click to fit) stays light.
# Run: python3 make_rd_meshes.py <fixtures>; python3 ui22.py <fixtures folder> [path to index.html]
import sys,os,time
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1456,'height':819},offline=True,accept_downloads=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(2000)
    def hit(kind,key=None): return pg.evaluate("a=>{const q=__mrt.v6().prev,L=__mrt.v6().lay,h=q.hits.find(h=>h.kind==a[0]&&(a[1]==null||h.n==a[1]||h.id==a[1]));if(!h)return null;const f=h.r,s=__mrt.v6Scr(f);return [s.x+s.w/2,s.y+s.h/2,f.x,f.y,f.w,f.h,L.W,L.H,s.w,s.h]}",[kind,key])
    # ---- PVC grades
    opts=pg.evaluate("[...document.querySelectorAll('#mat option')].map(o=>[o.value,o.textContent])")
    pvc=[o for o in opts if o[1].startswith('PVC')]
    ok('Several PVC grades, each named just PVC (density in brackets)',len(pvc)>=4 and all(o[1].split(' (')[0]=='PVC' for o in pvc) and len(set(o[1] for o in pvc))==len(pvc),pvc)
    pg.set_input_files('#file',[S+'/block.stl',S+'/block.stl',S+'/block.stl',S+'/cyl.stl',S+'/rd_chamf.stl']); pg.wait_for_function("__mrt.S.bodies.length==5"); idle()
    pg.evaluate("""(()=>{const B=__mrt.S.bodies;const set=(b,k,d)=>{b.material=k;b.density=d;};
      set(B[0],'ABS',1.05);set(B[1],'ABS',1.05);set(B[2],'ABS',1.05);set(B[3],'PVC',1.25);set(B[4],'PVC130',1.30);
      B[1].matrix[12]+=40;B[2].matrix[12]+=80;B[3].matrix[13]+=60;B.forEach(b=>{b.stats=null;});__mrt.S.sel.clear();})()""")
    pg.click('#b_dws'); settle(); pg.click('#dwsTabs [data-k=exp]'); settle()
    tl=pg.evaluate("__mrt.v6Totals()")
    ok('Two PVC grades give one "Tổng PVC" line',len(tl)==2 and sum(1 for t in tl if t.startswith('Tổng PVC '))==1,tl)
    ok('Five parts drawn before combining',pg.evaluate("__mrt.v6().prev.parts.length")==5)
    ids=pg.evaluate("__mrt.S.bodies.map(b=>b.id)")
    # ---- combine
    p0=hit('part',ids[0])
    pg.mouse.click(p0[0],p0[1],button='right'); pg.wait_for_timeout(200)
    menu=pg.inner_text('#ctx'); ok('Right-click on a part offers Combine',pg.is_visible('#ctx') and 'Combine' in menu,menu)
    pg.click('#ctx div:has-text("Combine")'); pg.wait_for_timeout(300)
    ok('Combine mode started on that part',pg.evaluate("__mrt.v6().comb")==ids[0])
    p1=hit('part',ids[1])
    orange=pg.evaluate("a=>{const c=document.getElementById('v6Prev'),r=c.getBoundingClientRect(),d=window.devicePixelRatio||1,x=Math.round((a[0]-r.left)*d),y=Math.round((a[1]-r.top)*d),w=Math.round(a[2]*d),h=Math.round(a[3]*d),g=c.getContext('2d').getImageData(x-w/2-8,y-h/2-8,w+16,h+16).data;let n=0;for(let i=0;i<g.length;i+=4)if(g[i]>200&&g[i+1]>120&&g[i+1]<190&&g[i+2]<90)n++;return n}",[p1[0],p1[1],p1[8],p1[9]])
    ok('Parts of the same mass light up (orange)',orange>30,orange)
    pc=hit('part',ids[3]); orange2=pg.evaluate("a=>{const c=document.getElementById('v6Prev'),r=c.getBoundingClientRect(),d=window.devicePixelRatio||1,x=Math.round((a[0]-r.left)*d),y=Math.round((a[1]-r.top)*d),w=Math.round(a[2]*d),h=Math.round(a[3]*d),g=c.getContext('2d').getImageData(x-w/2-8,y-h/2-8,w+16,h+16).data;let n=0;for(let i=0;i<g.length;i+=4)if(g[i]>200&&g[i+1]>120&&g[i+1]<190&&g[i+2]<90)n++;return n}",[pc[0],pc[1],pc[8],pc[9]])
    ok('A part of another mass does not light up',orange2<orange/3,[orange2,orange])
    pg.mouse.click(p1[0],p1[1]); settle()
    parts=pg.evaluate("__mrt.v6().prev.parts.map(p=>[p.id,p.n])")
    ok('Clicked part joins: one picture fewer, leader x2',len(parts)==4 and [ids[0],2] in parts and all(x[0]!=ids[1] for x in parts),parts)
    ok('Still in combine mode while another same-mass part is left',pg.evaluate("__mrt.v6().comb")==ids[0])
    p2=hit('part',ids[2]); pg.mouse.click(p2[0],p2[1]); settle()
    parts=pg.evaluate("__mrt.v6().prev.parts.map(p=>[p.id,p.n])")
    ok('Third part joins: leader x3, combine mode ends',[ids[0],3] in parts and len(parts)==3 and pg.evaluate("__mrt.v6().comb")==None,parts)
    lab=hit('label',ids[0]); ok('Label of the combined picture is on the sheet',lab is not None)
    ok('Totals still count every body',pg.evaluate("__mrt.v6Totals()")==tl)
    # right click on another mass part -> combine finds nothing
    pc=hit('part',ids[3]); pg.mouse.click(pc[0],pc[1],button='right'); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Combine")'); pg.wait_for_timeout(300)
    ok('No same-mass part: combine mode does not start',pg.evaluate("__mrt.v6().comb")==None)
    # ---- session keeps groups
    dump=pg.evaluate("__mrt.v6Dump()")
    ok('Groups saved with the session (by body order)',dump['st']['exp']['grp'].get('0')==[1,2],dump['st']['exp']['grp'])
    pg.evaluate("d=>__mrt.v6Load(d)",dump); settle()
    ok('Groups restored',[ids[0],3] in pg.evaluate("__mrt.v6().prev.parts.map(p=>[p.id,p.n])"))
    # uncombine
    p0=hit('part',ids[0]); pg.mouse.click(p0[0],p0[1],button='right'); pg.wait_for_timeout(200)
    ok('Combined part offers Uncombine',('Tách ra' in pg.inner_text('#ctx')))
    pg.click('#ctx div:has-text("Tách ra")'); settle()
    ok('Uncombine brings the parts back',pg.evaluate("__mrt.v6().prev.parts.length")==5)
    # ---- zoom / pan
    p3=hit('part',ids[3]); k0=pg.evaluate("__mrt.v6().prev.k"); w0=p3[8]
    t0=time.time()
    for i in range(5): pg.mouse.move(p3[0],p3[1]); pg.mouse.wheel(0,-240)
    pg.wait_for_timeout(50)
    dt=pg.evaluate("(()=>{const t=performance.now();for(let i=0;i<10;i++)__mrt.v6().prev&&document.getElementById('v6Prev').dispatchEvent(new WheelEvent('wheel',{deltaY:-1,clientX:700,clientY:400,bubbles:true,cancelable:true}));return (performance.now()-t)/10})()")
    vz=pg.evaluate("__mrt.v6().vz"); p3b=hit('part',ids[3])
    ok('Wheel zooms in on the part under the mouse',vz>2 and p3b[8]>w0*2 and abs(p3b[0]-p3[0])<40 and abs(p3b[1]-p3[1])<40,[vz,w0,p3b[8],p3[:2],p3b[:2]])
    ok('Zoom step is light (repaint only, ms per step)',dt<80,round(dt,1))
    ok('Slider follows the zoom',abs(float(pg.input_value('#v6Vz'))-vz*100)<3,[pg.input_value('#v6Vz'),vz])
    settle()
    k1=pg.evaluate("__mrt.v6().prev.k"); ok('Sharper render made after zooming',k1>k0*1.5,[k0,k1])
    p3c=hit('part',ids[3])
    pg.mouse.move(p3c[0],p3c[1]); pg.mouse.down(); pg.mouse.move(p3c[0]+60,p3c[1]+30,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    p3d=hit('part',ids[3]); ok('Dragging a part works while zoomed',abs(p3d[0]-p3c[0]-60)<4 and abs(p3d[1]-p3c[1]-30)<4,[p3c[:2],p3d[:2]])
    # pan from an empty spot
    br=pg.eval_on_selector('#v6Prev',"e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}")
    ex,ey=None,None
    for fx in (0.05,0.95):
        for fy in (0.06,0.94):
            x,y=br[0]+br[2]*fx,br[1]+br[3]*fy
            if pg.evaluate("a=>{const h=__mrt.v6().prev.hits,L=__mrt.v6().lay,c=document.getElementById('v6Prev').getBoundingClientRect();const X=((a[0]-c.left)*L.dpr-L.ox)/L.s,Y=((a[1]-c.top)*L.dpr-L.oy)/L.s;return !h.some(q=>X>=q.r.x-20&&X<=q.r.x+q.r.w+20&&Y>=q.r.y-20&&Y<=q.r.y+q.r.h+20)}",[x,y]): ex,ey=x,y; break
        if ex: break
    vp0=pg.evaluate("__mrt.v6().vp.slice()")
    pg.mouse.move(ex,ey); pg.mouse.down(); pg.mouse.move(ex+70,ey+40,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    vp1=pg.evaluate("__mrt.v6().vp.slice()")
    ok('Dragging an empty spot pans the sheet',abs(vp1[0]-vp0[0]-70)<2 and abs(vp1[1]-vp0[1]-40)<2,[vp0,vp1])
    pg.mouse.dblclick(ex+70,ey+40); pg.wait_for_timeout(300)
    ok('Double-click on an empty spot fits the sheet',pg.evaluate("__mrt.v6().vz")==1 and pg.evaluate("__mrt.v6().vp")==[0,0])
    pg.fill('#v6Vz','300'); pg.dispatch_event('#v6Vz','input'); pg.wait_for_timeout(200)
    ok('Zoom from the number box',abs(pg.evaluate("__mrt.v6().vz")-3)<1e-6)
    pg.click('#v6VzFit'); pg.wait_for_timeout(200)
    ok('Fit button',pg.evaluate("__mrt.v6().vz")==1)
    with pg.expect_download(timeout=180000) as dl: pg.click('#v6Save')
    ok('Saving still gives the full sheet',os.path.getsize(dl.value.path())>10000)
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
