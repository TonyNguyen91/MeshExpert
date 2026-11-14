  // ================= SLA build plate: orient every body for a resin printer and spread them out from the plate centre =================
  // Plate: origin at the world origin, printing on the XY plane over +X 0..W, +Y 0..D. The recoater blade lies along X and travels along Y.
  // Orientation: the longest extent goes up (Z), the middle one along the blade travel (Y), the thinnest across the blade (X),
  // so each layer meets the blade over as little width as possible, edge-on (about 90°).
  S.sla = { last: null, armed: true };
  const slaNum = function (id, d) { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
  function slaOpt() {
    return { W: Math.max(10, slaNum('slaW', 400)), D: Math.max(10, slaNum('slaD', 400)), lift: Math.max(0, slaNum('slaLift', 5)), margin: Math.max(0, slaNum('slaMargin', 5)), gap: Math.max(0, slaNum('slaGap', 2)), spread: Math.max(0, Math.min(100, slaNum('slaSpread', 0))),
      tilt: $('slaTiltOn').checked ? Math.max(10, Math.min(45, slaNum('slaTilt', 15))) : 0, guard: $('slaGuardOn').checked, gx: Math.max(0.5, slaNum('slaGX', 20)), gy: Math.max(0.5, slaNum('slaGY', 20)), gt: Math.max(0.2, slaNum('slaGT', 2)), gd: Math.max(0, slaNum('slaGD', 30)) };
  }
  // world vertices of a body, thinned out for very large meshes
  function slaVerts(b, maxN) {
    const P = b.geo.positions, m = b.matrix, n = P.length / 3, step = Math.max(1, Math.ceil(n / (maxN || 200000))), o = [];
    for (let i = 0; i < n; i += step) { const k = i * 3; o.push(M.point(m, [P[k], P[k + 1], P[k + 2]])); }
    return o;
  }
  // area-weighted centroid and covariance of the surface
  function slaMoments(b) {
    const P = b.geo.positions, I = b.geo.indices, m = b.matrix, nt = I.length / 3, step = Math.max(1, Math.ceil(nt / 200000));
    let A = 0; const c = [0, 0, 0], C = [0, 0, 0, 0, 0, 0];
    const tri = [];
    for (let t = 0; t < nt; t += step) {
      const a = M.point(m, [P[I[t * 3] * 3], P[I[t * 3] * 3 + 1], P[I[t * 3] * 3 + 2]]), bb = M.point(m, [P[I[t * 3 + 1] * 3], P[I[t * 3 + 1] * 3 + 1], P[I[t * 3 + 1] * 3 + 2]]), cc = M.point(m, [P[I[t * 3 + 2] * 3], P[I[t * 3 + 2] * 3 + 1], P[I[t * 3 + 2] * 3 + 2]]);
      const ar = 0.5 * V.len(V.cross(V.sub(bb, a), V.sub(cc, a))); if (!(ar > 0)) continue;
      const g = [(a[0] + bb[0] + cc[0]) / 3, (a[1] + bb[1] + cc[1]) / 3, (a[2] + bb[2] + cc[2]) / 3];
      tri.push([g, ar]); A += ar; c[0] += g[0] * ar; c[1] += g[1] * ar; c[2] += g[2] * ar;
    }
    if (!(A > 0)) return null;
    c[0] /= A; c[1] /= A; c[2] /= A;
    for (const q of tri) { const d = V.sub(q[0], c), w = q[1]; C[0] += w * d[0] * d[0]; C[1] += w * d[1] * d[1]; C[2] += w * d[2] * d[2]; C[3] += w * d[0] * d[1]; C[4] += w * d[0] * d[2]; C[5] += w * d[1] * d[2]; }
    return { c: c, C: [[C[0], C[3], C[4]], [C[3], C[1], C[5]], [C[4], C[5], C[2]]] };
  }
  // eigenvectors of a symmetric 3x3 matrix (Jacobi), as orthonormal columns
  function slaEig(A0) {
    const A = A0.map(function (r) { return r.slice(); }), Vm = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let it = 0; it < 50; it++) {
      let p = 0, q = 1;
      if (Math.abs(A[0][2]) > Math.abs(A[p][q])) { p = 0; q = 2; }
      if (Math.abs(A[1][2]) > Math.abs(A[p][q])) { p = 1; q = 2; }
      if (Math.abs(A[p][q]) < 1e-14 * (Math.abs(A[0][0]) + Math.abs(A[1][1]) + Math.abs(A[2][2]) + 1e-300)) break;
      const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = Vm[k][p], vkq = Vm[k][q]; Vm[k][p] = c * vkp - s * vkq; Vm[k][q] = s * vkp + c * vkq; }
    }
    return [0, 1, 2].map(function (j) { return { v: [Vm[0][j], Vm[1][j], Vm[2][j]], l: A[j][j] }; });
  }
  function slaHull2(pts) {                                  // convex hull (monotone chain) of [x, y] points
    const p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    const cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }, lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  // angle of the smallest-area rectangle around 2D points (a side lies on a hull edge)
  function slaMinRect(pts) {
    const h = slaHull2(pts);
    let best = { a: 0, area: Infinity };
    for (let i = 0; i < h.length; i++) {
      const p = h[i], q = h[(i + 1) % h.length], ang = Math.atan2(q[1] - p[1], q[0] - p[0]), c = Math.cos(ang), s = Math.sin(ang);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const r of h) { const x = r[0] * c + r[1] * s, y = -r[0] * s + r[1] * c; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const ar = (x1 - x0) * (y1 - y0);
      if (ar < best.area) best = { a: ang, area: ar };
    }
    return best.a;
  }
  // a tight box frame: PCA start, then the smallest rectangle in each pair of axes, twice round
  function slaFrame(pts, mom) {
    let ax = slaEig(mom.C).sort(function (a, b) { return b.l - a.l; }).map(function (e) { return V.norm(e.v); });
    ax[2] = V.norm(V.cross(ax[0], ax[1])); ax[1] = V.cross(ax[2], ax[0]);
    const pairs = [[1, 2], [0, 1], [0, 2]];
    for (let it = 0; it < 2; it++) for (const pr of pairs) {
      const u = ax[pr[0]], v = ax[pr[1]], d = pts.map(function (p) { return [V.dot(p, u), V.dot(p, v)]; });
      const a = slaMinRect(d), c = Math.cos(a), s = Math.sin(a);
      ax[pr[0]] = V.norm(V.add(V.mul(u, c), V.mul(v, s))); ax[pr[1]] = V.norm(V.add(V.mul(u, -s), V.mul(v, c)));
    }
    return ax;
  }
  // the rotation (about the body's centre) that puts the body upright for the plate
  function slaOrientMatrix(b) {
    const mom = slaMoments(b); if (!mom) return null;
    const pts = slaVerts(b, 120000), ax = slaFrame(pts, mom);
    const ext = ax.map(function (a) { let lo = Infinity, hi = -Infinity; for (const p of pts) { const t = V.dot(p, a); if (t < lo) lo = t; if (t > hi) hi = t; } return { a: a, lo: lo, hi: hi, e: hi - lo }; });
    ext.sort(function (p, q) { return p.e - q.e; });           // thin → X, middle → Y, long → Z
    let X = ext[0].a.slice(), Y = ext[1].a.slice(), Z = ext[2].a.slice();
    if (V.dot(V.cross(X, Y), Z) < 0) X = V.mul(X, -1);
    // heavier end down: put the side with more surface towards the plate
    const zc = V.dot(mom.c, Z), zm = (ext[2].lo + ext[2].hi) / 2;
    if (zc > zm + 1e-9 * (ext[2].e + 1)) { Z = V.mul(Z, -1); X = V.mul(X, -1); }
    const R = [X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0, 0, 0, 0, 1];   // rows X, Y, Z
    const tilt = slaOpt().tilt;                              // lean about X: the thin side stays across the blade, big faces no longer lie flat
    return M.about(mom.c, tilt ? M.mul(M.rot([1, 0, 0], -tilt * Math.PI / 180), R) : R);
  }
  // rows along X: small parts first, a row is filled across X before the next one starts (further along Y); parts of the same size stay in the same row.
  // The whole block is then centred on the plate. Items {w, d, h} → {x, y} (min corners).
  function slaRows(items, gap, o) {
    const aw = o.W - 2 * o.margin, ad = o.D - 2 * o.margin, res = o.guard ? 2 * (o.gd + o.gy) : 0;
    const vol = function (it) { return Math.max(1e-9, it.w * it.d * it.h); };
    const ord = items.map(function (it, i) { return i; }).sort(function (a, b) { return vol(items[a]) - vol(items[b]) || items[a].d - items[b].d; });
    const groups = [];
    for (const i of ord) { const g = groups[groups.length - 1]; if (g && vol(items[i]) <= vol(items[g[0]]) * 1.03) g.push(i); else groups.push([i]); }
    const pos = new Array(items.length), rows = [];
    let row = null;
    const newRow = function () { const y = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].d + gap : 0; row = { y: y, x: 0, d: 0, n: 0 }; rows.push(row); };
    const groupW = function (g) { return g.reduce(function (s, i) { return s + items[i].w; }, 0) + gap * (g.length - 1); };
    for (const g of groups) {
      if (row && row.n && row.x + groupW(g) > aw + 1e-9 && groupW(g) <= aw + 1e-9) newRow();   // keep a same-size group together when it fits in a fresh row
      for (const i of g) {
        const it = items[i];
        if (!row || (row.n && row.x + it.w > aw + 1e-9)) newRow();
        pos[i] = [row.x, row.y]; row.x += it.w + gap; row.n++; row.d = Math.max(row.d, it.d);
      }
    }
    const W = Math.max.apply(null, items.map(function (it, i) { return pos[i][0] + it.w; })), Hh = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].d : 0;
    const ox = o.W / 2 - W / 2, oy = o.D / 2 - Hh / 2;
    for (const p of pos) { p[0] += ox; p[1] += oy; }
    const wide = items.some(function (it) { return it.w > aw + 1e-9; });
    return { pos: pos, W: W, H: Hh, fits: !wide && W <= aw + 1e-9 && Hh + res <= ad + 1e-9 };
  }
  // spread 0..100 % goes from the smallest gap to the largest one that still fits on the plate
  function slaLayout(items, o) {
    const ok = slaRows(items, o.gap, o).fits;
    let gmax = o.gap;
    if (ok) { let lo = o.gap, hi = o.gap + Math.max(o.W, o.D); for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (slaRows(items, mid, o).fits) lo = mid; else hi = mid; } gmax = lo; }
    const g = o.gap + (gmax - o.gap) * o.spread / 100, L1 = slaRows(items, g, o);
    return { pos: L1.pos, gap: g, fits: ok, W: L1.W, H: L1.H };
  }
  // ---------- the two guard blocks: always the outermost parts along the blade travel (one at each end), as tall as the tallest part ----------
  const slaIsGuard = function (b) { return /^SLA_guard_[12]$/.test(b.name); };
  function slaBoxGeo(sx, sy, sz) {
    const P = new Float32Array([0, 0, 0, sx, 0, 0, sx, sy, 0, 0, sy, 0, 0, 0, sz, sx, 0, sz, sx, sy, sz, 0, sy, sz]);
    const I = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    return makeGeo(P, I);
  }
  function slaGuards() {
    const old = S.bodies.filter(slaIsGuard), o = slaOpt();
    for (const b of old) removeBody(b);
    if (!o.guard) return null;
    const parts = slaBodies(); if (!parts.length) return null;
    const bb = parts.map(tightBox);
    const y0 = Math.min.apply(null, bb.map(function (t) { return t.min[1]; })), y1 = Math.max.apply(null, bb.map(function (t) { return t.max[1]; })), h = Math.max.apply(null, bb.map(function (t) { return t.max[2]; }));
    if (!(h > 0)) return null;
    const z0 = Math.max(0, h - o.gt), out = [];
    [[o.W - o.margin - o.gx, y0 - o.gd - o.gy], [o.margin, y1 + o.gd]].forEach(function (p, i) {
      out.push(addBody('SLA_guard_' + (i + 1), slaBoxGeo(o.gx, o.gy, h - z0), { matrix: M.trans([p[0], p[1], z0]), color: [235, 120, 60] }));
    });
    return out;
  }
  // ---------- the 3D print table ----------
  S.sla.table = false;
  try { S.sla.table = localStorage.getItem('mx.slaTable') === '1'; } catch (e) { }
  let slaTabGeo = null, slaTabKey = '';
  function slaTableGeo() {
    const o = slaOpt(), k = o.W + 'x' + o.D;
    if (slaTabGeo && slaTabKey === k) return slaTabGeo;
    if (slaTabGeo) { const g = slaTabGeo; slaTabGeo = null; releaseGeo(g); }
    const T = 8, g = slaBoxGeo(o.W, o.D, T);
    for (let i = 2; i < g.positions.length; i += 3) g.positions[i] -= T + 0.05;
    g.min[2] -= T + 0.05; g.max[2] -= T + 0.05;
    slaTabGeo = g; slaTabKey = k; return g;
  }
  function drawSlaTable() {
    if (!S.sla.table || S.sk || !gl) return;
    const g = slaTableGeo(), b = ensureGL(g);
    gl.uniformMatrix4fv(U.uM, false, M.ident()); gl.frontFace(gl.CCW);
    gl.uniform4f(U.uColor, 0.62, 0.66, 0.71, 1); gl.uniform1f(U.uSel, 0); gl.uniform1i(U.uMode, 0);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 2);
    gl.bindVertexArray(b.vao); gl.drawElements(gl.TRIANGLES, g.indices.length, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  // how deep the view must reach so the table is not clipped
  function slaDepthNeed() {
    if (!S.sla || !S.sla.table) return 0;
    const o = slaOpt(); let m = 0;
    for (let c = 0; c < 8; c++) { const p = [c & 1 ? o.W : 0, c & 2 ? o.D : 0, c & 4 ? 0 : -9]; m = Math.max(m, V.len(V.sub(p, cam.target))); }
    return m * 1.05;
  }
  function slaTableUI() { $('bSlaTable').classList.toggle('on', S.sla.table); dirty = true; }
  $('bSlaTable').addEventListener('click', function () { S.sla.table = !S.sla.table; try { localStorage.setItem('mx.slaTable', S.sla.table ? '1' : '0'); } catch (e) { } slaTableUI(); });
  slaTableUI();
  // the panel floats over the 3D view: drag it by its title, default at the left
  (function () {
    const p = $('pop_sla'), hd = p.querySelector('.pophd');
    $('tpop').parentNode.appendChild(p);
    try { const s = JSON.parse(localStorage.getItem('mx.slaPop') || 'null'); if (s) { p.style.left = s.l; p.style.top = s.t; } } catch (e) { }
    let dr = null;
    hd.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('button')) return; e.preventDefault(); e.stopPropagation();
      dr = { x: e.clientX, y: e.clientY, l: p.offsetLeft, t: p.offsetTop, w: p.offsetWidth };
    });
    window.addEventListener('mousemove', function (e) {
      if (!dr) return;
      const par = p.offsetParent, W = par ? par.clientWidth : innerWidth, H = par ? par.clientHeight : innerHeight;
      p.style.left = Math.max(0, Math.min(W - dr.w - 2, dr.l + e.clientX - dr.x)) + 'px';
      p.style.top = Math.max(0, Math.min(H - 30, dr.t + e.clientY - dr.y)) + 'px';
    });
    window.addEventListener('mouseup', function () { if (dr) { dr = null; try { localStorage.setItem('mx.slaPop', JSON.stringify({ l: p.style.left, t: p.style.top })); } catch (e) { } } });
    hd.addEventListener('dblclick', function (e) { if (e.target.closest('button')) return; p.style.left = ''; p.style.top = ''; try { localStorage.removeItem('mx.slaPop'); } catch (er) { } });
  })();
  function slaBodies() { return visibleBodies().filter(function (b) { return !slaIsGuard(b); }); }
  function slaApply(orient, undo) {
    if (blocked()) return;
    const list = slaBodies();
    if (!list.length) { flash(L('Chưa có body nào để xếp', 'There are no bodies to lay out')); return; }
    const o = slaOpt();
    setBusy(true, L('Đang xếp lên bàn in…', 'Laying out on the plate…'));
    setTimeout(function () {
      try {
        if (undo) pushUndo();
        if (orient) for (const b of list) { const R = slaOrientMatrix(b); if (R) b.matrix = M.mul(R, b.matrix); }
        const items = list.map(function (b) { const t = tightBox(b); return { w: t.max[0] - t.min[0], d: t.max[1] - t.min[1], h: t.max[2] - t.min[2], t: t }; });
        const L1 = slaLayout(items, o);
        list.forEach(function (b, i) { const it = items[i]; b.matrix = M.mul(M.trans([L1.pos[i][0] - it.t.min[0], L1.pos[i][1] - it.t.min[1], o.lift - it.t.min[2]]), b.matrix); b.off = [0, 0, 0]; });
        S.sla.last = list; S.sla.gap = L1.gap;
        const gd = slaGuards() || [];
        commitTransform(list.concat(gd));
        { const c = mainCam.center, r = mainCam.radius, zt = Math.max.apply(null, list.map(function (b) { return tightBox(b).max[2]; })); fitCam(mainCam, { min: [-10, -16, 0], max: [o.W + 10, o.D + 10, zt] }); mainCam.center = c; mainCam.radius = r; }
        const hmax = Math.max.apply(null, list.map(function (b) { const t = tightBox(b); return t.max[2]; }));
        $('slaRes').textContent = (L1.fits ? L('Đã xếp ', 'Laid out ') + list.length + L(' body · khe ', ' bodies · gap ') + f2(L1.gap) + ' mm · ' + f2(L1.W) + ' × ' + f2(L1.H) + ' mm · ' + L('cao nhất ', 'tallest ') + f2(hmax) + ' mm'
          : L('Không đủ chỗ trên bàn ', 'Does not fit on the plate ') + o.W + ' × ' + o.D + L(' mm: khối xếp chiếm ', ' mm: the layout takes ') + f2(L1.W) + ' × ' + f2(L1.H) + ' mm');
        if (!L1.fits) flash(L('Các body không vừa bàn in, đã xếp sát nhất có thể', 'The bodies do not fit on the plate; packed as tight as possible'));
        dirty = true;
      } catch (e) { showError(e); }
      setBusy(false);
    }, 20);
  }
  // only move the last laid-out set (the spread slider)
  function slaRespread() {
    const list = (S.sla.last || []).filter(function (b) { return S.bodies.indexOf(b) >= 0; });
    if (!list.length) return;
    if (S.sla.armed) { pushUndo(); S.sla.armed = false; }
    const o = slaOpt(), items = list.map(function (b) { const t = tightBox(b); return { w: t.max[0] - t.min[0], d: t.max[1] - t.min[1], h: t.max[2] - t.min[2], t: t }; }), L1 = slaLayout(items, o);
    list.forEach(function (b, i) { const it = items[i]; b.matrix = M.mul(M.trans([L1.pos[i][0] - it.t.min[0], L1.pos[i][1] - it.t.min[1], o.lift - it.t.min[2]]), b.matrix); });
    S.sla.gap = L1.gap; const gd = slaGuards() || [];
    commitTransform(list.concat(gd));
    $('slaRes').textContent = L('Khe ', 'Gap ') + f2(L1.gap) + ' mm · ' + f2(L1.W) + ' × ' + f2(L1.H) + ' mm';
  }
  // lift only the ticked bodies to the "lift off the plate" height
  function slaLiftSel() {
    if (blocked()) return;
    const list = selBodies().filter(function (b) { return !slaIsGuard(b); });
    if (!list.length) { flash(L('Hãy tick hoặc bấm chọn body cần nâng', 'Tick or click the bodies to lift')); return; }
    const o = slaOpt();
    pushUndo();
    for (const b of list) { const t = tightBox(b); b.matrix = M.mul(M.trans([0, 0, o.lift - t.min[2]]), b.matrix); }
    const gd = S.bodies.some(slaIsGuard) || o.guard ? slaGuards() || [] : [];
    commitTransform(list.concat(gd));
    $('slaRes').textContent = L('Đã đặt ', 'Set ') + list.length + L(' body cách bàn ', ' bodies at ') + f2(o.lift) + ' mm';
  }
  $('slaLiftSel').addEventListener('click', slaLiftSel);
  $('slaGuardOn').addEventListener('change', function () { if (blocked()) return; pushUndo(); const gd = slaGuards() || []; commitTransform(gd); dirty = true; });
  ['slaGX', 'slaGY', 'slaGT'].forEach(function (id) { $(id).addEventListener('change', function () { if (!$('slaGuardOn').checked) return; pushUndo(); commitTransform(slaGuards() || []); }); });
  (function () { const r = $('slaGDR'), n = $('slaGD'); let armed = true;
    const go = function () { if (!$('slaGuardOn').checked) return; if (armed) { pushUndo(); armed = false; } commitTransform(slaGuards() || []); };
    r.addEventListener('input', function () { n.value = r.value; go(); }); n.addEventListener('input', function () { r.value = n.value; go(); });
    r.addEventListener('change', function () { armed = true; }); n.addEventListener('change', function () { armed = true; }); })();
  [['slaTiltR', 'slaTilt'], ['slaLiftR', 'slaLift']].forEach(function (p) { const r = $(p[0]), n = $(p[1]); r.addEventListener('input', function () { n.value = r.value; }); n.addEventListener('input', function () { r.value = n.value; }); });
  $('slaGo').addEventListener('click', function () { slaApply(true, true); });
  $('slaGoA').addEventListener('click', function () { slaApply(false, true); });
  [['slaSpreadR', 'slaSpread'], ['slaGapR', 'slaGap']].forEach(function (p) {
    const r = $(p[0]), n = $(p[1]);
    r.addEventListener('input', function () { n.value = r.value; slaRespread(); });
    n.addEventListener('input', function () { r.value = n.value; slaRespread(); });
    r.addEventListener('change', function () { S.sla.armed = true; }); n.addEventListener('change', function () { S.sla.armed = true; });
  });
  ['slaW', 'slaD', 'slaMargin'].forEach(function (id) { $(id).addEventListener('change', function () { S.sla.armed = true; slaRespread(); S.sla.armed = true; dirty = true; }); });
  // the plate, its grid and the blade, drawn while the panel is open
  function drawSla() {
    if ((!$('pop_sla').classList.contains('on') && !S.sla.table) || S.sk) return;
    const o = slaOpt(), P = function (x, y) { return project([x, y, 0]); };
    const ln = function (a, b, c, w, dash) { const p = P(a[0], a[1]), q = P(b[0], b[1]); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]); };
    const st = o.W > 200 || o.D > 200 ? 50 : 20;
    for (let x = st; x < o.W; x += st) ln([x, 0], [x, o.D], 'rgba(156,196,238,.18)', 1);
    for (let y = st; y < o.D; y += st) ln([0, y], [o.W, y], 'rgba(156,196,238,.18)', 1);
    if (o.margin > 0) { const m = o.margin; ln([m, m], [o.W - m, m], 'rgba(240,160,48,.35)', 1, [4, 4]); ln([o.W - m, m], [o.W - m, o.D - m], 'rgba(240,160,48,.35)', 1, [4, 4]); ln([o.W - m, o.D - m], [m, o.D - m], 'rgba(240,160,48,.35)', 1, [4, 4]); ln([m, o.D - m], [m, m], 'rgba(240,160,48,.35)', 1, [4, 4]); }
    ln([0, 0], [o.W, 0], '#9cc4ee', 1.6); ln([o.W, 0], [o.W, o.D], '#9cc4ee', 1.6); ln([o.W, o.D], [0, o.D], '#9cc4ee', 1.6); ln([0, o.D], [0, 0], '#9cc4ee', 1.6);
    ln([o.W / 2 - 8, o.D / 2], [o.W / 2 + 8, o.D / 2], '#f0a030', 1.4); ln([o.W / 2, o.D / 2 - 8], [o.W / 2, o.D / 2 + 8], '#f0a030', 1.4);
    // blade along X at the front edge, arrow along +Y
    ln([0, -6], [o.W, -6], '#52d06a', 3);
    const a = P(o.W / 2, -6), b = P(o.W / 2, Math.min(o.D * 0.18, 60));
    ctx.strokeStyle = '#52d06a'; ctx.fillStyle = '#52d06a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    ctx.beginPath(); ctx.moveTo(b[0] + ux * 9, b[1] + uy * 9); ctx.lineTo(b[0] - uy * 5, b[1] + ux * 5); ctx.lineTo(b[0] + uy * 5, b[1] - ux * 5); ctx.fill();
    const t = P(o.W + 4, -6); ctx.font = '11px Arial'; ctx.fillText(L('Dao gạt → Y', 'Blade → Y'), t[0] + 4, t[1] + 4);
  }
