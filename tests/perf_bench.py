# Performance benchmark: heavy meshes (make_heavy_meshes.py), the same steps on any build of index.html, results as JSON.
#  core: open 2 x 1M triangles, deviation / undercut / collision / ICP (workers), face recognition twice (page), two jobs at once
#  draw: Drawing Workspace with 4 x 240k triangles: open, then sliders dragged (~30 changes / s for 2 s) and released;
#        measured: frames per second and longest pause of the page while dragging and after, time until the last preview
# Run: python3 perf_bench.py <folder with the heavy meshes> <index.html> <out.json> [core,draw] [--gpu]
#      --gpu: the computer's own graphics card (default: software rendering, as the other browser tests)
import sys, json, os, time
from playwright.sync_api import sync_playwright
A=[a for a in sys.argv[1:] if not a.startswith('--')]; GPU='--gpu' in sys.argv
B=A[0]; PAGE=A[1]; OUT=A[2]; PARTS=(A[3] if len(A)>3 else 'core,draw').split(',')
R={}
with sync_playwright() as p:
    if GPU: b=p.chromium.launch(channel='chrome',args=['--js-flags=--max-old-space-size=6000'])
    else: b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6000'])
    ctx=b.new_context(viewport={'width':1600,'height':900},offline=True)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.goto('file://'+os.path.abspath(PAGE)); pg.wait_for_timeout(500)
    # long-task + frame monitor
    pg.evaluate("""()=>{window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())__lt.push([e.startTime,e.duration]);}).observe({entryTypes:['longtask']});
      window.__fr=[];(function f(t){__fr.push(t);requestAnimationFrame(f);})(performance.now());}""")
    def mon_start(): pg.evaluate("()=>{window.__m0=performance.now();}")
    def mon_end():
        return pg.evaluate("""()=>{const t0=__m0,t1=performance.now();const lt=__lt.filter(x=>x[0]>=t0);const fr=__fr.filter(x=>x>=t0);
          let gap=0;for(let i=1;i<fr.length;i++)gap=Math.max(gap,fr[i]-fr[i-1]);
          return {ms:+(t1-t0).toFixed(0),longest_block_ms:+(lt.reduce((m,x)=>Math.max(m,x[1]),0)).toFixed(0),blocked_ms:+lt.reduce((s,x)=>s+x[1],0).toFixed(0),fps:+(fr.length/((t1-t0)/1000)).toFixed(1),max_frame_gap_ms:+gap.toFixed(0)};}""")
    if 'core' in PARTS:
        mon_start()
        pg.set_input_files('#file',[B+'/heavyA.stl',B+'/heavyB.stl']); pg.wait_for_function("__mrt.S.bodies.length==2",timeout=300000)
        R['open_2x1M']=mon_end()
        def job(name, js):
            mon_start(); t=pg.evaluate("async()=>{const S=__mrt.S,a=S.bodies[0].geo,b=S.bodies[1].geo;const A={positions:a.positions,indices:a.indices},Bm={positions:b.positions,indices:b.indices};const t0=performance.now();const r=await ("+js+");window.__r=r;return performance.now()-t0;}")
            m=mon_end(); m['job_ms']=round(t); R[name]=m; print(name,m,flush=True)
        job('deviation',"__mrt.run('deviation',{b:Bm,a:A})")
        job('undercut',"__mrt.run('undercut',{mesh:A,dir:[0,0,1],minDraft:1})")
        job('collide',"__mrt.run('collide',{a:A,b:Bm})")
        job('icp',"__mrt.run('icp',{b:Bm,a:A})")
        # features on the main thread: twice on the same mesh (as the feature tools do)
        mon_start(); t=pg.evaluate("()=>{const g=__mrt.S.bodies[0].geo,m={positions:g.positions,indices:g.indices};const t0=performance.now();__mrt.core.features(m);const t1=performance.now();__mrt.core.features(m);return [t1-t0,performance.now()-t1];}")
        m=mon_end(); m['first_ms']=round(t[0]); m['second_ms']=round(t[1]); R['features_x2']=m; print('features',m,flush=True)
        # deviation + undercut started together (queue vs parallel)
        job('dev+undercut_together',"Promise.all([__mrt.run('deviation',{b:Bm,a:A}),__mrt.run('undercut',{mesh:A,dir:[0,0,1],minDraft:1})])")
        pg.evaluate("__mrt.delBodies? __mrt.delBodies(__mrt.S.bodies.slice()):0"); pg.wait_for_timeout(500)
    if 'draw' in PARTS:
        pg.goto('file://'+os.path.abspath(PAGE)); pg.wait_for_timeout(500)
        pg.evaluate("""()=>{window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())__lt.push([e.startTime,e.duration]);}).observe({entryTypes:['longtask']});
          window.__fr=[];(function f(t){__fr.push(t);requestAnimationFrame(f);})(performance.now());}""")
        pg.set_input_files('#file',[B+'/asm%d.stl'%i for i in range(4)]); pg.wait_for_function("__mrt.S.bodies.length==4",timeout=300000)
        pg.wait_for_timeout(1500)
        mon_start(); pg.click('#b_dws'); pg.wait_for_function("(__mrt.v6().nprev||0)>=1",timeout=300000)
        R['draw_open']=mon_end(); print('open',R['draw_open'],flush=True)
        pg.click('#dwsTabs [data-k=draw]'); pg.wait_for_timeout(1500)
        def settle(n0, tmax=120):
            t0=time.time()
            while time.time()-t0<tmax:
                pg.wait_for_timeout(400); n=pg.evaluate("__mrt.v6().nprev||0")
                if n>n0:
                    n0=n; pg.wait_for_timeout(1200)
                    if pg.evaluate("__mrt.v6().nprev||0")==n0: return n0
        def drag(name, sid, vals, kind='input'):
            # a slider dragged: ~30 input events per second, then the mouse is released (change)
            n0=pg.evaluate("__mrt.v6().nprev||0"); mon_start()
            for v in vals:
                pg.evaluate("([i,v,k])=>{const e=document.getElementById(i);e.value=v;e.dispatchEvent(new Event(k,{bubbles:true}));}",[sid,str(v),kind]); pg.wait_for_timeout(33)
            pg.evaluate("i=>{const e=document.getElementById(i);e.dispatchEvent(new Event('change',{bubbles:true}));window.__rel=performance.now();}",sid)
            drag_m=mon_end(); drag_m['previews_during']=pg.evaluate("__mrt.v6().nprev||0")-n0
            mon_start(); n1=settle(n0); m=mon_end()
            lat=pg.evaluate("performance.now()-__rel")
            r={'during_drag':drag_m,'after_release':m,'previews':(n1 or n0)-n0,'release_to_done_ms':round(lat-1200)}
            R['drag_'+name]=r; print(name,r,flush=True)
        import math
        drag('effects_AO_strength','v6FxAsR',[int(20+15*math.sin(i/6)) for i in range(60)])
        drag('line_width','v6LwR',[round(0.05+0.04*math.sin(i/6)+0.05,2) for i in range(60)])
        drag('edge_angle','v6AngR',[int(30+10*math.sin(i/6)) for i in range(60)])
        drag('font_size','v6FsR',[round(3+1*math.sin(i/6),1) for i in range(60)])
        drag('zoom_sheet','v6ZmR',[int(90+10*math.sin(i/6)) for i in range(60)])
        pg.evaluate("__mrt.dwType('exp')"); pg.wait_for_timeout(500); settle(pg.evaluate("__mrt.v6().nprev||0")-1)
        drag('exploded_spread','v6ExR',[int(30+20*math.sin(i/6)) for i in range(60)])
        drag('exploded_azimuth','v6AzR',[int(45+20*math.sin(i/6)) for i in range(60)])
    R['errors']=errs
    json.dump(R,open(OUT,'w'),indent=1)
