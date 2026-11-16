# Browser test: Capture > 6 view: drawing-style projections saved as PNG with the chosen size and DPI.
# Run: python3 make_rd_meshes.py <fixtures>; python3 ui20.py <fixtures folder> [path to index.html] [folder for the pictures]
import sys,os,struct,zlib
from playwright.sync_api import sync_playwright
S=sys.argv[1]; PAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','index.html')
OUT=sys.argv[3] if len(sys.argv)>3 else None
fails=0
def ok(name,cond,extra=''):
    global fails
    print(('ok   ' if cond else 'FAIL ')+name+('  '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
def png_info(b):
    w,h=struct.unpack('>II',b[16:24]); i=8; dpi=None
    while i<len(b):
        n=struct.unpack('>I',b[i:i+4])[0]; t=b[i+4:i+8]
        if t==b'pHYs':
            x=struct.unpack('>I',b[i+8:i+12])[0]; dpi=round(x*0.0254)
            ok('pHYs CRC valid',zlib.crc32(b[i+4:i+8+n])==struct.unpack('>I',b[i+8+n:i+12+n])[0])
        i+=12+n
    return w,h,dpi
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1456,'height':819},offline=True,accept_downloads=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    pg.set_input_files('#file',[S+'/rd_chamf.stl',S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.evaluate("(()=>{const S=__mrt.S;S.sel.clear();})()")
    pg.click('.popb[data-pop=v6]'); pg.wait_for_timeout(1500)
    ok('6 view panel opens',pg.is_visible('#pop_v6'))
    dark=pg.evaluate("(()=>{const c=document.getElementById('v6Prev'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&d[i]<90)n++;return n})()")
    ok('Preview shows line work',dark>200,dark)
    ok('Size label for A3 at 300 dpi',pg.inner_text('#v6Info').replace(' ','')=='4961×3508px',pg.inner_text('#v6Info'))
    with pg.expect_download(timeout=120000) as dl: pg.click('#v6Save')
    path=dl.value.path(); data=open(path,'rb').read(); w,h,dpi=png_info(data)
    ok('Saved PNG is A3 landscape at 300 dpi',(w,h,dpi)==(4961,3508,300),(w,h,dpi))
    if OUT: open(os.path.join(OUT,'v6_a3.png'),'wb').write(data)
    # custom pixel size, shaded, hidden lines, 150 dpi
    pg.select_option('#v6Paper','px'); pg.fill('#v6W','1600'); pg.dispatch_event('#v6W','input'); pg.fill('#v6H','1000'); pg.dispatch_event('#v6H','input')
    pg.fill('#v6Dpi','150'); pg.dispatch_event('#v6Dpi','input'); pg.select_option('#v6Style','shadeline'); pg.select_option('#v6Hid','1'); pg.check('#v6Lbl')
    pg.wait_for_timeout(800)
    ok('Custom size rows shown',pg.is_visible('#v6W'))
    with pg.expect_download(timeout=120000) as dl: pg.click('#v6Save')
    data=open(dl.value.path(),'rb').read(); w,h,dpi=png_info(data)
    ok('Custom 1600 x 1000 px at 150 dpi',(w,h,dpi)==(1600,1000,150),(w,h,dpi))
    if OUT: open(os.path.join(OUT,'v6_px.png'),'wb').write(data)
    # only the ticked body, 4 views
    pg.evaluate("(()=>{const S=__mrt.S;S.sel.clear();S.sel.add(S.bodies[0]);})()")
    for v in ['top','bottom']: pg.uncheck('.v6v[data-v=%s]'%v)
    pg.select_option('#v6Style','line'); pg.select_option('#v6Hid','0'); pg.select_option('#v6Bg','t'); pg.wait_for_timeout(300)
    with pg.expect_download(timeout=120000) as dl: pg.click('#v6Save')
    data=open(dl.value.path(),'rb').read(); w,h,dpi=png_info(data)
    ok('Transparent 4-view picture saved',w==1600 and h==1000,(w,h,dpi))
    if OUT: open(os.path.join(OUT,'v6_4.png'),'wb').write(data)
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
