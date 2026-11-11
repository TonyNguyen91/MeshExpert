const fs=require('fs');const core=(new Function(fs.readFileSync('/home/claude/src/core.js','utf8')+';return MeshCore();'))();
function box(x0,y0,z0,x1,y1,z1){const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
 const f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[2,3,7],[2,7,6],[1,2,6],[1,6,5],[3,0,4],[3,4,7]];const a=[];for(const t of f)for(const i of t)a.push(...v[i]);return a;}
const mk=a=>core.weld(new Float32Array(a),null);
let b=mk(box(0,0,0,10,20,30));let s=core.stats(b.positions,b.indices);console.log('box stats',s.area,s.volume,core.topology(b.indices,b.positions.length/3));
let bv=core.buildBVH(b.positions,b.indices);console.log('ray',core.raycast(bv,[5,5,100],[0,0,-1],0,Infinity),core.raycast(bv,[50,5,100],[0,0,-1],0,Infinity));
// T-shape: undercut along z? make mushroom: stem box + cap box wider on top -> pulling +z: underside of cap faces -z and is visible from -z except above stem... sides of stem: vertical. Underside of cap: normal -z, ray -z free => class1. No undercut along z. Along x: stem side faces... cap overhang hides? pull x: underside of cap normal -z => nd=0 => s=+1 => ray +x from underside (offset down) -> free. stem +x face: ray +x free. So use an L/C shape: C-shape opening toward +x: analysed along z -> inner faces of C: top inner face normal -z, ray -z hits bottom arm => undercut.
const C=mk([...box(0,0,0,10,10,2),...box(0,0,8,10,10,10),...box(0,0,2,2,10,8)]);
let u=core.undercut(C,[0,0,1],1,null);console.log('C along z area',u.area.map(x=>+x.toFixed(1)));
u=core.undercut(C,[1,0,0],1,null);console.log('C along x area',u.area.map(x=>+x.toFixed(1)));
// collisions
const A=mk(box(0,0,0,10,10,10));
let r=core.collide(A,mk(box(5,5,5,15,15,15)));console.log('overlap',r.pairs>0,r.contain, r.flagsA.reduce((a,b)=>a+b),r.flagsB.reduce((a,b)=>a+b));
r=core.collide(A,mk(box(20,0,0,30,10,10)));console.log('apart',r.pairs,r.contain);
r=core.collide(A,mk(box(2,2,2,4,4,4)));console.log('B inside A',r.pairs,r.contain);
r=core.collide(mk(box(2,2,2,4,4,4)),A);console.log('A inside B',r.pairs,r.contain);
r=core.collide(A,mk(box(10,0,0,20,10,10)));console.log('touching faces',r.pairs,r.contain);
// perf: big sphere
function sphere(sub,r){const t=(1+Math.sqrt(5))/2;let V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
 let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 for(let s=0;s<sub;s++){const m=new Map(),F2=[];const mid=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(!m.has(k)){m.set(k,V.length);V.push([0,1,2].map(i=>(V[a][i]+V[b][i])/2));}return m.get(k);};for(const [a,b,c] of F){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);F2.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}F=F2;}
 const P=new Float32Array(V.length*3);V.forEach((v,i)=>{const l=Math.hypot(...v);P[3*i]=v[0]/l*r;P[3*i+1]=v[1]/l*r;P[3*i+2]=v[2]/l*r;});return {positions:P,indices:new Uint32Array(F.flat())};}
const big=sphere(8,50);let t=Date.now();bv=core.buildBVH(big.positions,big.indices);console.log('bvh',big.indices.length/3,'tris',Date.now()-t,'ms');
t=Date.now();u=core.undercut(big,[0,0,1],2,null);console.log('undercut sphere',Date.now()-t,'ms',u.area.map(x=>+x.toFixed(0)));
s=core.stats(big.positions,big.indices);console.log('sphere vol',s.volume.toFixed(0),'expect',(4/3*Math.PI*125000).toFixed(0));
t=Date.now();console.log(core.topology(big.indices,big.positions.length/3),Date.now()-t,'ms');
const big2={positions:big.positions.map((v,i)=>i%3==0?v+60:v),indices:big.indices};t=Date.now();r=core.collide(big,big2);console.log('collide big',Date.now()-t,'ms',r.pairs);
