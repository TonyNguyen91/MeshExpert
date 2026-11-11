// Tests for hole filling and feature recognition. Run: node src/test_repair.js (after python3 src/build.py)
const fs = require('fs'), path = require('path');
const core = (new Function(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + ';return MeshCore();'))();
let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : '')); if (!cond) fails++; }
function sphere(sub, rad) {
  const t = (1 + Math.sqrt(5)) / 2; let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) { const mp = new Map(), F2 = []; const mid = function (a, b) { const k = a < b ? a + '_' + b : b + '_' + a; if (!mp.has(k)) { mp.set(k, V.length); V.push([0, 1, 2].map(function (i) { return (V[a][i] + V[b][i]) / 2; })); } return mp.get(k); }; for (const f of F) { const ab = mid(f[0], f[1]), bc = mid(f[1], f[2]), ca = mid(f[2], f[0]); F2.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]); } F = F2; }
  const P = new Float32Array(V.length * 3); V.forEach(function (v, i) { const l = Math.hypot(v[0], v[1], v[2]); P[3 * i] = v[0] / l * rad; P[3 * i + 1] = v[1] / l * rad; P[3 * i + 2] = v[2] / l * rad; });
  return { positions: P, indices: new Uint32Array(F.flat()) };
}
function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  const a = []; for (const t of f) for (const i of t) a.push(...v[i]); return a;
}
const mk = function (a) { return core.weld(new Float32Array(a), null); };
const closed = function (m) { const t = core.topology(m.indices, m.positions.length / 3); return t.border === 0 && t.nonManifold === 0; };
const cut = function (m, keep) { const I = []; for (let t = 0; t < m.indices.length; t += 3) { const c = [0, 1, 2].map(function (k) { let s = 0; for (let j = 0; j < 3; j++) s += m.positions[3 * m.indices[t + j] + k]; return s / 3; }); if (keep(c)) I.push(m.indices[t], m.indices[t + 1], m.indices[t + 2]); } return core.weld(m.positions, new Uint32Array(I)); };

// ---- holes ----
const S = sphere(4, 50), vol = 4 / 3 * Math.PI * 125000;
let m = cut(S, function (c) { return c[2] < 40; });
let L = core.borderLoops(m.positions, m.indices);
ok('sphere with the cap cut off: 1 border loop', L.loops.length === 1 && L.edges === L.loops[0].length, L.loops.length + ' loops, ' + L.edges + ' edges');
for (const lv of [1, 2, 3]) {
  const t0 = Date.now(), r = core.fillHoles(m, { level: lv }), st = core.stats(r.positions, r.indices);
  let dev = 0; for (let v = m.positions.length / 3; v < r.positions.length / 3; v++) dev = Math.max(dev, Math.abs(Math.hypot(r.positions[3 * v], r.positions[3 * v + 1], r.positions[3 * v + 2]) - 50));
  ok('fill level ' + lv + ': closed, outward', closed(r) && r.filled === 1 && st.solid, 'added ' + r.added + ' tris, volume ' + (st.volume / vol * 100).toFixed(2) + '% of the full sphere, new vertices off the sphere by up to ' + dev.toFixed(3) + ' mm, ' + (Date.now() - t0) + ' ms');
  if (lv === 3) ok('level 3 rebuilds most of the missing cap (flat patch is 9.5 mm off)', dev < 3.0 && st.volume / vol > 0.99, dev.toFixed(3));
  if (lv === 1) ok('level 1 is the flat cut', st.volume / vol < 0.99);
}
// several holes, size limit
m = cut(S, function (c) { return c[2] < 45 && c[0] < 47 && c[1] > -30; });
L = core.borderLoops(m.positions, m.indices);
let r = core.fillHoles(m, { level: 2 });
ok('3 holes: all filled', L.loops.length === 3 && r.filled === 3 && closed(r), L.loops.map(function (l) { return l.length; }).join());
r = core.fillHoles(m, { level: 1, maxPerimeter: 200 });
ok('perimeter limit leaves the big hole open', r.filled === 2 && r.skipped === 1 && !closed(r), 'filled ' + r.filled);
// concave (L-shaped) flat hole in a box face
(function () {
  const a = box(0, 0, 0, 30, 30, 10), g = mk(a);
  // rebuild the top face as a grid with an L-shaped opening
  const I = []; for (let t = 0; t < g.indices.length; t += 3) { let top = true; for (let k = 0; k < 3; k++) if (g.positions[3 * g.indices[t + k] + 2] !== 10) top = false; if (!top) I.push(g.indices[t], g.indices[t + 1], g.indices[t + 2]); }
  const base = core.weld(g.positions, new Uint32Array(I)), extra = [];
  const hole = function (i, j) { return (i >= 2 && i < 4 && j >= 1 && j < 5) || (i >= 4 && i < 5 && j >= 1 && j < 2); };
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (!hole(i, j)) { const x = i * 5, y = j * 5; extra.push(x, y, 10, x + 5, y, 10, x + 5, y + 5, 10, x, y, 10, x + 5, y + 5, 10, x, y + 5, 10); }
  const all = new Float32Array(base.indices.length * 3 + extra.length); let o = 0;
  for (let k = 0; k < base.indices.length; k++) { const v = base.indices[k]; all[o++] = base.positions[3 * v]; all[o++] = base.positions[3 * v + 1]; all[o++] = base.positions[3 * v + 2]; }
  all.set(extra, o);
  const mm = core.weld(all, null), loops = core.borderLoops(mm.positions, mm.indices).loops;
  // the box sides meet the gridded top at T-junctions, so only look at the L hole (the 14-edge loop)
  const li = loops.findIndex(function (l) { return l.length === 14; });
  const rr = core.fillHoles(mm, { level: 2, only: [li] }), st0 = core.stats(mm.positions, mm.indices), st1 = core.stats(rr.positions, rr.indices);
  let zmax = 0; for (let v = mm.positions.length / 3; v < rr.positions.length / 3; v++) zmax = Math.max(zmax, Math.abs(rr.positions[3 * v + 2] - 10));
  ok('concave L hole: patch area equals the hole (no overlap), stays flat', li >= 0 && Math.abs(st1.area - st0.area - 225) < 1e-3 && zmax < 1e-6, 'area +' + (st1.area - st0.area).toFixed(3) + ' (hole 225)');
})();
// crack: two halves that were never joined
(function () {
  const a = cut(S, function (c) { return c[2] < 0; }), b = cut(S, function (c) { return c[2] >= 0; });
  const P = new Float32Array(a.positions.length + b.positions.length), I = new Uint32Array(a.indices.length + b.indices.length);
  P.set(a.positions); for (let i = 0; i < b.positions.length; i += 3) { P[a.positions.length + i] = b.positions[i] + 0.003; P[a.positions.length + i + 1] = b.positions[i + 1]; P[a.positions.length + i + 2] = b.positions[i + 2] + 0.004; }
  I.set(a.indices); for (let i = 0; i < b.indices.length; i++) I[a.indices.length + i] = b.indices[i] + a.positions.length / 3;
  const mm = { positions: P, indices: I }, rr = core.fillHoles(mm, { level: 1, stitch: 0.02 });
  ok('crack between two halves: stitched shut, nothing left to fill', !closed(mm) && closed(rr) && rr.stitched > 0 && rr.filled === 0, 'merged ' + rr.stitched + ' vertices');
})();

// ---- features ----
function revolve(prof, seg) {
  const a = [];
  for (let i = 0; i + 1 < prof.length; i++) for (let k = 0; k < seg; k++) {
    const p = function (j, kk) { const t = 2 * Math.PI * (kk % seg) / seg; return [prof[j][0] * Math.cos(t), prof[j][0] * Math.sin(t), prof[j][1]]; };
    const A = p(i, k), B = p(i, k + 1), C = p(i + 1, k + 1), D = p(i + 1, k);
    if (prof[i][0] > 0) a.push(...A, ...B, ...C);
    if (prof[i + 1][0] > 0) a.push(...A, ...C, ...D);
  }
  return mk(a);
}
let F = core.features(mk(box(0, 0, 0, 30, 20, 10)));
const count = function (F, ty) { return F.regions.filter(function (r) { return r.type === ty; }).length; }, cc = function (F, ty) { return F.chains.filter(function (c) { return c.type === ty; }).length; };
ok('box: 6 planes, 12 straight edges, 8 corners', count(F, 'plane') === 6 && F.chains.length === 12 && cc(F, 'line') === 12 && F.corners === 8, JSON.stringify([count(F, 'plane'), F.chains.length, F.corners]));
ok('box: edge lengths', F.chains.map(function (c) { return Math.round(c.len); }).sort(function (a, b) { return a - b; }).join() === '10,10,10,10,20,20,20,20,30,30,30,30');
m = revolve([[0, 0], [8, 0], [8, 25], [0, 25]], 48);
F = core.features(m);
const cy = F.regions.find(function (r) { return r.type === 'cyl'; });
ok('cylinder: 2 planes + 1 cylinder R8 h25, axis z', count(F, 'plane') === 2 && count(F, 'cyl') === 1 && Math.abs(cy.r - 8) < 0.02 && Math.abs(cy.h - 25) < 1e-3 && Math.abs(Math.abs(cy.axis[2]) - 1) < 1e-6, cy ? cy.r.toFixed(4) : 'none');
ok('cylinder: 2 circular edges R8', F.chains.length === 2 && F.chains.every(function (c) { return c.type === 'arc' && c.closed && Math.abs(c.r - 8) < 1e-3; }), F.chains.map(function (c) { return c.type + ' ' + (c.r || 0).toFixed(3); }).join());
F = core.features(sphere(3, 12));
ok('sphere: 1 sphere R12, no planes', count(F, 'sphere') === 1 && count(F, 'plane') === 0 && Math.abs(F.regions.find(function (r) { return r.type === 'sphere'; }).r - 12) < 0.01);
// block with a rounded (fillet R5) edge: the fillet is a cylinder, the faces next to it stay planes
(function () {
  const a = [], n = 10, quad = function (p, q, r, s) { a.push(...p, ...q, ...r, ...p, ...r, ...s); };
  // cross-section in x-z (counter-clockwise seen from -y), extruded along y from 0 to 40
  const sec = [[0, 0], [30, 0], [30, 15]];
  for (let k = 0; k <= n; k++) { const t = Math.PI / 2 * k / n; sec.push([25 + 5 * Math.sin(Math.PI / 2 - t) * 0 + 5 * Math.cos(t) - 5 + 5, 15 + 5 * Math.sin(t)]); }
  sec[3] = [30, 15]; sec.push([0, 20]);
  const pts = []; for (const s of sec) if (!pts.length || Math.hypot(s[0] - pts[pts.length - 1][0], s[1] - pts[pts.length - 1][1]) > 1e-9) pts.push(s);
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], 40, q[1]], [p[0], 40, p[1]]); }
  for (let i = 1; i + 1 < pts.length; i++) { a.push(pts[0][0], 0, pts[0][1], pts[i + 1][0], 0, pts[i + 1][1], pts[i][0], 0, pts[i][1]); a.push(pts[0][0], 40, pts[0][1], pts[i][0], 40, pts[i][1], pts[i + 1][0], 40, pts[i + 1][1]); }
  const g = mk(a), Fg = core.features(g), c = Fg.regions.find(function (r) { return r.type === 'cyl'; });
  ok('filleted block: closed test mesh', closed(g));
  ok('filleted block: 6 planes + fillet found as cylinder R5 along y', count(Fg, 'plane') === 6 && count(Fg, 'cyl') === 1 && c && Math.abs(c.r - 5) < 0.02 && Math.abs(Math.abs(c.axis[1]) - 1) < 1e-6, JSON.stringify([count(Fg, 'plane'), count(Fg, 'cyl'), count(Fg, 'free'), c && c.r]));
  ok('filleted block: the two fillet end edges are arcs R5', Fg.chains.filter(function (ch) { return ch.type === 'arc' && Math.abs(ch.r - 5) < 0.01; }).length === 2, Fg.chains.map(function (ch) { return ch.type; }).join());
})();
// scan-like noise: nothing recognised, nothing crashes, time
const big = sphere(8, 50); { let seed = 7; const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; for (let i = 0; i < big.positions.length; i += 3) { const k = 1 + (rnd() - 0.5) * 0.004; big.positions[i] *= k; big.positions[i + 1] *= k; big.positions[i + 2] *= k; } }
let t0 = Date.now(); F = core.features(big);
ok('noisy sphere, ' + big.indices.length / 3 + ' tris: no false planes', count(F, 'plane') === 0, F.regions.length + ' regions, ' + F.chains.length + ' edges, ' + (Date.now() - t0) + ' ms');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
