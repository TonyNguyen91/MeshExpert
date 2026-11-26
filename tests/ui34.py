# Browser test (v1.4.0): hardware use and a smooth Drawing.
# - the graphics contexts ask for the strong graphics card; jobs run on a pool of workers, deviation / undercut / collision
#   split over several workers give exactly what one job gives; face recognition is kept for the same mesh
# - booleans run in a worker of their own (the page keeps drawing frames meanwhile), same result and errors as before
# - Drawing: a changed setting shows on the next frame (sheet laid out again from the pictures already made); an effect
#   setting does not redraw the GPU pictures, a line setting redraws neither the pictures nor the effects; the pictures
#   are prepared in workers; exported sheets are unchanged
# Run: python3 ui34.py <fixtures folder> [path to index.html]
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
    ok('Version 1.6.4 shown',pg.evaluate("document.getElementById('appVer').textContent")=='v1.6.4')
    ok('3D view asks for the high-performance graphics card',pg.evaluate("document.getElementById('gl').getContext('webgl2').getContextAttributes().powerPreference")=='high-performance')
    pg.set_input_files('#file',[S+'/refA.stl',S+'/scanB.stl',S+'/m_box.stl',S+'/m_peg.stl']); pg.wait_for_function("__mrt.S.bodies.length==4"); pg.wait_for_timeout(300)
    pool=pg.evaluate("__mrt.pool()")
    ok('Worker pool sized by the processor cores (1..8)',1<=pool['size']<=8 and pool['ok'],pool)
    r=pg.evaluate("""async()=>{const S=__mrt.S,core=__mrt.core,m=b=>({positions:b.geo.positions,indices:b.geo.indices});
      const A=m(S.bodies[0]),B=m(S.bodies[1]),eq=(x,y)=>x.length===y.length&&x.every((v,i)=>v===y[i]);
      // a mesh large enough to be split (>= 2 x 20 000 items): the reference repeated
      const rep=(M,n,dx)=>{const nv=M.positions.length/3,P=new Float32Array(M.positions.length*n),I=new Uint32Array(M.indices.length*n);
        for(let k=0;k<n;k++){for(let i=0;i<M.positions.length;i++)P[k*M.positions.length+i]=M.positions[i]+(i%3==0?k*dx:0);for(let i=0;i<M.indices.length;i++)I[k*M.indices.length+i]=M.indices[i]+k*nv;}return {positions:P,indices:I};};
      const A2=rep(A,8,0.37),B2=rep(B,8,0.37);
      const d1=core.deviation(B2,A2),d2=await __mrt.run('deviation',{b:B2,a:A2});
      const u1=core.undercut(A2,[0,0,1],1),u2=await __mrt.run('undercut',{mesh:A2,dir:[0,0,1],minDraft:1});
      const c1=core.collide(A2,B2),c2=await __mrt.run('collide',{a:A2,b:B2});
      const t0=performance.now();core.features(A2);const t1=performance.now();const f1=core.features(A2),f2=core.features({positions:A2.positions.slice(),indices:A2.indices.slice()});
      return {dev:eq(d1.dist,d2.dist)&&d1.rms===d2.rms&&d1.meanAbs===d2.meanAbs&&d1.min===d2.min&&d1.max===d2.max,
        und:eq(u1.classes,u2.classes)&&u1.area.every((v,i)=>v===u2.area[i]),col:eq(c1.flagsA,c2.flagsA)&&eq(c1.flagsB,c2.flagsB)&&c1.pairs===c2.pairs&&c1.contain===c2.contain,
        pairs:c1.pairs,feat:f1===f2,nt:A2.indices.length/3};}""")
    ok('Deviation split over workers = one job (distances, min, max, mean, RMS)',r['dev'],r)
    ok('Undercut split over workers = one job (classes and areas)',r['und'])
    ok('Collision split over workers = one job (flags, pairs, containment)',r['col'],r['pairs'])
    ok('Face recognition kept for the same mesh content',r['feat'])
    # boolean in its own worker: frames keep coming
    bo=pg.evaluate("""async()=>{const S=__mrt.S,m=b=>({positions:b.geo.positions,indices:b.geo.indices});const fr=[];let on=true;(function f(t){fr.push(t);if(on)requestAnimationFrame(f);})(performance.now());
      const r=await __mrt.boolRun(m(S.bodies[2]),m(S.bodies[3]),'union');on=false;let e='';try{await __mrt.boolRun(m(S.bodies[2]),{positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2])},'union');}catch(x){e=x.message;}
      return {tris:r.indices.length/3,engine:r.engine,frames:fr.length,err:e};}""")
    ok('Boolean (Manifold) gives a result in its worker',bo['tris']>0 and bo['engine']=='manifold',bo)
    ok('Boolean of an open mesh still says the mesh is not a closed solid',bo['err'].startswith('Mesh') or 'closed' in bo['err'],bo['err'][:60])
    # Drawing
    pg.evaluate("__mrt.delBodies(__mrt.S.bodies.slice(0,2))"); pg.wait_for_timeout(300)
    pg.click('#b_dws'); pg.wait_for_function("(__mrt.v6().nprev||0)>=1",timeout=60000); pg.wait_for_timeout(800)
    pg.click('#dwsTabs [data-k=draw]'); pg.wait_for_timeout(300)
    pg.evaluate("""()=>{window.set=function(m){for(const k in m){const e=document.getElementById(k);if(e.type==='checkbox')e.checked=m[k];else e.value=m[k];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}};
      window.waitN=function(n0){return new Promise(r=>{const t=setInterval(()=>{if((__mrt.v6().nprev||0)>n0){clearInterval(t);setTimeout(r,200);}},50);});};}""")
    ok('Drawing GL context asks for the high-performance graphics card',pg.evaluate("(()=>{const V=__mrt.v6();return [...V.vc.values()].every(E=>E.g.getContextAttributes().powerPreference==='high-performance')&&V.vc.size>0})()"))
    snap="(()=>{const V=__mrt.v6(),o={};for(const [k,E] of V.vc)o[k]=E;window.__vc=o;return Object.keys(o).length;})()"
    n=pg.evaluate(snap)
    ok('Each view keeps its pictures (front, top, ... )',n>=6,n)
    same_raw="(()=>{const V=__mrt.v6();let s=0,r=0,f=0;for(const [k,E] of V.vc){if(__vc[k]===E){s++;}if(__vc[k]&&__vc[k].raw===E.raw)r++;}return [s,r];})()"
    n0=pg.evaluate("__mrt.v6().nprev||0")
    pg.evaluate("set({v6FxAs:35})"); pg.evaluate("waitN(%d)"%n0)
    sr=pg.evaluate(same_raw)
    ok('Effect setting changed: GPU pictures kept, effects redone',sr[0]==n and sr[1]==n,sr)
    fx=pg.evaluate("(()=>{const V=__mrt.v6();const o={};for(const [k,E] of V.vc)o[k]=E.fxd;window.__fx=o;return 1;})()")
    n0=pg.evaluate("__mrt.v6().nprev||0")
    pg.evaluate("set({v6Hid:true})"); pg.evaluate("waitN(%d)"%n0)
    kept=pg.evaluate("(()=>{const V=__mrt.v6();let r=0;for(const [k,E] of V.vc)if(__fx[k]===E.fxd)r++;return r;})()")
    ok('Line setting changed: pictures and effects kept, lines drawn again',kept==n,kept)
    # a changed layout setting shows on the next frame, before any rendering
    pg.evaluate("window.__p0=__mrt.v6().prev")
    t=pg.evaluate("""()=>new Promise(r=>{const e=document.getElementById('v6Fs');e.value=(+e.value+1).toFixed(1);e.dispatchEvent(new Event('input',{bubbles:true}));
      requestAnimationFrame(()=>requestAnimationFrame(()=>{const P=__mrt.v6().prev;r({changed:P!==__p0,mix:!!P.mix,fs:P.o.fs});}));})""")
    ok('Font size: the sheet changes on the next frame (laid out from the pictures already made)',t['changed'] and t['mix'],t)
    pg.wait_for_timeout(2500)
    ok('then the real render follows',not pg.evaluate("!!__mrt.v6().prev.mix"))
    # exploded view: the same
    pg.evaluate("__mrt.dwType('exp')"); pg.wait_for_timeout(2500)
    pg.evaluate("window.__p0=__mrt.v6().prev")
    t=pg.evaluate("""()=>new Promise(r=>{const e=document.getElementById('v6Ex');e.value=+e.value+20;e.dispatchEvent(new Event('input',{bubbles:true}));
      requestAnimationFrame(()=>requestAnimationFrame(()=>{const P=__mrt.v6().prev;r({changed:P!==__p0,mix:!!P.mix,parts:(P.parts||[]).length});}));})""")
    ok('Exploded spread: parts move on the next frame',t['changed'] and t['mix'] and t['parts']==2,t)
    pg.wait_for_timeout(2500)
    png=pg.evaluate("__mrt.v6Png().then(d=>d.length)")
    ok('PNG export still works',png>10000,png)
    ok('No page errors',not errs,errs[:3])
    b.close()
print('ALL OK' if fails==0 else str(fails)+' FAILED')
sys.exit(1 if fails else 0)
