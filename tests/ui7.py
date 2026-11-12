# Browser test: display row, open-border highlight + hole filling, feature snapping in the measuring tools,
# split button / slider state.  Run: node make_split_meshes.js <folder>; python3 ui7.py <folder> [path to index.html]
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
    pg=b.new_context(viewport={'width':1680,'height':950}).new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    def row(i): return f'#bodyList .brow:nth-child({i+1})'
    def cls(i): return pg.evaluate("i=>document.getElementById(i).className",i)
    def last(): return pg.evaluate("(()=>{const m=__mrt.S.measures;if(!m.length)return null;const x=m[m.length-1];return {type:x.type,v:x.v,r:x.r}})()")
    def holes(i=0): return pg.evaluate("i=>{const b=__mrt.S.bodies[i];return __mrt.core.borderLoops(b.geo.positions,b.geo.indices)}",i)
    pg.evaluate("document.querySelectorAll('.pop').forEach(d=>d.classList.add('on'))"); pg.evaluate("(()=>{const e=document.getElementById('cInfo');if(e.checked!==false){e.click()}})()")
    # ---- layout ----
    ok('display tools sit in the Home tab of the ribbon',pg.evaluate("!!document.querySelector('#ribbon [data-page=home] #col')&&!!document.querySelector('#ribbon [data-page=home] #opa')&&!!document.querySelector('#ribbon [data-page=home] #cWire')&&!document.querySelector('#right #col')"))
    ok('split button is plain with nothing ticked','primary' not in cls('bSplit'),cls('bSplit'))
    # ---- open borders and filling ----
    pg.set_input_files('#file',[S+'/open.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    h0=holes(); ok('open mesh loaded: 2 open borders reported',len(h0['loops'])==2 and '2' in pg.inner_text('#holeInfo'),pg.inner_text('#holeInfo'))
    px=pg.evaluate("(()=>{const c=document.getElementById('ov'),x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<x.length;i+=4)if(x[i]>220&&x[i+1]<80&&x[i+2]<70&&x[i+3]>200)n++;return n})()")
    ok('open borders are drawn bright red',px>300,px); pg.screenshot(path=S+'/k1.png')
    pg.evaluate("(()=>{const e=document.getElementById('cHoles');if(e.checked!==false){e.click()}})()"); pg.wait_for_timeout(120)
    px2=pg.evaluate("(()=>{const c=document.getElementById('ov'),x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<x.length;i+=4)if(x[i]>220&&x[i+1]<80&&x[i+2]<70&&x[i+3]>200)n++;return n})()")
    ok('the checkbox hides them',px2==0,px2); pg.evaluate("(()=>{const e=document.getElementById('cHoles');if(e.checked!==true){e.click()}})()")
    ok('fill button plain until an open body is ticked','primary' not in cls('bFill'))
    pg.click(row(1)); ok('ticked: split and fill buttons light up','primary' in cls('bSplit') and 'primary' in cls('bFill'))
    nt0=pg.evaluate("__mrt.S.bodies[0].geo.indices.length/3")
    pg.fill('#holeMax','140'); pg.click('#bFill'); idle()
    ok('rim limit: only the small hole is filled',holes()['edges']>0 and len(holes()['loops'])==1,pg.inner_text('#holeRes').replace('\n',' | '))
    pg.click('#bUndo'); pg.wait_for_timeout(150); pg.keyboard.press('Space'); pg.click(row(1))
    pg.fill('#holeMax','0'); pg.evaluate("(()=>{const e=document.getElementById('holeLv');e.value=3;e.dispatchEvent(new Event('input',{bubbles:true}))})()")
    pg.click('#bFill'); idle(); pg.screenshot(path=S+'/k2.png')
    st=pg.evaluate("(()=>{const b=__mrt.S.bodies[0],s=__mrt.core.stats(b.geo.positions,b.geo.indices),t=__mrt.core.topology(b.geo.indices,b.geo.positions.length/3);return [s.volume,t.border,t.nonManifold,b.geo.indices.length/3]})()")
    ok('advanced fill closes the mesh',st[1]==0 and st[2]==0 and st[3]>nt0 and 'kín' in pg.inner_text('#holeInfo'),[st,pg.inner_text('#holeRes').replace('\n',' | ')])
    ok('rebuilt volume is close to the full sphere',st[0]/(4/3*math.pi*27000)>0.985,round(st[0]/(4/3*math.pi*27000),4))
    pg.click('#bUndo'); pg.wait_for_timeout(150); ok('undo brings the holes back',len(holes()['loops'])==2)
    # ---- split slider / button state ----
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/pair.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    pg.click(row(1)); pg.click('#bSplit'); idle(); lv=pg.inner_text('#splitLvV')
    pg.keyboard.press('Space'); pg.wait_for_timeout(120)
    ok('after a split the option shows (3/10); unticking everything puts it back to 1/10',lv=='3/10' and pg.inner_text('#splitLvV')=='1/10' and pg.input_value('#splitLv')=='1' and 'primary' not in cls('bSplit'),[lv,pg.inner_text('#splitLvV')])
    # ---- measuring on recognised features ----
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/cyl.stl',S+'/one.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    w=pg.evaluate("(()=>{const R=__mrt.cam().R;return [R[6],R[7],R[8]]})()"); th=math.atan2(w[1],w[0])
    side=[8*math.cos(th),8*math.sin(th),12]
    pg.click('[data-tool=radius]'); q=scr(side); pg.mouse.move(*q); pg.wait_for_timeout(250)
    hv=pg.evaluate("__mrt.S.hovEnt&&__mrt.S.hovEnt.kind"); pg.screenshot(path=S+'/k3.png'); pg.mouse.click(*q); pg.wait_for_timeout(120)
    m=last(); ok('radius tool: one click on the cylinder gives R 8',hv=='cyl' and m and m['type']=='radius' and abs(m['r']-8)<0.02,[hv,m])
    q=scr([8*math.cos(th),8*math.sin(th),25]); pg.mouse.move(q[0],q[1]); pg.wait_for_timeout(150); hv=pg.evaluate("__mrt.S.hovEnt&&[__mrt.S.hovEnt.kind,__mrt.S.hovEnt.sub]"); pg.mouse.click(*q); pg.wait_for_timeout(120)
    m=last(); ok('radius tool: one click on the circular edge gives R 8',hv==['edge','arc'] and abs(m['r']-8)<1e-3,[hv,m])
    pg.click('[data-tool=dist]'); q=scr([110,0,20]); pg.mouse.move(*q); pg.wait_for_timeout(150); hv=pg.evaluate("__mrt.S.hovEnt&&[__mrt.S.hovEnt.kind,__mrt.S.hovEnt.sub]"); pg.screenshot(path=S+'/k4.png'); pg.mouse.click(*q); pg.wait_for_timeout(120)
    m=last(); ok('distance tool: one click on a straight edge gives its length 20',hv==['edge','line'] and m['type']=='len' and abs(m['v']-20)<1e-4,[hv,m])
    er=pg.evaluate("(()=>{const r=document.getElementById('gl').getBoundingClientRect();return [r.left+60,r.top+260]})()"); pg.mouse.click(*er); pg.wait_for_timeout(60)   # empty space: clear the pending edge
    a=scr([2,1,25]); c=scr([112,12,20]); pg.mouse.click(*a); pg.mouse.move(*c); pg.wait_for_timeout(150); hv=pg.evaluate("__mrt.S.hovEnt&&__mrt.S.hovEnt.kind"); pg.mouse.click(*c); pg.wait_for_timeout(120)
    m=last(); ok('plane to parallel plane: 5 mm between the two top faces',hv=='plane' and m['type']=='dist' and abs(m['v']-5)<1e-4,[hv,m])
    cq=scr([100,0,20]); pg.mouse.click(*scr(side)); pg.mouse.move(cq[0]+2,cq[1]+2); pg.wait_for_timeout(150); hv=pg.evaluate("__mrt.S.hovEnt&&__mrt.S.hovEnt.kind"); pg.mouse.click(cq[0]+2,cq[1]+2); pg.wait_for_timeout(120)
    m=last(); ok('cylinder axis to a box corner: 100 mm',hv=='point' and m['type']=='dist' and abs(m['v']-100)<1e-3,[hv,m])
    sidef=[120,10,10] if w[0]>0 else [100,10,10]
    pg.click('[data-tool=angle]'); pg.mouse.click(*scr([112,12,20])); pg.mouse.click(*scr(sidef)); pg.wait_for_timeout(120)
    m=last(); ok('angle tool: two planes of the box, 90 degrees',m['type']=='angle' and abs(m['v']-90)<1e-3,m)
    pg.click('[data-tool=dist]'); pg.keyboard.down('Alt'); pg.mouse.click(*scr([104,4,20])); pg.mouse.click(*scr([116,13,20])); pg.keyboard.up('Alt'); pg.wait_for_timeout(120)
    m=last(); ok('Alt: free points on a face',m['type']=='dist' and abs(m['v']-15)<0.2,m)
    pg.keyboard.press('Escape'); pg.screenshot(path=S+'/k5.png')
    print('console errors:',errs)
    if errs: fails+=1
    b.close()
print('FAILED '+str(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
