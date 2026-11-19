# Browser test: notes aligned to the paper (left / centre / right / top / middle / bottom, also the lines), picking several
# notes by clicking them one after another (empty click clears), moving / deleting them together, Ctrl+C / Ctrl+V, the
# overall size split into length / width / height (each on / off), extension lines starting at the bodies' extreme
# points, dragging an overall dimension line, old drawings with one Dimensions switch.
# Run: python3 ui28.py <fixtures folder> [path to index.html] [folder for pictures]
import sys,os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
OUT=sys.argv[3] if len(sys.argv)>3 else None
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':1456,'height':819},offline=True)
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(1600)
    def ctr(kind,key): return pg.evaluate("a=>{const h=__mrt.v6().prev.hits.find(h=>h.kind==a[0]&&(h.id==a[1]||h.key==a[1]));if(!h)return null;const s=__mrt.v6Scr(h.r);return [s.x+s.w/2,s.y+s.h/2]}",[kind,key])
    def nbox(id): return pg.evaluate("id=>{const q=__mrt.v6().prev,k=q.k,h=q.hits.find(h=>h.kind=='note'&&h.id==id);return [(h.r.x+3)/k,(h.r.y+3)/k,(h.r.w-6)/k,(h.r.h-6)/k,q.o.W,q.o.H,q.o.fs*q.o.dpi/25.4]}",id)
    pg.set_input_files('#file',[S+'/rd_chamf.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    pg.click('#b_dws'); settle()
    # ---- overall size: three dimensions
    keys=lambda: sorted(h['key'] for h in pg.evaluate("__mrt.v6().prev.hits.filter(h=>h.kind=='odim')"))
    ok('Overall size: length, width, height dimensions',keys()==['D','H','W'],keys())
    ok('Annotation group has the three switches',all(pg.locator('#dwsRibbon .rpage.on button[data-chk="#v6Dim%s"]'%k).count()==1 for k in 'WDH'))
    pg.click('#dwsRibbon .rpage.on button[data-chk="#v6DimD"]'); settle()
    ok('Width switched off alone',keys()==['H','W'],keys())
    pg.click('#dwsRibbon .rpage.on button[data-chk="#v6DimD"]'); settle()
    # extension lines start at the extreme points: the height dimension of the chamfered part starts at the top corner,
    # which lies inside the picture (not at the frame corner)
    g=pg.evaluate("""(()=>{const q=__mrt.v6().prev,k=q.k,h=q.hits.find(h=>h.kind=='odim'&&h.key=='H');const n=['right','front','left','back'].find(n=>q.frames[n]);const f=q.frames[n],v=q.views[n],xp=v.xp;
      return {base:h.base/k,fx:f.x/k,top:(f.tr.x0+xp.T[0]*f.tr.s)/k,tl:(f.tr.x0+xp.x0*f.tr.s)/k,y0:(f.tr.y0+xp.y0*f.tr.s)/k,fy:f.y/k,ppmm:q.o.dpi/25.4}})()""")
    ok('Height extension starts at the top corner of the body (chamfer), not at the frame',g['top']-g['tl']>0.5*g['ppmm'] and abs(g['y0']-g['fy'])<0.5*g['ppmm'],g)
    # drag the length dimension line down
    c=ctr('odim','W'); y0=pg.evaluate("__mrt.v6().prev.hits.find(h=>h.kind=='odim'&&h.key=='W').r.y")
    pg.mouse.move(c[0],c[1]); pg.mouse.down(); pg.mouse.move(c[0],c[1]+40,steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
    y1=pg.evaluate("__mrt.v6().prev.hits.find(h=>h.kind=='odim'&&h.key=='W').r.y")
    odo=pg.evaluate("__mrt.v6().odo")
    ok('Dragging the length dimension line moves it (kept as paper mm)',y1>y0+20 and odo.get('W',0)>5,[y0,y1,odo])
    pg.keyboard.press('Control+s'); pg.wait_for_timeout(600)
    ok('Saved sheet holds the dimension offset',pg.evaluate("(()=>{const d=__mrt.dw().doc,s=d.sheets.find(s=>s.id==d.active);return s.saved.st['6v'].odo.W})()")==odo['W'])
    # old drawing with one Dimensions switch off
    st=pg.evaluate("(()=>{const d=JSON.parse(JSON.stringify(__mrt.v6Dump()));d.cfg['6v'].v6Dim=false;delete d.cfg['6v'].v6DimW;delete d.cfg['6v'].v6DimD;delete d.cfg['6v'].v6DimH;__mrt.v6Load(d);return ['v6DimW','v6DimD','v6DimH'].map(i=>document.getElementById(i).checked)})()")
    settle()
    ok('Old drawing with Dimensions off: all three off',st==[False,False,False] and keys()==[],[st,keys()])
    pg.evaluate("['v6DimW','v6DimD','v6DimH'].forEach(i=>{const e=document.getElementById(i);e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}))})"); settle()
    # ---- notes
    pg.click('#dwsTabs [data-k=set]')
    for t in ('NOTE A','NOTE B','NOTE C'):
        pg.click('#dwsRibbon .rpage.on button[data-click="#v6AddT"]'); pg.wait_for_timeout(300); pg.fill('#v6EdT',t); pg.click('#v6EdOk'); pg.wait_for_timeout(200)
        pg.evaluate("t=>{const V=__mrt.v6(),n=V.notes['6v'].find(n=>n.text==t);n.y=0.2+0.15*V.notes['6v'].indexOf(n);}",t)
    pg.evaluate("__mrt.v6Paint()"); pg.wait_for_timeout(300)
    ids=pg.evaluate("__mrt.v6().notes['6v'].map(n=>n.id)")
    a,bb,cc=ids
    pb=pg.locator('#v6Prev').bounding_box(); pg.mouse.click(pb['x']+pb['width']*0.5,pb['y']+pb['height']*0.97); pg.wait_for_timeout(200)
    pg.mouse.click(*ctr('note',a)); pg.mouse.click(*ctr('note',bb)); pg.wait_for_timeout(200)
    ok('Clicking notes one after another picks them all',sorted(pg.evaluate("__mrt.v6().nsels"))==sorted([a,bb]))
    pb=pg.locator('#v6Prev').bounding_box()
    pg.mouse.click(pb['x']+pb['width']*0.5,pb['y']+pb['height']*0.97); pg.wait_for_timeout(200)
    ok('Click on empty space clears the pick',pg.evaluate("__mrt.v6().nsels")==[] and pg.evaluate("__mrt.v6().nsel") is None)
    pg.mouse.click(*ctr('note',a)); pg.mouse.click(*ctr('note',bb)); pg.wait_for_timeout(200)
    n0=pg.evaluate("__mrt.v6().notes['6v'].map(n=>[n.x,n.y])")
    c=ctr('note',bb); pg.mouse.move(*c); pg.mouse.down(); pg.mouse.move(c[0]+60,c[1]+20,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    n1=pg.evaluate("__mrt.v6().notes['6v'].map(n=>[n.x,n.y])")
    ok('Dragging moves every picked note (the other stays)',n1[0][0]>n0[0][0]+0.01 and n1[1][0]>n0[1][0]+0.01 and abs(n1[0][0]-n0[0][0]-(n1[1][0]-n0[1][0]))<1e-9 and n1[2]==n0[2])
    # style for all picked
    pg.click('#dwsRibbon .rpage.on button[data-chk="#v6Ni"]'); pg.wait_for_timeout(200)
    ok('Style applies to every picked note',pg.evaluate("__mrt.v6().notes['6v'].map(n=>!!n.italic)")==[True,True,False])
    # align to the paper
    pg.mouse.click(*ctr('note',bb),button='right'); pg.wait_for_timeout(200)
    menu=pg.inner_text('#ctx')
    ok('Right-click menu: align to the paper (6 ways) for the picked notes',all(t in menu for t in ['Căn trái khổ giấy','Căn giữa khổ giấy','Căn phải khổ giấy','Căn trên khổ giấy','Căn giữa theo chiều dọc','Căn dưới khổ giấy']) and '(2)' in menu,menu)
    pg.click('#ctx div:has-text("Căn phải khổ giấy")'); pg.wait_for_timeout(300)
    ra=nbox(a); rb=nbox(bb); m=1.5*ra[6]
    ok('Align right: both boxes end at the right margin, lines right-aligned',abs(ra[0]+ra[2]-(ra[4]-m))<2 and abs(rb[0]+rb[2]-(rb[4]-m))<2 and pg.evaluate("__mrt.v6().notes['6v'].slice(0,2).every(n=>n.align=='right')"),[ra,rb])
    pg.mouse.click(*ctr('note',bb),button='right'); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Căn giữa khổ giấy")'); pg.wait_for_timeout(300)
    ra=nbox(a)
    ok('Centre on the paper',abs(ra[0]+ra[2]/2-ra[4]/2)<2,ra)
    pg.mouse.click(*ctr('note',bb),button='right'); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Căn trái khổ giấy")'); pg.wait_for_timeout(300)
    ra=nbox(a); ok('Align left: at the left margin',abs(ra[0]-m)<2,ra)
    pg.mouse.click(*ctr('note',bb),button='right'); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Căn dưới khổ giấy")'); pg.wait_for_timeout(300)
    rb=nbox(bb); ok('Align bottom: at the bottom margin',abs(rb[1]+rb[3]-(rb[5]-m))<2,rb)
    pg.mouse.click(*ctr('note',bb),button='right'); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Căn giữa theo chiều dọc")'); pg.wait_for_timeout(300)
    rb=nbox(bb); ok('Centre vertically',abs(rb[1]+rb[3]/2-rb[5]/2)<2,rb)
    pg.mouse.click(*ctr('note',bb),button='right'); pg.wait_for_timeout(200); pg.click('#ctx div:has-text("Căn trên khổ giấy")'); pg.wait_for_timeout(300)
    rb=nbox(bb); ok('Align top: at the top margin',abs(rb[1]-m)<2,rb)
    # copy / paste
    pg.mouse.click(pb['x']+pb['width']*0.5,pb['y']+pb['height']*0.97)
    pg.evaluate("__mrt.v6().notes['6v'].forEach((n,i)=>{n.x=0.1;n.y=0.2+0.15*i})"); pg.evaluate("__mrt.v6Paint()"); pg.wait_for_timeout(300)
    pg.mouse.click(*ctr('note',a)); pg.mouse.click(*ctr('note',cc)); pg.keyboard.press('Control+c'); pg.wait_for_timeout(100)
    pg.keyboard.press('Control+v'); pg.wait_for_timeout(300)
    N=pg.evaluate("__mrt.v6().notes['6v']")
    ok('Ctrl+C / Ctrl+V: the two picked notes pasted, offset, picked',len(N)==5 and [n['text'] for n in N[3:]]==['NOTE A','NOTE C'] and abs(N[3]['x']-0.12)<1e-9 and abs(N[4]['y']-(N[2]['y']+0.02))<1e-9 and sorted(pg.evaluate("__mrt.v6().nsels"))==sorted([N[3]['id'],N[4]['id']]))
    pg.keyboard.press('Control+v'); pg.wait_for_timeout(200)
    N=pg.evaluate("__mrt.v6().notes['6v']")
    ok('Pasting again goes a step further',len(N)==7 and abs(N[5]['x']-0.14)<1e-9)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(200)
    ok('Delete removes every picked note',len(pg.evaluate("__mrt.v6().notes['6v']"))==5)
    pg.evaluate("__mrt.dwType('exp')"); settle(); pg.click('#v6Prev',position={'x':5,'y':5}); pg.keyboard.press('Control+v'); pg.wait_for_timeout(300)
    ok('Paste into the other drawing type too',len(pg.evaluate("__mrt.v6().notes.exp"))==2)
    if OUT: pg.screenshot(path=os.path.join(OUT,'ui28.png'))
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
