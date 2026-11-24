# Browser test (v1.3.2): new default settings (SLA print plate, drawing colour / bold text, drawing effects, 3D view shading)
# and one Auto Arrange button, the same on 6 Views and Exploded View, right next to 2D Type.
# Run: python3 ui33.py <fixtures folder> [path to index.html]
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
    ctx=b.new_context(viewport={'width':1600,'height':900},offline=True)
    pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE))
    ok('Version 1.4.0 shown',pg.evaluate("document.getElementById('appVer').textContent")=='v1.4.0')
    v=lambda i: pg.evaluate("i=>document.getElementById(i).value",i)
    c=lambda i: pg.evaluate("i=>document.getElementById(i).checked",i)
    # SLA print plate
    sla={'slaW':'400','slaD':'400','slaSpread':'30','slaSpreadR':'30','slaGap':'10','slaGapR':'10','slaLift':'5','slaTilt':'15','slaGX':'20','slaGY':'20','slaGT':'2','slaGD':'30','slaMargin':'30'}
    got={k:v(k) for k in sla}
    ok('SLA plate defaults',got==sla,got)
    ok('SLA: tilt off, guard blocks on',not c('slaTiltOn') and c('slaGuardOn'))
    # 3D view shading
    z=pg.evaluate("__mrt.zs()")
    want={'on':True,'mat':'clay','tint':100,'light':100,'amb':20,'yaw':0,'pitch':0,'smooth':35,'cav':6,'ridge':8,'ao':15,'aoR':21,'sh':12,'shL':16,'shSoft':100}
    ok('3D view defaults',all(z[k]==want[k] for k in want),z)
    pg.click('#bSet'); pg.click('#zsReset'); pg.wait_for_timeout(100)
    z=pg.evaluate("__mrt.zs()")
    ok('Back to defaults gives the same values',all(z[k]==want[k] for k in want),z)
    pg.click('#setClose')
    # drawing defaults
    ok('Drawing: One colour, grey 153 158 163, studio light',v('v6Col')=='one' and v('v6One')=='#999ea3' and v('v6Light')=='studio')
    ok('Drawing: line 0.01 mm, bold text',v('v6Lw')=='0.01' and c('v6Fb'))
    fx={'v6FxT':'5','v6FxW':'0.01','v6FxB':'5','v6FxBs':'4','v6FxA':'0.2','v6FxAs':'0','v6FxS':'0','v6FxSa':'0','v6FxSe':'5','v6FxC':'0'}
    got={k:v(k) for k in fx}; got.update({k+'R':v(k+'R') for k in fx})
    ok('Effects defaults (slider and box)',all(got[k]==fx[k] and got[k+'R']==fx[k] for k in fx),got)
    # a new sheet takes those defaults
    pg.set_input_files('#file',[S+'/steps.stl',S+'/steps2.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); pg.wait_for_timeout(300)
    pg.click('#b_dws'); pg.wait_for_timeout(1500)
    pg.click('#dwsTabs [data-k=draw]'); pg.wait_for_timeout(300)
    cfg=pg.evaluate("__mrt.v6Dump().cfg['6v']")
    ok('New sheet uses the defaults',cfg.get('v6Col')=='one' and cfg.get('v6One')=='#999ea3' and str(cfg.get('v6FxT'))=='5' and str(cfg.get('v6FxSe'))=='5' and cfg.get('v6Fb') in (True,'true',1),{k:cfg.get(k) for k in ['v6Col','v6One','v6FxT','v6FxSe','v6Fb']})
    # Auto Arrange next to 2D Type, the same on both drawing types
    def grp():
        return pg.evaluate("""(()=>{const pgE=document.querySelector('#dwsRibbon .rpage.on');const g=[...pgE.querySelectorAll(':scope > .rgrp')];
          const last=g[g.length-1];const bs=[...last.querySelectorAll('button')];
          const a=pgE.querySelectorAll('button[data-click="#v6Auto"]');const r1=a[0]&&a[0].getBoundingClientRect(),r2=last.querySelector('[data-act=type2d]').getBoundingClientRect();
          return {n:a.length,inLast:!!(a[0]&&last.contains(a[0])),order:bs.map(x=>x.dataset.click||x.dataset.act),html:a[0]?a[0].outerHTML:'',gap:r2.left-r1.right,big:a[0]?a[0].classList.contains('bb'):false};})()""")
    g6=grp()
    ok('6 Views: one Auto Arrange, in the last group, right before 2D Type',g6['n']==1 and g6['inLast'] and g6['order']==['#v6Auto','type2d'] and 0<=g6['gap']<12,g6)
    pg.evaluate("__mrt.dwType('exp')"); pg.wait_for_timeout(800); pg.click('#dwsTabs [data-k=draw]'); pg.wait_for_timeout(300)
    ge=grp()
    ok('Exploded: one Auto Arrange, in the last group, right before 2D Type',ge['n']==1 and ge['inLast'] and ge['order']==['#v6Auto','type2d'] and 0<=ge['gap']<12,ge)
    ok('The two Auto Arrange buttons are the same (big button, same look)',g6['html']==ge['html'] and g6['big'])
    pg.click('#dwsRibbon .rpage.on button[data-click="#v6Auto"]'); pg.wait_for_timeout(1600)
    ok('Exploded Auto Arrange still places the parts',pg.evaluate("(()=>{const V=__mrt.v6();return V.prev&&V.prev.parts&&V.prev.parts.every(p=>V.off[p.id])})()"))
    ok('Ribbon has no horizontal scroll bar',pg.evaluate("(()=>{const r=document.getElementById('dwsRibbon');return r.scrollWidth<=r.clientWidth+1})()"))
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails)
sys.exit(1 if fails else 0)
