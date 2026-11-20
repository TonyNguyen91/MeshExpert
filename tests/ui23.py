# Browser test: Drawing Workspace, phase 1 — Capture > Drawing opens a full-window workspace (ribbon 6 Views /
# Exploded View, sheet canvas, Drawing Tree, sheet bar), the 3D state is untouched, sheets can be created / renamed /
# duplicated (independent copies) / deleted / reordered, each sheet keeps its own settings, Save / Discard / Modified,
# export PNG/JPG, Ctrl+S / Ctrl+D, the document is saved in the .mrtl and old sessions come in as Sheet 1.
# Run: python3 ui23.py <fixtures folder> [path to index.html]
import sys,os,json,struct
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
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    dlg={'ans':True}
    def ondlg(d):
        if d.type=='confirm': d.accept() if dlg['ans'] else d.dismiss()
        else: d.accept('drawdoc')
    pg.on('dialog',ondlg)
    pg.goto('file://'+os.path.abspath(PAGE))
    def sv(sel,v): pg.evaluate("a=>{const e=document.querySelector(a[0]);e.value=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}",[sel,str(v)])
    def sc(sel,on): pg.evaluate("a=>{const e=document.querySelector(a[0]);if(e.checked!==a[1]){e.checked=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}",[sel,on])
    def clk(sel): pg.eval_on_selector(sel,"e=>e.click()")
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(1500)
    def tick(): pg.wait_for_timeout(700)   # the workspace follows the canvas every 0.5 s
    def doc(): return pg.evaluate("(()=>{const D=__mrt.dw().doc;return {active:D.active,name:D.name,sheets:D.sheets.map(s=>({id:s.id,name:s.name,dirty:s.dirty,paper:s.work.cfg[s.work.cfg&&s.work.mode||'6v'].v6Paper,pap6:s.work.cfg['6v'].v6Paper}))}})()")
    def names(): return [s['name'] for s in doc()['sheets']]
    def act(): d=doc(); return [s for s in d['sheets'] if s['id']==d['active']][0]
    def onExp(sel):   # click a control of the Export tab, then come back to the tab that was open
        k=pg.evaluate("document.querySelector('#dwsTabs .rtab.on').dataset.k"); pg.click('#dwsTabs [data-k=set]'); pg.wait_for_timeout(150)
        pg.click('#dwsRibbon .rpage.on '+sel); pg.click('#dwsTabs [data-k="%s"]'%k); pg.wait_for_timeout(150)
    def tree(): return pg.evaluate("[...document.querySelectorAll('#dwsTree .dwsNode.sheet .nm')].map(e=>e.textContent)")
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl',S+'/m_box.stl']); pg.wait_for_function("__mrt.S.bodies.length==3"); idle()
    pg.evaluate("(()=>{const B=__mrt.S.bodies;__mrt.S.sel.clear();__mrt.S.sel.add(B[1]);})()")
    before=pg.evaluate("JSON.stringify({n:__mrt.S.bodies.map(b=>[b.id,b.name,Array.from(b.matrix)]),sel:[...__mrt.S.sel].map(b=>b.id),cam:__mrt.cam()})")
    # ---- open
    ok('Capture > Drawing button in the main ribbon',pg.locator('#ribbon #b_dws').count()==1)
    pg.click('#b_dws'); settle()
    ok('Drawing Workspace covers the window',pg.is_visible('#dws') and pg.evaluate("(()=>{const r=document.getElementById('dws').getBoundingClientRect();return r.left==0&&r.top==0&&r.width==innerWidth&&r.height==innerHeight})()"))
    ok('Has ribbon, sheet canvas, Drawing Tree and sheet bar',all(pg.is_visible(x) for x in ['#dwsRibbon','#dwsCanvas #v6Prev','#dwsTree','#dwsBar','#dwsDup']) and pg.locator('#dwsSave,#dwsDiscard,#dwsLeft,#dwsSrcList').count()==0)
    ok('Ribbon tabs: Drawing, Export, Effects',pg.evaluate("[...document.querySelectorAll('#dwsTabs .rtab')].map(b=>b.textContent)")==['Drawing','Export','Hiệu ứng'])
    titles=pg.evaluate("[...document.querySelectorAll('#dwsRibbon .rpage.on .rtitle')].map(e=>e.textContent)")
    ok('6 Views ribbon groups (shared ones moved to Export, no Update / Export)',titles==['Tạo view','Isometric','Tỉ lệ & bố trí','Chú thích','Loại bản vẽ'],titles)
    ok('No All 6 Views button',pg.locator('#dwsRibbon button[data-act=all6]').count()==0)
    ok('No Update group on the ribbon',pg.locator('#dwsRibbon button[data-act^=upd], #dwsRibbon button[data-act=check]').count()==0)
    ok('Export buttons only on the Export and Effects tabs',pg.locator('#dwsRibbon .rpage:not([data-k=set]):not([data-k=fx]) button[data-act=png]').count()==0 and pg.locator('#dwsRibbon .rpage[data-k=set] button[data-act=pdf]').count()==1)
    st=pg.evaluate("[...document.querySelectorAll('#dwsRibbon .rpage[data-k=set] .rtitle')].map(e=>e.textContent)")
    ok('Export tab groups',st==['Sheet','Hướng nhìn','Hiển thị','Nét & chữ','Ghi chú','Ảnh xuất','Thông tin','Xuất'],st)
    acts=lambda k: pg.evaluate("k=>[...document.querySelectorAll('#dwsRibbon .rpage[data-k=\"'+k+'\"] [data-act],#dwsRibbon .rpage[data-k=\"'+k+'\"] [data-click],#dwsRibbon .rpage[data-k=\"'+k+'\"] [data-chk],#dwsRibbon .rpage[data-k=\"'+k+'\"] [data-bind]')].map(e=>e.dataset.act||e.dataset.click||e.dataset.chk||e.dataset.bind)",k)
    a6=set(acts('6v')); ae=set(acts('exp'))
    ok('6 Views and Exploded share only Auto Arrange and the view angle (iso / assembly)',a6&ae=={'#v6Auto','v6Az','v6AzR','v6El','v6ElR','type2d'},a6&ae)
    ok('Every ribbon button has an icon and a name / tooltip',pg.evaluate("[...document.querySelectorAll('#dwsRibbon button')].every(b=>b.querySelector('svg')&&(b.textContent.trim()||b.title))"))
    root=pg.inner_text('#dwsTree .dwsNode.root')
    ok('Drawing Tree root named after the model',root=='Drawing of "block"',root)
    ok('Starts with Sheet 1, highlighted, no Saved / Modified marks',tree()==['Sheet 1'] and pg.evaluate("document.querySelector('#dwsTree .dwsNode.sheet').classList.contains('on')") and pg.locator('#dwsTree .dwsNode.sheet .st').count()==0)
    for w,k in ((1456,'6v'),(1100,'6v'),(1456,'exp'),(1100,'exp'),(1456,'set'),(1100,'set')):
        pg.evaluate("k=>__mrt.dwType(k)",k); pg.set_viewport_size({'width':w,'height':819}); pg.wait_for_timeout(400)
        r=pg.evaluate("(()=>{const r=document.getElementById('dwsRibbon'),p=r.querySelector('.rpage.on'),g=[...p.querySelectorAll('.rgrp')].pop().getBoundingClientRect(),rb=r.getBoundingClientRect();return [Math.round(g.right),Math.round(rb.right),getComputedStyle(r).overflowX]})()")
        ok('Drawing ribbon (%s) fits without a scroll bar at %d px'%(k,w),r[0]<=r[1]+1 and r[2]=='hidden',r)
    pg.evaluate("__mrt.dwType('6v')"); pg.set_viewport_size({'width':1456,'height':819}); settle()
    # ---- ribbon drives the drawing
    pg.click('#dwsRibbon .rpage.on button[data-chk=".v6v[data-v=top]"]'); settle()
    ok('Top View button switches the top view off',not pg.is_checked('.v6v[data-v=top]') and pg.evaluate("__mrt.v6().prev.hits.every(h=>h.n!='top')") and not pg.evaluate("document.querySelector('#dwsRibbon .rpage.on button[data-chk=\".v6v[data-v=top]\"]').classList.contains('on')"))
    pg.click('#dwsRibbon .rpage.on button[data-chk=".v6v[data-v=top]"]'); settle()
    ok('Top View back on',pg.evaluate("[...document.querySelectorAll('.v6v')].every(c=>c.checked)"))
    onExp('button[data-chk="#v6Hid"]'); settle(); tick()
    ok('A change is kept in the sheet at once',pg.is_checked('#v6Hid') and pg.evaluate("(()=>{const d=__mrt.dw().doc;return d.sheets.find(s=>s.id==d.active).work.cfg['6v'].v6Hid})()"))
    # ---- new sheet, own settings
    onExp('button[data-act=newSheet]'); settle()
    ok('New Sheet: Sheet 2 opened',tree()==['Sheet 1','Sheet 2'] and act()['name']=='Sheet 2')
    pg.click('#dwsTabs [data-k=set]'); pg.select_option('#dwsRibbon .rpage.on select[data-bind=v6Paper]','A4'); pg.evaluate("__mrt.dwType('6v')"); settle()
    ok('Paper from the ribbon',pg.input_value('#v6Paper')=='A4')
    pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 1'); settle()
    ok('Sheet 1 keeps its own paper (A3)',pg.input_value('#v6Paper')=='A3' and act()['name']=='Sheet 1')
    pg.click('#dwsTabsS .dwsTab >> text=Sheet 2'); settle()
    ok('Back on Sheet 2 (from the sheet bar): A4 again',pg.input_value('#v6Paper')=='A4' and act()['name']=='Sheet 2')
    # ---- save / discard
    sv('#v6Paper','A2'); tick()
    pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 1'); settle(); pg.click('#dwsTabsS .dwsTab >> text=Sheet 2'); settle()
    ok('No Save needed: the change is still there after switching sheets',pg.input_value('#v6Paper')=='A2')
    sv('#v6Paper','A4'); tick()
    # ---- duplicate (independent)
    pg.mouse.click(700,400); pg.keyboard.press('Control+d'); settle()
    ok('Ctrl+D: "Sheet 2 Copy" right after Sheet 2',tree()==['Sheet 1','Sheet 2','Sheet 2 Copy'] and act()['name']=='Sheet 2 Copy' and pg.input_value('#v6Paper')=='A4')
    sv('#v6Paper','A1'); tick()
    s2=[s for s in doc()['sheets'] if s['name']=='Sheet 2'][0]
    ok('Copy is independent of the original',s2['pap6']=='A4' and act()['pap6']=='A1',[s2['pap6'],act()['pap6']])
    pg.click('#dwsDup'); settle()
    ok('Duplicate button',tree()[3]=='Sheet 2 Copy Copy')
    # ---- rename
    pg.dblclick('#dwsTree .dwsNode.sheet >> text=Sheet 2 Copy Copy'); pg.wait_for_timeout(200)
    pg.keyboard.press('Control+a'); pg.keyboard.type('Lắp ráp'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('Rename in the tree',tree()[3]=='Lắp ráp' and 'Lắp ráp' in pg.inner_text('#dwsTabsS'))
    pg.click('#dwsTree .dwsNode.root',button='right'); pg.wait_for_timeout(200)
    ok('Root menu: New Sheet, Rename Drawing, Export All',pg.inner_text('#ctx').split('\n')==['Sheet mới','Đổi tên bản vẽ','Xuất tất cả Sheet (PDF)'],pg.inner_text('#ctx'))
    pg.click('#ctx div:has-text("Đổi tên bản vẽ")'); pg.wait_for_timeout(200); pg.keyboard.press('Control+a'); pg.keyboard.type('Bản vẽ xe đồ chơi'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('Rename Drawing',pg.inner_text('#dwsTree .dwsNode.root')=='Bản vẽ xe đồ chơi' and 'Bản vẽ xe đồ chơi' in pg.inner_text('#dwsDocName'))
    # ---- sheet menu, export
    pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 1',button='right'); pg.wait_for_timeout(200)
    items=pg.inner_text('#ctx').split('\n')
    ok('Sheet menu: Open, Rename, Duplicate, Delete, Export PNG / JPG / PDF',items==['Mở','Đổi tên','Nhân bản','Xoá','Xuất PNG','Xuất JPG','Xuất PDF'],items)
    with pg.expect_download(timeout=180000) as dl: pg.click('#ctx div:has-text("Xuất PNG")')
    f=dl.value; ok('Export PNG of Sheet 1 (opens it, file named after the sheet)',f.suggested_filename=='Sheet 1.png' and os.path.getsize(f.path())>5000 and act()['name']=='Sheet 1',f.suggested_filename)
    pg.click('#dwsTabs [data-k=set]')
    with pg.expect_download(timeout=180000) as dl: pg.click('#dwsRibbon .rpage.on button[data-act=jpg]')
    f=dl.value; ok('Export JPG from the ribbon',f.suggested_filename=='Sheet 1.jpg' and open(f.path(),'rb').read(2)==b'\xff\xd8')
    pg.evaluate("__mrt.dwType('6v')")
    # ---- reorder (drag in the tree)
    pg.drag_and_drop('#dwsTabsS .dwsTab >> text=Lắp ráp','#dwsTabsS .dwsTab >> text=Sheet 1'); pg.wait_for_timeout(300)
    ok('Drag (sheet bar) reorders the sheets',tree()[0]=='Lắp ráp' and pg.evaluate("[...document.querySelectorAll('#dwsTabsS .dwsTab:not(.add) .nm')].map(e=>e.textContent)")[0]=='Lắp ráp',tree())
    # ---- delete
    dlg['ans']=False; pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 2 Copy',button='right'); pg.click('#ctx div:has-text("Xoá")'); pg.wait_for_timeout(300)
    ok('Delete cancelled keeps the sheet','Sheet 2 Copy' in tree())
    dlg['ans']=True; pg.click('#dwsTree .dwsNode.sheet >> text=Sheet 2 Copy',button='right'); pg.click('#ctx div:has-text("Xoá")'); pg.wait_for_timeout(300)
    ok('Delete after confirming',tree()==['Lắp ráp','Sheet 1','Sheet 2'],tree())
    # ---- exploded tab is a separate drawing of the sheet
    pg.evaluate("__mrt.dwType('exp')"); settle()
    titles=pg.evaluate("[...document.querySelectorAll('#dwsRibbon .rpage.on .rtitle')].map(e=>e.textContent)")
    ok('Exploded View ribbon groups',titles==['Explode','Góc nhìn','Thông tin','Khung','Loại bản vẽ'] and pg.inner_text('#v6ShT')=='Exploded view',titles)
    pg.click('#dwsRibbon .rpage.on button[data-chk="#v6PN"]'); settle()
    ok('Component Name toggle',not pg.is_checked('#v6PN'))
    pg.click('#dwsRibbon .rpage.on button[data-act=comb]'); pg.wait_for_timeout(200)
    ok('Combine without a picked part asks for one',pg.evaluate("__mrt.v6().comb")==None)
    # ---- 3D shortcuts do not reach the model
    n0=pg.evaluate("__mrt.S.bodies.length"); pg.mouse.click(700,400); pg.keyboard.press('Delete'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    ok('Delete / Ctrl+Z in the drawing do not touch the 3D model',pg.evaluate("__mrt.S.bodies.length")==n0)
    # ---- back to 3D
    cur=act()['name']
    pg.click('#dwsBack'); pg.wait_for_timeout(500)
    after=pg.evaluate("JSON.stringify({n:__mrt.S.bodies.map(b=>[b.id,b.name,Array.from(b.matrix)]),sel:[...__mrt.S.sel].map(b=>b.id),cam:__mrt.cam()})")
    ok('Back to 3D: workspace hidden, model / selection / camera unchanged',not pg.is_visible('#dws') and after==before)
    pg.click('#b_dws'); settle()
    ok('Reopening shows the same sheet and tab',act()['name']==cur and pg.evaluate("document.querySelector('#dwsRibbon .rpage.on').dataset.k")=='exp')
    # ---- the document in the session file
    state=doc(); pg.evaluate("delete window.showSaveFilePicker")
    with pg.expect_download(timeout=60000) as dl: pg.mouse.click(700,400); pg.keyboard.press('Control+Shift+S')
    mrtl='/tmp/drawdoc.mrtl'; open(mrtl,'wb').write(open(dl.value.path(),'rb').read())
    pg2=ctx.new_page(); pg2.on('pageerror',lambda e: errs.append(str(e))); pg2.goto('file://'+os.path.abspath(PAGE))
    pg2.set_input_files('#file',[mrtl]); pg2.wait_for_function("__mrt.S.bodies.length==3"); pg2.wait_for_timeout(800)
    pg2.click('#b_dws'); pg2.wait_for_timeout(1500)
    st2=pg2.evaluate("(()=>{const D=__mrt.dw().doc;return {active:D.active,name:D.name,sheets:D.sheets.map(s=>({id:s.id,name:s.name,dirty:s.dirty,paper:s.work.cfg[s.work.cfg&&s.work.mode||'6v'].v6Paper,pap6:s.work.cfg['6v'].v6Paper}))}})()")
    ok('Reopened session: same sheets, order, names, document name',[s['name'] for s in st2['sheets']]==[s['name'] for s in state['sheets']] and st2['name']=='Bản vẽ xe đồ chơi',[s['name'] for s in st2['sheets']])
    ok('Reopened session: same per-sheet settings',[s['pap6'] for s in st2['sheets']]==[s['pap6'] for s in state['sheets']],[(s['pap6'],s['dirty']) for s in st2['sheets']])
    ok('Reopened session: same active sheet',st2['active']==state['active'] and pg2.evaluate("document.querySelector('#dwsTree .dwsNode.sheet.on .nm').textContent")==cur)
    pg2.close()
    # ---- a session saved before the workspace (only meta.drawing) comes in as Sheet 1
    raw=open(mrtl,'rb').read(); n=struct.unpack('<I',raw[8:12])[0]; meta=json.loads(raw[12:12+n].decode())
    del meta['drawDoc']; meta['drawing']['cfg']['6v']['v6Paper']='A1'; meta['drawing']['mode']='6v'
    js=json.dumps(meta).encode(); js+=b' '*((4-len(js)%4)%4)
    old='/tmp/olddraw.mrtl'; open(old,'wb').write(raw[:4]+struct.pack('<I',2)+struct.pack('<I',len(js))+js+raw[12+n:])
    pg3=ctx.new_page(); pg3.on('pageerror',lambda e: errs.append(str(e))); pg3.goto('file://'+os.path.abspath(PAGE))
    pg3.set_input_files('#file',[old]); pg3.wait_for_function("__mrt.S.bodies.length==3"); pg3.wait_for_timeout(800)
    pg3.click('#b_dws'); pg3.wait_for_timeout(1500)
    ok('Old session: its drawing becomes Sheet 1',pg3.evaluate("[...document.querySelectorAll('#dwsTree .dwsNode.sheet .nm')].map(e=>e.textContent)")==['Sheet 1'] and pg3.input_value('#v6Paper')=='A1')
    pg3.close()
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
