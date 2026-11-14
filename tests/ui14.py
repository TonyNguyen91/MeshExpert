# Browser test: the small tool panel (Line, Move...) has a title bar: drag it, collapse it, double-click to put it back.
# Run: python3 ui14.py <folder with block.stl> [path to index.html]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE))
    pg.set_input_files('#file',[S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); pg.wait_for_timeout(300)
    pg.click('[data-tool=gline]'); pg.wait_for_timeout(200)
    pos=lambda: pg.evaluate("(()=>{const p=document.getElementById('tpop');return [p.offsetLeft,p.offsetTop,p.offsetHeight]})()")
    ok('Title shows the tool',pg.inner_text('#tpTitle')=='Line')
    a=pos(); ok('Line panel is compact',a[2]<240,a)
    hb=pg.locator('#tpHd .grip').bounding_box(); x,y=hb['x']+4,hb['y']+4
    pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+250,y+200,steps=6); pg.mouse.up(); pg.wait_for_timeout(100)
    c=pos(); ok('Dragged by the title bar',abs(c[0]-a[0]-250)<3 and abs(c[1]-a[1]-200)<3,(a,c))
    ok('Drag did not pick anything in the view',pg.locator('#geoSlots .gslot.ok').count()==0)
    pg.mouse.move(x+250,y+200); pg.mouse.down(); pg.mouse.move(5000,5000,steps=4); pg.mouse.up()
    d=pos(); ok('Kept inside the view, not squeezed',d[0]+pg.evaluate("document.getElementById('tpop').offsetWidth")<=1456-280 and d[1]<819 and d[2]==a[2],d)
    pg.click('#tpMin'); pg.wait_for_timeout(100)
    ok('Collapsed to the title bar',pos()[2]<36 and not pg.is_visible('#geoMake'))
    pg.click('[data-tool=move]'); pg.wait_for_timeout(100)
    ok('Title follows the tool, stays collapsed',pg.inner_text('#tpTitle')=='Di chuyển' and not pg.is_visible('#mvX'))
    pg.click('#tpMin'); pg.wait_for_timeout(100); ok('Expanded again',pg.is_visible('#mvX'))
    pg.dblclick('#tpTitle'); pg.wait_for_timeout(100); e=pos(); ok('Double-click puts it back',e[0]==a[0] and e[1]==a[1],e)
    pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+100,y+60,steps=4); pg.mouse.up()
    pg2=ctx.new_page(); pg2.goto('file://'+os.path.abspath(PAGE)); pg2.wait_for_timeout(300)
    pg2.click('[data-tool=gline]'); pg2.wait_for_timeout(200)
    f=pg2.evaluate("(()=>{const p=document.getElementById('tpop');return [p.offsetLeft,p.offsetTop]})()")
    ok('Position remembered on next open',abs(f[0]-a[0]-100)<3 and abs(f[1]-a[1]-60)<3,f)
    ok('No page errors',not errs,errs)
    b.close()
print('ALL OK' if not fails else '%d FAIL'%fails); sys.exit(1 if fails else 0)
