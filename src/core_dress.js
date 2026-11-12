  // ================= tool bodies for solid edits (the booleans run in Manifold) =================
  const v3 = {
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }, add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    mul: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }, dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    norm: function (a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  };
  const triN = function (P, I, t) { const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2]; return v3.norm(v3.cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]])); };
  const vtx = function (P, i) { return [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; };
  // A body that, subtracted (convex edges) or added (concave edges), rounds or bevels a run of edges.
  // chains: [{vs: vertex ids along the edge, r1: region on side 1}], reg: region of every triangle (from features)
  // returns {conv: [meshes], conc: [meshes]}
  function edgeTool(mesh, reg, chains, size, kind) {
    const P = mesh.positions, I = mesh.indices, nv = P.length / 3, want = new Map();
    for (const ch of chains) for (let i = 0; i + 1 < ch.vs.length; i++) { const a = ch.vs[i], b = ch.vs[i + 1]; want.set(a < b ? a * nv + b : b * nv + a, []); }
    for (let t = 0; t < I.length / 3; t++) for (let c = 0; c < 3; c++) {
      const a = I[3 * t + c], b = I[3 * t + (c + 1) % 3], l = want.get(a < b ? a * nv + b : b * nv + a);
      if (l) l.push({ t: t, third: I[3 * t + (c + 2) % 3] });
    }
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[3 * i + k]); mx[k] = Math.max(mx[k], P[3 * i + k]); }
    const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1, pad = Math.max(0.15 * size, 2e-3 * diag);
    const T = { conv: [], conc: [] };
    for (const ch of chains) {
      const vs = ch.vs, n = vs.length, closed = n > 2 && vs[0] === vs[n - 1], segs = [];
      for (let i = 0; i + 1 < n; i++) {
        const a = vs[i], b = vs[i + 1], l = want.get(a < b ? a * nv + b : b * nv + a);
        if (!l || l.length !== 2) return null;               // an open border or a non-manifold edge: not an edge to round
        let s1 = l[0], s2 = l[1];
        if (reg[s1.t] !== ch.r1) { const x = s1; s1 = s2; s2 = x; }
        const pa = vtx(P, a), d = v3.norm(v3.sub(vtx(P, b), pa));
        const into = function (s) { const w = v3.sub(vtx(P, s.third), pa); return v3.norm(v3.sub(w, v3.mul(d, v3.dot(w, d)))); };
        segs.push({ d: d, n1: triN(P, I, s1.t), n2: triN(P, I, s2.t), m1: into(s1), m2: into(s2) });
      }
      const cnt = closed ? n - 1 : n, secs = [];
      let convex = 0;
      for (let i = 0; i < cnt; i++) {
        const ss = [];
        if (i > 0 || closed) ss.push(segs[(i - 1 + segs.length) % segs.length]);
        if (i < segs.length) ss.push(segs[i]);
        const avg = function (k) { let s = [0, 0, 0]; for (const q of ss) s = v3.add(s, q[k]); return s; };
        const t = v3.norm(avg('d')), flat = function (k) { const w = avg(k); return v3.norm(v3.sub(w, v3.mul(t, v3.dot(w, t)))); };
        const sec = { p: vtx(P, vs[i]), t: t, n1: flat('n1'), n2: flat('n2'), m1: flat('m1'), m2: flat('m2') };
        convex += v3.dot(sec.m1, sec.n2) < 0 ? 1 : -1;
        secs.push(sec);
      }
      const isConv = convex >= 0, poly = [];
      for (const s of secs) {
        const c = Math.max(-0.999, Math.min(0.999, v3.dot(s.n1, s.n2))), sg = isConv ? 1 : -1, out = [];
        const nn = v3.add(s.n1, s.n2);
        let T1, T2, arc = [];
        if (kind === 'chamfer') { T1 = v3.add(s.p, v3.mul(s.m1, size)); T2 = v3.add(s.p, v3.mul(s.m2, size)); }
        else {
          const C = v3.sub(s.p, v3.mul(nn, sg * size / (1 + c)));
          const th = Math.acos(c), k = Math.max(2, Math.ceil(th / (Math.PI / 48)));
          T1 = v3.add(C, v3.mul(s.n1, sg * size)); T2 = v3.add(C, v3.mul(s.n2, sg * size));
          for (let j = k - 1; j >= 1; j--) {                 // from T2 back towards T1, bulging towards the edge
            const f = j / k, w = v3.norm(v3.add(v3.mul(s.n1, Math.sin((1 - f) * th) / Math.sin(th)), v3.mul(s.n2, Math.sin(f * th) / Math.sin(th))));
            arc.push(v3.add(C, v3.mul(w, sg * size)));
          }
        }
        out.push(T1, v3.add(T1, v3.mul(s.n1, sg * pad)), v3.add(s.p, v3.mul(nn, sg * pad)), v3.add(T2, v3.mul(s.n2, sg * pad)), T2);
        for (const q of arc) out.push(q);
        poly.push(out);
      }
      const K = poly[0].length, dst = [], tri = function (a, b, c) { dst.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
      const last = closed ? poly.length : poly.length - 1;
      for (let i = 0; i < last; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        for (let k = 0; k < K; k++) { const k2 = (k + 1) % K; tri(A[k], A[k2], B[k2]); tri(A[k], B[k2], B[k]); }
      }
      if (!closed) for (const [idx, s] of [[0, secs[0]], [poly.length - 1, secs[secs.length - 1]]]) {
        const e1 = s.n1, e2 = v3.cross(s.t, e1), ring = poly[idx].map(function (q) { const w = v3.sub(q, s.p); return [v3.dot(w, e1), v3.dot(w, e2)]; });
        let ar = 0; for (let i = 0; i < K; i++) { const p = ring[i], q = ring[(i + 1) % K]; ar += p[0] * q[1] - q[0] * p[1]; }
        const order = ar > 0 ? ring : ring.slice().reverse(), map = ar > 0 ? poly[idx] : poly[idx].slice().reverse(), tr = triangulate([order]);
        for (let j = 0; j < tr.length; j += 3) tri(map[tr[j]], map[tr[j + 1]], map[tr[j + 2]]);
      }
      (isConv ? T.conv : T.conc).push(soupToMesh(dst));      // one closed tool per edge run (they may overlap each other)
    }
    return T;
  }
  // the triangles tris (one flat face) swept along n from offset `from` to offset `to`: a closed prism
  function facePrism(mesh, tris, n, from, to) {
    const P = mesh.positions, I = mesh.indices, set = Array.from(new Set(tris)), nv = P.length / 3, cnt = new Map(), map = new Map(), X = [], T = [];
    const vid = function (v) {                               // bottom copy = 2k, top copy = 2k + 1
      let k = map.get(v);
      if (k === undefined) { k = X.length / 6; map.set(v, k); for (const s of [from, to]) X.push(P[3 * v] + n[0] * s, P[3 * v + 1] + n[1] * s, P[3 * v + 2] + n[2] * s); }
      return k;
    };
    for (const t of set) for (let c = 0; c < 3; c++) { const x = I[3 * t + c], y = I[3 * t + (c + 1) % 3], k = x < y ? x * nv + y : y * nv + x; cnt.set(k, (cnt.get(k) || 0) + 1); }
    for (const t of set) {
      const a = vid(I[3 * t]), b = vid(I[3 * t + 1]), c = vid(I[3 * t + 2]);
      T.push(2 * a + 1, 2 * b + 1, 2 * c + 1, 2 * a, 2 * c, 2 * b);
      const v = [I[3 * t], I[3 * t + 1], I[3 * t + 2]];
      for (let e = 0; e < 3; e++) {
        const x = v[e], y = v[(e + 1) % 3];
        if (cnt.get(x < y ? x * nv + y : y * nv + x) !== 1) continue;
        const X0 = vid(x), Y0 = vid(y);
        T.push(2 * X0, 2 * Y0, 2 * Y0 + 1, 2 * X0, 2 * Y0 + 1, 2 * X0 + 1);
      }
    }
    const out = { positions: new Float32Array(X), indices: new Uint32Array(T) };
    if (to < from) for (let t = 0; t < T.length; t += 3) { const x = out.indices[t + 1]; out.indices[t + 1] = out.indices[t + 2]; out.indices[t + 2] = x; }
    return out;
  }
  // hollow out a closed mesh: walls of thickness t inwards, the triangles in `open` removed (those faces become openings)
  function shellMesh(mesh, open, t) {
    const P = mesh.positions, I = mesh.indices, nv = P.length / 3, nt = I.length / 3, keep = [];
    for (let i = 0; i < nt; i++) if (!open.has(i)) keep.push(i);
    const N = [];
    for (let i = 0; i < nt; i++) N.push(triN(P, I, i));
    const vn = [];
    for (let i = 0; i < nv; i++) vn.push([]);
    for (const i of keep) for (let c = 0; c < 3; c++) vn[I[3 * i + c]].push(N[i]);
    const Q = new Float32Array(P.length);
    for (let v = 0; v < nv; v++) {
      const reps = [];
      for (const n of vn[v]) { if (!reps.some(function (r) { return v3.dot(r, n) > 0.9995; })) reps.push(n); }
      const p = vtx(P, v);
      if (!reps.length) { Q[3 * v] = p[0]; Q[3 * v + 1] = p[1]; Q[3 * v + 2] = p[2]; continue; }
      // least squares: the point that is t behind every face plane around it (pseudo-inverse keeps free directions still)
      const A = [0, 0, 0, 0, 0, 0], b = [0, 0, 0];
      for (const n of reps) { A[0] += n[0] * n[0]; A[1] += n[0] * n[1]; A[2] += n[0] * n[2]; A[3] += n[1] * n[1]; A[4] += n[1] * n[2]; A[5] += n[2] * n[2]; b[0] -= n[0] * t; b[1] -= n[1] * t; b[2] -= n[2] * t; }
      const E = eig3(A), d = [0, 0, 0], top = Math.max(E.val[0], E.val[1], E.val[2]);
      for (let k = 0; k < 3; k++) { if (E.val[k] < 1e-6 * top) continue; const e = E.vec[k], s = (e[0] * b[0] + e[1] * b[1] + e[2] * b[2]) / E.val[k]; d[0] += e[0] * s; d[1] += e[1] * s; d[2] += e[2] * s; }
      Q[3 * v] = p[0] + d[0]; Q[3 * v + 1] = p[1] + d[1]; Q[3 * v + 2] = p[2] + d[2];
    }
    // outer vertices keep their numbers, inner copies are nv + v: the result is closed exactly where the input was
    const X = new Float32Array(2 * P.length); X.set(P); X.set(Q, P.length);
    const T = [], cnt = new Map();
    for (const i of keep) {
      const a = I[3 * i], b = I[3 * i + 1], c = I[3 * i + 2];
      T.push(a, b, c, nv + a, nv + c, nv + b);
      for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = x < y ? x * nv + y : y * nv + x; cnt.set(k, (cnt.get(k) || 0) + 1); }
    }
    for (const i of keep) {
      const v = [I[3 * i], I[3 * i + 1], I[3 * i + 2]];
      for (let c = 0; c < 3; c++) {
        const x = v[c], y = v[(c + 1) % 3];
        if (cnt.get(x < y ? x * nv + y : y * nv + x) !== 1) continue;
        T.push(y, x, nv + x, y, nv + x, nv + y);
      }
    }
    return { positions: X, indices: new Uint32Array(T) };
  }
  // Put flat faces onto the plane (nT, dT) by moving their vertices: the faces next to them stretch along their own
  // planes (so side walls stay flat, drafted or not), and rounds that run tangentially off the faces travel with them.
  // f = features(mesh); sel = region numbers. Throws if a triangle would turn over (moved too far).
  function replaceFaceVerts(mesh, f, sel, nT, dT) {
    const P = mesh.positions, I = mesh.indices, nt = I.length / 3, nv = P.length / 3, R = f.regions, reg = f.reg;
    const S = new Set(sel), adj = edgeAdjacency(P, I, nv, null).adj, cosT = Math.cos(12 * Math.PI / 180), N = [];
    for (let t = 0; t < nt; t++) N.push(triN(P, I, t));
    for (let grow = true; grow;) {                            // rounds joined smoothly to the moving faces come along
      grow = false;
      for (let h = 0; h < 3 * nt; h++) {
        const o = adj[h]; if (o < 0) continue;
        const r1 = reg[(h / 3) | 0], r2 = reg[(o / 3) | 0];
        if (S.has(r1) && !S.has(r2) && R[r2].type !== 'plane' && v3.dot(N[(h / 3) | 0], N[(o / 3) | 0]) > cosT) { S.add(r2); grow = true; }
      }
    }
    const nF = R[sel[0]].n, dF = R[sel[0]].d, inS = new Uint8Array(nv), around = [], minA = 0.02 * R[sel[0]].area;   // tiny flat bits count as curved
    for (let v = 0; v < nv; v++) around.push(null);
    for (let t = 0; t < nt; t++) { const r = reg[t]; for (let c = 0; c < 3; c++) { const v = I[3 * t + c]; if (S.has(r)) inS[v] = 1; else { if (!around[v]) around[v] = new Set(); around[v].add(r); } } }
    const Q = Float32Array.from(P);
    for (let v = 0; v < nv; v++) {
      if (!inS[v]) continue;
      const planes = [];
      let curved = false;
      if (around[v]) around[v].forEach(function (r) { if (R[r].type === 'plane' && R[r].area >= minA) { if (!planes.some(function (q) { return Math.abs(v3.dot(q, R[r].n)) > 0.999; })) planes.push(R[r].n); } else curved = true; });
      let dir = nF;
      if (planes.length === 1 && !curved) { const A = planes[0]; dir = v3.sub(nF, v3.mul(A, v3.dot(nF, A))); }
      else if (planes.length >= 2) dir = v3.cross(planes[0], planes[1]);
      const p = vtx(P, v), den = v3.dot(nT, dir), p0 = v3.sub(p, v3.mul(nF, v3.dot(nF, p) - dF));   // rounds move as the face spot below them does
      if (Math.hypot(dir[0], dir[1], dir[2]) < 1e-9 || Math.abs(den) < 1e-9) throw new Error('stuck');
      const t = (dT - v3.dot(nT, p0)) / den;
      Q[3 * v] = p[0] + dir[0] * t; Q[3 * v + 1] = p[1] + dir[1] * t; Q[3 * v + 2] = p[2] + dir[2] * t;
    }
    for (let t = 0; t < nt; t++) {                            // nothing may turn over
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const n2 = v3.cross([Q[b] - Q[a], Q[b + 1] - Q[a + 1], Q[b + 2] - Q[a + 2]], [Q[c] - Q[a], Q[c + 1] - Q[a + 1], Q[c + 2] - Q[a + 2]]);
      if (v3.dot(n2, N[t]) < 0) throw new Error('flip');
    }
    return { positions: Q, indices: Uint32Array.from(I) };
  }
  // move every vertex of a cylindrical face radially by d (+ = outwards from the axis)
  function moveCylFace(mesh, tris, axis, c, d) {
    const P = Float32Array.from(mesh.positions), I = mesh.indices, done = new Set();
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const v = I[3 * t + k]; if (done.has(v)) continue; done.add(v);
      const w = [P[3 * v] - c[0], P[3 * v + 1] - c[1], P[3 * v + 2] - c[2]], h = v3.dot(w, axis), r = v3.sub(w, v3.mul(axis, h)), rl = Math.hypot(r[0], r[1], r[2]);
      if (rl < 1e-12) continue;
      if (rl + d <= 0) throw new Error('radius');
      for (let k2 = 0; k2 < 3; k2++) P[3 * v + k2] += r[k2] / rl * d;
    }
    return { positions: P, indices: Uint32Array.from(I) };
  }

