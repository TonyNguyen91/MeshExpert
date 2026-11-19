# Browser test: Capture > Drawing (one button for 6 view + Exploded view). The two drawings keep separate settings and
# placements, saved with the session (.mrtl); exploded view shows the total mass per material (bottom right, movable);
# custom scale a : b; the iso picture of the 6-view sheet resizes (slider or dragging its corner); the main ribbon never
# gets a horizontal scroll bar.
# Run: python3 make_rd_meshes.py <fixtures>; python3 ui21.py <fixtures folder> [path to index.html]
import sys,os,math
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True,accept_downloads=True)
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE))
    def sv(sel,v): pg.evaluate("a=>{const e=document.querySelector(a[0]);e.value=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}",[sel,str(v)])
    def sc(sel,on): pg.evaluate("a=>{const e=document.querySelector(a[0]);if(e.checked!==a[1]){e.checked=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}",[sel,on])
    def clk(sel): pg.eval_on_selector(sel,"e=>e.click()")
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(2000)
    def ribbon(): return pg.evaluate("(()=>{const r=document.getElementById('ribbon'),p=r.querySelector('.rpage.on'),cs=getComputedStyle(r);return [p.scrollWidth,p.clientWidth,r.scrollWidth,r.clientWidth,cs.overflowX]})()")
    # ---- ribbon
    ok('One Drawing button instead of 6 view + Exploded view',pg.locator('#ribbon #b_dws').count()==1 and pg.locator('#bExpView').count()==0 and 'Drawing' in pg.inner_text('#ribbon #b_dws'))
    for w in (1456,1180,960):
        pg.set_viewport_size({'width':w,'height':819}); pg.wait_for_timeout(300)
        r=ribbon(); ok('Ribbon fits without a horizontal scroll bar at %d px'%w,r[0]<=r[1]+1 and r[2]<=r[3]+1 and r[4]=='hidden',r)
    pg.set_viewport_size({'width':1456,'height':819}); pg.wait_for_timeout(300)
    vis=pg.evaluate("(()=>{const b=document.querySelector('#ribbon #b_dws').getBoundingClientRect(),r=document.getElementById('ribbon').getBoundingClientRect();return b.right<=r.right+1&&b.width>10})()")
    ok('Drawing button is fully on screen',vis)
    # ---- models with materials
    pg.set_input_files('#file',[S+'/rd_chamf.stl',S+'/block.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    pg.evaluate("(()=>{const B=__mrt.S.bodies;B[0].material='ABS';B[0].density=1.05;B[1].material='PVC';B[1].density=1.25;B[2].material='ABS';B[2].density=1.05;__mrt.S.sel.clear();})()")
    pg.click('#b_dws'); settle()
    ok('Drawing opens in 6 view',pg.is_visible('#v6Sheet') and pg.evaluate("__mrt.v6().mode")=='6v' and pg.is_visible('#dwsRibbon .rpage.on button[data-chk=".v6v[data-v=top]"]'))
    def hit(kind,key=None): return pg.evaluate("a=>{const q=__mrt.v6().prev,L=__mrt.v6().lay,h=q.hits.find(h=>h.kind==a[0]&&(a[1]==null||h.n==a[1]||h.id==a[1]));if(!h)return null;const f=h.r,s=__mrt.v6Scr(f);return [s.x+s.w/2,s.y+s.h/2,f.x,f.y,f.w,f.h,L.W,L.H]}",[kind,key])
    # ---- custom scale
    sv('#v6Paper','A4'); sv('#v6Scale','c'); settle()
    pg.wait_for_timeout(700); ok('Custom scale shows a : b with a slider',all(pg.is_visible('#dwsRibbon .rpage.on input[data-bind=%s]'%k) for k in ['v6ScA','v6ScB','v6ScR']))
    sv('#v6ScA','3'); sv('#v6ScB','2'); settle()
    ok('Custom 3:2 gives scale 1.5:1',pg.inner_text('#v6Info').find('1.5:1')>=0 and abs(float(pg.input_value('#v6ScR'))-math.log10(1.5))<0.01,pg.input_value('#v6ScR'))
    pg.eval_on_selector('#v6ScR',"e=>{e.value='-0.7';e.dispatchEvent(new Event('input',{bubbles:true}))}"); settle()
    ok('Slider to the left gives 1:5',pg.input_value('#v6ScA')=='1' and pg.input_value('#v6ScB')=='5' and pg.inner_text('#v6Info').find('1:5')>=0,[pg.input_value('#v6ScA'),pg.input_value('#v6ScB')])
    sv('#v6ScA','1'); sv('#v6ScB','1')
    # ---- iso size
    sc('#v6Iso',True); settle()
    ok('Iso size slider on the ribbon',pg.is_visible('#dwsRibbon .rpage.on input[data-bind=v6IsoK]'))
    i0=hit('iso'); fw=hit('view','front')
    sv('#v6IsoK','50'); settle()
    i1=hit('iso'); f1=hit('view','front')
    ok('Iso 50 % halves the iso picture, views unchanged',abs(i1[4]/i0[4]-0.5)<0.06 and abs(f1[4]-fw[4])<0.5,[i0[4],i1[4]])
    pg.mouse.move(i1[0],i1[1]); pg.wait_for_timeout(150)
    hr=hit('isoR'); ok('Corner handle on the iso picture',hr is not None)
    pg.mouse.move(hr[0],hr[1]); pg.mouse.down(); pg.mouse.move(hr[0]+(hr[0]-i1[0]),hr[1]+(hr[1]-i1[1]),steps=6); pg.mouse.up(); settle()
    k=float(pg.input_value('#v6IsoK')); i2=hit('iso')
    ok('Dragging the corner makes the iso bigger',k>85 and i2[4]>i1[4]*1.6 and pg.input_value('#v6IsoKR')==pg.input_value('#v6IsoK'),[k,i1[4],i2[4]])
    ok('Iso keeps its centre while resized',abs(i2[0]-i1[0])<3 and abs(i2[1]-i1[1])<3,[i1[:2],i2[:2]])
    # ---- exploded view: own settings
    pg.click('#dwsTabs [data-k=exp]'); settle()
    ok('Exploded view starts from its own settings',pg.input_value('#v6Paper')=='A3' and pg.input_value('#v6Scale')=='0' and not pg.is_visible('#dwsRibbon .rpage.on input[data-bind=v6IsoK]'),[pg.input_value('#v6Paper'),pg.input_value('#v6Scale')])
    ok('Mode switch marked',pg.evaluate("document.querySelector('#dwsTabs .rtab.on').dataset.k")=='exp' and pg.inner_text('#v6ShT')=='Exploded view')
    t=hit('tot'); ok('Totals box on the sheet',t is not None and pg.is_checked('#v6Tot'))
    W,H=t[6],t[7]
    ok('Totals box bottom right by default',t[2]+t[4]>W*0.85 and t[3]+t[5]>H*0.85,[t[2]+t[4],W,t[3]+t[5],H])
    lines=pg.evaluate("(()=>{const B=__mrt.S.bodies;return __mrt.v6Totals()})()")
    vol=pg.evaluate("__mrt.S.bodies.map(b=>__mrt.core.stats(b.geo.positions,b.geo.indices).volume)")
    abs_g=(vol[0]+vol[2])/1000*1.05; pvc_g=vol[1]/1000*1.25
    ok('One line per material: ABS (2 parts summed), PVC',len(lines)==2 and lines[0].startswith('Tổng ABS ') and lines[1].startswith('Tổng PVC'),lines)
    ok('ABS total = sum of both ABS parts',abs(float(lines[0].split()[-2].replace(',',''))-abs_g)<0.02*max(1,abs_g),[lines[0],abs_g])
    ok('Totals box two lines high',t[5]>1.5*(t[5]/2) and t[5]<200)
    pg.mouse.move(t[0],t[1]); pg.mouse.down(); pg.mouse.move(t[0]-150,t[1]-90,steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    t2=hit('tot'); ok('Totals box can be moved',abs(t2[2]-t[2])>100 and abs(t2[3]-t[3])>50,[t[2:4],t2[2:4]])
    sv('#v6Fs','7'); sv('#v6Paper','A2'); settle()
    # back to 6 view: its settings come back untouched
    pg.click('#dwsTabs [data-k="6v"]'); settle()
    ok('6 view keeps its own paper / scale / iso',pg.input_value('#v6Paper')=='A4' and pg.input_value('#v6Scale')=='c' and pg.is_checked('#v6Iso') and pg.input_value('#v6Fs')=='5',[pg.input_value('#v6Paper'),pg.input_value('#v6Scale'),pg.input_value('#v6Fs')])
    ok('6 view has no totals box',hit('tot') is None)
    pg.click('#dwsTabs [data-k=exp]'); settle()
    tp=pg.evaluate("__mrt.v6().tot")
    ok('Exploded view keeps its settings and the moved totals',pg.input_value('#v6Paper')=='A2' and pg.input_value('#v6Fs')=='7' and tp is not None,[pg.input_value('#v6Paper'),tp])
    sc('#v6Tot',False); settle(); ok('Totals can be switched off',hit('tot') is None); sc('#v6Tot',True); settle()
    # ---- session round trip (.mrtl)
    pg.evaluate("delete window.showSaveFilePicker"); pg.on('dialog',lambda d: d.accept('drawtest'))
    with pg.expect_download(timeout=60000) as dl: pg.mouse.click(5,300); pg.keyboard.press('Control+Shift+S')
    path=dl.value.path(); mrtl='/tmp/drawtest.mrtl'; open(mrtl,'wb').write(open(path,'rb').read())
    pg.evaluate("__mrt.v6Load(null)"); settle()
    ok('Reset brings defaults back',pg.evaluate("__mrt.v6().mode")=='6v' and pg.input_value('#v6Paper')=='A3' and pg.evaluate("__mrt.v6().tot")==None)
    pg.click('#dwsBack'); pg.wait_for_timeout(200)
    pg.set_input_files('#file',[mrtl]); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    pg.click('#b_dws'); settle()
    st=pg.evaluate("(()=>{const V=__mrt.v6();return [V.mode,V.tot,V.st['6v'].iso!=null,V.cfg['6v'].v6Paper,V.cfg['6v'].v6Scale,V.cfg['6v'].v6IsoK]})()")
    ok('Session restores the exploded view as the open drawing',st[0]=='exp' and pg.input_value('#v6Paper')=='A2' and pg.input_value('#v6Fs')=='7',st)
    ok('Session restores the moved totals box',st[1] is not None and abs(st[1][0]-tp[0])<1e-6 and abs(st[1][1]-tp[1])<1e-6,[st[1],tp])
    ok('Session restores the 6-view settings and iso size',st[3]=='A4' and st[4]=='c' and float(st[5])==k and st[2],st)
    pg.click('#dwsTabs [data-k="6v"]'); settle()
    ok('6 view after reopening: custom scale and iso size',pg.input_value('#v6Scale')=='c' and float(pg.input_value('#v6IsoK'))==k and hit('iso') is not None)
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
