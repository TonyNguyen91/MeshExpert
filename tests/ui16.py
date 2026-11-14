# Browser test: icons on the top buttons, Edges off by default, resizable body-list columns with a horizontal scrollbar,
# New session / Save / Save as (Save writes over the opened .mrtl), and the draft angle under the cursor during an undercut analysis.
# The file pickers are replaced by in-page fakes so the test needs no dialogs.
# Run: python3 ui16.py <fixtures folder> [path to index.html]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
FAKE="""
window.__fs={saves:0,openPick:0,savePick:0,files:{}};
function fakeHandle(name){return {name:name,kind:'file',
  createWritable:async()=>{const parts=[];return {write:async b=>parts.push(b),close:async()=>{window.__fs.files[name]=new Blob(parts);window.__fs.saves++;}};},
  getFile:async()=>new File([window.__fs.files[name]||new Blob([])],name)};}
window.showSaveFilePicker=async o=>{window.__fs.savePick++;return fakeHandle(window.__fs.nextName||o.suggestedName);};
window.showOpenFilePicker=async()=>{window.__fs.openPick++;return [fakeHandle(window.__fs.openName)];};
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True); ctx.add_init_script(FAKE); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(150)
    def scr(pt): return pg.evaluate("p=>{const q=__mrt.project(p);const r=document.getElementById('gl').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}",pt)
    ok('Top buttons carry icons',all(pg.locator('#'+i+' svg').count()==1 for i in ['bNew','bOpen','bSaveSes','bSaveAs','bClear','bUndo','bRedo','bHome']))
    ok('Edges are off by default',not pg.is_checked('#cWire'))
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    # ---- body list columns
    bl=pg.locator('#bodyList'); w0=pg.evaluate("document.querySelector('#bodyList .brow:not(.hd) .nm').getBoundingClientRect().width")
    z=pg.locator('#bodyList .brow.hd .rz[data-col=cn]').bounding_box(); x=z['x']+3; y=z['y']+z['height']/2
    pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+250,y,steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    w1=pg.evaluate("document.querySelector('#bodyList .brow:not(.hd) .nm').getBoundingClientRect().width")
    ok('Name column widened by dragging its header edge',abs(w1-w0-250)<3,(w0,w1))
    ok('The list scrolls sideways when wider than the panel',pg.evaluate("(()=>{const e=document.getElementById('bodyList');return e.scrollWidth>e.clientWidth+50})()"))
    pg.dblclick('#bodyList .brow.hd .rz[data-col=cn]'); pg.wait_for_timeout(100)
    ok('Double-click puts the column back',abs(pg.evaluate("document.querySelector('#bodyList .brow:not(.hd) .nm').getBoundingClientRect().width")-w0)<2)
    # ---- session: Save (first time asks a name), Save again writes over, Open keeps the file, Save writes over it, Save as asks
    pg.evaluate("window.__fs.nextName='job1.mrtl'"); pg.click('#bSaveSes'); pg.wait_for_timeout(300)
    f=pg.evaluate("[window.__fs.savePick,window.__fs.saves]")
    ok('First Save asks for a file name',f==[1,1] and pg.inner_text('#sesName')=='job1.mrtl',f)
    pg.keyboard.press('Control+s'); pg.wait_for_timeout(300)
    ok('Ctrl+S writes over the same file without asking',pg.evaluate("[window.__fs.savePick,window.__fs.saves]")==[1,2])
    pg.click('#bNew'); pg.wait_for_timeout(200)
    ok('New session empties everything and forgets the file',pg.evaluate("__mrt.S.bodies.length")==0 and pg.inner_text('#sesName')!='job1.mrtl')
    pg.evaluate("window.__fs.openName='job1.mrtl'"); pg.click('#bOpen'); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    ok('Open session brings the bodies back and remembers the file',pg.inner_text('#sesName')=='job1.mrtl')
    pg.evaluate("(()=>{const b=__mrt.S.bodies[0];b.matrix[12]+=33;})()")
    pg.click('#bSaveSes'); pg.wait_for_timeout(300)
    ok('Save after editing writes over the opened .mrtl',pg.evaluate("[window.__fs.savePick,window.__fs.saves]")==[1,3])
    pg.click('#bNew'); pg.click('#bOpen'); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    ok('The overwrite kept the edit',abs(pg.evaluate("__mrt.S.bodies[0].matrix[12]")-33)<1e-6 or pg.evaluate("__mrt.S.bodies[0].matrix[12]")>32)
    pg.evaluate("window.__fs.nextName='job2.mrtl'"); pg.click('#bSaveAs'); pg.wait_for_timeout(300)
    ok('Save as asks again and switches to the new file',pg.evaluate("window.__fs.savePick")==2 and pg.inner_text('#sesName')=='job2.mrtl')
    # ---- undercut: draft angle under the cursor
    pg.click('#bNew'); pg.set_input_files('#file',[S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    pg.evaluate("(()=>{const S=__mrt.S;S.sel.clear();S.sel.add(S.bodies[0]);})()")
    pg.evaluate("document.getElementById('pop_undercut').classList.add('on')"); pg.select_option('#ucAx','z'); pg.click('#bUc'); idle()
    bx=pg.evaluate("(()=>{const b=__mrt.S.bodies[0],g=b.geo,m=b.matrix;return [[g.min[0]+m[12],g.min[1]+m[13],g.min[2]+m[14]],[g.max[0]+m[12],g.max[1]+m[13],g.max[2]+m[14]]]})()")
    pg.evaluate("(()=>{document.getElementById('pop_undercut').classList.remove('on')})()")
    top=scr([(bx[0][0]+bx[1][0])/2,(bx[0][1]+bx[1][1])/2,bx[1][2]]); pg.mouse.move(top[0],top[1]); pg.wait_for_timeout(200)
    h=pg.evaluate("__mrt.S.ucHov")
    ok('Top face: draft 90° on the + half',h and abs(h['deg']-90)<0.5,h)
    pg.evaluate("(()=>{const c=__mrt.cam();c.R=[1,0,0, 0,0,1, 0,-1,0];})()"); pg.wait_for_timeout(200)
    side=scr([(bx[0][0]+bx[1][0])/2,bx[0][1],(bx[0][2]+bx[1][2])/2]); pg.mouse.move(side[0]+1,side[1]+1); pg.wait_for_timeout(200)
    h2=pg.evaluate("__mrt.S.ucHov")
    ok('Side wall: draft 0°',h2 and abs(h2['deg'])<0.5,h2)
    pg.click('#bUcClr') if pg.is_visible('#bUcClr') else pg.evaluate("document.getElementById('bUcClr').click()")
    pg.mouse.move(side[0]+2,side[1]+2); pg.wait_for_timeout(150)
    ok('No draft label once the analysis is cleared',pg.evaluate("__mrt.S.ucHov")is None)
    ok('No page errors',not errs,errs)
    b.close()
print('ALL OK' if not fails else '%d FAIL'%fails); sys.exit(1 if fails else 0)
