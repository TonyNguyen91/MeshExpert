// Writes the small STL files used by ui5.py. Run: node make_split_meshes.js <output folder>  (after python3 src/build.py)
const fs=require('fs'),path=require('path');
const corePath=[path.join(__dirname,'..','src','core.js'),path.join(__dirname,'core.js')].find(p=>fs.existsSync(p));
const core=(new Function(fs.readFileSync(corePath,'utf8')+';return MeshCore();'))();
const S=process.argv[2];
function box(x0,y0,z0,x1,y1,z1){const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
 const f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[2,3,7],[2,7,6],[1,2,6],[1,6,5],[3,0,4],[3,4,7]];const a=[];for(const t of f)for(const i of t)a.push(...v[i]);return a;}
const mk=a=>core.weld(new Float32Array(a),null);
function voxels(filled,s){const key=(x,y,z)=>x+','+y+','+z,set=new Set(filled.map(c=>key(...c)));const a=[];const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
 for(const c of filled)for(const d of dirs){if(set.has(key(c[0]+d[0],c[1]+d[1],c[2]+d[2])))continue;const ax=d[0]?0:d[1]?1:2,u=(ax+1)%3,w=(ax+2)%3,sg=d[ax];const base=c.slice();if(sg>0)base[ax]+=1;
  const q=[[0,0],[1,0],[1,1],[0,1]].map(p=>{const r=base.slice();r[u]+=p[0];r[w]+=p[1];return r.map(x=>x*s);});for(const i of (sg>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]))a.push(...q[i]);}return mk(a);}
const r3=(x0,x1,y0,y1,z0,z1)=>{const r=[];for(let x=x0;x<x1;x++)for(let y=y0;y<y1;y++)for(let z=z0;z<z1;z++)r.push([x,y,z]);return r;};
fs.writeFileSync(S+'/stack.stl',core.writeSTL(mk([...box(0,0,0,10,10,10),...box(0,0,10,10,10,20),...box(10,10,20,20,20,30),...box(50,50,50,60,60,60)])));
fs.writeFileSync(S+'/boss.stl',core.writeSTL(voxels(r3(0,6,0,6,0,2).concat(r3(1,2,1,2,2,5),r3(4,5,4,5,2,3)),5)));
fs.writeFileSync(S+'/pair.stl',core.writeSTL(mk([...box(0,0,0,10,10,10),...box(0,0,10,10,10,20)])));
fs.writeFileSync(S+'/one.stl',core.writeSTL(mk(box(100,0,0,120,20,20))));
// open sphere (two holes), cylinder R8 x 25, for ui7.py
function sphere(sub,rad){const t=(1+Math.sqrt(5))/2;let V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
 let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 for(let s=0;s<sub;s++){const mp=new Map(),F2=[];const mid=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(!mp.has(k)){mp.set(k,V.length);V.push([0,1,2].map(i=>(V[a][i]+V[b][i])/2));}return mp.get(k);};for(const f of F){const ab=mid(f[0],f[1]),bc=mid(f[1],f[2]),ca=mid(f[2],f[0]);F2.push([f[0],ab,ca],[f[1],bc,ab],[f[2],ca,bc],[ab,bc,ca]);}F=F2;}
 const P=new Float32Array(V.length*3);V.forEach((v,i)=>{const l=Math.hypot(v[0],v[1],v[2]);P[3*i]=v[0]/l*rad;P[3*i+1]=v[1]/l*rad;P[3*i+2]=v[2]/l*rad;});return{positions:P,indices:new Uint32Array(F.flat())};}
{const m=sphere(4,30),I=[];for(let t=0;t<m.indices.length;t+=3){let cz=0,cy=0;for(let j=0;j<3;j++){cz+=m.positions[3*m.indices[t+j]+2]/3;cy+=m.positions[3*m.indices[t+j]+1]/3;}if(cz<22&&cy>-26)I.push(m.indices[t],m.indices[t+1],m.indices[t+2]);}
 fs.writeFileSync(S+'/open.stl',core.writeSTL(core.weld(m.positions,new Uint32Array(I))));}
{const a=[],seg=48,prof=[[0,0],[8,0],[8,25],[0,25]];for(let i=0;i+1<prof.length;i++)for(let k=0;k<seg;k++){const p=(j,kk)=>{const t=2*Math.PI*(kk%seg)/seg;return[prof[j][0]*Math.cos(t),prof[j][0]*Math.sin(t),prof[j][1]];};const A=p(i,k),B=p(i,k+1),C=p(i+1,k+1),D=p(i+1,k);if(prof[i][0]>0)a.push(...A,...B,...C);if(prof[i+1][0]>0)a.push(...A,...C,...D);}
 fs.writeFileSync(S+'/cyl.stl',core.writeSTL(mk(a)));}
console.log('written');
