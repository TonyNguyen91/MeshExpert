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
console.log('written');
