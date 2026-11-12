// Tests for the solid edits (fillet / chamfer tools, face prisms, shell) with the embedded Manifold library.
// Run: node src/test_dress.js (after python3 src/build.py)
const fs = require('fs'), path = require('path');
const core = (new Function(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + ';return MeshCore();'))();
global.location = { href: 'file:///x/' };
const MF = (new Function(fs.readFileSync(path.join(__dirname, 'manifold_embed.js'), 'utf8').replace('createRequire("")', 'createRequire(' + JSON.stringify(__filename) + ')') + ';return { ManifoldModule: ManifoldModule, B64: MANIFOLD_WASM_B64 };'))();
let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : '')); if (!cond) fails++; }
const vol = function (m) { return core.stats(m.positions, m.indices).volume; };
const closed = function (m) { const t = core.topology(m.indices, m.positions.length / 3); return t.border === 0 && t.nonManifold === 0; };
const F = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
(async function () {
  const w = await MF.ManifoldModule({ wasmBinary: Buffer.from(MF.B64, 'base64') });
  w.setup();
  const toM = function (m) { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(m.positions), triVerts: new Uint32Array(m.indices) }); mesh.merge(); return new w.Manifold(mesh); };
  const fromM = function (s) { const o = s.getMesh(), n = o.numProp, V = o.vertProperties, nv = V.length / n, P = new Float32Array(3 * nv); for (let i = 0; i < nv; i++) { P[3 * i] = V[n * i]; P[3 * i + 1] = V[n * i + 1]; P[3 * i + 2] = V[n * i + 2]; } return { positions: P, indices: new Uint32Array(o.triVerts) }; };
  const box = core.extrudeSolid([{ loops: [[[0, 0], [40, 0], [40, 30], [0, 30]]] }], F, { z0: 0, z1: 10 });
  const f = core.features(box);
  // the 4 top edges: between the top plane (+z) and a side
  const topReg = f.regions.findIndex(function (r) { return r.type === 'plane' && r.n[2] > 0.99; });
  const tops = f.chains.filter(function (c) { return c.r1 === topReg || c.r2 === topReg; }).map(function (c) { return { vs: c.vs, r1: topReg }; });
  ok('box has 4 top edges and 12 edges in all', tops.length === 4 && f.chains.length === 12, tops.length + ' / ' + f.chains.length);
  let t = core.edgeTool(box, f.reg, tops, 2, 'fillet');
  ok('fillet tool for convex edges only', t && t.conv.length === 4 && !t.conc.length && t.conv.every(closed));
  const uni = function (l) { return w.Manifold.union(l.map(toM)); };
  let r = fromM(toM(box).subtract(uni(t.conv)));
  // exact: removed per unit length = R^2 (1 - pi/4) along the 140 mm of edges, minus the corner overlaps (small)
  const expect = 12000 - 140 * 4 * (1 - Math.PI / 4);
  ok('fillet R2 on the top edges removes about R²(1-π/4) per mm', closed(r) && Math.abs(vol(r) - expect) < 3, vol(r).toFixed(2) + ' vs ' + expect.toFixed(2));
  t = core.edgeTool(box, f.reg, tops.slice(0, 1), 3, 'chamfer');
  r = fromM(toM(box).subtract(uni(t.conv)));
  const len0 = Math.hypot.apply(null, [0, 1, 2].map(function (k) { return box.positions[3 * tops[0].vs[0] + k] - box.positions[3 * tops[0].vs[tops[0].vs.length - 1] + k]; }));
  ok('chamfer 3 on one edge removes 4.5 mm² per mm', closed(r) && Math.abs(12000 - vol(r) - 4.5 * len0) < 0.05, (12000 - vol(r)).toFixed(3) + ' vs ' + (4.5 * len0).toFixed(3));
  // a concave edge: an L shape, fillet on the inner corner adds material
  const L = core.extrudeSolid([{ loops: [[[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]]] }], F, { z0: 0, z1: 20 });
  const fl = core.features(L);
  const inner = fl.chains.filter(function (c) { return c.type === 'line' && Math.abs(c.dir[2]) > 0.99 && Math.abs(c.pts[0][0] - 10) < 1e-6 && Math.abs(c.pts[0][1] - 10) < 1e-6; });
  ok('L shape: found the inner vertical edge', inner.length === 1);
  t = core.edgeTool(L, fl.reg, inner.map(function (c) { return { vs: c.vs, r1: c.r1 }; }), 4, 'fillet');
  ok('inner edge gives a concave (add) tool', t && t.conc.length === 1 && !t.conv.length);
  r = fromM(toM(L).add(uni(t.conc)));
  ok('concave fillet R4 adds R²(1-π/4)·h', closed(r) && Math.abs(vol(r) - vol(L) - 16 * (1 - Math.PI / 4) * 20) < 0.35, (vol(r) - vol(L)).toFixed(3) + ' vs ' + (16 * (1 - Math.PI / 4) * 20).toFixed(3));
  // hole edge (circle) fillet on a plate with a hole
  const circ = []; for (let i = 0; i < 48; i++) { const a = -2 * Math.PI * i / 48; circ.push([20 + 6 * Math.cos(a), 15 + 6 * Math.sin(a)]); }
  const plate = core.extrudeSolid([{ loops: [[[0, 0], [40, 0], [40, 30], [0, 30]], circ] }], F, { z0: 0, z1: 8 });
  const fp = core.features(plate), holeTop = fp.chains.filter(function (c) { return c.closed && c.pts[0][2] > 7.99; });
  ok('plate: the top rim of the hole is one closed edge', holeTop.length === 1);
  t = core.edgeTool(plate, fp.reg, holeTop.map(function (c) { return { vs: c.vs, r1: c.r1 }; }), 1.5, 'chamfer');
  r = fromM(toM(plate).subtract(uni(t.conv)));
  ok('hole rim chamfer removes ~ 1.125·2π·(6+0.5)', closed(r) && Math.abs(vol(plate) - vol(r) - 1.125 * 2 * Math.PI * 6.5) < 1.2, (vol(plate) - vol(r)).toFixed(2) + ' vs ' + (1.125 * 2 * Math.PI * 6.5).toFixed(2));
  // move face: top of the box up by 5 = union of a prism from the face
  const topTris = []; for (let i = 0; i < f.reg.length; i++) if (f.reg[i] === topReg) topTris.push(i);
  const pr = core.facePrism(box, topTris, [0, 0, 1], -0.01, 5);
  ok('face prism is closed, 40×30×5.01', closed(pr) && Math.abs(vol(pr) - 1200 * 5.01) < 1e-2, vol(pr).toFixed(3));
  r = fromM(toM(box).add(toM(pr)));
  ok('move face +5: volume 18000', Math.abs(vol(r) - 18000) < 0.05, vol(r).toFixed(3));
  // tilt the face (draft-like) with a trimmed prism
  const big = toM(core.facePrism(box, topTris, [0, 0, 1], -0.01, 100)), nT = [0, Math.sin(0.1), Math.cos(0.1)], dT = 10 * Math.cos(0.1) + 15 * Math.sin(0.1);
  const add = big.trimByPlane([-nT[0], -nT[1], -nT[2]], -dT), cutP = toM(core.facePrism(box, topTris, [0, 0, 1], 0.01, -100)).trimByPlane(nT, dT);
  r = fromM(toM(box).add(add).subtract(cutP));
  ok('face tilted about its centre line keeps the volume', closed(r) && Math.abs(vol(r) - 12000) < 0.5, vol(r).toFixed(3));
  // the same by moving vertices: move up 5, tilt by 0.1 rad about the centre line
  let mvv = core.replaceFaceVerts(box, f, [topReg], [0, 0, 1], 15);
  ok('vertex move face +5: volume 18000', closed(mvv) && Math.abs(vol(mvv) - 18000) < 1e-3, vol(mvv).toFixed(3));
  mvv = core.replaceFaceVerts(box, f, [topReg], nT, dT);
  ok('vertex tilt keeps the volume and stays a valid solid', Math.abs(vol(mvv) - 12000) < 1e-2 && Math.abs(vol(fromM(toM(mvv))) - 12000) < 1e-2, vol(mvv).toFixed(3));
  // a filleted box: moving the top face takes the rounds along
  const fb = fromM(toM(box).subtract(uni(core.edgeTool(box, f.reg, tops, 2, 'fillet').conv)));
  const ff = core.features(fb), tr2 = ff.regions.findIndex(function (r) { return r.type === 'plane' && r.n[2] > 0.99; });
  mvv = core.replaceFaceVerts(fb, ff, [tr2], [0, 0, 1], 14);
  ok('filleted box: top moved up 4 with its rounds', Math.abs(vol(mvv) - vol(fb) - 4 * 1200) < 0.5 && Math.abs(vol(fromM(toM(mvv))) - vol(mvv)) < 1e-2, (vol(mvv) - vol(fb)).toFixed(3));
  let thrown = false; try { core.replaceFaceVerts(box, f, [topReg], [0, 0, 1], -5); } catch (e) { thrown = true; }
  ok('moving a face through the part is refused', thrown);
  // shell: box open at the top, wall 2
  const open = new Set(topTris), sh = core.shellMesh(box, open, 2);
  ok('shell box: closed, volume 12000 - 36·26·8', closed(sh) && Math.abs(vol(sh) - (12000 - 36 * 26 * 8)) < 0.05, vol(sh).toFixed(3));
  const shM = fromM(toM(sh));
  ok('shell result is accepted by Manifold', Math.abs(vol(shM) - vol(sh)) < 1e-3, vol(shM).toFixed(3));
  const sh2 = core.shellMesh(box, new Set(), 2);
  ok('shell with no opening: hollow inside', closed(sh2) && Math.abs(vol(sh2) - (12000 - 36 * 26 * 6)) < 0.05, vol(sh2).toFixed(3));
  // cylindrical face move: hole radius 6 → 7
  const holeReg = fp.regions.findIndex(function (q) { return q.type === 'cyl'; });
  const ht = []; for (let i = 0; i < fp.reg.length; i++) if (fp.reg[i] === holeReg) ht.push(i);
  const mv = core.moveCylFace(plate, ht, fp.regions[holeReg].axis, fp.regions[holeReg].c, 1);
  ok('hole made bigger by moving its face 1 mm', closed(mv) && vol(mv) < vol(plate) - 300, (vol(plate) - vol(mv)).toFixed(2));
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
