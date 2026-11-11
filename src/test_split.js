// Tests for the advanced split (core.splitAdv). Run: node src/test_split.js  (after python3 src/build.py)
const fs = require('fs'), path = require('path');
const core = (new Function(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + ';return MeshCore();'))();
let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : '')); if (!cond) fails++; }

function box(x0, y0, z0, x1, y1, z1, flipDiag) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [flipDiag ? [0, 3, 1] : [0, 2, 1], flipDiag ? [1, 3, 2] : [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  const a = [];
  for (const t of f) for (const i of t) a.push(...v[i]);
  return a;
}
const mk = function (a) { return core.weld(new Float32Array(a), null); };
// surface of a set of unit voxels, as one welded mesh
function voxels(filled, scale) {
  const key = function (x, y, z) { return x + ',' + y + ',' + z; }, set = new Set(filled.map(function (c) { return key(c[0], c[1], c[2]); }));
  const s = scale || 1, a = [];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const c of filled) for (const d of dirs) {
    if (set.has(key(c[0] + d[0], c[1] + d[1], c[2] + d[2]))) continue;
    // face of the voxel on side d, counter-clockwise seen from outside
    const ax = d[0] ? 0 : d[1] ? 1 : 2, u = (ax + 1) % 3, w = (ax + 2) % 3, sgn = d[ax];
    const base = c.slice(); if (sgn > 0) base[ax] += 1;
    const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(function (p) { const r = base.slice(); r[u] += p[0]; r[w] += p[1]; return r.map(function (x) { return x * s; }); });
    const order = sgn > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) a.push(...q[i]);
  }
  return mk(a);
}
function range3(x0, x1, y0, y1, z0, z1) { const r = []; for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) r.push([x, y, z]); return r; }
// revolve a profile [[r, z], ...] (bottom to top) around z; outward normals
function revolve(prof, seg) {
  const a = [];
  for (let i = 0; i + 1 < prof.length; i++) for (let k = 0; k < seg; k++) {
    const t0 = k, t1 = (k + 1) % seg;
    const p = function (j, kk) { const t = 2 * Math.PI * kk / seg; return [prof[j][0] * Math.cos(t), prof[j][0] * Math.sin(t), prof[j][1]]; };
    const A = p(i, t0), B = p(i, t1), C = p(i + 1, t1), D = p(i + 1, t0);
    if (prof[i][0] > 0) a.push(...A, ...B, ...C);
    if (prof[i + 1][0] > 0) a.push(...A, ...C, ...D);
  }
  return mk(a);
}
const run = function (m, mode, angle, extra) { return core.splitAdv(m, Object.assign({ mode: mode, angle: angle, minTris: 1, keepSmall: true }, extra || {})); };
const n = function (m, mode, angle, extra) { return run(m, mode, angle, extra).bodies.length; };
const closed = function (b) { const t = core.topology(b.indices, b.positions.length / 3); return t.border === 0 && t.nonManifold === 0; };
const tris = function (r) { return r.bodies.map(function (b) { return b.indices.length / 3; }).join('+'); };
const total = function (r) { return r.bodies.reduce(function (s, b) { return s + b.indices.length / 3; }, 0); };

// ---- 1. connectivity ladder ----
let m = mk([...box(0, 0, 0, 1, 1, 1), ...box(3, 0, 0, 4, 1, 1)]);
ok('apart: vertex 2', n(m, 'vertex') === 2); ok('apart: same as old split', core.split(m, { minTris: 1 }).bodies.length === 2);
m = mk([...box(0, 0, 0, 1, 1, 1), ...box(1, 1, 1, 2, 2, 2)]);
ok('corner touch: vertex 1 / edge 2 / shell 2', n(m, 'vertex') === 1 && n(m, 'edge') === 2 && n(m, 'shell') === 2);
m = mk([...box(0, 0, 0, 1, 1, 1), ...box(1, 1, 0, 2, 2, 1)]);
let r = run(m, 'shell');
ok('edge touch: vertex 1 / edge 1 / shell 2', n(m, 'vertex') === 1 && n(m, 'edge') === 1 && r.bodies.length === 2, tris(r));
ok('edge touch: both pieces closed, 12 tris', r.bodies.every(function (b) { return closed(b) && b.indices.length === 36; }));
for (const flip of [false, true]) {
  m = mk([...box(0, 0, 0, 1, 1, 1), ...box(0, 0, 1, 1, 1, 2, flip)]);
  r = run(m, 'shell');
  ok('stacked, same face' + (flip ? ' (other diagonal)' : '') + ': vertex 1 / edge 1 / shell 2', n(m, 'vertex') === 1 && n(m, 'edge') === 1 && r.bodies.length === 2, tris(r));
  ok('  pieces closed with 12 tris each', r.bodies.every(function (b) { return closed(b) && b.indices.length === 36; }));
  const z = r.bodies.map(function (b) { let lo = 1e9, hi = -1e9; for (let i = 2; i < b.positions.length; i += 3) { lo = Math.min(lo, b.positions[i]); hi = Math.max(hi, b.positions[i]); } return lo + '..' + hi; }).sort().join(' ');
  ok('  pieces are the two boxes', z === '0..1 1..2', z);
}
// 3 boxes in a row, face to face
m = mk([...box(0, 0, 0, 1, 1, 1), ...box(1, 0, 0, 2, 1, 1), ...box(2, 0, 0, 3, 1, 1)]);
r = run(m, 'shell'); ok('3 boxes face to face: shell 3, all closed', r.bodies.length === 3 && r.bodies.every(closed), tris(r));
// one voxel surface where two cubes meet on an edge / at a corner
m = voxels([[0, 0, 0], [1, 1, 0]]); r = run(m, 'shell');
ok('voxel cubes on an edge: edge 1 / shell 2 closed', n(m, 'edge') === 1 && r.bodies.length === 2 && r.bodies.every(closed), tris(r));
m = voxels([[0, 0, 0], [1, 1, 1]]);
ok('voxel cubes on a corner: vertex 1 / edge 2', n(m, 'vertex') === 1 && n(m, 'edge') === 2);
// nothing lost
m = mk([...box(0, 0, 0, 1, 1, 1), ...box(0, 0, 1, 1, 1, 2), ...box(1, 1, 2, 2, 2, 3), ...box(5, 5, 5, 6, 6, 6)]);
for (const md of ['vertex', 'edge', 'shell']) { r = run(m, md); ok('no triangle lost (' + md + ')', total(r) === m.indices.length / 3, r.bodies.length + ' bodies'); }
ok('mixed: vertex 2 / edge 3 / shell 4', n(m, 'vertex') === 2 && n(m, 'edge') === 3 && n(m, 'shell') === 4);

// random piles of bricks that touch on faces, edges and corners, every face finely tessellated so that many
// vertices and edges coincide: 'shell' must give back exactly the bricks
(function () {
  let seed = 12345; const rnd = function (k) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
  for (let trial = 0; trial < 40; trial++) {
    const G = 6, occ = new Set(), bricks = [];
    for (let k = 0; k < 14; k++) {
      const x0 = rnd(G), y0 = rnd(G), z0 = rnd(G), x1 = Math.min(G, x0 + 1 + rnd(3)), y1 = Math.min(G, y0 + 1 + rnd(3)), z1 = Math.min(G, z0 + 1 + rnd(3));
      const cells = range3(x0, x1, y0, y1, z0, z1);
      if (cells.some(function (c) { return occ.has(c.join()); })) continue;
      cells.forEach(function (c) { occ.add(c.join()); }); bricks.push(cells);
    }
    const parts = bricks.map(function (c) { return voxels(c); });
    let nv = 0, ni = 0; for (const q of parts) { nv += q.positions.length; ni += q.indices.length; }
    const P = new Float32Array(nv), I = new Uint32Array(ni); let vo = 0, io = 0;
    for (const q of parts) { P.set(q.positions, vo); for (let k = 0; k < q.indices.length; k++) I[io + k] = q.indices[k] + vo / 3; vo += q.positions.length; io += q.indices.length; }
    const all = core.weld(P, I);
    if (trial % 2) {                                     // tilt the pile so nothing is axis-aligned any more
      const a = 0.3 + trial * 0.07, b = 0.5 + trial * 0.05, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), Q = all.positions;
      for (let i = 0; i < Q.length; i += 3) { const x = Q[i] * 7.3, y = Q[i + 1] * 7.3, z = Q[i + 2] * 7.3; const x2 = ca * x - sa * y, y2 = sa * x + ca * y; Q[i] = cb * x2 + sb * z + 113.7; Q[i + 1] = y2 - 58.2; Q[i + 2] = -sb * x2 + cb * z + 31.9; }
    }
    const res = run(all, 'shell');
    const want = parts.map(function (q) { return q.indices.length / 3; }).sort(function (a, b) { return a - b; }).join();
    const got = res.bodies.map(function (q) { return q.indices.length / 3; }).sort(function (a, b) { return a - b; }).join();
    const vols = res.bodies.every(function (q) { return closed(q) && core.stats(q.positions, q.indices).volume > 0.5; });
    if (want !== got || !vols || trial === 0) ok('random brick pile ' + trial + ': shell gives the ' + parts.length + ' bricks, all closed (vertex gives ' + n(all, 'vertex') + ', edge ' + n(all, 'edge') + ')', want === got && vols, want === got ? '' : want + ' vs ' + got);
  }
  ok('40 random brick piles done', true);
})();

// ---- 2. fused parts: concave creases ----
const plate = range3(0, 6, 0, 6, 0, 2);
m = voxels(plate.concat(range3(2, 4, 2, 4, 2, 4)));          // plate with a boss
ok('boss: shell 1', n(m, 'shell') === 1);
r = run(m, 'concave', 70); ok('boss: concave 70 -> 2 (base + boss)', r.bodies.length === 2, tris(r));
ok('boss piece = 5 faces x 4 quads', r.bodies[1].indices.length / 3 === 5 * 4 * 2, r.bodies[1].indices.length / 3);
m = voxels(plate.concat(range3(2, 4, 2, 4, 2, 4)).filter(function (c) { return !(c[2] === 1 && c[0] >= 4 && c[0] < 5 && c[1] >= 4 && c[1] < 5); }));   // boss + blind pocket
r = run(m, 'concave', 70); ok('boss + pocket: pocket floor goes back -> 2', r.bodies.length === 2, tris(r) + ' merged ' + r.merged);
m = voxels(plate.filter(function (c) { return !(c[2] === 1 && c[0] >= 2 && c[0] < 4 && c[1] >= 2 && c[1] < 4); }));   // pocket only
r = run(m, 'concave', 70); ok('pocket only: stays 1', r.bodies.length === 1, tris(r) + ' merged ' + r.merged);
m = voxels(range3(0, 6, 0, 6, 0, 1).concat(range3(0, 6, 0, 6, 1, 3).filter(function (c) { return c[0] === 0 || c[0] === 5 || c[1] === 0 || c[1] === 5; })));   // tray
r = run(m, 'concave', 70); ok('tray: stays 1', r.bodies.length === 1, tris(r));
m = voxels(range3(0, 6, 0, 2, 0, 2).concat(range3(0, 2, 0, 2, 2, 6)));   // L bracket
r = run(m, 'concave', 70); ok('L bracket: stays 1', r.bodies.length === 1, tris(r));
m = voxels(plate.concat(range3(1, 2, 1, 2, 2, 5), range3(4, 5, 4, 5, 2, 3)));   // two bosses
r = run(m, 'concave', 70); ok('two bosses: 3', r.bodies.length === 3, tris(r));
r = run(m, 'crease', 60); ok('two bosses: crease 60 -> flat faces', r.bodies.length === 6 + 5 + 5 - 0 && total(r) === m.indices.length / 3, r.bodies.length + ' bodies');
// inside-out mesh: concave must still find the boss
m = voxels(plate.concat(range3(2, 4, 2, 4, 2, 4)));
const inv = { positions: m.positions, indices: m.indices.slice() };
for (let t = 0; t < inv.indices.length; t += 3) { const x = inv.indices[t + 1]; inv.indices[t + 1] = inv.indices[t + 2]; inv.indices[t + 2] = x; }
r = run(inv, 'concave', 70); ok('inside-out boss: still 2', r.bodies.length === 2, tris(r));
// ball on a post (smooth surfaces, one concave seam)
const ball = []; for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + 0.45 + (Math.PI - 0.45) * i / 24; ball.push([10 * Math.cos(a), 30 + 10 * Math.sin(a)]); }
ball[ball.length - 1][0] = 0;
m = revolve([[0, 0], [4.35, 0], [4.35, 30 + 10 * Math.sin(-Math.PI / 2 + 0.45)]].concat(ball.slice(1)), 48);
ok('ball on post: closed mesh', closed(m), JSON.stringify(core.topology(m.indices, m.positions.length / 3)));
ok('ball on post: shell 1', n(m, 'shell') === 1);
r = run(m, 'concave', 50); ok('ball on post: concave 50 -> 2', r.bodies.length === 2, tris(r));
r = run(m, 'concave', 22); ok('ball on post: concave 22 -> still 2 (smooth surfaces not cut)', r.bodies.length === 2, tris(r));
r = run(m, 'crease', 60); ok('ball on post: crease 60 -> 3 (base disc, post+..., ball)', r.bodies.length === 3, tris(r));
// sliver (zero-area) triangles lying on the seam must not glue the two sides together
(function () {
  const g = voxels(plate.concat(range3(2, 4, 2, 4, 2, 4)));
  const P = Array.from(g.positions), I = Array.from(g.indices);
  // split one seam edge (2,2,2)-(3,2,2) by inserting its midpoint and a zero-area triangle on one side
  const vid = function (x, y, z) { for (let i = 0; i < P.length; i += 3) if (P[i] === x && P[i + 1] === y && P[i + 2] === z) return i / 3; return -1; };
  const a = vid(2, 2, 2), b = vid(3, 2, 2), mid = P.length / 3; P.push(2.5, 2, 2);
  // T keeps the long edge u -> w; the sliver (w, u, mid) sits on it; the triangle on the far side (w -> u) is cut at mid
  let u = -1, w = -1;
  for (let t = 0; t < I.length && u < 0; t += 3) for (let c = 0; c < 3; c++) {
    const x = I[t + c], y = I[t + (c + 1) % 3];
    if ((x === a && y === b) || (x === b && y === a)) { u = x; w = y; break; }
  }
  const nT = I.length;
  for (let t = 0; t < nT; t += 3) for (let c = 0; c < 3; c++) {
    if (I[t + c] === w && I[t + (c + 1) % 3] === u) { const o = I[t + (c + 2) % 3]; I[t] = w; I[t + 1] = mid; I[t + 2] = o; I.push(mid, u, o); t = nT; break; }
  }
  I.push(w, u, mid);
  const sm = { positions: new Float32Array(P), indices: new Uint32Array(I) };
  const tp = core.topology(sm.indices, sm.positions.length / 3);
  const rr = run(sm, 'concave', 70);
  ok('sliver on the seam: mesh still closed, concave 70 -> 2', tp.border === 0 && rr.bodies.length === 2, JSON.stringify(tp) + ' ' + tris(rr));
})();
// small options
m = mk([...box(0, 0, 0, 1, 1, 1), ...box(0, 0, 1, 1, 1, 2), ...box(5, 5, 5, 6, 6, 6)]);
r = run(m, 'shell', 0, { minTris: 13, keepSmall: false }); ok('minTris drops nothing when all have 12? (13 -> all dropped)', r.bodies.length === 0 && r.smallComponents === 3);
r = run(m, 'shell', 0, { minTris: 13, keepSmall: true }); ok('keepSmall groups them', r.bodies.length === 1 && r.bodies[0].small === true);

// ---- 3. speed ----
function sphere(sub, rad) {
  const t = (1 + Math.sqrt(5)) / 2; let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) { const mp = new Map(), F2 = []; const mid = function (a, b) { const k = a < b ? a + '_' + b : b + '_' + a; if (!mp.has(k)) { mp.set(k, V.length); V.push([0, 1, 2].map(function (i) { return (V[a][i] + V[b][i]) / 2; })); } return mp.get(k); }; for (const f of F) { const ab = mid(f[0], f[1]), bc = mid(f[1], f[2]), ca = mid(f[2], f[0]); F2.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]); } F = F2; }
  const P = new Float32Array(V.length * 3); V.forEach(function (v, i) { const l = Math.hypot(v[0], v[1], v[2]); P[3 * i] = v[0] / l * rad; P[3 * i + 1] = v[1] / l * rad; P[3 * i + 2] = v[2] / l * rad; });
  return { positions: P, indices: new Uint32Array(F.flat()) };
}
const big = sphere(8, 50);
for (const md of [['vertex'], ['edge'], ['shell'], ['concave', 22], ['crease', 20]]) {
  const t0 = Date.now(); r = run(big, md[0], md[1]);
  ok('smooth sphere ' + big.indices.length / 3 + ' tris, ' + md.join(' ') + ': 1 body', r.bodies.length === 1, (Date.now() - t0) + ' ms');
}
// noisy scan-like sphere: must not shatter
const noisy = sphere(6, 50); { let seed = 7; const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; for (let i = 0; i < noisy.positions.length; i += 3) { const k = 1 + (rnd() - 0.5) * 0.012; noisy.positions[i] *= k; noisy.positions[i + 1] *= k; noisy.positions[i + 2] *= k; } }
for (const md of [['concave', 70], ['concave', 35], ['concave', 22], ['crease', 35], ['crease', 20]]) {
  const t0 = Date.now(); r = run(noisy, md[0], md[1]);
  console.log('     noisy sphere ' + noisy.indices.length / 3 + ' tris, ' + md.join(' ') + ': ' + r.bodies.length + ' bodies, cuts ' + r.cuts + ', merged ' + r.merged + ', ' + (Date.now() - t0) + ' ms');
}
r = run(noisy, 'crease', 20, { maxParts: 200 }); ok('noisy sphere, crease 20 capped at 200 pieces, nothing lost', r.bodies.length <= 200 && r.capped === true && total(r) === noisy.indices.length / 3, r.bodies.length + ' bodies');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
