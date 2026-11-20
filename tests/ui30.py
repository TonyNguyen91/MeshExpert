# Browser test: sheets always follow the 3D model — no Source Bodies column, no Save / Discard / Update, no missing
# bodies; every body of the model is listed per sheet with an eye (hide / show in that sheet only); a body deleted in
# 3D leaves the sheets, a new one shows up in all of them, a changed body is redrawn as it is now; Create Drawing Sheet
# from a 3D pick shows only the picked bodies; hidden bodies kept in the session file; documents saved with source
# body lists (v3) come in with the left-out bodies hidden.
# Run: python3 ui30.py <fixtures folder> [path to index.html]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True,accept_downloads=True)
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept('ui30') if d.type=='prompt' else d.accept())
    pg.goto('file://'+os.path.abspath(PAGE)); pg.evaluate("delete window.showSaveFilePicker")
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(1600)
    def names(): return pg.evaluate("[...document.querySelectorAll('#dwsTree .dwsNode.body')].map(n=>[n.querySelector('.nm').textContent,n.classList.contains('hid')])")
    def drawn(): return sorted(pg.evaluate("__mrt.v6().prev.sc6.preps.map(p=>p.b.name)"))
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl',S+'/m_box.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    U={n:pg.evaluate("n=>__mrt.S.bodies.find(b=>b.name==n).uid",n) for n in ['block','cyl','m_box']}
    pg.click('#b_dws'); settle()
    ok('No Source Bodies column, no Save / Discard, no status marks',pg.locator('#dwsLeft,#dwsSrcList,#dwsSave,#dwsDiscard,#dwsTree .st,#dwsTabsS .st').count()==0)
    ok('The sheet lists and draws every body of the model',[n for n,h in names()]==['block','cyl','m_box'] and drawn()==['block','cyl','m_box'])
    # eye: hide in this sheet only
    pg.click('#dwsTree .dwsNode.body[data-uid="%s"] .eye'%U['cyl']); settle()
    ok('Eye hides the body in this sheet',names()[1]==['cyl',True] and drawn()==['block','m_box'])
    pg.evaluate("__mrt.dwAct('newSheet')"); settle()
    ok('A new sheet shows every body',drawn()==['block','cyl','m_box'] and all(not h for n,h in names()))
    pg.click('#dwsTree .dwsNode.body[data-uid="%s"]'%U['m_box'],button='right'); pg.wait_for_timeout(200)
    menu=pg.inner_text('#ctx')
    ok('Body menu: hide / show only this / show every body, nothing about removing or updating','Chỉ hiện body này' in menu and 'Hiện mọi body' in menu and 'Bỏ' not in menu and 'Cập nhật' not in menu,menu)
    pg.click('#ctx div:has-text("Chỉ hiện body này")'); settle()
    ok('Show only this body',drawn()==['m_box'])
    pg.click('#dwsTree .dwsNode.body >> nth=0',button='right'); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Hiện mọi body")'); settle()
    ok('Show every body again',drawn()==['block','cyl','m_box'])
    pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 1'); settle()
    ok('Sheet 1 keeps its own hidden body',drawn()==['block','m_box'])
    # 3D changes come in by themselves
    bw=lambda: pg.evaluate("(()=>{const p=__mrt.v6().prev.sc6.preps.find(p=>p.b.name=='block');let a=1e9,z=-1e9;for(let i=0;i<p.W.length;i+=3){a=Math.min(a,p.W[i]);z=Math.max(z,p.W[i]);}return z-a})()")
    e0=bw()
    pg.click('#dwsBack'); pg.wait_for_timeout(300)
    pg.evaluate("(()=>{const b=__mrt.S.bodies.find(b=>b.name=='block');const P=b.geo.positions.slice();for(let i=0;i<P.length;i+=3)P[i]*=2;__mrt.setGeo(b,P,b.geo.indices.slice());})()"); pg.wait_for_timeout(300)
    pg.evaluate("__mrt.delBodies([__mrt.S.bodies.find(b=>b.name=='m_box')])"); pg.wait_for_timeout(300)
    pg.set_input_files('#file',[S+'/m_peg.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    pg.click('#b_dws'); settle()
    e1=bw()
    ok('Changed body redrawn as it is now (no Update)',abs(e1-2*e0)<0.01*e0,[e0,e1])
    ok('Deleted body simply gone, new body shown (Sheet 1)',[n for n,h in names()]==['block','cyl','m_peg'] and drawn()==['block','m_peg'] and pg.locator('#dwsTree .miss').count()==0,names())
    pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 2'); settle()
    ok('…and in Sheet 2',drawn()==['block','cyl','m_peg'])
    # Create Drawing Sheet from a 3D pick
    pg.click('#dwsBack'); pg.wait_for_timeout(300)
    pg.evaluate("(()=>{const S=__mrt.S;S.sel.clear();S.sel.add(S.bodies.find(b=>b.name=='cyl'));})()")
    pg.evaluate("__mrt.openMenu(600,400,__mrt.S.bodies.find(b=>b.name=='cyl'))"); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Tạo Drawing Sheet")'); settle()
    ok('Create Drawing Sheet: a sheet showing only the picked body',pg.is_visible('#dws') and drawn()==['cyl'] and [h for n,h in names()]==[True,False,True])
    # session keeps the hidden bodies
    with pg.expect_download(timeout=60000) as dl: pg.mouse.click(700,400); pg.keyboard.press('Control+Shift+S')
    mrtl='/tmp/ui30.mrtl'; open(mrtl,'wb').write(open(dl.value.path(),'rb').read())
    pg2=ctx.new_page(); pg2.on('pageerror',lambda e: errs.append(str(e))); pg2.goto('file://'+os.path.abspath(PAGE))
    pg2.set_input_files('#file',[mrtl]); pg2.wait_for_function("__mrt.S.bodies.length==3"); pg2.wait_for_timeout(800)
    hid=pg2.evaluate("__mrt.dw().doc.sheets.map(s=>(s.work.hide||[]).length)")
    ok('Hidden bodies of each sheet kept in the session',hid==[1,0,2],hid)
    # a v3 document with source body lists
    d3=pg2.evaluate("""(()=>{const u=__mrt.S.bodies.map(b=>b.uid);const w=JSON.parse(JSON.stringify(__mrt.dw().doc.sheets[1].work));delete w.hide;
      const a=Object.assign({},w,{src:null}),c=Object.assign({},w,{src:[u[2]]});
      return {v:3,id:'d1',name:null,active:'s1',src:[u[0],u[1]],sheets:[{id:'s1',name:'A',saved:a,work:a,dirty:false,rev:{}},{id:'s2',name:'B',saved:c,work:c,dirty:false,rev:{}}]};})()""")
    pg2.evaluate("d=>__mrt.dwLoad(d)",d3)
    h3=pg2.evaluate("(()=>{const u=__mrt.S.bodies.map(b=>b.uid);return __mrt.dw().doc.sheets.map(s=>[s.name,(s.work.hide||[]).map(x=>u.indexOf(x)).sort(),'src' in s.work,'saved' in s])})()")
    ok('v3 document: bodies outside the source lists come in hidden, no saved copy kept',h3==[['A',[2],False,False],['B',[0,1],False,False]],h3)
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
