# Browser test (v1.5.0): Drawing, exploded view.
# - picking: each click on a part adds it; Ctrl+click takes it out; double-click gives one material to every picked part;
#   a click on empty sheet drops the picks; a drag on empty sheet is a pick box (left to right: wholly inside, right to
#   left: touched), it does not move the sheet (middle button / Space + drag do); empty corners of a part's box are sheet
# - turning picked parts on their own (Turn / Tilt / Roll, 90° steps, reset), kept with the sheet
# - frame names inside / outside, at any corner
# - Auto Arrange: the total-mass box takes no room from the parts, it goes to a free corner
# - Effects tab: ZBrush-style sliders, on / off switches, light ball; Part Outline draws a line round every part
# Run: python3 ui35.py <fixtures folder> [path to index.html]
import sys,os,base64,io
from PIL import Image
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1600,'height':900},offline=True)
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    pg.set_input_files('#file',[S+'/steps.stl',S+'/boss.stl',S+'/m_peg.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==4"); pg.wait_for_timeout(300)
    pg.click('#b_dws'); pg.wait_for_function("(__mrt.v6().nprev||0)>=1",timeout=60000)
    pg.evaluate("__mrt.dwType('exp')"); pg.wait_for_timeout(500)
    pg.evaluate("""()=>{window.set=function(m){for(const k in m){const e=document.getElementById(k);if(e.type==='checkbox')e.checked=m[k];else e.value=m[k];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}};
      window.idle=function(){return new Promise(r=>{let n=__mrt.v6().nprev||0,t=0;const i=setInterval(()=>{const m=__mrt.v6().nprev||0;if(m!==n){n=m;t=0;}else if(++t>12){clearInterval(i);r();}},100);});};}""")
    pg.evaluate("set({v6Ex:120})"); pg.evaluate("idle()")
    pg.click('#dwsTabs [data-k=draw]'); pg.wait_for_timeout(300)
    def parts(): return pg.evaluate("__mrt.v6().prev.hits.filter(h=>h.kind==='part').map(h=>({id:h.id,r:__mrt.v6Scr(h.r)}))")
    def centre(id):
        # a pixel of the part's own picture (body-number mask), in client coordinates
        return pg.evaluate("""id=>{const V=__mrt.v6(),q=V.prev,h=q.hits.find(x=>x.kind==='part'&&x.id===id),pt=q.parts.find(x=>x.id===id),M=pt.map,w=pt.cv.width,hh=pt.cv.height;
          let bx=0,by=0,n=0;for(let y=0;y<hh;y+=3)for(let x=0;x<w;x+=3)if(M.ids[y*w+x]){bx+=x;by+=y;n++;}
          bx/=n;by/=n;let best=null;for(let y=0;y<hh;y+=2)for(let x=0;x<w;x+=2)if(M.ids[y*w+x]){const d=(x-bx)**2+(y-by)**2;if(!best||d<best[2])best=[x,y,d];}
          const tr=h.r.tr,s=__mrt.v6Scr({x:tr.x0+best[0]*tr.s,y:tr.y0+best[1]*tr.s,w:0,h:0});return [s.x,s.y];}""",id)
    P=parts(); ids=[x['id'] for x in P]
    ok('4 parts on the sheet',len(P)==4,len(P))
    a,bb=centre(ids[0]),centre(ids[1])
    pg.mouse.click(*a); pg.mouse.click(*bb)
    sel=pg.evaluate("(()=>{const V=__mrt.v6();return V.psels.slice()})()")
    ok('Two clicks pick two parts',sorted(sel)==sorted(ids[:2]),sel)
    pg.keyboard.down('Control'); pg.mouse.click(*bb); pg.keyboard.up('Control')
    ok('Ctrl+click takes a part out again',pg.evaluate("__mrt.v6().psels.slice()")==[ids[0]])
    pg.mouse.click(*bb); c=centre(ids[2]); pg.mouse.click(*c)
    ok('Three parts picked',len(pg.evaluate("__mrt.v6().psels"))==3)
    # double-click: one material for the three
    pg.mouse.dblclick(*c); pg.wait_for_timeout(200)
    ed=pg.evaluate("(()=>({show:getComputedStyle(document.getElementById('v6Ed')).display,n:document.getElementById('v6EdN').textContent,t:getComputedStyle(document.getElementById('v6EdT')).display,picked:__mrt.v6().psels.length}))()")
    ok('Double-click opens the material box for the picked parts (no name field)',ed['show']=='block' and '3' in ed['n'] and ed['t']=='none' and ed['picked']==3,ed)
    pg.select_option('#v6EdM','ABS'); pg.click('#v6EdOk'); pg.wait_for_timeout(300)
    mats=pg.evaluate("ids=>ids.map(id=>__mrt.S.bodies.find(b=>b.id===id).material)",ids)
    ok('The three picked parts got ABS, the fourth not',mats[:3]==['ABS']*3 and mats[3]!='ABS',mats)
    # empty sheet click drops the picks
    box=pg.locator('#v6Prev').bounding_box()
    vp0=pg.evaluate("__mrt.v6().vp.slice()")
    pg.mouse.click(box['x']+box['width']-30,box['y']+30)
    ok('Click on empty sheet drops every pick',pg.evaluate("__mrt.v6().psels.length===0&&__mrt.v6().psel==null"))
    # a drag on empty sheet: a pick box, the sheet does not move
    rs=[r['r'] for r in parts()]
    x0=min(r['x'] for r in rs)-20; y0=min(r['y'] for r in rs)-20; x1=max(r['x']+r['w'] for r in rs)+20; y1=max(r['y']+r['h'] for r in rs)+20
    x0=max(x0,box['x']+3); y0=max(y0,box['y']+3)
    hit=pg.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return e&&e.id}",[x0,y0])
    pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move((x0+x1)/2,(y0+y1)/2,steps=4); pg.mouse.move(x1,y1,steps=4)
    drawn=pg.evaluate("!!(__mrt.v6().box&&__mrt.v6().box.moved)")
    pg.mouse.up(); pg.wait_for_timeout(200)
    ok('Drag over empty sheet draws a pick box',drawn,hit)
    ok('Left-to-right box picks the parts wholly inside (all 4)',len(pg.evaluate("__mrt.v6().psels"))==4,pg.evaluate("__mrt.v6().psels"))
    ok('The sheet did not move (no pan on the left button)',pg.evaluate("__mrt.v6().vp.slice()")==vp0)
    pg.mouse.click(box['x']+box['width']-30,box['y']+30)
    r0=parts()[0]['r']; cx=r0['x']+r0['w']*0.5; cy=r0['y']+r0['h']*0.5
    pg.mouse.move(r0['x']+r0['w']+15,r0['y']+r0['h']+15); pg.mouse.down(); pg.mouse.move(cx,cy,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    ok('Right-to-left box picks what it touches',ids[0] in pg.evaluate("__mrt.v6().psels"),pg.evaluate("__mrt.v6().psels"))
    pg.mouse.click(box['x']+box['width']-30,box['y']+30)
    # middle button still moves the sheet
    pg.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2); pg.mouse.down(button='middle'); pg.mouse.move(box['x']+box['width']/2+40,box['y']+box['height']/2+20,steps=3); pg.mouse.up(button='middle')
    ok('Middle button moves the sheet',pg.evaluate("__mrt.v6().vp.slice()")!=vp0)
    pg.evaluate("document.querySelector('[data-act=fit]')&&document.querySelector('[data-act=fit]').click()"); pg.wait_for_timeout(300)
    # turning one part
    pg.evaluate("idle()")
    c=centre(ids[3]); pg.mouse.click(*c)
    w0=pg.evaluate("id=>{const h=__mrt.v6().prev.hits.find(x=>x.kind==='part'&&x.id===id);return [h.r.w,h.r.h]}",ids[3])
    dis=pg.evaluate("[...document.querySelectorAll('#dwsRibbon [data-bind=v6Pt],#dwsRibbon button[data-act=rotTurn]')].map(e=>e.disabled)")
    ok('Rotation controls are on with a part picked',dis and not any(dis),dis)
    pg.click('#dwsRibbon button[data-act=rotTip]'); pg.evaluate("idle()")
    pr=pg.evaluate("id=>__mrt.v6().prot[id]",ids[3])
    w1=pg.evaluate("id=>{const h=__mrt.v6().prev.hits.find(x=>x.kind==='part'&&x.id===id);return [h.r.w,h.r.h]}",ids[3])
    ok('Tilt 90° turns only the picked part (its picture changes shape)',pr==[0,90,0] and abs(w1[1]/w1[0]-w0[1]/w0[0])>0.05,[pr,w0,w1])
    others=pg.evaluate("ids=>ids.map(id=>__mrt.v6().prot[id]||null)",ids[:3])
    ok('The other parts keep their orientation',others==[None]*3,others)
    pg.evaluate("set({v6Pt:30})"); pg.evaluate("idle()")
    ok('Turn slider sets the angle',pg.evaluate("id=>__mrt.v6().prot[id]",ids[3])==[30,90,0])
    dump=pg.evaluate("__mrt.v6Dump().st.exp.prot")
    ok('Part turns are kept with the sheet',any(v==[30,90,0] for v in dump.values()),dump)
    pg.click('#dwsRibbon button[data-act=rotReset]'); pg.evaluate("idle()")
    ok('Reset puts the part back',pg.evaluate("id=>__mrt.v6().prot[id]===undefined",ids[3]))
    pg.mouse.click(box['x']+box['width']-30,box['y']+30)
    ok('Rotation controls are off with nothing picked',all(pg.evaluate("[...document.querySelectorAll('#dwsRibbon [data-bind=v6Pt],#dwsRibbon button[data-act=rotTurn]')].map(e=>e.disabled)")))
    # frame names
    pg.evaluate("""()=>{const V=__mrt.v6();V.rects.exp=[{id:999,x:0.1,y:0.2,w:0.3,h:0.3,color:'#e53935',title:'Cum A',ts:5,lw:0.5,tp:'otl'}];__mrt.v6Paint();}""")
    def title_box(): return pg.evaluate("(()=>{const h=__mrt.v6().prev.hits.find(x=>x.kind==='rect'&&x.title);const f=__mrt.v6().prev.hits.filter(x=>x.kind==='rect'&&!x.title);const W=__mrt.v6().prev.o.W*__mrt.v6().prev.k,H=__mrt.v6().prev.o.H*__mrt.v6().prev.k;return {t:h.r,fx:0.1*W,fy:0.2*H,fw:0.3*W,fh:0.3*H}})()")
    res={}
    for tp in ['otl','otr','obl','obr','itl','itr','ibl','ibr']:
        pg.evaluate("tp=>{__mrt.v6().rects.exp[0].tp=tp;__mrt.v6Paint();}",tp); t=title_box(); T=t['t']
        cxm=T['x']+T['w']/2; cym=T['y']+T['h']/2
        left=cxm<t['fx']+t['fw']/2; top=cym<t['fy']+t['fh']/2; inside=t['fy']<cym<t['fy']+t['fh']
        res[tp]=(left==(tp[2]=='l')) and (top==(tp[1]=='t')) and (inside==(tp[0]=='i'))
    ok('Frame name at each of the 8 places (inside / outside x 4 corners)',all(res.values()),res)
    pg.evaluate("__mrt.v6().rects.exp=[];__mrt.v6Paint()")
    # Auto Arrange with the total-mass box
    pg.evaluate("set({v6Tot:true})"); pg.evaluate("idle()")
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Auto"]'); pg.wait_for_timeout(300); pg.evaluate("idle()")
    lay=pg.evaluate("""(()=>{const q=__mrt.v6().prev,H=q.o.H*q.k,W=q.o.W*q.k,ps=q.hits.filter(h=>h.kind==='part'||h.kind==='label'),t=q.hits.find(h=>h.kind==='tot');
      const ov=ps.some(p=>!(p.r.x+p.r.w<t.r.x||p.r.x>t.r.x+t.r.w||p.r.y+p.r.h<t.r.y||p.r.y>t.r.y+t.r.h));
      const top=Math.min(...ps.map(p=>p.r.y)),bot=Math.max(...ps.map(p=>p.r.y+p.r.h));return {ov:ov,gapTop:top/H,gapBot:(H-bot)/H,tot:!!t};})()""")
    ok('Total mass shown and covers no part after Auto Arrange',lay['tot'] and not lay['ov'],lay)
    ok('Parts use the sheet height evenly (no strip kept for the totals)',abs(lay['gapTop']-lay['gapBot'])<0.06,lay)
    # Effects tab
    pg.click('#dwsTabs [data-k=fx]'); pg.wait_for_timeout(300)
    n=pg.evaluate("document.querySelectorAll('#dwsRibbon .rpage.on .zpal').length"); nz=pg.evaluate("document.querySelectorAll('#dwsRibbon .rpage.on .zbs').length")
    ok('Effects: ZBrush-style palettes and sliders',n==6 and nz>=11,[n,nz])
    z=pg.locator('#dwsRibbon .rpage.on .zbs[data-zb=v6FxAs]').bounding_box()
    pg.mouse.click(z['x']+z['width']*0.5,z['y']+z['height']/2); pg.wait_for_timeout(100)
    ok('Clicking the middle of the AO slider sets 50',pg.evaluate("document.getElementById('v6FxAs').value")=='50',pg.evaluate("document.getElementById('v6FxAs').value"))
    pg.mouse.move(z['x']+z['width']*0.5,z['y']+z['height']/2); pg.mouse.down(); pg.mouse.move(z['x']+z['width']*0.25,z['y']+z['height']/2,steps=3); pg.mouse.up()
    ok('Dragging the slider changes the value',pg.evaluate("document.getElementById('v6FxAs').value")=='25')
    sw=pg.locator('#dwsRibbon .rpage.on .zon[data-zon=v6FxAs]')
    sw.click(); a1=pg.evaluate("document.getElementById('v6FxAs').value"); sw.click(); a2=pg.evaluate("document.getElementById('v6FxAs').value")
    ok('AO switch: off sets 0, on brings 25 back',a1=='0' and a2=='25',[a1,a2])
    bl=pg.locator('#dwsRibbon .rpage.on .zball').bounding_box()
    pg.mouse.click(bl['x']+bl['width']/2,bl['y']+bl['height']*0.2); pg.wait_for_timeout(100)
    sa=float(pg.evaluate("document.getElementById('v6FxSa').value")); se=float(pg.evaluate("document.getElementById('v6FxSe').value")); ss=float(pg.evaluate("document.getElementById('v6FxS').value"))
    ok('Light ball: a spot above the centre lights from the top and turns the shadow on',abs(sa-90)<=3 and 20<se<70 and ss>0,[sa,se,ss])
    pg.locator('#dwsRibbon .rpage.on .zbs[data-zb=v6FxC]').dblclick(); pg.keyboard.type('42'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    ok('Double-click a slider to type a value',pg.evaluate("document.getElementById('v6FxC').value")=='42')
    # part outline: a line round the part
    pg.evaluate("set({v6FxAs:0,v6FxS:0,v6FxC:0,v6FxId:false})"); pg.evaluate("idle()")
    def png():
        d=pg.evaluate("__mrt.v6Png()"); return Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGB')
    pg.evaluate("set({v6Paper:'A4',v6Dpi:100})"); pg.evaluate("idle()")
    off=png(); pg.evaluate("set({v6FxId:true,v6FxOw:0.6,v6FxOc:'#d02020'})"); pg.evaluate("idle()"); on=png()
    red=sum(1 for px in on.getdata() if px[0]>150 and px[1]<80 and px[2]<80); red0=sum(1 for px in off.getdata() if px[0]>150 and px[1]<80 and px[2]<80)
    ok('Part Outline draws a line round the parts (red pixels appear)',red>500 and red0==0,[red0,red])
    ok('No page errors',not errs,errs[:3])
    b.close()
print('ALL OK' if fails==0 else str(fails)+' FAILED')
sys.exit(1 if fails else 0)
