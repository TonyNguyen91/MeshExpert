# Browser test: Drawing Workspace ribbon — the Isometric button lights up while the iso view is shown, and Auto Arrange
# (6 Views) spaces the views evenly between each other and the sheet border, keeping their size and projection lines.
# Run: python3 ui25.py <fixtures folder> [path to index.html]
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
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def sv(sel,v): pg.evaluate("a=>{const e=document.querySelector(a[0]);e.value=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}",[sel,str(v)])
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(1600)
    def frames(): return pg.evaluate("(()=>{const q=__mrt.v6().prev,k=q.k||1,o={};for(const n in q.frames){const f=q.frames[n];o[n]=[f.x/k,f.y/k,f.w/k,f.h/k]}return {f:o,W:q.o.W,H:q.o.H}})()")
    pg.set_input_files('#file',[S+'/block.stl',S+'/cyl.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.click('#b_dws'); settle()
    iso='#dwsRibbon .rpage.on button[data-chk="#v6Iso"]'
    lit=lambda: pg.mouse.move(700,500) or pg.wait_for_timeout(100) or pg.evaluate("s=>{const b=document.querySelector(s);const c=getComputedStyle(b);return [b.classList.contains('on'),c.borderTopColor,c.backgroundColor]}",iso)
    off=lit()
    pg.click(iso); settle()
    hov=pg.evaluate("s=>getComputedStyle(document.querySelector(s)).borderTopColor",iso)
    on=lit()
    ok('Lit while the mouse is still on it',hov==on[1],[hov,on[1]])
    ok('Isometric button lights up while the iso view is shown',pg.is_checked('#v6Iso') and on[0] and on[1:]!=off[1:] and pg.evaluate("!!__mrt.v6().prev.iso"),[off,on])
    pg.click(iso); settle()
    ok('Isometric button goes dark when the iso view is hidden',not pg.is_checked('#v6Iso') and lit()[1:]==off[1:])
    pg.click(iso); settle()
    # move two views by hand, then Auto Arrange
    for n,dx,dy in (('top',0,-40),('right',50,0)):
        h=pg.evaluate("n=>{const h=__mrt.v6().prev.hits.find(h=>h.kind=='view'&&h.n==n);const s=__mrt.v6Scr(h.r);return [s.x+s.w/2,s.y+s.h/2]}",n)
        pg.mouse.move(h[0],h[1]); pg.mouse.down(); pg.mouse.move(h[0]+dx,h[1]+dy,steps=4); pg.mouse.up(); pg.wait_for_timeout(300)
    settle(); a=frames()
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Auto"]'); settle()
    c=frames(); F=c['f']; W=c['W']; H=c['H']
    ok('Auto Arrange keeps every view and iso size',all(abs(F[n][2]-a['f'][n][2])<1.5 and abs(F[n][3]-a['f'][n][3])<1.5 for n in F),{n:(a['f'][n][2:],F[n][2:]) for n in F})
    cx=lambda n: F[n][0]+F[n][2]/2; cy=lambda n: F[n][1]+F[n][3]/2
    ok('Views stay on their projection lines',abs(cx('top')-cx('front'))<1 and abs(cx('bottom')-cx('front'))<1 and abs(cy('left')-cy('front'))<1 and abs(cy('right')-cy('front'))<1 and abs(cy('back')-cy('front'))<1)
    # column boxes (with names / overall dims from the drawing settings) are evenly spaced; measure on picture edges of the front row
    ok('Views arranged inside the sheet',all(F[n][0]>0 and F[n][1]>0 and F[n][0]+F[n][2]<W and F[n][1]+F[n][3]<H for n in F),[F,W,H])
    # no overlaps
    ov=[(m,n) for m in F for n in F if m<n and F[m][0]<F[n][0]+F[n][2] and F[n][0]<F[m][0]+F[m][2] and F[m][1]<F[n][1]+F[n][3] and F[n][1]<F[m][1]+F[m][3]]
    ok('No two views overlap',not ov,ov)
    # without names / dims the gaps are exactly equal (pictures are the boxes)
    pg.evaluate("for(const id of ['v6Lbl','v6Dim','v6ScN']){const e=document.getElementById(id);if(e.checked){e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}))}}"); settle()
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Auto"]'); settle()
    c=frames(); F=c['f']; W=c['W']; H=c['H']
    def gaps(spans,L):
        spans=sorted(spans); g=[spans[0][0]]+[spans[i+1][0]-spans[i][1] for i in range(len(spans)-1)]+[L-spans[-1][1]]; return g
    def colspans(axis):
        groups={}
        for n,r in F.items():
            c=round(r[axis]+r[axis+2]/2)
            key=[k for k in groups if abs(k-c)<2]; key=key[0] if key else c
            groups.setdefault(key,[]).append((r[axis],r[axis]+r[axis+2]))
        return [(min(s[0] for s in v),max(s[1] for s in v)) for v in groups.values()]
    hx=gaps(colspans(0),W); hy=gaps(colspans(1),H)
    ok('Equal gaps between columns and to the left / right border',max(hx)-min(hx)<2,hx)
    ok('Equal gaps between rows and to the top / bottom border',max(hy)-min(hy)<2,hy)
    ok('Iso picture placed in the free top-right cell',F['iso'][0]>F['front'][0]+F['front'][2] and F['iso'][1]+F['iso'][3]<=F['front'][1]+1)
    if OUT:
        pg.screenshot(path=os.path.join(OUT,'ui25_auto.png'))
    # Exploded keeps its own Auto Arrange (back to automatic placements)
    pg.click('#dwsTabs [data-k=exp]'); settle()
    pg.evaluate("__mrt.v6().off={1:[0.1,0.1]}")
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Auto"]'); settle()
    ok('Exploded Auto Arrange places every part (its own layout)',pg.evaluate("(()=>{const V=__mrt.v6();return V.prev.parts.every(p=>V.off[p.id]&&V.off[p.id][0]!=0.1)})()"))
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
