# Browser test: drawing effects (Effects tab). Depth step lines lie on the lower face, a step band darkens the lower
# face at the foot of a step, a part outline separates two bodies, ambient occlusion / shadow / curvature change the
# picture only when switched on; settings are kept per sheet; ribbon sliders drive the panel values.
# Run: python3 ui31.py <fixtures folder> [path to index.html]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True)
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    pg.set_input_files('#file',[S+'/steps.stl',S+'/steps2.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); pg.wait_for_timeout(400)
    pg.click('#b_dws'); pg.wait_for_timeout(1500)
    def setv(k,v):
        pg.evaluate("([k,v])=>{const e=document.getElementById(k);if(e.type=='checkbox')e.checked=v;else e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}",[k,v])
    def fresh(): pg.wait_for_timeout(2500)
    # colour of the top view at model point (x, y) on the plate top (preview picture)
    def px(x,y,view='top'):
        return pg.evaluate("""([x,y,n])=>{const v=__mrt.v6().prev.views[n],M=v.map,c=M.ctr,D=M.D,P=[x-c[0],y-c[1],5-c[2]];
          const ix=Math.round(((P[0]*D.r[0]+P[1]*D.r[1]+P[2]*D.r[2])-M.R0)*M.S2),iy=Math.round(M.vh-((P[0]*D.u[0]+P[1]*D.u[1]+P[2]*D.u[2])-M.U0)*M.S2);
          const d=v.cv.getContext('2d').getImageData(ix,iy,1,1).data;return d[0]+d[1]+d[2];}""",[x,y,view])
    def seg(x0,y0,x1,y1,n=12):
        return min(px(x0+(x1-x0)*i/n,y0+(y1-y0)*i/n) for i in range(n+1))
    pg.click('#dwsTabs .rtab[data-k=fx]'); pg.wait_for_timeout(300)
    ok('Effects tab: step lines, step band, AO, shadow, curvature, part outline, export',pg.evaluate("[...document.querySelectorAll('#dwsRibbon .rpage[data-k=fx] .rtitle')].map(t=>t.textContent)")==['Nét bậc','Chân bậc','AO','Bóng đổ','Độ cong','Viền part','Xuất'])
    ok('Every effect level is a slider with a number box',pg.locator('#dwsRibbon .rpage[data-k=fx] input[type=range]').count()==10 and pg.locator('#dwsRibbon .rpage[data-k=fx] input[type=number]').count()==10)
    ok('Effects tab keeps the ribbon without a scroll bar',pg.evaluate("(()=>{const p=document.querySelector('#dwsRibbon .rpage.on');return p.scrollWidth<=p.clientWidth+1})()"))
    # isolate the effects: no traced edges
    setv('v6Edge',False); setv('v6FxT','0.2'); setv('v6FxB','1'); setv('v6FxW','0'); setv('v6FxBs','0'); setv('v6FxId',False); fresh()
    far=px(38,16); near0=seg(11,3.95,11,3.2)
    ok('All effects off: the plate next to a pad looks like the rest of the plate',abs(near0-far)<12,[near0,far])
    setv('v6FxW','0.6'); fresh()
    out=seg(11,3.95,11,3.4); inn=seg(11,4.6,11,4.15)
    ok('Step line drawn on the lower face (outside the 1 mm pad), not on the pad',out<far*0.5 and abs(inn-far)<20,[out,inn,far])
    setv('v6FxT','2'); fresh()
    ok('Steps lower than the threshold get no line',abs(seg(11,3.95,11,3.4)-far)<12)
    setv('v6FxT','0.2'); setv('v6FxW','0'); setv('v6FxBs','80'); setv('v6FxB','2'); fresh()
    b1=seg(11,3.9,11,3.3); b2=px(11,1.2)
    ok('Step band darkens the lower face along the foot of the step',b1<far*0.8 and abs(b2-far)<20,[b1,b2,far])
    b03=seg(29,3.9,29,3.3)
    ok('…also at a 0.3 mm step',b03<far*0.92,[b03,far])
    setv('v6FxBs','0'); setv('v6FxId',True); fresh()
    ok('Part outline where the two bodies meet',seg(39.6,16,40.4,16)<far*0.5,seg(39.6,16,40.4,16))
    setv('v6FxId',False); fresh(); base=[px(11,3.5),px(19,9),px(30,20)]
    setv('v6FxAs','100'); setv('v6FxA','3'); fresh()
    ok('AO darkens the plate near the pads',px(11,3.5)<base[0]-15,[px(11,3.5),base[0]])
    setv('v6FxAs','0'); setv('v6FxS','80'); setv('v6FxSa','125'); setv('v6FxSe','20'); fresh()
    sr=px(19,9); sl=px(3,9)
    ok('Shadow falls away from the light (right of the pad), not towards it',sr<base[1]-30 and abs(sl-far)<20,[sr,sl,base[1]])
    setv('v6FxS','0'); fresh()
    ok('Shadow off: picture back to normal',abs(px(19,9)-base[1])<12)
    # per sheet
    setv('v6FxT','1.5')
    pg.evaluate("__mrt.dwAct('newSheet')"); pg.wait_for_timeout(1500)
    ok('A new sheet starts with the default effects',pg.input_value('#v6FxT')=='5' and pg.input_value('#v6FxBs')=='4' and pg.is_checked('#v6FxId'))
    pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 1'); pg.wait_for_timeout(1500)
    ok('Sheet 1 keeps its own effects',pg.input_value('#v6FxT')=='1.5' and pg.input_value('#v6FxW')=='0')
    pg.click('#dwsTabs .rtab[data-k=fx]'); pg.wait_for_timeout(300)
    pg.fill('#dwsRibbon .rpage[data-k=fx] input[type=number][data-bind=v6FxS]','30'); pg.dispatch_event('#dwsRibbon .rpage[data-k=fx] input[type=number][data-bind=v6FxS]','input'); pg.wait_for_timeout(300)
    ok('Ribbon slider drives the panel value',pg.input_value('#v6FxS')=='30' and pg.input_value('#v6FxSR')=='30')
    d=pg.evaluate("__mrt.v6Png().then(u=>u.length)")
    ok('Export with effects works',d>10000,d)
    ok('No page errors',not errs,errs)
    print('FAILS',fails)
    b.close()
sys.exit(1 if fails else 0)
