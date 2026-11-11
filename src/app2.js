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
    measures: [], tmp: [], clip: [], giz: null, colorSeq: 0, idSeq: 1, cmp: null, col: null, spl: null
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
      material: o.material || '', density: o.density || 0, off: [0, 0, 0], ana: null, stats: null
    };
    if (o.index === undefined) S.bodies.push(b); else S.bodies.splice(o.index, 0, b);
    return b;
  }
  function releaseGeo(g) {
    if (!g || !g.gl || !gl) return;
    for (const b of S.bodies) if (b.geo === g) return;
    gl.deleteVertexArray(g.gl.vao); gl.deleteVertexArray(g.gl.vaoL);
    gl.deleteBuffer(g.gl.pos); gl.deleteBuffer(g.gl.idx); if (g.gl.line) gl.deleteBuffer(g.gl.line);
    g.gl = null;
  }
  function freeAna(b) {
    if (b.ana && gl) { gl.deleteVertexArray(b.ana.vao); gl.deleteBuffer(b.ana.pb); gl.deleteBuffer(b.ana.cb); }
    b.ana = null;
  }
  function setGeo(b, geo) { const old = b.geo; b.geo = geo; freeAna(b); b.stats = null; releaseGeo(old); }
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
          visible: vis && vis.has(b) ? vis.get(b) : b.visible, material: b.material, density: b.density };
      }),
      sel: selBodies().map(function (b) { return b.id; }), measures: JSON.parse(JSON.stringify(S.measures))
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
      'if(uMode==1){o=vec4(0.03,0.05,0.08,uColor.a);return;}' +
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
  function fitCam(c, bb) {
    c.center = boxCenter(bb); c.radius = Math.max(1e-6, 0.5 * V.len(V.sub(bb.max, bb.min)));
    c.target = c.center.slice(); c.zoom = c.radius * 1.12 / Math.min(1, c.w / H);
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
    if (edges) {
      ensureLines(b.geo);
      gl.uniform1i(U.uMode, 1); gl.uniform4f(U.uColor, 0, 0, 0, alpha < 1 ? alpha * 0.5 : 1);
      gl.bindVertexArray(g.vaoL); gl.drawElements(gl.LINES, g.nLine, gl.UNSIGNED_INT, 0);
    }
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
        for (const b of S.bodies) if (b.visible) (alphaOf(b) >= 0.999 ? opaque : trans).push(b);
        for (const b of opaque) drawBody(b, edges, false);
        if (trans.length) {
          const w = viewer();
          trans.sort(function (a, b) { return V.dot(boxCenter(bodyBox(a, true)), w) - V.dot(boxCenter(bodyBox(b, true)), w); });
          gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
          for (const b of trans) drawBody(b, edges, false);
          gl.depthMask(true); gl.disable(gl.BLEND);
        }
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
  function dot2(p, color, r) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], r || 3.5, 0, 6.2832); ctx.fill(); }
  function line2(a, b, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w || 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
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
      const Ln = Math.max(cam.radius * 0.45, 1e-6), o = project([0, 0, 0]);
      for (let i = 0; i < 3; i++) {
        const e = project(V.mul(AXES[i], Ln));
        line2(o, e, AXC[i], 2);
        ctx.fillStyle = AXC[i]; ctx.font = 'bold 12px Arial'; ctx.fillText(AXN[i], e[0] + 4, e[1] - 4);
      }
      dot2(o, '#ffffff', 3);
    }
    drawTriad(44, H - 70);
    // measurements
    const MC = '#5fe0ff';
    for (const m of S.measures) {
      const q = m.pts.map(project), lb = measLabel(m);
      if (m.type === 'dist' || m.type === 'thick') {
        line2(q[0], q[1], m.type === 'thick' ? '#ffcf5a' : MC, 2);
        label((q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2, lb, m.type === 'thick' ? '#ffcf5a' : null);
      } else if (m.type === 'angle') {
        line2(q[1], q[0], MC, 2); line2(q[1], q[2], MC, 2); label(q[1][0], q[1][1], lb);
      } else if (m.type === 'radius') {
        const u = V.norm(V.sub(m.pts[0], m.c)), v = V.cross(m.n, u);
        ctx.strokeStyle = MC; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let k = 0; k <= 64; k++) {
          const a = k / 64 * 6.2832, p = project(V.add(m.c, V.add(V.mul(u, Math.cos(a) * m.r), V.mul(v, Math.sin(a) * m.r))));
          if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        }
        ctx.stroke();
        const c = project(m.c);
        line2(c, q[0], MC, 1.5); dot2(c, MC, 3); label(c[0], c[1], lb);
      }
      for (const p of q) dot2(p, '#ffffff', 3);
    }
    for (const p of S.tmp) dot2(project(p), '#ffcf5a', 4.5);
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
      const pv = boxCenter(unionBox(sel, true)), p = project(pv), Lw = 80 * 2 * cam.zoom / H, ends = [];
      for (let i = 0; i < 3; i++) {
        const e = project(V.add(pv, V.mul(AXES[i], Lw)));
        ends.push(e);
        line2(p, e, AXC[i], 3);
        ctx.fillStyle = AXC[i]; ctx.strokeStyle = AXC[i]; ctx.lineWidth = 2.5;
        if (S.tool === 'move') { ctx.beginPath(); ctx.arc(e[0], e[1], 6.5, 0, 6.2832); ctx.fill(); }
        else if (S.tool === 'rotate') { ctx.beginPath(); ctx.arc(e[0], e[1], 7, 0, 6.2832); ctx.stroke(); }
        else ctx.fillRect(e[0] - 6, e[1] - 6, 12, 12);
        ctx.font = 'bold 12px Arial'; ctx.fillText(AXN[i], e[0] + 10, e[1] - 8);
      }
      if (S.tool !== 'rotate') { dot2(p, '#ffffff', 6); dot2(p, '#14181d', 3); } else dot2(p, '#ffffff', 3);
      S.giz = { p: p, ends: ends, Lw: Lw };
    }
  }

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
      move: L('Kéo tay nắm X / Y / Z để di chuyển, chấm giữa để di chuyển tự do (giữ Shift: bước 1 mm), hoặc nhập số ở bảng nhỏ', 'Drag an X / Y / Z handle to move, the centre dot to move freely (hold Shift: 1 mm steps), or type values in the small panel'),
      rotate: L('Kéo tay nắm X / Y / Z để xoay quanh trục đó (giữ Shift: bước 1°), hoặc nhập số ở bảng nhỏ', 'Drag an X / Y / Z handle to rotate about that axis (hold Shift: 1° steps), or type values in the small panel'),
      scale: L('Kéo tay nắm X / Y / Z để đổi tỉ lệ theo trục, chấm giữa để đổi đồng đều (giữ Shift: tỉ lệ nguyên), hoặc nhập số ở bảng nhỏ', 'Drag an X / Y / Z handle to scale along that axis, the centre dot to scale uniformly (hold Shift: whole factors), or type values in the small panel'),
      dist: L('Bấm 2 điểm trên mesh', 'Click 2 points on the mesh'),
      angle: L('Bấm 3 điểm: điểm thứ hai là đỉnh góc', 'Click 3 points: the second is the angle vertex'),
      radius: L('Bấm 3 điểm trên cùng một cung tròn', 'Click 3 points on the same arc'),
      thick: L('Bấm vào một điểm trên mesh để đo bề dày tại đó', 'Click a point on the mesh to measure the wall thickness there'),
      secpick: L('Bấm vào một mặt trên mesh để lấy làm mặt cắt', 'Click a face on the mesh to use it as the section plane')
    }[t] || '';
  }
  function setTool(t) {
    if (S.cmp && S.cmp.split) t = 'select';
    S.tool = t; S.tmp = [];
    document.querySelectorAll('#tools [data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); });
    $('tpop').style.display = (t === 'move' || t === 'rotate' || t === 'scale') ? 'block' : 'none';
    $('tpMove').style.display = t === 'move' ? 'flex' : 'none'; $('tpRot').style.display = t === 'rotate' ? 'flex' : 'none';
    $('tpScale').style.display = t === 'scale' ? 'flex' : 'none'; $('tpPivot').style.display = t === 'rotate' || t === 'scale' ? 'flex' : 'none';
    canvas.style.cursor = (t === 'select' || t === 'move' || t === 'rotate' || t === 'scale') ? 'default' : 'crosshair';
    if ((t === 'move' || t === 'rotate' || t === 'scale') && !S.sel.size) flash(L('Hãy tick chọn body trước', 'Tick a body first'));
    else flash(toolHint(t), !!toolHint(t));
    dirty = true;
  }
  function select(list, add) {
    if (!add) S.sel.clear();
    for (const b of list) { if (add && S.sel.has(b)) S.sel.delete(b); else S.sel.add(b); }
    refresh();
  }
  function refresh() { updateList(); updateInfo(); syncCounts(true); dirty = true; }
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
      '</span><span class="num">' + L('Tam giác', 'Triangles') + '</span><span class="num">' + L('Khối lượng', 'Mass') + '</span>';
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
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = b.name; nm.title = b.name;
      nm.addEventListener('dblclick', function (e) { e.stopPropagation(); renameBody(b); });
      const ct = document.createElement('span'); ct.className = 'num'; ct.textContent = fmtN(b.geo.indices.length / 3);
      const ms = document.createElement('span'); ms.className = 'num'; ms.textContent = b.density > 0 ? massTxt(getStats(b).volume / 1000 * b.density) : '-';
      row.appendChild(cs); row.appendChild(cv); row.appendChild(chip); row.appendChild(nm); row.appendChild(ct); row.appendChild(ms);
      row.addEventListener('click', function (e) { if (!blocked()) select([b], e.ctrlKey || e.metaKey || e.shiftKey); });
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
    if (!sel.length) {
      let nt = 0; for (const b of S.bodies) nt += b.geo.indices.length / 3;
      rows.push([L('Số body', 'Bodies'), fmtN(S.bodies.length)], [L('Tổng tam giác', 'Total triangles'), fmtN(nt)], ['', L('Tick một body để xem chi tiết', 'Tick a body for details')]);
    } else if (sel.length === 1) {
      const b = sel[0], s = getStats(b);
      const tp = b.geo.topo || (b.geo.topo = core.topology(b.geo.indices, b.geo.positions.length / 3)), closed = tp.border === 0 && tp.nonManifold === 0;
      rows.push([L('Tên', 'Name'), b.name], [L('Tam giác', 'Triangles'), fmtN(b.geo.indices.length / 3)], [L('Đỉnh', 'Vertices'), fmtN(b.geo.positions.length / 3)],
        [L('Kích thước bao', 'Bounding box'), dim(s.min, s.max)], [L('Diện tích bề mặt', 'Surface area'), f2(s.area / 100) + ' cm²'],
        [L('Thể tích', 'Volume'), f2(s.volume / 1000, 3) + ' cm³'],
        [L('Lưới', 'Mesh'), closed ? L('kín', 'closed') : [tp.border ? L('hở, ', 'open, ') + fmtN(tp.border) + L(' cạnh biên', ' boundary edges') : '', tp.nonManifold ? fmtN(tp.nonManifold) + L(' cạnh non-manifold', ' non-manifold edges') : ''].filter(Boolean).join('; ')],
        [L('Khối lượng', 'Mass'), b.density > 0 ? massTxt(s.volume / 1000 * b.density) + (closed ? '' : L(' (không tin cậy: lưới không kín)', ' (unreliable: mesh not closed)')) : L('chưa gán vật liệu', 'no material')]);
    } else {
      let nt = 0, vol = 0, mass = 0, noMat = 0;
      for (const b of sel) { const s = getStats(b); nt += b.geo.indices.length / 3; vol += s.volume; if (b.density > 0) mass += s.volume / 1000 * b.density; else noMat++; }
      const bb = unionBox(sel, false);
      rows.push([L('Đang tick', 'Ticked'), fmtN(sel.length) + ' body'], [L('Tổng tam giác', 'Total triangles'), fmtN(nt)], [L('Kích thước bao', 'Bounding box'), dim(bb.min, bb.max)],
        [L('Tổng thể tích', 'Total volume'), f2(vol / 1000, 3) + ' cm³'], [L('Tổng khối lượng', 'Total mass'), massTxt(mass) + (noMat ? ' (' + noMat + L(' body chưa gán vật liệu)', ' bodies without material)') : '')]);
    }
    tb.innerHTML = '';
    for (const r of rows) { const tr = tb.insertRow(); tr.insertCell().textContent = r[0]; tr.insertCell().textContent = r[1]; }
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
    fillMats(); updateMeasList(); refresh(); updateCmpUI(); updateSplitUI();
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
  function pivotPoint(list) { return $('pivot').value === 'o' ? [0, 0, 0] : boxCenter(unionBox(list, false)); }
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
  $('bMove').addEventListener('click', function () { applyTransform(function () { return M.trans([+$('mvX').value || 0, +$('mvY').value || 0, +$('mvZ').value || 0]); }); });
  $('bRot').addEventListener('click', function () {
    applyTransform(function (list) { return M.about(pivotPoint(list), M.rot(AXES[+$('rotAx').value], (+$('rotA').value || 0) * Math.PI / 180)); });
  });
  $('bScale').addEventListener('click', function () {
    applyTransform(function (list) {
      const x = +$('scX').value, y = $('scUni').checked ? x : +$('scY').value, z = $('scUni').checked ? x : +$('scZ').value;
      if (!x || !y || !z) { flash(L('Hệ số tỉ lệ phải khác 0', 'Scale factors must not be 0')); return null; }
      return M.about(pivotPoint(list), M.scale([x, y, z]));
    });
  });
  $('scUni').addEventListener('change', function () { $('scY').disabled = $('scZ').disabled = this.checked; });
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
    if (S.tool !== 'rotate' && Math.hypot(px - g.p[0], py - g.p[1]) < 9) return -1;
    let best = null, bd = 1e9;
    for (let i = 0; i < 3; i++) {
      const e = g.ends[i], ax = e[0] - g.p[0], ay = e[1] - g.p[1], l2 = ax * ax + ay * ay;
      let d = Math.hypot(px - e[0], py - e[1]) - 5;
      if (l2 > 1) { const t = Math.max(0, Math.min(1, ((px - g.p[0]) * ax + (py - g.p[1]) * ay) / l2)); d = Math.min(d, Math.hypot(px - g.p[0] - t * ax, py - g.p[1] - t * ay)); }
      if (d < 6 && d < bd) { bd = d; best = i; }
    }
    return best;
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
        d = V.mul(AXES[i], s); txt = 'Δ' + AXN[i] + ' = ' + f2(s) + ' mm';
      }
      $('mvX').value = +f2(d[0], 3); $('mvY').value = +f2(d[1], 3); $('mvZ').value = +f2(d[2], 3);
      A = M.trans(d);
    } else if (S.tool === 'rotate') {
      let ang;
      if (al >= 6) ang = (dx * -a2[1] + dy * a2[0]) / al * 0.5;
      else {
        ang = -(Math.atan2(py - dr.p[1], px - dr.p[0]) - Math.atan2(dr.y0 - dr.p[1], dr.x0 - dr.p[0])) * 180 / Math.PI;
        if (V.dot(AXES[i], viewer()) < 0) ang = -ang;
      }
      if (shift) ang = Math.round(ang);
      $('rotAx').value = i; $('rotA').value = +f2(ang, 2);
      A = M.about(dr.pivot, M.rot(AXES[i], ang * Math.PI / 180)); txt = L('Xoay quanh ', 'Rotate about ') + AXN[i] + ' = ' + f2(ang, 1) + '°';
    } else {
      const s = i < 0 ? dx - dy : (al < 6 ? dx : (dx * a2[0] + dy * a2[1]) / al);
      let f = Math.exp(s * 0.006);
      if (shift) f = f >= 1 ? Math.max(1, Math.round(f)) : 1 / Math.max(1, Math.round(1 / f));
      $('scUni').checked = i < 0; $('scY').disabled = $('scZ').disabled = i < 0;
      $('scX').value = +f2(i < 0 || i === 0 ? f : 1, 4); $('scY').value = +f2(i < 0 || i === 1 ? f : 1, 4); $('scZ').value = +f2(i < 0 || i === 2 ? f : 1, 4);
      const sv = i < 0 ? [f, f, f] : [i === 0 ? f : 1, i === 1 ? f : 1, i === 2 ? f : 1];
      A = M.about(dr.pivot, M.scale(sv)); txt = L('Tỉ lệ ', 'Scale ') + (i < 0 ? L('đồng đều', 'uniform') : AXN[i]) + ' = ' + f2(f, 3);
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
    if (e.button === 2) drag = { type: e.ctrlKey ? 'pan' : 'rot', x: p[0], y: p[1], x0: p[0], y0: p[1], cam: cam };
    else if (e.button === 1) drag = { type: 'pan', x: p[0], y: p[1], x0: p[0], y0: p[1], cam: cam };
    else if (e.button === 0) {
      const h = gizmoActive() ? hitGizmo(p[0], p[1]) : null;
      if (h !== null) {
        const list = selBodies(), start = new Map();
        for (const b of list) start.set(b, b.matrix.slice());
        drag = { type: 'giz', axis: h, x0: p[0], y0: p[1], start: start, list: list, p: S.giz.p, Lw: S.giz.Lw, cam: cam,
          a2: h < 0 ? [1, 0] : [S.giz.ends[h][0] - S.giz.p[0], S.giz.ends[h][1] - S.giz.p[1]],
          pivot: S.tool === 'move' ? [0, 0, 0] : pivotPoint(list), moved: false };
      } else drag = { type: 'click', x0: p[0], y0: p[1], cam: cam };
    }
    cam = mainCam;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const p = evPos(e);
    cam = drag.cam;
    if (drag.type === 'rot') { rotateView((p[0] - drag.x) * 0.008, (p[1] - drag.y) * 0.008); drag.x = p[0]; drag.y = p[1]; }
    else if (drag.type === 'pan') {
      const k = 2 * cam.zoom / H;
      cam.target = V.add(cam.target, V.add(V.mul(right(), -(p[0] - drag.x) * k), V.mul(up(), (p[1] - drag.y) * k)));
      drag.x = p[0]; drag.y = p[1]; dirty = true;
    } else if (drag.type === 'giz') gizmoDrag(drag, p[0], p[1], e.shiftKey);
    else if (drag.type === 'click' && boxAllowed() && Math.hypot(p[0] - drag.x0, p[1] - drag.y0) >= 4) drag.type = 'box';
    if (drag.type === 'box') { S.box = { x0: drag.x0, y0: drag.y0, x1: p[0], y1: p[1] }; dirty = true; }
    syncCams(cam);
    cam = mainCam;
  });
  canvas.addEventListener('pointerup', function (e) {
    const d = drag; drag = null;
    if (!d) return;
    const p = evPos(e), still = Math.hypot(p[0] - d.x0, p[1] - d.y0) < 4;
    cam = d.cam;
    if (d.type === 'giz') { if (d.moved) { commitTransform(d.list); flash(toolHint(S.tool), true); } }
    else if (d.type === 'box') { S.box = null; cam = mainCam; boxSelect(d.x0, d.y0, p[0], p[1], e.ctrlKey || e.metaKey || e.shiftKey); }
    else if (d.type === 'click' && still) onClick(p[0], p[1], e);
    else if (d.type === 'rot' && still && e.button === 2 && !(S.cmp && S.cmp.split)) { const h = pick(p[0], p[1]); openMenu(e.clientX, e.clientY, h ? h.body : null); }
    cam = mainCam;
  });
  canvas.addEventListener('pointercancel', function () { drag = null; S.box = null; cam = mainCam; dirty = true; });
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
    if (add) { for (const h of hit) S.sel.add(h); refresh(); } else select(hit, false);
  }
  function onClick(px, py, e) {
    if (S.cmp && S.cmp.split) {
      const i = px < W / 2 ? 0 : 1, h = pickNear(px, py, [i ? S.cmp.b : S.cmp.a]);
      if (!h) { flash(L('Không trúng mesh', 'No mesh under the cursor')); return; }
      (i ? S.cmp.pb : S.cmp.pa).push(snapPoint(h, px, py));
      updateCmpUI(); dirty = true;
      return;
    }
    const t = S.tool;
    if (t === 'dist' || t === 'angle' || t === 'radius' || t === 'thick' || t === 'secpick') {
      const h = pickNear(px, py);
      if (!h) { flash(L('Không trúng mesh nào', 'No mesh under the cursor')); return; }
      if (t === 'thick') { measureThickness(h); return; }
      if (t === 'secpick') {
        const sc = S.sec;
        sc.nPick = h.normal; sc.axis = 'pick'; $('secAx').value = 'pick'; sc.on = true; $('secOn').checked = true;
        updateSection();
        sc.s = Math.max(0, Math.min(1, (V.dot(h.normal, h.point) - sc.min) / (sc.max - sc.min)));
        $('secPos').value = Math.round(sc.s * 1000);
        updateSection(); setTool('select'); return;
      }
      S.tmp.push(snapPoint(h, px, py));
      if (S.tmp.length === (t === 'dist' ? 2 : 3)) { addMeasure(t, S.tmp); S.tmp = []; }
      dirty = true;
      return;
    }
    if (S.cmp) return;
    const h = pick(px, py), multi = e.ctrlKey || e.metaKey || e.shiftKey;
    if (h) select([h.body], multi); else if (!multi) select([], false);
  }

  window.addEventListener('keydown', function (e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') closeMenu();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { setTool('select'); flash(''); }
    else if (e.key === 'Delete') deleteSelected();
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
  document.querySelectorAll('#tools [data-tool]').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  document.querySelectorAll('#cube div').forEach(function (d) { d.addEventListener('click', function () { setView(d.dataset.v); }); });
  $('bFit').addEventListener('click', function () { sceneChanged(true); });
  $('bIso').addEventListener('click', function () { setView('iso'); });
  ['cWire', 'cAxes'].forEach(function (id) { $(id).addEventListener('change', function () { dirty = true; }); });
  $('cInfo').addEventListener('change', updateInfo);
  window.addEventListener('resize', function () { dirty = true; });

  // ================= context menu =================
  function closeMenu() { $('ctx').style.display = 'none'; }
  function openMenu(x, y, body) {
    if (S.cmp || busy) return;
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
        [L('Tách body', 'Split'), function () { $('bSplit').click(); }],
        [L('Tách: phương án kế ▶', 'Split: next option ▶'), function () { $('bSplitNext').click(); }],
        [L('Gộp body tick', 'Merge ticked bodies'), joinSelected],
        [L('Phân tích undercut', 'Undercut analysis'), function () { $('bUc').click(); }]);
      if (n >= 2) items.push([L('Kiểm tra va chạm', 'Collision check'), function () { $('bCol').click(); }]);
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
    if (m.type === 'dist') return f2(m.v) + ' mm';
    if (m.type === 'angle') return f2(m.v, 1) + '°';
    if (m.type === 'radius') return 'R ' + f2(m.r);
    return 't = ' + f2(m.v) + ' mm';
  }
  function measText(m) {
    if (m.type === 'dist') return L('Khoảng cách: ', 'Distance: ') + f2(m.v) + ' mm (ΔX ' + f2(m.d[0]) + ', ΔY ' + f2(m.d[1]) + ', ΔZ ' + f2(m.d[2]) + ')';
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
    S.measures.push(m);
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
    if (!S.measures.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L('Chọn công cụ đo phía trên màn hình 3D rồi bấm vào mesh.', 'Pick a measuring tool above the 3D view, then click on the mesh.'); box.appendChild(e); return; }
    S.measures.forEach(function (m, i) {
      const row = document.createElement('div'); row.className = 'item';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (i + 1) + '. ' + measText(m); nm.title = measText(m);
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
      x.addEventListener('click', function () { if (!S.cmp) pushUndo(); S.measures.splice(i, 1); updateMeasList(); dirty = true; });
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
  $('ucAx').addEventListener('change', function () { $('ucVecRow').style.display = this.value === 'custom' ? 'flex' : 'none'; });
  $('ucBright').addEventListener('input', function () { $('ucBrightV').textContent = this.value + '%'; dirty = true; });
  $('bUcClr').addEventListener('click', function () { if (blocked()) return; clearAna(); $('ucRes').innerHTML = ucLegend(); });
  $('bUc').addEventListener('click', async function () {
    if (blocked()) return;
    const list = needSel();
    if (!list.length) return;
    const ax = $('ucAx').value;
    let dir = ax === 'x' ? [1, 0, 0] : ax === 'y' ? [0, 1, 0] : ax === 'z' ? [0, 0, 1] : ax === 'view' ? viewer() : [+$('ucX').value || 0, +$('ucY').value || 0, +$('ucZ').value || 0];
    if (V.len(dir) < 1e-12) { showError(L('Vector hướng mở khuôn không được bằng 0.', 'The pull direction vector must not be 0.')); return; }
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
    $('bCmpStart').closest('details').open = true;
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
    dirty = false; render();
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
    const meta = { app: 'MrT Decimate Mesh', format: 2, view: { R: mainCam.R, target: mainCam.target, zoom: mainCam.zoom }, explode: S.explode,
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
        material: b.material, density: b.density, sel: S.sel.has(b), pos: g.pos, nv: g.nv, idx: g.idx, nt: g.nt });
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
    updateExplode(); sceneChanged(true);
    if (meta.view) { mainCam.R = meta.view.R; mainCam.target = meta.view.target; mainCam.zoom = meta.view.zoom; }
    hist.undo.length = 0; hist.redo.length = 0; updateHistBtns();
    updateMeasList(); refresh();
  }
  function clearAll() {
    for (const b of S.bodies.slice()) removeBody(b);
    S.measures = []; S.tmp = []; S.clip = []; S.colorSeq = 0; S.col = null; S.spl = null;
    resetBox('colRes'); resetBox('splitRes'); updateMeasList();
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
  window.addEventListener('dragover', function (e) { e.preventDefault(); $('drop').classList.add('over'); });
  window.addEventListener('dragleave', function () { $('drop').classList.remove('over'); });
  window.addEventListener('drop', function (e) { e.preventDefault(); $('drop').classList.remove('over'); handleFiles(Array.from(e.dataTransfer.files)); });

  applyLang(); updateHistBtns(); sceneChanged(true);
  requestAnimationFrame(frame);
  window.__mrt = { S: S, project: project, cam: function () { return mainCam; }, projectWith: function (c, p) { const s0 = cam; cam = c; const q = project(p); cam = s0; return q; } }; // for debugging from the console
})();
