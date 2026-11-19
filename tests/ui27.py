# Browser test: 3D panel width (1.3x, drag, double-click default), ribbon commands lit while their dialog is open and
# back to Select when it closes, Drawing: tab switch 6 Views <-> Exploded asks first, iso Turn / Tilt in 6 Views only
# active with Isometric, Export group keeps its labels, exploded view starts assembled (Explode slider = 0), Auto
# Arrange respects frames (parts in / over a frame are laid out inside it, the rest outside, none over a frame), frames
# snap to each other when moved / resized.
# Run: python3 ui27.py <fixtures folder> [path to index.html] [folder for pictures]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
OUT=sys.argv[3] if len(sys.argv)>3 else None
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True)
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    ans={'v':True}; asked=[]
    def ondlg(d): asked.append(d.message); d.accept() if ans['v'] else d.dismiss()
    pg.on('dialog',ondlg)
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(1600)
    def sv(sel,v): pg.evaluate("a=>{const e=document.querySelector(a[0]);e.value=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}",[sel,str(v)])
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl',S+'/m_box.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    # ---- 3D: body panel
    w=pg.evaluate("document.getElementById('left').offsetWidth")
    ok('Body panel 1.3x wider by default (364 px)',w==364,w)
    sp=pg.locator('#leftSplit').bounding_box()
    pg.mouse.move(sp['x']+3,sp['y']+200); pg.mouse.down(); pg.mouse.move(sp['x']+83,sp['y']+200,steps=4); pg.mouse.up()
    ok('Panel edge drags wider (kept)',pg.evaluate("document.getElementById('left').offsetWidth")==444 and pg.evaluate("localStorage.getItem('mx.leftW')")=='444')
    pg.dblclick('#leftSplit'); pg.wait_for_timeout(100)
    ok('Double-click: default width again',pg.evaluate("document.getElementById('left').offsetWidth")==364)
    ok('Body names fully visible',pg.evaluate("[...document.querySelectorAll('#bodyList .brow .nm')].every(n=>n.scrollWidth<=n.clientWidth+1)"))
    # ---- ribbon command lit while its dialog is open
    lit=lambda s: pg.evaluate("s=>{const b=document.querySelector(s);return b.classList.contains('on')&&getComputedStyle(b).borderTopColor=='rgb(240, 160, 48)'}",s)
    for btn,close in (('#b_fillet','#odNo'),('#b_pattern','#pop_pat .popx'),('[data-pop=undercut]','#pop_undercut .popx'),('[data-tool=dist]','#pop_measure .popx'),('#bSketch','#skplane [data-pl=x]')):
        pg.click(btn); pg.wait_for_timeout(400); a=lit(btn)
        pg.click(close); pg.wait_for_timeout(400)
        ok('%s lit while open, off + Select after X'%btn,a and not lit(btn) and pg.evaluate("__mrt.S.tool")=='select')
    # ---- drawing
    pg.click('#b_dws'); settle()
    ok('Export tab: Export group keeps its labels at 1456 px',pg.evaluate("(()=>{document.querySelector('#dwsTabs [data-k=set]').click();return true})()") and pg.wait_for_timeout(600) is None and not pg.evaluate("document.querySelector('#dwsRibbon .rpage.on .rgrp.keep').classList.contains('ic')"))
    w2=pg.evaluate("[...document.querySelectorAll('#dwsRibbon .rpage.on .rgrp')].map(g=>[g.querySelector('.rtitle').textContent,Math.round(g.getBoundingClientRect().width)])")
    ok('Picture settings and sheet info groups are compact',dict(w2)['Ảnh xuất']<=170 and dict(w2)['Thông tin']<=170,w2)
    pg.click('#dwsTabs [data-k="6v"]'); pg.wait_for_timeout(300)
    ok('From Export back to the same drawing type: no question',not asked)
    dis=lambda: pg.evaluate("[...document.querySelectorAll('#dwsRibbon .rpage[data-k=\"6v\"] [data-bind=v6Az],#dwsRibbon .rpage[data-k=\"6v\"] [data-bind=v6El],#dwsRibbon .rpage[data-k=\"6v\"] [data-bind=v6IsoK]')].map(e=>e.disabled)")
    pg.wait_for_timeout(600)
    ok('Iso Turn / Tilt / Size in 6 Views, greyed while Isometric is off',dis()==[True,True,True])
    pg.click('#dwsRibbon .rpage.on button[data-chk="#v6Iso"]'); pg.wait_for_timeout(700)
    ok('…active once Isometric is on',dis()==[False,False,False])
    ans['v']=False; pg.click('#dwsTabs [data-k=exp]'); pg.wait_for_timeout(500)
    ok('Clicking Exploded View asks first; No keeps 6 Views',len(asked)==1 and 'Exploded' in asked[0] and pg.evaluate("__mrt.v6().mode")=='6v' and pg.evaluate("document.querySelector('#dwsTabs .rtab.on').dataset.k")=='6v')
    ans['v']=True; pg.click('#dwsTabs [data-k=exp]'); settle()
    ok('Yes switches the sheet to Exploded View',pg.evaluate("__mrt.v6().mode")=='exp')
    # ---- exploded starts assembled
    ok('Exploded view starts assembled (Explode = 0)',pg.input_value('#v6Ex')=='0' and pg.evaluate("(()=>{const q=__mrt.v6().prev;return q.plan.items.every(it=>true)&&__mrt.v6().prev.o.spread===0})()"))
    sv('#dwsRibbon .rpage.on input[data-bind=v6ExR]','120'); settle()
    ok('Dragging the Explode slider pulls the parts apart',pg.evaluate("__mrt.v6().prev.o.spread")==1.2)
    # ---- frames + auto arrange
    pg.evaluate("""(()=>{const V=__mrt.v6();V.rects.exp=[{id:901,x:0.05,y:0.1,w:0.4,h:0.75,color:'#e53935',title:'Cụm A',ts:5,lw:0.5}];})()""")
    # put the block over the frame, the others far away from it
    ids=pg.evaluate("__mrt.v6().prev.parts.map(p=>[p.id,p.b.name])"); idn={n:i for i,n in ids}
    pg.evaluate("""a=>{const V=__mrt.v6(),q=V.prev,k=q.k,W=q.o.W*k,H=q.o.H*k;for(const h of q.hits){if(h.kind!='part')continue;const cx=h.r.x+h.r.w/2,cy=h.r.y+h.r.h/2,o=V.off[h.id]||[0,0];const t=h.id==a[0]?[0.25,0.45]:[0.8,0.5];V.off[h.id]=[o[0]+(t[0]*W-cx)/W,o[1]+(t[1]*H-cy)/H];}}""",[idn['block']])
    pg.evaluate("__mrt.v6Paint()"); settle()
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Auto"]'); settle()
    bx=pg.evaluate("""(()=>{const q=__mrt.v6().prev,k=q.k,o={};for(const h of q.hits){if(h.kind!='part'&&h.kind!='label')continue;const r=[h.r.x/k,h.r.y/k,(h.r.x+h.r.w)/k,(h.r.y+h.r.h)/k];const b=o[h.id];o[h.id]=b?[Math.min(b[0],r[0]),Math.min(b[1],r[1]),Math.max(b[2],r[2]),Math.max(b[3],r[3])]:r;}return {b:o,W:q.o.W,H:q.o.H}})()""")
    W=bx['W']; H=bx['H']; F=[0.05*W,0.1*H,0.45*W,0.85*H]
    inside=lambda r: r[0]>=F[0] and r[1]>=F[1] and r[2]<=F[2] and r[3]<=F[3]
    over=lambda r: r[0]<F[2] and r[2]>F[0] and r[1]<F[3] and r[3]>F[1]-0.03*H
    B={int(k):v for k,v in bx['b'].items()}
    ok('Part over the frame is laid out inside it',inside(B[idn['block']]),[B[idn['block']],F])
    ok('Parts outside stay outside, none over the frame or its name',all(not over(B[idn[n]]) for n in ('cyl','m_box')),B)
    r=B[idn['block']]; gx=[r[0]-F[0],F[2]-r[2]]
    ok('Inside the frame the part is centred (even gaps)',abs(gx[0]-gx[1])<3,gx)
    ov=[(a,c) for a in B for c in B if a<c and B[a][0]<B[c][2] and B[c][0]<B[a][2] and B[a][1]<B[c][3] and B[c][1]<B[a][3]]
    ok('No two parts overlap',not ov,ov)
    if OUT: pg.screenshot(path=os.path.join(OUT,'ui27_frames.png'))
    # ---- frame snapping
    pg.evaluate("""(()=>{const V=__mrt.v6();V.rects.exp.push({id:902,x:0.55,y:0.13,w:0.3,h:0.3,color:'#e53935',title:'Cụm B',ts:5,lw:0.5});})()""")
    pg.evaluate("__mrt.v6Paint()"); settle()
    t=pg.evaluate("(()=>{const h=__mrt.v6().prev.hits.find(h=>h.kind=='rect'&&h.id==902&&h.title);const s=__mrt.v6Scr(h.r);return [s.x+s.w/2,s.y+s.h/2]})()")
    pp=pg.evaluate("__mrt.v6Scr({x:0,y:0,w:__mrt.v6().prev.o.W*__mrt.v6().prev.k,h:__mrt.v6().prev.o.H*__mrt.v6().prev.k})")
    dy=-0.03*pp['h']+2   # the top edge 0.13 -> about 0.10 (the other frame's top), a little off
    pg.mouse.move(t[0],t[1]); pg.mouse.down(); pg.mouse.move(t[0]+5,t[1]+dy,steps=5)
    g=pg.evaluate("__mrt.v6().snapG")
    pg.mouse.up(); pg.wait_for_timeout(200)
    f=pg.evaluate("__mrt.v6().rects.exp.find(r=>r.id==902)")
    ok('Moving a frame snaps its top to the other frame (guide shown)',abs(f['y']-0.1)<1e-9 and g and g['y'],[f['y'],g])
    c=pg.evaluate("(()=>{const h=__mrt.v6().prev.hits.find(h=>h.kind=='rectR'&&h.id==902);const s=__mrt.v6Scr(h.r);return [s.x+s.w/2,s.y+s.h/2]})()")
    want=0.85-(f['y']+f['h'])
    pg.mouse.move(c[0],c[1]); pg.mouse.down(); pg.mouse.move(c[0],c[1]+want*pp['h']-3,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    f=pg.evaluate("__mrt.v6().rects.exp.find(r=>r.id==902)")
    ok('Resizing snaps the bottom edge in line with the other frame',abs(f['y']+f['h']-0.85)<1e-9,f)
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
