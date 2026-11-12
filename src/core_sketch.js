  // ================= parametric sketch: points shared by entities, constraints, dimensions, solver =================
  // m = { pts: [[u, v]], ents: [], cons: [] }. pts[0] is the sketch origin and never moves.
  // entities: {t:'line', a, b} · {t:'circle', c, r} · {t:'arc', c, a, b} (counter-clockwise from a to b) · {t:'point', p}
  // any entity can carry cons:true (construction geometry: not part of a profile; construction lines are revolve axes)
  const SK_DIMS = { dist: 1, hdist: 1, vdist: 1, pld: 1, ang: 1, lang: 1, rad: 1, diam: 1 };
  function skModel() { return { pts: [[0, 0]], ents: [], cons: [] }; }
  function skScale(m) { let s = 1; for (const p of m.pts) s = Math.max(s, Math.abs(p[0]), Math.abs(p[1])); for (const e of m.ents) if (e.t === 'circle') s = Math.max(s, e.r); return s; }
  // which numbers the solver may change: 2 per point (not the origin) and the radius of every circle
  function skVarMap(m) {
    const pv = new Int32Array(m.pts.length).fill(-1), rv = new Int32Array(m.ents.length).fill(-1);
    let n = 0;
    for (let i = 1; i < m.pts.length; i++) { pv[i] = n; n += 2; }
    m.ents.forEach(function (e, i) { if (e.t === 'circle') rv[i] = n++; });
    return { pv: pv, rv: rv, n: n };
  }
  function skGetX(m, map) {
    const x = new Float64Array(map.n);
    for (let i = 1; i < m.pts.length; i++) { x[map.pv[i]] = m.pts[i][0]; x[map.pv[i] + 1] = m.pts[i][1]; }
    m.ents.forEach(function (e, i) { if (map.rv[i] >= 0) x[map.rv[i]] = e.r; });
    return x;
  }
  function skSetX(m, map, x) {
    for (let i = 1; i < m.pts.length; i++) { m.pts[i][0] = x[map.pv[i]]; m.pts[i][1] = x[map.pv[i] + 1]; }
    m.ents.forEach(function (e, i) { if (map.rv[i] >= 0) e.r = x[map.rv[i]]; });
  }
  // residuals of every constraint (and the hidden "arc ends on its circle" rule), all in millimetres
  function skRes(m, map, x, S, only) {
    const out = [];
    const P = function (i) { return i === 0 ? m.pts[0] : [x[map.pv[i]], x[map.pv[i] + 1]]; };
    const E = function (i) { return m.ents[i]; };
    const R = function (i) { const e = m.ents[i]; if (e.t === 'circle') return x[map.rv[i]]; const c = P(e.c), a = P(e.a); return Math.hypot(a[0] - c[0], a[1] - c[1]); };
    const C = function (i) { return P(m.ents[i].c); };
    const D = function (i) { const e = m.ents[i], a = P(e.a), b = P(e.b); return [b[0] - a[0], b[1] - a[1]]; };
    const lineDist = function (p, i) { const e = E(i), a = P(e.a), d = D(i), l = Math.hypot(d[0], d[1]) || 1e-12; return (d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) / l; };
    const pair = function (c) { return c.p ? [P(c.p[0]), P(c.p[1])] : (function () { const e = E(c.e); return [P(e.a), P(e.b)]; })(); };
    if (!only) m.ents.forEach(function (e) { if (e.t === 'arc') { const c = P(e.c), a = P(e.a), b = P(e.b); out.push(Math.hypot(a[0] - c[0], a[1] - c[1]) - Math.hypot(b[0] - c[0], b[1] - c[1])); } });
    const list = only || m.cons;
    for (const c of list) {
      switch (c.t) {
        case 'h': { const q = pair(c); out.push(q[1][1] - q[0][1]); break; }
        case 'v': { const q = pair(c); out.push(q[1][0] - q[0][0]); break; }
        case 'on': { const p = P(c.p), e = E(c.e); if (e.t === 'line') out.push(lineDist(p, c.e)); else { const k = C(c.e); out.push(Math.hypot(p[0] - k[0], p[1] - k[1]) - R(c.e)); } break; }
        case 'mid': { const p = P(c.p), e = E(c.e), a = P(e.a), b = P(e.b); out.push(p[0] - (a[0] + b[0]) / 2, p[1] - (a[1] + b[1]) / 2); break; }
        case 'par': case 'perp': {
          const d1 = D(c.e[0]), d2 = D(c.e[1]), l1 = Math.hypot(d1[0], d1[1]) || 1e-12, l2 = Math.hypot(d2[0], d2[1]) || 1e-12, k = (l1 + l2) / 2;
          out.push((c.t === 'par' ? d1[0] * d2[1] - d1[1] * d2[0] : d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2) * k); break;
        }
        case 'tan': {
          const a = E(c.e[0]), b = E(c.e[1]);
          if (a.t === 'line' || b.t === 'line') { const li = a.t === 'line' ? c.e[0] : c.e[1], ci = a.t === 'line' ? c.e[1] : c.e[0]; out.push(Math.abs(lineDist(C(ci), li)) - R(ci)); }
          else { const p = C(c.e[0]), q = C(c.e[1]), d = Math.hypot(p[0] - q[0], p[1] - q[1]); out.push(c.k < 0 ? d - Math.abs(R(c.e[0]) - R(c.e[1])) : d - R(c.e[0]) - R(c.e[1])); }
          break;
        }
        case 'eq': {
          const a = E(c.e[0]);
          if (a.t === 'line') { const d1 = D(c.e[0]), d2 = D(c.e[1]); out.push(Math.hypot(d1[0], d1[1]) - Math.hypot(d2[0], d2[1])); } else out.push(R(c.e[0]) - R(c.e[1]));
          break;
        }
        case 'fix': { const p = P(c.p); out.push(p[0] - c.at[0], p[1] - c.at[1]); break; }
        case 'fixr': out.push(R(c.e) - c.v); break;
        case 'sym': {
          const p = P(c.p[0]), q = P(c.p[1]), mpt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], d = D(c.e), l = Math.hypot(d[0], d[1]) || 1e-12;
          out.push(lineDist(mpt, c.e), ((q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1]) / l); break;
        }
        case 'dist': { const q = pair(c); out.push(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) - c.v); break; }
        case 'hdist': { const q = pair(c); out.push((q[1][0] - q[0][0]) * (c.s || 1) - c.v); break; }
        case 'vdist': { const q = pair(c); out.push((q[1][1] - q[0][1]) * (c.s || 1) - c.v); break; }
        case 'pld': out.push(lineDist(P(c.p), c.e) * (c.s || 1) - c.v); break;
        case 'ang': case 'lang': {
          const d1 = c.t === 'lang' ? [1, 0] : D(c.e[0]), d2 = c.t === 'lang' ? D(c.e) : D(c.e[1]);
          let a = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) - (c.s || 1) * c.v * Math.PI / 180;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          out.push(a * S); break;
        }
        case 'rad': out.push(R(c.e) - c.v); break;
        case 'diam': out.push(2 * R(c.e) - c.v); break;
        default: break;
      }
    }
    return out;
  }
  function skJac(m, map, x, S, F0, only) {
    const n = map.n, J = [], h = 1e-7 * S;
    for (let j = 0; j < n; j++) {
      const keep = x[j];
      x[j] = keep + h; const Fp = skRes(m, map, x, S, only);
      x[j] = keep - h; const Fm = skRes(m, map, x, S, only);
      x[j] = keep;
      const col = new Float64Array(F0.length);
      for (let i = 0; i < F0.length; i++) col[i] = (Fp[i] - Fm[i]) / (2 * h);
      J.push(col);
    }
    return J;                                                // J[j][i] = dF_i / dx_j (column-major)
  }
  function skLinSolve(A, b) {                                // Gaussian elimination with partial pivoting (A is overwritten)
    const n = b.length;
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(A[k][k]);
      for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > mx) { mx = Math.abs(A[i][k]); p = i; }
      if (mx < 1e-300) continue;
      if (p !== k) { const t = A[p]; A[p] = A[k]; A[k] = t; const tb = b[p]; b[p] = b[k]; b[k] = tb; }
      for (let i = k + 1; i < n; i++) { const f = A[i][k] / A[k][k]; if (!f) continue; for (let j = k; j < n; j++) A[i][j] -= f * A[k][j]; b[i] -= f * b[k]; }
    }
    const x = new Float64Array(n);
    for (let k = n - 1; k >= 0; k--) { let s = b[k]; for (let j = k + 1; j < n; j++) s -= A[k][j] * x[j]; x[k] = Math.abs(A[k][k]) > 1e-300 ? s / A[k][k] : 0; }
    return x;
  }
  // Moves the sketch as little as possible until every constraint holds. opt.drag = {p: point, to: [u, v]} or
  // {e: entity, by: [du, dv]} pulls that geometry towards the mouse first (it then "sticks" to the cursor where it can).
  function skSolve(m, opt) {
    opt = opt || {};
    const map = skVarMap(m), n = map.n, S = skScale(m);
    if (!n) return { ok: skRes(m, map, new Float64Array(0), S).every(function (r) { return Math.abs(r) < 1e-7 * S; }) };
    const x0 = skGetX(m, map), x = Float64Array.from(x0), Wt = new Float64Array(n).fill(1);
    const heavy = function (i) { if (i > 0) Wt[map.pv[i]] = Wt[map.pv[i] + 1] = 1e4; };
    if (opt.drag) {
      const g = opt.drag;
      if (g.p !== undefined && g.p > 0) { x[map.pv[g.p]] = g.to[0]; x[map.pv[g.p] + 1] = g.to[1]; heavy(g.p); }
      if (g.e !== undefined) {
        const e = m.ents[g.e], ids = e.t === 'line' ? [e.a, e.b] : e.t === 'point' ? [e.p] : e.t === 'arc' ? [e.c, e.a, e.b] : [e.c];
        if (g.r !== undefined && map.rv[g.e] >= 0) { x[map.rv[g.e]] = g.r; Wt[map.rv[g.e]] = 1e4; }
        else for (const i of ids) if (i > 0) { x[map.pv[i]] = g.base[i][0] + g.by[0]; x[map.pv[i] + 1] = g.base[i][1] + g.by[1]; heavy(i); }
      }
    }
    const tol = 1e-9 * S;
    let ok = false;
    for (let it = 0; it < 60; it++) {
      const F = skRes(m, map, x, S);
      let mx = 0; for (const f of F) mx = Math.max(mx, Math.abs(f));
      if (mx < tol) { ok = true; break; }
      const J = skJac(m, map, x, S, F), mm = F.length, A = [];
      let tr = 0;
      for (let i = 0; i < mm; i++) {
        const row = new Float64Array(mm);
        for (let k = 0; k < mm; k++) { let s = 0; for (let j = 0; j < n; j++) { const a = J[j][i]; if (a) s += a * J[j][k] / Wt[j]; } row[k] = s; }
        tr += row[i]; A.push(row);
      }
      const mu = 1e-12 * (tr / Math.max(1, mm)) + 1e-30;
      for (let i = 0; i < mm; i++) A[i][i] += mu;
      const y = skLinSolve(A, Float64Array.from(F));
      let big = 0;
      const dx = new Float64Array(n);
      for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < mm; i++) s += J[j][i] * y[i]; dx[j] = -s / Wt[j]; big = Math.max(big, Math.abs(dx[j])); }
      const lim = 0.5 * S, f = big > lim ? lim / big : 1;
      for (let j = 0; j < n; j++) x[j] += f * dx[j];
      for (let j = 0; j < n; j++) if (!isFinite(x[j])) { it = 99; break; }
    }
    if (ok) { for (let i = 0; i < m.ents.length; i++) if (map.rv[i] >= 0 && x[map.rv[i]] < 0) ok = false; }
    if (ok) skSetX(m, map, x); else if (!opt.drag) skSetX(m, map, x0);
    return { ok: ok };
  }
  // degrees of freedom: which point coordinates / radii are still free to move
  function skAnalyse(m) {
    const map = skVarMap(m), n = map.n, S = skScale(m), x = skGetX(m, map), F = skRes(m, map, x, S), mm = F.length;
    const freeV = new Uint8Array(n);
    let rank = 0;
    if (n) {
      const J = skJac(m, map, x, S, F), A = [];
      for (let i = 0; i < mm; i++) { const r = new Float64Array(n); for (let j = 0; j < n; j++) r[j] = J[j][i]; A.push(r); }
      const piv = [], tol = 1e-7;
      let row = 0;
      for (let col = 0; col < n && row < mm; col++) {
        let p = row, mx = Math.abs(A[row][col]);
        for (let i = row + 1; i < mm; i++) if (Math.abs(A[i][col]) > mx) { mx = Math.abs(A[i][col]); p = i; }
        if (mx < tol) continue;
        const t = A[p]; A[p] = A[row]; A[row] = t;
        const inv = 1 / A[row][col];
        for (let j = col; j < n; j++) A[row][j] *= inv;
        for (let i = 0; i < mm; i++) { if (i === row) continue; const f = A[i][col]; if (!f) continue; for (let j = col; j < n; j++) A[i][j] -= f * A[row][j]; }
        piv.push(col); row++;
      }
      rank = piv.length;
      const isPiv = new Uint8Array(n); for (const c of piv) isPiv[c] = 1;
      for (let f = 0; f < n; f++) {                          // one null vector per free column
        if (isPiv[f]) continue;
        freeV[f] = 1;
        piv.forEach(function (c, r) { if (Math.abs(A[r][f]) > 1e-6) freeV[c] = 1; });
      }
    }
    const ptFree = m.pts.map(function (p, i) { return i > 0 && (freeV[map.pv[i]] || freeV[map.pv[i] + 1]) ? 1 : 0; });
    const entFree = m.ents.map(function (e, i) {
      const ids = e.t === 'line' ? [e.a, e.b] : e.t === 'point' ? [e.p] : e.t === 'arc' ? [e.c, e.a, e.b] : [e.c];
      return ids.some(function (k) { return ptFree[k]; }) || (map.rv[i] >= 0 && freeV[map.rv[i]]) ? 1 : 0;
    });
    return { rank: rank, n: n, dof: n - rank, ptFree: ptFree, entFree: entFree };
  }
  function skCurValue(m, c) {                                // the value a dimension would have on the sketch as drawn
    const keep = c.v; c.v = 0;
    const map = skVarMap(m), x = skGetX(m, map), r = skRes(m, map, x, skScale(m), [c]);
    c.v = keep;
    if (c.t === 'ang' || c.t === 'lang') return r[0] / skScale(m) * 180 / Math.PI * (c.s || 1);
    return r[0];
  }
  function skRefs(c) { return { e: c.e === undefined ? [] : [].concat(c.e), p: c.p === undefined ? [] : [].concat(c.p) }; }
  // remove unused points (not the origin) and renumber
  function skCompact(m) {
    const used = new Uint8Array(m.pts.length); used[0] = 1;
    for (const e of m.ents) for (const k of ['a', 'b', 'c', 'p']) if (e[k] !== undefined) used[e[k]] = 1;
    const keepC = m.cons.filter(function (c) { const r = skRefs(c); return r.e.every(function (i) { return i < m.ents.length && m.ents[i]; }) && r.p.every(function (i) { return used[i]; }); });
    const nid = new Int32Array(m.pts.length).fill(-1), pts = [];
    m.pts.forEach(function (p, i) { if (used[i]) { nid[i] = pts.length; pts.push(p); } });
    for (const e of m.ents) for (const k of ['a', 'b', 'c', 'p']) if (e[k] !== undefined) e[k] = nid[e[k]];
    for (const c of keepC) { if (c.p !== undefined) c.p = Array.isArray(c.p) ? c.p.map(function (i) { return nid[i]; }) : nid[c.p]; }
    m.pts = pts; m.cons = keepC;
  }
  // delete entities (by index); constraints that refer to them go too
  function skDeleteEnts(m, ids) {
    const del = new Set(ids), nid = new Int32Array(m.ents.length).fill(-1), ents = [];
    m.ents.forEach(function (e, i) { if (!del.has(i)) { nid[i] = ents.length; ents.push(e); } });
    m.cons = m.cons.filter(function (c) { return skRefs(c).e.every(function (i) { return !del.has(i); }); });
    for (const c of m.cons) if (c.e !== undefined) c.e = Array.isArray(c.e) ? c.e.map(function (i) { return nid[i]; }) : nid[c.e];
    m.ents = ents;
    skCompact(m);
  }
  // merge point q into point p (coincident); p = 0 keeps the origin
  function skMerge(m, p, q) {
    if (p === q) return;
    if (q === 0) { const t = p; p = q; q = t; }
    for (const e of m.ents) for (const k of ['a', 'b', 'c', 'p']) if (e[k] === q) e[k] = p;
    for (const c of m.cons) { if (Array.isArray(c.p)) c.p = c.p.map(function (i) { return i === q ? p : i; }); else if (c.p === q) c.p = p; }
    m.cons = m.cons.filter(function (c) { return !(Array.isArray(c.p) && c.p[0] === c.p[1]) && !(c.t === 'on' && (m.ents[c.e].a === c.p || m.ents[c.e].b === c.p)); });
    skCompact(m);
  }
  const skAng = function (c, p) { return Math.atan2(p[1] - c[1], p[0] - c[0]); };
  const sk2pi = function (a) { a %= 2 * Math.PI; return a < 0 ? a + 2 * Math.PI : a; };
  // the old flat form (lines / circles / arcs with coordinates) used for profiles and solids
  function skFlat(m) {
    const P = function (i) { return m.pts[i]; }, out = [];
    for (const e of m.ents) {
      if (e.t === 'line') out.push({ t: 'line', a: P(e.a).slice(), b: P(e.b).slice(), axis: !!e.cons });
      else if (e.cons || e.t === 'point') continue;
      else if (e.t === 'circle') out.push({ t: 'circle', c: P(e.c).slice(), r: e.r });
      else if (e.t === 'arc') { const c = P(e.c), a0 = skAng(c, P(e.a)); out.push({ t: 'arc', c: c.slice(), r: Math.hypot(P(e.a)[0] - c[0], P(e.a)[1] - c[1]), a0: a0, a1: a0 + sk2pi(skAng(c, P(e.b)) - a0) }); }
    }
    return out;
  }
  // build a model from flat entities (sketches from older files): equal end points become one point
  function skFromFlat(ents) {
    const m = skModel(), tol = 1e-7;
    const pt = function (p) { for (let i = 0; i < m.pts.length; i++) if (Math.abs(m.pts[i][0] - p[0]) < tol && Math.abs(m.pts[i][1] - p[1]) < tol) return i; m.pts.push([p[0], p[1]]); return m.pts.length - 1; };
    for (const e of ents || []) {
      if (e.t === 'line') m.ents.push({ t: 'line', a: pt(e.a), b: pt(e.b), cons: !!e.axis });
      else if (e.t === 'circle') m.ents.push({ t: 'circle', c: pt(e.c), r: e.r });
      else if (e.t === 'arc') m.ents.push({ t: 'arc', c: pt(e.c), a: pt([e.c[0] + e.r * Math.cos(e.a0), e.c[1] + e.r * Math.sin(e.a0)]), b: pt([e.c[0] + e.r * Math.cos(e.a1), e.c[1] + e.r * Math.sin(e.a1)]) });
    }
    return m;
  }

