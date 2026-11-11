import sys,json
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PTS=json.load(open(S+'/pts.json'))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1680,'height':950})
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file:///home/claude/index.html')
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def names(): return pg.evaluate("__mrt.S.bodies.map(b=>b.name+':'+b.geo.indices.length/3+(b.visible?'':'(hid)')+(__mrt.S.sel.has(b)?'*':''))")
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def click3(pt,**k): x,y=scr(pt); pg.mouse.click(x,y,**k)
    def row(i): return f'#bodyList .brow:nth-child({i+1})'
    pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
    pg.set_input_files('#file',[S+'/hollow.stl',S+'/cshape.stl',S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    print('loaded',names())
    # zoom direction: wheel down (deltaY>0) should zoom OUT now
    pg.mouse.move(900,500); z0=pg.evaluate("__mrt.cam().zoom"); pg.mouse.wheel(0,300); pg.wait_for_timeout(100); z1=pg.evaluate("__mrt.cam().zoom"); print('wheel down zoom',round(z0,1),'->',round(z1,1)); pg.keyboard.press('f')
    # tick via row click, info popup + material -> mass column
    pg.click(row(1)); pg.select_option('#mat','ABS'); print('info',pg.inner_text('#infoTbl').replace('\n',' | ')); print('row',pg.inner_text(row(1)).replace('\n',' | '))
    pg.wait_for_timeout(200); pg.screenshot(path=S+'/n1.png')
    # decimate requires tick
    pg.click('#bSelNone'); pg.click('#bApply'); print('no tick ->',pg.inner_text('#status'))
    # invert / all
    pg.click('#bSelInv'); print('invert',names()); pg.click('#bSelNone')
    # move + undo/redo + home
    pg.click(row(3)); pg.fill('#mvX','50'); pg.click('#bMove'); m=lambda: pg.evaluate("__mrt.S.bodies[2].matrix[12]")
    a=m(); pg.click('#bUndo'); b_=m(); pg.click('#bRedo'); c=m(); pg.click(row(3)) if not pg.evaluate("__mrt.S.sel.size") else None; pg.click('#bHome'); d=m(); print('move/undo/redo/home x:',a,b_,c,d)
    # context menu on 3D body (right click) and on list row
    pg.click('#bSelNone'); x,y=scr([22,13,20]); pg.mouse.click(x,y,button='right'); pg.wait_for_timeout(150)
    print('ctx 3D:',pg.inner_text('#ctx').replace('\n',' | ')[:160],'| sel',names())
    pg.screenshot(path=S+'/n2.png'); pg.keyboard.press('Escape')
    pg.click(row(2),button='right'); pg.wait_for_timeout(100); pg.click("#ctx div:has-text('Tách body')"); idle(); print('split via ctx',names())
    # undercut with brightness
    pg.click(row(2)); pg.click('#bUc'); idle(); pg.evaluate("const o=document.getElementById('ucBright');o.value=200;o.dispatchEvent(new Event('input'))"); pg.wait_for_timeout(200); pg.screenshot(path=S+'/n3.png'); print('uc',pg.inner_text('#ucRes').replace('\n',' | ')[-90:])
    # collision + click a pair
    pg.click('#bSelNone'); pg.click('#bCol'); idle(); print('col',pg.inner_text('#colRes').replace('\n',' | '))
    pg.click('#colRes .pair:nth-child(3)'); pg.wait_for_timeout(200); print('active pair',pg.evaluate("__mrt.S.col.active"),'ana bodies',pg.evaluate("__mrt.S.bodies.filter(b=>b.ana).map(b=>b.name)")); pg.screenshot(path=S+'/n4.png')
    pg.click('#bColClr')
    # language switch
    pg.click('#bEn'); pg.wait_for_timeout(150); print('EN:',pg.inner_text('#bOpen'),'|',pg.inner_text('#bodyList .brow.hd').replace('\n',' '),'|',pg.inner_text('[data-tool=thick]'),'|',pg.inner_text('#infoTbl').replace('\n',' | ')[:60]); pg.screenshot(path=S+'/n5.png'); pg.click('#bVi')
    # compare
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/refA.stl',S+'/scanB.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.click(row(1)); pg.click(row(2),modifiers=['Control']); print('ticked',names())
    pg.click('#bCmpStart'); pg.wait_for_timeout(300)
    # one real click in each viewport at the viewport centre
    r=pg.evaluate("(()=>{const r=document.getElementById('gl').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
    pg.mouse.click(r[0]+r[2]*0.25,r[1]+r[3]*0.5); pg.mouse.click(r[0]+r[2]*0.75,r[1]+r[3]*0.5); pg.wait_for_timeout(100)
    print('clicked pts',pg.evaluate("[__mrt.S.cmp.pa.length,__mrt.S.cmp.pb.length]"))
    # navigation inside right viewport only
    R0=pg.evaluate("[__mrt.S.cmp.cams[0].R[0],__mrt.S.cmp.cams[1].R[0]]"); pg.mouse.move(r[0]+r[2]*0.75,r[1]+r[3]*0.6); pg.mouse.down(button='right'); pg.mouse.move(r[0]+r[2]*0.75+60,r[1]+r[3]*0.6,steps=4); pg.mouse.up(button='right')
    R1=pg.evaluate("[__mrt.S.cmp.cams[0].R[0],__mrt.S.cmp.cams[1].R[0]]"); print('left cam unchanged',R0[0]==R1[0],'right cam rotated',R0[1]!=R1[1])
    pg.wait_for_timeout(200); pg.screenshot(path=S+'/n6.png')
    pg.click('#bCmpUndo'); pg.click('#bCmpUndo')
    pg.evaluate("p=>{__mrt.S.cmp.pa=p.a.map(q=>q.map(v=>v+0.2));__mrt.S.cmp.pb=p.b;}",PTS); pg.mouse.click(r[0]+r[2]*0.25,r[1]+r[3]*0.5); pg.click('#bCmpUndo')
    pg.click('#bCmpAlign'); idle(); print('after align:',pg.inner_text('#cmpRes').replace('\n',' | '))
    pg.wait_for_timeout(200); pg.screenshot(path=S+'/n7.png')
    pg.click('#bCmpIcp'); idle(); pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(500); print('after icp:',pg.inner_text('#cmpRes').replace('\n',' | '))
    pg.fill('#cmpRange','0.6'); pg.keyboard.press('Tab'); pg.wait_for_timeout(300); pg.screenshot(path=S+'/n8.png')
    pg.click('#bCmpEnd'); print('ended',names(),pg.evaluate("__mrt.S.cmp"))
    # session
    with pg.expect_download() as d: pg.click('#bSaveSes')
    d.value.save_as(S+'/ses2.mrtl'); bf=names(); pg.click('#bClear'); pg.set_input_files('#file',[S+'/ses2.mrtl']); pg.wait_for_function("__mrt.S.bodies.length>0"); idle(); print('session ok',names()==bf)
    print('msg',repr(pg.inner_text('#msg')),'errs',errs)
    b.close()
