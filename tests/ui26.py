# Browser test: Drawing Workspace — smooth preview (zoom / pan only scale a cached sheet, few new renders), defaults
# (line 0.01 mm, text 5 mm, 300 dpi), one file per sheet (PNG / JPG / PDF named after the sheets), Copy at e-mail size,
# note font / alignment / italic / underline / colour (also in the PDF), a body picked in a list lights up orange on the
# sheet (6 views and exploded) and a part picked on the exploded sheet lights up in the lists, collapsing a sheet in the
# tree, exploded Auto Arrange (no overlap, even gaps to each other and the border), frames with a group name.
# Run: python3 ui26.py <fixtures folder> [path to index.html] [folder for pictures]
import sys,os,re,zlib,subprocess,struct
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
OUT=sys.argv[3] if len(sys.argv)>3 else None
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
def png_size(b): return struct.unpack('>II',b[16:24])
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True,accept_downloads=True)
    ctx.grant_permissions(['clipboard-read','clipboard-write'])
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    pg.evaluate("delete window.showDirectoryPicker")
    def sv(sel,v): pg.evaluate("a=>{const e=document.querySelector(a[0]);e.value=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}",[sel,str(v)])
    def sc(sel,on): pg.evaluate("a=>{const e=document.querySelector(a[0]);if(e.checked!==a[1]){e.checked=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}",[sel,on])
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(1600)
    def scr(x,y): r=pg.evaluate("a=>__mrt.v6Scr({x:a[0],y:a[1],w:0,h:0})",[x,y]); return r['x'],r['y']
    def hitc(kind,key=None): return pg.evaluate("a=>{const h=__mrt.v6().prev.hits.find(h=>h.kind==a[0]&&(a[1]==null||h.n==a[1]||h.id==a[1]));if(!h)return null;const s=__mrt.v6Scr(h.r);return [s.x+s.w/2,s.y+s.h/2]}",[kind,key])
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl',S+'/m_box.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    U={n:pg.evaluate("n=>__mrt.S.bodies.find(b=>b.name==n).uid",n) for n in ['block','cyl','m_box']}
    pg.click('#b_dws'); settle()
    # ---- defaults
    ok('Defaults: line 0.01 mm, text 5 mm, 300 dpi',pg.evaluate("['v6Lw','v6Fs','v6Dpi'].map(i=>document.getElementById(i).value)")==['0.01','5','300'])
    # ---- smooth preview
    pg.evaluate("""(()=>{window.__rn=0;const V=__mrt.v6();let p=V.prev;Object.defineProperty(V,'prev',{configurable:true,get(){return p},set(v){if(v&&v!==p)window.__rn++;p=v}});})()""")
    box=pg.locator('#v6Prev').bounding_box(); cx=box['x']+box['width']*0.45; cy=box['y']+box['height']*0.5
    pg.mouse.move(cx,cy)
    for i in range(6):
        for j in range(4): pg.mouse.wheel(0,-120); pg.wait_for_timeout(30)
        pg.wait_for_timeout(600)
    settle()
    rn=pg.evaluate("window.__rn"); vz=pg.evaluate("__mrt.v6().vz")
    ok('Zooming in ~8x needs only a few new renders',vz>5 and rn<=4,[vz,rn])
    t=pg.evaluate("""()=>{const pc=document.getElementById('v6Prev'),R=pc.getBoundingClientRect();const t0=performance.now();for(let i=0;i<30;i++)pc.dispatchEvent(new WheelEvent('wheel',{deltaY:i%2?40:-40,clientX:R.left+R.width/2,clientY:R.top+R.height/2,bubbles:true,cancelable:true}));return performance.now()-t0}""")
    ok('Wheel events return at once (painting waits for the next frame)',t<60,t)
    pg.click('#v6VzFit'); settle()
    # ---- one file per sheet
    pg.click('#dwsTabs [data-k=set]')
    pg.click('#dwsRibbon .rpage.on button[data-act=newSheet]'); settle()
    pg.evaluate("(()=>{const d=__mrt.dw().doc;d.sheets[0].name='Tờ A';d.sheets[1].name='Tờ B';})()"); pg.click('#dwsTabs [data-k=set]')
    got=[]; pg.on('download',lambda d: got.append(d))
    for fmt,head in (('Png',b'\x89PNG'),('Jpg',b'\xff\xd8'),('Pdf',b'%PDF')):
        pg.click('#dwsRibbon .rpage.on button[data-act=each%s]'%fmt)
        pg.wait_for_function("document.getElementById('busy').style.display!='flex'",timeout=300000); pg.wait_for_timeout(1500)
        names=sorted(d.suggested_filename for d in got[-2:])
        ext=fmt.lower()
        ok('%s per sheet: one file each, named after the sheets'%fmt.upper(),names==['Tờ A.'+ext,'Tờ B.'+ext] and all(open(d.path(),'rb').read(4)[:len(head)]==head for d in got[-2:]),names)
    ok('Back on the sheet that was open',pg.evaluate("(()=>{const d=__mrt.dw().doc;return d.sheets.find(s=>s.id==d.active).name})()")=='Tờ B')
    # ---- copy at e-mail size
    sv('#v6Dpi','600'); settle()
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Copy"]'); idle(); pg.wait_for_timeout(800)
    data=pg.evaluate("""async()=>{const it=await navigator.clipboard.read();const b=await it[0].getType('image/png');return Array.from(new Uint8Array(await b.arrayBuffer()).slice(0,32))}""")
    w,h=png_size(bytes(data))
    ok('Copy gives an e-mail sized picture (long side 2000 px) whatever the DPI',max(w,h)==2000 and min(w,h)>1000,(w,h))
    sv('#v6Dpi','300'); settle(); pg.click('#dwsTabs [data-k=set]')
    # ---- notes: font, alignment, italic, underline, colour
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6AddT"]'); pg.wait_for_timeout(300)
    pg.fill('#v6EdT','LINE ONE\nTWO'); pg.click('#v6EdOk'); pg.wait_for_timeout(200)
    pg.select_option('#dwsRibbon .rpage.on select[data-bind=v6Nf]','Times New Roman')
    c=pg.evaluate("(()=>{const h=__mrt.v6().prev.hits.find(h=>h.kind=='note');const s=__mrt.v6Scr(h.r);return [s.x+s.w/2,s.y+s.h/2]})()")
    pg.mouse.click(c[0],c[1],button='right'); pg.wait_for_timeout(200)
    ok('Right-click on a note: alignment / style menu',all(t in pg.inner_text('#ctx') for t in ['Căn trái','Căn giữa','Căn phải','Nghiêng','Gạch chân','Xoá ghi chú']),pg.inner_text('#ctx'))
    pg.click('#ctx div:has-text("Căn phải")'); pg.wait_for_timeout(200)
    pg.click('#dwsRibbon .rpage.on button[data-chk="#v6Ni"]'); pg.click('#dwsRibbon .rpage.on button[data-chk="#v6Nu"]')
    sv('#dwsRibbon .rpage.on input[data-bind=v6Nc]','#1565c0'); pg.wait_for_timeout(300)
    n=pg.evaluate("__mrt.v6().notes['6v'][0]")
    ok('Note takes font, alignment, italic, underline and colour',n['font']=='Times New Roman' and n['align']=='right' and n['italic'] and n['under'] and n['color']=='#1565c0',n)
    pg.evaluate("__mrt.dwPdf().then(a=>window.__pdf=a)"); pg.wait_for_function("window.__pdf",timeout=300000)
    pdf=bytes(pg.evaluate("window.__pdf")); open('/tmp/ui26.pdf','wb').write(pdf)
    fonts=subprocess.run(['pdffonts','/tmp/ui26.pdf'],capture_output=True,text=True).stdout
    txt=subprocess.run(['pdftotext','/tmp/ui26.pdf','-'],capture_output=True,text=True).stdout
    ok('PDF writes the note in Times Italic (vector text)','LINE ONE' in txt and '/F8 ' in b''.join(zlib.decompress(m) for m in re.findall(rb'/FlateDecode >>\nstream\n(.*?)\nendstream',pdf,re.S)).decode('latin1'),fonts[:300])
    # ---- body picked in a list lights up (6 views)
    pg.click('#dwsTabs [data-k="6v"]'); settle()
    def orange():
        return pg.evaluate("""(()=>{const q=__mrt.v6().prev;let n=0;for(const k in q.views){const c=q.views[k].cv,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<d.length;i+=4)if(d[i+3]>200&&d[i]>110&&d[i]>d[i+1]*1.35&&d[i+1]>d[i+2]*1.6)n++;}return n})()""")
    o0=orange()
    pg.click('#dwsTree .dwsNode.body[data-uid="%s"]'%U['cyl']); settle()
    o1=orange()
    ok('6 views: body picked in the sheet list turns orange on the sheet',o0==0 and o1>500,[o0,o1])
    ok('…and in the left Source Bodies list too',pg.evaluate("n=>document.querySelector('#dwsSrcList .dwsSrcI[data-uid=\"'+n+'\"]').classList.contains('on')",U['cyl']))
    pg.click('#dwsTree .dwsNode.body[data-uid="%s"]'%U['cyl']); settle()
    ok('Picking it again clears the highlight',orange()==0)
    # ---- exploded: list -> sheet, sheet -> list
    pg.click('#dwsTabs [data-k=exp]'); settle()
    pg.click('#dwsSrcList .dwsSrcI[data-uid="%s"]'%U['block']); settle()
    st=pg.evaluate("n=>{const V=__mrt.v6(),pt=V.prev.parts.find(p=>p.b.uid==n);const c=pt.cv,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let k=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>200&&d[i]>110&&d[i]>d[i+1]*1.35&&d[i+1]>d[i+2]*1.6)k++;return [V.psel===pt.id,k]}",U['block'])
    ok('Exploded: body picked in the left list is the picked part, orange on the sheet',st[0] and st[1]>300,st)
    mid=pg.evaluate("n=>__mrt.v6().prev.parts.find(p=>p.b.uid==n).id",U['m_box'])
    c=hitc('part',mid); pg.mouse.click(c[0],c[1]); settle()
    ok('Exploded: part clicked on the sheet lights up in both lists',pg.evaluate("n=>document.querySelector('#dwsTree .dwsNode.body[data-uid=\"'+n+'\"]').classList.contains('on')&&document.querySelector('#dwsSrcList .dwsSrcI[data-uid=\"'+n+'\"]').classList.contains('on')",U['m_box']))
    # ---- exploded auto arrange
    pg.evaluate("(()=>{const V=__mrt.v6();for(const p of V.prev.parts)V.off[p.id]=[0.3,0.3];})()")
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Auto"]'); settle()
    bx=pg.evaluate("""(()=>{const q=__mrt.v6().prev,k=q.k,o={};for(const h of q.hits){if(h.kind!='part'&&h.kind!='label')continue;const r=[h.r.x/k,h.r.y/k,(h.r.x+h.r.w)/k,(h.r.y+h.r.h)/k];const b=o[h.id];o[h.id]=b?[Math.min(b[0],r[0]),Math.min(b[1],r[1]),Math.max(b[2],r[2]),Math.max(b[3],r[3])]:r;}return {b:Object.values(o),W:q.o.W,H:q.o.H}})()""")
    B=bx['b']; W=bx['W']; H=bx['H']
    ov=[(i,j) for i in range(len(B)) for j in range(i+1,len(B)) if B[i][0]<B[j][2] and B[j][0]<B[i][2] and B[i][1]<B[j][3] and B[j][1]<B[i][3]]
    mg=min(min(r[0],r[1],W-r[2]) for r in B)
    ok('Exploded Auto Arrange: no part over another, none against the border',not ov and mg>0.03*min(W,H),[ov,mg])
    rows={}
    for r in B: rows.setdefault(round((r[1]+r[3])/2/10),[]).append(r)
    even=True
    for rr in rows.values():
        rr.sort(); g=[rr[0][0]]+[rr[i+1][0]-rr[i][2] for i in range(len(rr)-1)]+[W-rr[-1][2]]
        even=even and max(g)-min(g)<2
    ok('Exploded Auto Arrange: even gaps in each row and to the side borders',even,B)
    if OUT: pg.screenshot(path=os.path.join(OUT,'ui26_exp.png'))
    # ---- frames
    pg.click('#dwsRibbon .rpage.on button[data-act=rect]'); pg.wait_for_timeout(150)
    ok('Frame tool on (button lit)',pg.evaluate("!!__mrt.v6().rt") and pg.evaluate("document.querySelector('#dwsRibbon .rpage.on button[data-act=rect]').classList.contains('on')"))
    x0,y0=scr(0.1*W*pg.evaluate("__mrt.v6().prev.k"),0.15*H*pg.evaluate("__mrt.v6().prev.k")); x1,y1=scr(0.5*W*pg.evaluate("__mrt.v6().prev.k"),0.6*H*pg.evaluate("__mrt.v6().prev.k"))
    pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move(x1,y1,steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    ok('Dragging draws the frame and opens its name',pg.is_visible('#v6EdT') and len(pg.evaluate("__mrt.v6().rects.exp"))==1)
    pg.fill('#v6EdT','Cụm thân xe'); pg.click('#v6EdOk'); pg.wait_for_timeout(200)
    f=pg.evaluate("__mrt.v6().rects.exp[0]")
    ok('Frame: red by default, named, sized as dragged',f['color']=='#e53935' and f['title']=='Cụm thân xe' and abs(f['x']-0.1)<0.01 and abs(f['w']-0.4)<0.01 and abs(f['h']-0.45)<0.01,f)
    sv('#dwsRibbon .rpage.on input[data-bind=v6Rc]','#2e7d32'); pg.wait_for_timeout(200)
    ok('Colour of the picked frame changes',pg.evaluate("__mrt.v6().rects.exp[0].color")=='#2e7d32')
    t=pg.evaluate("(()=>{const h=__mrt.v6().prev.hits.find(h=>h.kind=='rect'&&h.title);const s=__mrt.v6Scr(h.r);return [s.x+s.w/2,s.y+s.h/2]})()")
    pg.mouse.move(t[0],t[1]); pg.mouse.down(); pg.mouse.move(t[0]+60,t[1]+30,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    f2=pg.evaluate("__mrt.v6().rects.exp[0]")
    ok('Dragging the name moves the frame',f2['x']>f['x']+0.01 and abs(f2['w']-f['w'])<1e-9)
    c=hitc('rectR'); pg.mouse.move(c[0],c[1]); pg.mouse.down(); pg.mouse.move(c[0]+50,c[1]+40,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    ok('Dragging the corner resizes it',pg.evaluate("__mrt.v6().rects.exp[0].w")>f2['w']+0.01)
    pg.dblclick('#v6Prev',position={'x':t[0]+60-box['x'],'y':t[1]+30-box['y']}); pg.wait_for_timeout(300)
    ok('Double-click the name to edit it',pg.is_visible('#v6EdT') and pg.input_value('#v6EdT')=='Cụm thân xe')
    pg.fill('#v6EdT','Group A'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    pg.evaluate("__mrt.dwPdf().then(a=>window.__pdf2=a)"); pg.wait_for_function("window.__pdf2",timeout=300000)
    open('/tmp/ui26b.pdf','wb').write(bytes(pg.evaluate("window.__pdf2")))
    txt=subprocess.run(['pdftotext','/tmp/ui26b.pdf','-'],capture_output=True,text=True).stdout
    raw=b''.join(zlib.decompress(m) for m in re.findall(rb'/FlateDecode >>\nstream\n(.*?)\nendstream',open('/tmp/ui26b.pdf','rb').read(),re.S)).decode('latin1')
    ok('PDF: frame name as text, frame as a green vector line','Group A' in txt and re.search(r'0\.18 0\.49 0\.196 RG',raw) is not None)
    pg.keyboard.press('Control+s'); pg.wait_for_timeout(700)
    ok('Frame kept in the saved sheet',pg.evaluate("(()=>{const d=__mrt.dw().doc,s=d.sheets.find(s=>s.id==d.active);return s.saved.rects.exp.length})()")==1)
    pg.mouse.click(t[0]+60,t[1]+30); pg.keyboard.press('Delete'); pg.wait_for_timeout(200)
    ok('Delete removes the picked frame',len(pg.evaluate("__mrt.v6().rects.exp"))==0)
    # ---- collapse a sheet in the tree
    ok('Open sheet shows a collapse arrow and its children',pg.inner_text('#dwsTree .dwsNode.sheet.on .tw')=='▾' and pg.locator('#dwsTree .dwsNode.body').count()==3)
    pg.click('#dwsTree .dwsNode.sheet.on .tw'); pg.wait_for_timeout(200)
    ok('Collapse hides the views / bodies of the sheet',pg.inner_text('#dwsTree .dwsNode.sheet.on .tw')=='▸' and pg.locator('#dwsTree .dwsNode.body').count()==0 and pg.locator('#dwsTree .dwsNode.view').count()==0)
    pg.click('#dwsTree .dwsNode.sheet.on .tw'); pg.wait_for_timeout(200)
    ok('Expand shows them again',pg.locator('#dwsTree .dwsNode.body').count()==3)
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
