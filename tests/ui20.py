# Browser test: Capture > 6 view: compact panel + sheet window with a live preview; views slide along their projection
# lines; colour as the 3D view or one colour; size / DPI / format; PNG and JPG carry the DPI; mm and inch side by side.
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
            dpi=round(struct.unpack('>I',b[i+8:i+12])[0]*0.0254)
            if zlib.crc32(b[i+4:i+8+n])!=struct.unpack('>I',b[i+8+n:i+12+n])[0]: dpi=-1
        i+=12+n
    return w,h,dpi
def jpg_info(b):
    dpi=struct.unpack('>H',b[14:16])[0] if b[6:10]==b'JFIF' and b[13]==1 else None
    i=2
    while i<len(b):
        m=b[i+1]; L=struct.unpack('>H',b[i+2:i+4])[0]
        if m in (0xc0,0xc2): h,w=struct.unpack('>HH',b[i+5:i+9]); return w,h,dpi
        i+=2+L
    return None,None,dpi
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_context(viewport={'width':1456,'height':819},offline=True,accept_downloads=True).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+os.path.abspath(PAGE))
    def idle(): pg.wait_for_function("document.getElementById('busy').style.display!='flex'"); pg.wait_for_timeout(200)
    def settle(): pg.wait_for_timeout(2000)
    pg.set_input_files('#file',[S+'/rd_chamf.stl',S+'/block.stl']); pg.wait_for_function("__mrt.S.bodies.length==2"); idle()
    pg.evaluate("(()=>{const S=__mrt.S;S.sel.clear();S.bodies[0].color=[200,60,60];S.bodies[1].color=[60,170,90];})()")
    pg.click('.popb[data-pop=v6]'); settle()
    ok('Panel and sheet window open',pg.is_visible('#pop_v6') and pg.is_visible('#v6Sheet'))
    bx=pg.eval_on_selector('#pop_v6',"e=>{const r=e.getBoundingClientRect();return [r.width,r.height]}")
    ok('Panel is compact (not the whole screen)',bx[0]<=380 and bx[1]<819*0.85,bx)
    info=pg.inner_text('#v6Info')
    ok('Info: paper in mm and inch side by side','420 × 297 mm' in info and '16.54 × 11.69 in' in info,info.replace('\n',' | '))
    ok('Info: expected file size shown','≈' in info and ('KB' in info or 'MB' in info),info.split('\n')[-1])
    red=pg.evaluate("(()=>{const c=document.getElementById('v6Prev'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let r=0,g=0,k=0;for(let i=0;i<d.length;i+=4){if(d[i]>150&&d[i+1]<110&&d[i+2]<110)r++;if(d[i+1]>120&&d[i]<110&&d[i+2]<140)g++;if(d[i]<60&&d[i+1]<60&&d[i+2]<60)k++;}return [r,g,k]})()")
    ok('Preview in the body colours of the 3D view, with lines',red[0]>300 and red[1]>300 and red[2]>40,red)
    def hit(kind,key=None): return pg.evaluate("a=>{const q=__mrt.v6().prev,c=document.getElementById('v6Prev'),r=c.getBoundingClientRect(),h=q.hits.find(h=>h.kind==a[0]&&(a[1]==null||h.n==a[1]||h.id==a[1]));if(!h)return null;const f=h.r,s=r.width/c.width;return [r.left+(f.x+f.w/2)*s,r.top+(f.y+f.h/2)*s,f.x,f.y,f.w,f.h]}",[kind,key])
    def frame(n): return hit('view',n)
    f0=frame('right'); fr0=frame('front'); t0=frame('top')
    pg.mouse.move(f0[0],f0[1]); pg.mouse.down(); pg.mouse.move(f0[0]+40,f0[1]+30,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    f1=frame('right'); fr1=frame('front')
    ok('Right view slides only along its projection line',abs(f1[2]-f0[2])>20 and abs(f1[3]-f0[3])<0.5 and abs(fr1[3]-fr0[3])<0.5,[f0[2:],f1[2:]])
    pg.mouse.move(t0[0],t0[1]); pg.mouse.down(); pg.mouse.move(t0[0]+50,t0[1]-20,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    t1=frame('top'); fr2=frame('front')
    ok('Top view stays in the Front column (moves up/down only)',abs(t1[2]-t0[2])<0.5 and abs(t1[3]-t0[3])>5,[t0[2:],t1[2:]])
    fr3=frame('front'); r3=frame('right')
    pg.mouse.move(fr3[0],fr3[1]); pg.mouse.down(); pg.mouse.move(fr3[0]-30,fr3[1]+25,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    fr4=frame('front'); r4=frame('right')
    ok('Moving the Front view carries the others along',abs(fr4[3]-fr3[3])>10 and abs((r4[2]-fr4[2])-(r3[2]-fr3[2]))<0.5 and abs(r4[3]-fr4[3]-(r3[3]-fr3[3]))<0.5)
    with pg.expect_download(timeout=180000) as dl: pg.click('#v6Save')
    data=open(dl.value.path(),'rb').read(); w,h,dpi=png_info(data)
    ok('PNG: A3 landscape at 300 dpi',(w,h,dpi)==(4961,3508,300),(w,h,dpi))
    if OUT: open(os.path.join(OUT,'v6_a3.png'),'wb').write(data)
    pg.click('#v6RotZ'); pg.select_option('#v6Col','one'); pg.fill('#v6One','#d08a2a'); pg.dispatch_event('#v6One','input')
    pg.select_option('#v6Paper','A4'); pg.select_option('#v6Ori','P'); pg.fill('#v6Dpi','600'); pg.dispatch_event('#v6Dpi','input')
    pg.select_option('#v6Fmt','jpg'); pg.check('#v6Lbl'); pg.check('#v6ScN'); pg.check('#v6Hid'); settle()
    ok('Quality slider shown for JPG',pg.is_visible('#v6Q'))
    ok('Turning the model resets the layout',pg.evaluate("__mrt.v6().pos===null"))
    with pg.expect_download(timeout=180000) as dl: pg.click('#v6Save')
    data=open(dl.value.path(),'rb').read(); w,h,dpi=jpg_info(data)
    ok('JPG: A4 portrait at 600 dpi',(w,h,dpi)==(4961,7016,600),(w,h,dpi))
    if OUT: open(os.path.join(OUT,'v6_a4.jpg'),'wb').write(data)
    pg.select_option('#v6Col','white'); pg.select_option('#v6Scale','2'); pg.select_option('#v6Fmt','png'); pg.select_option('#v6Paper','px')
    pg.fill('#v6W','3000'); pg.dispatch_event('#v6W','input'); pg.fill('#v6H','2000'); pg.dispatch_event('#v6H','input'); pg.fill('#v6Dpi','300'); pg.dispatch_event('#v6Dpi','input'); settle()
    ok('Scale 2:1 reported',pg.inner_text('#v6Info').find('2:1')>=0)
    with pg.expect_download(timeout=180000) as dl: pg.click('#v6Save')
    data=open(dl.value.path(),'rb').read(); w,h,dpi=png_info(data)
    ok('Custom 3000 x 2000 px',(w,h,dpi)==(3000,2000,300),(w,h,dpi))
    if OUT: open(os.path.join(OUT,'v6_line.png'),'wb').write(data)
    # ---- iso view, drawing size, text size, notes (6 view)
    pg.select_option('#v6Scale','0'); pg.check('#v6Iso'); pg.fill('#v6Az','30'); pg.dispatch_event('#v6Az','input'); pg.fill('#v6El','25'); pg.dispatch_event('#v6El','input'); settle()
    i0=hit('iso'); ok('Iso view on the sheet',i0 is not None and pg.is_visible('#v6Az'))
    pg.mouse.move(i0[0],i0[1]); pg.mouse.down(); pg.mouse.move(i0[0]-60,i0[1]+40,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    i1=hit('iso'); ok('Iso view moves freely',abs(i1[2]-i0[2])>30 and abs(i1[3]-i0[3])>20,[i0[2:4],i1[2:4]])
    w0=frame('front')[4]; pg.fill('#v6Zm','60'); pg.dispatch_event('#v6Zm','input'); pg.dispatch_event('#v6Zm','change'); settle()
    w1=frame('front')[4]; ok('Drawing size 60 % makes every view smaller',abs(w1/w0-0.6)<0.06,[w0,w1])
    pg.click('#v6AddT'); pg.wait_for_timeout(300)
    ok('Add text opens the editor',pg.is_visible('#v6EdT'))
    pg.fill('#v6EdT','MẪU THỬ 01'); pg.click('#v6EdOk'); pg.wait_for_timeout(200)
    n0=hit('note'); ok('Note placed on the sheet',n0 is not None and pg.evaluate("__mrt.v6().notes['6v'][0].text")=='MẪU THỬ 01')
    pg.fill('#v6Ns','8'); pg.dispatch_event('#v6Ns','input'); pg.wait_for_timeout(200)
    n1=hit('note'); ok('Note size follows the Note slider',n1[5]>n0[5]*1.5,[n0[5],n1[5]])
    pg.mouse.move(n1[0],n1[1]); pg.mouse.down(); pg.mouse.move(n1[0]+80,n1[1]+50,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    n2=hit('note'); ok('Note can be dragged',abs(n2[2]-n1[2])>50,[n1[2],n2[2]])
    pg.fill('#v6Fs','4'); pg.dispatch_event('#v6Fs','input'); pg.check('#v6Fb'); settle()
    ok('Text size / bold options accepted',pg.evaluate("document.getElementById('v6Fs').value")=='4')
    with pg.expect_download(timeout=180000) as dl: pg.click('#v6Save')
    if OUT: open(os.path.join(OUT,'v6_iso.png'),'wb').write(open(dl.value.path(),'rb').read())
    # ---- exploded view
    pg.click('#v6Seg button[data-k=exp]'); settle()
    ok('Exploded view opens the same panel in its own mode',pg.evaluate("document.getElementById('v6ShT').textContent")=='Exploded view' and pg.is_visible('#v6Ex') and not pg.is_visible('.v6v[data-v=top]'))
    parts=pg.evaluate("__mrt.v6().prev.parts.length"); ok('One picture per part',parts==2,parts)
    p0=hit('part',pg.evaluate("__mrt.S.bodies[1].id"))
    pg.mouse.move(p0[0],p0[1]); pg.mouse.down(); pg.mouse.move(p0[0]+70,p0[1]-40,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    p1=hit('part',pg.evaluate("__mrt.S.bodies[1].id")); ok('A part can be placed anywhere',abs(p1[2]-p0[2])>40 and abs(p1[3]-p0[3])>20)
    ok('Part row shows the clicked part',pg.is_visible('#v6PName') and pg.input_value('#v6PName')=='block',pg.input_value('#v6PName'))
    lb=hit('label',pg.evaluate("__mrt.S.bodies[1].id"))
    pg.mouse.dblclick(lb[0],lb[1]); pg.wait_for_timeout(300)
    ok('Double-click on a name opens name + material editor',pg.is_visible('#v6EdT') and pg.is_visible('#v6EdM'))
    pg.fill('#v6EdT','Nắp hộp'); pg.select_option('#v6EdM','ABS'); pg.click('#v6EdOk'); pg.wait_for_timeout(500)
    bb=pg.evaluate("(()=>{const b=__mrt.S.bodies[1];return [b.name,b.material,b.density]})()")
    ok('Name and material written back to the body',bb[0]=='Nắp hộp' and bb[1]=='ABS' and abs(bb[2]-1.05)<1e-9,bb)
    ok('Body list shows the new name',pg.locator('#bodyList').inner_text().find('Nắp hộp')>=0)
    m=pg.inner_text('#v6PMass'); ok('Mass in grams shown for the part',m.endswith(' g'),m)
    vol=pg.evaluate("__mrt.S.bodies[1]?__mrt.core.stats(__mrt.S.bodies[1].geo.positions,__mrt.S.bodies[1].geo.indices).volume:0")
    ok('Mass = volume x density',abs(float(m.split()[0].replace(',',''))-vol/1000*1.05)<0.02,[m,vol])
    pg.select_option('#v6PMat','AL'); pg.wait_for_timeout(300)
    ok('Material from the panel goes to the body',pg.evaluate("__mrt.S.bodies[1].material")=='AL')
    pg.evaluate("(()=>{const b=__mrt.S.bodies[0];b.name='than_tru';})()"); pg.wait_for_timeout(1600)
    lab=pg.evaluate("(()=>{const q=__mrt.v6().prev;return q.parts.map(p=>p.b.name)})()")
    ok('A rename in the body tree shows in the drawing',('than_tru' in lab),lab)
    with pg.expect_download(timeout=180000) as dl: pg.click('#v6Save')
    data=open(dl.value.path(),'rb').read(); w,h,dpi=png_info(data)
    ok('Exploded view saved with its own settings (A3 300 dpi, not the 6-view sheet size)',(w,h,dpi)==(4961,3508,300),(w,h,dpi))
    if OUT: open(os.path.join(OUT,'v6_exp.png'),'wb').write(data)
    pg.click('#pop_v6 .pophd .popx'); pg.wait_for_timeout(200)
    ok('Closing the panel hides the sheet window',not pg.is_visible('#v6Sheet'))
    ok('No page errors',not errs,errs[:3])
    b.close()
print('FAILS',fails); sys.exit(1 if fails else 0)
