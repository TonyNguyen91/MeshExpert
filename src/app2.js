(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const core = MeshCore();
  let lang = 'vi';
  try { if (localStorage.getItem('mrtLang') === 'en') lang = 'en'; } catch (e) { /* storage not available */ }
  const L = function (vi, en) { return lang === 'en' ? en : vi; };
  const fmtN = function (n) { return Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN'); };
  const f2 = function (v, d) { return (+v).toFixed(d === undefined ? 2 : d); };

  // ================= background worker (falls back to main thread) =================
  function runCmd(c, cmd, p, prog) {
    if (cmd === 'parse') return c.parse(p.name, p.buffer);
    if (cmd === 'decimate') return c.decimate(p.mesh, p.opt, prog);
    if (cmd === 'split') return c.splitAdv(p.mesh, p.opt);
    if (cmd === 'fill') return c.fillHoles(p.mesh, p.opt);
    if (cmd === 'bool') return c.boolean(p.a, p.b, p.op, prog);
    if (cmd === 'undercut') return c.undercut(p.mesh, p.dir, p.minDraft, prog);
    if (cmd === 'collide') return c.collide(p.a, p.b);
    if (cmd === 'deviation') return c.deviation(p.b, p.a, prog);
    if (cmd === 'icp') return c.icp(p.b, p.a, 40, prog);
    throw new Error('Unknown command ' + cmd);
  }
  let worker = null, nextId = 1;
  const pending = {};
  function runDirect(job) {
    setTimeout(function () { try { job.res(runCmd(core, job.cmd, job.payload, null)); } catch (e) { job.rej(e); } }, 40);
  }
  try {
    const src = 'const core=(' + MeshCore.toString() + ')();' + runCmd.toString() + ';' +
      'function tr(r){const s=new Set();(function w(o,d){if(!o||d>4)return;if(ArrayBuffer.isView(o)){s.add(o.buffer);return;}if(typeof o==="object")for(const k in o)w(o[k],d+1);})(r,0);return Array.from(s);}' +
      'onmessage=function(e){const m=e.data;try{const r=runCmd(core,m.cmd,m.payload,function(p){postMessage({id:m.id,progress:p});});postMessage({id:m.id,result:r},tr(r));}' +
      'catch(err){postMessage({id:m.id,error:String(err&&err.message||err)});}};';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = function (e) {
      const m = e.data, job = pending[m.id];
      if (!job) return;
      if (m.progress !== undefined) { if (job.onProgress) job.onProgress(m.progress); return; }
      delete pending[m.id];
      if (m.error) job.rej(new Error(m.error)); else job.res(m.result);
    };
    worker.onerror = function () {
      worker = null;
      for (const id in pending) { const job = pending[id]; delete pending[id]; runDirect(job); }
    };
  } catch (e) { worker = null; }
  function run(cmd, payload, onProgress) {
    return new Promise(function (res, rej) {
      const job = { cmd: cmd, payload: payload, onProgress: onProgress, res: res, rej: rej };
      if (worker) { const id = nextId++; pending[id] = job; worker.postMessage({ id: id, cmd: cmd, payload: payload }); }
      else runDirect(job);
    });
  }

  // ================= math =================
  const V = {
    add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    mul: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    len: function (a) { return Math.hypot(a[0], a[1], a[2]); },
    norm: function (a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  };
  const M = { // 4x4 column-major affine matrices
    ident: function () { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
    mul: function (a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    trans: function (v) { const m = M.ident(); m[12] = v[0]; m[13] = v[1]; m[14] = v[2]; return m; },
    scale: function (v) { const m = M.ident(); m[0] = v[0]; m[5] = v[1]; m[10] = v[2]; return m; },
    rot: function (ax, ang) {
      const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, x = ax[0], y = ax[1], z = ax[2];
      return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
    },
    about: function (p, a) { return M.mul(M.trans(p), M.mul(a, M.trans([-p[0], -p[1], -p[2]]))); },
    point: function (m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
    vec: function (m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
    det3: function (m) { return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]); },
    inv: function (m) {
      const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
      const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g) || 1e-300;
      const o = M.ident();
      o[0] = (e * i - f * h) / det; o[4] = (c * h - b * i) / det; o[8] = (b * f - c * e) / det;
      o[1] = (f * g - d * i) / det; o[5] = (a * i - c * g) / det; o[9] = (c * d - a * f) / det;
      o[2] = (d * h - e * g) / det; o[6] = (b * g - a * h) / det; o[10] = (a * e - b * d) / det;
      o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]);
      o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]);
      o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
      return o;
    },
    isIdent: function (m) { const I = M.ident(); for (let k = 0; k < 16; k++) if (Math.abs(m[k] - I[k]) > 1e-12) return false; return true; }
  };
  function mul3(A, B) {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return o;
  }
  const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // the frame the move / rotate / scale handles work in (world axes unless X has been aligned to something)
  const GX = function (i) { return S.gax[i]; };          // S.gax is set up with the geometry tools
  const gaxWorld = function () { return S.gax.every(function (a, i) { return a[i] === 1; }); };
  // a matrix whose columns are the frame axes
  function gaxM() { const X = S.gax[0], Y = S.gax[1], Z = S.gax[2]; return [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, 0, 0, 0, 1]; }
  function setGaxX(x) {                                      // X along x; Y and Z follow, keeping Z as close to world Z as they can
    x = V.norm(x);
    let z = V.sub([0, 0, 1], V.mul(x, x[2]));
    if (V.len(z) < 1e-6) z = V.sub([0, 1, 0], V.mul(x, x[1]));
    z = V.norm(z);
    S.gax = [x, V.cross(z, x), z];
  }
  const AXN = ['X', 'Y', 'Z'], AXC = ['#ff5a52', '#52d06a', '#4f9bff'];

  // ================= state =================
  const VIEWS = {
    front: [1, 0, 0, 0, 0, 1, 0, -1, 0], back: [-1, 0, 0, 0, 0, 1, 0, 1, 0],
    top: [1, 0, 0, 0, 1, 0, 0, 0, 1], bottom: [1, 0, 0, 0, -1, 0, 0, 0, -1],
    right: [0, 1, 0, 0, 0, 1, 1, 0, 0], left: [0, -1, 0, 0, 0, 1, -1, 0, 0]
  };
  function isoView() {
    const w = V.norm([1, -1, 1]), r = V.norm(V.cross([0, 0, 1], w)), u = V.cross(w, r);
    return [r[0], r[1], r[2], u[0], u[1], u[2], w[0], w[1], w[2]];
  }
  // A camera: view rotation R (rows = screen right, screen up, towards viewer), target, zoom (half height in mm),
  // viewport x offset / width in CSS px, and the centre / radius of what it looks at.
  const mainCam = { R: isoView(), target: [0, 0, 0], zoom: 100, x: 0, w: 1, center: [0, 0, 0], radius: 100 };
  let cam = mainCam;
  const S = {
    bodies: [], sel: new Set(), tool: 'select', explode: 0,
    sec: { on: false, flip: false, axis: 'z', n: [0, 0, 1], s: 0.5, d: 0, min: -1, max: 1, nView: [0, 0, 1], nPick: [0, 0, 1] },
    measures: [], tmp: [], clip: [], giz: null, colorSeq: 0, idSeq: 1, cmp: null, col: null, spl: null,
    show: { box: false, com: false }, hov: null, hovCom: null, hovEnt: null, viewPivot: null
  };
  let dirty = true, busy = false, W = 1, H = 1;
  const MATS = [['', '(chưa gán)', '(none)', 0], ['ABS', 'ABS', 'ABS', 1.05], ['PP', 'PP', 'PP', 0.905], ['HIPS', 'HIPS', 'HIPS', 1.05], ['PC', 'PC', 'PC', 1.20],
    ['PCABS', 'PC/ABS', 'PC/ABS', 1.15], ['POM', 'POM', 'POM', 1.41], ['PA6', 'PA6', 'PA6', 1.14], ['PA66GF30', 'PA66 GF30', 'PA66 GF30', 1.36],
    ['HDPE', 'PE-HD', 'PE-HD', 0.95], ['PVC', 'PVC mềm', 'Soft PVC', 1.25], ['PMMA', 'PMMA', 'PMMA', 1.18], ['TPU', 'TPU', 'TPU', 1.20], ['PLA', 'PLA', 'PLA', 1.24],
    ['PETG', 'PETG', 'PETG', 1.27], ['AL', 'Nhôm', 'Aluminium', 2.70], ['ZAMAK', 'Kẽm (Zamak 3)', 'Zinc (Zamak 3)', 6.60], ['STEEL', 'Thép', 'Steel', 7.85], ['custom', 'Tùy chọn', 'Custom', 1]];

  // ================= geometry & bodies =================
  function makeGeo(positions, indices) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = positions[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    return { positions: positions, indices: indices, min: mn, max: mx, gl: null, bvh: null, topo: null };
  }
  function nextColor() {
    const h = (S.colorSeq++ * 0.618034 + 0.58) % 1, s = 0.45, l = 0.64;
    const f = function (n) { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  function uniqueName(name) {
    const used = new Set(S.bodies.map(function (b) { return b.name; }));
    if (!used.has(name)) return name;
    for (let i = 2; ; i++) if (!used.has(name + '_' + i)) return name + '_' + i;
  }
  function addBody(name, geo, o) {
    o = o || {};
    const m = o.matrix ? o.matrix.slice() : M.ident();
    const b = {
      id: S.idSeq++, name: uniqueName(name), geo: geo, orig: o.orig || geo, matrix: m, matrix0: o.matrix0 ? o.matrix0.slice() : m.slice(),
      color: o.color ? o.color.slice() : nextColor(), opacity: o.opacity === undefined ? 1 : o.opacity, visible: o.visible !== false,
      material: o.material || '', density: o.density || 0, off: [0, 0, 0], ana: null, stats: null, solid: o.solid || null
    };
    if (o.index === undefined) S.bodies.push(b); else S.bodies.splice(o.index, 0, b);
    return b;
  }
  function releaseGeo(g) {
    if (!g || !g.gl || !gl) return;
    for (const b of S.bodies) if (b.geo === g) return;
    gl.deleteVertexArray(g.gl.vao); gl.deleteVertexArray(g.gl.vaoL);
    gl.deleteBuffer(g.gl.pos); gl.deleteBuffer(g.gl.idx); if (g.gl.line) gl.deleteBuffer(g.gl.line);
    if (g.holes && g.holes.vao) { gl.deleteVertexArray(g.holes.vao); gl.deleteBuffer(g.holes.buf); g.holes.vao = null; g.holes.buf = null; }
    if (g.gl.vaoB) { gl.deleteVertexArray(g.gl.vaoB); gl.deleteBuffer(g.gl.bufB); }
    g.gl = null;
  }
  function freeAna(b) {
    if (b.ana && gl) { gl.deleteVertexArray(b.ana.vao); gl.deleteBuffer(b.ana.pb); gl.deleteBuffer(b.ana.cb); }
    b.ana = null;
  }
  function setGeo(b, geo, keepSolid) { const old = b.geo; b.geo = geo; b.geoBrep = false; freeAna(b); b.stats = null; if (!keepSolid) b.solid = null; releaseGeo(old); }
  function removeBody(b) {
    const i = S.bodies.indexOf(b);
    if (i < 0) return;
    S.bodies.splice(i, 1); S.sel.delete(b); freeAna(b); releaseGeo(b.geo);
  }
  function dispMatrix(b) {
    if (S.cmp || (!b.off[0] && !b.off[1] && !b.off[2])) return b.matrix;
    const m = b.matrix.slice(); m[12] += b.off[0]; m[13] += b.off[1]; m[14] += b.off[2]; return m;
  }
  function bodyBox(b, disp) {
    const m = disp ? dispMatrix(b) : b.matrix, g = b.geo;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) {
      const p = M.point(m, [c & 1 ? g.max[0] : g.min[0], c & 2 ? g.max[1] : g.min[1], c & 4 ? g.max[2] : g.min[2]]);
      for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
    }
    return { min: mn, max: mx };
  }
  function unionBox(list, disp) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of list) { const bb = bodyBox(b, disp); for (let k = 0; k < 3; k++) { if (bb.min[k] < mn[k]) mn[k] = bb.min[k]; if (bb.max[k] > mx[k]) mx[k] = bb.max[k]; } }
    return { min: mn, max: mx };
  }
  const boxCenter = function (bb) { return [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2]; };
  // Exact box of the transformed vertices (bodyBox only transforms the 8 corners, which is loose once a body is rotated).
  function tightBox(b) {
    const m = b.matrix, key = m.join(), c = b.tb;
    if (c && c.key === key && c.geo === b.geo) return c;
    const P = b.geo.positions, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (wx < mn[0]) mn[0] = wx; if (wx > mx[0]) mx[0] = wx; if (wy < mn[1]) mn[1] = wy; if (wy > mx[1]) mx[1] = wy; if (wz < mn[2]) mn[2] = wz; if (wz > mx[2]) mx[2] = wz;
    }
    return (b.tb = { key: key, geo: b.geo, min: mn, max: mx });
  }
  function tightUnion(list, disp) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of list) {
      const bb = tightBox(b), o = disp && !S.cmp ? b.off : [0, 0, 0];
      for (let k = 0; k < 3; k++) { if (bb.min[k] + o[k] < mn[k]) mn[k] = bb.min[k] + o[k]; if (bb.max[k] + o[k] > mx[k]) mx[k] = bb.max[k] + o[k]; }
    }
    return { min: mn, max: mx };
  }
  // Centre of mass: kept in the body's own coordinates, so it follows every move / rotation / scale for free.
  function comLocal(g) { return g.cen || (g.cen = core.stats(g.positions, g.indices).centroid); }
  function comOf(b, disp) { return M.point(disp ? dispMatrix(b) : b.matrix, comLocal(b.geo)); }
  // Several bodies: weighted by mass when every one has a material, otherwise by volume.
  function comAll(list, disp) {
    const byMass = list.every(function (b) { return b.density > 0; }), c = [0, 0, 0];
    let w = 0;
    for (const b of list) {
      const k = Math.max(getStats(b).volume, 1e-12) * (byMass ? b.density : 1), q = comOf(b, disp);
      c[0] += k * q[0]; c[1] += k * q[1]; c[2] += k * q[2]; w += k;
    }
    return [c[0] / w, c[1] / w, c[2] / w];
  }
  function comMarkers() {
    if (!S.show.com || (S.cmp && S.cmp.split)) return [];
    const sel = selBodies(), out = sel.map(function (b) { return { p: comOf(b, true), all: false }; });
    if (sel.length > 1) out.push({ p: comAll(sel, true), all: true });
    return out;
  }
  function comAt(px, py) {
    let best = null, bd = 12;
    for (const m of comMarkers()) { const q = project(m.p), d = Math.hypot(q[0] - px, q[1] - py); if (d < bd) { bd = d; best = m.p; } }
    return best;
  }
  // Geometry with the body's transform applied (explode offset excluded).
  function worldMesh(b) {
    const m = b.matrix, P = b.geo.positions, I = b.geo.indices;
    let pos = P;
    if (!M.isIdent(m)) {
      pos = new Float32Array(P.length);
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
    }
    let idx = I;
    if (M.det3(m) < 0) { idx = new Uint32Array(I.length); for (let t = 0; t < I.length; t += 3) { idx[t] = I[t]; idx[t + 1] = I[t + 2]; idx[t + 2] = I[t + 1]; } }
    return { positions: pos, indices: idx };
  }
  const visibleBodies = function () { return S.bodies.filter(function (b) { return b.visible; }); };
  const selBodies = function () { return S.bodies.filter(function (b) { return S.sel.has(b); }); };
  function needSel() {
    const s = selBodies();
    if (!s.length) flash(L('Hãy tick chọn body trước', 'Tick a body first'));
    return s;
  }
  function blocked() {
    if (busy) return true;
    if (S.cmp) { flash(L('Hãy bấm Kết thúc ở mục So sánh mesh trước', 'Finish the mesh comparison first')); return true; }
    return false;
  }

  // ================= undo / redo =================
  const hist = { undo: [], redo: [] };
  function snapshot() {
    const vis = S.cmp ? new Map(S.cmp.vis) : null;
    return {
      bodies: S.bodies.map(function (b) {
        return { id: b.id, name: b.name, geo: b.geo, orig: b.orig, matrix: b.matrix.slice(), matrix0: b.matrix0.slice(), color: b.color.slice(), opacity: b.opacity,
          visible: vis && vis.has(b) ? vis.get(b) : b.visible, material: b.material, density: b.density, solid: b.solid || null };
      }),
      sel: selBodies().map(function (b) { return b.id; }), measures: JSON.parse(JSON.stringify(S.measures)), sketches: JSON.stringify(S.sketches), skSel: S.skSel, geos: JSON.stringify(S.geos), geoSeq: S.geoSeq
    };
  }
  function updateHistBtns() { $('bUndo').disabled = !hist.undo.length; $('bRedo').disabled = !hist.redo.length; }
  function pushUndo() {
    hist.undo.push(snapshot());
    if (hist.undo.length > 30) hist.undo.shift();
    hist.redo.length = 0; updateHistBtns();
  }
  function restore(s) {
    const old = S.bodies;
    for (const b of old) freeAna(b);
    S.bodies = s.bodies.map(function (o) { return Object.assign({ off: [0, 0, 0], ana: null, stats: null }, o, { matrix: o.matrix.slice(), matrix0: o.matrix0.slice(), color: o.color.slice() }); });
    for (const b of old) releaseGeo(b.geo);
    S.sel = new Set(S.bodies.filter(function (b) { return s.sel.indexOf(b.id) >= 0; }));
    S.measures = JSON.parse(JSON.stringify(s.measures)); S.tmp = []; S.col = null;
    if (s.sketches) { S.sketches = JSON.parse(s.sketches); S.skSel = s.skSel; }
    if (s.geos) { S.geos = JSON.parse(s.geos); S.geoSeq = s.geoSeq || S.geos.length + 1; if (!S.geos.some(function (g) { return g.id === S.geoSel; })) S.geoSel = null; }
    resetBox('colRes');
    updateExplode(); sceneChanged(false); updateMeasList(); refresh();
  }
  function undo() { if (blocked() || !hist.undo.length) return; hist.redo.push(snapshot()); restore(hist.undo.pop()); updateHistBtns(); }
  function redo() { if (blocked() || !hist.redo.length) return; hist.undo.push(snapshot()); restore(hist.redo.pop()); updateHistBtns(); }
  $('bUndo').addEventListener('click', undo);
  $('bRedo').addEventListener('click', redo);

  // ================= WebGL =================
  const canvas = $('gl'), ov = $('ov'), ctx = ov.getContext('2d');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  let prog = null;
  const U = {};
  if (gl) {
    const vs = '#version 300 es\nin vec3 aPos;in vec3 aCol;uniform mat4 uM;uniform mat3 uR;uniform vec3 uT;uniform vec3 uS;out vec3 vV;out vec3 vW;out vec3 vC;' +
      'void main(){vec3 w=(uM*vec4(aPos,1.0)).xyz;vec3 v=uR*(w-uT);vW=w;vV=v;vC=aCol;gl_Position=vec4(v.x*uS.x,v.y*uS.y,v.z*uS.z,1.0);}';
    const fs = '#version 300 es\nprecision highp float;in vec3 vV;in vec3 vW;in vec3 vC;uniform vec4 uColor;uniform int uMode;uniform float uSel;uniform float uBright;uniform vec4 uClip;uniform float uClipOn;out vec4 o;' +
      'void main(){if(uClipOn>0.5&&dot(uClip.xyz,vW)>uClip.w)discard;' +
      'if(uMode==1){o=vec4(0.03,0.05,0.08,uColor.a);return;}if(uMode==3){o=uColor;return;}' +
      'vec3 base=uMode==2?vC:(uSel>0.5?vec3(1.0,0.55,0.06):uColor.rgb);' +
      'if(uClipOn>0.5&&!gl_FrontFacing){o=vec4(base*0.45+vec3(0.16,0.03,0.03),uColor.a);return;}' +
      'vec3 n=normalize(cross(dFdx(vV),dFdy(vV)));' +
      'if(uMode==2){o=vec4(min(base*(abs(n.z)*0.4+0.6)*uBright,vec3(1.0)),uColor.a);return;}' +
      'o=vec4(base*(abs(n.z)*0.72+0.28),uColor.a);}';
    const mk = function (type, s) { const sh = gl.createShader(type); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
    prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aCol');
    gl.linkProgram(prog);
    ['uM', 'uR', 'uT', 'uS', 'uColor', 'uMode', 'uSel', 'uBright', 'uClip', 'uClipOn'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.enable(gl.DEPTH_TEST);
  }
  function ensureGL(g) {
    if (g.gl) return g.gl;
    const o = { vao: gl.createVertexArray(), vaoL: gl.createVertexArray(), pos: gl.createBuffer(), idx: gl.createBuffer(), line: null, nLine: 0 };
    gl.bindVertexArray(o.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.pos); gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    g.gl = o;
    return o;
  }
  function ensureLines(g) {
    const o = ensureGL(g);
    if (o.line) return;
    const I = g.indices, n = I.length / 3, Ln = new Uint32Array(n * 6);
    for (let t = 0; t < n; t++) {
      const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
      Ln[6 * t] = a; Ln[6 * t + 1] = b; Ln[6 * t + 2] = b; Ln[6 * t + 3] = c; Ln[6 * t + 4] = c; Ln[6 * t + 5] = a;
    }
    o.line = gl.createBuffer(); o.nLine = Ln.length;
    gl.bindVertexArray(o.vaoL);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.pos);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.line); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Ln, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  // open borders of a geometry: edge list, number of holes, GL buffer for drawing them
  function holesOf(g) {
    if (g.holes) return g.holes;
    const L = core.borderLoops(g.positions, g.indices), E = core.borderEdges(g.positions, g.indices);
    return (g.holes = { E: E, edges: E.length / 2, loops: L.loops.length, vao: null, buf: null });
  }
  function drawBorders(b) {
    const h = holesOf(b.geo);
    if (!h.edges) return;
    const o = ensureGL(b.geo);
    if (!h.vao) {
      h.vao = gl.createVertexArray(); h.buf = gl.createBuffer();
      gl.bindVertexArray(h.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.pos);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, h.buf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, h.E, gl.STATIC_DRAW);
    }
    gl.uniformMatrix4fv(U.uM, false, dispMatrix(b));
    gl.uniform1i(U.uMode, 3); gl.uniform4f(U.uColor, 1, 0.12, 0.1, 1);
    gl.bindVertexArray(h.vao); gl.drawElements(gl.LINES, h.E.length, gl.UNSIGNED_INT, 0);
  }
  // Colour map on a body. colorOf(t, vi, out) fills out[0..2] for vertex vi of triangle t.
  function setAna(b, colorOf) {
    freeAna(b);
    if (!gl) return;
    const P = b.geo.positions, I = b.geo.indices, nt = I.length / 3;
    const pos = new Float32Array(nt * 9), col = new Uint8Array(nt * 9), c = [0, 0, 0];
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = I[3 * t + k], v = 3 * vi, o = 9 * t + 3 * k;
        pos[o] = P[v]; pos[o + 1] = P[v + 1]; pos[o + 2] = P[v + 2];
        colorOf(t, vi, c);
        col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
      }
    }
    const a = { vao: gl.createVertexArray(), pb: gl.createBuffer(), cb: gl.createBuffer(), count: nt * 3 };
    gl.bindVertexArray(a.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, a.pb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, a.cb); gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindVertexArray(null);
    b.ana = a;
  }
  function setAnaClasses(b, classes, palette) {
    setAna(b, function (t, vi, c) { const p = palette[classes[t]] || palette[0]; c[0] = p[0]; c[1] = p[1]; c[2] = p[2]; });
  }
  function clearAna() { for (const b of S.bodies) freeAna(b); dirty = true; }

  // ================= view =================
  const right = function () { return [cam.R[0], cam.R[1], cam.R[2]]; };
  const up = function () { return [cam.R[3], cam.R[4], cam.R[5]]; };
  const viewer = function () { return [cam.R[6], cam.R[7], cam.R[8]]; };
  function depthRange() { return V.len(V.sub(cam.target, cam.center)) + cam.radius * 1.5 + 1e-6; }
  function project(p) {
    const d = V.sub(p, cam.target), R = cam.R;
    const vx = R[0] * d[0] + R[1] * d[1] + R[2] * d[2], vy = R[3] * d[0] + R[4] * d[1] + R[5] * d[2];
    return [cam.x + (vx / (cam.zoom * cam.w / H) + 1) / 2 * cam.w, (1 - vy / cam.zoom) / 2 * H];
  }
  function screenRay(px, py) {
    const vx = (2 * (px - cam.x) / cam.w - 1) * cam.zoom * cam.w / H, vy = (1 - 2 * py / H) * cam.zoom, big = depthRange() * 2, w = viewer();
    return { o: V.add(V.add(V.add(cam.target, V.mul(right(), vx)), V.mul(up(), vy)), V.mul(w, big)), d: V.mul(w, -1), big: big };
  }
  function rotateView(ax, ay) {
    const c1 = Math.cos(ax), s1 = Math.sin(ax), c2 = Math.cos(ay), s2 = Math.sin(ay);
    const R = mul3([1, 0, 0, 0, c2, -s2, 0, s2, c2], mul3([c1, 0, s1, 0, 1, 0, -s1, 0, c1], cam.R));
    const r = V.norm([R[0], R[1], R[2]]);
    let u = [R[3], R[4], R[5]];
    u = V.norm(V.sub(u, V.mul(r, V.dot(u, r))));
    const w = V.cross(r, u);
    cam.R = [r[0], r[1], r[2], u[0], u[1], u[2], w[0], w[1], w[2]];
    dirty = true;
  }
  // rotate the view while the world point pv stays under the same pixel
  function rotateViewAbout(ax, ay, pv) {
    const d = V.sub(pv, cam.target), R = cam.R, a = [R[0] * d[0] + R[1] * d[1] + R[2] * d[2], R[3] * d[0] + R[4] * d[1] + R[5] * d[2], R[6] * d[0] + R[7] * d[1] + R[8] * d[2]];
    rotateView(ax, ay);
    const Q = cam.R;
    cam.target = [pv[0] - (Q[0] * a[0] + Q[3] * a[1] + Q[6] * a[2]), pv[1] - (Q[1] * a[0] + Q[4] * a[1] + Q[7] * a[2]), pv[2] - (Q[2] * a[0] + Q[5] * a[1] + Q[8] * a[2])];
  }
  function fitCam(c, bb) {
    c.center = boxCenter(bb); c.radius = Math.max(1e-6, 0.5 * V.len(V.sub(bb.max, bb.min)));
    c.target = c.center.slice(); c.zoom = c.radius * 1.12 / Math.min(1, c.w / H);
  }
  function rollView(a) {                                      // turn the picture about the viewing direction
    const R = cam.R, c = Math.cos(a), s = Math.sin(a), r = [R[0], R[1], R[2]], u = [R[3], R[4], R[5]];
    const r2 = V.add(V.mul(r, c), V.mul(u, s)), u2 = V.sub(V.mul(u, c), V.mul(r, s));
    cam.R = [r2[0], r2[1], r2[2], u2[0], u2[1], u2[2], R[6], R[7], R[8]]; dirty = true;
  }
  function setView(name) { cam.R = name === 'iso' ? isoView() : VIEWS[name].slice(); dirty = true; }
  function sceneChanged(fit) {
    const vis = visibleBodies();
    if (vis.length) {
      const bb = unionBox(vis, true);
      mainCam.center = boxCenter(bb);
      mainCam.radius = Math.max(1e-6, 0.5 * V.len(V.sub(bb.max, bb.min)));
    } else { mainCam.center = [0, 0, 0]; mainCam.radius = 100; }
    updateSection();
    if (fit) { mainCam.target = mainCam.center.slice(); mainCam.zoom = mainCam.radius * 1.12 / Math.min(1, mainCam.w / H); }
    dirty = true;
  }
  function fitTo(list) {
    if (!list.length) return;
    const c = mainCam.center, r = mainCam.radius;
    fitCam(mainCam, unionBox(list, true));
    mainCam.center = c; mainCam.radius = r; dirty = true;
  }
  function updateExplode() {
    const vis = visibleBodies();
    const c = vis.length ? boxCenter(unionBox(vis, false)) : [0, 0, 0];
    for (const b of S.bodies) b.off = S.explode > 0 && b.visible ? V.mul(V.sub(boxCenter(bodyBox(b, false)), c), S.explode) : [0, 0, 0];
  }
  function clipPlane() {
    const sc = S.sec;
    return sc.flip ? [-sc.n[0], -sc.n[1], -sc.n[2], -sc.d] : [sc.n[0], sc.n[1], sc.n[2], sc.d];
  }
  const clipOn = function () { return S.sec.on && !(S.cmp && S.cmp.split); };
  function updateSection() {
    const sc = S.sec;
    sc.n = sc.axis === 'x' ? [1, 0, 0] : sc.axis === 'y' ? [0, 1, 0] : sc.axis === 'z' ? [0, 0, 1] : sc.axis === 'view' ? sc.nView : sc.nPick;
    let mn = Infinity, mx = -Infinity;
    for (const b of visibleBodies()) {
      const bb = bodyBox(b, true);
      for (let c = 0; c < 8; c++) {
        const v = V.dot(sc.n, [c & 1 ? bb.max[0] : bb.min[0], c & 2 ? bb.max[1] : bb.min[1], c & 4 ? bb.max[2] : bb.min[2]]);
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
    }
    if (!(mx > mn)) { mn = -1; mx = 1; }
    sc.min = mn; sc.max = mx; sc.d = mn + sc.s * (mx - mn);
    $('secV').textContent = sc.on ? f2(sc.d) + ' mm' : '-';
  }

  // ================= drawing =================
  // the reference body is ghosted while a deviation map is shown on the other one
  function alphaOf(b) { return S.cmp && !S.cmp.split && S.cmp.dev && b === S.cmp.a ? Math.min(b.opacity, 0.22) : b.opacity; }
  function drawBody(b, edges, plain) {
    const g = ensureGL(b.geo), alpha = plain ? 1 : alphaOf(b);
    gl.uniformMatrix4fv(U.uM, false, dispMatrix(b));
    gl.frontFace(M.det3(b.matrix) < 0 ? gl.CW : gl.CCW);
    gl.uniform4f(U.uColor, b.color[0] / 255, b.color[1] / 255, b.color[2] / 255, alpha);
    gl.uniform1f(U.uSel, !plain && S.sel.has(b) ? 1 : 0);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    if (b.ana && !plain) { gl.uniform1i(U.uMode, 2); gl.bindVertexArray(b.ana.vao); gl.drawArrays(gl.TRIANGLES, 0, b.ana.count); }
    else { gl.uniform1i(U.uMode, 0); gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, b.geo.indices.length, gl.UNSIGNED_INT, 0); }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    const brE = b.geo.brepE && b.geo.brepE.length;
    if (brE && !(b.ana && !plain)) {   // B-rep solids show their true edges (not triangles), like CAD
      if (!g.vaoB) {
        g.vaoB = gl.createVertexArray(); g.bufB = gl.createBuffer();
        gl.bindVertexArray(g.vaoB); gl.bindBuffer(gl.ARRAY_BUFFER, g.pos);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.bufB); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.geo.brepE, gl.STATIC_DRAW);
      }
      gl.uniform1i(U.uMode, 1); gl.uniform4f(U.uColor, 0.05, 0.06, 0.08, alpha < 1 ? alpha * 0.7 : 1);
      gl.bindVertexArray(g.vaoB); gl.drawElements(gl.LINES, b.geo.brepE.length, gl.UNSIGNED_INT, 0);
    }
    if (edges && !brE) {
      ensureLines(b.geo);
      gl.uniform1i(U.uMode, 1); gl.uniform4f(U.uColor, 0, 0, 0, alpha < 1 ? alpha * 0.5 : 1);
      gl.bindVertexArray(g.vaoL); gl.drawElements(gl.LINES, g.nLine, gl.UNSIGNED_INT, 0);
    }
    if (!plain && $('cHoles').checked) drawBorders(b);
  }
  function setCamUniforms() {
    const R = cam.R;
    gl.uniformMatrix3fv(U.uR, false, [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
    gl.uniform3f(U.uT, cam.target[0], cam.target[1], cam.target[2]);
    gl.uniform3f(U.uS, 1 / (cam.zoom * cam.w / H), 1 / cam.zoom, -1 / depthRange());
  }
  function frame() { requestAnimationFrame(frame); if (!dirty) return; dirty = false; render(); }
  function render() {
    const dpr = window.devicePixelRatio || 1;
    W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; ov.width = pw; ov.height = ph; }
    mainCam.x = 0; mainCam.w = W;
    const split = !!(S.cmp && S.cmp.split);
    if (split) { S.cmp.cams[0].x = 0; S.cmp.cams[0].w = W / 2; S.cmp.cams[1].x = W / 2; S.cmp.cams[1].w = W / 2; }
    const saved = cam;
    if (gl) {
      gl.viewport(0, 0, pw, ph); gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0.085, 0.105, 0.13, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform1f(U.uBright, +$('ucBright').value / 100);
      gl.uniform1f(U.uClipOn, clipOn() ? 1 : 0);
      const cp = clipPlane();
      gl.uniform4f(U.uClip, cp[0], cp[1], cp[2], cp[3]);
      const edges = $('cWire').checked;
      gl.disable(gl.BLEND); gl.depthMask(true);
      if (split) {
        gl.enable(gl.SCISSOR_TEST);
        for (let i = 0; i < 2; i++) {
          cam = S.cmp.cams[i];
          const x0 = Math.round(cam.x * dpr), w0 = Math.round(cam.w * dpr);
          gl.viewport(x0, 0, w0, ph); gl.scissor(x0, 0, w0, ph);
          setCamUniforms();
          drawBody(i ? S.cmp.b : S.cmp.a, edges, !(i && S.cmp.dev));
        }
        gl.disable(gl.SCISSOR_TEST);
      } else {
        cam = mainCam;
        setCamUniforms();
        const opaque = [], trans = [];
        for (const b of S.bodies) if (b.visible && !S.ghostHide.has(b)) (alphaOf(b) >= 0.999 ? opaque : trans).push(b);
        for (const b of opaque) drawBody(b, edges, false);
        if (trans.length) {
          const w = viewer();
          trans.sort(function (a, b) { return V.dot(boxCenter(bodyBox(a, true)), w) - V.dot(boxCenter(bodyBox(b, true)), w); });
          gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
          for (const b of trans) drawBody(b, edges, false);
          gl.depthMask(true); gl.disable(gl.BLEND);
        }
        drawGhosts();
      }
      gl.bindVertexArray(null);
    }
    cam = mainCam;
    drawOverlay(dpr, split);
    cam = saved;
    const A = mainCam.R, f = [1, -1, 1], m = [];
    for (let c = 0; c < 3; c++) { for (let r = 0; r < 3; r++) m.push((f[r] * A[r * 3 + c] * f[c]).toFixed(5)); m.push(0); }
    $('cube').style.transform = 'matrix3d(' + m.join(',') + ',0,0,0,1)';
    $('cubeWrap').style.display = split ? 'none' : 'block';
  }

  function label(x, y, text, color) {
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(14,18,22,0.85)'; ctx.fillRect(x + 6, y - 17, w + 8, 17);
    ctx.fillStyle = color || '#e8f6ff'; ctx.fillText(text, x + 10, y - 4);
  }
  // ---------- measurement callouts: a label per measurement, dragged anywhere, rows that show their line on hover ----------
  const MC = '#5fe0ff', ROWC = { min: '#5fe0ff', max: '#ff9f43', cen: '#c58bff', len: '#9ee37d', thick: '#ffcf5a', ang: '#5fe0ff', sup: '#8fa3b8', r: '#5fe0ff', d: '#5fe0ff' };
  S.labBoxes = []; S.hovLab = null; S.measFocus = false;
  // the angle arc of an angle measurement: centre, two unit directions in its plane, angle, radius (world)
  function angArc(m) {
    const v = m.pts[1], u = V.norm(V.sub(m.pts[0], v)), w = V.norm(V.sub(m.pts[2], v)), th = m.v * Math.PI / 180;
    let n = V.cross(u, w);
    if (V.len(n) < 1e-9) n = V.cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    const leg = Math.min(V.len(V.sub(m.pts[0], v)), V.len(V.sub(m.pts[2], v))), px = 2 * cam.zoom / H;
    const t = V.norm(V.cross(V.norm(n), u)), R = Math.max(leg * 0.55, 42 * px);   // never smaller than ~40 px on screen
    return { v: v, u: u, t: t, th: th, R: R, at: function (a, r) { return V.add(v, V.add(V.mul(u, Math.cos(a) * (r || R)), V.mul(t, Math.sin(a) * (r || R)))); } };
  }
  function measAnchor(m) {
    if (m.type === 'dist' || m.type === 'thick') return V.mul(V.add(m.pts[0], m.pts[1]), 0.5);
    if (m.type === 'len') return m.pts[m.pts.length >> 1];
    if (m.type === 'angle') { const A = angArc(m); return A.at(A.th / 2); }
    return m.c;
  }
  // the rows of a callout: text, colour and (if any) the 3D segment it stands for
  function measCallRows(m) {
    const R = [];
    if (m.type === 'dist') {
      const many = !!(m.mx || m.cd);
      R.push({ k: 'min', t: (many ? 'Min  ' : '') + f2(m.v) + ' mm', seg: m.pts });
      if (m.mx) R.push({ k: 'max', t: 'Max  ' + f2(V.len(V.sub(m.mx[1], m.mx[0]))) + ' mm', seg: m.mx });
      if (m.cd) R.push({ k: 'cen', t: L('Tâm  ', 'Ctr  ') + f2(V.len(V.sub(m.cd[1], m.cd[0]))) + ' mm', seg: m.cd });
    } else if (m.type === 'thick') R.push({ k: 'thick', t: 't = ' + f2(m.v) + ' mm', seg: m.pts });
    else if (m.type === 'len') { R.push({ k: 'len', t: 'L  ' + f2(m.v) + ' mm', poly: m.pts }); if (m.sub === 'arc' && m.r) R.push({ k: 'r', t: 'R  ' + f2(m.r) + ' mm', poly: m.pts }); }
    else if (m.type === 'angle') { R.push({ k: 'ang', t: f2(m.v, 2) + '°', arc: true }); R.push({ k: 'sup', t: L('bù ', 'supp ') + f2(180 - m.v, 2) + '°', arc: 'sup' }); }
    else if (m.type === 'radius') { R.push({ k: 'r', t: 'R  ' + f2(m.r) + ' mm', seg: [m.c, m.pts[0]] }); R.push({ k: 'd', t: 'Ø  ' + f2(2 * m.r) + ' mm', seg: [V.sub(m.c, V.sub(m.pts[0], m.c)), m.pts[0]] }); }
    return R;
  }
  function segDraw(seg, col, w, dash) {
    const a = project(seg[0]), b = project(seg[1]);
    ctx.setLineDash(dash || []); line2(a, b, col, w); ctx.setLineDash([]);
    dot2(a, '#14181d', 4.5); dot2(a, col, 3); dot2(b, '#14181d', 4.5); dot2(b, col, 3);
  }
  function drawMeasures() {
    S.labBoxes = [];
    S.measures.forEach(function (m, i) {
      const sel = i === S.measSel && S.measFocus, hl = S.hovLab && S.hovLab.i === i ? S.hovLab.row : -1, rows = measCallRows(m);
      // the measured thing itself
      if (m.type === 'dist' || m.type === 'thick') segDraw(m.pts, m.type === 'thick' ? ROWC.thick : MC, sel ? 2.6 : 2);
      else if (m.type === 'len') { poly2(m.pts.map(project), ROWC.len, sel ? 4 : 3); dot2(project(m.pts[0]), '#ffffff', 3); dot2(project(m.pts[m.pts.length - 1]), '#ffffff', 3); }
      else if (m.type === 'angle') {
        const A = angArc(m), q = [];
        for (let k = 0; k <= 40; k++) q.push(project(A.at(A.th * k / 40)));
        const L1 = Math.max(V.len(V.sub(m.pts[0], A.v)), A.R * 1.35), L2 = Math.max(V.len(V.sub(m.pts[2], A.v)), A.R * 1.35);
        line2(project(A.v), project(A.at(0, L1)), MC, 2); line2(project(A.v), project(A.at(A.th, L2)), MC, 2);
        ctx.fillStyle = 'rgba(95,224,255,0.16)'; ctx.beginPath(); const c0 = project(A.v); ctx.moveTo(c0[0], c0[1]); for (const p of q) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill();
        poly2(q, MC, sel || hl === 0 ? 3 : 2);
        for (const e of [q[0], q[q.length - 1]]) dot2(e, MC, 2.5);
        dot2(c0, '#ffffff', 3);
      } else if (m.type === 'radius') {
        const u = V.norm(V.sub(m.pts[0], m.c)), v = V.cross(m.n, u), q = [];
        for (let k = 0; k <= 64; k++) { const a = k / 64 * 6.2832; q.push(project(V.add(m.c, V.add(V.mul(u, Math.cos(a) * m.r), V.mul(v, Math.sin(a) * m.r))))); }
        poly2(q, MC, sel ? 2.2 : 1.5); const c = project(m.c); line2(c, project(m.pts[0]), MC, 1.5); dot2(c, MC, 3);
      }
      // the row under the cursor shows its own line (max / centre distance only while hovered)
      if (hl >= 0 && rows[hl]) {
        const r = rows[hl], col = ROWC[r.k] || MC;
        if (r.seg) segDraw(r.seg, col, 3.2, r.k === 'max' || r.k === 'cen' ? [7, 4] : null);
        if (r.poly) poly2(r.poly.map(project), col, 5);
        if (r.arc === 'sup') { const A = angArc(m), q = []; for (let k = 0; k <= 40; k++) q.push(project(A.at(A.th + (Math.PI - A.th) * k / 40, A.R * 0.75))); line2(project(A.v), project(A.at(Math.PI, A.R * 1.2)), ROWC.sup, 1.5); poly2(q, ROWC.sup, 2.5); }
      }
      // the callout box, offset from its anchor by m.lo (pixels), with a leader line
      const an = project(measAnchor(m)), lo = m.lo || [26, -34];
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      let w = 0; for (const r of rows) w = Math.max(w, ctx.measureText(r.t).width);
      w += 16; const rh = 17, h = rows.length * rh + 4, x = an[0] + lo[0], y = an[1] + lo[1] - h / 2;
      const ex = Math.max(x, Math.min(an[0], x + w)), ey = Math.max(y, Math.min(an[1], y + h));
      ctx.setLineDash([3, 3]); line2(an, [ex, ey], sel ? '#ffffff' : 'rgba(200,225,240,0.7)', 1); ctx.setLineDash([]);
      dot2(an, sel ? '#ffffff' : MC, 2.5);
      ctx.fillStyle = 'rgba(14,18,22,0.9)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = sel ? '#ffffff' : S.hovLab && S.hovLab.i === i ? '#9fd8ff' : 'rgba(95,224,255,0.55)'; ctx.lineWidth = sel ? 1.6 : 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      rows.forEach(function (r, k) {
        const ry = y + 2 + k * rh;
        if (k === hl) { ctx.fillStyle = 'rgba(95,224,255,0.18)'; ctx.fillRect(x + 1, ry, w - 2, rh); }
        ctx.fillStyle = ROWC[r.k] || '#e8f6ff'; ctx.fillRect(x + 4, ry + 5, 3, rh - 10);
        ctx.fillStyle = k === hl ? '#ffffff' : '#e8f6ff'; ctx.fillText(r.t, x + 11, ry + 13);
      });
      S.labBoxes.push({ i: i, x: x, y: y, w: w, h: h, rh: rh, n: rows.length });
    });
  }
  // the callout (and its row) under a screen point
  function labAt(px, py) {
    for (let k = S.labBoxes.length - 1; k >= 0; k--) {
      const b = S.labBoxes[k];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return { i: b.i, row: Math.max(0, Math.min(b.n - 1, Math.floor((py - b.y - 2) / b.rh))) };
    }
    return null;
  }
  function deleteMeasure(i) {
    if (!S.measures[i]) return;
    if (!S.cmp) pushUndo();
    S.measures.splice(i, 1); S.measSel = Math.min(S.measSel, S.measures.length - 1); S.hovLab = null; S.measFocus = false;
    updateMeasList(); dirty = true;
  }
  function dot2(p, color, r) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], r || 3.5, 0, 6.2832); ctx.fill(); }
  function line2(a, b, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w || 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  const AXRGB = ['255,90,82', '82,208,106', '79,155,255'];
  function poly2(q, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); q.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke(); ctx.lineCap = 'butt'; }
  // arrow head whose tip is at b, pointing away from a
  function arrow2(a, b, color, len, half, edge) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (l < 1e-6) return;
    const ux = dx / l, uy = dy / l, bx = b[0] - ux * len, by = b[1] - uy * len;
    ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(bx - uy * half, by + ux * half); ctx.lineTo(bx + uy * half, by - ux * half); ctx.closePath();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.fillStyle = color; ctx.fill();
  }
  // gizmo strokes get a dark rim (white when the handle is under the cursor) so they stay readable on any mesh colour
  const rim = function (hot) { return hot ? '#ffffff' : 'rgba(8,10,14,0.88)'; };
  function gline(a, b, color, w, hot) { ctx.lineCap = 'round'; line2(a, b, rim(hot), w + 3.5); line2(a, b, color, w); ctx.lineCap = 'butt'; }
  function gpoly(q, color, w, hot) { poly2(q, rim(hot), w + 3.5); poly2(q, color, w); }
  // text centred on (x, y) on a dark plate
  function tag(x, y, text, color, edge) {
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(14,18,22,0.9)'; ctx.fillRect(x - w / 2, y - 9, w, 18);
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + 0.5, y - 8.5, w - 1, 17); }
    ctx.fillStyle = color || '#e8f6ff'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 4); ctx.textAlign = 'left';
  }
  // point at angle a on the circle of radius r around c, in the plane normal to axis i (angle 0 = next axis)
  function ringPt(c, i, r, a) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    return V.add(c, V.add(V.mul(GX(j), r * Math.cos(a)), V.mul(GX(k), r * Math.sin(a))));
  }
  // bounding box of the ticked bodies with its three sizes, as in a model-info view
  function drawBBox(list) {
    const bb = tightUnion(list, true), real = tightUnion(list, false), c = [], q = [], w = viewer();
    let far = 0, fd = Infinity;
    for (let i = 0; i < 8; i++) {
      const pt = [i & 1 ? bb.max[0] : bb.min[0], i & 2 ? bb.max[1] : bb.min[1], i & 4 ? bb.max[2] : bb.min[2]];
      c.push(pt); q.push(project(pt));
      const d = V.dot(pt, w);
      if (d < fd) { fd = d; far = i; }
    }
    const mid = project(boxCenter(bb)), tags = [];
    let ir = null;                                          // the info panel hides what is under it
    if ($('info').style.display !== 'none') { const r = $('info').getBoundingClientRect(), o = canvas.getBoundingClientRect(); ir = [r.left - o.left - 30, r.top - o.top - 12, r.right - o.left, r.bottom - o.top]; }
    for (let a = 0; a < 3; a++) {
      const bit = 1 << a;
      let be = -1, bd = -Infinity;
      for (let i = 0; i < 8; i++) {
        if (i & bit) continue;
        const j = i | bit, hidden = i === far || j === far;         // the three edges at the corner farthest from the eye
        ctx.setLineDash(hidden ? [4, 4] : []);
        line2(q[i], q[j], hidden ? 'rgba(190,210,235,0.38)' : 'rgba(215,230,250,0.95)', 1.3);
        if (!hidden) {
          const mx = (q[i][0] + q[j][0]) / 2, my = (q[i][1] + q[j][1]) / 2;
          let d = Math.hypot(mx - mid[0], my - mid[1]);       // prefer the outermost edge that is on screen and not covered
          if (ir && mx > ir[0] && mx < ir[2] && my > ir[1] && my < ir[3]) d -= 1e6;
          if (mx < 30 || mx > W - 30 || my < 14 || my > H - 14) d -= 1e5;
          if (d > bd) { bd = d; be = i; }
        }
      }
      tags.push([(q[be][0] + q[be | bit][0]) / 2, (q[be][1] + q[be | bit][1]) / 2, AXN[a] + '  ' + f2(real.max[a] - real.min[a]), AXC[a]]);
    }
    ctx.setLineDash([]);
    for (const t of tags) tag(t[0], t[1], t[2], '#ffffff', t[3]);
  }
  function drawCom(q, r, hot) {
    for (let k = 0; k < 4; k++) {
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.arc(q[0], q[1], r, k * Math.PI / 2, (k + 1) * Math.PI / 2); ctx.closePath();
      ctx.fillStyle = k % 2 ? '#14181d' : '#ffd23f'; ctx.fill();
    }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832); ctx.stroke();
    if (hot) { ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], r + 4, 0, 6.2832); ctx.stroke(); }
  }
  // the rotation in progress: dial around the axis, swept sector, angle read-out
  function drawRotation(dr, pv, Lw) {
    const i = dr.axis, r = Lw * 0.95, col = AXC[i], th0 = dr.th0, ang = (dr.ang || 0) * Math.PI / 180, c = project(pv);
    gline(project(V.sub(pv, V.mul(GX(i), Lw * 1.15))), project(V.add(pv, V.mul(GX(i), Lw * 1.15))), col, 2);
    const ring = [];
    for (let k = 0; k <= 96; k++) ring.push(project(ringPt(pv, i, r, k / 96 * 6.2832)));
    gpoly(ring, col, 2.5);
    for (let k = 0; k < 24; k++) {                             // a tick every 15 degrees, counted from where the drag started
      const a = th0 + k * Math.PI / 12;
      line2(project(ringPt(pv, i, r * (k % 6 ? 0.92 : 0.84), a)), project(ringPt(pv, i, r, a)), col, k % 6 ? 1.5 : 2.5);
    }
    const sweep = Math.max(-6.2832, Math.min(6.2832, ang)), n = Math.max(2, Math.ceil(Math.abs(sweep) / 0.07));
    ctx.fillStyle = 'rgba(' + AXRGB[i] + ',0.28)'; ctx.beginPath(); ctx.moveTo(c[0], c[1]);
    for (let k = 0; k <= n; k++) { const q = project(ringPt(pv, i, r, th0 + sweep * k / n)); ctx.lineTo(q[0], q[1]); }
    ctx.closePath(); ctx.fill();
    const e0 = project(ringPt(pv, i, r, th0)), e1 = project(ringPt(pv, i, r, th0 + ang));
    ctx.setLineDash([5, 4]); line2(c, e0, '#ffffff', 1.5); ctx.setLineDash([]);
    gline(c, e1, col, 3); dot2(e1, '#ffffff', 7); dot2(e1, col, 4.5); dot2(c, '#ffffff', 4);
    const t = project(ringPt(pv, i, r * 1.22, th0 + ang));
    tag(t[0], t[1], AXN[i] + '  ' + (dr.ang > 0 ? '+' : '') + f2(dr.ang || 0, 1) + '°', '#ffffff', col);
  }
  function gizmoActive() { return !S.cmp && (S.tool === 'move' || S.tool === 'rotate' || S.tool === 'scale') && selBodies().some(function (b) { return b.visible; }); }
  function drawTriad(x, y) {
    for (let i = 0; i < 3; i++) {
      const e = [x + cam.R[i] * 30, y - cam.R[3 + i] * 30];
      line2([x, y], e, AXC[i], 2.5);
      ctx.fillStyle = AXC[i]; ctx.font = 'bold 11px Arial'; ctx.fillText(AXN[i], e[0] + (cam.R[i] >= 0 ? 3 : -11), e[1] + (cam.R[3 + i] >= 0 ? -3 : 11));
    }
  }
  function drawCmpPoints(pts, color) {
    pts.forEach(function (p, i) {
      const q = project(p);
      dot2(q, '#14181d', 9); dot2(q, color, 7.5);
      ctx.fillStyle = '#14181d'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), q[0], q[1] + 4); ctx.textAlign = 'left';
    });
  }
  function drawOverlay(dpr, split) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    S.giz = null;
    if (split) {
      const c = S.cmp;
      line2([W / 2, 0], [W / 2, H], '#f0a030', 2);
      if (S.clean) return;                                 // picture for the clipboard: the two views and the divider only
      for (let i = 0; i < 2; i++) {
        cam = c.cams[i];
        ctx.save(); ctx.beginPath(); ctx.rect(cam.x, 0, cam.w, H); ctx.clip();
        drawCmpPoints(i ? c.pb : c.pa, i ? '#5fe0ff' : '#ffcf5a');
        drawTriad(cam.x + 44, H - 70);
        ctx.restore();
        const b = i ? c.b : c.a, n = (i ? c.pb : c.pa).length;
        ctx.font = 'bold 13px "Segoe UI", Arial'; ctx.fillStyle = i ? '#5fe0ff' : '#ffcf5a';
        ctx.fillText((i ? L('Cần căn: ', 'To align: ') : L('Tham chiếu: ', 'Reference: ')) + b.name + '  ·  ' + n + L(' điểm', ' points'), cam.x + 14, 62);
      }
      cam = mainCam;
      return;
    }
    // world axes at the origin
    if ($('cAxes').checked) {
      const Ln = Math.max(cam.radius * 0.225, 1e-6), o = project([0, 0, 0]);
      for (let i = 0; i < 3; i++) {
        const e = project(V.mul(AXES[i], Ln));
        line2(o, e, AXC[i], 2);
        ctx.fillStyle = AXC[i]; ctx.font = 'bold 12px Arial'; ctx.fillText(AXN[i], e[0] + 4, e[1] - 4);
      }
      dot2(o, '#ffffff', 3);
    }
    drawTriad(44, H - 70);
    const tick = selBodies();
    if ($('cHoles').checked) {                               // open borders again, thick, when there are few enough to afford it
      let ne = 0;
      for (const b of S.bodies) if (b.visible) ne += holesOf(b.geo).edges;
      if (ne && ne <= 5000) {
        ctx.strokeStyle = '#ff2a1f'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
        for (const b of S.bodies) {
          if (!b.visible) continue;
          const h = holesOf(b.geo), P = b.geo.positions, m = dispMatrix(b);
          for (let i = 0; i < h.E.length; i += 2) {
            const a = 3 * h.E[i], c = 3 * h.E[i + 1], q = project(M.point(m, [P[a], P[a + 1], P[a + 2]])), r = project(M.point(m, [P[c], P[c + 1], P[c + 2]]));
            ctx.moveTo(q[0], q[1]); ctx.lineTo(r[0], r[1]);
          }
        }
        ctx.stroke(); ctx.lineCap = 'butt';
      }
    }
    if (S.show.box && tick.length) drawBBox(tick);
    drawGeos(); drawUcDir(); drawMeasures(); updGeoVisBtn();
    drawSketch(); drawDlgSel();
    for (const p of S.tmp) dot2(project(p), '#ffcf5a', 4.5);
    drawSkHov();
    if (S.hovEnt) {                                          // what a click would take, in the measuring tools
      const e = S.hovEnt, HC = '#ffe14a';
      for (const pl of e.lines || []) poly2(pl.map(project), HC, e.kind === 'edge' ? 4.5 : 2.5);
      if (e.kind === 'point') { const q = project(e.p); dot2(q, '#14181d', 8); dot2(q, HC, 6); }
      if (e.text) { const q = project(e.at); tag(q[0], q[1] - 20, e.text, '#ffffff', HC); }
    }
    for (const m of comMarkers()) {
      const q = project(m.p);
      drawCom(q, m.all ? 10 : 7.5, S.hovCom === m.p || (S.hovCom && V.len(V.sub(S.hovCom, m.p)) < 1e-9));
      if (m.all) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 12px Arial'; ctx.fillText('Σ', q[0] + 13, q[1] - 9); }
    }
    if (S.viewPivot) { const q = project(S.viewPivot); dot2(q, 'rgba(255,255,255,0.35)', 9); dot2(q, '#ffffff', 4.5); dot2(q, '#f0a030', 3); }
    if (S.cmp) drawCmpPoints(S.cmp.pa, '#ffcf5a');
    if (S.box) {
      const bx = S.box, cross = bx.x1 < bx.x0;
      ctx.setLineDash(cross ? [6, 4] : []);
      ctx.strokeStyle = cross ? '#52d06a' : '#4f9bff'; ctx.fillStyle = cross ? 'rgba(82,208,106,0.12)' : 'rgba(79,155,255,0.12)'; ctx.lineWidth = 1.5;
      ctx.fillRect(bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0); ctx.strokeRect(bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0);
      ctx.setLineDash([]);
    }
    // transform gizmo
    if (gizmoActive()) {
      const sel = selBodies().filter(function (b) { return b.visible; });
      const dg = drag && drag.type === 'giz' ? drag : null, hov = dg ? dg.axis : S.hov;
      // while rotating or scaling the handle stays where the drag started; while moving it travels with the bodies
      const pv = dg && S.tool !== 'move' ? dg.pv3 : $('pivot').value !== 'c' && !(S.tool === 'move' && dg) ? pivotPoint(sel) : boxCenter(unionBox(sel, true)), p = project(pv), Lw = 124 * 2 * cam.zoom / H, ends = [], arcs = [];
      for (let i = 0; i < 3; i++) {
        ends.push(project(V.add(pv, V.mul(GX(i), Lw))));
        const q = [];
        if (S.tool === 'rotate') for (let k = 0; k <= GIZ_ARC.n; k++) q.push(project(ringPt(pv, i, Lw * GIZ_ARC.r, GIZ_ARC.a0 + (GIZ_ARC.a1 - GIZ_ARC.a0) * k / GIZ_ARC.n)));
        arcs.push(q);
      }
      if (S.tool === 'rotate' && dg && dg.moved) drawRotation(dg, pv, Lw);
      else {
        ctx.font = 'bold 13px Arial';
        const letter = function (i, dx, dy) { const e = ends[i]; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,14,0.88)'; ctx.strokeText(AXN[i], e[0] + dx, e[1] + dy); ctx.fillStyle = AXC[i]; ctx.fillText(AXN[i], e[0] + dx, e[1] + dy); };
        if (S.tool === 'rotate') {
          for (let i = 0; i < 3; i++) { gline(p, ends[i], AXC[i], 2); letter(i, 7, -7); }
          for (let i = 0; i < 3; i++) {
            // the curved arrow between the two other axes turns the bodies about axis i
            const q = arcs[i], n = q.length, on = hov === i;
            gpoly(q.slice(0, n - 2), AXC[i], on ? 6.5 : 4.5, on);
            arrow2(q[n - 4], q[n - 1], AXC[i], on ? 25 : 22, on ? 11 : 9.5, rim(on));
          }
          dot2(p, 'rgba(8,10,14,0.88)', 6); dot2(p, '#ffffff', 4);
          if (hov !== null && hov >= 0) { const m = arcs[hov][GIZ_ARC.n >> 1]; tag(m[0] + (m[0] - p[0]) * 0.45, m[1] + (m[1] - p[1]) * 0.45, L('Xoay quanh ', 'Rotate about ') + AXN[hov], '#ffffff', AXC[hov]); }
        } else {
          for (let i = 0; i < 3; i++) {
            const e = ends[i], on = hov === i, far = Math.hypot(e[0] - p[0], e[1] - p[1]) > 16;
            if (S.tool === 'move') {
              const tip = [e[0] + (e[0] - p[0]) * 0.1, e[1] + (e[1] - p[1]) * 0.1];
              gline(p, e, AXC[i], on ? 4.5 : 3, on);
              if (far) arrow2(p, tip, AXC[i], on ? 21 : 18, on ? 9.5 : 8, rim(on)); else { dot2(e, rim(on), 9); dot2(e, AXC[i], 6.5); }
            } else {
              const h = on ? 8 : 6.5;
              gline(p, e, AXC[i], on ? 4.5 : 3, on);
              ctx.fillStyle = rim(on); ctx.fillRect(e[0] - h - 2, e[1] - h - 2, 2 * h + 4, 2 * h + 4); ctx.fillStyle = AXC[i]; ctx.fillRect(e[0] - h, e[1] - h, 2 * h, 2 * h);
            }
            letter(i, 13, -10);
          }
          dot2(p, hov === -1 ? '#f0a030' : 'rgba(8,10,14,0.88)', hov === -1 ? 10 : 8); dot2(p, '#ffffff', 6); dot2(p, '#14181d', 3);
        }
      }
      S.giz = { p: p, ends: ends, Lw: Lw, pv: pv, arcs: arcs, hitAng: 0 };
    }
  }
  const GIZ_ARC = { r: 0.8, a0: 0.14, a1: Math.PI / 2 - 0.1, n: 20 };

  // ================= picking =================
  function ensureBVH(g) { return g.bvh || (g.bvh = core.buildBVH(g.positions, g.indices)); }
  function pick(px, py, only) {
    const ray = screenRay(px, py), cp = clipPlane(), clip = clipOn();
    let best = null;
    for (const b of only || S.bodies) {
      if (!b.visible) continue;
      const dm = dispMatrix(b), mi = M.inv(dm), ol = M.point(mi, ray.o), dl = M.vec(mi, ray.d), bvh = ensureBVH(b.geo);
      let t0 = 0;
      for (let k = 0; k < 200; k++) {
        const h = core.raycast(bvh, ol, dl, t0, best ? best.t : Infinity);
        if (!h) break;
        const p = V.add(ray.o, V.mul(ray.d, h.t));
        if (clip && V.dot(cp, p) > cp[3]) { t0 = h.t + ray.big * 1e-7; continue; }
        best = { t: h.t, tri: h.tri, body: b, point: p, dm: dm };
        break;
      }
    }
    if (!best) return null;
    const g = best.body.geo, I = g.indices, P = g.positions, vw = [];
    for (let k = 0; k < 3; k++) { const v = 3 * I[3 * best.tri + k]; vw.push(M.point(best.dm, [P[v], P[v + 1], P[v + 2]])); }
    let n = V.norm(V.cross(V.sub(vw[1], vw[0]), V.sub(vw[2], vw[0])));
    if (V.dot(n, ray.d) > 0) n = V.mul(n, -1);
    best.normal = n; best.verts = vw;
    return best;
  }
  // near a silhouette edge the exact pixel can miss: also try a small ring around it
  function pickNear(px, py, only) {
    let h = pick(px, py, only);
    for (let r = 3; !h && r <= 6; r += 3) for (let k = 0; k < 8 && !h; k++) h = pick(px + r * Math.cos(k * 0.7854), py + r * Math.sin(k * 0.7854), only);
    return h;
  }
  // planes, cylinders, spheres, edges and corners of a body, in world coordinates
  function featOf(b) {
    const key = b.matrix.join();
    if (b.feat && b.feat.key === key && b.feat.geo === b.geo) return b.feat.f;
    const f = core.features(worldMesh(b));
    b.feat = { key: key, geo: b.geo, f: f };
    return f;
  }
  // The thing under the cursor that a measuring tool would take: a corner, an edge, a recognised face, or a free point.
  function entityAt(h, px, py, freeOnly) {
    const b = h.body, off = S.cmp ? [0, 0, 0] : b.off, mv = function (p) { return V.add(p, off); };
    const free = { kind: 'point', p: snapPoint(h, px, py), at: h.point, free: true };
    if (freeOnly) return free;
    const F = S.flt, f = featOf(b), R = f.regions[f.reg[h.tri]];
    free.blocked = !F.point;
    if (!R) return free;
    const chains = R.chains.map(function (i) { return f.chains[i]; });
    // an edge or corner that lies well behind the surface under the cursor is hidden by it: not a candidate
    const w = viewer(), depth = V.dot(h.point, w) - 30 * 2 * cam.zoom / H;
    let best = null, bd = 11;
    if (F.point) for (const c of chains) {
      if (c.closed) continue;
      for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) { const wp = mv(p), q = project(wp), d = Math.hypot(q[0] - px, q[1] - py); if (d < bd && V.dot(wp, w) > depth) { bd = d; best = wp; } }
    }
    if (best) return { kind: 'point', p: best, at: best, text: L('Đỉnh', 'Corner') };
    let ec = null, ed = 8;
    for (const c of chains) {
      if (c.type === 'line' ? !F.line : c.type === 'arc' ? !(F.circle || F.center) : !(F.line || F.circle)) continue;
      let p0 = mv(c.pts[0]), prev = project(p0);
      for (let i = 1; i < c.pts.length; i++) {
        const p1 = mv(c.pts[i]), q = project(p1), ax = q[0] - prev[0], ay = q[1] - prev[1], l2 = ax * ax + ay * ay;
        const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - prev[0]) * ax + (py - prev[1]) * ay) / l2)) : 0, d = Math.hypot(px - prev[0] - t * ax, py - prev[1] - t * ay);
        if (d < ed && V.dot(V.add(p0, V.mul(V.sub(p1, p0), t)), w) > depth) { ed = d; ec = c; }
        p0 = p1; prev = q;
      }
    }
    if (ec && ec.type === 'arc' && !F.circle && ec.c) { const cc = mv(ec.c); return { kind: 'point', p: cc, at: cc, text: L('Tâm cung R', 'Arc centre R') + f2(ec.r), lines: [ec.pts.map(mv)] }; }
    if (ec) {
      const pts = ec.pts.map(mv);
      return { kind: 'edge', sub: ec.type, pts: pts, len: ec.len, r: ec.r, c: ec.c ? mv(ec.c) : null, n: ec.n, dir: ec.dir, p: pts[0], at: h.point, lines: [pts],
        text: ec.type === 'line' ? L('Cạnh thẳng ', 'Straight edge ') + f2(ec.len) + ' mm' : ec.type === 'arc' ? (ec.closed ? L('Đường tròn R ', 'Circle R ') : L('Cung R ', 'Arc R ')) + f2(ec.r) : L('Cạnh cong ', 'Curved edge ') + f2(ec.len) + ' mm' };
    }
    const lines = chains.map(function (c) { return c.pts.map(mv); });
    if (R.type === 'plane' && F.plane) return { kind: 'plane', n: R.n, p: h.point, at: h.point, lines: lines, text: L('Mặt phẳng', 'Plane') };
    if (R.type === 'cyl' && (F.face || F.axis)) return { kind: 'cyl', c: mv(R.c), dir: R.axis, r: R.r, p: h.point, at: h.point, lines: lines, text: F.face ? L('Mặt trụ R ', 'Cylinder R ') + f2(R.r) : L('Trục mặt trụ R ', 'Cylinder axis R ') + f2(R.r) };
    if (R.type === 'sphere' && (F.face || F.center)) return F.face ? { kind: 'sphere', c: mv(R.c), r: R.r, p: h.point, at: h.point, lines: lines, text: L('Mặt cầu R ', 'Sphere R ') + f2(R.r) } : { kind: 'point', p: mv(R.c), at: mv(R.c), text: L('Tâm mặt cầu', 'Sphere centre') };
    return free;
  }
  // reduce what was picked to a point, a line or a plane
  function entGeo(e) {
    if (e.kind === 'plane') return { t: 'plane', p: e.p, n: e.n };
    if (e.kind === 'cyl') return { t: 'line', p: e.c, d: e.dir };
    if (e.kind === 'sphere') return { t: 'point', p: e.c };
    if (e.kind === 'edge') return e.sub === 'line' ? { t: 'line', p: e.pts[0], d: e.dir } : e.sub === 'arc' ? { t: 'point', p: e.c } : { t: 'point', p: e.at };
    return { t: 'point', p: e.p };
  }
  const footLine = function (p, l) { return V.add(l.p, V.mul(l.d, V.dot(V.sub(p, l.p), l.d))); };
  const footPlane = function (p, pl) { return V.sub(p, V.mul(pl.n, V.dot(V.sub(p, pl.p), pl.n))); };
  // shortest connection between two picked things: [A, B], or null when they cross
  function entDist(a, b) {
    if (a.t === 'point' && b.t === 'point') return [a.p, b.p];
    if (a.t === 'point') return [a.p, b.t === 'line' ? footLine(a.p, b) : footPlane(a.p, b)];
    if (b.t === 'point') return [a.t === 'line' ? footLine(b.p, a) : footPlane(b.p, a), b.p];
    if (a.t === 'line' && b.t === 'line') {
      const w = V.sub(a.p, b.p), k = V.dot(a.d, b.d), den = 1 - k * k;
      if (den < 1e-6) return [a.p, footLine(a.p, b)];
      const s = (k * V.dot(b.d, w) - V.dot(a.d, w)) / den, t = (V.dot(b.d, w) - k * V.dot(a.d, w)) / den;
      return [V.add(a.p, V.mul(a.d, s)), V.add(b.p, V.mul(b.d, t))];
    }
    if (a.t === 'plane' && b.t === 'plane') return Math.abs(V.dot(a.n, b.n)) > 0.99985 ? [a.p, footPlane(a.p, b)] : null;
    const ln = a.t === 'line' ? a : b, pl = a.t === 'line' ? b : a;
    if (Math.abs(V.dot(ln.d, pl.n)) > 0.0175) return null;
    return a.t === 'line' ? [ln.p, footPlane(ln.p, pl)] : [footPlane(ln.p, pl), ln.p];
  }
  // angle between two lines / planes, drawn as two legs from where the second one was picked
  function entAngle(a, b, at) {
    let u, w;
    if (a.t === 'line' && b.t === 'line') { u = a.d; w = V.dot(a.d, b.d) < 0 ? V.mul(b.d, -1) : b.d; }
    else if (a.t === 'plane' && b.t === 'plane') {
      const ax = V.cross(a.n, b.n);
      if (V.len(ax) < 1e-6) { flash(L('Hai mặt phẳng song song: góc 0°', 'The two planes are parallel: 0°')); return; }
      // the vertex sits on the line where the two planes meet, the legs run into each face
      const ax2 = V.dot(ax, ax), X = V.mul(V.add(V.mul(V.cross(b.n, ax), V.dot(a.n, a.p)), V.mul(V.cross(ax, a.n), V.dot(b.n, b.p))), 1 / ax2), axn = V.norm(ax);
      at = V.add(X, V.mul(axn, V.dot(V.sub(at, X), axn)));
      u = V.norm(V.cross(ax, a.n)); if (V.dot(u, V.sub(a.p, at)) < 0) u = V.mul(u, -1);
      w = V.norm(V.cross(ax, b.n)); if (V.dot(w, V.sub(b.p, at)) < 0) w = V.mul(w, -1);
    } else {
      const ln = a.t === 'line' ? a : b, pl = a.t === 'line' ? b : a, k = V.dot(ln.d, pl.n);
      u = k < 0 ? V.mul(ln.d, -1) : ln.d;
      const pr = V.sub(u, V.mul(pl.n, Math.abs(k)));
      w = V.len(pr) < 1e-6 ? V.norm(V.cross(pl.n, Math.abs(pl.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])) : V.norm(pr);
    }
    const s = mainCam.radius * 0.18;
    addMeasure('angle', [V.add(at, V.mul(u, s)), at, V.add(at, V.mul(w, s))]);
  }
  function pushMeasure(m) { if (!S.cmp) pushUndo(); S.measures.push(m); S.measSel = S.measures.length - 1; updateMeasList(); dirty = true; }
  // ---------- measurement details (like a CAD measure panel) ----------
  function entLabel(e) { return (e.text || (e.free ? L('Điểm', 'Point') : e.kind === 'plane' ? L('Mặt phẳng', 'Plane') : L('Điểm', 'Point'))) + (e.bname ? ' · ' + e.bname : ''); }
  function entCentre(e) {
    if (e.kind === 'edge') { if (e.sub === 'arc' && e.c) return e.c; let c = [0, 0, 0]; for (const q of e.pts) c = V.add(c, q); return V.mul(c, 1 / e.pts.length); }
    if (e.kind === 'sphere') return e.c;
    if (e.kind === 'cyl') return footLine(e.at, { p: e.c, d: e.dir });
    return e.kind === 'point' ? e.p : e.at;
  }
  function entPoints(e) { return e.kind === 'edge' ? e.pts : e.kind === 'point' ? [e.p] : null; }
  function distExtras(m, e1, e2) {
    m.ents = [entLabel(e1), entLabel(e2)];
    m.dv = V.sub(m.pts[1], m.pts[0]);
    const c1 = entCentre(e1), c2 = entCentre(e2);
    if (e1.kind !== 'point' || e2.kind !== 'point') m.cd = [c1, c2];
    const p1 = entPoints(e1), p2 = entPoints(e2);
    if (p1 && p2 && (p1.length > 1 || p2.length > 1)) {
      let best = -1, pr = null;
      for (const a of p1) for (const b of p2) { const d = V.len(V.sub(b, a)); if (d > best) { best = d; pr = [a, b]; } }
      m.mx = pr;
      // the true shortest gap between the two (point sets and the segments between them), not between centres
      const near = function (p, l) { let bd = Infinity, bp = l[0]; for (let i = 0; i < l.length; i++) { const a = l[i], b = l[Math.min(i + 1, l.length - 1)], ab = V.sub(b, a), t2 = V.dot(ab, ab), t = t2 > 0 ? Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / t2)) : 0, q = V.add(a, V.mul(ab, t)), d = V.len(V.sub(q, p)); if (d < bd) { bd = d; bp = q; } } return [bd, bp]; };
      let bm = Infinity, pm = null;
      for (const a of p1) { const r = near(a, p2); if (r[0] < bm) { bm = r[0]; pm = [a, r[1]]; } }
      for (const b of p2) { const r = near(b, p1); if (r[0] < bm) { bm = r[0]; pm = [r[1], b]; } }
      if (pm && bm < m.v - 1e-9) { m.pts = [pm[0], pm[1]]; m.v = bm; m.dv = V.sub(pm[1], pm[0]); m.d = m.dv.map(Math.abs); }
    }
    const lens = [e1, e2].filter(function (e) { return e.kind === 'edge'; }).map(function (e) { return e.len; });
    if (lens.length) m.lens = lens;
  }
  function measRows(m) {                                     // [label, value, unit, delta xyz or null]
    const rows = [], dl = function (a, b) { return V.sub(b, a); };
    if (m.type === 'dist') {
      if (m.cd) rows.push([L('Khoảng cách tâm', 'Centre dist'), V.len(dl(m.cd[0], m.cd[1])), 'mm', dl(m.cd[0], m.cd[1])]);
      if (m.mx) rows.push([L('Khoảng cách lớn nhất', 'Max dist'), V.len(dl(m.mx[0], m.mx[1])), 'mm', dl(m.mx[0], m.mx[1])]);
      rows.push([L('Khoảng cách nhỏ nhất', 'Min dist'), m.v, 'mm', m.dv || dl(m.pts[0], m.pts[1])]);
      if (m.lens) rows.push([L('Chiều dài', 'Length'), m.lens.reduce(function (a, b) { return a + b; }, 0), 'mm', null]);
    } else if (m.type === 'len') {
      rows.push([L('Chiều dài', 'Length'), m.v, 'mm', null]);
      if (m.sub === 'arc') { rows.push([L('Bán kính', 'Radius'), m.r, 'mm', null], [L('Đường kính', 'Diameter'), 2 * m.r, 'mm', null]); if (m.c) rows.push([L('Tâm', 'Centre'), null, '', m.c]); }
      const a = m.pts[0], b = m.pts[m.pts.length - 1]; rows.push([L('Hai đầu mút', 'End to end'), V.len(dl(a, b)), 'mm', dl(a, b)]);
    } else if (m.type === 'radius') {
      rows.push([L('Bán kính', 'Radius'), m.r, 'mm', null], [L('Đường kính', 'Diameter'), 2 * m.r, 'mm', null], [L('Tâm', 'Centre'), null, '', m.c]);
    } else if (m.type === 'angle') rows.push([L('Góc', 'Angle'), m.v, '°', null], [L('Góc bù', 'Supplement'), 180 - m.v, '°', null]);
    else rows.push([L('Bề dày', 'Thickness'), m.v, 'mm', dl(m.pts[0], m.pts[1])]);
    return rows;
  }
  function updateMeasPanel() {
    const el = $('measPanel');
    if (!el) return;
    const m = S.measures[S.measSel], AX = [['X', '#ff5a52'], ['Y', '#52d06a'], ['Z', '#4f9bff']];
    let h = '<div class="selbox on"><div class="sbt">' + L('Đối tượng được đo', 'Measured entities') + '</div>';
    const ents = S.tmp.length && S.tmp[0].e && !(m && m.solo && S.tmp.length === 1) ? S.tmp.map(function (p) { return entLabel(p.e); }) : m && m.ents ? m.ents : [];
    h += ents.length ? ents.map(function (t) { return '<div class="sbi">' + t.replace(/</g, '&lt;') + '</div>'; }).join('') : '<div class="sbe">' + L('bấm vào mesh để chọn', 'click on the mesh to pick') + '</div>';
    h += '</div>';
    if (m && (!S.tmp.length || (m.solo && S.tmp.length === 1))) {
      h += '<table class="mtab">';
      for (const r of measRows(m)) {
        h += '<tr class="mh"><td>' + r[0] + ':</td><td>' + (r[1] === null ? '' : '<b>' + f2(r[1], 3) + '</b> ' + r[2]) + '</td></tr>';
        if (r[3]) AX.forEach(function (a, k) { h += '<tr><td class="ax"><span style="color:' + a[1] + '">' + a[0] + '</span></td><td>' + f2(r[3][k], 3) + ' mm</td></tr>'; });
      }
      h += '</table>';
    }
    el.innerHTML = h;
  }
  // one click on an entity in a measuring tool
  function measurePick(t, e) {
    const g = entGeo(e), n = S.tmp.length, mark = function () { const p = (e.kind === 'edge' || e.kind === 'plane' || e.kind === 'cyl' || e.kind === 'sphere' ? e.at : e.p).slice(); p.g = g; p.e = e; S.tmp.push(p); dirty = true; updateMeasPanel(); };
    if (t === 'radius') {
      if (!n && e.kind === 'edge' && e.sub === 'arc') return pushMeasure({ type: 'radius', pts: [e.pts[0]], c: e.c, n: e.n, r: e.r });
      if (!n && e.kind === 'cyl') { const c = footLine(e.at, { p: e.c, d: e.dir }); return pushMeasure({ type: 'radius', pts: [V.add(c, V.mul(V.norm(V.sub(e.at, c)), e.r))], c: c, n: e.dir, r: e.r }); }
      if (!n && e.kind === 'sphere') { const rd = V.norm(V.sub(e.at, e.c)), nn = V.norm(V.cross(rd, Math.abs(rd[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])); return pushMeasure({ type: 'radius', pts: [V.add(e.c, V.mul(rd, e.r))], c: e.c, n: nn, r: e.r }); }
      S.tmp.push((e.kind === 'point' ? e.p : e.at).slice()); dirty = true;
      if (S.tmp.length === 3) { addMeasure('radius', S.tmp); S.tmp = []; }
      return;
    }
    if (t === 'dist') {
      if (!n && e.kind === 'edge') {                         // an edge alone: its length; a second pick turns it into a distance
        pushMeasure({ type: 'len', pts: e.pts, v: e.len, sub: e.sub, r: e.r, c: e.c, ents: [entLabel(e)], solo: true });
        mark(); S.lenFirst = S.measures.length - 1; updateMeasPanel(); return;
      }
      mark();
      if (S.tmp.length < 2) return;
      const a = S.tmp[0].g, b = S.tmp[1].g, d = entDist(a, b), e1 = S.tmp[0].e, e2 = S.tmp[1].e;
      S.tmp = [];
      if (S.lenFirst !== undefined && S.measures[S.lenFirst] && S.measures[S.lenFirst].solo) { S.measures.splice(S.lenFirst, 1); hist.undo.pop(); updateHistBtns(); }
      S.lenFirst = undefined;
      if (d) { addMeasure('dist', d); const m = S.measures[S.measures.length - 1]; if (m) { distExtras(m, e1, e2); S.measSel = S.measures.length - 1; updateMeasList(); } return; }
      flash(L('Hai đối tượng cắt nhau (khoảng cách 0): hiện góc giữa chúng', 'The two cross each other (distance 0): showing the angle between them'));
      return entAngle(a, b, e.at);
    }
    // angle: two lines / planes, or three points
    const dirPick = g.t !== 'point', first = n ? S.tmp[0].g : null;
    if (first && first.t !== 'point') {
      if (!dirPick) { flash(L('Hãy bấm thêm một mặt phẳng, cạnh thẳng hoặc mặt trụ', 'Now click a plane, a straight edge or a cylinder')); return; }
      S.tmp = [];
      return entAngle(first, g, e.at);
    }
    if (!n && dirPick) { mark(); flash(L('Bấm mặt phẳng / cạnh thẳng thứ hai', 'Click the second plane / straight edge'), true); return; }
    S.tmp.push((e.kind === 'point' ? e.p : e.at).slice()); dirty = true;
    if (S.tmp.length === 3) { addMeasure('angle', S.tmp); S.tmp = []; }
  }
  function snapPoint(h, px, py) {
    let bestD = 10, p = h.point;
    for (const v of h.verts) { const s = project(v), d = Math.hypot(s[0] - px, s[1] - py); if (d < bestD) { bestD = d; p = v; } }
    return p;
  }

  // ================= UI helpers =================
  let statusTimer = 0;
  function flash(text, sticky) {
    const el = $('status');
    clearTimeout(statusTimer);
    if (!text) { el.style.display = 'none'; return; }
    el.textContent = text; el.style.display = 'block';
    if (!sticky) statusTimer = setTimeout(function () { el.style.display = 'none'; }, 2800);
  }
  function showError(e) { $('msg').textContent = e ? L('Lỗi: ', 'Error: ') + (e.message || e) : ''; if (e) console.error(e); }
  function setBusy(on, text) {
    busy = on;
    $('busy').style.display = on ? 'flex' : 'none';
    if (text) $('busyText').textContent = text;
    $('bar').firstElementChild.style.width = '0%';
  }
  function setProgress(p) { $('bar').firstElementChild.style.width = Math.round(p * 100) + '%'; }
  function resetBox(id) { const el = $(id); if (el.dataset.vi !== undefined) el.innerHTML = lang === 'en' ? el.dataset.en : el.dataset.vi; }
  function toolHint(t) {
    return {
      move: L('Kéo mũi tên X / Y / Z để di chuyển, chấm giữa để di chuyển tự do (giữ Shift: bước 1 mm), hoặc nhập số ở bảng nhỏ', 'Drag an X / Y / Z arrow to move, the centre dot to move freely (hold Shift: 1 mm steps), or type values in the small panel'),
      rotate: L('Kéo một mũi tên cong để xoay quanh trục cùng màu (giữ Shift: bước 1°), hoặc nhập số ở bảng nhỏ', 'Drag a curved arrow to rotate about the axis of the same colour (hold Shift: 1° steps), or type values in the small panel'),
      scale: L('Kéo tay nắm X / Y / Z để đổi tỉ lệ theo trục, chấm giữa để đổi đồng đều (giữ Shift: tỉ lệ nguyên), hoặc nhập số ở bảng nhỏ', 'Drag an X / Y / Z handle to scale along that axis, the centre dot to scale uniformly (hold Shift: whole factors), or type values in the small panel'),
      dist: L('Bấm 1 cạnh để lấy chiều dài, hoặc bấm 2 đối tượng (đỉnh, mặt phẳng, mặt trụ = trục, điểm) để đo khoảng cách. Giữ Alt để lấy điểm tự do', 'Click one edge for its length, or two things (corner, plane, cylinder = its axis, point) for the distance. Hold Alt for a free point'),
      angle: L('Bấm 2 mặt phẳng / cạnh thẳng, hoặc 3 điểm (điểm thứ hai là đỉnh góc)', 'Click 2 planes / straight edges, or 3 points (the second is the vertex)'),
      radius: L('Bấm 1 cung tròn, mặt trụ hoặc mặt cầu; hoặc 3 điểm trên cùng một cung', 'Click one arc, cylinder or sphere; or 3 points on the same arc'),
      thick: L('Bấm vào một điểm trên mesh để đo bề dày tại đó', 'Click a point on the mesh to measure the wall thickness there'),
      secpick: L('Bấm vào một mặt trên mesh để lấy làm mặt cắt', 'Click a face on the mesh to use it as the section plane'),
      mate: L('Bấm mặt phẳng / mặt trụ / cạnh / điểm trên body cần dời, rồi bấm đích trên body khác hoặc geometry: mặt áp mặt, trục trùng trục, điểm vào điểm / mặt / trục', 'Click a face / cylinder / edge / point on the body to move, then the target on another body or a geometry: face to face, axis on axis, point onto point / face / axis'),
      gpoint: L('Bấm để đặt điểm: đỉnh, tâm, trung điểm hoặc điểm trên mesh (theo bộ lọc). Esc để thôi', 'Click to place a point: corner, centre or a point on the mesh (as the filter allows). Esc to stop'),
      gline: L('Line: chọn kiểu ở bảng nhỏ, bấm trên màn hình để điền từng ô (ô viền cam là ô đang nhận), rồi bấm Tạo line hoặc Enter', 'Line: pick the kind in the small panel, click in the view to fill each box (the orange box takes the click), then Create line or Enter'),
      gplane: L('Theo mặt: bấm một mặt phẳng (offset, đảo chiều ở bảng nhỏ). 3 điểm: bấm 3 điểm', 'On face: click a flat face (offset and flip in the small panel). 3 points: click 3 points'),
      gaxis: L('Bấm mặt trụ, cạnh tròn hoặc cạnh thẳng; hoặc 2 điểm', 'Click a cylinder, a round edge or a straight edge; or 2 points')
    }[t] || '';
  }
  function setTool(t) {
    if (S.cmp && S.cmp.split) t = 'select';
    S.tool = t; S.tmp = [];
    document.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); });
    const geoT = t === 'gpoint' || t === 'gline' || t === 'gplane' || t === 'gaxis', xf = t === 'move' || t === 'rotate' || t === 'scale';
    $('tpop').style.display = (xf || t === 'mate' || geoT) ? 'block' : 'none';
    $('tpAxes').style.display = xf ? 'flex' : 'none'; $('tpGeo').style.display = geoT ? 'flex' : 'none'; S.axPick = null; S.geoPick = []; S.geoPlane = null; if (geoT) geoToolUI(t);
    $('tpMate').style.display = t === 'mate' ? 'flex' : 'none'; S.mate = null; S.pivPick = false;
    if (t === 'dist' || t === 'angle' || t === 'radius' || t === 'thick') { openPop('measure', true); updateMeasPanel(); }
    $('tpMove').style.display = t === 'move' ? 'flex' : 'none'; $('tpRot').style.display = t === 'rotate' ? 'flex' : 'none';
    $('tpScale').style.display = t === 'scale' ? 'flex' : 'none'; $('tpPivot').style.display = xf ? 'flex' : 'none';
    ucPickStop(); canvas.style.cursor = toolCursor(); S.hov = null; S.hovCom = null; S.hovEnt = null; S.skHov = null;
    if ((t === 'move' || t === 'rotate' || t === 'scale') && !S.sel.size) flash(L('Hãy tick chọn body trước', 'Tick a body first'));
    else flash(toolHint(t), !!toolHint(t));
    dirty = true;
  }
  function select(list, add) {
    if (!add) S.sel.clear();
    if (!add && !list.length) { S.spl = null; if (S.skSel) { S.skSel = null; updateSketchList(); } if (S.geoSet.size || S.geoSel) { S.geoSet.clear(); S.geoSel = null; updateSketchList(); dirty = true; } }                  // unticking everything also ends the "next option" run of the last split
    for (const b of list) { if (add && S.sel.has(b)) S.sel.delete(b); else S.sel.add(b); }
    refresh();
  }
  function refresh() {
    updateList(); updateInfo(); syncCounts(true); updateHoleUI(); updateSketchList();
    // Split is only lit while something is ticked; with nothing ticked and no split to continue, the option goes back to 1
    $('bSplit').classList.toggle('primary', S.sel.size > 0);
    // things that only work on ticked bodies stay plain (colour / opacity greyed out) until something is ticked
    $('bStl').classList.toggle('primary', S.sel.size > 0); $('bApply').classList.toggle('primary', S.sel.size > 0);
    $('bStep').classList.toggle('primary', selBodies().some(function (b) { return b.solid && b.geo && b.geo.brep; }));   // STEP only lights for ticked B-rep solids
    $('col').disabled = $('opa').disabled = !S.sel.size;
    $('col').closest('label').classList.toggle('off', !S.sel.size);
    const live = S.spl && S.spl.items.every(function (it) { return it.out.length && it.out.every(function (b) { return S.bodies.indexOf(b) >= 0; }); });
    if (!S.sel.size && !live && splitLevel !== 1) { S.spl = null; splitLevel = 1; }
    updateSplitUI();
    dirty = true;
  }
  const massTxt = function (g) { return g >= 1000 ? f2(g / 1000, 3) + ' kg' : f2(g) + ' g'; };
  function getStats(b) {
    if (!b.stats) { const wm = worldMesh(b); b.stats = core.stats(wm.positions, wm.indices); }
    return b.stats;
  }

  function updateList() {
    const box = $('bodyList');
    box.innerHTML = '';
    $('bSaveSes').disabled = $('bClear').disabled = !S.bodies.length;
    const hd = document.createElement('div'); hd.className = 'brow hd';
    hd.innerHTML = '<span title="Highlight">☑</span><span title="' + L('Ẩn / hiện', 'Show / hide') + '">👁</span><span></span><span>' + L('Tên', 'Name') +
      '</span><span class="num">' + L('Tam giác', 'Tris') + '</span><span class="num">' + L('K.lượng', 'Mass') + '</span>';
    box.appendChild(hd);
    if (!S.bodies.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L('Chưa có mesh nào.', 'No mesh loaded.'); box.appendChild(e); return; }
    const frag = document.createDocumentFragment(), shown = Math.min(S.bodies.length, 400);
    for (let i = 0; i < shown; i++) {
      const b = S.bodies[i], row = document.createElement('div');
      row.className = 'brow' + (S.sel.has(b) ? ' sel' : '');
      const cs = document.createElement('input'); cs.type = 'checkbox'; cs.checked = S.sel.has(b); cs.title = 'Highlight';
      cs.addEventListener('click', function (e) { e.stopPropagation(); });
      cs.addEventListener('change', function () { if (S.cmp) { cs.checked = !cs.checked; blocked(); return; } select([b], true); });
      const cv = document.createElement('input'); cv.type = 'checkbox'; cv.checked = b.visible; cv.title = L('Ẩn / hiện', 'Show / hide');
      cv.addEventListener('click', function (e) { e.stopPropagation(); });
      cv.addEventListener('change', function () { if (S.cmp) { cv.checked = !cv.checked; blocked(); return; } pushUndo(); b.visible = cv.checked; updateExplode(); sceneChanged(false); });
      const chip = document.createElement('span'); chip.className = 'chip'; chip.style.background = 'rgb(' + b.color.join(',') + ')';
      const nm = document.createElement('span'); nm.className = 'nm'; const isB = !!(b.geo && b.geo.brep);
      nm.textContent = (b.solid && !isB ? '◆ ' : '') + b.name; nm.title = b.name + (b.solid ? L(' (khối solid: còn sửa được thông số)', ' (solid: its parameters can still be edited)') : '') + (isB ? L(' — khối B-rep chính xác, xuất được STEP', ' — exact B-rep solid, can be saved as STEP') : L(' — lưới tam giác', ' — triangle mesh'));
      const kb = document.createElement('span'); kb.className = 'kind ' + (isB ? 'kb' : 'km'); kb.textContent = isB ? 'B-rep' : L('Lưới', 'Mesh'); nm.insertBefore(kb, nm.firstChild);
      nm.addEventListener('dblclick', function (e) { e.stopPropagation(); renameBody(b); });
      const ct = document.createElement('span'); ct.className = 'num'; ct.textContent = fmtN(b.geo.indices.length / 3);
      const ms = document.createElement('span'); ms.className = 'num'; ms.textContent = b.density > 0 ? massTxt(getStats(b).volume / 1000 * b.density) : '-';
      row.appendChild(cs); row.appendChild(cv); row.appendChild(chip); row.appendChild(nm); row.appendChild(ct); row.appendChild(ms);
      row.addEventListener('click', function () { if (blocked() || dlgPickBody(b)) return; select([b], true); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); openMenu(e.clientX, e.clientY, b); });
      frag.appendChild(row);
    }
    if (S.bodies.length > shown) {
      const more = document.createElement('div'); more.className = 'empty';
      more.textContent = L('... và ', '... and ') + fmtN(S.bodies.length - shown) + L(' body nữa', ' more bodies');
      frag.appendChild(more);
    }
    box.appendChild(frag);
  }
  function renameBody(b) {
    const n = prompt(L('Tên body:', 'Body name:'), b.name);
    if (n && n.trim() && n.trim() !== b.name) { pushUndo(); b.name = ''; b.name = uniqueName(safe(n.trim())); refresh(); }
  }

  function updateInfo() {
    const sel = selBodies(), tb = $('infoTbl'), rows = [];
    $('info').style.display = $('cInfo').checked && !(S.cmp && S.cmp.split) ? 'block' : 'none';
    const dim = function (mn, mx) { return f2(mx[0] - mn[0]) + ' × ' + f2(mx[1] - mn[1]) + ' × ' + f2(mx[2] - mn[2]) + ' mm'; };
    const xyz = function (c) { return c.map(function (v) { return f2(Math.abs(v) < 0.005 ? 0 : v); }).join(', ') + ' mm'; };
    const tips = { box: L('Hiện hộp bao và kích thước trên màn hình 3D', 'Show the bounding box and its dimensions in the 3D view'),
      com: L('Hiện trọng tâm trên màn hình 3D; các công cụ đo bắt được điểm này', 'Show the centre of mass in the 3D view; the measuring tools snap to it') };
    if (!sel.length) {
      let nt = 0; for (const b of S.bodies) nt += b.geo.indices.length / 3;
      rows.push([L('Số body', 'Bodies'), fmtN(S.bodies.length)], [L('Tổng tam giác', 'Total triangles'), fmtN(nt)], ['', L('Tick một body để xem chi tiết', 'Tick a body for details')]);
    } else if (sel.length === 1) {
      const b = sel[0], s = getStats(b);
      const tp = b.geo.topo || (b.geo.topo = core.topology(b.geo.indices, b.geo.positions.length / 3)), closed = tp.border === 0 && tp.nonManifold === 0;
      rows.push([L('Tên', 'Name'), b.name], [L('Tam giác', 'Triangles'), fmtN(b.geo.indices.length / 3)], [L('Đỉnh', 'Vertices'), fmtN(b.geo.positions.length / 3)],
        [L('Kích thước bao', 'Bounding box'), dim(s.min, s.max), 'box'], [L('Diện tích bề mặt', 'Surface area'), f2(s.area / 100) + ' cm²'],
        [L('Thể tích', 'Volume'), f2(s.volume / 1000, 3) + ' cm³'],
        [L('Trọng tâm', 'Centre of mass'), xyz(comOf(b, false)) + (closed ? '' : L(' (gần đúng)', ' (approx.)')), 'com'],
        [L('Lưới', 'Mesh'), closed ? L('kín', 'closed') : [tp.border ? L('hở, ', 'open, ') + fmtN(tp.border) + L(' cạnh biên', ' boundary edges') : '', tp.nonManifold ? fmtN(tp.nonManifold) + L(' cạnh non-manifold', ' non-manifold edges') : ''].filter(Boolean).join('; ')],
        [L('Khối lượng', 'Mass'), b.density > 0 ? massTxt(s.volume / 1000 * b.density) + (closed ? '' : L(' (không tin cậy: lưới không kín)', ' (unreliable: mesh not closed)')) : L('chưa gán vật liệu', 'no material')]);
    } else {
      let nt = 0, vol = 0, mass = 0, noMat = 0;
      for (const b of sel) { const s = getStats(b); nt += b.geo.indices.length / 3; vol += s.volume; if (b.density > 0) mass += s.volume / 1000 * b.density; else noMat++; }
      const bb = tightUnion(sel, false);
      rows.push([L('Đang tick', 'Ticked'), fmtN(sel.length) + ' body'], [L('Tổng tam giác', 'Total triangles'), fmtN(nt)], [L('Kích thước bao', 'Bounding box'), dim(bb.min, bb.max), 'box'],
        [L('Tổng thể tích', 'Total volume'), f2(vol / 1000, 3) + ' cm³'], [L('Trọng tâm chung', 'Combined centre of mass'), xyz(comAll(sel, false)), 'com'], [L('Tổng khối lượng', 'Total mass'), massTxt(mass) + (noMat ? ' (' + noMat + L(' body chưa gán vật liệu)', ' bodies without material)') : '')]);
    }
    tb.innerHTML = '';
    for (const r of rows) {
      const tr = tb.insertRow(), c0 = tr.insertCell();
      if (r[2]) {                                           // a row whose quantity can be shown in the 3D view
        const lb = document.createElement('label'), cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = 'cShow_' + r[2]; cb.checked = S.show[r[2]]; lb.title = tips[r[2]];
        cb.addEventListener('change', function () { S.show[r[2]] = cb.checked; dirty = true; });
        lb.appendChild(cb); lb.appendChild(document.createTextNode(r[0])); c0.appendChild(lb);
      } else c0.textContent = r[0];
      tr.insertCell().textContent = r[1];
    }
    const first = sel[0];
    $('mat').value = first ? first.material : '';
    $('dens').value = first ? first.density : 0;
    if (first) {
      $('col').value = '#' + first.color.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
      $('opa').value = Math.round(first.opacity * 100); $('opaV').textContent = Math.round(first.opacity * 100) + '%';
    }
  }

  // ================= language =================
  function fillMats() {
    const sel = $('mat'), v = sel.value;
    sel.innerHTML = '';
    for (const m of MATS) { const o = document.createElement('option'); o.value = m[0]; o.textContent = (lang === 'en' ? m[2] : m[1]) + (m[3] && m[0] !== 'custom' ? ' (' + m[3] + ')' : ''); sel.appendChild(o); }
    sel.value = v;
  }
  function ucLegend() {
    return '<span class="chip" style="background:#3cdc6e"></span> ' + L('Thoát khuôn phía +', 'Released by + half') + '&nbsp; <span class="chip" style="background:#46a0ff"></span> ' + L('Phía −', '− half') +
      '<br><span class="chip" style="background:#ffdc28"></span> ' + L('Thiếu góc thoát', 'Draft too small') + '&nbsp; <span class="chip" style="background:#ff323c"></span> Undercut';
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-en]').forEach(function (el) {
      if (el.dataset.vi === undefined) el.dataset.vi = el.innerHTML;
      el.innerHTML = lang === 'en' ? el.dataset.en : el.dataset.vi;
    });
    document.querySelectorAll('[data-en-title]').forEach(function (el) {
      if (el.dataset.viTitle === undefined) el.dataset.viTitle = el.title;
      el.title = lang === 'en' ? el.dataset.enTitle : el.dataset.viTitle;
    });
    $('bVi').classList.toggle('on', lang === 'vi'); $('bEn').classList.toggle('on', lang === 'en');
    $('lMax').textContent = modeValue() === 'edge' ? L('Edge Length (tối thiểu)', 'Edge Length (minimum)') : 'Maximum';
    $('ucRes').innerHTML = ucLegend();
    fillMats(); updateMeasList(); refresh(); updateCmpUI(); updateSplitUI(); updateHoleUI(); updateSketchList(); tipKeys();
    if (S.col) renderCollisions();
    flash('');
  }
  function setLang(l) { lang = l; try { localStorage.setItem('mrtLang', l); } catch (e) { /* ignore */ } applyLang(); }
  $('bVi').addEventListener('click', function () { setLang('vi'); });
  $('bEn').addEventListener('click', function () { setLang('en'); });

  // ================= transforms =================
  function commitTransform(list) {
    for (const b of list) { freeAna(b); b.stats = null; }
    updateExplode(); sceneChanged(false); refresh();
  }
  function pivotPoint(list) { const v = $('pivot').value; return v === 'o' ? [0, 0, 0] : v === 'p' && S.pivot3 ? S.pivot3.slice() : boxCenter(unionBox(list, false)); }
  // a snap point for the rotation centre: corner, centre of a round edge / sphere, point on a cylinder axis, centre of mass
  function pivotSnap(px, py) {
    const gp = geoAt(px, py);
    if (gp && gp.kind === 'point') return gp;
    const c = comAt(px, py);
    if (c) return { kind: 'point', p: c, at: c, text: L('Trọng tâm', 'Centre of mass') };
    const h = pickNear(px, py);
    if (!h) return null;
    const e = entityAt(h, px, py, false);
    if (e.kind === 'edge' && e.sub === 'arc' && e.c) return { kind: 'point', p: e.c, at: e.c, text: L('Tâm cung R', 'Arc centre R') + f2(e.r), lines: e.lines };
    if (e.kind === 'edge') { const q = e.pts, mid = q[Math.floor(q.length / 2)]; return { kind: 'point', p: e.sub === 'line' ? V.mul(V.add(q[0], q[q.length - 1]), 0.5) : mid, at: mid, text: L('Trung điểm cạnh', 'Edge midpoint'), lines: e.lines }; }
    if (e.kind === 'cyl') { const f = footLine(e.at, { p: e.c, d: e.dir }); return { kind: 'point', p: f, at: f, text: L('Trên trục mặt trụ', 'On the cylinder axis') }; }
    if (e.kind === 'sphere') return { kind: 'point', p: e.c, at: e.c, text: L('Tâm mặt cầu', 'Sphere centre') };
    if (e.kind === 'point' && !e.free) return { kind: 'point', p: e.p, at: e.p, text: e.text || L('Đỉnh', 'Corner') };
    if (e.blocked) return null;
    const v = snapPoint(h, px, py);
    return { kind: 'point', p: v, at: v, text: L('Điểm', 'Point') };
  }
  function applyTransform(makeA) {
    if (blocked()) return;
    const list = needSel();
    if (!list.length) return;
    const A = makeA(list);
    if (!A) return;
    pushUndo();
    for (const b of list) b.matrix = M.mul(A, b.matrix);
    commitTransform(list);
  }
  // ---------- mate: face onto face, axis onto axis ----------
  // what a click gives for mating: a plane {t:'plane', p, n} or an axis {t:'axis', p, d, ring}
  function mateEnt(h, px, py) {
    const e = h.geoEnt || entityAt(h, px, py, false);
    if (e.kind === 'point' && !e.free) return Object.assign({}, e, { mg: { t: 'point', p: e.p }, body: h.body, text: (e.text || L('Điểm', 'Point')) });
    if (e.kind === 'plane') return Object.assign({}, e, { mg: { t: 'plane', p: e.p, n: V.norm(e.n) }, body: h.body });
    if (e.kind === 'cyl') return Object.assign({}, e, { mg: { t: 'axis', p: e.c, d: V.norm(e.dir) }, body: h.body, text: L('Trục mặt trụ R', 'Cylinder axis R') + f2(e.r) });
    if (e.kind === 'edge' && e.sub === 'arc' && e.n) return Object.assign({}, e, { mg: { t: 'axis', p: e.c, d: V.norm(e.n), ring: true }, body: h.body, text: L('Trục cung R', 'Arc axis R') + f2(e.r) });
    if (e.kind === 'edge' && e.sub === 'line') return Object.assign({}, e, { mg: { t: 'axis', p: e.pts[0], d: V.norm(e.dir) }, body: h.body });
    return null;
  }
  function rotTo(a, b) {                                     // rotation taking direction a onto b
    const ax = V.cross(a, b), s = V.len(ax), c = V.dot(a, b);
    if (s < 1e-9) { if (c > 0) return M.ident(); const q = V.norm(V.cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); return M.rot(q, Math.PI); }
    return M.rot(V.mul(ax, 1 / s), Math.atan2(s, c));
  }
  function mateMatrix(a, b, flip, gap) {
    if (a.t === 'point' || b.t === 'point') {               // a point mate only slides the bodies (no turning)
      const foot = function (p, ax) { return V.add(ax.p, V.mul(ax.d, V.dot(V.sub(p, ax.p), ax.d))); };
      if (a.t === 'point' && b.t === 'point') return M.trans(V.sub(b.p, a.p));
      if (a.t === 'point' && b.t === 'plane') return M.trans(V.mul(b.n, V.dot(V.sub(b.p, a.p), b.n) + gap));
      if (a.t === 'point' && b.t === 'axis') return M.trans(V.sub(foot(a.p, b), a.p));
      if (a.t === 'plane') return M.trans(V.mul(a.n, V.dot(V.sub(b.p, a.p), a.n) - gap));
      return M.trans(V.sub(b.p, foot(b.p, a)));
    }
    if (a.t === 'plane') {
      const goal = flip ? b.n : V.mul(b.n, -1), R = M.about(a.p, rotTo(a.n, goal));
      return M.mul(M.trans(V.mul(b.n, V.dot(V.sub(b.p, a.p), b.n) + gap)), R);
    }
    let goal = V.dot(a.d, b.d) >= 0 ? b.d : V.mul(b.d, -1);
    if (flip) goal = V.mul(goal, -1);
    const R = M.about(a.p, rotTo(a.d, goal)), w = V.sub(b.p, a.p);
    const mv = a.ring && b.ring ? V.add(w, V.mul(goal, gap)) : V.sub(w, V.mul(goal, V.dot(w, goal)));   // two round edges: centre on centre
    return M.mul(M.trans(mv), R);
  }
  function mateApply(m) {
    const A = mateMatrix(m.a.mg, m.b.mg, m.flip, m.gap);
    const list = S.bodies.filter(function (b) { return m.ids.indexOf(b.id) >= 0; });   // by id: undo rebuilds the body objects
    pushUndo();
    for (const b of list) b.matrix = M.mul(A, b.matrix);
    commitTransform(list);
  }
  function mateClick(px, py) {
    if (blocked()) return;
    const g = S.mate && S.mate.a ? geoAt(px, py) : null, h = g ? { body: null, geoEnt: g } : pickNear(px, py), e = h ? mateEnt(h, px, py) : null;   // the first pick is on the body to move
    if (!e) { flash(L('Hãy bấm vào mặt phẳng, mặt trụ, cạnh tròn / thẳng hoặc điểm (theo bộ lọc)', 'Click a flat face, a cylinder, a round / straight edge or a point (as the filter allows)')); return; }
    const st = S.mate;
    if ((!st || !st.a) && !e.body) { flash(L('Đối tượng thứ nhất phải nằm trên body cần dời', 'The first pick must be on the body to move')); return; }
    if (!st || !st.a) {
      S.mate = { a: e }; S.tmp = [e.at];
      flash(L('Đã chọn ', 'Picked ') + (e.mg.t === 'plane' ? L('mặt', 'a face') : e.mg.t === 'point' ? L('điểm', 'a point') : L('trục', 'an axis')) + L(' trên "', ' on "') + e.body.name + L('". Giờ bấm đích (mặt / trục / điểm) trên body khác hoặc một geometry.', '". Now click the target (face / axis / point) on another body or a geometry.'), true);
      dirty = true; return;
    }
    if (e.body && e.body === st.a.body) { flash(L('Đích phải nằm trên body khác', 'The target must be on another body')); return; }
    if (e.mg.t !== st.a.mg.t && st.a.mg.t !== 'point' && e.mg.t !== 'point') { flash(L('Mặt ghép với mặt, trục với trục; điểm ghép được với điểm, mặt hoặc trục', 'Mate a face with a face, an axis with an axis; a point with a point, a face or an axis')); return; }
    const list = S.sel.has(st.a.body) ? selBodies().filter(function (b) { return b !== e.body; }) : [st.a.body];
    const m = { a: st.a, b: e, ids: list.map(function (b) { return b.id; }), flip: $('mtFlip').checked, gap: +$('mtOff').value || 0 };
    mateApply(m);
    S.mateLast = m; S.mate = null; S.tmp = [];
    flash(L('Đã ghép. Bấm "Đảo lần ghép vừa rồi" nếu cần lật lại; chọn cặp tiếp theo nếu muốn.', 'Mated. Press "Flip the last mate" to turn it round; pick the next pair if you like.'), true);
    dirty = true;
  }
  $('bMateFlip').addEventListener('click', function () {
    const m = S.mateLast;
    if (!m || blocked()) { flash(L('Chưa có lần ghép nào', 'Nothing has been mated yet')); return; }
    undo(); m.flip = !m.flip; mateApply(m);
  });
  $('bPivPick').addEventListener('click', function () {
    S.pivPick = !S.pivPick; this.classList.toggle('primary', S.pivPick);
    flash(S.pivPick ? L('Bấm điểm làm tâm xoay: đỉnh, tâm cung / lỗ tròn, trục mặt trụ, tâm mặt cầu, trọng tâm hoặc một điểm trên mesh', 'Click the rotation centre: a corner, the centre of an arc / round hole, a cylinder axis, a sphere centre, a centre of mass or a point on the mesh') : '', true);
    dirty = true;
  });
  $('pivot').addEventListener('change', function () { if (this.value === 'p' && !S.pivot3) $('bPivPick').click(); dirty = true; });
  // scaling along the handle frame axes
  function gaxScale(sv) { const B = gaxM(); return M.mul(B, M.mul(M.scale(sv), M.inv(B))); }
  $('bMove').addEventListener('click', function () { applyTransform(function () { return M.trans(V.add(V.add(V.mul(GX(0), +$('mvX').value || 0), V.mul(GX(1), +$('mvY').value || 0)), V.mul(GX(2), +$('mvZ').value || 0))); }); });
  $('bRot').addEventListener('click', function () {
    applyTransform(function (list) { return M.about(pivotPoint(list), M.rot(GX(+$('rotAx').value), (+$('rotA').value || 0) * Math.PI / 180)); });
  });
  $('bScale').addEventListener('click', function () {
    applyTransform(function (list) {
      const x = +$('scX').value, y = $('scUni').checked ? x : +$('scY').value, z = $('scUni').checked ? x : +$('scZ').value;
      if (!x || !y || !z) { flash(L('Hệ số tỉ lệ phải khác 0', 'Scale factors must not be 0')); return null; }
      return M.about(pivotPoint(list), gaxScale([x, y, z]));
    });
  });
  $('scUni').addEventListener('change', function () { $('scY').disabled = $('scZ').disabled = this.checked; });
  $('pivot').addEventListener('change', function () { dirty = true; });   // the rotate / scale handle sits on the chosen centre
  [['tpMove', 'bMove'], ['tpRot', 'bRot'], ['tpScale', 'bScale']].forEach(function (g) {
    $(g[0]).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $(g[1]).click(); } });
  });
  $('scY').disabled = $('scZ').disabled = true;
  function homeSelected() {
    if (blocked()) return;
    const list = needSel();
    if (!list.length) return;
    pushUndo();
    for (const b of list) b.matrix = b.matrix0.slice();
    commitTransform(list);
    flash(L('Đã đưa ' + list.length + ' body về vị trí lúc import', list.length + ' bodies put back to their import position'));
  }
  $('bHome').addEventListener('click', homeSelected);

  function hitGizmo(px, py) {
    const g = S.giz;
    if (!g) return null;
    if (S.tool === 'rotate') {                              // the curved arrows; remember where along the arrow it was grabbed
      let hit = null, hd = 10;
      for (let i = 0; i < 3; i++) {
        const q = g.arcs[i];
        for (let k = 0; k + 1 < q.length; k++) {
          const ax = q[k + 1][0] - q[k][0], ay = q[k + 1][1] - q[k][1], l2 = ax * ax + ay * ay;
          const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - q[k][0]) * ax + (py - q[k][1]) * ay) / l2)) : 0;
          const d = Math.hypot(px - q[k][0] - t * ax, py - q[k][1] - t * ay);
          if (d < hd) { hd = d; hit = i; g.hitAng = GIZ_ARC.a0 + (GIZ_ARC.a1 - GIZ_ARC.a0) * (k + t) / GIZ_ARC.n; }
        }
      }
      return hit;
    }
    if (Math.hypot(px - g.p[0], py - g.p[1]) < 9) return -1;
    let best = null, bd = 1e9;
    for (let i = 0; i < 3; i++) {
      const e = g.ends[i], ax = e[0] - g.p[0], ay = e[1] - g.p[1], l2 = ax * ax + ay * ay;
      let d = Math.hypot(px - e[0], py - e[1]) - 5;
      if (l2 > 1) { const t = Math.max(0, Math.min(1, ((px - g.p[0]) * ax + (py - g.p[1]) * ay) / l2)); d = Math.min(d, Math.hypot(px - g.p[0] - t * ax, py - g.p[1] - t * ay)); }
      if (d < 6 && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // angle of the cursor around axis i, measured in the plane through the gizmo centre
  function planeAngle(dr, px, py) {
    const i = dr.axis, j = (i + 1) % 3, k = (i + 2) % 3, ray = screenRay(px, py), n = GX(i);
    const t = V.dot(V.sub(dr.pv3, ray.o), n) / V.dot(ray.d, n), q = V.sub(V.add(ray.o, V.mul(ray.d, t)), dr.pv3);
    return Math.atan2(V.dot(q, GX(k)), V.dot(q, GX(j)));
  }
  function rotStart(dr, px, py) {
    const i = dr.axis, w = viewer();
    dr.ang = 0; dr.acc = 0;
    if (Math.abs(V.dot(w, GX(i))) >= 0.3) { dr.mode = 'plane'; dr.th0 = dr.last = planeAngle(dr, px, py); return; }
    // the dial is seen (almost) edge-on: turn by sliding the cursor the way the grabbed point of the dial would travel
    dr.mode = 'slide'; dr.th0 = S.giz.hitAng;
    const rv = V.sub(ringPt([0, 0, 0], i, 1, dr.th0), [0, 0, 0]), vel = V.cross(GX(i), rv), r = right(), u = up();
    let sx = V.dot(vel, r), sy = -V.dot(vel, u), sl = Math.hypot(sx, sy);
    if (sl < 0.3) { const f = V.cross(GX(i), w), sg = V.dot(rv, w) >= 0 ? 1 : -1; sx = sg * V.dot(f, r); sy = -sg * V.dot(f, u); sl = Math.hypot(sx, sy) || 1; }
    dr.sdir = [sx / sl, sy / sl]; dr.spx = dr.Lw * GIZ_ARC.r * H / (2 * cam.zoom) * Math.max(sl, 0.5);
  }
  function gizmoDrag(dr, px, py, shift) {
    const dx = px - dr.x0, dy = py - dr.y0, i = dr.axis, a2 = dr.a2, al = Math.hypot(a2[0], a2[1]);
    let A, txt;
    if (!dr.moved) { pushUndo(); dr.moved = true; }
    if (S.tool === 'move') {
      let d;
      if (i < 0) {
        const k = 2 * cam.zoom / H; d = V.add(V.mul(right(), dx * k), V.mul(up(), -dy * k));
        if (shift) d = d.map(Math.round);
        txt = 'Δ = ' + f2(d[0]) + ', ' + f2(d[1]) + ', ' + f2(d[2]) + ' mm';
      } else {
        let s = al < 6 ? 0 : (dx * a2[0] + dy * a2[1]) / al * dr.Lw / al;
        if (shift) s = Math.round(s);
        d = V.mul(GX(i), s); txt = 'Δ' + AXN[i] + ' = ' + f2(s) + ' mm';
      }
      $('mvX').value = +f2(V.dot(d, GX(0)), 3); $('mvY').value = +f2(V.dot(d, GX(1)), 3); $('mvZ').value = +f2(V.dot(d, GX(2)), 3);   // in the handle frame
      A = M.trans(d);
    } else if (S.tool === 'rotate') {
      let ang;
      if (dr.mode === 'plane') {
        const th = planeAngle(dr, px, py);
        let d = th - dr.last;
        if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;   // keep counting across the +-180 seam
        dr.acc += d; dr.last = th; ang = dr.acc * 180 / Math.PI;
      } else ang = (dx * dr.sdir[0] + dy * dr.sdir[1]) / dr.spx * 180 / Math.PI;
      if (shift) ang = Math.round(ang);
      dr.ang = ang;
      $('rotAx').value = i; $('rotA').value = +f2(ang, 2);
      A = M.about(dr.pivot, M.rot(GX(i), ang * Math.PI / 180)); txt = L('Xoay quanh ', 'Rotate about ') + AXN[i] + ' = ' + f2(ang, 1) + '°';
    } else {
      const s = i < 0 ? dx - dy : (al < 6 ? dx : (dx * a2[0] + dy * a2[1]) / al);
      let f = Math.exp(s * 0.006);
      if (shift) f = f >= 1 ? Math.max(1, Math.round(f)) : 1 / Math.max(1, Math.round(1 / f));
      $('scUni').checked = i < 0; $('scY').disabled = $('scZ').disabled = i < 0;
      $('scX').value = +f2(i < 0 || i === 0 ? f : 1, 4); $('scY').value = +f2(i < 0 || i === 1 ? f : 1, 4); $('scZ').value = +f2(i < 0 || i === 2 ? f : 1, 4);
      const sv = i < 0 ? [f, f, f] : [i === 0 ? f : 1, i === 1 ? f : 1, i === 2 ? f : 1];
      A = M.about(dr.pivot, gaxScale(sv)); txt = L('Tỉ lệ ', 'Scale ') + (i < 0 ? L('đồng đều', 'uniform') : AXN[i]) + ' = ' + f2(f, 3);
    }
    dr.start.forEach(function (m0, b) { b.matrix = M.mul(A, m0); });
    flash(txt, true); dirty = true;
  }

  // ================= pointer / keyboard navigation (Onshape style) =================
  let drag = null;
  function evPos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function camAt(px) { return S.cmp && S.cmp.split ? S.cmp.cams[px < W / 2 ? 0 : 1] : mainCam; }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    const p = evPos(e);
    closeMenu();
    canvas.setPointerCapture(e.pointerId);
    cam = camAt(p[0]);
    if (e.button === 2) {
      drag = { type: e.ctrlKey ? 'pan' : 'rot', x: p[0], y: p[1], x0: p[0], y0: p[1], cam: cam, pivot: null };
      if (drag.type === 'rot') {                              // like Onshape: the view turns about the point that was pressed
        const h = pick(p[0], p[1], S.cmp && S.cmp.split ? [p[0] < W / 2 ? S.cmp.a : S.cmp.b] : null);
        if (h) drag.pivot = h.point;
      }
    }
    else if (e.button === 1) drag = { type: 'pan', x: p[0], y: p[1], x0: p[0], y0: p[1], cam: cam };
    else if (e.button === 0 && !S.sk && labAt(p[0], p[1])) {      // a measurement callout: pick it and drag it, whatever the tool or filter
      const lh = labAt(p[0], p[1]), m = S.measures[lh.i];
      S.measSel = lh.i; S.measFocus = true; updateMeasList();
      drag = { type: 'lab', i: lh.i, x0: p[0], y0: p[1], lo0: (m.lo || [26, -34]).slice(), cam: cam, moved: false };
      canvas.style.cursor = 'grabbing'; dirty = true;
    }
    else if (e.button === 0) {
      const h = gizmoActive() ? hitGizmo(p[0], p[1]) : null;
      if (h !== null) {
        const list = selBodies(), start = new Map();
        for (const b of list) start.set(b, b.matrix.slice());
        drag = { type: 'giz', axis: h, x0: p[0], y0: p[1], start: start, list: list, p: S.giz.p, Lw: S.giz.Lw, pv3: S.giz.pv, cam: cam,
          a2: h < 0 ? [1, 0] : [S.giz.ends[h][0] - S.giz.p[0], S.giz.ends[h][1] - S.giz.p[1]],
          pivot: S.tool === 'move' ? [0, 0, 0] : pivotPoint(list), moved: false };
        if (S.tool === 'rotate') rotStart(drag, p[0], p[1]);
        canvas.style.cursor = 'grabbing';
      } else drag = { type: 'click', x0: p[0], y0: p[1], cam: cam };
      if (S.sk) { drag = skDown(p[0], p[1]) || { type: 'click', x0: p[0], y0: p[1] }; drag.cam = cam; }
    }
    cam = mainCam;
  });
  function toolCursor() { const t = S.tool; return (t === 'select' || t === 'move' || t === 'rotate' || t === 'scale') && !S.axPick && !S.pivPick ? 'default' : 'crosshair'; }
  // nothing pressed: light up the gizmo handle or the centre-of-mass mark under the cursor
  function hover(px, py) {
    cam = camAt(px);
    if (S.sk) { skHover(px, py); cam = mainCam; return; }
    if (S.tool === 'skplane') { S.skHov = skPlaneEnt(px, py); cam = mainCam; canvas.style.cursor = 'crosshair'; dirty = true; return; }
    const lh = labAt(px, py);
    if (lh || S.hovLab) {
      if (!lh || !S.hovLab || lh.i !== S.hovLab.i || lh.row !== S.hovLab.row) { S.hovLab = lh; dirty = true; }
      if (lh) { if (S.hovEnt) { S.hovEnt = null; } canvas.style.cursor = 'move'; cam = mainCam; return; }
    }
    if (S.od && modelHover(px, py)) { cam = mainCam; canvas.style.cursor = 'crosshair'; return; }
    const h = gizmoActive() && S.giz ? hitGizmo(px, py) : null;
    const t = S.tool, meas = t === 'dist' || t === 'angle' || t === 'radius', c = meas ? comAt(px, py) : null;
    let ent = null;
    if (S.ucPick) ent = ucPickEnt(px, py);
    else if (S.axPick) ent = axPickEnt(px, py);
    else if (t === 'gpoint' || t === 'gline' || t === 'gplane' || t === 'gaxis') ent = geoToolEnt(t, px, py);
    else if (S.pivPick) ent = pivotSnap(px, py);
    else if (t === 'mate') { const g = S.mate && S.mate.a ? geoAt(px, py) : null, hit = g ? { body: null, geoEnt: g } : pickNear(px, py); if (hit) { ent = mateEnt(hit, px, py); } }
    else if (meas && !c) { const g = geoAt(px, py); if (g) ent = g; else { const hit = pickNear(px, py); if (hit) { ent = entityAt(hit, px, py, false); if (ent.free) ent = null; } } }
    cam = mainCam;
    if (h !== S.hov || c !== S.hovCom || ent || S.hovEnt) { S.hov = h; S.hovCom = c; S.hovEnt = ent; dirty = true; }
    canvas.style.cursor = h !== null ? 'grab' : toolCursor();
  }
  canvas.addEventListener('pointerleave', function () { if (!drag && (S.hov !== null || S.hovCom || S.hovEnt || S.hovLab)) { S.hov = null; S.hovCom = null; S.hovEnt = null; S.hovLab = null; S.skHov = null; dirty = true; } });
  canvas.addEventListener('pointermove', function (e) {
    const p = evPos(e);
    if (!drag) { hover(p[0], p[1]); return; }
    cam = drag.cam;
    if (drag.type === 'rot') {
      const ax = (p[0] - drag.x) * 0.008, ay = (p[1] - drag.y) * 0.008;
      if (drag.pivot) { rotateViewAbout(ax, ay, drag.pivot); if (!(S.cmp && S.cmp.split)) S.viewPivot = drag.pivot; } else rotateView(ax, ay);
      drag.x = p[0]; drag.y = p[1];
    }
    else if (drag.type === 'pan') {
      const k = 2 * cam.zoom / H;
      cam.target = V.add(cam.target, V.add(V.mul(right(), -(p[0] - drag.x) * k), V.mul(up(), (p[1] - drag.y) * k)));
      drag.x = p[0]; drag.y = p[1]; dirty = true;
    } else if (drag.type === 'giz') gizmoDrag(drag, p[0], p[1], e.shiftKey);
    else if (drag.type === 'sk') skDragMove(drag, p[0], p[1]);
    else if (drag.type === 'lab') { const m = S.measures[drag.i]; if (m) { if (!drag.moved && Math.hypot(p[0] - drag.x0, p[1] - drag.y0) >= 3) { drag.moved = true; if (!S.cmp) pushUndo(); } if (drag.moved) { m.lo = [drag.lo0[0] + p[0] - drag.x0, drag.lo0[1] + p[1] - drag.y0]; dirty = true; } } }
    else if (drag.type === 'click' && !S.sk && S.tool !== 'skplane' && boxAllowed() && Math.hypot(p[0] - drag.x0, p[1] - drag.y0) >= 4) drag.type = 'box';
    if (drag.type === 'box') { S.box = { x0: drag.x0, y0: drag.y0, x1: p[0], y1: p[1] }; dirty = true; }
    syncCams(cam);
    cam = mainCam;
  });
  canvas.addEventListener('pointerup', function (e) {
    const d = drag; drag = null;
    if (!d) return;
    const p = evPos(e), still = Math.hypot(p[0] - d.x0, p[1] - d.y0) < 4;
    cam = d.cam;
    if (S.viewPivot) { S.viewPivot = null; dirty = true; }
    if (d.type === 'sk') { skDragEnd(d); cam = mainCam; hover(p[0], p[1]); return; }
    if (d.type === 'lab') { cam = mainCam; updateMeasPanel(); hover(p[0], p[1]); return; }
    if (d.type === 'giz') { if (d.moved) { commitTransform(d.list); flash(toolHint(S.tool), true); } dirty = true; }
    else if (d.type === 'box') { S.box = null; cam = mainCam; if (!(S.flt.body && boxSelect(d.x0, d.y0, p[0], p[1], true)) && !geoBoxSelect(d.x0, d.y0, p[0], p[1])) { dirty = true; if (!S.flt.body) flash(L('Bộ lọc đang tắt Body', 'The filter is off for bodies')); } }
    else if (d.type === 'click' && still) onClick(p[0], p[1], e);
    else if (d.type === 'rot' && still && e.button === 2 && !(S.cmp && S.cmp.split)) {
      const h = pick(p[0], p[1]), gg = h ? null : geoAt(p[0], p[1]);
      if (gg && gg.geo && !gg.geo.origin && !S.sk && !busy) geoMenu(gg.geo, e.clientX, e.clientY); else openMenu(e.clientX, e.clientY, h ? h.body : null);
    }
    cam = mainCam;
    hover(p[0], p[1]);
  });
  canvas.addEventListener('pointercancel', function () { drag = null; S.box = null; S.viewPivot = null; cam = mainCam; dirty = true; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    const p = evPos(e), dir = $('cZoomInv').checked ? -1 : 1;
    cam = camAt(p[0]);
    const nz = Math.max(1e-9, cam.zoom * Math.exp(dir * e.deltaY * 0.0012));
    const cx = 2 * (p[0] - cam.x) / cam.w - 1, cy = 1 - 2 * p[1] / H, dz = cam.zoom - nz;
    cam.target = V.add(cam.target, V.add(V.mul(right(), cx * cam.w / H * dz), V.mul(up(), cy * dz)));
    cam.zoom = nz; syncCams(cam); cam = mainCam; dirty = true;
  }, { passive: false });

  function syncCams(from) {
    const c = S.cmp;
    if (!c || !c.split || !c.sync || (from !== c.cams[0] && from !== c.cams[1])) return;
    const o = c.cams[from === c.cams[0] ? 1 : 0];
    o.R = from.R.slice(); o.target = from.target.slice(); o.zoom = from.zoom;
  }
  function boxAllowed() { return !S.cmp && (S.tool === 'select' || S.tool === 'move' || S.tool === 'rotate' || S.tool === 'scale'); }
  function segRect(ax, ay, bx, by, l, t, r, b) { // does the segment cross the rectangle? (Liang-Barsky)
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay, p = [-dx, dx, -dy, dy], q = [ax - l, r - ax, ay - t, b - ay];
    for (let k = 0; k < 4; k++) {
      if (p[k] === 0) { if (q[k] < 0) return false; continue; }
      const u = q[k] / p[k];
      if (p[k] < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; }
    }
    return true;
  }
  // Left-to-right: only bodies entirely inside the box. Right-to-left: every body the box touches.
  function boxSelect(x0, y0, x1, y1, add) {
    const cross = x1 < x0, l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
    const k = H / (2 * cam.zoom), R = cam.R, hit = [];
    for (const body of S.bodies) {
      if (!body.visible) continue;
      const m = dispMatrix(body), P = body.geo.positions, nv = P.length / 3;
      const tr = [m[12] - cam.target[0], m[13] - cam.target[1], m[14] - cam.target[2]];
      const ax = [], ay = [];
      for (let c = 0; c < 3; c++) { ax.push(k * (R[0] * m[4 * c] + R[1] * m[4 * c + 1] + R[2] * m[4 * c + 2])); ay.push(-k * (R[3] * m[4 * c] + R[4] * m[4 * c + 1] + R[5] * m[4 * c + 2])); }
      const bx = cam.x + cam.w / 2 + k * (R[0] * tr[0] + R[1] * tr[1] + R[2] * tr[2]), by = H / 2 - k * (R[3] * tr[0] + R[4] * tr[1] + R[5] * tr[2]);
      const sx = new Float32Array(nv), sy = new Float32Array(nv);
      let inside = 0, mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
      for (let i = 0; i < nv; i++) {
        const x = ax[0] * P[3 * i] + ax[1] * P[3 * i + 1] + ax[2] * P[3 * i + 2] + bx, y = ay[0] * P[3 * i] + ay[1] * P[3 * i + 1] + ay[2] * P[3 * i + 2] + by;
        sx[i] = x; sy[i] = y;
        if (x >= l && x <= r && y >= t && y <= b) inside++;
        if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
      }
      if (!cross) { if (nv && inside === nv) hit.push(body); continue; }
      let sel = inside > 0;
      if (!sel && !(mxx < l || mnx > r || mxy < t || mny > b)) {
        const I = body.geo.indices;
        for (let e = 0; e < I.length && !sel; e += 3) {
          const a = I[e], c = I[e + 1], d = I[e + 2];
          sel = segRect(sx[a], sy[a], sx[c], sy[c], l, t, r, b) || segRect(sx[c], sy[c], sx[d], sy[d], l, t, r, b) || segRect(sx[d], sy[d], sx[a], sy[a], l, t, r, b);
        }
        if (!sel) sel = !!pick((l + r) / 2, (t + b) / 2, [body]); // the box lies inside one triangle
      }
      if (sel) hit.push(body);
    }
    if (!hit.length) return 0;                               // nothing: the box may take geometry instead
    if (add) { for (const h of hit) S.sel.add(h); refresh(); } else select(hit, false);
    return hit.length;
  }
  // a box with no body in it takes the geometry it holds (left-to-right: wholly inside; right-to-left: touched)
  function geoBoxSelect(x0, y0, x1, y1) {
    const cross = x1 < x0, l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1), got = [];
    const inR = function (q) { return q[0] >= l && q[0] <= r && q[1] >= t && q[1] <= b; };
    for (const g of S.geos) {
      if (g.vis === false) continue;
      const pts = (g.type === 'point' ? [g.p] : g.type === 'plane' ? planeCorners(g) : [g.p, g.p2]).map(project);
      let ok = cross ? pts.some(inR) : pts.every(inR);
      if (!ok && cross && pts.length > 1) for (let i = 0; i < pts.length && !ok; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; ok = segRect(a[0], a[1], c[0], c[1], l, t, r, b); }
      if (ok) got.push(g.id);
    }
    if (!got.length) return 0;
    for (const id of got) S.geoSet.add(id);
    S.geoSel = got[got.length - 1]; S.skSel = null; updateSketchList(); dirty = true;
    flash(L('Đã chọn ', 'Selected ') + got.length + L(' geometry: Delete để xóa, Y để ẩn', ' geometry: Delete removes, Y hides'), false);
    return got.length;
  }
  function onClick(px, py, e) {
    if (S.measFocus) { S.measFocus = false; dirty = true; }
    if (S.sk) { skClick(px, py, e); return; }
    if (S.tool === 'skplane') { skPickPlane(px, py); return; }
    if (S.ucPick) { ucPickClick(px, py); return; }
    if (modelClick(px, py, e)) return;
    if (S.cmp && S.cmp.split) {
      const i = px < W / 2 ? 0 : 1, h = pickNear(px, py, [i ? S.cmp.b : S.cmp.a]);
      if (!h) { flash(L('Không trúng mesh', 'No mesh under the cursor')); return; }
      (i ? S.cmp.pb : S.cmp.pa).push(snapPoint(h, px, py));
      updateCmpUI(); dirty = true;
      return;
    }
    const t = S.tool;
    if (S.axPick) { axPickClick(px, py); return; }
    if (t === 'gpoint' || t === 'gline' || t === 'gplane' || t === 'gaxis') { geoToolClick(t, px, py, e); return; }
    if (S.pivPick) {
      const sp = pivotSnap(px, py);
      if (!sp) { flash(L('Bấm vào mesh để lấy tâm xoay', 'Click on a mesh for the rotation centre')); return; }
      S.pivot3 = sp.p.slice(); S.pivPick = false; $('pivot').value = 'p'; $('bPivPick').classList.remove('primary');
      flash(L('Tâm xoay: ', 'Rotation centre: ') + sp.text + ' (' + sp.p.map(function (v) { return f2(v); }).join(', ') + ')', false); dirty = true; return;
    }
    if (t === 'mate') { mateClick(px, py); return; }
    if (t === 'dist' || t === 'angle' || t === 'radius' || t === 'thick' || t === 'secpick') {
      const cm = t === 'dist' || t === 'angle' || t === 'radius' ? comAt(px, py) : null;
      if (cm) { measurePick(t, { kind: 'point', p: cm, at: cm, text: L('Trọng tâm', 'Centre of mass') }); return; }   // a centre-of-mass mark is a point like any other
      const gh = t === 'dist' || t === 'angle' ? geoAt(px, py) : null;
      if (gh) { gh.bname = ''; measurePick(t, gh); return; }
      const h = pickNear(px, py);
      if (!h) {                                              // a click on empty space drops what is waiting to be measured
        if (S.tmp.length) { S.tmp = []; S.lenFirst = undefined; updateMeasPanel(); dirty = true; flash(L('Đã bỏ các đối tượng đang chọn để đo', 'Cleared the picked entities')); }
        else flash(L('Không trúng mesh nào', 'No mesh under the cursor'));
        return;
      }
      if (t === 'thick') { measureThickness(h); return; }
      if (t === 'secpick') {
        const sc = S.sec;
        sc.nPick = h.normal; sc.axis = 'pick'; $('secAx').value = 'pick'; sc.on = true; $('secOn').checked = true;
        updateSection();
        sc.s = Math.max(0, Math.min(1, (V.dot(h.normal, h.point) - sc.min) / (sc.max - sc.min)));
        $('secPos').value = Math.round(sc.s * 1000);
        updateSection(); setTool('select'); return;
      }
      const en = entityAt(h, px, py, e.altKey);
      if (en.blocked && !e.altKey) { flash(L('Không có gì hợp bộ lọc ở chỗ này (xem thanh Lọc)', 'Nothing here matches the filter (see the Filter bar)')); return; }
      en.bname = h.body.name; measurePick(t, en);
      return;
    }
    if (S.cmp) return;
    // every click adds a body to the ticked set (or takes it out again); a click on empty space clears the set
    const h = pick(px, py);
    if (h && S.flt.body) { select([h.body], true); return; }
    const gg = geoAt(px, py);                                // geometry comes last: only where no body is taken
    if (gg && gg.geo && !gg.geo.origin) {
      const id = gg.geo.id;
      if (S.geoSet.has(id) || S.geoSel === id) { S.geoSet.delete(id); if (S.geoSel === id) S.geoSel = null; } else { S.geoSet.add(id); S.geoSel = id; S.skSel = null; }
      updateSketchList(); dirty = true;
      flash(gg.geo.name + L(': Delete để xóa, Y để ẩn, chuột phải để xem thêm', ': Delete removes, Y hides, right-click for more'), false); return;
    }
    if (h) { flash(L('Bộ lọc đang tắt Body: bật nút "Body" ở thanh Lọc để chọn body', 'The filter is off for bodies: turn on "Body" in the Filter bar to pick bodies')); return; }
    select([], false);
  }

  window.addEventListener('keydown', function (e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') closeMenu();
    if (modelKey(e)) return;
    // Space unticks everything, unless a text is being typed
    const typing = tag === 'textarea' || tag === 'select' || (tag === 'input' && ['checkbox', 'radio', 'range', 'color', 'button', 'file'].indexOf(e.target.type) < 0);
    if (e.code === 'Space' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (e.target.blur && (tag === 'button' || tag === 'input')) e.target.blur();
      if (!S.cmp && !busy) select([], false);
      return;
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { setTool('select'); flash(''); }
    else if (e.key === 'Delete') { if (S.measFocus && S.measures[S.measSel]) deleteMeasure(S.measSel); else if (!S.sel.size && geoSelList().length) deleteGeos(geoSelList().map(function (g) { return g.id; })); else deleteSelected(); }
    else if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); }
    else if (ctrl && e.code === 'KeyC') { copySel(); if (S.clip.length) flash(L('Đã chép ' + S.clip.length + ' body', S.clip.length + ' bodies copied')); }
    else if (ctrl && e.code === 'KeyV') { e.preventDefault(); paste(); }
    else if (ctrl && e.code === 'KeyA') { e.preventDefault(); if (!blocked()) select(visibleBodies(), false); }
    else if (ctrl) return;
    else if (e.code === 'KeyF') sceneChanged(true);
    else if (e.shiftKey && /^Digit[1-7]$/.test(e.code)) setView(['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'][+e.code.slice(5) - 1]);
    else if (e.code === 'ArrowLeft') rotateView(-0.2618, 0);
    else if (e.code === 'ArrowRight') rotateView(0.2618, 0);
    else if (e.code === 'ArrowUp') rotateView(0, -0.2618);
    else if (e.code === 'ArrowDown') rotateView(0, 0.2618);
    else return;
    if (e.code.indexOf('Arrow') === 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {            // a focused button must not fire on the Space that unticked
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.code === 'Space' && (tag === 'button' || (tag === 'input' && ['checkbox', 'radio', 'range', 'color', 'button', 'file'].indexOf(e.target.type) >= 0))) e.preventDefault();
  });
  document.querySelectorAll('[data-tool]').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  // ---------- selection filter: what a click or a snap may take ----------
  const FLT_KEYS = ['body', 'point', 'center', 'line', 'circle', 'axis', 'plane', 'face'];
  S.flt = {}; FLT_KEYS.forEach(function (k) { S.flt[k] = true; });
  try { const sv = JSON.parse(localStorage.getItem('mrt_flt') || 'null'); if (sv) FLT_KEYS.forEach(function (k) { if (typeof sv[k] === 'boolean') S.flt[k] = sv[k]; }); } catch (e) { /* no storage */ }
  function showFlt() {
    document.querySelectorAll('[data-flt]').forEach(function (b) { b.classList.toggle('on', !!S.flt[b.dataset.flt]); });
    try { localStorage.setItem('mrt_flt', JSON.stringify(S.flt)); } catch (e) { /* no storage */ }
    S.hovEnt = null; dirty = true;
  }
  let fltTimer = 0;
  document.querySelectorAll('[data-flt]').forEach(function (b) {
    b.addEventListener('click', function () { clearTimeout(fltTimer); const k = b.dataset.flt; fltTimer = setTimeout(function () { S.flt[k] = !S.flt[k]; showFlt(); }, 220); });
    b.addEventListener('dblclick', function () {                 // only this kind; double-click again: all kinds
      clearTimeout(fltTimer); const k = b.dataset.flt, solo = FLT_KEYS.every(function (q) { return S.flt[q] === (q === k); });
      FLT_KEYS.forEach(function (q) { S.flt[q] = solo ? true : q === k; }); showFlt();
    });
  });
  showFlt();
  document.querySelectorAll('#cubeWrap [data-va]').forEach(function (d) {
    d.addEventListener('click', function () {
      const a = 15 * Math.PI / 180, k = d.dataset.va;
      if (k === 'u') rotateView(0, -a); else if (k === 'd') rotateView(0, a); else if (k === 'l') rotateView(-a, 0); else if (k === 'r') rotateView(a, 0);
      else if (k === 'cl') rollView(-Math.PI / 2); else if (k === 'cr') rollView(Math.PI / 2); else setView('iso');
    });
  });
  document.querySelectorAll('#cube div').forEach(function (d) { d.addEventListener('click', function () { setView(d.dataset.v); }); });
  $('bFit').addEventListener('click', function () { sceneChanged(true); });
  $('bIso').addEventListener('click', function () { setView('iso'); });
  ['cWire', 'cAxes', 'cHoles'].forEach(function (id) { $(id).addEventListener('change', function () { dirty = true; }); });
  $('cInfo').addEventListener('change', updateInfo);
  window.addEventListener('resize', function () { dirty = true; });

  // ================= context menu =================
  function closeMenu() { $('ctx').style.display = 'none'; }
  function openMenu(x, y, body) {
    if (S.cmp || busy || S.sk) return;
    if (body && !S.sel.has(body)) select([body], false);
    const n = S.sel.size, items = [];
    if (body) {
      items.push([L('Zoom vào body tick', 'Zoom to ticked'), function () { fitTo(selBodies().filter(function (b) { return b.visible; })); }],
        [L('Ẩn', 'Hide'), function () { $('bHideSel').click(); }], [L('Chỉ hiện body tick', 'Show only ticked'), function () { $('bIsolate').click(); }], null,
        [L('Di chuyển', 'Move'), function () { setTool('move'); }], [L('Xoay', 'Rotate'), function () { setTool('rotate'); }], [L('Tỉ lệ', 'Scale'), function () { setTool('scale'); }],
        [L('Về vị trí lúc import', 'Back to import position'), homeSelected], null,
        [L('Nhân bản', 'Duplicate'), function () { $('bDup').click(); }]);
      if (n === 1) items.push([L('Đổi tên', 'Rename'), function () { renameBody(body); }]);
      items.push([L('Xóa', 'Delete'), deleteSelected], null,
        ['Decimate…', function () { $('bApply').scrollIntoView({ block: 'center' }); flash(L('Đặt tham số Decimate ở khung bên trái rồi bấm Apply', 'Set the Decimate options on the left, then press Apply')); }],
        [L('Tách body', 'Split'), function () { openPop('split', true); $('bSplit').click(); }],
        ...(body.solid ? [[L('Sửa khối solid…', 'Edit solid…'), function () { editSolid(body); }], [L('Chuyển solid → mesh', 'Convert solid → mesh'), function () { solidToMesh(body); }]] : []),
        ...(body.solid && body.solid.feats && body.solid.feats.length ? [[L('Bỏ lệnh cuối của khối: ', 'Undo the last solid edit: ') + body.solid.feats[body.solid.feats.length - 1].type, function () { dropLastFeat(body); }]] : []),
        [L('Fillet cạnh…', 'Fillet edges…'), function () { openDlg('fillet'); }], [L('Shell…', 'Shell…'), function () { openDlg('shell'); }], [L('Boolean…', 'Boolean…'), function () { openDlg('boolean'); }],
        [L('Tách: phương án kế ▶', 'Split: next option ▶'), function () { openPop('split', true); $('bSplitNext').click(); }],
        [L('Gộp body tick', 'Merge ticked bodies'), joinSelected],
        [L('Phân tích undercut', 'Undercut analysis'), function () { openPop('undercut', true); $('bUc').click(); }]);
      if (n >= 2) items.push([L('Kiểm tra va chạm', 'Collision check'), function () { openPop('collide', true); $('bCol').click(); }]);
      if (n === 2) items.push([L('So sánh 2 mesh', 'Compare the 2 meshes'), startCompare]);
      items.push(null, [L('Tải STL', 'Download STL'), function () { $('bStl').click(); }]);
    } else {
      items.push([L('Hiện tất cả', 'Show all'), function () { $('bShowAll').click(); }], [L('Chọn tất cả', 'Tick all'), function () { $('bSelAll').click(); }],
        [L('Bỏ chọn tất cả', 'Untick all'), function () { $('bSelNone').click(); }], null, ['Fit', function () { sceneChanged(true); }], ['Iso', function () { setView('iso'); }]);
    }
    const m = $('ctx');
    m.innerHTML = '';
    for (const it of items) {
      if (!it) { m.appendChild(document.createElement('hr')); continue; }
      const d = document.createElement('div'); d.textContent = it[0];
      d.addEventListener('click', function () { closeMenu(); it[1](); });
      m.appendChild(d);
    }
    m.style.display = 'block';
    m.style.left = Math.max(0, Math.min(x, window.innerWidth - m.offsetWidth - 6)) + 'px';
    m.style.top = Math.max(0, Math.min(y, window.innerHeight - m.offsetHeight - 6)) + 'px';
  }
  window.addEventListener('pointerdown', function (e) { if (!$('ctx').contains(e.target)) closeMenu(); }, true);
  $('ctx').addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ================= body actions =================
  function deleteSelected() {
    if (blocked()) return;
    const list = needSel();
    if (!list.length) return;
    pushUndo();
    for (const b of list) removeBody(b);
    updateExplode(); sceneChanged(false); refresh();
  }
  function copySel() {
    S.clip = selBodies().map(function (b) { return { name: b.name, geo: b.geo, orig: b.orig, matrix: b.matrix.slice(), opacity: b.opacity, material: b.material, density: b.density }; });
  }
  function paste() {
    if (blocked()) return;
    if (!S.clip.length) { flash(L('Chưa chép body nào (Ctrl+C)', 'Nothing copied yet (Ctrl+C)')); return; }
    pushUndo();
    const off = mainCam.radius * 0.15, made = [];
    for (const c of S.clip) made.push(addBody(c.name + '_copy', c.geo, { orig: c.orig, matrix: M.mul(M.trans([off, 0, 0]), c.matrix), opacity: c.opacity, material: c.material, density: c.density }));
    S.sel.clear(); for (const b of made) S.sel.add(b);
    updateExplode(); sceneChanged(false); refresh(); setTool('move');
    flash(L('Đã dán ' + made.length + ' body, kéo tay nắm để đặt vị trí', made.length + ' bodies pasted, drag a handle to place them'), true);
  }
  $('bDel').addEventListener('click', deleteSelected);
  $('bDup').addEventListener('click', function () { if (blocked() || !needSel().length) return; copySel(); paste(); });
  $('bSelAll').addEventListener('click', function () { if (!blocked()) select(S.bodies, false); });
  $('bSelNone').addEventListener('click', function () { if (!blocked()) select([], false); });
  $('bSelInv').addEventListener('click', function () { if (!blocked()) select(S.bodies.filter(function (b) { return !S.sel.has(b); }), false); });
  function setVisible(fn) {
    if (blocked()) return;
    pushUndo();
    for (const b of S.bodies) b.visible = fn(b);
    updateExplode(); sceneChanged(false); refresh();
  }
  $('bShowAll').addEventListener('click', function () { setVisible(function () { return true; }); });
  $('bHideSel').addEventListener('click', function () { if (!S.cmp && needSel().length) { setVisible(function (b) { return b.visible && !S.sel.has(b); }); S.sel.clear(); refresh(); } });
  $('bIsolate').addEventListener('click', function () { if (!S.cmp && needSel().length) setVisible(function (b) { return S.sel.has(b); }); });
  // display (one undo step per drag of the control)
  let dispUndo = false;
  function dispEdit(fn) {
    if (S.cmp) return;
    if (!dispUndo) { pushUndo(); dispUndo = true; }
    for (const b of selBodies()) fn(b);
    dirty = true;
  }
  $('col').addEventListener('input', function () {
    const v = this.value, c = [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
    dispEdit(function (b) { b.color = c.slice(); });
    updateList();
  });
  $('opa').addEventListener('input', function () { const v = +this.value; $('opaV').textContent = v + '%'; dispEdit(function (b) { b.opacity = v / 100; }); });
  $('col').addEventListener('change', function () { dispUndo = false; });
  $('opa').addEventListener('change', function () { dispUndo = false; });
  // material
  $('mat').addEventListener('change', function () {
    const m = MATS.find(function (x) { return x[0] === $('mat').value; });
    if (S.cmp || !selBodies().length) { updateInfo(); return; }
    pushUndo();
    for (const b of selBodies()) { b.material = m[0]; if (m[0] !== 'custom') b.density = m[3]; else if (!b.density) b.density = 1; }
    refresh();
  });
  $('dens').addEventListener('change', function () {
    if (S.cmp || !selBodies().length) { updateInfo(); return; }
    pushUndo();
    for (const b of selBodies()) { b.density = Math.max(0, +this.value || 0); b.material = b.density ? 'custom' : ''; }
    refresh();
  });
  // explode
  $('expl').addEventListener('input', function () {
    S.explode = +this.value / 100; $('explV').textContent = this.value + '%';
    updateExplode(); sceneChanged(false);
  });
  // section
  $('secOn').addEventListener('change', function () { S.sec.on = this.checked; updateSection(); dirty = true; });
  $('secFlip').addEventListener('change', function () { S.sec.flip = this.checked; dirty = true; });
  $('secAx').addEventListener('change', function () {
    S.sec.axis = this.value;
    if (this.value === 'view') S.sec.nView = viewer();
    if (this.value === 'pick') { setTool('secpick'); return; }
    updateSection(); dirty = true;
  });
  $('secPos').addEventListener('input', function () { S.sec.s = +this.value / 1000; if (!S.sec.on) { S.sec.on = true; $('secOn').checked = true; } updateSection(); dirty = true; });
  $('bSecPick').addEventListener('click', function () { setTool('secpick'); });

  // ================= measuring =================
  function measLabel(m) {
    if (m.type === 'dist' || m.type === 'len') return f2(m.v) + ' mm';
    if (m.type === 'angle') return f2(m.v, 1) + '°';
    if (m.type === 'radius') return 'R ' + f2(m.r);
    return 't = ' + f2(m.v) + ' mm';
  }
  function measText(m) {
    if (m.type === 'dist') return L('Khoảng cách: ', 'Distance: ') + f2(m.v) + ' mm (ΔX ' + f2(m.d[0]) + ', ΔY ' + f2(m.d[1]) + ', ΔZ ' + f2(m.d[2]) + ')';
    if (m.type === 'len') return L('Chiều dài cạnh: ', 'Edge length: ') + f2(m.v) + ' mm' + (m.sub === 'arc' ? ' (R ' + f2(m.r) + ')' : '');
    if (m.type === 'angle') return L('Góc: ', 'Angle: ') + f2(m.v) + '°';
    if (m.type === 'radius') return L('Bán kính: ', 'Radius: ') + f2(m.r) + ' mm (Ø ' + f2(2 * m.r) + ')';
    return L('Bề dày: ', 'Wall thickness: ') + f2(m.v) + ' mm';
  }
  function addMeasure(type, pts) {
    const m = { type: type, pts: pts.map(function (p) { return p.slice(); }) };
    if (type === 'dist' || type === 'thick') {
      const d = V.sub(pts[1], pts[0]);
      m.v = V.len(d); m.d = d.map(Math.abs);
    } else if (type === 'angle') {
      const a = V.norm(V.sub(pts[0], pts[1])), b = V.norm(V.sub(pts[2], pts[1]));
      m.v = Math.acos(Math.max(-1, Math.min(1, V.dot(a, b)))) * 180 / Math.PI;
    } else {
      const a = V.sub(pts[1], pts[0]), b = V.sub(pts[2], pts[0]), n = V.cross(a, b), n2 = V.dot(n, n);
      if (n2 < 1e-18 * V.dot(a, a) * V.dot(b, b) || n2 === 0) { flash(L('3 điểm thẳng hàng, không xác định được bán kính', 'The 3 points are collinear: no radius')); return; }
      m.c = V.add(pts[0], V.mul(V.add(V.mul(V.cross(b, n), V.dot(a, a)), V.mul(V.cross(n, a), V.dot(b, b))), 1 / (2 * n2)));
      m.n = V.norm(n); m.r = V.len(V.sub(pts[0], m.c));
    }
    if (!S.cmp) pushUndo();
    S.measures.push(m); S.measSel = S.measures.length - 1;
    updateMeasList(); dirty = true;
  }
  function measureThickness(h) {
    const b = h.body, mi = M.inv(h.dm), eps = Math.max(mainCam.radius * 1e-6, 1e-9), inward = V.mul(h.normal, -1);
    const r = core.raycast(ensureBVH(b.geo), M.point(mi, V.add(h.point, V.mul(inward, eps))), M.vec(mi, inward), 0, Infinity, h.tri);
    if (!r) { flash(L('Không tìm thấy mặt đối diện tại điểm này (lưới hở?)', 'No opposite face found at this point (open mesh?)')); return; }
    addMeasure('thick', [h.point, V.add(h.point, V.mul(inward, r.t + eps))]);
  }
  function updateMeasList() {
    const box = $('measList');
    box.innerHTML = '';
    updateMeasPanel();
    if (!S.measures.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L('Chọn công cụ đo phía trên màn hình 3D rồi bấm vào mesh.', 'Pick a measuring tool above the 3D view, then click on the mesh.'); box.appendChild(e); return; }
    S.measures.forEach(function (m, i) {
      const row = document.createElement('div'); row.className = 'item';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (i + 1) + '. ' + measText(m); nm.title = measText(m);
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
      x.addEventListener('click', function () { if (!S.cmp) pushUndo(); S.measures.splice(i, 1); updateMeasList(); dirty = true; });
      if (i === S.measSel) row.classList.add('on');
      row.addEventListener('click', function () { S.measSel = i; S.measFocus = true; updateMeasList(); openPop('measure', true); dirty = true; });
      row.appendChild(nm); row.appendChild(x); box.appendChild(row);
    });
  }
  $('bMeasClr').addEventListener('click', function () { if (S.measures.length && !S.cmp) pushUndo(); S.measures = []; S.tmp = []; updateMeasList(); dirty = true; });

  // ================= decimate =================
  function modeValue() { return document.querySelector('input[name=mode]:checked').value; }
  function curTris() { let n = 0; for (const b of selBodies()) n += b.geo.indices.length / 3; return n; }
  function syncCounts(fromPct) {
    const n = curTris();
    $('vCur').value = n;
    if (fromPct) $('vCnt').value = n ? Math.max(4, Math.round(n * (+$('vPct').value || 0) / 100)) : 0;
    else if (n) $('vPct').value = +(100 * (+$('vCnt').value || 0) / n).toFixed(2);
  }
  document.querySelectorAll('input[name=mode]').forEach(function (r) {
    r.addEventListener('change', function () { $('lMax').textContent = modeValue() === 'edge' ? L('Edge Length (tối thiểu)', 'Edge Length (minimum)') : 'Maximum'; });
  });
  $('cMax').addEventListener('change', function () { $('vMax').disabled = !this.checked; });
  $('cFree').addEventListener('change', function () { $('vFree').disabled = !this.checked; });
  $('cPct').addEventListener('change', function () { $('vPct').disabled = !this.checked; $('vCnt').disabled = !this.checked; });
  $('vPct').addEventListener('input', function () { syncCounts(true); });
  $('vCnt').addEventListener('input', function () { syncCounts(false); });
  function geomChanged() { updateExplode(); sceneChanged(false); refresh(); }

  $('bApply').addEventListener('click', async function () {
    if (blocked()) return;
    const list = needSel();
    if (!list.length) return;
    showError(null);
    const opt = { mode: modeValue(), useMax: $('cMax').checked, maxValue: +$('vMax').value || 0, useTarget: $('cPct').checked, freeEdge: $('cFree').checked, freeEdgeTol: +$('vFree').value || 0 };
    if (!opt.useMax && !opt.useTarget) { showError(L('Hãy bật Maximum hoặc Target Percentage.', 'Enable Maximum or Target Percentage.')); return; }
    if (opt.useMax && opt.maxValue <= 0) { showError(L('Giá trị Maximum phải lớn hơn 0.', 'Maximum must be greater than 0.')); return; }
    const total = curTris(), ratio = Math.min(1, (+$('vCnt').value || 0) / total), t0 = performance.now();
    let before = 0, after = 0, short = false;
    pushUndo();
    setBusy(true, L('Đang giảm lưới...', 'Decimating...'));
    try {
      for (let i = 0; i < list.length; i++) {
        const b = list[i], nt = b.geo.indices.length / 3, sc = Math.cbrt(Math.abs(M.det3(b.matrix))) || 1;
        const o = Object.assign({}, opt, { maxValue: opt.maxValue / sc, freeEdgeTol: opt.freeEdgeTol / sc, targetTris: Math.max(4, Math.round(nt * ratio)) });
        const m = await run('decimate', { mesh: { positions: b.geo.positions, indices: b.geo.indices }, opt: o }, function (p) { setProgress((i + p) / list.length); });
        before += nt; after += m.indices.length / 3;
        if (opt.useTarget && m.indices.length / 3 > o.targetTris * 1.02 + 2) short = true;
        setGeo(b, makeGeo(m.positions, m.indices));
      }
      let html = L('Tam giác: ', 'Triangles: ') + fmtN(before) + ' → <b>' + fmtN(after) + '</b> (' + f2(100 * after / before, 1) + '%) · ' + list.length + ' body · ' + f2((performance.now() - t0) / 1000, 1) + L(' giây', ' s');
      if (short) html += '<br>' + L('Chưa đạt số tam giác mục tiêu: bị giới hạn bởi Maximum, Free Edge Tolerance hoặc hình dạng mesh.', 'Target count not reached: limited by Maximum, Free Edge Tolerance or the mesh shape.');
      $('result').innerHTML = html;
    } catch (e) { showError(e); }
    setBusy(false); geomChanged();
  });
  $('bReset').addEventListener('click', function () {
    if (blocked()) return;
    const list = needSel().filter(function (b) { return b.orig !== b.geo; });
    if (list.length) { pushUndo(); for (const b of list) setGeo(b, b.orig); }
    $('result').textContent = list.length ? L('Đã đưa ' + list.length + ' body về mesh gốc.', list.length + ' bodies restored to the original mesh.') : L('Không có body tick nào đã bị giảm lưới.', 'No ticked body has been decimated.');
    geomChanged();
  });

  // ================= split =================
  // Options from the gentlest to the most aggressive. "Split" starts at the first one; Next / Previous / the slider
  // redo the same split with another option until the result is the wanted one.
  const SPLIT_LEVELS = [
    { mode: 'vertex', vi: 'Các mảnh rời nhau', en: 'Disconnected pieces' },
    { mode: 'edge', vi: 'Tách cả chỗ chỉ chạm nhau tại 1 điểm', en: 'Also where parts only touch at a point' },
    { mode: 'shell', vi: 'Tách cả chỗ chạm nhau theo cạnh hoặc mặt', en: 'Also where parts touch along an edge or a face' },
    { mode: 'concave', angle: 70 }, { mode: 'concave', angle: 50 }, { mode: 'concave', angle: 35 }, { mode: 'concave', angle: 22 },
    { mode: 'crease', angle: 60 }, { mode: 'crease', angle: 35 }, { mode: 'crease', angle: 20 }
  ];
  const SPLIT_TOPO = 3, SPLIT_MAX_PARTS = 200;
  let splitLevel = 1;
  function splitLevelName(i) {
    const o = SPLIT_LEVELS[i - 1];
    if (o.mode === 'concave') return L('Cắt thêm tại khe lõm gấp từ ', 'Also cut along concave creases of ') + o.angle + '°' + L(' trở lên (chỗ các phần dính liền nhau)', ' or more (where fused parts meet)');
    if (o.mode === 'crease') return L('Cắt tại mọi cạnh gấp từ ', 'Cut along every sharp edge of ') + o.angle + '°' + L(' trở lên (tách thành từng mặt)', ' or more (one piece per face)');
    return L(o.vi, o.en);
  }
  function updateSplitUI() {
    $('splitLv').max = SPLIT_LEVELS.length; $('splitLv').value = splitLevel;
    $('splitLvV').textContent = splitLevel + '/' + SPLIT_LEVELS.length;
    $('splitLvName').textContent = splitLevelName(splitLevel);
    $('bSplitPrev').disabled = splitLevel <= 1; $('bSplitNext').disabled = splitLevel >= SPLIT_LEVELS.length;
  }
  // what Next / Previous / the slider act on: the last split while its pieces are still there and nothing else is ticked,
  // otherwise the ticked bodies
  function splitTarget() {
    const s = S.spl, sel = selBodies();
    if (s && s.items.every(function (it) { return it.out.length && it.out.every(function (b) { return S.bodies.indexOf(b) >= 0; }); })) {
      const same = sel.every(function (b) { return s.items.some(function (it) { return !it.cut && it.out[0] === b; }); });
      if (!sel.length || same) return s.items;
    }
    if (!sel.length) { flash(L('Hãy tick chọn body trước', 'Tick a body first')); return null; }
    return sel.map(function (b) {
      return { src: { name: b.name, geo: b.geo, orig: b.orig, matrix: b.matrix.slice(), matrix0: b.matrix0.slice(), color: b.color.slice(), opacity: b.opacity, material: b.material, density: b.density }, out: [b], cut: false };
    });
  }
  async function splitCompute(items, level, k, n) {
    const o = SPLIT_LEVELS[level - 1], res = [];
    let pieces = 0;
    for (let i = 0; i < items.length; i++) {
      const g = items[i].src.geo;
      const r = await run('split', { mesh: { positions: g.positions, indices: g.indices },
        opt: { mode: o.mode, angle: o.angle, minTris: +$('vMin').value || 1, keepSmall: $('cKeep').checked, maxParts: SPLIT_MAX_PARTS } });
      r.cut = !(r.bodies.length <= 1 && !r.smallComponents);
      pieces += r.cut ? r.bodies.length : 1;
      res.push(r);
      setProgress((k + (i + 1) / items.length) / n);
    }
    return { level: level, res: res, pieces: pieces };
  }
  function splitApply(items, c) {
    const changes = items.some(function (it, i) { return it.cut || c.res[i].cut; });
    if (changes) pushUndo();
    items.forEach(function (it, i) {
      const r = c.res[i], src = it.src;
      if (!it.cut && !r.cut) return;                       // was whole, stays whole
      const at = Math.max(0, S.bodies.indexOf(it.out[0]));
      for (const b of it.out) removeBody(b);
      it.out = [];
      if (r.cut) {
        const pad = Math.max(3, String(r.bodies.length).length);
        r.bodies.forEach(function (p, k) {
          it.out.push(addBody(src.name + (p.small ? '_small' : '_' + String(k + 1).padStart(pad, '0')), makeGeo(p.positions, p.indices),
            { matrix: src.matrix, matrix0: src.matrix0, opacity: src.opacity, material: src.material, density: src.density, index: at + k }));
        });
      } else {
        const b = addBody(src.name, src.geo, { orig: src.orig, matrix: src.matrix, matrix0: src.matrix0, color: src.color, opacity: src.opacity, material: src.material, density: src.density, index: at });
        it.out.push(b); S.sel.add(b);
      }
      it.cut = r.cut;
    });
    S.spl = { items: items };
    splitLevel = c.level; updateSplitUI();
    let small = 0, capped = false, comps = 0;
    for (const r of c.res) { small += r.smallComponents; capped = capped || r.capped; comps += r.totalComponents; }
    const head = L('Phương án ', 'Option ') + c.level + '/' + SPLIT_LEVELS.length + ' · ' + splitLevelName(c.level) + '<br>';
    if (c.pieces === items.length && !small) {
      $('splitRes').innerHTML = head + '<span class="bad">' + L('Không tách được mảnh nào.', 'Nothing to split.') + '</span>' +
        (c.level < SPLIT_LEVELS.length ? L(' Bấm "Phương án kế ▶" để thử tách mạnh hơn.', ' Press "Next option ▶" to try a stronger split.') : '');
    } else {
      $('splitRes').innerHTML = head + fmtN(items.length) + ' body → <b>' + fmtN(c.pieces) + '</b> body' +
        (small ? ' (' + fmtN(small) + ($('cKeep').checked ? L(' mảnh nhỏ được gom', ' small pieces grouped') : L(' mảnh nhỏ bị bỏ', ' small pieces dropped')) + ')' : '') +
        (capped ? '<br>' + L('Bề mặt bị vụn quá nhiều nên các mảnh nhỏ nhất đã được nhập vào mảnh bên cạnh (tối đa ', 'The surface broke into too many pieces, so the smallest were merged into their neighbours (at most ') + SPLIT_MAX_PARTS + L(' mảnh).', ' pieces).') : '') +
        '<br>' + L('Chưa đúng ý? Bấm "Phương án kế ▶" hoặc "◀ Phương án trước".', 'Not what you wanted? Press "Next option ▶" or "◀ Previous option".');
    }
    geomChanged();
  }
  // how: 'auto' = fresh split of the ticked bodies from option 1, 'next' / 'prev' = nearest option that gives another result,
  // a number = exactly that option
  async function splitRun(how) {
    if (blocked()) return;
    let items;
    if (how === 'auto') {
      const list = needSel();
      if (!list.length) return;
      S.spl = null; S.sel = new Set(list);
      items = splitTarget();
    } else items = splitTarget();
    if (!items) { updateSplitUI(); return; }
    const now = items.reduce(function (n, it) { return n + it.out.length; }, 0);
    let levels = [];
    if (how === 'auto') for (let l = 1; l <= SPLIT_TOPO; l++) levels.push(l);
    else if (how === 'next') for (let l = splitLevel + 1; l <= SPLIT_LEVELS.length; l++) levels.push(l);
    else if (how === 'prev') for (let l = splitLevel - 1; l >= 1; l--) levels.push(l);
    else levels = [how];
    if (!levels.length) { updateSplitUI(); return; }
    showError(null); setBusy(true, L('Đang tách body...', 'Splitting...'));
    try {
      let c = null;
      for (let k = 0; k < levels.length; k++) {
        c = await splitCompute(items, levels[k], k, levels.length);
        if (typeof how === 'number' || c.pieces !== now) break;
        c = how === 'auto' ? c : null;                      // 'auto' keeps the last try even when nothing came apart
      }
      if (c) splitApply(items, c);
      else {
        flash(how === 'next' ? L('Không còn phương án nào cho kết quả khác', 'No further option gives a different result') : L('Không có phương án trước nào cho kết quả khác', 'No earlier option gives a different result'));
        updateSplitUI();
      }
    } catch (e) { showError(e); updateSplitUI(); }
    setBusy(false);
  }
  const HOLE_LEVELS = [
    ['Vá phẳng: nối viền lỗ bằng ít tam giác nhất', 'Flat patch: close the rim with as few triangles as possible'],
    ['Vá và chia lưới đều theo cỡ tam giác xung quanh', 'Patch re-meshed to the size of the surrounding triangles'],
    ['Vá, chia lưới và uốn miếng vá tiếp nối theo mặt cong xung quanh', 'Re-meshed patch, bent to continue the surface around the hole']
  ];
  function updateHoleUI() {
    const lv = +$('holeLv').value, sel = selBodies();
    $('holeLvV').textContent = lv + '/3'; $('holeLvName').textContent = L(HOLE_LEVELS[lv - 1][0], HOLE_LEVELS[lv - 1][1]);
    let loops = 0, edges = 0, open = 0;
    const list = sel.length ? sel : S.bodies;
    for (const b of list) { const h = holesOf(b.geo); loops += h.loops; edges += h.edges; if (h.edges) open++; }
    $('holeInfo').innerHTML = !S.bodies.length ? L('Chưa có mesh.', 'No mesh loaded.') :
      (sel.length ? L('Body đang tick: ', 'Ticked bodies: ') : L('Tất cả body: ', 'All bodies: ')) +
      (edges ? '<span class="bad">' + fmtN(open) + L(' body hở', ' open') + '</span> · ' + fmtN(loops) + L(' viền hở · ', ' open borders · ') + fmtN(edges) + L(' cạnh biên', ' border edges')
        : '<span class="good">' + L('lưới kín, không có viền hở', 'closed, no open borders') + '</span>');
    $('bFill').classList.toggle('primary', sel.some(function (b) { return holesOf(b.geo).edges > 0; }));
  }
  $('holeLv').addEventListener('input', updateHoleUI);
  $('bFill').addEventListener('click', async function () {
    if (blocked()) return;
    const list = needSel().filter(function (b) { return holesOf(b.geo).edges > 0; });
    if (!list.length) { if (S.sel.size) flash(L('Các body đang tick không có viền hở', 'The ticked bodies have no open borders')); return; }
    showError(null); setBusy(true, L('Đang vá lưới...', 'Filling holes...'));
    try {
      pushUndo();
      let filled = 0, skipped = 0, added = 0, stitched = 0, left = 0;
      for (let i = 0; i < list.length; i++) {
        const b = list[i], sc = Math.cbrt(Math.abs(M.det3(b.matrix))) || 1;
        const r = await run('fill', { mesh: { positions: b.geo.positions, indices: b.geo.indices },
          opt: { level: +$('holeLv').value, maxPerimeter: (+$('holeMax').value || 0) / sc, stitch: (+$('holeStitch').value || 0) / sc } });
        filled += r.filled; skipped += r.skipped; added += r.added; stitched += r.stitched;
        if (r.added || r.stitched) setGeo(b, makeGeo(r.positions, r.indices));
        left += holesOf(b.geo).edges;
        setProgress((i + 1) / list.length);
      }
      $('holeRes').innerHTML = L('Đã vá ', 'Filled ') + '<b>' + fmtN(filled) + '</b>' + L(' lỗ (+', ' holes (+') + fmtN(added) + L(' tam giác)', ' triangles)') +
        (stitched ? L(' · khâu ', ' · stitched ') + fmtN(stitched) + L(' đỉnh', ' vertices') : '') +
        (skipped ? L(' · bỏ qua ', ' · skipped ') + fmtN(skipped) + L(' lỗ lớn hơn giới hạn', ' holes over the limit') : '') + '<br>' +
        (left ? '<span class="bad">' + L('Còn ', 'Still ') + fmtN(left) + L(' cạnh biên hở', ' open border edges') + '</span>' + L(' (viền không khép kín hoặc vượt giới hạn).', ' (borders that do not close, or over the limit).')
          : '<span class="good">' + L('Các body đã kín.', 'The bodies are now closed.') + '</span>');
    } catch (e) { showError(e); }
    setBusy(false); geomChanged();
  });
  $('bSplit').addEventListener('click', function () { splitRun('auto'); });
  $('bSplitNext').addEventListener('click', function () { splitRun('next'); });
  $('bSplitPrev').addEventListener('click', function () { splitRun('prev'); });
  $('splitLv').addEventListener('input', function () { $('splitLvV').textContent = this.value + '/' + SPLIT_LEVELS.length; $('splitLvName').textContent = splitLevelName(+this.value); });
  $('splitLv').addEventListener('change', function () { const l = +this.value; if (l !== splitLevel || !S.spl) splitRun(l); });

  function concatMeshes(list) {
    let nv = 0, ni = 0;
    const ms = list.map(worldMesh);
    for (const m of ms) { nv += m.positions.length; ni += m.indices.length; }
    const pos = new Float32Array(nv), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const m of ms) { pos.set(m.positions, vo); for (let k = 0; k < m.indices.length; k++) idx[io + k] = m.indices[k] + vo / 3; vo += m.positions.length; io += m.indices.length; }
    return { positions: pos, indices: idx };
  }
  function joinSelected() {
    if (blocked()) return;
    const list = needSel();
    if (list.length < 2) { if (list.length) flash(L('Hãy tick ít nhất 2 body để gộp', 'Tick at least 2 bodies to merge')); return; }
    pushUndo();
    const m = concatMeshes(list), first = list[0], at = S.bodies.indexOf(first);
    for (const b of list) removeBody(b);
    const nb = addBody(first.name + '_merged', makeGeo(m.positions, m.indices), { color: first.color, opacity: first.opacity, material: first.material, density: first.density, index: Math.min(at, S.bodies.length) });
    S.sel.clear(); S.sel.add(nb);
    $('splitRes').innerHTML = L('Đã gộp ', 'Merged ') + list.length + ' body → <b>' + nb.name + '</b>';
    geomChanged();
  }
  $('bJoin').addEventListener('click', joinSelected);

  // ================= tooling analysis =================
  const UC_PAL = [[60, 220, 110], [70, 160, 255], [255, 220, 40], [255, 50, 60]];
  $('ucAx').addEventListener('change', function () { $('ucVecRow').style.display = this.value === 'pick' ? 'flex' : 'none'; if (this.value === 'pick' && !S.ucDir) ucPickStart(); else if (this.value !== 'pick') ucPickStop(); dirty = true; });
  $('ucBright').addEventListener('input', function () { $('ucBrightV').textContent = this.value + '%'; dirty = true; });
  $('bUcClr').addEventListener('click', function () { if (blocked()) return; clearAna(); $('ucRes').innerHTML = ucLegend(); S.ucList = null; ucIsoApply(); });
  $('bUc').addEventListener('click', async function () {
    if (blocked()) return;
    const list = needSel();
    if (!list.length) return;
    const ax = $('ucAx').value;
    let dir = ax === 'x' ? [1, 0, 0] : ax === 'y' ? [0, 1, 0] : ax === 'z' ? [0, 0, 1] : ax === 'view' ? viewer() : S.ucDir ? (S.ucDir.flip ? V.mul(S.ucDir.d, -1) : S.ucDir.d) : null;
    if (!dir || V.len(dir) < 1e-12) { ucPickStart(); flash(L('Hãy chọn hướng mở khuôn: bấm một mặt phẳng, cạnh thẳng hoặc trục', 'Pick the pull direction: click a plane, a straight edge or an axis'), true); return; }
    ucPickStop();
    dir = V.norm(dir);
    showError(null); setBusy(true, L('Đang phân tích undercut...', 'Analysing undercuts...'));
    const tot = [0, 0, 0, 0], withUc = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const r = await run('undercut', { mesh: worldMesh(b), dir: dir, minDraft: +$('ucDraft').value || 0 }, function (p) { setProgress((i + p) / list.length); });
        setAnaClasses(b, r.classes, UC_PAL);
        for (let k = 0; k < 4; k++) tot[k] += r.area[k];
        if (r.area[3] > 0) withUc.push([b.name, r.area[3]]);
      }
      S.ucList = list.slice(); ucIsoApply();
      const all = tot[0] + tot[1] + tot[2] + tot[3] || 1, pc = function (k) { return f2(tot[k] / 100) + ' cm² (' + f2(100 * tot[k] / all, 1) + '%)'; };
      let html = ucLegend() + '<br>' + L('Hướng: ', 'Direction: ') + dir.map(function (v) { return f2(v, 3); }).join(', ') + ' · ' + list.length + ' body<br>' +
        L('Phía +: ', '+ half: ') + pc(0) + '<br>' + L('Phía −: ', '− half: ') + pc(1) + '<br>' + L('Thiếu góc thoát: ', 'Draft too small: ') + pc(2) + '<br>' +
        (tot[3] > 0 ? '<span class="bad">Undercut: ' + pc(3) + '</span>' : '<b>' + L('Không có undercut', 'No undercut') + '</b>');
      if (list.length > 1 && withUc.length) {
        withUc.sort(function (a, b) { return b[1] - a[1]; });
        html += '<br>' + L('Body có undercut: ', 'Bodies with undercut: ') + withUc.slice(0, 8).map(function (x) { return x[0] + ' (' + f2(x[1] / 100) + ' cm²)'; }).join(', ') + (withUc.length > 8 ? ', ...' : '');
      }
      $('ucRes').innerHTML = html;
    } catch (e) { showError(e); }
    setBusy(false); dirty = true;
  });

  // ================= collision =================
  const RED = [255, 50, 60];
  function showCollision(i) {
    const c = S.col;
    if (!c) return;
    clearAna();
    c.active = i;
    const flags = new Map(), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const mark = function (b, f) { const cur = flags.get(b); if (!cur) { flags.set(b, f.slice()); return; } for (let k = 0; k < f.length; k++) if (f[k]) cur[k] = 1; };
    c.pairs.forEach(function (p, k) { if (i < 0 || i === k) { mark(p.a, p.fa); mark(p.b, p.fb); } });
    flags.forEach(function (f, b) {
      if (S.bodies.indexOf(b) < 0) return;
      setAnaClasses(b, f, [b.color, RED]);
      if (i < 0) return;
      const P = b.geo.positions, I = b.geo.indices, m = dispMatrix(b);
      for (let t = 0; t < f.length; t++) if (f[t]) for (let k = 0; k < 3; k++) {
        const v = 3 * I[3 * t + k], w = M.point(m, [P[v], P[v + 1], P[v + 2]]);
        for (let a = 0; a < 3; a++) { if (w[a] < mn[a]) mn[a] = w[a]; if (w[a] > mx[a]) mx[a] = w[a]; }
      }
    });
    if (i >= 0 && mx[0] >= mn[0]) {
      mainCam.target = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      mainCam.zoom = Math.max(0.5 * V.len(V.sub(mx, mn)) * 2.2, mainCam.radius * 0.02) / Math.min(1, mainCam.w / H);
    }
    renderCollisions(); dirty = true;
  }
  function renderCollisions() {
    const c = S.col, box = $('colRes');
    box.innerHTML = '';
    const head = document.createElement('div');
    head.innerHTML = L('Đã kiểm tra ', 'Checked ') + fmtN(c.nBodies) + ' body, ' + fmtN(c.nPairs) + L(' cặp có hộp bao chồng nhau.', ' pairs with overlapping boxes.') + '<br>' +
      (c.pairs.length ? '<span class="bad">' + c.pairs.length + L(' cặp va chạm (bấm để xem từng cặp):', ' colliding pairs (click one to inspect):') + '</span>' : '<b>' + L('Không có va chạm', 'No collision') + '</b>');
    box.appendChild(head);
    if (!c.pairs.length) return;
    const all = document.createElement('div'); all.className = 'pair' + (c.active < 0 ? ' sel' : ''); all.textContent = '▸ ' + L('Tất cả các cặp', 'All pairs');
    all.addEventListener('click', function () { if (!blocked()) showCollision(-1); });
    box.appendChild(all);
    c.pairs.slice(0, 200).forEach(function (p, k) {
      const d = document.createElement('div'); d.className = 'pair' + (c.active === k ? ' sel' : '');
      d.textContent = '▸ ' + (p.contain ? p.a.name + L(' nằm hoàn toàn trong ', ' lies entirely inside ') + p.b.name : p.a.name + ' ↔ ' + p.b.name);
      d.addEventListener('click', function () { if (!blocked()) showCollision(k); });
      box.appendChild(d);
    });
  }
  $('bColClr').addEventListener('click', function () { if (blocked()) return; clearAna(); S.col = null; resetBox('colRes'); });
  $('bCol').addEventListener('click', async function () {
    if (blocked()) return;
    const sel = selBodies().filter(function (b) { return b.visible; }), list = sel.length >= 2 ? sel : visibleBodies();
    if (list.length < 2) { flash(L('Cần ít nhất 2 body đang hiện', 'At least 2 visible bodies are needed')); return; }
    const boxes = list.map(function (b) { return bodyBox(b, false); }), cand = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1] && a.min[2] <= b.max[2] && a.max[2] >= b.min[2]) cand.push([i, j]);
    }
    showError(null); setBusy(true, L('Đang kiểm tra va chạm...', 'Checking collisions...'));
    const wm = new Map(), pairs = [];
    const mesh = function (b) { if (!wm.has(b)) wm.set(b, worldMesh(b)); return wm.get(b); };
    try {
      for (let k = 0; k < cand.length; k++) {
        const A = list[cand[k][0]], B = list[cand[k][1]];
        const r = await run('collide', { a: mesh(A), b: mesh(B) });
        setProgress((k + 1) / cand.length);
        if (r.pairs > 0) pairs.push({ a: A, b: B, fa: r.flagsA, fb: r.flagsB, contain: 0 });
        else if (r.contain) {
          const inner = r.contain === 1 ? A : B, outer = r.contain === 1 ? B : A;
          pairs.push({ a: inner, b: outer, fa: new Uint8Array(inner.geo.indices.length / 3).fill(1), fb: new Uint8Array(outer.geo.indices.length / 3), contain: 1 });
        }
      }
      S.col = { pairs: pairs, nBodies: list.length, nPairs: cand.length, active: -1 };
      // the ticked (orange) state would hide the red marking
      S.sel.clear(); refresh();
      showCollision(-1);
    } catch (e) { showError(e); }
    setBusy(false); dirty = true;
  });

  // ================= compare meshes =================
  function devColor(v, c) { // v in [-1, 1]: blue, cyan, green, yellow, red
    const st = [[40, 80, 255], [40, 210, 255], [60, 220, 110], [255, 230, 40], [255, 50, 50]];
    const x = (Math.max(-1, Math.min(1, v)) + 1) * 2, i = Math.min(3, Math.floor(x)), f = x - i;
    for (let k = 0; k < 3; k++) c[k] = Math.round(st[i][k] + (st[i + 1][k] - st[i][k]) * f);
  }
  function updateCmpUI() {
    const c = S.cmp, n = c ? Math.min(c.pa.length, c.pb.length) : 0;
    $('bCmpStart').disabled = !!c;
    $('bCmpUndo').disabled = !(c && c.split && (c.pa.length || c.pb.length));
    $('bCmpAlign').disabled = !(c && c.split && n >= 3);
    $('bCmpIcp').disabled = $('bCmpDev').disabled = $('bCmpEnd').disabled = $('bCmpView').disabled = !c;
    if (!c) { resetBox('cmpRes'); return; }
    let html = L('Tham chiếu: ', 'Reference: ') + c.a.name + '<br>' + L('Cần căn: ', 'To align: ') + c.b.name + '<br>';
    if (c.split) html += L('Điểm đã bấm: ', 'Points clicked: ') + c.pa.length + ' / ' + c.pb.length + (n < 3 ? L(' (cần ít nhất 3 cặp)', ' (at least 3 pairs needed)') : '');
    if (c.fit !== undefined) html += L('Sai số tại các điểm bấm (căn thô): ', 'Residual at the picked points (rough fit): ') + f2(c.fit, 3) + ' mm<br>';
    if (c.icpRms !== undefined) html += L('Đã căn chỉnh tự động, sai số khớp: ', 'Auto aligned, fit residual: ') + f2(c.icpRms, 3) + ' mm<br>';
    if (c.dev) {
      const d = c.dev, r = c.range;
      html += '<b>' + L('Sai lệch của ', 'Deviation of ') + c.b.name + L(' so với ', ' from ') + c.a.name + '</b><br>' +
        L('Lớn nhất phía ngoài: ', 'Max outside: ') + '+' + f2(Math.max(0, d.max), 3) + ' mm<br>' + L('Lớn nhất phía trong: ', 'Max inside: ') + f2(Math.min(0, d.min), 3) + ' mm<br>' +
        L('Trung bình tuyệt đối: ', 'Mean absolute: ') + f2(d.meanAbs, 3) + ' mm<br>RMS: ' + f2(d.rms, 3) + ' mm' +
        '<div class="grad"></div><div class="gradl"><span>−' + f2(r) + '</span><span>0</span><span>+' + f2(r) + ' mm</span></div>';
    }
    $('cmpRes').innerHTML = html;
  }
  function startCompare() {
    if (blocked()) return;
    const sel = Array.from(S.sel).filter(function (b) { return S.bodies.indexOf(b) >= 0; });
    if (sel.length !== 2) { flash(L('Hãy tick đúng 2 body: body tick trước là tham chiếu', 'Tick exactly 2 bodies: the first ticked is the reference')); return; }
    setTool('select'); clearAna(); S.col = null; resetBox('colRes');
    const mkCam = function (b, i) { const c = { R: isoView(), x: i * W / 2, w: W / 2 }; fitCam(c, bodyBox(b, false)); return c; };
    S.cmp = { a: sel[0], b: sel[1], pa: [], pb: [], split: true, vis: S.bodies.map(function (b) { return [b, b.visible]; }), cams: [mkCam(sel[0], 0), mkCam(sel[1], 1)], dev: null };
    for (const b of S.bodies) b.visible = b === sel[0] || b === sel[1];
    S.sel.clear();
    openPop('compare', true);
    sceneChanged(true); refresh(); updateCmpUI();
    flash(L('Bấm các điểm tương ứng trên 2 body theo cùng thứ tự (ít nhất 3 cặp), rồi bấm "Căn theo điểm"', 'Click matching points on both bodies in the same order (at least 3 pairs), then press "Align by points"'), true);
  }
  function colorDeviation() {
    const c = S.cmp, d = c.dev.dist;
    c.range = +$('cmpRange').value > 0 ? +$('cmpRange').value : Math.max(Math.abs(c.dev.min), Math.abs(c.dev.max), 1e-9);
    setAna(c.b, function (t, vi, col) { devColor(d[vi] / c.range, col); });
    updateCmpUI(); dirty = true;
  }
  async function runDeviation() {
    const c = S.cmp;
    if (!c || busy) return;
    c.split = false; c.sync = true; cam = mainCam;
    setBusy(true, L('Đang tính sai lệch...', 'Computing deviation...'));
    try {
      c.dev = await run('deviation', { b: worldMesh(c.b), a: worldMesh(c.a) }, setProgress);
      colorDeviation();
    } catch (e) { showError(e); }
    setBusy(false); sceneChanged(true); refresh(); updateCmpUI(); flash('');
  }
  function moveB(T) {
    const c = S.cmp;
    c.b.matrix = M.mul(T, c.b.matrix); c.b.stats = null;
    c.pb = c.pb.map(function (p) { return M.point(T, p); });
  }
  $('bCmpStart').addEventListener('click', startCompare);
  $('bCmpUndo').addEventListener('click', function () {
    const c = S.cmp;
    if (!c || !c.split) return;
    if (c.pb.length >= c.pa.length && c.pb.length) c.pb.pop(); else c.pa.pop();
    updateCmpUI(); dirty = true;
  });
  function alignByPoints() {
    const c = S.cmp, n = Math.min(c.pa.length, c.pb.length);
    if (n < 3) return false;
    pushUndo();
    c.pa.length = n; c.pb.length = n;
    moveB(core.rigidFit(c.pb, c.pa));
    let s = 0; for (let i = 0; i < n; i++) { const d = V.len(V.sub(c.pa[i], c.pb[i])); s += d * d; }
    c.fit = Math.sqrt(s / n); c.aligned = true;
    return true;
  }
  $('bCmpAlign').addEventListener('click', function () {
    if (!S.cmp || busy) return;
    if (alignByPoints()) runDeviation();
  });
  $('bCmpIcp').addEventListener('click', async function () {
    const c = S.cmp;
    if (!c || busy) return;
    // start from the user's points: the automatic fit only refines a rough alignment
    if (!c.aligned && !alignByPoints()) { flash(L('Hãy bấm ít nhất 3 cặp điểm tương ứng trước để app có vị trí ban đầu', 'Click at least 3 matching point pairs first so the app has a starting position')); return; }
    setBusy(true, L('Đang tinh chỉnh vị trí (ICP)...', 'Refining the alignment (ICP)...'));
    try {
      const r = await run('icp', { b: worldMesh(c.b), a: worldMesh(c.a) }, setProgress);
      pushUndo(); moveB(r.matrix); c.icpRms = r.rms;
    } catch (e) { showError(e); }
    setBusy(false);
    runDeviation();
  });
  $('bCmpDev').addEventListener('click', runDeviation);
  $('bCmpView').addEventListener('click', function () {
    const c = S.cmp;
    if (!c || busy) return;
    c.split = !c.split;
    if (c.split && c.sync) {
      // after alignment both windows share one camera so they turn together
      for (let i = 0; i < 2; i++) { c.cams[i] = { R: mainCam.R.slice(), x: i * W / 2, w: W / 2 }; fitCam(c.cams[i], unionBox([c.a, c.b], false)); }
    }
    cam = mainCam; setTool('select'); refresh(); updateCmpUI(); flash('');
  });
  // picture of the 3D view (both windows when side by side) -> clipboard, or a PNG download if the clipboard is refused
  function shot() {
    S.clean = !!(S.cmp && S.cmp.split);
    dirty = false; render(); S.clean = false;
    const dpr = window.devicePixelRatio || 1, c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0); g.drawImage(ov, 0, 0);
    const cm = S.cmp;
    if (cm && cm.dev) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = 96, y = H - 96, w = 260;
      g.fillStyle = 'rgba(14,18,22,0.85)'; g.fillRect(x - 10, y - 24, w + 20, 82);
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      [[0, '#2850ff'], [0.25, '#28d2ff'], [0.5, '#3cdc6e'], [0.75, '#ffe628'], [1, '#ff3232']].forEach(function (s) { gr.addColorStop(s[0], s[1]); });
      g.fillStyle = '#ffffff'; g.font = '12px "Segoe UI", Arial, sans-serif';
      g.fillText(cm.b.name + L(' so với ', ' vs ') + cm.a.name + ' (mm)', x, y - 8);
      g.fillStyle = gr; g.fillRect(x, y, w, 12);
      g.fillStyle = '#ffffff';
      g.fillText('−' + f2(cm.range), x, y + 27); g.textAlign = 'center'; g.fillText('0', x + w / 2, y + 27); g.textAlign = 'right'; g.fillText('+' + f2(cm.range), x + w, y + 27); g.textAlign = 'left';
      g.fillText('max +' + f2(Math.max(0, cm.dev.max), 3) + '   min ' + f2(Math.min(0, cm.dev.min), 3) + '   RMS ' + f2(cm.dev.rms, 3), x, y + 46);
    }
    c.toBlob(function (blob) {
      const fallback = function () { download([blob], 'mrt_view.png'); flash(L('Trình duyệt không cho ghi clipboard: đã tải file mrt_view.png', 'Clipboard not allowed by the browser: mrt_view.png downloaded instead')); };
      try {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () { flash(L('Đã chép ảnh vào clipboard, dán bằng Ctrl+V', 'Image copied to the clipboard, paste with Ctrl+V')); }, fallback);
      } catch (e) { fallback(); }
    }, 'image/png');
    dirty = true;
  }
  $('bCmpShot').addEventListener('click', shot);
  $('bShot').addEventListener('click', shot);
  $('cmpRange').addEventListener('change', function () { if (S.cmp && S.cmp.dev) colorDeviation(); });
  $('bCmpEnd').addEventListener('click', function () {
    const c = S.cmp;
    if (!c || busy) return;
    for (const v of c.vis) if (S.bodies.indexOf(v[0]) >= 0) v[0].visible = v[1];
    S.cmp = null; cam = mainCam;
    clearAna(); updateExplode(); sceneChanged(true); refresh(); updateCmpUI(); flash('');
  });

  // ================= export =================
  function download(parts, filename) {
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }
  function safe(n) { return n.replace(/[\\/:*?"<>|]/g, '_'); }
  function zipBodies(list, name) {
    download(core.zipStore(list.map(function (b) { return { name: safe(b.name) + '.stl', data: core.writeSTL(worldMesh(b), b.name) }; })), name);
  }
  $('bStl').addEventListener('click', function () {
    const l = needSel();
    try {
      if (l.length === 1) download([core.writeSTL(worldMesh(l[0]), l[0].name)], safe(l[0].name) + '.stl');
      else if (l.length) zipBodies(l, 'bodies_selected.zip');
    } catch (e) { showError(e); }
  });
  $('bZip').addEventListener('click', function () {
    const l = visibleBodies();
    try { if (!l.length) flash(L('Chưa có body nào đang hiện', 'No visible body')); else zipBodies(l, 'bodies.zip'); } catch (e) { showError(e); }
  });
  $('bMerge').addEventListener('click', function () {
    const s = selBodies(), l = s.length ? s : visibleBodies();
    if (!l.length) { flash(L('Chưa có body nào', 'No body')); return; }
    try {
      download([core.writeSTL(concatMeshes(l), 'merged')], 'merged.stl');
    } catch (e) { showError(e); }
  });

  // ================= session (.mrtl) =================
  function saveSession() {
    const vis = S.cmp ? new Map(S.cmp.vis) : null;
    const meta = { app: 'MrT Decimate Mesh', format: 2, view: { R: mainCam.R, target: mainCam.target, zoom: mainCam.zoom }, explode: S.explode, sketches: S.sketches, skSeq: S.skSeq, geos: S.geos, geoSeq: S.geoSeq,
      section: { on: S.sec.on, flip: S.sec.flip, axis: S.sec.axis, s: S.sec.s, nView: S.sec.nView, nPick: S.sec.nPick }, measures: S.measures, bodies: [] };
    const blobs = [], geos = new Map();
    let off = 0;
    for (const b of S.bodies) {
      let g = geos.get(b.geo);
      if (!g) {
        g = { pos: off, nv: b.geo.positions.length / 3, idx: off + b.geo.positions.byteLength, nt: b.geo.indices.length / 3 };
        blobs.push(b.geo.positions, b.geo.indices);
        off += b.geo.positions.byteLength + b.geo.indices.byteLength;
        geos.set(b.geo, g);
      }
      meta.bodies.push({ name: b.name, color: b.color, opacity: b.opacity, visible: vis && vis.has(b) ? vis.get(b) : b.visible, matrix: b.matrix, matrix0: b.matrix0,
        material: b.material, density: b.density, solid: b.solid || null, sel: S.sel.has(b), pos: g.pos, nv: g.nv, idx: g.idx, nt: g.nt });
    }
    let json = JSON.stringify(meta);
    let bytes = new TextEncoder().encode(json);
    if (bytes.length % 4) { json += '   '.slice(0, 4 - bytes.length % 4); bytes = new TextEncoder().encode(json); }
    const head = new DataView(new ArrayBuffer(12));
    head.setUint8(0, 77); head.setUint8(1, 82); head.setUint8(2, 84); head.setUint8(3, 76); // "MRTL"
    head.setUint32(4, 2, true); head.setUint32(8, bytes.length, true);
    download([head.buffer, bytes].concat(blobs), 'session.mrtl');
  }
  function loadSession(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength < 12 || dv.getUint32(0, false) !== 0x4D52544C) throw new Error(L('File .mrtl không hợp lệ', 'Invalid .mrtl file'));
    const len = dv.getUint32(8, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, len))), base = 12 + len;
    clearAll();
    const geos = new Map();
    for (const o of meta.bodies) {
      let g = geos.get(o.pos);
      if (!g) {
        g = makeGeo(new Float32Array(buf.slice(base + o.pos, base + o.pos + o.nv * 12)), new Uint32Array(buf.slice(base + o.idx, base + o.idx + o.nt * 12)));
        geos.set(o.pos, g);
      }
      const b = addBody(o.name, g, o);
      if (o.sel) S.sel.add(b);
    }
    S.explode = meta.explode || 0; $('expl').value = Math.round(S.explode * 100); $('explV').textContent = $('expl').value + '%';
    if (meta.section) { Object.assign(S.sec, meta.section); $('secOn').checked = S.sec.on; $('secFlip').checked = S.sec.flip; $('secAx').value = S.sec.axis; $('secPos').value = Math.round(S.sec.s * 1000); }
    S.measures = (meta.measures || []).filter(function (m) { return m.v !== undefined || m.r !== undefined; });
    S.sketches = meta.sketches || []; S.skSeq = meta.skSeq || S.sketches.length + 1;
    S.geos = meta.geos || []; S.geoSeq = meta.geoSeq || S.geos.length + 1; S.geoSel = null;
    updateExplode(); sceneChanged(true);
    if (meta.view) { mainCam.R = meta.view.R; mainCam.target = meta.view.target; mainCam.zoom = meta.view.zoom; }
    hist.undo.length = 0; hist.redo.length = 0; updateHistBtns();
    updateMeasList(); refresh();
  }
  function clearAll() {
    for (const b of S.bodies.slice()) removeBody(b);
    S.measures = []; S.tmp = []; S.clip = []; S.colorSeq = 0; S.col = null; S.spl = null; S.sketches = []; S.skSel = null; S.geos = []; S.geoSel = null; S.geoSeq = 1;
    resetBox('colRes'); resetBox('splitRes'); resetBox('holeRes'); updateMeasList();
  }
  $('bSaveSes').addEventListener('click', function () { try { saveSession(); } catch (e) { showError(e); } });
  $('bOpen').addEventListener('click', function () { $('file').click(); });
  $('bClear').addEventListener('click', function () {
    if (blocked() || !confirm(L('Xóa toàn bộ body và phép đo trong phiên này?', 'Remove every body and measurement in this session?'))) return;
    pushUndo(); clearAll(); sceneChanged(true); refresh();
  });

  // ================= file loading =================
  async function handleFiles(files) {
    if (!files.length || blocked()) return;
    showError(null);
    setBusy(true, L('Đang đọc file...', 'Reading files...'));
    let added = 0, pushed = false;
    for (let i = 0; i < files.length; i++) {
      const file = files[i], ext = (file.name.split('.').pop() || '').toLowerCase();
      $('busyText').textContent = L('Đang đọc ', 'Reading ') + file.name + ' (' + (i + 1) + '/' + files.length + ')...';
      try {
        const buffer = await file.arrayBuffer();
        if (ext === 'mrtl') {
          if (S.bodies.length && !confirm(L('Mở phiên "' + file.name + '" sẽ thay thế phiên hiện tại. Tiếp tục?', 'Opening session "' + file.name + '" replaces the current one. Continue?'))) continue;
          loadSession(buffer); added = 0; pushed = true;
        } else if (ext === 'stl' || ext === 'obj') {
          const m = await run('parse', { name: file.name, buffer: buffer });
          if (!pushed) { pushUndo(); pushed = true; }
          addBody(safe(file.name.replace(/\.[^.]+$/, '')), makeGeo(m.positions, m.indices));
          added++;
        } else showError(L('Bỏ qua "' + file.name + '": chỉ hỗ trợ .stl, .obj, .mrtl', 'Skipped "' + file.name + '": only .stl, .obj, .mrtl are supported'));
      } catch (e) { showError(file.name + ': ' + (e.message || e)); }
      setProgress((i + 1) / files.length);
    }
    setBusy(false);
    if (added) {
      let nt = 0; for (const b of S.bodies) nt += b.geo.indices.length / 3;
      if (nt > 500000) $('cWire').checked = false;
      updateExplode(); sceneChanged(true); refresh();
    }
  }
  $('drop').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () { const f = Array.from(this.files); this.value = ''; handleFiles(f); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); $('leftTop').classList.add('over'); });
  window.addEventListener('dragleave', function () { $('leftTop').classList.remove('over'); });
  window.addEventListener('drop', function (e) { e.preventDefault(); $('leftTop').classList.remove('over'); handleFiles(Array.from(e.dataTransfer.files)); });

/*MODEL*/
  applyLang(); updateHistBtns(); sceneChanged(true);
  requestAnimationFrame(frame);
  window.__mrt = { S: S, core: core, geoAt: function (x, y) { return geoAt(x, y); }, skPlaneEnt: function (x, y) { return skPlaneEnt(x, y); }, originGeos: function () { return originGeos(); }, boolEngine: function () { return mfLib ? 'manifold' : mfTried ? 'built-in' : 'not started'; }, boolRun: boolRun, project: project, arc: GIZ_ARC, cam: function () { return mainCam; }, projectWith: function (c, p) { const s0 = cam; cam = c; const q = project(p); cam = s0; return q; } }; // for debugging from the console
})();
