  // ================= Reverse Design: Basic Surface Recognition =================
  // Pick mesh triangles (a click grows over the smooth patch, or paint with a brush; picked triangles turn red),
  // fit a plane / sphere / cylinder / cone (or let the app choose), then build it as a B-rep solid (exact, STEP)
  // with its axis / centre as geometry. A plane becomes a Plane geometry.
  S.rd = { body: null, sel: null, n: 0, fit: null, paint: null, brushAt: null, gpu: null, adj: null };
  // the selection engine also serves Remove face (pop_rf); the mode follows the open panel
  const rdMode = function () { return $('pop_rf').classList.contains('on') ? 'rf' : 'rd'; };
  const rdOpen = function () { return $('pop_rd').classList.contains('on') || $('pop_rf').classList.contains('on'); };
  const rdLive = function () { return rdOpen() && S.tool === 'select' && !S.sk; };   // the left button belongs to the panel only with the Select tool
  const rdNum = function (id, d) { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
  function rdOpt() {
    const m = document.querySelector('input[name=rdMeth]:checked');
    const px = rdMode();
    return { meth: m ? m.value : 'auto', brush: $(px + 'ModeB').checked, ang: Math.max(1, Math.min(60, rdNum(px + 'Ang', 15))), r: Math.max(1, rdNum(px + 'Brush', 20)),
      tol: Math.max(1e-4, rdNum('rdTol', 0.5)), fixR: $('rdFixR').checked ? Math.max(1e-4, rdNum('rdR', 5)) : 0, solid: $('rdSolid').checked, aux: $('rdAux').checked };
  }
  // ---------- selection ----------
  function rdSetBody(b) {
    if (S.rd.body === b) return;
    S.rd.body = b; S.rd.sel = b ? new Uint8Array(b.geo.indices.length / 3) : null; S.rd.n = 0; S.rd.adj = null; S.rd.fit = null;
  }
  function rdClear() { if (S.rd.sel) S.rd.sel.fill(0); S.rd.n = 0; rdChanged(); }
  function rdCount() { let n = 0; const s = S.rd.sel; if (s) for (let i = 0; i < s.length; i++) n += s[i]; S.rd.n = n; }
  // world corners, unit normal, area and centre of a triangle
  function rdTriW(b, dm, t) {
    const P = b.geo.positions, I = b.geo.indices, v = [];
    for (let k = 0; k < 3; k++) { const j = 3 * I[3 * t + k]; v.push(M.point(dm, [P[j], P[j + 1], P[j + 2]])); }
    const cr = V.cross(V.sub(v[1], v[0]), V.sub(v[2], v[0])), l = V.len(cr);
    return { v: v, n: l > 0 ? V.mul(cr, 1 / l) : [0, 0, 0], a: l / 2, c: V.mul(V.add(V.add(v[0], v[1]), v[2]), 1 / 3) };
  }
  // triangles sharing an edge (vertices are shared by index; equal positions are welded too)
  function rdAdj(b) {
    if (S.rd.adj) return S.rd.adj;
    const P = b.geo.positions, I = b.geo.indices, nt = I.length / 3, key = new Map(), wid = new Int32Array(P.length / 3);
    for (let i = 0; i < wid.length; i++) { const k = Math.round(P[3 * i] * 1e4) + ',' + Math.round(P[3 * i + 1] * 1e4) + ',' + Math.round(P[3 * i + 2] * 1e4); let j = key.get(k); if (j === undefined) { j = i; key.set(k, i); } wid[i] = j; }
    const em = new Map(), nb = [];
    for (let t = 0; t < nt; t++) {
      nb.push([]);
      for (let c = 0; c < 3; c++) {
        let a = wid[I[3 * t + c]], d = wid[I[3 * t + (c + 1) % 3]]; if (a === d) continue;
        if (a > d) { const x = a; a = d; d = x; }
        const k = a * 4294967296 + d, o = em.get(k);
        if (o === undefined) em.set(k, [t]); else o.push(t);
      }
    }
    em.forEach(function (ts) { for (let i = 0; i < ts.length; i++) for (let j = 0; j < ts.length; j++) if (i !== j) nb[ts[i]].push(ts[j]); });
    S.rd.adj = nb; return nb;
  }
  // a click: grow over neighbours while the surface bends less than the angle between two neighbouring triangles
  function rdGrow(b, t0, val) {
    const dm = dispMatrix(b), nb = rdAdj(b), sel = S.rd.sel, cosA = Math.cos(rdOpt().ang * Math.PI / 180), seen = new Uint8Array(sel.length), q = [t0], nrm = [];
    const N = function (t) { if (!nrm[t]) nrm[t] = rdTriW(b, dm, t).n; return nrm[t]; };
    seen[t0] = 1;
    while (q.length) {
      const t = q.pop(); sel[t] = val;
      for (const u of nb[t]) if (!seen[u] && V.dot(N(t), N(u)) >= cosA) { seen[u] = 1; q.push(u); }
    }
  }
  // the brush: a circle of fixed size on the screen (it does not change with zoom); every triangle facing the viewer
  // that the circle touches is picked, however big the triangle is
  function rdMaxEdge(b) {
    const g = b.geo; if (g.rdMaxE !== undefined) return g.rdMaxE;
    const P = g.positions, I = g.indices; let m = 0;
    for (let h = 0; h < I.length; h++) { const a = 3 * I[h], c = 3 * I[h % 3 === 2 ? h - 2 : h + 1], d = (P[a] - P[c]) ** 2 + (P[a + 1] - P[c + 1]) ** 2 + (P[a + 2] - P[c + 2]) ** 2; if (d > m) m = d; }
    g.rdMaxE = Math.sqrt(m); return g.rdMaxE;
  }
  function rdTouch(q, R, A, B, C) {                         // does the circle (q, R) touch the screen triangle ABC?
    const cr = function (p, u, v) { return (u[0] - p[0]) * (v[1] - p[1]) - (u[1] - p[1]) * (v[0] - p[0]); };
    const d1 = cr(q, A, B), d2 = cr(q, B, C), d3 = cr(q, C, A);
    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
    const seg = function (u, v) { const dx = v[0] - u[0], dy = v[1] - u[1], l = dx * dx + dy * dy; let t = l > 0 ? ((q[0] - u[0]) * dx + (q[1] - u[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(u[0] + dx * t - q[0], u[1] + dy * t - q[1]); };
    return seg(A, B) <= R || seg(B, C) <= R || seg(C, A) <= R;
  }
  function rdPaint(b, at, val, px, py) {
    const dm = dispMatrix(b), mi = M.inv(dm), vd = camDir(), Rpx = rdOpt().r;
    const e = V.norm(V.cross(vd, Math.abs(vd[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), q0 = project(at), q1 = project(V.add(at, e)), ppm = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1;
    const rW = Rpx / ppm, sc = Math.cbrt(Math.abs(M.det ? M.det(dm) : 1)) || 1, lim = (rW + rdMaxEdge(b) * sc) / sc, lim2 = lim * lim;
    const q = (px === undefined) ? q0 : [px, py], depthTol = Math.max(3 * rW, sceneSize() * 0.01);
    const pl = M.point(mi, at), P = b.geo.positions, I = b.geo.indices, sel = S.rd.sel, view = M.vec(mi, vd), nt = I.length / 3;
    for (let t = 0; t < nt; t++) {
      if (sel[t] === val) continue;
      let near = false;
      for (let k = 0; k < 3 && !near; k++) { const j = 3 * I[3 * t + k], dx = P[j] - pl[0], dy = P[j + 1] - pl[1], dz = P[j + 2] - pl[2]; if (dx * dx + dy * dy + dz * dz <= lim2) near = true; }
      if (!near) continue;
      const a = 3 * I[3 * t], c = 3 * I[3 * t + 1], d = 3 * I[3 * t + 2];
      const n = V.cross([P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]], [P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]]);
      if (V.dot(n, view) >= 0) continue;                      // facing away
      const W = [a, c, d].map(function (j) { return M.point(dm, [P[j], P[j + 1], P[j + 2]]); });
      const cz = V.dot(V.sub(V.mul(V.add(V.add(W[0], W[1]), W[2]), 1 / 3), at), vd);
      if (cz > depthTol) continue;                            // behind the surface under the brush
      if (rdTouch(q, Rpx, project(W[0]), project(W[1]), project(W[2]))) sel[t] = val;
    }
  }
  function camDir() { const r = screenRay(canvas.clientWidth / 2, canvas.clientHeight / 2); return V.norm(r.d); }
  function rdChanged() {
    rdCount();
    S.rd.fit = S.rd.n >= 3 && rdMode() === 'rd' ? rdFitAll() : null;
    rdShow(); rdGpu(); dirty = true;
  }
  // ---------- fitting ----------
  function rdData() {
    const b = S.rd.body, dm = dispMatrix(b), sel = S.rd.sel, I = b.geo.indices, P = b.geo.positions, mark = new Uint8Array(P.length / 3), pts = [], tris = [];
    for (let t = 0; t < sel.length; t++) {
      if (!sel[t]) continue;
      tris.push(rdTriW(b, dm, t));
      for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; if (!mark[v]) { mark[v] = 1; pts.push(M.point(dm, [P[3 * v], P[3 * v + 1], P[3 * v + 2]])); } }
    }
    let A = 0; const c = [0, 0, 0];
    for (const q of tris) { A += q.a; c[0] += q.c[0] * q.a; c[1] += q.c[1] * q.a; c[2] += q.c[2] * q.a; }
    return { pts: pts, tris: tris, A: A, c: A > 0 ? V.mul(c, 1 / A) : pts[0] };
  }
  function rdSolve(A, b) {                                  // small dense linear solve (Gauss with pivoting)
    const n = b.length, m = A.map(function (r, i) { return r.concat([b[i]]); });
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
      if (Math.abs(m[p][i]) < 1e-300) return null;
      const t = m[i]; m[i] = m[p]; m[p] = t;
      for (let r = 0; r < n; r++) { if (r === i) continue; const f = m[r][i] / m[i][i]; for (let k = i; k <= n; k++) m[r][k] -= f * m[i][k]; }
    }
    return m.map(function (r, i) { return r[n] / r[i]; });
  }
  const rdSorted = function (C) { return slaEig(C).sort(function (a, b) { return a.l - b.l; }).map(function (e) { return { v: V.norm(e.v), l: e.l }; }); };
  function rdStats(res) { let s = 0, mx = 0; for (const r of res) { s += r * r; if (Math.abs(r) > mx) mx = Math.abs(r); } return { rms: Math.sqrt(s / Math.max(1, res.length)), max: mx }; }
  function rdPlane(d) {
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of d.pts) { const q = V.sub(p, d.c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += q[i] * q[j]; }
    const e = rdSorted(C), n = e[0].v, u = e[2].v;
    let ex = 0; const res = d.pts.map(function (p) { const q = V.sub(p, d.c); ex = Math.max(ex, Math.abs(V.dot(q, u)), Math.abs(V.dot(q, V.cross(n, u)))); return V.dot(q, n); });
    return Object.assign({ type: 'plane', p: d.c, n: n, u: u, ext: ex }, rdStats(res));
  }
  function rdSphere(d, fixR) {
    const AtA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], Atb = [0, 0, 0, 0];
    for (const p of d.pts) { const q = V.sub(p, d.c), row = [q[0], q[1], q[2], 1], rhs = -(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]); for (let i = 0; i < 4; i++) { Atb[i] += row[i] * rhs; for (let j = 0; j < 4; j++) AtA[i][j] += row[i] * row[j]; } }
    const s = rdSolve(AtA, Atb); if (!s) return null;
    let c = V.add(d.c, [-s[0] / 2, -s[1] / 2, -s[2] / 2]), R = Math.sqrt(Math.max(0, (s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) / 4 - s[3]));
    if (fixR) { R = fixR; for (let it = 0; it < 30; it++) { const acc = [0, 0, 0]; for (const p of d.pts) { const w = V.sub(p, c), l = V.len(w) || 1; acc[0] += p[0] - R * w[0] / l; acc[1] += p[1] - R * w[1] / l; acc[2] += p[2] - R * w[2] / l; } c = V.mul(acc, 1 / d.pts.length); } }
    if (!(R > 0)) return null;
    return Object.assign({ type: 'sphere', c: c, r: R }, rdStats(d.pts.map(function (p) { return V.len(V.sub(p, c)) - R; })));
  }
  function rdBasis(a) { const e1 = V.norm(V.cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); return [e1, V.cross(a, e1)]; }
  function rdCyl(d, fixR) {
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const q of d.tris) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += q.a * q.n[i] * q.n[j];
    const a = rdSorted(C)[0].v, B = rdBasis(a), q2 = d.pts.map(function (p) { const w = V.sub(p, d.c); return [V.dot(w, B[0]), V.dot(w, B[1])]; });
    const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Atb = [0, 0, 0];
    for (const q of q2) { const row = [q[0], q[1], 1], rhs = -(q[0] * q[0] + q[1] * q[1]); for (let i = 0; i < 3; i++) { Atb[i] += row[i] * rhs; for (let j = 0; j < 3; j++) AtA[i][j] += row[i] * row[j]; } }
    const s = rdSolve(AtA, Atb); if (!s) return null;
    let cx = -s[0] / 2, cy = -s[1] / 2, R = Math.sqrt(Math.max(0, cx * cx + cy * cy - s[2]));
    if (fixR) { R = fixR; for (let it = 0; it < 30; it++) { let ax = 0, ay = 0; for (const q of q2) { const dx = q[0] - cx, dy = q[1] - cy, l = Math.hypot(dx, dy) || 1; ax += q[0] - R * dx / l; ay += q[1] - R * dy / l; } cx = ax / q2.length; cy = ay / q2.length; } }
    if (!(R > 0)) return null;
    const o = V.add(d.c, V.add(V.mul(B[0], cx), V.mul(B[1], cy)));
    let t0 = Infinity, t1 = -Infinity; const res = [];
    d.pts.forEach(function (p, i) { const t = V.dot(V.sub(p, o), a); if (t < t0) t0 = t; if (t > t1) t1 = t; res.push(Math.hypot(q2[i][0] - cx, q2[i][1] - cy) - R); });
    return Object.assign({ type: 'cyl', o: o, a: a, r: R, t0: t0, t1: t1, e1: B[0] }, rdStats(res));
  }
  function rdCone(d) {
    const mn = [0, 0, 0]; let A = 0;
    for (const q of d.tris) { A += q.a; for (let i = 0; i < 3; i++) mn[i] += q.a * q.n[i]; }
    for (let i = 0; i < 3; i++) mn[i] /= A || 1;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const q of d.tris) { const w = V.sub(q.n, mn); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += q.a * w[i] * w[j]; }
    let a = rdSorted(C)[0].v; const B = rdBasis(a);
    // the axis meets every normal line: least-squares point of the normal lines seen along the axis
    const M2 = [[0, 0], [0, 0]], rhs = [0, 0];
    for (const q of d.tris) {
      const w = V.sub(q.c, d.c), c2 = [V.dot(w, B[0]), V.dot(w, B[1])], m = [V.dot(q.n, B[0]), V.dot(q.n, B[1])], l = Math.hypot(m[0], m[1]); if (l < 1e-9) continue;
      const u = [m[0] / l, m[1] / l], P2 = [[1 - u[0] * u[0], -u[0] * u[1]], [-u[0] * u[1], 1 - u[1] * u[1]]], wq = q.a;
      for (let i = 0; i < 2; i++) { rhs[i] += wq * (P2[i][0] * c2[0] + P2[i][1] * c2[1]); for (let j = 0; j < 2; j++) M2[i][j] += wq * P2[i][j]; }
    }
    const x = rdSolve(M2, rhs); if (!x) return null;
    const o = V.add(d.c, V.add(V.mul(B[0], x[0]), V.mul(B[1], x[1])));
    const tr = d.pts.map(function (p) { const w = V.sub(p, o), t = V.dot(w, a); return [t, V.len(V.sub(w, V.mul(a, t)))]; });
    let st = 0, sr = 0, stt = 0, str = 0; const n = tr.length;
    for (const q of tr) { st += q[0]; sr += q[1]; stt += q[0] * q[0]; str += q[0] * q[1]; }
    const den = n * stt - st * st; if (Math.abs(den) < 1e-12) return null;
    let k = (n * str - st * sr) / den, r0 = (sr - k * st) / n;
    if (k < 0) { a = V.mul(a, -1); k = -k; for (const q of tr) q[0] = -q[0]; }   // the radius grows along the axis
    r0 = (sr - k * tr.reduce(function (s, q) { return s + q[0]; }, 0)) / n;
    let t0 = Infinity, t1 = -Infinity; const cs = Math.cos(Math.atan(k)), res = [];
    for (const q of tr) { if (q[0] < t0) t0 = q[0]; if (q[0] > t1) t1 = q[0]; res.push((q[1] - (r0 + k * q[0])) * cs); }
    return Object.assign({ type: 'cone', o: o, a: a, r0: r0, k: k, t0: t0, t1: t1, e1: rdBasis(a)[0], half: Math.atan(k) * 180 / Math.PI }, rdStats(res));
  }
  // how well the triangle normals agree with the fitted surface (RMS of the sine of the angle, area-weighted)
  function rdNErr(f, d) {
    let s = 0, A = 0;
    for (const q of d.tris) {
      let m = null;
      if (f.type === 'plane') m = f.n;
      else if (f.type === 'sphere') m = V.norm(V.sub(q.c, f.c));
      else {
        const w = V.sub(q.c, f.o), t = V.dot(w, f.a), rad = V.sub(w, V.mul(f.a, t)), l = V.len(rad); if (l < 1e-12) continue;
        const rh = V.mul(rad, 1 / l);
        if (f.type === 'cyl') m = rh; else { const th = Math.atan(f.k); m = V.sub(V.mul(rh, Math.cos(th)), V.mul(f.a, Math.sin(th))); }
      }
      const c = V.dot(q.n, m); s += q.a * Math.max(0, 1 - c * c); A += q.a;
    }
    return A > 0 ? Math.sqrt(s / A) : 1;
  }
  function rdFitAll() {
    const o = rdOpt(), d = rdData(); if (d.pts.length < 4) return null;
    const out = {};
    const tryF = function (k, f) { try { out[k] = f(); } catch (e) { out[k] = null; } };
    tryF('plane', function () { return rdPlane(d); });
    tryF('sphere', function () { return rdSphere(d, o.fixR); });
    tryF('cyl', function () { return rdCyl(d, o.fixR); });
    tryF('cone', function () { return rdCone(d); });
    for (const k in out) if (out[k]) out[k].nerr = rdNErr(out[k], d);
    let pickK = o.meth;
    if (pickK === 'auto') {
      const size = out.plane ? Math.max(out.plane.ext, 1e-6) : 1;
      if (out.plane && out.plane.rms <= o.tol * 0.5) pickK = 'plane';
      else {
        // candidates whose triangle normals follow the surface (within ~8°), best distance fit first; simpler shapes win near-ties
        const sc = {}, okN = function (f) { return f && f.nerr < 0.14; };
        if (out.plane) sc.plane = { e: out.plane.rms, n: out.plane.nerr };
        if (out.sphere && out.sphere.r < size * 60) sc.sphere = { e: out.sphere.rms * 1.1, n: out.sphere.nerr };
        if (out.cyl && out.cyl.r < size * 60) sc.cyl = { e: out.cyl.rms * 1.1, n: out.cyl.nerr };
        if (out.cone && out.cone.half > 0.5 && out.cone.half < 89) sc.cone = { e: out.cone.rms * 1.35, n: out.cone.nerr };
        const ks = Object.keys(sc), good = ks.filter(function (k) { return okN(out[k]); });
        pickK = (good.length ? good.sort(function (a, b) { return sc[a].e - sc[b].e; }) : ks.sort(function (a, b) { return sc[a].n - sc[b].n; }))[0] || 'plane';
      }
    }
    return { all: out, k: pickK, f: out[pickK] || null, d: { n: d.pts.length } };
  }
  // ---------- panel text ----------
  const RD_NAME = { plane: ['Plane', 'Plane'], sphere: ['Sphere', 'Sphere'], cyl: ['Cylinder', 'Cylinder'], cone: ['Cone', 'Cone'] };
  function rdShow() {
    if (rdMode() === 'rf') { rfShow(); return; }
    const F = S.rd.fit, el = $('rdRes'), o = rdOpt();
    $('rdCnt').textContent = S.rd.n ? S.rd.n + L(' tam giác', ' triangles') + (S.rd.body ? ' · ' + S.rd.body.name : '') : L('Chưa chọn', 'Nothing picked');
    $('rdOk').disabled = !(F && F.f);
    if (!F || !F.f) { el.textContent = S.rd.n ? L('Chưa nhận ra được mặt nào', 'No surface recognised yet') : ''; return; }
    const f = F.f, nm = L.apply(null, RD_NAME[f.type]);
    let t = nm + (o.meth === 'auto' ? L(' (tự nhận)', ' (automatic)') : '') + '\n';
    if (f.type === 'plane') t += 'N = ' + f.n.map(f3).join(', ') + '\n';
    if (f.type === 'sphere') t += 'R = ' + f2(f.r) + ' mm · C = ' + f.c.map(f2).join(', ') + '\n';
    if (f.type === 'cyl') t += 'R = ' + f2(f.r) + ' mm · ' + L('dài ', 'length ') + f2(f.t1 - f.t0) + ' mm\n' + L('Trục ', 'Axis ') + f.a.map(f3).join(', ') + '\n';
    if (f.type === 'cone') t += L('Nửa góc ', 'Half angle ') + f2(f.half) + '° · R ' + f2(Math.max(0, f.r0 + f.k * f.t0)) + ' → ' + f2(f.r0 + f.k * f.t1) + ' mm\n' + L('Trục ', 'Axis ') + f.a.map(f3).join(', ') + '\n';
    t += L('Sai lệch RMS ', 'RMS deviation ') + f3(f.rms) + ' mm · max ' + f3(f.max) + ' mm';
    const nd = Math.asin(Math.min(1, f.nerr || 0)) * 180 / Math.PI; t += ' · ' + L('lệch pháp tuyến ', 'normal deviation ') + f2(nd) + '°';
    el.textContent = t;
    const bad = f.max > o.tol || (f.nerr || 0) > 0.14;
    el.classList.toggle('warn', bad);
    if (bad) el.textContent += '\n' + (f.max > o.tol ? L('Vượt sai lệch cho phép (', 'Above the allowed error (') + f3(o.tol) + ' mm)' : L('Pháp tuyến không khớp mặt này', 'The normals do not follow this surface'));
  }
  const f3 = function (v) { return (+v).toFixed(3); };
  // ---------- preview & red triangles ----------
  function rdGpu() {
    const b = S.rd.body; if (!gl) return;
    if (!S.rd.gpu) S.rd.gpu = { vao: gl.createVertexArray(), idx: gl.createBuffer(), n: 0, geo: null };
    const g = S.rd.gpu;
    if (!b || !S.rd.n) { g.n = 0; return; }
    const I = b.geo.indices, sel = S.rd.sel, out = new Uint32Array(S.rd.n * 3);
    let k = 0; for (let t = 0; t < sel.length; t++) if (sel[t]) { out[k++] = I[3 * t]; out[k++] = I[3 * t + 1]; out[k++] = I[3 * t + 2]; }
    const o = ensureGL(b.geo);
    gl.bindVertexArray(g.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.pos); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    g.n = k; g.geo = b.geo;
  }
  function drawRdSel() {
    const g = S.rd.gpu, b = S.rd.body;
    if (!g || !g.n || !b || !rdOpen() || !b.visible || S.sk) return;
    if (g.geo !== b.geo) { rdSetBody(null); return; }
    gl.uniformMatrix4fv(U.uM, false, dispMatrix(b)); gl.frontFace(gl.CCW);
    gl.uniform4f(U.uColor, 0.93, 0.16, 0.12, 1); gl.uniform1f(U.uSel, 0); gl.uniform1i(U.uMode, 0);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
    gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  function drawRd() {
    if (!rdOpen() || S.sk) return;
    const o = rdOpt();
    if (o.brush && S.rd.brushPx && S.rd.brushOn) {             // the brush outline: same size on screen at any zoom
      const q = S.rd.brushPx;
      ctx.strokeStyle = S.rd.erase ? '#9cc4ee' : '#ff5a4a'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(q[0], q[1], o.r, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.globalAlpha = 1;
    }
    const F = S.rd.fit; if (!F || !F.f) return;
    const f = F.f, ln = function (pts, close) { ctx.beginPath(); pts.forEach(function (p, i) { const s = project(p); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); if (close) ctx.closePath(); ctx.stroke(); };
    const circ = function (c, a, e1, r) { const e2 = V.cross(a, e1), pts = []; for (let i = 0; i <= 48; i++) { const t = i / 48 * Math.PI * 2; pts.push(V.add(c, V.add(V.mul(e1, r * Math.cos(t)), V.mul(e2, r * Math.sin(t))))); } return pts; };
    ctx.strokeStyle = '#3ce0ff'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 3]);
    if (f.type === 'plane') { const v = V.cross(f.n, f.u), s = f.ext * 1.05; ln([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) { return V.add(f.p, V.add(V.mul(f.u, k[0] * s), V.mul(v, k[1] * s))); }), true); }
    if (f.type === 'sphere') { for (const a of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) ln(circ(f.c, a, rdBasis(a)[0], f.r)); }
    if (f.type === 'cyl' || f.type === 'cone') {
      const R = function (t) { return f.type === 'cyl' ? f.r : Math.max(0, f.r0 + f.k * t); }, e2 = V.cross(f.a, f.e1);
      const c0 = V.add(f.o, V.mul(f.a, f.t0)), c1 = V.add(f.o, V.mul(f.a, f.t1));
      ln(circ(c0, f.a, f.e1, R(f.t0))); ln(circ(c1, f.a, f.e1, R(f.t1)));
      for (const e of [f.e1, e2, V.mul(f.e1, -1), V.mul(e2, -1)]) ln([V.add(c0, V.mul(e, R(f.t0))), V.add(c1, V.mul(e, R(f.t1)))]);
      ctx.strokeStyle = '#c58bff'; ctx.setLineDash([8, 3, 2, 3]); const ex = (f.t1 - f.t0) * 0.15; ln([V.add(f.o, V.mul(f.a, f.t0 - ex)), V.add(f.o, V.mul(f.a, f.t1 + ex))]);
    }
    ctx.setLineDash([]);
  }
  // ---------- mouse ----------
  function rdHit(px, py) {
    const only = S.rd.body && S.rd.n ? [S.rd.body].concat(S.bodies.filter(function (b) { return b !== S.rd.body; })) : null;
    return pick(px, py, only ? only.filter(function (b) { return b.visible; }) : null);
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!rdLive() || e.button !== 0 || busy) return;
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, h = rdHit(px, py);
    e.stopImmediatePropagation(); e.preventDefault();
    if (!h) return;
    if (S.rd.body !== h.body) { rdSetBody(h.body); }
    const erase = e.ctrlKey || e.metaKey;
    if (rdOpt().brush) {
      S.rd.paint = { erase: erase }; S.rd.erase = erase;
      rdPaint(h.body, h.point, erase ? 0 : 1, px, py); rdChanged();
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { }
    } else {
      rdGrow(h.body, h.tri, erase || (S.rd.sel[h.tri] && !e.shiftKey) ? 0 : 1); rdChanged();
    }
  }, true);
  canvas.addEventListener('pointermove', function (e) {
    if (!rdLive() || !rdOpt().brush) { if (S.rd.brushOn) { S.rd.brushOn = false; S.rd.brushAt = null; dirty = true; } return; }
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, h = rdHit(px, py);
    S.rd.brushAt = h ? h.point : null; S.rd.brushPx = [px, py]; S.rd.brushOn = true; S.rd.erase = e.ctrlKey || e.metaKey; dirty = true;
    if (S.rd.paint && h && (e.buttons & 1)) {
      if (S.rd.body !== h.body) return;
      rdPaint(h.body, h.point, S.rd.paint.erase ? 0 : 1, px, py); rdCount(); rdGpu();
      clearTimeout(S.rd.tm); S.rd.tm = setTimeout(rdChanged, 60);
    }
  }, true);
  window.addEventListener('pointerup', function () { if (S.rd.paint) { S.rd.paint = null; rdChanged(); } });
  canvas.addEventListener('pointerleave', function () { if (S.rd.brushOn) { S.rd.brushOn = false; S.rd.brushAt = null; dirty = true; } });
  // ---------- build ----------
  function rdGeoQuiet(g) {
    g.id = S.geoSeq++; g.vis = true;
    g.name = GEO_PFX[g.type] + (S.geos.filter(function (o) { return o.type === g.type; }).length + 1);
    S.geos.push(g); return g;
  }
  function rdRecipe(f) {
    if (f.type === 'cyl') {
      const o = V.add(f.o, V.mul(f.a, f.t0)), u = f.e1, v = V.cross(f.a, u);
      return { type: 'extrude', frame: { o: o, u: u, v: v, n: f.a }, ents: [{ t: 'circle', c: [0, 0], r: f.r }], m: null, sketchId: null, off: [], fromMesh: true,
        params: { op: 'new', depth: Math.max(1e-3, f.t1 - f.t0), sym: false, flip: false, draft: 0, edge: 'none', edgeSize: 0, edgeBoth: false, shell: 0 }, feats: [] };
    }
    if (f.type === 'cone') {
      const h = Math.max(1e-3, f.t1 - f.t0), r0 = Math.max(0, f.r0 + f.k * f.t0), r1 = Math.max(0, f.r0 + f.k * f.t1), o = V.add(f.o, V.mul(f.a, f.t0)), u = f.a, v = f.e1;
      const P = [[0, 0], [h, 0], [h, r1]].concat(r0 > 1e-6 ? [[0, r0]] : []), ents = [];
      for (let i = 0; i < P.length; i++) ents.push({ t: 'line', a: P[i], b: P[(i + 1) % P.length] });
      return { type: 'revolve', frame: { o: o, u: u, v: v, n: V.cross(u, v) }, ents: ents, m: null, sketchId: null, off: [], fromMesh: true, params: { op: 'new', axis: 'u', angle: 360 }, feats: [] };
    }
    if (f.type === 'sphere') {
      const B = rdBasis([0, 0, 1]), R = f.r;
      return { type: 'revolve', frame: { o: f.c, u: B[0], v: B[1], n: V.cross(B[0], B[1]) }, ents: [{ t: 'arc', c: [0, 0], r: R, a0: -Math.PI / 2, a1: Math.PI / 2 }, { t: 'line', a: [0, R], b: [0, -R] }], m: null, sketchId: null, off: [], fromMesh: true, params: { op: 'new', axis: 'v', angle: 360 }, feats: [] };
    }
    return null;
  }
  async function rdApply() {
    const F = S.rd.fit; if (!F || !F.f || blocked()) return;
    const f = F.f, o = rdOpt();
    pushUndo();
    const made = [];
    if (f.type === 'plane') made.push(rdGeoQuiet({ type: 'plane', p: f.p.slice(), n: f.n.slice(), u: f.u.slice(), size: Math.max(f.ext * 2.1, 1e-3) }).name);
    if (o.aux && (f.type === 'cyl' || f.type === 'cone')) { const ex = (f.t1 - f.t0) * 0.15; made.push(rdGeoQuiet({ type: 'axis', p: V.add(f.o, V.mul(f.a, f.t0 - ex)), p2: V.add(f.o, V.mul(f.a, f.t1 + ex)) }).name); }
    if (o.aux && f.type === 'sphere') made.push(rdGeoQuiet({ type: 'point', p: f.c.slice() }).name);
    if (o.aux && f.type === 'cone' && f.k > 1e-6) made.push(rdGeoQuiet({ type: 'point', p: V.add(f.o, V.mul(f.a, -f.r0 / f.k)) }).name);
    const r = o.solid ? rdRecipe(f) : null;
    if (r) {
      setBusy(true, L('Dựng khối B-rep...', 'Building the B-rep solid...'));
      let bm = null; try { await brepLib(); bm = await brepMeshOf(r); } catch (e) { bm = null; }
      let geo = null;
      if (bm) geo = brGeo(bm);
      else { try { const m = featMesh(r.type, { frame: r.frame, ents: r.ents }, r.params, r.off); geo = makeGeo(m.positions, m.indices); } catch (e) { geo = null; } }
      setBusy(false);
      if (geo) {
        const nm = f.type === 'cyl' ? 'Cylinder R' + f2(f.r) : f.type === 'cone' ? 'Cone ' + f2(f.half * 2) + '°' : 'Sphere R' + f2(f.r);
        const b = addBody(nm, geo, { solid: r }); b.geoBrep = !!bm; made.unshift(b.name);
      } else flash(L('Không dựng được khối từ mặt này', 'Could not build a solid from this surface'), true);
    }
    updateSketchList(); geomChanged(); sceneChanged(false); refresh();
    if (made.length) flash(L('Đã tạo: ', 'Created: ') + made.join(', '));
    rdClear();
  }
  // ---------- Remove face ----------
  function rfShow() {
    const b = S.rd.body;
    $('rfCnt').textContent = S.rd.n ? S.rd.n + L(' tam giác · ', ' triangles · ') + b.name : L('Chưa chọn mặt', 'No face picked');
    $('rfOk').disabled = !S.rd.n;
    $('rfRes').textContent = !S.rd.n ? '' : b.solid ? L('Khối B-rep: xoá mặt rồi kéo dài các mặt phẳng kề để vá (lỗ, boss, fillet, chamfer). Nếu lõi B-rep không làm được, khối sẽ được vá trên mesh và chuyển thành mesh.', 'B-rep solid: the faces go and the neighbouring planes extend to close the gap (holes, bosses, fillets, chamfers). If the B-rep engine cannot, it is patched as a mesh and becomes a mesh body.') : L('Mesh: xoá các tam giác đã chọn rồi vá kín lỗ.', 'Mesh: the picked triangles go and the hole is patched.');
  }
  async function rfApply() {
    const b = S.rd.body; if (!b || !S.rd.n || blocked()) return;
    const sel = S.rd.sel, nt = sel.length;
    if (S.rd.n >= nt) { flash(L('Không thể xoá mọi mặt của body', 'Cannot remove every face of the body'), true); return; }
    setBusy(true, 'Remove face...');
    try {
      const P = b.geo.positions, I = b.geo.indices;
      if (b.solid && brCan(b.solid)) {                         // exact: the engine removes the faces and heals the gap
        const at = [];
        for (let t = 0; t < nt; t++) if (sel[t]) { const a = 3 * I[3 * t], c = 3 * I[3 * t + 1], d = 3 * I[3 * t + 2]; at.push([(P[a] + P[c] + P[d]) / 3, (P[a + 1] + P[c + 1] + P[d + 1]) / 3, (P[a + 2] + P[c + 2] + P[d + 2]) / 3]); }
        const rec = { type: 'removeface', at: at };
        const bm = await brepMeshOf(Object.assign({}, b.solid, { feats: (b.solid.feats || []).concat([rec]) }));
        if (bm) {
          pushUndo();
          setGeo(b, brGeo(bm), true); b.geoBrep = true; b.solid.feats = (b.solid.feats || []).concat([rec]);
          setBusy(false); rdSetBody(null); rdChanged(); geomChanged(); refresh();
          flash(L('Đã xoá mặt (B-rep)', 'Faces removed (B-rep)')); return;
        }
      }
      const keep = [];
      for (let t = 0; t < nt; t++) if (!sel[t]) keep.push(I[3 * t], I[3 * t + 1], I[3 * t + 2]);
      const lvl = +$('rfFill').value || 1;
      const r = await run('fill', { mesh: { positions: P, indices: new Uint32Array(keep) }, opt: { level: lvl, maxPerimeter: 0, stitch: 0 } });
      pushUndo();
      const wasSolid = !!b.solid;
      setGeo(b, makeGeo(r.positions, r.indices));
      setBusy(false); rdSetBody(null); rdChanged(); geomChanged(); refresh();
      flash((wasSolid ? L('Lõi B-rep chưa xoá được mặt này: đã vá trên mesh, khối thành mesh. ', 'The B-rep engine could not remove these faces: patched as a mesh, the body is now a mesh. ') : '') +
        L('Đã xoá mặt và vá ', 'Faces removed, patched ') + r.filled + '/' + r.holes + L(' lỗ', ' holes'), true);
    } catch (e) { setBusy(false); showError(e); }
  }
  $('rfOk').addEventListener('click', function () { rfApply().catch(showError); });
  $('rfClr').addEventListener('click', rdClear);
  // ---------- panel ----------
  $('rdOk').addEventListener('click', function () { rdApply().catch(showError); });
  [['rd', 'rf'], ['rf', 'rd']].forEach(function (p) {
    document.querySelectorAll('#ribbon button.popb[data-pop=' + p[0] + ']').forEach(function (bt) { bt.addEventListener('click', function () {
      if ($('pop_' + p[0]).classList.contains('on')) { $('pop_' + p[1]).classList.remove('on'); if (S.tool !== 'select') setTool('select'); rdShow(); dirty = true; }
    }); });
  });
  $('rdClr').addEventListener('click', rdClear);
  document.querySelectorAll('input[name=rdMeth]').forEach(function (r) { r.addEventListener('change', function () { if (S.rd.n) rdChanged(); }); });
  ['rdFixR', 'rdR', 'rdTol'].forEach(function (id) { $(id).addEventListener('input', function () { if (S.rd.n) rdChanged(); else rdShow(); }); });
  [['rdBrushR', 'rdBrush'], ['rdAngR', 'rdAng'], ['rdTolR', 'rdTol'], ['rfBrushR', 'rfBrush'], ['rfAngR', 'rfAng']].forEach(function (p) {
    const r = $(p[0]), n = $(p[1]);
    r.addEventListener('input', function () { n.value = r.value; n.dispatchEvent(new Event('input')); dirty = true; });
    n.addEventListener('input', function () { r.value = n.value; dirty = true; });
  });
  ['rd', 'rf'].forEach(function (px) { [px + 'ModeC', px + 'ModeB'].forEach(function (id) { $(id).addEventListener('change', function () { $(px + 'BrushRow').style.opacity = $(px + 'ModeB').checked ? 1 : 0.45; $(px + 'AngRow').style.opacity = $(px + 'ModeB').checked ? 0.45 : 1; dirty = true; }); }); });
  rdShow();
