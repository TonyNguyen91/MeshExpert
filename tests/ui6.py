# Browser test: Onshape-like ticking, bounding box / centre of mass display, view rotation about the pressed point,
# and the rotate gizmo.  Run: node make_split_meshes.js <folder>; python3 ui6.py <folder> [path to index.html]
import sys,os,math
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    cx=b.new_context(viewport={'width':1680,'height':950})
    pg=cx.new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def sel(): return pg.evaluate("__mrt.S.bodies.filter(b=>__mrt.S.sel.has(b)).map(b=>b.name)")
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def off(): return pg.evaluate("(()=>{const r=document.getElementById('gl').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
    def row(i): return f'#bodyList .brow:nth-child({i+1})'
    def info(): return pg.inner_text('#infoTbl').replace('\t',' ').replace('\n',' | ')
    def giz(): return pg.evaluate("(()=>{const g=__mrt.S.giz;if(!g)return null;const r=document.getElementById('gl').getBoundingClientRect();const f=q=>[q[0]+r.left,q[1]+r.top];return {p:f(g.p),ends:g.ends.map(f),arcs:g.arcs.map(a=>a.map(f)),pv:g.pv}})()")
    def mat(i=0): return pg.evaluate("i=>__mrt.S.bodies[i].matrix",i)
    pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==false){e.click()}})()")   # the info panel covers part of the view
    pg.set_input_files('#file',[S+'/one.stl',S+'/pair.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    # 'one' is the box x 100..120, y 0..20, z 0..20; 'pair' is x 0..10, y 0..10, z 0..20
    A=scr([110,0,10]); B=scr([5,0,10]); o=off(); empty=[o[0]+o[2]-30,o[1]+o[3]/2-200]

    # ---- ticking like Onshape ----
    pg.mouse.click(*A); pg.wait_for_timeout(80); ok('click a body: ticked',sel()==['one'],sel())
    pg.mouse.click(*B); pg.wait_for_timeout(80); ok('click another without Ctrl: both ticked',sel()==['one','pair'],sel())
    pg.mouse.click(*A); pg.wait_for_timeout(80); ok('click a ticked body again: unticked',sel()==['pair'],sel())
    pg.mouse.click(*empty); pg.wait_for_timeout(80); ok('click empty space: nothing ticked',sel()==[],sel())
    pg.click(row(1)); pg.click(row(2)); ok('rows add up too',sel()==['one','pair'],sel())
    pg.click(row(1)); ok('row again unticks',sel()==['pair'],sel())
    pg.keyboard.press('Space'); pg.wait_for_timeout(80); ok('Space unticks all',sel()==[],sel())
    pg.click(row(1)); pg.evaluate("document.getElementById('bFit').click()"); n0=pg.evaluate("__mrt.S.bodies.length"); pg.keyboard.press('Space'); pg.wait_for_timeout(120)
    ok('Space with a button focused only unticks (button not pressed again)',sel()==[] and pg.evaluate("__mrt.S.bodies.length")==n0)
    # box select adds to what is ticked
    pg.mouse.click(*A); a0=scr([0,0,0]); a1=scr([10,10,20])
    xs=[q[0] for q in [scr([x,y,z]) for x in (0,10) for y in (0,10) for z in (0,20)]]; ys=[q[1] for q in [scr([x,y,z]) for x in (0,10) for y in (0,10) for z in (0,20)]]
    pg.mouse.move(min(xs)-12,min(ys)-12); pg.mouse.down(); pg.mouse.move((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,steps=3); pg.mouse.move(max(xs)+12,max(ys)+12,steps=3); pg.mouse.up(); pg.wait_for_timeout(100)
    ok('box select adds to the ticked set',sel()==['one','pair'],sel())
    pg.keyboard.press('Space')

    # ---- bounding box and centre of mass ----
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==true){e.click()}})()"); pg.mouse.click(*A); pg.wait_for_timeout(100)
    ok('info shows the centre of mass of the box','110.00, 10.00, 10.00 mm' in info(),info())
    pg.check('#cShow_box'); pg.check('#cShow_com'); pg.wait_for_timeout(150); pg.screenshot(path=S+'/g1.png')
    ok('show flags set',pg.evaluate("__mrt.S.show.box&&__mrt.S.show.com"))
    pg.click(row(2)); pg.wait_for_timeout(120)
    ok('two ticked: combined centre of mass (by volume)', '89.00, 9.00, 10.00 mm' in info(),info())
    ok('checkboxes keep their state when the selection changes',pg.is_checked('#cShow_box') and pg.is_checked('#cShow_com'))
    pg.screenshot(path=S+'/g2.png')
    # measure between the two centre-of-mass marks: |(110,10,10)-(5,5,10)|
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked){e.click()}})()")
    pg.click('[data-tool=dist]'); ca=scr([110,10,10]); cb=scr([5,5,10])
    pg.mouse.move(ca[0]+3,ca[1]-2); pg.wait_for_timeout(60); pg.mouse.click(ca[0]+3,ca[1]-2); pg.mouse.click(cb[0]-2,cb[1]+3); pg.wait_for_timeout(120)
    d=pg.evaluate("__mrt.S.measures.length?__mrt.S.measures[__mrt.S.measures.length-1].v:-1")
    ok('distance tool snaps to the centre-of-mass marks',abs(d-math.hypot(105,5))<1e-4,d)
    ok('measuring does not change what is ticked',sel()==['one','pair'],sel())
    pg.keyboard.press('Escape'); pg.screenshot(path=S+'/g3.png')
    pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(!e.checked){e.click()}})()"); pg.wait_for_timeout(80)
    pg.uncheck('#cShow_box'); pg.uncheck('#cShow_com'); pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==false){e.click()}})()")

    # ---- view rotation about the pressed point ----
    pg.keyboard.press('Space'); P=[120,0,20]; s0=scr(P)
    pg.mouse.move(s0[0]-1,s0[1]+1); pg.mouse.down(button='right'); pg.mouse.move(s0[0]+90,s0[1]+40,steps=6); pg.mouse.move(s0[0]+160,s0[1]-70,steps=6)
    piv=pg.evaluate("__mrt.S.viewPivot"); pg.screenshot(path=S+'/g4.png'); pg.mouse.up(button='right'); pg.wait_for_timeout(100)
    s1=scr(piv) if piv else [1e9,1e9]
    ok('view turns about the pressed surface point (it stays under the same pixel)',piv is not None and abs(s1[0]-(s0[0]-1))<1.5 and abs(s1[1]-(s0[1]+1))<1.5,[s0,s1,piv])
    ok('pressed point was on the body',piv is not None and abs(piv[1])<0.6 and 99<piv[0]<121,piv)
    ok('pivot mark gone after release',pg.evaluate("__mrt.S.viewPivot")is None)
    R0=pg.evaluate("__mrt.cam().R"); t0=pg.evaluate("__mrt.cam().target")
    pg.mouse.move(*empty); pg.mouse.down(button='right'); pg.mouse.move(empty[0]-60,empty[1]+30,steps=5); pg.mouse.up(button='right')
    ok('right-drag on empty space still rotates, about the screen centre',pg.evaluate("__mrt.cam().R")!=R0 and pg.evaluate("__mrt.cam().target")==t0)
    pg.keyboard.press('Escape'); pg.mouse.click(*empty)

    # ---- rotate gizmo ----
    pg.keyboard.press('Shift+7'); pg.evaluate("document.getElementById('bFit').click()"); pg.wait_for_timeout(150)
    pg.click(row(1)); pg.click('[data-tool=rotate]'); pg.wait_for_timeout(200); g=giz()
    ok('rotate gizmo has 3 curved arrows',g is not None and len(g['arcs'])==3 and len(g['arcs'][0])>8)
    def turn(axis,frm,to,shift=False,shot=None):
        g=giz(); a=g['arcs'][axis]; s=a[frm]; e=a[to]
        pg.mouse.move(*s); pg.wait_for_timeout(60)
        hov=pg.evaluate("__mrt.S.hov")
        if shift: pg.keyboard.down('Shift')
        pg.mouse.down(); pg.mouse.move((s[0]+e[0])/2,(s[1]+e[1])/2,steps=4); pg.mouse.move(*e,steps=4); pg.wait_for_timeout(80)
        st=pg.inner_text('#status')
        if shot: pg.screenshot(path=S+'/'+shot)
        pg.mouse.up()
        if shift: pg.keyboard.up('Shift')
        pg.wait_for_timeout(120)
        return hov,st
    m0=mat(0); hov,st=turn(2,3,13,shot='g5.png'); m1=mat(0)
    ang=math.degrees(math.atan2(m1[1],m1[0]))          # rotation about Z of the body matrix
    arc=pg.evaluate("__mrt.arc"); exp=math.degrees((arc['a1']-arc['a0'])*10/arc['n'])
    ok('hovering a curved arrow lights it up',hov==2,hov)
    ok('dragging along the Z arrow turns the body about Z by the angle travelled',abs(ang-exp)<1.0 and abs(m1[10]-1)<1e-9,[round(ang,2),round(exp,2),st])
    c=pg.evaluate("(()=>{const b=__mrt.S.bodies[0];const m=b.matrix;return [m[0]*110+m[4]*10+m[8]*10+m[12],m[1]*110+m[5]*10+m[9]*10+m[13],m[2]*110+m[6]*10+m[10]*10+m[14]]})()")
    ok('the body turns about its own centre',abs(c[0]-110)<1e-6 and abs(c[1]-10)<1e-6 and abs(c[2]-10)<1e-6,c)
    pg.click('#bUndo'); pg.wait_for_timeout(100)
    hov,st=turn(0,12,4,shift=True); m2=mat(0); angx=math.degrees(math.atan2(m2[6],m2[5]))
    ok('Shift: whole degrees, other direction, about X',abs(angx-round(angx))<1e-6 and angx<-20 and '°' in st,[angx,st])
    pg.click('#bUndo'); pg.wait_for_timeout(100)
    # dial seen edge-on (front view: Z arrow lies flat): still turns, by sliding
    pg.keyboard.press('Shift+1'); pg.wait_for_timeout(150); g=giz(); a=g['arcs'][2]
    flat=max(q[1] for q in a)-min(q[1] for q in a)
    hov,st=turn(2,3,13); m3=mat(0); angz=math.degrees(math.atan2(m3[1],m3[0]))
    ok('edge-on dial: arrow is flat on screen, dragging still rotates the right way',flat<2 and hov==2 and angz>10,[round(flat,2),round(angz,2),st])
    pg.click('#bUndo'); pg.keyboard.press('Shift+7'); pg.wait_for_timeout(150)
    # more than half a turn in one drag keeps counting
    g=giz(); cen=g['p']; a=g['arcs'][2]; s=a[8]; r=math.hypot(s[0]-cen[0],s[1]-cen[1]); a0=math.atan2(s[1]-cen[1],s[0]-cen[0])
    pg.mouse.move(*s); pg.mouse.down()
    for k in range(1,41): pg.mouse.move(cen[0]+r*math.cos(a0-k*0.12),cen[1]+r*math.sin(a0-k*0.12))
    st=pg.inner_text('#status'); pg.screenshot(path=S+'/g6.png'); pg.mouse.up(); pg.wait_for_timeout(100)
    big=float(st.split('=')[1].replace('°','').strip())
    ok('one long drag counts past 180 degrees',abs(big)>200,st)
    pg.click('#bUndo')
    # move gizmo still works, with arrows
    pg.click('[data-tool=move]'); pg.wait_for_timeout(150); g=giz(); e=g['ends'][0]; d=[e[0]-g['p'][0],e[1]-g['p'][1]]
    pg.mouse.move(*e); pg.wait_for_timeout(60); hv=pg.evaluate("__mrt.S.hov"); pg.keyboard.down('Shift'); pg.mouse.down(); pg.mouse.move(e[0]+d[0]*0.5,e[1]+d[1]*0.5,steps=4); st=pg.inner_text('#status'); pg.screenshot(path=S+'/g7.png'); pg.mouse.up(); pg.keyboard.up('Shift')
    ok('move arrow: hover + Shift drag in whole mm',hv==0 and 'ΔX' in st and st.split('=')[1].strip().startswith(str(int(float(st.split('=')[1].replace('mm','').strip())))),st)
    pg.keyboard.press('Escape')
    print('console errors:',errs)
    if errs: fails+=1
    b.close()
print('FAILED '+str(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
