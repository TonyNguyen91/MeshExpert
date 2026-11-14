import os
import sys,json
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PTS=json.load(open(S+'/pts.json'))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    cx=b.new_context(viewport={'width':1680,'height':950},accept_downloads=True)
    try: cx.grant_permissions(['clipboard-read','clipboard-write'])
    except Exception as e: print('grant failed',e)
    pg=cx.new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def names(): return pg.evaluate("__mrt.S.bodies.map(b=>b.name+':'+b.geo.indices.length/3+(b.visible?'':'(hid)')+(__mrt.S.sel.has(b)?'*':''))")
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def row(i): return f'#bodyList .brow:nth-child({i+1})'
    def dragbox(a,b_,**k):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move((a[0]+b_[0])/2,(a[1]+b_[1])/2,steps=3); pg.mouse.move(*b_,steps=3); pg.mouse.up()
    pg.evaluate("document.querySelectorAll('#dock .pop').forEach(d=>d.classList.add('on'))"); pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==false){e.click()}})()")
    print('user-select',pg.evaluate("getComputedStyle(document.body).userSelect"))
    pg.set_input_files('#file',[S+'/cshape.stl',S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.click(row(1)); pg.click('#bSplit'); idle(); pg.click('#bSelNone'); pg.keyboard.press('f'); pg.wait_for_timeout(200); print('bodies',names())
    # screen boxes of bodies
    bb=pg.evaluate("""()=>{const r=document.getElementById('gl').getBoundingClientRect();return __mrt.S.bodies.map(b=>{let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;const P=b.geo.positions;for(let i=0;i<P.length;i+=3){const q=__mrt.project([P[i],P[i+1],P[i+2]]);x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);}return [x0+r.left,y0+r.top,x1+r.left,y1+r.top]})}""")
    c2=bb[1]  # cshape_002 small block far right
    # window L->R around whole of body 2 only
    dragbox([c2[0]-8,c2[1]-8],[c2[2]+8,c2[3]+8]); pg.wait_for_timeout(100); print('window around #2:',names())
    # window L->R covering only half of body 2 -> nothing
    pg.keyboard.press('Space'); dragbox([c2[0]-8,c2[1]-8],[(c2[0]+c2[2])/2,c2[3]+8]); pg.wait_for_timeout(100); print('window half #2:',names())
    # crossing R->L over half of body 2 -> selected
    dragbox([(c2[0]+c2[2])/2,c2[3]+8],[c2[0]-8,c2[1]-8]); pg.wait_for_timeout(100); print('crossing half #2:',names())
    # crossing tiny box inside a face of body 1
    pg.keyboard.press('Space'); c1=bb[0]; x,y=scr([15,10,20]); dragbox([x+6,y+6],[x,y]); pg.wait_for_timeout(100); print('crossing inside face:',names())
    # move tool + popup + shift snap
    pg.click('[data-tool=move]'); pg.wait_for_timeout(200); print('popup',pg.is_visible('#tpMove'),pg.is_visible('#tpRot'))
    g=pg.evaluate("(()=>{const g=__mrt.S.giz;const r=document.getElementById('gl').getBoundingClientRect();return {p:[g.p[0]+r.left,g.p[1]+r.top],e:g.ends.map(e=>[e[0]+r.left,e[1]+r.top])}})()")
    ex,ey=g['e'][0]; dx,dy=ex-g['p'][0],ey-g['p'][1]
    pg.keyboard.down('Shift'); pg.mouse.move(ex,ey); pg.mouse.down(); pg.mouse.move(ex+dx*0.37,ey+dy*0.37,steps=4); st=pg.inner_text('#status'); pg.mouse.up(); pg.keyboard.up('Shift'); print('shift move',st,'field',pg.input_value('#mvX'))
    pg.fill('#mvX','12.5'); pg.fill('#mvY','0'); pg.fill('#mvZ','0'); pg.press('#mvX','Enter'); print('typed move matrix x',pg.evaluate("[...__mrt.S.sel][0].matrix[12]"))
    pg.click('[data-tool=scale]'); pg.wait_for_timeout(200)
    g=pg.evaluate("(()=>{const g=__mrt.S.giz;const r=document.getElementById('gl').getBoundingClientRect();return {p:[g.p[0]+r.left,g.p[1]+r.top],e:g.ends.map(e=>[e[0]+r.left,e[1]+r.top])}})()")
    ex,ey=g['e'][0]; dx,dy=ex-g['p'][0],ey-g['p'][1]
    pg.keyboard.down('Shift'); pg.mouse.move(ex,ey); pg.mouse.down(); pg.mouse.move(ex+dx*1.6,ey+dy*1.6,steps=4); st=pg.inner_text('#status'); pg.mouse.up(); pg.keyboard.up('Shift'); print('shift scale',st)
    pg.wait_for_timeout(200); pg.screenshot(path=S+'/m1.png'); pg.keyboard.press('Escape'); print('popup hidden',not pg.is_visible('#tpop'))
    # merge
    pg.click('#bSelAll'); pg.click('#bJoin'); print('merged',names(),'|',pg.inner_text('#splitRes')); pg.click('#bUndo'); print('undo merge',names())
    pg.keyboard.press('Space'); pg.click(row(1)); pg.click(row(2)); pg.click(row(1),button='right'); pg.click("#ctx div:has-text('Gộp body tick')"); print('merge via ctx',names())
    # compare: auto align straight from points
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/refA.stl',S+'/scanB.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.keyboard.press('Space'); pg.click(row(1)); pg.click(row(2)); pg.click('#bCmpStart'); pg.wait_for_timeout(300)
    pg.click('#bCmpIcp'); print('icp without points ->',pg.inner_text('#status'))
    pg.evaluate("p=>{__mrt.S.cmp.pa=p.a.map((q,i)=>q.map(v=>v+(i%2?0.8:-0.6)));__mrt.S.cmp.pb=p.b;}",PTS)
    pg.click('#bCmpIcp'); pg.wait_for_timeout(500); idle(); pg.wait_for_timeout(800); idle(); print('auto align:',pg.inner_text('#cmpRes').replace('\n',' | '))
    pg.click('#bCmpView'); pg.wait_for_timeout(300); print('split',pg.evaluate("__mrt.S.cmp.split"))
    r=pg.evaluate("(()=>{const r=document.getElementById('gl').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
    pg.mouse.move(r[0]+r[2]*0.25,r[1]+r[3]*0.6); pg.mouse.down(button='right'); pg.mouse.move(r[0]+r[2]*0.25+80,r[1]+r[3]*0.6+30,steps=4); pg.mouse.up(button='right')
    print('cams synced',pg.evaluate("JSON.stringify(__mrt.S.cmp.cams[0].R)==JSON.stringify(__mrt.S.cmp.cams[1].R)"))
    pg.wait_for_timeout(200); pg.screenshot(path=S+'/m2.png')
    dl=[]; pg.on('download',lambda d: (d.save_as(S+'/shot.png'),dl.append(d.suggested_filename)))
    pg.click('#bCmpShot'); pg.wait_for_timeout(1200); print('shot status:',pg.inner_text('#status'),'download',dl)
    try:
        info=pg.evaluate("navigator.clipboard.read().then(async items=>{const b=await items[0].getType('image/png');const bm=await createImageBitmap(b);const c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;c.getContext('2d').drawImage(bm,0,0);window.__shot=c.toDataURL();return [b.size,bm.width,bm.height]})"); print('clipboard image',info)
        import base64; open(S+'/clip.png','wb').write(base64.b64decode(pg.evaluate("window.__shot").split(',')[1]))
    except Exception as e: print('clipboard read failed',str(e)[:120])
    pg.click('#bCmpEnd'); print('msg',repr(pg.inner_text('#msg')),'errs',errs)
    b.close()
