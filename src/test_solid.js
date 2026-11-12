// Tests for profile solids (extrude / revolve) and mesh booleans. Run: node src/test_solid.js (after python3 src/build.py)
const fs = require('fs'), path = require('path');
const core = (new Function(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + ';return MeshCore();'))();
let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : '')); if (!cond) fails++; }
const closed = function (m) { const t = core.topology(m.indices, m.positions.length / 3); return t.border === 0 && t.nonManifold === 0; };
const topo = function (m) { const t = core.topology(m.indices, m.positions.length / 3); return 'border ' + t.border + ', non-manifold ' + t.nonManifold; };
const vol = function (m) { return core.stats(m.positions, m.indices).volume; };
const signed = function (m) { let v = 0; const P = m.positions, I = m.indices; for (let t = 0; t < I.length; t += 3) { const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2]; v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) + P[a + 1] * (P[b + 2] * P[c] - P[b] * P[c + 2]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); } return v / 6; };
const F = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const rect = function (x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; };
const circ = function (cx, cy, r, n, cw) { const l = []; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n * (cw ? -1 : 1); l.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return l; };
const near = function (a, b, rel) { return Math.abs(a - b) <= (rel || 1e-4) * Math.abs(b); };

// ---- triangulation ----
let L = [rect(0, 0, 40, 30), circ(10, 10, 5, 24, true), circ(28, 18, 7, 24, true)], tr = core.triangulate(L), pts = [].concat(...L), ar = 0;
for (let t = 0; t < tr.length; t += 3) { const a = pts[tr[t]], b = pts[tr[t + 1]], c = pts[tr[t + 2]]; ar += ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; }
const polyA = function (n, r) { return n / 2 * r * r * Math.sin(2 * Math.PI / n); };
ok('plate with 2 holes triangulates to the right area', near(ar, 1200 - polyA(24, 5) - polyA(24, 7), 1e-9), ar.toFixed(4));
// ---- extrude ----
let m = core.extrudeSolid([{ loops: [rect(0, 0, 40, 30)] }], F, { z0: 0, z1: 10 });
ok('extrude box: closed, volume 12000, outward', closed(m) && near(vol(m), 12000) && signed(m) > 0, topo(m) + ' v=' + vol(m).toFixed(2));
m = core.extrudeSolid([{ loops: L }], F, { z0: -5, z1: 5 });
ok('extrude plate with holes (symmetric)', closed(m) && near(vol(m), 10 * (1200 - polyA(24, 5) - polyA(24, 7))), topo(m));
m = core.extrudeSolid([{ loops: [rect(0, 0, 40, 30)] }], F, { z0: 0, z1: 10, draft: Math.atan(0.1) });
ok('draft: frustum volume', closed(m) && near(vol(m), 10 / 3 * (1200 + 38 * 28 + Math.sqrt(1200 * 38 * 28))), vol(m).toFixed(2));
m = core.extrudeSolid([{ loops: [rect(0, 0, 40, 30)] }], F, { z0: 0, z1: 10, edge: 'chamfer', edgeSize: 2 });
ok('top chamfer 2: volume', closed(m) && near(vol(m), 1200 * 8 + 2 / 3 * (1200 + 36 * 26 + Math.sqrt(1200 * 36 * 26))), vol(m).toFixed(2));
m = core.extrudeSolid([{ loops: [rect(0, 0, 40, 30)] }], F, { z0: 0, z1: 10, edge: 'fillet', edgeSize: 2, edgeBoth: true });
ok('fillet both edges: closed, between chamfered and full box', closed(m) && vol(m) < 12000 && vol(m) > 11500, vol(m).toFixed(2));
m = core.extrudeSolid([{ loops: [rect(0, 0, 40, 30)] }], F, { z0: 0, z1: 10, shell: 2 });
ok('shell 2 (open top): closed, volume = box - cavity', closed(m) && near(vol(m), 12000 - 36 * 26 * 8), vol(m).toFixed(2));
m = core.extrudeSolid([{ loops: [rect(0, 0, 40, 30), circ(20, 15, 5, 32, true)] }], F, { z0: 0, z1: 10, shell: 2 });
ok('shell with a hole in the profile: closed', closed(m) && signed(m) > 0, topo(m) + ' v=' + vol(m).toFixed(1));
let threw = ''; try { core.extrudeSolid([{ loops: [rect(0, 0, 4, 30)] }], F, { z0: 0, z1: 10, shell: 2.5 }); } catch (e) { threw = e.message; }
ok('wall thicker than the part is refused', threw === 'offset', threw);
m = core.extrudeSolid([{ loops: [rect(0, 0, 10, 10)] }], { o: [5, 5, 5], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] }, { z0: 0, z1: 20 });
const st = core.stats(m.positions, m.indices);
ok('extrude on another plane lands in the right place', near(st.volume, 2000) && Math.abs(st.min[0] - 5) < 1e-5 && Math.abs(st.max[0] - 25) < 1e-5 && Math.abs(st.max[2] - 15) < 1e-5, JSON.stringify([st.min, st.max]));
// ---- revolve ----
m = core.revolveSolid([{ loops: [rect(5, 0, 10, 20)] }], F, { p: [0, 0], d: [0, 1] }, 2 * Math.PI);
ok('revolve a rectangle: tube, closed', closed(m) && near(vol(m), Math.PI * 75 * 20, 5e-3) && signed(m) > 0, topo(m) + ' v=' + vol(m).toFixed(1) + ' vs ' + (Math.PI * 75 * 20).toFixed(1));
m = core.revolveSolid([{ loops: [rect(0, 0, 10, 20)] }], F, { p: [0, 0], d: [0, 1] }, 2 * Math.PI);
ok('profile touching the axis: solid cylinder, closed', closed(m) && near(vol(m), Math.PI * 100 * 20, 5e-3), topo(m) + ' v=' + vol(m).toFixed(1));
m = core.revolveSolid([{ loops: [rect(5, 0, 10, 20)] }], F, { p: [0, 0], d: [0, 1] }, Math.PI / 2);
ok('quarter revolve: closed with end caps', closed(m) && near(vol(m), Math.PI * 75 * 20 / 4, 5e-3) && signed(m) > 0, topo(m) + ' v=' + vol(m).toFixed(1));
m = core.revolveSolid([{ loops: [rect(-10, 0, -5, 20)] }], F, { p: [0, 0], d: [0, 1] }, Math.PI);
ok('profile on the other side of the axis', closed(m) && near(vol(m), Math.PI * 75 * 20 / 2, 5e-3), topo(m));
threw = ''; try { core.revolveSolid([{ loops: [rect(-5, 0, 10, 20)] }], F, { p: [0, 0], d: [0, 1] }, 6.3); } catch (e) { threw = e.message; }
ok('profile crossing the axis is refused', threw === 'axis');

// ---- booleans ----
function sphere(sub, rad, c) {
  const t = (1 + Math.sqrt(5)) / 2; let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let Fc = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) { const mp = new Map(), F2 = []; const mid = function (a, b) { const k = a < b ? a + '_' + b : b + '_' + a; if (!mp.has(k)) { mp.set(k, V.length); V.push([0, 1, 2].map(function (i) { return (V[a][i] + V[b][i]) / 2; })); } return mp.get(k); }; for (const f of Fc) { const ab = mid(f[0], f[1]), bc = mid(f[1], f[2]), ca = mid(f[2], f[0]); F2.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]); } Fc = F2; }
  const P = new Float32Array(V.length * 3); V.forEach(function (v, i) { const l = Math.hypot(v[0], v[1], v[2]); P[3 * i] = v[0] / l * rad + c[0]; P[3 * i + 1] = v[1] / l * rad + c[1]; P[3 * i + 2] = v[2] / l * rad + c[2]; });
  return { positions: P, indices: new Uint32Array(Fc.flat()) };
}
const box = function (x0, y0, z0, x1, y1, z1) { return core.extrudeSolid([{ loops: [rect(x0, y0, x1, y1)] }], F, { z0: z0, z1: z1 }); };
const check = function (name, A, B, wantU, wantS, wantI, rel) {
  for (const [op, want] of [['union', wantU], ['subtract', wantS], ['intersect', wantI]]) {
    const t0 = Date.now(), r = core.boolean(A, B, op);
    ok(name + ' ' + op + ': closed, volume', closed(r) && near(vol(r), want, rel || 2e-3) && signed(r) > 0, topo(r) + ', v=' + vol(r).toFixed(2) + ' want ' + want.toFixed(2) + ', ' + r.indices.length / 3 + ' tris, ' + (Date.now() - t0) + ' ms');
  }
};
// two boxes overlapping in a corner (offset so that no faces are coplanar)
check('boxes', box(0, 0, 0, 20, 20, 20), box(11.3, 9.7, 8.1, 31.3, 29.7, 28.1), 16000 - 8.7 * 10.3 * 11.9, 8000 - 8.7 * 10.3 * 11.9, 8.7 * 10.3 * 11.9, 1e-4);
// box with a cylinder through it
const cylM = core.extrudeSolid([{ loops: [circ(10.2, 9.9, 4, 48)] }], F, { z0: -5, z1: 25 }), cA = polyA(48, 4);
check('box and through cylinder', box(0, 0, 0, 20, 20, 20), cylM, 8000 + cA * 10, 8000 - cA * 20, cA * 20, 1e-4);
// two spheres
const s1 = sphere(4, 10, [0, 0, 0]), s2 = sphere(4, 10, [9.37, 1.1, 0.4]), v1 = vol(s1), v2 = vol(s2), d = Math.hypot(9.37, 1.1, 0.4), lens = Math.PI * (20 - d) * (20 - d) * (d * d + 2 * d * 20) / (12 * d);
check('spheres', s1, s2, v1 + v2 - lens, v1 - lens, lens, 0.02);
// box inside box, apart
let r = core.boolean(box(0, 0, 0, 20, 20, 20), box(5, 5, 5, 10, 10, 10), 'subtract');
ok('subtract an inner box: cavity', near(vol(r), 8000 - 125) && closed(r), vol(r).toFixed(1));
r = core.boolean(box(0, 0, 0, 20, 20, 20), box(50, 5, 5, 60, 10, 10), 'intersect');
ok('intersect of separate boxes is empty', r.indices.length === 0);
// size
const b1 = sphere(7, 50, [0, 0, 0]), b2 = sphere(7, 50, [41.3, 7.7, 3.1]);
let t0 = Date.now(); r = core.boolean(b1, b2, 'union');
ok('two spheres of ' + b1.indices.length / 3 + ' tris each: union closed', closed(r), topo(r) + ', ' + r.indices.length / 3 + ' tris, ' + (Date.now() - t0) + ' ms');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
