# Browser test (v1.6.0): Drawing Workspace layout and picking.
# - defaults: Part Outline 0.05 mm, DPI 600; Effects tab: Default button, no export buttons
# - first opening: sheets Dimension (6 Views) and Exploded (Exploded View)
# - Export tab: only Info + Export; Drawing tab (both types): every command on the ribbon, nothing folded, no
#   horizontal overflow; no Explode / Scale & Layout groups (their controls moved to Assembly / Sheet)
# - exploded view: every picked part lights orange, a click on empty sheet clears it
# Run: python3 ui36.py <fixtures folder> [path to index.html]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html'); fails=0
def ok(n,c,x=''):
    global fails
    print(('ok   ' if c else 'FAIL ')+n+('  '+str(x) if x!='' else ''));  fails+= (not c)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1366,'height':800},offline=True,accept_downloads=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    ok('Version 1.6.1',pg.evaluate("document.getElementById('appVer').textContent")=='v1.6.1')
    ok('Defaults: outline 0.05, DPI 600',pg.evaluate("[document.getElementById('v6FxOw').value,document.getElementById('v6Dpi').value]")==['0.05','600'])
    pg.set_input_files('#file',[S+'/steps.stl',S+'/boss.stl',S+'/m_peg.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==4"); pg.wait_for_timeout(300)
    pg.click('#b_dws'); pg.wait_for_function("(__mrt.v6().nprev||0)>=1",timeout=60000); pg.wait_for_timeout(500)
    names=pg.evaluate("(()=>{const t=document.body.innerText;return ['Dimension','Exploded'].map(n=>t.includes(n))})()")
    ok('First opening: sheets Dimension and Exploded',all(names),names)
    ok('Dimension is 6 views',pg.evaluate("__mrt.v6().mode")=='6v')
    # export tab
    pg.click('#dwsTabs [data-k=set]'); pg.wait_for_timeout(200)
    grs=pg.evaluate("Array.from(document.querySelectorAll('#dwsRibbon .rpage.on > .rgrp > .rtitle')).map(e=>e.textContent)")
    ok('Export tab: only Info + Export',grs==['Thông tin','Xuất'],grs)
    pg.click('#dwsTabs [data-k=fx]'); pg.wait_for_timeout(200)
    ok('Effects tab: no export buttons',pg.evaluate("document.querySelectorAll('#dwsRibbon .rpage.on [data-act=png]').length")==0)
    # default button
    pg.evaluate("(()=>{for(const [k,v] of [['v6FxOw','1.2'],['v6FxAs','50'],['v6FxT','2']]){const e=document.getElementById(k);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));} const c=document.getElementById('v6FxId');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));})()")
    pg.click('#dwsRibbon .rpage.on [data-act=fxDef]'); pg.wait_for_timeout(200)
    v=pg.evaluate("['v6FxOw','v6FxOwR','v6FxAs','v6FxT'].map(i=>document.getElementById(i).value).concat([document.getElementById('v6FxId').checked])")
    ok('Default button resets effects',v==['0.05','0.05','0','5',True],v)
    # drawing tab: every group open on the ribbon (nothing folded), Explode / Scale & Layout groups gone but their controls kept
    pg.click('#dwsTabs [data-k=draw]'); pg.wait_for_timeout(300)
    want={'6v':(['Sheet','Hình chiếu','Chú thích','Hướng nhìn','Hiển thị & nét','Ghi chú','Ảnh xuất','Bố trí & loại bản vẽ'],['Explode','Tỉ lệ & bố trí'],['v6Scale','v6Paper','v6Dpi','v6Lw','v6Nf','v6Az','v6IsoK']),
          'exp':(['Sheet','Cụm lắp','Xoay linh kiện','Linh kiện','Khung','Hướng nhìn','Hiển thị & nét','Ghi chú','Ảnh xuất','Bố trí & loại bản vẽ'],['Explode','Tỉ lệ & bố trí'],['v6Ex','v6Az','v6Pt','v6PMat','v6Rs','v6Dpi','v6Nf'])}
    for m in ['6v','exp']:
        if m=='exp': pg.evaluate("__mrt.dwType('exp')"); pg.wait_for_timeout(800)
        t=pg.evaluate("Array.from(document.querySelectorAll('#dwsRibbon .rpage.on > .rgrp > .rtitle')).map(e=>e.textContent)")
        ok('Drawing '+m+': groups',t==want[m][0],t)
        ok('Drawing '+m+': removed groups gone',not any(x in t for x in want[m][1]))
        vis=pg.evaluate("ks=>ks.map(k=>{const e=document.querySelector('#dwsRibbon .rpage.on [data-bind='+k+']');return !!e&&e.offsetWidth>0})",want[m][2])
        ok('Drawing '+m+': controls shown on the ribbon',all(vis),vis)
        btn=pg.evaluate("Array.from(document.querySelectorAll('#dwsRibbon .rpage.on button')).filter(b=>b.offsetWidth===0&&!b.closest('.dwsWhen')).length")
        ok('Drawing '+m+': no hidden buttons, no drop-downs',btn==0 and pg.evaluate("document.querySelectorAll('#dwsRibbon .rddb,#dwsRibbon .rgrp.dd').length")==0,btn)
        o=pg.evaluate("(()=>{const p=document.querySelector('#dwsRibbon .rpage.on');return [p.scrollWidth,p.clientWidth]})()")
        ok('Drawing '+m+': no horizontal overflow',o[0]<=o[1]+1 or pg.evaluate("!!document.querySelector('#dwsRibbon .rpage.on').style.transform"),o)
    pg.set_viewport_size({'width':1920,'height':900}); pg.wait_for_timeout(600)
    for m in ['exp','6v']:
        if m=='6v': pg.evaluate("__mrt.dwType('6v')"); pg.wait_for_timeout(800)
        f=pg.evaluate("(()=>{const p=document.querySelector('#dwsRibbon .rpage.on');return [p.style.transform,document.querySelectorAll('#dwsRibbon .rpage.on .rgrp.ic,#dwsRibbon .rpage.on .rgrp.ib').length]})()")
        ok('1920 px, '+m+': everything at full size with its text',f==['',0],f)
    pg.set_viewport_size({'width':1366,'height':800}); pg.wait_for_timeout(600)
    pg.evaluate("__mrt.dwType('exp')"); pg.wait_for_timeout(800)
    pg.evaluate("(()=>{const e=document.getElementById('v6Dpi');e.value=300;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()")
    # exploded: highlight all picked
    pg.evaluate("""()=>{window.idle=function(){return new Promise(r=>{let n=__mrt.v6().nprev||0,t=0;const i=setInterval(()=>{const m=__mrt.v6().nprev||0;if(m!==n){n=m;t=0;}else if(++t>12){clearInterval(i);r();}},100);});};}""")
    e=pg.evaluate("(()=>{const e=document.getElementById('v6Ex');e.value=120;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()"); pg.evaluate("idle()")
    def centre(id):
        return pg.evaluate("""id=>{const V=__mrt.v6(),q=V.prev,h=q.hits.find(x=>x.kind==='part'&&x.id===id),pt=q.parts.find(x=>x.id===id),M=pt.map,w=pt.cv.width,hh=pt.cv.height;
          let bx=0,by=0,n=0;for(let y=0;y<hh;y+=3)for(let x=0;x<w;x+=3)if(M.ids[y*w+x]){bx+=x;by+=y;n++;}
          bx/=n;by/=n;let best=null;for(let y=0;y<hh;y+=2)for(let x=0;x<w;x+=2)if(M.ids[y*w+x]){const d=(x-bx)**2+(y-by)**2;if(!best||d<best[2])best=[x,y,d];}
          const tr=h.r.tr,s=__mrt.v6Scr({x:tr.x0+best[0]*tr.s,y:tr.y0+best[1]*tr.s,w:0,h:0});return [s.x,s.y];}""",id)
    ids=pg.evaluate("__mrt.v6().prev.hits.filter(h=>h.kind==='part').map(h=>h.id)")
    def orange(id):
        x,y=centre(id)
        return pg.evaluate("""([x,y])=>{const c=document.getElementById('v6Prev'),r=c.getBoundingClientRect(),g=c.getContext('2d');const d=g.getImageData(Math.round((x-r.left)*c.width/r.width),Math.round((y-r.top)*c.height/r.height),1,1).data;return [d[0],d[1],d[2]]}""",[x,y])
    base=[orange(i) for i in ids[:3]]
    for i in ids[:3]: pg.mouse.click(*centre(i)); pg.wait_for_timeout(150)
    pg.wait_for_timeout(300)
    lit=[orange(i) for i in ids[:3]]
    isor=lambda c: c[0]>c[2]+60
    ok('Three picked parts all lit orange',all(isor(c) for c in lit),(base,lit))
    ok('Fourth part not lit',not isor(orange(ids[3])))
    box=pg.locator('#v6Prev').bounding_box(); pg.mouse.click(box['x']+box['width']-20,box['y']+20); pg.wait_for_timeout(300)
    ok('Empty click: no orange left',not any(isor(orange(i)) for i in ids),[orange(i) for i in ids])
    ok('Empty click: no picks, no list pick',pg.evaluate("__mrt.v6().psels.length===0 && !__mrt.v6().hl"))
    # 600 dpi export works
    pg.evaluate("(()=>{const e=document.getElementById('v6Dpi');e.value=600;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()")
    pg.click('#dwsTabs [data-k=set]')
    with pg.expect_download(timeout=600000) as d: pg.evaluate("setTimeout(()=>document.querySelector('#dwsRibbon .rpage.on [data-act=png]').click(),10)")
    ok('PNG export at 600 dpi',d.value.suggested_filename.endswith('.png'),d.value.suggested_filename)
    ok('No page errors',not errs,errs)
print('ALL OK' if not fails else str(fails)+' FAILED')
