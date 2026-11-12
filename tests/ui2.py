import os
import sys,json
from playwright.sync_api import sync_playwright
S=sys.argv[1]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1500,'height':900})
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def names(): return pg.evaluate("__mrt.S.bodies.map(b=>b.name+':'+b.geo.indices.length/3+(b.visible?'':'(hid)'))")
    def scr(pt):
        r=pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt); return r
    def click3(pt,**k): x,y=scr(pt); pg.mouse.click(x,y,**k)
    def openall(): pg.evaluate("document.querySelectorAll('.pop').forEach(d=>d.classList.add('on'))")
    openall()
    # 12: multiple files
    pg.set_input_files('#file',[S+'/hollow.stl',S+'/cshape.stl',S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    print('loaded',names())
    pg.screenshot(path=S+'/s1.png')
    # select hollow by clicking its top face, info + material
    click3([22,13,20]); pg.wait_for_timeout(100)
    print('sel',pg.evaluate("[...__mrt.S.sel].map(b=>b.name)"))
    pg.click('#bodyList .item:nth-child(1)'); pg.select_option('#mat','ABS'); print('info',pg.inner_text('#infoTbl').replace('\n',' | '))
    # 8 thickness
    pg.click('#bIsolate'); pg.click('[data-tool=thick]'); click3([22,13,20]); 
    # 14 distance between two corners of hollow top (40 apart along x)
    pg.click('[data-tool=dist]'); click3([0,0,20]); click3([40,0,20])
    pg.click('[data-tool=angle]'); click3([0,0,20]); click3([40,0,20]); click3([40,30,20])
    pg.click('[data-tool=radius]'); click3([0,0,20]); click3([40,0,20]); click3([40,30,20])
    pg.click('#bShowAll'); print('measures',pg.inner_text('#measList').replace('\n',' | '))
    pg.keyboard.press('Escape')
    # split cshape (2 comps)
    pg.click('#bodyList .item:nth-child(2)'); pg.click('#bSplit'); idle(); print('split',names(),pg.inner_text('#splitRes'))
    # 11 collision: block overlaps cshape_001
    pg.evaluate("__mrt.S.sel.clear()"); pg.click('#bCol'); idle(); print('collide',pg.inner_text('#colRes').replace('\n',' | '))
    pg.screenshot(path=S+'/s2.png')
    # 7 undercut on cshape_001 along Z
    pg.click('#bodyList .item:nth-child(2)'); pg.click('#bUc'); idle(); print('undercut',pg.inner_text('#ucRes').replace('\n',' | '))
    pg.screenshot(path=S+'/s3.png')
    # 2 transform numeric: move block +100 X; rotate; scale
    pg.click('#bodyList .item:nth-child(4)'); pg.fill('#mvX','100'); pg.click('#bMove')
    print('block box after move',pg.inner_text('#infoTbl').replace('\n',' | '))
    pg.fill('#scX','2'); pg.click('#bScale'); pg.uncheck('#scUni'); pg.fill('#scX','1'); pg.fill('#scY','1'); pg.fill('#scZ','3'); pg.click('#bScale'); pg.fill('#rotA','90'); pg.click('#bRot')
    print('block after scale2, z*3, rotZ90',pg.inner_text('#infoTbl').replace('\n',' | '))
    # gizmo drag: move tool, drag X handle 80px
    pg.keyboard.press('f'); pg.click('[data-tool=move]'); pg.wait_for_timeout(250)
    g=pg.evaluate("(()=>{const g=__mrt.S.giz;const r=document.getElementById('gl').getBoundingClientRect();return {p:[g.p[0]+r.left,g.p[1]+r.top],e:g.ends.map(e=>[e[0]+r.left,e[1]+r.top])}})()")
    m0=pg.evaluate("[...__mrt.S.sel][0].matrix.slice(12,15)")
    ex,ey=g['e'][0]; dx,dy=ex-g['p'][0],ey-g['p'][1]
    pg.mouse.move(ex,ey); pg.mouse.down(); pg.mouse.move(ex+dx/2,ey+dy/2,steps=4); pg.mouse.move(ex+dx,ey+dy,steps=4); st=pg.inner_text('#status'); pg.mouse.up()
    m1=pg.evaluate("[...__mrt.S.sel][0].matrix.slice(12,15)"); print('gizmo move',st,[round(a-b,3) for a,b in zip(m1,m0)])
    pg.click('[data-tool=rotate]'); pg.wait_for_timeout(150)
    g=pg.evaluate("(()=>{const g=__mrt.S.giz;const r=document.getElementById('gl').getBoundingClientRect();return {p:[g.p[0]+r.left,g.p[1]+r.top],e:g.ends.map(e=>[e[0]+r.left,e[1]+r.top])}})()")
    ex,ey=g['e'][2]; pg.mouse.move(ex,ey); pg.mouse.down(); pg.mouse.move(ex+30,ey,steps=4); st=pg.inner_text('#status'); pg.mouse.up(); print('gizmo rot',st)
    # copy/paste
    pg.mouse.move(700,850); pg.keyboard.press('Control+c'); pg.keyboard.press('Control+v'); pg.wait_for_timeout(100); print('paste',names())
    pg.keyboard.press('Escape')
    # 1 hide, 9 display
    pg.click('#bodyList .item:nth-child(1)'); pg.evaluate("document.getElementById('col').value='#ff8800';document.getElementById('col').dispatchEvent(new Event('input'));const o=document.getElementById('opa');o.value=40;o.dispatchEvent(new Event('input'))")
    pg.evaluate("__mrt.S.sel.clear()")
    # 4 explode
    pg.evaluate("const o=document.getElementById('expl');o.value=120;o.dispatchEvent(new Event('input'))"); pg.wait_for_timeout(200); pg.keyboard.press('f'); pg.wait_for_timeout(200)
    pg.screenshot(path=S+'/s4.png')
    pg.evaluate("const o=document.getElementById('expl');o.value=0;o.dispatchEvent(new Event('input'))")
    # 10 section along X at 40%
    pg.evaluate("const o=document.getElementById('secAx');o.value='y';o.dispatchEvent(new Event('change'));const s=document.getElementById('secPos');s.value=350;s.dispatchEvent(new Event('input'))"); pg.keyboard.press('f'); pg.wait_for_timeout(200)
    print('section',pg.inner_text('#secV'))
    # 5 nav: right-drag rotate, wheel zoom, middle pan
    pg.mouse.move(900,500); pg.mouse.down(button='right'); pg.mouse.move(960,470,steps=5); pg.mouse.up(button='right')
    z0=pg.evaluate("__mrt.S.zoom"); pg.mouse.wheel(0,300); pg.wait_for_timeout(100); z1=pg.evaluate("__mrt.S.zoom")
    t0=pg.evaluate("__mrt.S.target.slice()"); pg.mouse.down(button='middle'); pg.mouse.move(930,480,steps=3); pg.mouse.up(button='middle'); t1=pg.evaluate("__mrt.S.target.slice()")
    print('zoom',round(z0,2),'->',round(z1,2),'pan moved',t0!=t1)
    pg.wait_for_timeout(200); pg.screenshot(path=S+'/s5.png')
    # 13 save session, clear, reload
    with pg.expect_download() as d: pg.click('#bSaveSes')
    d.value.save_as(S+'/ses.mrtl'); before=names(); nm=pg.evaluate("__mrt.S.measures.length")
    pg.click('#bClear'); print('cleared',names())
    pg.set_input_files('#file',[S+'/ses.mrtl']); pg.wait_for_function("__mrt.S.bodies.length>0"); idle()
    print('session restored',names()==before,pg.evaluate("__mrt.S.measures.length")==nm,pg.evaluate("__mrt.S.sec.on"),pg.evaluate("__mrt.S.bodies[0].opacity"),pg.evaluate("__mrt.S.bodies[0].color"))
    # decimate sphere file + 6 stl download
    pg.set_input_files('#file',[S+'/a.stl']); pg.wait_for_function("__mrt.S.bodies.some(b=>b.name=='a')"); idle()
    pg.evaluate("__mrt.S.sel.clear();__mrt.S.sel.add(__mrt.S.bodies.find(b=>b.name=='a'))"); pg.click('#bodyList .item:last-child'); 
    pg.fill('#vPct','20'); pg.click('#bApply'); idle(); print('decimate',pg.inner_text('#result'))
    with pg.expect_download() as d: pg.click('#bStl')
    d.value.save_as(S+'/dl.stl'); print('stl',d.value.suggested_filename)
    with pg.expect_download() as d: pg.click('#bZip')
    d.value.save_as(S+'/all.zip'); print('zip',d.value.suggested_filename)
    pg.evaluate("document.getElementById('secOn').click()"); pg.keyboard.press('Shift+Digit7'); pg.keyboard.press('f'); pg.wait_for_timeout(300); pg.screenshot(path=S+'/s6.png')
    print('msg',repr(pg.inner_text('#msg')),'errs',errs)
    b.close()
