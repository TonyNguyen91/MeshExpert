# Browser test: removing source bodies that are missing from the 3D model (left list menu, Delete key, the in-app
# question, "remove every missing body", the update dialog button, a sheet whose only body is missing), and the app
# version shown in the window title, next to the name and in the Drawing Workspace header.
# Run: python3 ui29.py <fixtures folder> [path to index.html]
import sys,os,re
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
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
    native=[]; pg.on('dialog',lambda d: (native.append(d.message), d.dismiss()))   # the browser's own confirm would answer No
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(1500)
    ver=pg.inner_text('#appVer')
    ok('Version next to the name and in the window title',re.match(r'^v\d+\.\d+\.\d+$',ver) is not None and pg.title()=='MeshExpert '+ver,[ver,pg.title()])
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl',S+'/m_box.stl',S+'/m_peg.stl']); pg.wait_for_function("__mrt.S.bodies.length==4"); idle()
    pg.click('#b_dws'); settle()
    ok('Version in the Drawing Workspace header',ver in pg.inner_text('#dwsHd .dwsLogo'))
    pg.keyboard.press('Control+s'); pg.wait_for_timeout(400)
    # a second sheet with only the peg
    pg.evaluate("n=>__mrt.dwAct('newSheet')",None); settle()
    pg.evaluate("(()=>{const d=__mrt.dw().doc,s=d.sheets[1];})()")
    peg=pg.evaluate("__mrt.S.bodies.find(b=>b.name=='m_peg').uid")
    for n in ('block','cyl','m_box'):
        u=pg.evaluate("n=>__mrt.S.bodies.find(b=>b.name==n).uid",n)
        pg.click('#dwsTree .dwsNode.body[data-uid="%s"] button.del'%u); pg.wait_for_timeout(500)
    ok('Second sheet keeps only the peg',pg.locator('#dwsTree .dwsNode.body').count()==1)
    pg.click('#dwsBack'); pg.wait_for_timeout(300)
    pg.evaluate("__mrt.delBodies(__mrt.S.bodies.filter(b=>['cyl','m_box','m_peg'].includes(b.name)))"); pg.wait_for_timeout(300)
    pg.click('#b_dws'); settle()
    miss=lambda: pg.locator('#dwsSrcList .dwsSrcI.miss').count()
    ok('Three source bodies shown as missing',miss()==3)
    # sheet whose only body is missing: the x removes it
    pg.click('#dwsTree .dwsNode.body.miss button.del'); pg.wait_for_timeout(600)
    ok('Only (missing) body of a sheet can be removed from it',pg.locator('#dwsTree .dwsNode.body').count()==0,pg.evaluate("__mrt.v6().src"))
    pg.evaluate("__mrt.dw().doc.sheets[0].id"); pg.click('#dwsTree .dwsNode.sheet >> nth=0'); settle()
    # tree menu of a missing body
    pg.click('#dwsTree .dwsNode.body.miss >> nth=0',button='right'); pg.wait_for_timeout(200)
    ok('Tree menu of a missing body offers removing it from the Source Bodies','Bỏ khỏi Source Bodies' in pg.inner_text('#ctx') and 'Cập nhật body này' not in pg.inner_text('#ctx'),pg.inner_text('#ctx'))
    pg.keyboard.press('Escape'); pg.mouse.click(5,5)
    # Delete key on a missing body picked in the left list -> in-app question
    cyl=pg.evaluate("(()=>{const d=__mrt.dw().doc;return [...document.querySelectorAll('#dwsSrcList .dwsSrcI.miss')].map(e=>[e.dataset.uid,e.querySelector('.nm').textContent])})()")
    u_cyl=[u for u,n in cyl if n=='cyl'][0]
    pg.click('#dwsSrcList .dwsSrcI[data-uid="%s"] .nm'%u_cyl); pg.wait_for_timeout(200)
    if pg.evaluate("__mrt.dw().bsel")!=u_cyl: pg.click('#dwsSrcList .dwsSrcI[data-uid="%s"] .nm'%u_cyl); pg.wait_for_timeout(200)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
    ok('Delete key asks in the app (not the browser confirm)',pg.is_visible('#dwsDlg') and 'Source Bodies' in pg.inner_text('#dwsDlg') and not native,native)
    pg.click('#dwsDlgOk'); pg.wait_for_timeout(600)
    ok('…and removes it everywhere',u_cyl not in pg.evaluate("__mrt.dw().doc.src") and miss()==2 and all(u_cyl not in (s['work'].get('src') or []) for s in pg.evaluate("__mrt.dw().doc.sheets")))
    # left menu: every missing body
    pg.click('#dwsSrcList .dwsSrcI.miss >> nth=0',button='right'); pg.wait_for_timeout(200)
    menu=pg.inner_text('#ctx')
    ok('Left menu: remove every missing body (2)','Bỏ mọi body đang mất (2)' in menu,menu)
    pg.keyboard.press('Escape'); pg.mouse.click(5,5)
    # update dialog: remove the missing bodies there
    pg.evaluate("__mrt.dwAct('check')"); pg.wait_for_timeout(300)
    ok('Update dialog offers removing the missing bodies',pg.is_visible('#dwsDlgX') and '(2)' in pg.inner_text('#dwsDlgX'))
    pg.click('#dwsDlgX'); pg.wait_for_timeout(600)
    ok('…which removes them',miss()==0 and pg.evaluate("__mrt.dw().doc.src.length")==1 and not pg.is_visible('#dwsDlg'))
    ok('Remaining body still drawn',pg.locator('#dwsTree .dwsNode.body').count()==1)
    ok('No browser dialogs, no page errors',not native and not errs,[native,errs[:3]])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
