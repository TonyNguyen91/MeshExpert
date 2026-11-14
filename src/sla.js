  // ================= SLA build plate: orient every body for a resin printer and spread them out from the plate centre =================
  // Plate: origin at the world origin, printing on the XY plane over +X 0..W, +Y 0..D. The recoater blade lies along X and travels along Y.
  // Orientation: the longest extent goes up (Z), the middle one along the blade travel (Y), the thinnest across the blade (X),
  // so each layer meets the blade over as little width as possible, edge-on (about 90°).
  S.sla = { last: null, armed: true };
  const slaNum = function (id, d) { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
  function slaOpt() {
    return { W: Math.max(10, slaNum('slaW', 400)), D: Math.max(10, slaNum('slaD', 400)), lift: Math.max(0, slaNum('slaLift', 5)), margin: Math.max(0, slaNum('slaMargin', 5)), gap: Math.max(0, slaNum('slaGap', 2)), spread: Math.max(0, Math.min(100, slaNum('slaSpread', 0))) };
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
    return M.about(mom.c, R);
  }
  // rows from the plate centre: items {w, d} → {x, y} (min corners), or null when they do not fit
  function slaShelf(items, gap, rowW) {
    const order = items.map(function (it, i) { return i; }).sort(function (a, b) { return items[b].d - items[a].d || items[b].w - items[a].w; });
    const rows = []; let cur = null;
    for (const i of order) {
      const it = items[i];
      if (!cur || (cur.w > 0 && cur.w + gap + it.w > rowW + 1e-9)) { cur = { ids: [], w: 0, d: 0 }; rows.push(cur); }
      cur.w += (cur.ids.length ? gap : 0) + it.w; cur.d = Math.max(cur.d, it.d); cur.ids.push(i);
    }
    const W = Math.max.apply(null, rows.map(function (r) { return r.w; })), H = rows.reduce(function (s, r) { return s + r.d; }, 0) + gap * (rows.length - 1);
    return { rows: rows, W: W, H: H };
  }
  function slaBestShelf(items, gap, aw, ad) {
    const wmax = Math.max.apply(null, items.map(function (i) { return i.w; })), tot = items.reduce(function (s, i) { return s + i.w; }, 0) + gap * (items.length - 1);
    let best = null;
    for (let k = 0; k <= 80; k++) {
      const rw = wmax + (Math.max(wmax, tot) - wmax) * k / 80, L1 = slaShelf(items, gap, rw), sc = Math.max(L1.W / aw, L1.H / ad);
      if (!best || sc < best.sc - 1e-9) best = Object.assign(L1, { sc: sc });
    }
    return best;
  }
  // lay the items out centred on the plate; spread 0..100 % goes from the smallest gap to the largest that still fits
  function slaLayout(items, o) {
    const aw = o.W - 2 * o.margin, ad = o.D - 2 * o.margin;
    const fits = function (g) { return slaBestShelf(items, g, aw, ad).sc <= 1 + 1e-9; };
    const ok = fits(o.gap);
    let gmax = o.gap;
    if (ok) { let lo = o.gap, hi = o.gap + Math.max(aw, ad); for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } gmax = lo; }
    const g = o.gap + (gmax - o.gap) * o.spread / 100, L1 = slaBestShelf(items, g, aw, ad), pos = new Array(items.length);
    let y = o.D / 2 - L1.H / 2;
    for (const r of L1.rows) {
      let x = o.W / 2 - r.w / 2;
      for (const i of r.ids) { pos[i] = [x, y + (r.d - items[i].d) / 2]; x += items[i].w + g; }
      y += r.d + g;
    }
    return { pos: pos, gap: g, fits: ok, W: L1.W, H: L1.H };
  }
  function slaBodies() { return visibleBodies(); }
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
        const items = list.map(function (b) { const t = tightBox(b); return { w: t.max[0] - t.min[0], d: t.max[1] - t.min[1], t: t }; });
        const L1 = slaLayout(items, o);
        list.forEach(function (b, i) { const it = items[i]; b.matrix = M.mul(M.trans([L1.pos[i][0] - it.t.min[0], L1.pos[i][1] - it.t.min[1], o.lift - it.t.min[2]]), b.matrix); b.off = [0, 0, 0]; });
        S.sla.last = list;
        commitTransform(list);
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
    const o = slaOpt(), items = list.map(function (b) { const t = tightBox(b); return { w: t.max[0] - t.min[0], d: t.max[1] - t.min[1], t: t }; }), L1 = slaLayout(items, o);
    list.forEach(function (b, i) { const it = items[i]; b.matrix = M.mul(M.trans([L1.pos[i][0] - it.t.min[0], L1.pos[i][1] - it.t.min[1], o.lift - it.t.min[2]]), b.matrix); });
    commitTransform(list);
    $('slaRes').textContent = L('Khe ', 'Gap ') + f2(L1.gap) + ' mm · ' + f2(L1.W) + ' × ' + f2(L1.H) + ' mm';
  }
  $('bSlaOrient').addEventListener('click', function () { openPop('sla', true); slaApply(true, true); });
  $('bSlaArrange').addEventListener('click', function () { openPop('sla', true); slaApply(false, true); });
  $('slaGo').addEventListener('click', function () { slaApply(true, true); });
  $('slaGoA').addEventListener('click', function () { slaApply(false, true); });
  [['slaSpreadR', 'slaSpread'], ['slaLiftR', 'slaLift'], ['slaGapR', 'slaGap']].forEach(function (p) {
    const r = $(p[0]), n = $(p[1]);
    r.addEventListener('input', function () { n.value = r.value; slaRespread(); });
    n.addEventListener('input', function () { r.value = n.value; slaRespread(); });
    r.addEventListener('change', function () { S.sla.armed = true; }); n.addEventListener('change', function () { S.sla.armed = true; });
  });
  ['slaW', 'slaD', 'slaMargin'].forEach(function (id) { $(id).addEventListener('change', function () { S.sla.armed = true; slaRespread(); S.sla.armed = true; dirty = true; }); });
  // the plate, its grid and the blade, drawn while the panel is open
  function drawSla() {
    if (!$('pop_sla').classList.contains('on') || S.sk) return;
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
