# Browser test: 3D view shading in the sculpting style (Settings > 3D view). On by default; switching it off gives the old
# flat shading back; MatCap, cavity, AO and cast shadow change the picture; every level is a slider with a number box;
# the settings are kept after a reload; the version is shown.
# Run: python3 ui32.py <fixtures folder> [path to index.html]
import sys,os,io
from PIL import Image
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
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' or 'zs ' in m.text else None)
    pg.goto('file://'+os.path.abspath(PAGE))
    ok('Version 1.4.0 shown',pg.evaluate("document.getElementById('appVer').textContent")=='v1.4.0' and 'v1.4.0' in pg.title())
    pg.set_input_files('#file',[S+'/steps.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); pg.wait_for_timeout(500)
    # a 3/4 view from above, the plate filling the window
    pg.evaluate("(()=>{const c=__mrt.cam(),a=0.6,e=0.9;const r=[Math.cos(a),Math.sin(a),0],w=[-Math.sin(a)*Math.sin(e),Math.cos(a)*Math.sin(e),Math.cos(e)];const u=[w[1]*r[2]-w[2]*r[1],w[2]*r[0]-w[0]*r[2],w[0]*r[1]-w[1]*r[0]];c.R=[...r,...u,...w];})()")
    pg.evaluate("document.getElementById('bFit').click()"); pg.wait_for_timeout(300)
    def shot():
        pg.evaluate("__mrt.S.sel.clear()"); pg.mouse.move(5,400); pg.wait_for_timeout(900)
        im=Image.open(io.BytesIO(pg.locator('#gl').screenshot())).convert('L').resize((240,140))
        return list(im.tobytes())
    def diff(a,c): return sum(abs(x-y) for x,y in zip(a,c))/len(a)
    zs=pg.evaluate("__mrt.zs()")
    ok('Sculpt shading is on by default',zs['on'] is True)
    pg.click('#bSet'); pg.wait_for_timeout(200)
    on=shot()
    ok('Settings opens on the 3D view tab',pg.evaluate("getComputedStyle(document.getElementById('zsPanel')).display")!='none' and pg.evaluate("document.querySelector('#setTabs button.on').dataset.k")=='view')
    nR=pg.locator('#zsPanel input[type=range]').count(); nN=pg.locator('#zsPanel input[type=number]').count()
    ok('Every level is a slider with a number box',nR==13 and nN==13,[nR,nN])
    ok('Material choice (4 MatCaps)',pg.locator('#zsMat option').count()==4)
    ok('No guide text on the panel (tooltips only)',pg.locator('#zsPanel .note').count()==0 and pg.evaluate("[...document.querySelectorAll('#zsPanel .zsr')].every(r=>r.title.length>0)"))
    pg.click('#zsOn'); off=shot()
    ok('Switching off changes the picture (old flat shading)',diff(on,off)>3,round(diff(on,off),2))
    ok('Off greys out the levels',pg.evaluate("document.getElementById('zsR_ao').disabled") is True)
    pg.click('#zsOn'); on2=shot()
    ok('Switching on again gives the same picture',diff(on,on2)<1.0,round(diff(on,on2),3))
    # effects one by one
    def setv(k,v): pg.evaluate("([k,v])=>{const e=document.getElementById(k);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}",[k,v])
    for k in ['zsR_ao','zsR_sh','zsR_cav','zsR_ridge']: setv(k,0)
    base=shot()
    setv('zsR_ao',100); a=shot(); ok('AO changes the picture',diff(base,a)>0.3,round(diff(base,a),3)); setv('zsR_ao',0)
    setv('zsR_sh',100); s=shot(); ok('Cast shadow changes the picture',diff(base,s)>0.3,round(diff(base,s),3)); setv('zsR_sh',0)
    setv('zsR_cav',100); c=shot(); ok('Cavity changes the picture',diff(base,c)>0.1,round(diff(base,c),3)); setv('zsR_cav',0)
    setv('zsR_yaw',120); y=shot(); ok('Turning the light changes the picture',diff(base,y)>1,round(diff(base,y),3))
    ok('Slider and number box stay in step',pg.evaluate("document.getElementById('zsN_yaw').value")=='120')
    pg.fill('#zsN_light','150'); pg.press('#zsN_light','Enter'); pg.wait_for_timeout(100)
    ok('Number box drives the slider',pg.evaluate("document.getElementById('zsR_light').value")=='150' and pg.evaluate("__mrt.zs().light")==150)
    pg.select_option('#zsMat','white'); w=shot(); ok('MatCap choice changes the picture',diff(y,w)>1,round(diff(y,w),3))
    setv('zsR_smooth',0); pg.wait_for_timeout(500); ok('Smoothing angle kept',pg.evaluate("__mrt.zs().smooth")==0)
    ok('Shortcut tab still lists the keys',(pg.click('#setTabs button[data-k=keys]') or True) and pg.locator('#keyTbl tr').count()>3 and pg.evaluate("getComputedStyle(document.getElementById('zsPanel')).display")=='none')
    # kept after a reload
    pg.reload(); pg.wait_for_timeout(500)
    z2=pg.evaluate("__mrt.zs()")
    ok('Settings kept after reload',z2['mat']=='white' and z2['yaw']==120 and z2['light']==150,z2)
    pg.click('#bSet'); pg.click('#setTabs button[data-k=view]'); pg.click('#zsReset'); pg.wait_for_timeout(100)
    z3=pg.evaluate("__mrt.zs()")
    ok('Back to defaults keeps the on/off switch',z3['mat']=='clay' and z3['yaw']==0 and z3['on'] is True)
    pg.click('#zsOn'); pg.reload(); pg.wait_for_timeout(400)
    ok('Off is kept after reload',pg.evaluate("__mrt.zs().on") is False)
    # selection and section still work with the shading on
    pg.evaluate("__mrt.zsSet('on',true)")
    pg.set_input_files('#file',[S+'/steps.stl']); pg.wait_for_function("__mrt.S.bodies.length==1"); pg.wait_for_timeout(400)
    pg.evaluate("document.getElementById('bFit').click()"); pg.wait_for_timeout(300)
    ok('No script errors',not errs,errs[:3])
    b.close()
print('FAILS',fails)
sys.exit(1 if fails else 0)
