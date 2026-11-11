# Browser test of the split options (Split / Next option / Previous option / slider).
# Run: node make_split_meshes.js <folder>; python3 ui5.py <folder> [path to index.html]
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
    cx=b.new_context(viewport={'width':1680,'height':950},accept_downloads=True)
    pg=cx.new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def names(): return pg.evaluate("__mrt.S.bodies.map(b=>b.name+':'+b.geo.indices.length/3+(__mrt.S.sel.has(b)?'*':''))")
    def nb(): return pg.evaluate("__mrt.S.bodies.length")
    def lv(): return pg.inner_text('#splitLvV')
    def res(): return pg.inner_text('#splitRes').replace('\n',' | ')
    def row(i): return f'#bodyList .brow:nth-child({i+1})'
    def slider(v):
        pg.evaluate("v=>{const e=document.getElementById('splitLv');e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}",v); pg.wait_for_timeout(100); idle()
    pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); pg.uncheck('#cInfo')
    ok('initial option label',lv()=='1/10' and 'rời' in pg.inner_text('#splitLvName'),pg.inner_text('#splitLvName'))
    pg.click('#bSplitNext'); pg.wait_for_timeout(200); ok('next with nothing ticked only warns',nb()==0 and lv()=='1/10',pg.inner_text('#status'))

    # ---- boxes that touch: every Next separates more ----
    pg.set_input_files('#file',[S+'/stack.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    pg.click(row(1)); pg.click('#bSplit'); idle()
    ok('split: option 1 gives 2 bodies',nb()==2 and lv()=='1/10',names()); print('     ',res())
    ok('pieces are not ticked (own colours)',pg.evaluate("__mrt.S.sel.size")==0)
    pg.click('#bSplitNext'); idle(); ok('next: option 2 gives 3',nb()==3 and lv()=='2/10',names())
    pg.click('#bSplitNext'); idle(); ok('next: option 3 gives 4 closed boxes',nb()==4 and lv()=='3/10' and all(n.endswith(':12') for n in names()),names())
    pg.screenshot(path=S+'/s1.png')
    pg.click('#bSplitNext'); idle(); ok('next: skips options without effect, lands on faces (8/10) with 24',nb()==24 and lv()=='8/10',lv()+' '+str(nb())); print('     ',res())
    pg.click('#bSplitNext'); idle(); ok('next at the end: nothing changes',nb()==24 and lv()=='8/10',pg.inner_text('#status'))
    pg.click('#bSplitPrev'); idle(); ok('previous: back to 4 bodies',nb()==4,lv()+' '+str(names()))
    slider(2); ok('slider to 2: 3 bodies',nb()==3 and lv()=='2/10',names())
    slider(1); ok('slider to 1: 2 bodies',nb()==2 and lv()=='1/10',names())
    ok('previous at option 1 is disabled',pg.is_disabled('#bSplitPrev') and nb()==2)
    pg.click('#bUndo'); idle(); ok('undo steps back one option',nb()==3,names())
    for i in range(6): pg.click('#bUndo'); pg.wait_for_timeout(60)
    ok('undo all the way: the original body is back',nb()==1 and names()[0].startswith('stack:48'),names())

    # ---- fused part: auto stops at 3 and says so, Next cuts at the concave seam ----
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/boss.stl',S+'/one.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.click(row(1)); pg.click('#bSplit'); idle()
    ok('fused: auto tries 1-3, nothing splits, body kept and still ticked',nb()==2 and lv()=='3/10' and names()[0].endswith('*'),names()); print('     ',res())
    pg.click('#bSplitNext'); idle(); ok('fused: next -> concave cut gives base + 2 bosses',nb()==4 and lv()=='4/10',names()); print('     ',res())
    pg.screenshot(path=S+'/s2.png')
    pg.click('#bSplitPrev'); idle(); ok('fused: previous restores the whole body, ticked',nb()==2 and names()[0]=='boss:'+str(pg.evaluate("__mrt.S.bodies[0].geo.indices.length/3"))+'*',names())
    pg.click('#bSplitNext'); idle()
    # tick one piece and press Next: only that piece is split further
    before=names(); pg.click(row(1)); pg.click('#bSplitNext'); idle()
    ok('ticked piece + next: only that piece changes',nb()>4 and names()[-1].startswith('one:12'),str(nb())+' '+lv())
    # two bodies ticked at once
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/stack.stl',S+'/boss.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.click('#bSelAll'); pg.click('#bSplit'); idle(); ok('two bodies: option 1 -> 2 + 1',nb()==3,names())
    slider(4); ok('two bodies: slider 4 -> 4 + 3',nb()==7,names())
    # parts that only touch: plain Split goes on by itself to the first option that separates them
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/pair.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    pg.click(row(1)); pg.click('#bSplit'); idle(); ok('touching pair: split alone reaches option 3 -> 2 closed boxes',nb()==2 and lv()=='3/10' and all(n.endswith(':12') for n in names()),lv()+' '+str(names()))
    # context menu entry
    pg.click('#bClear'); pg.set_input_files('#file',[S+'/stack.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); idle()
    pg.click(row(1),button='right'); pg.click("#ctx div:has-text('Tách body')"); idle(); ok('context menu split',nb()==2)
    # English
    pg.click('#bEn'); pg.wait_for_timeout(150); ok('english labels',pg.inner_text('#bSplitNext')=='Next option ▶' and 'Disconnected' in pg.inner_text('#splitLvName'),pg.inner_text('#splitLvName'))
    pg.click('#bSplitNext'); idle(); ok('english result text','Option 2/10' in res(),res()); pg.click('#bVi')
    # merge then split again gives the parts back
    pg.click('#bSelAll'); pg.click('#bJoin'); pg.wait_for_timeout(150); n1=nb(); pg.click('#bSplit'); idle(); ok('merge then split',n1==1 and nb()>=2,names())
    print('console errors:',errs)
    if errs: fails+=1
    b.close()
print('FAILED '+str(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
