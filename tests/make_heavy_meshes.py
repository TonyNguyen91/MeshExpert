# Heavy test meshes for the performance benchmark (perf_bench.py). Not committed (about 200 MB): make them when needed.
# heavyA.stl / heavyB.stl: one closed body of about 1 000 000 triangles each (B = A slightly moved, larger and noisy);
# asm0..3.stl: four closed bodies of about 240 000 triangles each (an assembly for the Drawing).
# Run: python3 make_heavy_meshes.py <output folder>     (needs numpy)
import sys, os
import numpy as np, struct
def grid_closed(nu, nv, f):
    # parametric closed surface (u around, v pole to pole) -> triangles
    u = np.linspace(0, 2*np.pi, nu, endpoint=False); v = np.linspace(0, np.pi, nv+1)[1:-1]
    U, Vv = np.meshgrid(u, v, indexing='ij')
    P = f(U, Vv).reshape(-1,3)
    top = f(np.array([0.0]), np.array([0.0])).reshape(1,3); bot = f(np.array([0.0]), np.array([np.pi])).reshape(1,3)
    P = np.vstack([P, top, bot]); it, ib = len(P)-2, len(P)-1
    m = nv-1; idx = lambda i,j: (i%nu)*m + j
    T=[]
    i = np.arange(nu)[:,None]; j = np.arange(m-1)[None,:]
    a=idx(i,j); b=idx(i+1,j); c=idx(i+1,j+1); d=idx(i,j+1)
    T.append(np.stack([a,b,c],-1).reshape(-1,3)); T.append(np.stack([a,c,d],-1).reshape(-1,3))
    i1=np.arange(nu); T.append(np.stack([np.full(nu,it), idx(i1+1,0), idx(i1,0)],-1))
    T.append(np.stack([np.full(nu,ib), idx(i1,m-1), idx(i1+1,m-1)],-1))
    return P, np.vstack(T)
def supere(rx,ry,rz,e,c=(0,0,0),rip=0.0,noise=0.0,seed=0):
    rng=np.random.default_rng(seed)
    def f(U,V):
        s=lambda x,p: np.sign(x)*np.abs(x)**p
        x=rx*s(np.sin(V),e)*s(np.cos(U),e); y=ry*s(np.sin(V),e)*s(np.sin(U),e); z=rz*s(np.cos(V),e)
        k=1+rip*np.sin(12*U)*np.sin(9*V)
        out=np.stack([x*k+c[0],y*k+c[1],z*k+c[2]],-1)
        if noise: out=out+rng.normal(0,noise,out.shape)
        return out
    return f
def write(fn, bodies):
    tris=[]
    for P,T in bodies: tris.append(P[T])
    A=np.vstack(tris).astype(np.float32)
    n=len(A); rec=np.zeros(n,dtype=[('n','<f4',3),('v','<f4',(3,3)),('a','<u2')]); rec['v']=A
    with open(fn,'wb') as fh: fh.write(b'\0'*80); fh.write(struct.pack('<I',n)); fh.write(rec.tobytes())
    print(fn,n)

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    write(os.path.join(out, 'heavyA.stl'), [grid_closed(1000, 500, supere(40, 30, 20, 0.35, rip=0.03))])
    write(os.path.join(out, 'heavyB.stl'), [grid_closed(1000, 500, supere(40.3, 30.2, 20.1, 0.35, c=(0.2, 0.1, 0), rip=0.031, noise=0.01, seed=1))])
    B = [supere(30, 20, 10, 0.25), supere(12, 12, 25, 0.4, c=(45, 0, 10), rip=0.02), supere(15, 25, 8, 0.2, c=(0, 40, 0)), supere(10, 10, 10, 1.0, c=(-40, -10, 5), rip=0.05)]
    for i, f in enumerate(B): write(os.path.join(out, 'asm%d.stl' % i), [grid_closed(490, 245, f)])
