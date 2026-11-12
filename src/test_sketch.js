// Tests for the sketch constraint solver. Run: node src/test_sketch.js (after python3 src/build.py)
const fs = require('fs'), path = require('path');
const core = (new Function(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + ';return MeshCore();'))();
let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : '')); if (!cond) fails++; }
const near = function (a, b, t) { return Math.abs(a - b) <= (t || 1e-6); };
const len = function (m, e) { const a = m.pts[m.ents[e].a], b = m.pts[m.ents[e].b]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };

// a rough rectangle: 4 lines sharing corners
let m = core.skModel();
m.pts.push([1, 1], [41, 2], [40, 31], [0, 29]);
m.ents.push({ t: 'line', a: 1, b: 2 }, { t: 'line', a: 2, b: 3 }, { t: 'line', a: 3, b: 4 }, { t: 'line', a: 4, b: 1 });
let an = core.skAnalyse(m);
ok('free rectangle has 8 degrees of freedom', an.dof === 8, an.dof);
m.cons.push({ t: 'h', e: 0 }, { t: 'v', e: 1 }, { t: 'h', e: 2 }, { t: 'v', e: 3 });
let r = core.skSolve(m);
ok('H/V constraints solve', r.ok && near(m.pts[1][1], m.pts[2][1]) && near(m.pts[2][0], m.pts[3][0]) && near(m.pts[3][1], m.pts[4][1]) && near(m.pts[4][0], m.pts[1][0]));
ok('…and the corners barely moved', Math.abs(m.pts[2][0] - 41) < 1.5 && Math.abs(m.pts[3][1] - 30.5) < 1.5, JSON.stringify(m.pts));
an = core.skAnalyse(m);
ok('rectangle with H/V: 4 degrees of freedom left', an.dof === 4, an.dof);
m.cons.push({ t: 'hdist', p: [1, 2], v: 50, s: 1 }, { t: 'vdist', p: [2, 3], v: 20, s: 1 });
r = core.skSolve(m);
ok('width 50 and height 20', r.ok && near(len(m, 0), 50) && near(len(m, 1), 20), len(m, 0).toFixed(6) + ' ' + len(m, 1).toFixed(6));
core.skMerge(m, 0, 1);
r = core.skSolve(m);
an = core.skAnalyse(m);
ok('corner on the origin: fully defined', r.ok && an.dof === 0 && an.entFree.every(function (f) { return !f; }), 'dof ' + an.dof);
ok('origin corner sits at 0,0', near(m.pts[0][0], 0) && near(m.pts[0][1], 0) && m.ents[0].a === 0);
// a conflicting constraint is refused by the solver
const before = JSON.stringify(m.pts);
m.cons.push({ t: 'hdist', p: [m.ents[0].a, m.ents[0].b], v: 60, s: 1 });
r = core.skSolve(m);
ok('conflicting width fails and leaves the sketch alone', !r.ok && JSON.stringify(m.pts) === before);
m.cons.pop();
// dragging a free point
m = core.skModel();
m.pts.push([0, 0], [10, 0]);
m.ents.push({ t: 'line', a: 1, b: 2 });
m.cons.push({ t: 'h', e: 0 }, { t: 'dist', p: [1, 2], v: 10 });
r = core.skSolve(m, { drag: { p: 2, to: [20, 5] } });
ok('dragging keeps the line horizontal and 10 long', r.ok && near(len(m, 0), 10) && near(m.pts[1][1], m.pts[2][1]), JSON.stringify(m.pts));
// circle tangent to a line, equal radii, concentric via merge
m = core.skModel();
m.pts.push([0, 0], [50, 0], [20, 8], [40, 30]);
m.ents.push({ t: 'line', a: 1, b: 2 }, { t: 'circle', c: 3, r: 5 }, { t: 'circle', c: 4, r: 9 });
m.cons.push({ t: 'h', e: 0 }, { t: 'tan', e: [0, 1] }, { t: 'eq', e: [1, 2] }, { t: 'diam', e: 2, v: 12 });
r = core.skSolve(m);
ok('tangent circle: centre 6 above the line', r.ok && near(Math.abs(m.pts[3][1] - m.pts[1][1]), 6) && near(m.ents[1].r, 6) && near(m.ents[2].r, 6), JSON.stringify(m.pts) + ' r ' + m.ents[1].r);
// arc ends stay on the arc, perpendicular and angle dims
m = core.skModel();
m.pts.push([0, 0], [30, 2], [1, 1], [0, 25], [10, 0], [0, 10]);
m.ents.push({ t: 'line', a: 1, b: 2 }, { t: 'line', a: 3, b: 4 }, { t: 'arc', c: 1, a: 5, b: 6 });
m.cons.push({ t: 'ang', e: [0, 1], v: 60, s: 1 }, { t: 'h', e: 0 });
r = core.skSolve(m);
const d0 = [m.pts[2][0] - m.pts[1][0], m.pts[2][1] - m.pts[1][1]], d1 = [m.pts[4][0] - m.pts[3][0], m.pts[4][1] - m.pts[3][1]];
const ang = Math.atan2(d0[0] * d1[1] - d0[1] * d1[0], d0[0] * d1[0] + d0[1] * d1[1]) * 180 / Math.PI;
ok('angle 60° between the lines', r.ok && near(ang, 60, 1e-5), ang.toFixed(6));
const ra = Math.hypot(m.pts[5][0] - m.pts[1][0], m.pts[5][1] - m.pts[1][1]), rb = Math.hypot(m.pts[6][0] - m.pts[1][0], m.pts[6][1] - m.pts[1][1]);
ok('arc ends on one circle', near(ra, rb, 1e-6), ra.toFixed(6) + ' ' + rb.toFixed(6));
// flat conversion and back
const fl = core.skFlat(m);
ok('flat form: 2 lines + 1 arc', fl.length === 3 && fl[2].t === 'arc' && near(fl[2].r, ra, 1e-6));
const m2 = core.skFromFlat(fl);
ok('back from flat: shared points', m2.ents.length === 3 && m2.ents[2].c === m2.ents[0].a);
// deleting an entity removes its constraints and unused points
core.skDeleteEnts(m, [1]);
ok('delete line: its angle constraint is gone', m.ents.length === 2 && m.cons.length === 1 && m.cons[0].t === 'h' && m.pts.length === 5);
// symmetric + midpoint
m = core.skModel();
m.pts.push([0, -20], [0, 20], [-7, 3], [9, 4], [1, 1]);
m.ents.push({ t: 'line', a: 1, b: 2, cons: true }, { t: 'point', p: 3 }, { t: 'point', p: 4 }, { t: 'point', p: 5 });
m.cons.push({ t: 'fix', p: 1, at: [0, -20] }, { t: 'fix', p: 2, at: [0, 20] }, { t: 'sym', p: [3, 4], e: 0 }, { t: 'mid', p: 5, e: 0 });
r = core.skSolve(m);
ok('symmetric points mirror about the line', r.ok && near(m.pts[3][0], -m.pts[4][0], 1e-6) && near(m.pts[3][1], m.pts[4][1], 1e-6) && near(m.pts[5][1], (m.pts[1][1] + m.pts[2][1]) / 2), JSON.stringify(m.pts));
ok('construction line is an axis in the flat form', core.skFlat(m)[0].axis === true);
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
