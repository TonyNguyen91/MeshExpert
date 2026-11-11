const fs=require('fs');const core=(new Function(fs.readFileSync('/home/claude/src/core.js','utf8')+';return MeshCore();'))();
function sphere(sub,r,sx){const t=(1+Math.sqrt(5))/2;let V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
 let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 for(let s=0;s<sub;s++){const m=new Map(),F2=[];const mid=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(!m.has(k)){m.set(k,V.length);V.push([0,1,2].map(i=>(V[a][i]+V[b][i])/2));}return m.get(k);};for(const [a,b,c] of F){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);F2.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}F=F2;}
 const P=new Float32Array(V.length*3);V.forEach((v,i)=>{const l=Math.hypot(...v);P[3*i]=v[0]/l*r*sx;P[3*i+1]=v[1]/l*r*0.7+ (v[2]>0?0.3*v[0]/l:0);P[3*i+2]=v[2]/l*r;});return {positions:P,indices:new Uint32Array(F.flat())};}
const A=sphere(5,10,1.3);
// B = A moved by a known rigid transform
const ang=0.4,c=Math.cos(ang),s=Math.sin(ang);const Tm=[c,s,0,0,-s,c,0,0,0,0,1,0,5,-3,2,1];
const tp=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const PB=new Float32Array(A.positions.length);for(let i=0;i<PB.length;i+=3){const q=tp(Tm,[A.positions[i],A.positions[i+1],A.positions[i+2]]);PB[i]=q[0];PB[i+1]=q[1];PB[i+2]=q[2];}
const B={positions:PB,indices:A.indices};
const pick=[0,500,1500,3000].map(i=>[A.positions[3*i],A.positions[3*i+1],A.positions[3*i+2]]);
const src=pick.map(p=>{const q=tp(Tm,p);return [q[0]+0.3*(Math.random()-.5),q[1]+0.3*(Math.random()-.5),q[2]+0.3*(Math.random()-.5)];});
const T=core.rigidFit(src,pick);
const app=(m,M)=>{const P=new Float32Array(M.positions.length);for(let i=0;i<P.length;i+=3){const q=tp(m,[M.positions[i],M.positions[i+1],M.positions[i+2]]);P[i]=q[0];P[i+1]=q[1];P[i+2]=q[2];}return {positions:P,indices:M.indices};};
let B1=app(T,B);let d=core.deviation(B1,A,null);console.log('after point align: rms',d.rms.toFixed(4),'max',d.max.toFixed(4),'min',d.min.toFixed(4));
let t=Date.now();const r=core.icp(B1,A,40,null);const B2=app(r.matrix,B1);d=core.deviation(B2,A,null);console.log('after icp: rms',d.rms.toExponential(2),'max',d.max.toExponential(2),Date.now()-t,'ms');
// sign check: bigger sphere vs smaller
const s1=sphere(4,10,1),s2=sphere(4,11,1);d=core.deviation(s2,s1,null);console.log('outer vs inner mean',d.meanAbs.toFixed(3),'min',d.min.toFixed(3));d=core.deviation(s1,s2,null);console.log('inner vs outer max',d.max.toFixed(3));
