
  // ================= 6 views + Exploded view: drawing-style projections on a sheet =================
  // Each view is rendered off screen (WebGL2) into a depth image and a colour image; edges (B-rep edges, sharp mesh edges,
  // silhouettes) are traced with Canvas 2D where the depth image shows they are not covered. Views are drawn larger and scaled
  // down (anti-aliasing). The sheet window shows a live preview: views slide along their projection lines, the iso view, parts
  // of the exploded view and notes move freely; part names / materials are the bodies' own (edited here or in the body list).
  const V6_VIEWS = {   // in the drawing frame: d = looking direction, r = screen right, u = screen up (Z is up)
    front: { d: [0, 1, 0], r: [1, 0, 0], u: [0, 0, 1], vi: 'TRƯỚC', en: 'FRONT' },
    back: { d: [0, -1, 0], r: [-1, 0, 0], u: [0, 0, 1], vi: 'SAU', en: 'BACK' },
    left: { d: [1, 0, 0], r: [0, -1, 0], u: [0, 0, 1], vi: 'TRÁI', en: 'LEFT' },
    right: { d: [-1, 0, 0], r: [0, 1, 0], u: [0, 0, 1], vi: 'PHẢI', en: 'RIGHT' },
    top: { d: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], vi: 'TRÊN', en: 'TOP' },
    bottom: { d: [0, 0, 1], r: [1, 0, 0], u: [0, -1, 0], vi: 'DƯỚI', en: 'BOTTOM' }
  };
  const V6_ORDER = ['top', 'front', 'left', 'right', 'back', 'bottom'];
  const V6_PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
  const V6_MAXPX = 150e6, V6_MAXVIEW = 64e6;
  // the 6-view sheet and the exploded view are two separate drawings: each keeps its own panel values (cfg) and its own
  // placements (st: model turn, view / iso / part / totals positions); both are saved with the session (.mrtl)
  const V6S = { mode: '6v', R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], pos: null, iso: null, off: {}, tot: null, notes: { '6v': [], exp: [] }, nsel: null, nsels: [], clip: null, odo: {}, psel: null, rects: { '6v': [], exp: [] }, rsel: null, rt: null, hl: null,
    prev: null, fine: new Map(), seq: 1, cfg: null, st: { '6v': {}, exp: {} }, def: null, grp: {}, comb: null, dims: { '6v': [], exp: [] }, src: null, hide: [], dt: null, dsel: null, vsel: null, vz: 1, vp: [0, 0], lay: null, est: 0 };
  const V6_PREVPX = 12e6;
  const V6_REST = 3000;     // ms of rest after zoom / pan before the sheet is drawn sharp again   // the preview never renders the sheet above this many pixels (zooming further only scales)
  let v6Act = false;   // the Drawing Workspace is open and shows the sheet
  const V6_PAIRS = [['v6DpiR', 'v6Dpi'], ['v6WR', 'v6W'], ['v6HR', 'v6H'], ['v6LwR', 'v6Lw'], ['v6AngR', 'v6Ang'], ['v6QR', 'v6Q'], ['v6AzR', 'v6Az'], ['v6ElR', 'v6El'], ['v6ExR', 'v6Ex'],
    ['v6ZmR', 'v6Zm'], ['v6FsR', 'v6Fs'], ['v6NsR', 'v6Ns'], ['v6IsoKR', 'v6IsoK'], ['v6RsR', 'v6Rs'], ['v6RwR', 'v6Rw']];
  let v6gl = null;

  function v6Num(id, def) { const v = parseFloat($(id).value); return isFinite(v) ? v : def; }
  function v6Hex(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
  function v6Opt() {
    const views = {};
    document.querySelectorAll('.v6v').forEach(function (c) { views[c.dataset.v] = c.checked; });
    const dpi = Math.max(72, Math.min(1200, v6Num('v6Dpi', 300))), paper = $('v6Paper').value, exp = V6S.mode === 'exp';
    let W, H;
    if (paper === 'px') { W = Math.round(v6Num('v6W', 4000)); H = Math.round(v6Num('v6H', 2800)); }
    else { let mm = V6_PAPER[paper].slice(); if ($('v6Ori').value === 'P') mm = [mm[1], mm[0]]; W = Math.round(mm[0] / 25.4 * dpi); H = Math.round(mm[1] / 25.4 * dpi); }
    W = Math.max(100, W); H = Math.max(100, H);
    let cut = false;
    if (W * H > V6_MAXPX) { const k = Math.sqrt(V6_MAXPX / (W * H)); W = Math.floor(W * k); H = Math.floor(H * k); cut = true; }
    const fmt = $('v6Fmt').value, scv = $('v6Scale').value;
    const scale = scv === 'c' ? Math.max(1e-3, (parseFloat($('v6ScA').value) || 1) / (parseFloat($('v6ScB').value) || 1)) : parseFloat(scv) || 0;
    return { isoK: Math.max(0.1, Math.min(5, v6Num('v6IsoK', 100) / 100)), tot: exp && $('v6Tot').checked, exp: exp, views: views, iso: !exp && $('v6Iso').checked, az: v6Num('v6Az', 45), el: v6Num('v6El', 30), spread: v6Num('v6Ex', 0) / 100,
      pn: $('v6PN').checked, pm: $('v6PM').checked,
      col: $('v6Col').value, one: v6Hex($('v6One').value), light: $('v6Light').value, fine: $('v6Fine').checked,
      edge: $('v6Edge').checked, hidden: $('v6Hid').checked, ang: v6Num('v6Ang', 30), dim: !exp && ($('v6DimW').checked || $('v6DimD').checked || $('v6DimH').checked), dimW: $('v6DimW').checked, dimD: $('v6DimD').checked, dimH: $('v6DimH').checked, unit: $('v6Unit').value,
      lbl: !exp && $('v6Lbl').checked, scn: $('v6ScN').checked, scale: scale, zoom: v6Num('v6Zm', 100) / 100,
      fs: v6Num('v6Fs', 2.6), fb: $('v6Fb').checked, W: W, H: H, cut: cut, dpi: dpi,
      lw: v6Num('v6Lw', 0.25), ss: +$('v6SS').value || 1, fmt: fmt, q: v6Num('v6Q', 92) / 100, bg: fmt === 'jpg' ? 'w' : $('v6Bg').value };
  }
  // bodies of the drawing: the sheet's source bodies (Drawing Workspace), drawn from the geometry the sheet was last
  // updated to; a sheet without its own list follows the 3D view (shown bodies, or the picked ones)
  function v6Bodies() { return dwBodies(); }
  function v6Live() {
    const s = S.bodies.filter(function (b) { return b.visible && S.sel.has(b); });
    return s.length ? s : S.bodies.filter(function (b) { return b.visible; });
  }
  // drawing-frame direction expressed in model (world) coordinates
  function v6MV(v) { const R = V6S.R; return [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]]; }
  function v6Dirs(spec) { return { r: v6MV(spec.r), u: v6MV(spec.u), d: v6MV(spec.d) }; }
  // iso direction: turned az about the vertical, looking down el (az 0 / el 0 = Front)
  function v6IsoSpec(az, el) {
    const a = az * Math.PI / 180, e = el * Math.PI / 180, c = [Math.cos(e) * Math.sin(a), -Math.cos(e) * Math.cos(a), Math.sin(e)];
    const d = V.mul(c, -1), r = V.norm(V.cross(d, [0, 0, 1])), u = V.cross(r, d);
    return { d: d, r: r, u: u };
  }
  function v6mm(v) { return (Math.round(v * 10) / 10).toFixed(1) + ' mm'; }
  function v6in(v) { return (v / 25.4).toFixed(2) + ' in'; }
  function v6Txt(v, unit) { return unit === 'mm' ? v6mm(v) : unit === 'in' ? v6in(v) : v6mm(v) + '  (' + v6in(v) + ')'; }
  function v6Mat(b) { const m = MATS.find(function (x) { return x[0] === b.material; }); return m && m[0] ? (m[0] === 'custom' ? b.density + ' g/cm³' : (lang === 'en' ? m[2] : m[1])) : ''; }
  function v6Mass(b) { return b.density > 0 ? massTxt(getStats(b).volume / 1000 * b.density) : ''; }
  // two bodies have the same mass (or, without material, the same volume) within 0.5 %
  function v6Same(a, b) {
    const ka = a.density > 0, kb = b.density > 0; if (ka !== kb) return false;
    const ma = getStats(a).volume * (ka ? a.density : 1), mb = getStats(b).volume * (kb ? b.density : 1);
    return Math.abs(ma - mb) <= 0.005 * Math.max(Math.abs(ma), Math.abs(mb), 1e-9);
  }
  // combined parts: V6S.grp[leader id] = [member ids]; members are not drawn, the leader carries "xN"
  function v6GrpOf(ids) {
    const have = new Set(ids), hide = new Set(), n = {};
    for (const L in V6S.grp) {
      if (!have.has(+L)) continue;
      const m = V6S.grp[L].filter(function (id) { return have.has(id) && id !== +L; });
      m.forEach(function (id) { hide.add(id); }); n[L] = 1 + m.length;
    }
    return { hide: hide, n: n };
  }
  // "Tổng ABS 100 g" lines, one per material (custom materials grouped by density), in the order they first appear
  function v6Totals(bodies) {
    const g = new Map();
    for (const b of bodies) {
      if (!b.material || !(b.density > 0)) continue;
      const key = b.material === 'custom' ? 'c' + b.density : v6Mat(b);
      const e = g.get(key) || { n: b.material === 'custom' ? L('Tùy chọn ', 'Custom ') + b.density + ' g/cm³' : v6Mat(b), m: 0 };
      e.m += getStats(b).volume / 1000 * b.density; g.set(key, e);
    }
    return Array.from(g.values()).map(function (e) { return L('Tổng ', 'Total ') + e.n + ' ' + massTxt(e.m); });
  }

  // ---------- geometry of one body in world space, with edges and normals for drawing
  async function v6Geo(b, o, sc) {
    const base = { P: b.geo.positions, I: b.geo.indices, E: b.geo.brepE };
    if (!(o.fine && sc && b.solid && b.geo.brep)) return base;
    const chord = Math.max(0.002, Math.min(0.02, 0.4 / sc)), key = b.id + '|' + JSON.stringify(b.solid) + '|' + chord.toFixed(4);
    if (V6S.fine.has(key)) return V6S.fine.get(key);
    try {
      const m = brMesh(await brepSolid(b.solid), chord), g = { P: m.positions, I: m.indices, E: m.edges };
      if (V6S.fine.size > 12) V6S.fine.clear();
      V6S.fine.set(key, g); return g;
    } catch (e) { return base; }
  }
  function v6Prep(b, geo, o) {
    const m = dispMatrix(b), P = geo.P, I = geo.I, nv = P.length / 3, nt = I.length / 3;
    const W = new Float64Array(P.length);
    for (let i = 0; i < nv; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      W[3 * i] = m[0] * x + m[4] * y + m[8] * z + m[12]; W[3 * i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; W[3 * i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { const v = W[3 * i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    // weld by position so that edges between separately stored faces still find both triangles
    const q = 1e-5 * (1 + V.len(V.sub(hi, lo))), id = new Int32Array(nv), map = new Map();
    for (let i = 0; i < nv; i++) {
      const k = Math.round(W[3 * i] / q) + ',' + Math.round(W[3 * i + 1] / q) + ',' + Math.round(W[3 * i + 2] / q);
      let v = map.get(k); if (v === undefined) { v = i; map.set(k, v); } id[i] = v;
    }
    const N = new Float64Array(nt * 3), A = new Float64Array(nt);
    for (let t = 0; t < nt; t++) {
      const a = 3 * I[3 * t], c = 3 * I[3 * t + 1], d = 3 * I[3 * t + 2];
      const ux = W[c] - W[a], uy = W[c + 1] - W[a + 1], uz = W[c + 2] - W[a + 2], vx = W[d] - W[a], vy = W[d + 1] - W[a + 1], vz = W[d + 2] - W[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      N[3 * t] = nx / l; N[3 * t + 1] = ny / l; N[3 * t + 2] = nz / l; A[t] = l;
    }
    const em = new Map(), E = [];      // [va, vb, t1, t2 (-1 none), count]
    for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) {
      const a = id[I[3 * t + c]], bb = id[I[3 * t + (c + 1) % 3]]; if (a === bb) continue;
      const k = a < bb ? a * nv + bb : bb * nv + a, e = em.get(k);
      if (e === undefined) { em.set(k, E.length); E.push([a, bb, t, -1, 1]); } else { const r = E[e]; if (r[3] < 0) r[3] = t; r[4]++; }
    }
    const brep = !!(geo.E && geo.E.length), cosA = Math.cos(o.ang * Math.PI / 180), fixed = [], sil = [];
    if (brep) for (let i = 0; i < geo.E.length; i += 2) fixed.push([geo.E[i], geo.E[i + 1]]);
    for (const e of E) {
      if (e[3] < 0 || e[4] > 2) { if (!brep) fixed.push([e[0], e[1]]); continue; }
      const t1 = e[2], t2 = e[3], c = N[3 * t1] * N[3 * t2] + N[3 * t1 + 1] * N[3 * t2 + 1] + N[3 * t1 + 2] * N[3 * t2 + 2];
      if (!brep && c < cosA) fixed.push([e[0], e[1]]); else sil.push(e);
    }
    // per-corner normals: flat (as the 3D view) or smooth inside the edge angle (studio light)
    const NN = new Float32Array(nt * 9), smooth = o.light === 'studio', cosS = Math.cos(Math.max(o.ang, 20) * Math.PI / 180);
    let inc = null;
    if (smooth) { inc = new Map(); for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) { const v = id[I[3 * t + c]]; let l = inc.get(v); if (!l) { l = []; inc.set(v, l); } l.push(t); } }
    for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) {
      let nx = N[3 * t], ny = N[3 * t + 1], nz = N[3 * t + 2];
      if (smooth) {
        nx = ny = nz = 0;
        for (const u of inc.get(id[I[3 * t + c]])) {
          if (N[3 * t] * N[3 * u] + N[3 * t + 1] * N[3 * u + 1] + N[3 * t + 2] * N[3 * u + 2] < cosS) continue;
          nx += N[3 * u] * A[u]; ny += N[3 * u + 1] * A[u]; nz += N[3 * u + 2] * A[u];
        }
      }
      NN[9 * t + 3 * c] = nx; NN[9 * t + 3 * c + 1] = ny; NN[9 * t + 3 * c + 2] = nz;
    }
    return { b: b, P: P, W: W, I: I, N: N, NN: NN, fixed: fixed, sil: sil, lo: lo, hi: hi, color: [b.color[0] / 255, b.color[1] / 255, b.color[2] / 255] };
  }

  function v6GL() {
    if (v6gl && !v6gl.g.isContextLost()) return v6gl;
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!g) throw new Error(L('Trình duyệt không có WebGL2', 'WebGL2 is not available'));
    const sh = function (type, src) { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s)); return s; };
    const vs = '#version 300 es\nprecision highp float;layout(location=0) in vec3 aP;layout(location=1) in vec3 aN;uniform vec3 uR,uU,uD;uniform vec4 uBox;uniform vec2 uZ;out vec3 vN;\n' +
      'void main(){float x=dot(aP,uR),y=dot(aP,uU),z=dot(aP,uD);vN=vec3(dot(aN,uR),dot(aN,uU),-dot(aN,uD));' +
      'gl_Position=vec4((x-uBox.x)/uBox.z*2.0-1.0,(y-uBox.y)/uBox.w*2.0-1.0,(z-uZ.x)/uZ.y*2.0-1.0,1.0);}';
    const fs = '#version 300 es\nprecision highp float;in vec3 vN;uniform int uMode,uLight;uniform vec3 uC;out vec4 o;\n' +
      'void main(){if(uMode==0){float v=floor(gl_FragCoord.z*16777215.0);float r=floor(v/65536.0);float gg=floor((v-r*65536.0)/256.0);float b=v-r*65536.0-gg*256.0;o=vec4(r,gg,b,255.0)/255.0;return;}' +
      'if(uLight==2){o=vec4(uC,1.0);return;}vec3 n=normalize(vN);if(n.z<0.0)n=-n;vec3 c;' +
      'if(uLight==0)c=uC*(n.z*0.72+0.28);' +
      'else{vec3 l1=normalize(vec3(-0.45,0.6,0.66)),l2=normalize(vec3(0.7,-0.3,0.62));float d1=max(dot(n,l1),0.0),d2=max(dot(n,l2),0.0);' +
      'float sp=pow(max(dot(n,normalize(l1+vec3(0.0,0.0,1.0))),0.0),48.0)*0.25;c=uC*(0.22+0.6*d1+0.2*d2+0.14*n.z)+vec3(sp);}' +
      'o=vec4(min(c,vec3(1.0)),1.0);}';
    const p = g.createProgram(); g.attachShader(p, sh(g.VERTEX_SHADER, vs)); g.attachShader(p, sh(g.FRAGMENT_SHADER, fs)); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
    const U = {}; ['uR', 'uU', 'uD', 'uBox', 'uZ', 'uMode', 'uLight', 'uC'].forEach(function (n) { U[n] = g.getUniformLocation(p, n); });
    v6gl = { g: g, p: p, U: U, max: Math.min(g.getParameter(g.MAX_RENDERBUFFER_SIZE), g.getParameter(g.MAX_VIEWPORT_DIMS)[0]) };
    return v6gl;
  }

  // ---------- scene: bodies prepared in world space + extents in the drawing frame
  async function v6Scene(o, sc) {
    const bodies = v6Bodies();
    if (!bodies.length) throw new Error(L('Không có body nào đang hiện', 'No visible body'));
    const preps = [];
    for (const b of bodies) preps.push(v6Prep(b, await v6Geo(b, o, sc), o));
    const ax = [v6MV([1, 0, 0]), v6MV([0, 1, 0]), v6MV([0, 0, 1])];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of preps) for (let i = 0; i < p.W.length; i += 3) for (let k = 0; k < 3; k++) {
      const v = ax[k][0] * p.W[i] + ax[k][1] * p.W[i + 1] + ax[k][2] * p.W[i + 2]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
    }
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], cd = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const ctr = V.add(V.add(V.mul(ax[0], cd[0]), V.mul(ax[1], cd[1])), V.mul(ax[2], cd[2]));
    return { preps: preps, ext: ext, ctr: ctr };
  }
  function v6Upload(G, sc6) {
    const g = G.g, c = sc6.ctr;
    for (const p of sc6.preps) {
      const nt = p.I.length / 3, F = new Float32Array(nt * 9);
      for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const v = 3 * p.I[3 * t + k]; F[9 * t + 3 * k] = p.W[v] - c[0]; F[9 * t + 3 * k + 1] = p.W[v + 1] - c[1]; F[9 * t + 3 * k + 2] = p.W[v + 2] - c[2]; }
      p.n = nt * 3; p.vao = g.createVertexArray(); g.bindVertexArray(p.vao);
      p.vb = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, p.vb); g.bufferData(g.ARRAY_BUFFER, F, g.STATIC_DRAW); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, 0, 0);
      p.nb = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, p.nb); g.bufferData(g.ARRAY_BUFFER, p.NN, g.STATIC_DRAW); g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 3, g.FLOAT, false, 0, 0);
    }
    g.bindVertexArray(null);
  }
  function v6Release(G, sc6) { const g = G.g; for (const p of sc6.preps) if (p.vao) { g.deleteVertexArray(p.vao); g.deleteBuffer(p.vb); g.deleteBuffer(p.nb); p.vao = null; } }
  // projected extents (mm, relative to the scene centre) of some bodies along r / u
  function v6Ranges(preps, c, r, u) {
    let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
    for (const p of preps) for (let i = 0; i < p.W.length; i += 3) {
      const x = p.W[i] - c[0], y = p.W[i + 1] - c[1], z = p.W[i + 2] - c[2], a = x * r[0] + y * r[1] + z * r[2], b = x * u[0] + y * u[1] + z * u[2];
      if (a < r0) r0 = a; if (a > r1) r1 = a; if (b < u0) u0 = b; if (b > u1) u1 = b;
    }
    return [r0, r1, u0, u1];
  }

  // ---------- one picture of some bodies along dirs {r,u,d} (model space), at `sc` px per mm times `ss`
  // returns {cv, ss, pad, w, h, rc, uc}: w, h = picture size in px at sc, (rc, uc) = its centre in mm from the scene centre
  function v6View(G, sc6, preps, D, sc, ss, lwPx, o) {
    const g = G.g, U = G.U, r = D.r, u = D.u, d = D.d, rg = v6Ranges(preps, sc6.ctr, r, u);
    const er = Math.max(rg[1] - rg[0], 1e-6), eu = Math.max(rg[3] - rg[2], 1e-6);
    let s2 = ss, vw, vh, pad;
    for (;;) {
      pad = Math.ceil(lwPx * s2) + 3; vw = Math.max(2, Math.ceil(er * sc * s2) + 2 * pad); vh = Math.max(2, Math.ceil(eu * sc * s2) + 2 * pad);
      if ((vw <= G.max && vh <= G.max && vw * vh <= V6_MAXVIEW) || s2 <= 1) break;
      s2 = Math.max(1, s2 - 1);
    }
    if (vw > G.max || vh > G.max || vw * vh > V6_MAXVIEW) throw new Error(L('Hình chiếu quá lớn cho card đồ hoạ: giảm DPI, khổ giấy hoặc tỉ lệ', 'View too large for the graphics card: lower the DPI, paper or scale'));
    const S2 = sc * s2;
    let d0 = Infinity, d1 = -Infinity;
    for (const p of preps) for (let i = 0; i < p.W.length; i += 3) { const z = (p.W[i] - sc6.ctr[0]) * d[0] + (p.W[i + 1] - sc6.ctr[1]) * d[1] + (p.W[i + 2] - sc6.ctr[2]) * d[2]; if (z < d0) d0 = z; if (z > d1) d1 = z; }
    const dz = Math.max(d1 - d0, 1e-6); d0 -= 0.01 * dz; d1 += 0.01 * dz;
    const R0 = rg[0] - pad / S2, U0 = rg[2] - pad / S2, box = [R0, U0, vw / S2, vh / S2];
    // extreme points of the bodies in this view (image px): the overall dimensions start their extension lines there.
    // L / R: lowest and highest image y of the points on the left / right extreme, T / B: smallest and largest x on the
    // top / bottom extreme
    const xp = (function () {
      const c = sc6.ctr; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const P = function (W, i) { const x = W[i] - c[0], y = W[i + 1] - c[1], z = W[i + 2] - c[2]; return [(x * r[0] + y * r[1] + z * r[2] - R0) * S2, vh - (x * u[0] + y * u[1] + z * u[2] - U0) * S2]; };
      for (const p of preps) for (let i = 0; i < p.W.length; i += 3) { const q = P(p.W, i); if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
      const t = 0.002 * Math.max(x1 - x0, y1 - y0) + 0.3, X = { x0: x0, x1: x1, y0: y0, y1: y1, L: [Infinity, -Infinity], R: [Infinity, -Infinity], T: [Infinity, -Infinity], B: [Infinity, -Infinity] };
      const mm = function (a, v) { if (v < a[0]) a[0] = v; if (v > a[1]) a[1] = v; };
      for (const p of preps) for (let i = 0; i < p.W.length; i += 3) {
        const q = P(p.W, i);
        if (q[0] <= x0 + t) mm(X.L, q[1]); if (q[0] >= x1 - t) mm(X.R, q[1]); if (q[1] <= y0 + t) mm(X.T, q[0]); if (q[1] >= y1 - t) mm(X.B, q[0]);
      }
      return isFinite(x0) ? X : null;
    })();
    const fb = g.createFramebuffer(), cb = g.createRenderbuffer(), db = g.createRenderbuffer();
    g.bindRenderbuffer(g.RENDERBUFFER, cb); g.renderbufferStorage(g.RENDERBUFFER, g.RGBA8, vw, vh);
    g.bindRenderbuffer(g.RENDERBUFFER, db); g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH_COMPONENT24, vw, vh);
    g.bindFramebuffer(g.FRAMEBUFFER, fb);
    g.framebufferRenderbuffer(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.RENDERBUFFER, cb); g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.RENDERBUFFER, db);
    g.viewport(0, 0, vw, vh); g.useProgram(G.p); g.enable(g.DEPTH_TEST); g.disable(g.CULL_FACE);
    g.uniform3fv(U.uR, r); g.uniform3fv(U.uU, u); g.uniform3fv(U.uD, d); g.uniform4fv(U.uBox, box); g.uniform2fv(U.uZ, [d0, d1 - d0]);
    const light = o.col === 'white' ? 2 : o.light === 'studio' ? 1 : 0;
    const draw = function (mode) {
      g.clearColor(1, 1, 1, mode === 0 ? 1 : 0); g.clearDepth(1); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT); g.uniform1i(U.uMode, mode); g.uniform1i(U.uLight, light);
      for (const p of preps) {
        g.uniform3fv(U.uC, o.col === 'white' ? [1, 1, 1] : o.col === 'one' ? o.one : p.color);
        g.bindVertexArray(p.vao); g.drawArrays(g.TRIANGLES, 0, p.n);
      }
    };
    const px = new Uint8Array(vw * vh * 4);
    draw(0); g.readPixels(0, 0, vw, vh, g.RGBA, g.UNSIGNED_BYTE, px);
    const raw = new Float32Array(vw * vh);
    for (let y = 0; y < vh; y++) { const ro = (vh - 1 - y) * vw * 4, wo = y * vw; for (let x = 0; x < vw; x++) { const k = ro + 4 * x; raw[wo + x] = (px[k] * 65536 + px[k + 1] * 256 + px[k + 2]) / 16777215; } }
    const fill = new ImageData(vw, vh);
    draw(1); g.readPixels(0, 0, vw, vh, g.RGBA, g.UNSIGNED_BYTE, px);
    for (let y = 0; y < vh; y++) { const ro = (vh - 1 - y) * vw * 4; fill.data.set(px.subarray(ro, ro + 4 * vw), y * vw * 4); }
    // preview: which body each pixel shows (flat colour = body number), so a body picked in a list lights up without a
    // new render (v6HlMask)
    let ids = null;
    if (o.idm) {
      g.clearColor(0, 0, 0, 0); g.clearDepth(1); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT); g.uniform1i(U.uMode, 1); g.uniform1i(U.uLight, 2);
      preps.forEach(function (p, i) { const k = i + 1; g.uniform3fv(U.uC, [(k & 255) / 255, ((k >> 8) & 255) / 255, 0]); g.bindVertexArray(p.vao); g.drawArrays(g.TRIANGLES, 0, p.n); });
      g.readPixels(0, 0, vw, vh, g.RGBA, g.UNSIGNED_BYTE, px);
      ids = new Uint16Array(vw * vh);
      for (let y = 0; y < vh; y++) { const ro = (vh - 1 - y) * vw * 4, wo = y * vw; for (let x = 0; x < vw; x++) { const k = ro + 4 * x; ids[wo + x] = px[k] | (px[k + 1] << 8); } }
    }
    g.bindFramebuffer(g.FRAMEBUFFER, null); g.deleteFramebuffer(fb); g.deleteRenderbuffer(cb); g.deleteRenderbuffer(db);
    const cv = document.createElement('canvas'); cv.width = vw; cv.height = vh;
    const c2 = cv.getContext('2d'); c2.putImageData(fill, 0, 0);
    const map = { R0: R0, U0: U0, S2: S2, vh: vh, ctr: sc6.ctr, D: D, ids: ids, uids: ids ? preps.map(function (p) { return p.b.uid; }) : null };
    let vec = null, snaps = null;
    if (o.edge || o.col === 'white' || o.snap) {
      // farthest depth of the 3x3 neighbourhood: an edge is hidden only when everything around it is in front
      const tmp = new Float32Array(vw * vh), dep = new Float32Array(vw * vh);
      for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) { const i = y * vw + x; let m = raw[i]; if (x > 0 && raw[i - 1] > m) m = raw[i - 1]; if (x < vw - 1 && raw[i + 1] > m) m = raw[i + 1]; tmp[i] = m; }
      for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) { const i = y * vw + x; let m = tmp[i]; if (y > 0 && tmp[i - vw] > m) m = tmp[i - vw]; if (y < vh - 1 && tmp[i + vw] > m) m = tmp[i + vw]; dep[i] = m; }
      const vis = new Path2D(), hid = new Path2D(), tol = 1.5e-3, c = sc6.ctr, VL = [], HL = [];
      let cur = null;
      const proj = function (W, i) { const x = W[3 * i] - c[0], y = W[3 * i + 1] - c[1], z = W[3 * i + 2] - c[2]; return [(x * r[0] + y * r[1] + z * r[2] - R0) * S2, vh - (x * u[0] + y * u[1] + z * u[2] - U0) * S2, (x * d[0] + y * d[1] + z * d[2] - d0) / (d1 - d0)]; };
      const seg = function (A, B) {
        const n2 = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 0.75));
        let state = -1;
        for (let i = 0; i <= n2; i++) {
          const t = i / n2, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, z = A[2] + (B[2] - A[2]) * t, ix = Math.floor(x), iy = Math.floor(y);
          const on = ix < 0 || iy < 0 || ix >= vw || iy >= vh || dep[iy * vw + ix] >= z - tol ? 1 : 0;
          if (on !== state) {
            if (state >= 0) { (state ? vis : hid).lineTo(x, y); if (cur) cur.push(x, y); }
            (on ? vis : hid).moveTo(x, y); state = on;
            if (o.vec) { cur = [x, y]; (on ? VL : HL).push(cur); }
          }
          if (i === n2) { (state ? vis : hid).lineTo(x, y); if (cur) cur.push(x, y); }
        }
        cur = null;
      };
      const seen = o.snap ? new Set() : null;
      snaps = o.snap ? [] : null;
      // edge ends seen from this side: the points a dimension can be picked on
      const snap = function (p, i) {
        const k = p.b.id + ':' + i; if (seen.has(k)) return; seen.add(k);
        const q = proj(p.W, i), ix = Math.floor(q[0]), iy = Math.floor(q[1]);
        if (ix >= 0 && iy >= 0 && ix < vw && iy < vh && dep[iy * vw + ix] < q[2] - 4 * tol) return;
        snaps.push({ x: q[0], y: q[1], b: p.b.id, i: i });
      };
      const drawE = o.edge || o.col === 'white';
      for (const p of preps) {
        for (const e of p.fixed) { if (drawE) seg(proj(p.W, e[0]), proj(p.W, e[1])); if (seen) { snap(p, e[0]); snap(p, e[1]); } }
        const N = p.N;
        for (const e of p.sil) {
          const a = N[3 * e[2]] * d[0] + N[3 * e[2] + 1] * d[1] + N[3 * e[2] + 2] * d[2], b2 = N[3 * e[3]] * d[0] + N[3 * e[3] + 1] * d[1] + N[3 * e[3] + 2] * d[2];
          if (a * b2 < 0 || (a === 0) !== (b2 === 0)) { if (drawE) seg(proj(p.W, e[0]), proj(p.W, e[1])); if (seen) { snap(p, e[0]); snap(p, e[1]); } }
        }
      }
      const lw = lwPx * s2;
      if (drawE && o.vec) vec = { vis: VL, hid: o.hidden ? HL : [], lw: lw };
      else if (drawE) {
        c2.lineCap = 'round'; c2.lineJoin = 'round';
        if (o.hidden) { c2.save(); c2.strokeStyle = '#7d7d7d'; c2.lineWidth = Math.max(1, lw * 0.6); c2.setLineDash([4 * lw, 3 * lw]); c2.stroke(hid); c2.restore(); }
        c2.strokeStyle = '#111111'; c2.lineWidth = lw; c2.stroke(vis);
      }
    }
    return { cv: cv, ss: s2, pad: pad, w: er * sc, h: eu * sc, rc: (rg[0] + rg[1]) / 2, uc: (rg[2] + rg[3]) / 2, map: map, vec: vec, snaps: snaps, xp: xp };
  }

  // ---------- layout (full-size sheet px; positions are fractions of the sheet, item centres)
  function v6Names(o) { return o.exp ? [] : V6_ORDER.filter(function (n) { return o.views[n]; }); }
  const V6_COL = { left: 0, front: 1, top: 1, bottom: 1, right: 2, back: 3 }, V6_ROW = { top: 0, bottom: 2, front: 1, left: 1, right: 1, back: 1 };
  function v6Metrics(o) { const ppmm = o.dpi / 25.4; return { ppmm: ppmm, font: Math.max(8, o.fs * ppmm), lw: Math.max(1, o.lw * ppmm) }; }
  // default 6-view layout; also the fitting scale when sc is not given
  function v6Auto(o, ext, sc) {
    const names = v6Names(o), M = v6Metrics(o), W = o.W, H = o.H;
    const colW = [ext[1], ext[0], ext[1], ext[0]], rowH = [ext[1], ext[2], ext[1]];
    const cols = [0, 1, 2, 3].filter(function (c) { return names.some(function (n) { return V6_COL[n] === c; }); });
    const rows = [0, 1, 2].filter(function (r) { return names.some(function (n) { return V6_ROW[n] === r; }); });
    const gap = Math.max(0.045 * Math.min(W, H), (o.dim ? 6 : 2) * M.font), margin = Math.max(0.04 * Math.min(W, H), (o.dim ? 4 : 1.5) * M.font);
    const rgap = rows.slice(1).map(function (r) { return gap + (o.lbl ? 1.4 * M.font : 0) + (o.dim && r === 2 && rows.indexOf(1) >= 0 ? 3.2 * M.font : 0); });
    const gapsH = rgap.reduce(function (s, v) { return s + v; }, 0), top = o.lbl ? 1.4 * M.font : 0;
    const sumW = cols.reduce(function (s, c) { return s + colW[c]; }, 0) || 1, sumH = rows.reduce(function (s, r) { return s + rowH[r]; }, 0) || 1;
    if (!sc) sc = Math.max(1e-6, Math.min((W - 2 * margin - gap * (cols.length - 1)) / sumW, (H - 2 * margin - gapsH - top - (o.scn ? 2 * M.font : 0)) / sumH)) * o.zoom;
    const usedW = sumW * sc + gap * (cols.length - 1), usedH = sumH * sc + gapsH + top;
    const cx = {}, cy = {};
    let x = (W - usedW) / 2; for (const c of cols) { cx[c] = x + colW[c] * sc / 2; x += colW[c] * sc + gap; }
    let y = (H - usedH) / 2 + top; rows.forEach(function (r, i) { cy[r] = y + rowH[r] * sc / 2; y += rowH[r] * sc + (rgap[i] || 0); });
    const f = function (c) { return cx[c] !== undefined ? cx[c] / W : 0.5; }, g = function (r) { return cy[r] !== undefined ? cy[r] / H : 0.5; };
    return { sc: sc, pos: { front: [f(1), g(1)], left: f(0), right: f(2), back: f(3), top: g(0), bottom: g(2) } };
  }
  // views stay on their projection lines: Left / Right / Back share the Front's height, Top / Bottom its column
  function v6Centre(pos, n) {
    const F = pos.front;
    if (n === 'front') return F.slice();
    if (n === 'left' || n === 'right' || n === 'back') return [pos[n], F[1]];
    return [F[0], pos[n]];
  }
  function v6Ratio(sc, o) {
    const r = sc / (o.dpi / 25.4), t = function (v) { return (Math.round(v * 100) / 100).toString(); };
    return r >= 1 ? t(r) + ':1' : '1:' + t(1 / r);
  }
  // exploded: each part's centre in the iso picture (mm from the assembly centre) after pulling it out from the centre
  function v6ExpPlan(o, sc6) {
    const D = v6Dirs(v6IsoSpec(o.az, o.el)), C = sc6.ctr, items = [], G = v6GrpOf(sc6.preps.map(function (p) { return p.b.id; }));
    for (const p of sc6.preps) {
      if (G.hide.has(p.b.id)) continue;
      const rg = v6Ranges([p], C, D.r, D.u), mid = V.mul(V.add(p.lo, p.hi), 0.5), sh = V.mul(V.sub(mid, C), o.spread);
      items.push({ p: p, id: p.b.id, n: G.n[p.b.id] || 1, w: rg[1] - rg[0], h: rg[3] - rg[2], cx: (rg[0] + rg[1]) / 2 + V.dot(sh, D.r), cy: (rg[2] + rg[3]) / 2 + V.dot(sh, D.u) });
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const it of items) { x0 = Math.min(x0, it.cx - it.w / 2); x1 = Math.max(x1, it.cx + it.w / 2); y0 = Math.min(y0, it.cy - it.h / 2); y1 = Math.max(y1, it.cy + it.h / 2); }
    return { D: D, items: items, bx: (x0 + x1) / 2, by: (y0 + y1) / 2, sw: Math.max(x1 - x0, 1e-6), sh: Math.max(y1 - y0, 1e-6) };
  }
  function v6ScaleOf(o, sc6, plan) {
    if (o.scale > 0) return o.scale * o.dpi / 25.4;
    if (!o.exp) return v6Auto(o, sc6.ext).sc;
    const M = v6Metrics(o), m = Math.max(0.05 * Math.min(o.W, o.H), 2 * M.font), lab = (o.pn ? 1.3 : 0) + (o.pm ? 1.3 : 0);
    return Math.max(1e-6, Math.min((o.W - 2 * m) / plan.sw, (o.H - 2 * m - (lab + 1) * M.font * 1.4) / plan.sh)) * o.zoom;
  }

  // ---------- rendering
  async function v6Render(o, k, ss, quick) {
    if (!o.exp && !v6Names(o).length && !o.iso) throw new Error(L('Chưa chọn view nào', 'No view chosen'));
    let sc6 = await v6Scene(o, 0);
    let plan = o.exp ? v6ExpPlan(o, sc6) : null;
    const sc = v6ScaleOf(o, sc6, plan);
    if (o.fine && k >= 1 && !quick) { sc6 = await v6Scene(o, sc); if (o.exp) plan = v6ExpPlan(o, sc6); }
    const M = v6Metrics(o), G = v6GL(); v6Upload(G, sc6);
    const out = { sc6: sc6, sc: sc, views: {}, parts: [], plan: plan, isoK: o.isoK };
    const oi = Object.assign({}, o, { idm: !!quick });      // preview: body-number pixels for the highlight
    try {
      if (o.exp) {
        for (const it of plan.items) out.parts.push(Object.assign(v6View(G, sc6, [it.p], plan.D, sc * k, ss, M.lw * k, oi), { id: it.id, n: it.n, b: it.p.b, cx: it.cx, cy: it.cy }));
      } else {
        const ap = v6Auto(o, sc6.ext, sc).pos; out.pos = V6S.pos ? Object.assign({}, ap, V6S.pos) : ap;
        const os = Object.assign({}, oi, { snap: true });
        for (const n of v6Names(o)) out.views[n] = v6View(G, sc6, sc6.preps, v6Dirs(V6_VIEWS[n]), sc * k, ss, M.lw * k, os);
        if (o.iso) out.iso = v6View(G, sc6, sc6.preps, v6Dirs(v6IsoSpec(o.az, o.el)), sc * k * o.isoK, ss, M.lw * k * Math.min(1, o.isoK), oi);
      }
    } finally { v6Release(G, sc6); }
    return out;
  }

  // ---------- the sheet: pictures, dimensions, names, notes, drawn at k x full size; returns hit boxes
  // orange mask of one body over a preview picture, made from its body-number pixels and kept until the next render
  function v6HlMask(v, uid) {
    const M = v.map; if (!M || !M.ids) return null;
    const k = M.uids.indexOf(uid) + 1; if (!k) return null;
    if (v.hlU === uid) return v.hlC;
    const w = v.cv.width, h = v.cv.height, ids = M.ids;
    let cv = null;
    if (ids.length === w * h) {
      const im = new ImageData(w, h), d = im.data; let any = false;
      for (let i = 0; i < ids.length; i++) if (ids[i] === k) { const j = 4 * i; d[j] = 255; d[j + 1] = 130; d[j + 2] = 20; d[j + 3] = 150; any = true; }
      if (any) { cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(im, 0, 0); }
    }
    v.hlU = uid; v.hlC = cv;
    return cv;
  }
  function v6Font(px, bold) { return (bold ? 'bold ' : '') + Math.round(px) + 'px "Segoe UI", Arial, sans-serif'; }
  const V6_FALL = { 'Times New Roman': 'Times, serif', Georgia: '"Times New Roman", serif', Cambria: '"Times New Roman", serif', 'Courier New': 'Courier, monospace', Consolas: '"Courier New", monospace' };
  function v6NoteFont(n, px) {
    const f = n.font || 'Arial';
    return (n.italic ? 'italic ' : '') + (n.bold ? 'bold ' : '') + Math.round(px) + 'px "' + f + '", ' + (V6_FALL[f] || 'Arial, sans-serif');
  }
  function v6Compose(c2, o, R, k) {
    const W = o.W * k, H = o.H * k, M = v6Metrics(o), font = M.font * k, lw = M.lw * k, hits = [], frames = {};
    c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
    const put = function (v, cx, cy, f) {
      f = f || 1;
      const w = v.w * f, h = v.h * f, x = cx - w / 2, y = cy - h / 2, pad = v.pad / v.ss * f;
      c2.drawImage(v.cv, x - pad, y - pad, v.cv.width / v.ss * f, v.cv.height / v.ss * f);
      if (V6S.hl && R === V6S.prev) { const m = v6HlMask(v, V6S.hl); if (m) c2.drawImage(m, x - pad, y - pad, v.cv.width / v.ss * f, v.cv.height / v.ss * f); }
      const tr = { x0: x - pad, y0: y - pad, s: f / v.ss };
      if (c2.__rec && v.vec) dwRecEdges(c2, v.vec, tr);
      return { x: x, y: y, w: w, h: h, tr: tr };
    };
    c2.fillStyle = '#111'; c2.strokeStyle = '#111'; c2.setLineDash([]);
    const fnt = v6Font(font, o.fb);
    if (!o.exp) {
      const pos = V6S.pos ? Object.assign({}, R.pos, V6S.pos) : R.pos;
      for (const n of Object.keys(R.views)) { const c = v6Centre(pos, n); frames[n] = put(R.views[n], c[0] * W, c[1] * H); hits.push({ kind: 'view', n: n, r: frames[n] }); }
      // points a dimension can be picked on (sheet px)
      R.snaps = [];
      for (const n of Object.keys(R.views)) {
        const v = R.views[n], tr = frames[n].tr;
        for (const q of (v.snaps || [])) R.snaps.push({ x: tr.x0 + q.x * tr.s, y: tr.y0 + q.y * tr.s, view: n, b: q.b, i: q.i });
      }
      if (R.iso) {
        const ip = V6S.iso || v6IsoDefault(o, R, pos);
        // while its corner is dragged the iso picture is scaled on the fly; the next render redraws it sharp
        const D = V6S.drag, ik = D && D.h.kind === 'isoR' && D.k ? D.k : o.isoK;
        const f = put(R.iso, ip[0] * W, ip[1] * H, ik / (R.isoK || 1)), hs = V6S.hs || 7;
        hits.push({ kind: 'iso', r: f }); frames.iso = f;
        hits.push({ kind: 'isoR', r: { x: f.x + f.w - hs, y: f.y + f.h - hs, w: 2 * hs, h: 2 * hs } });
      }
      const arrow = function (x0, y0, x1, y1) {
        const a = Math.atan2(y1 - y0, x1 - x0), L2 = font * 1.05, wv = L2 * 0.3;
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x1 - L2 * Math.cos(a) + wv * Math.sin(a), y1 - L2 * Math.sin(a) - wv * Math.cos(a));
        c2.lineTo(x1 - L2 * Math.cos(a) - wv * Math.sin(a), y1 - L2 * Math.sin(a) + wv * Math.cos(a)); c2.closePath(); c2.fill();
      };
      const dimH = function (x0, x1, yb, yd, v) {
        c2.lineWidth = Math.max(1, lw * 0.55); c2.beginPath();
        c2.moveTo(x0, yb + 0.4 * font); c2.lineTo(x0, yd + 0.5 * font); c2.moveTo(x1, yb + 0.4 * font); c2.lineTo(x1, yd + 0.5 * font);
        c2.moveTo(x0, yd); c2.lineTo(x1, yd); c2.stroke(); arrow(x1, yd, x0, yd); arrow(x0, yd, x1, yd);
        c2.font = fnt; c2.textAlign = 'center'; c2.textBaseline = 'bottom'; c2.fillText(v6Txt(v, o.unit), (x0 + x1) / 2, yd - 0.25 * font);
      };
      const dimV = function (y0, y1, xb, xd, v) {
        c2.lineWidth = Math.max(1, lw * 0.55); c2.beginPath();
        c2.moveTo(xb - 0.4 * font, y0); c2.lineTo(xd - 0.5 * font, y0); c2.moveTo(xb - 0.4 * font, y1); c2.lineTo(xd - 0.5 * font, y1);
        c2.moveTo(xd, y0); c2.lineTo(xd, y1); c2.stroke(); arrow(xd, y1, xd, y0); arrow(xd, y0, xd, y1);
        c2.save(); c2.translate(xd - 0.25 * font, (y0 + y1) / 2); c2.rotate(-Math.PI / 2);
        c2.font = fnt; c2.textAlign = 'center'; c2.textBaseline = 'bottom'; c2.fillText(v6Txt(v, o.unit), 0, 0); c2.restore();
      };
      v6DrawDims(c2, o, R, frames, font, lw, fnt, arrow, hits, W, H);
      const ext = R.sc6.ext;
      if (o.dim) {
        // overall size: length (W), width (D), height (H), each on / off. Extension lines start right at the extreme
        // points of the bodies; the dimension line sits V6S.odo[key] paper mm away from them (drag it to move)
        const pk = M.ppmm * k, offOf = function (key, d0) { const v = V6S.odo && V6S.odo[key]; return v ? v * pk : d0; };
        const gp = 0.15 * font, nx = function (n) { const fr = frames[n], v = R.views[n]; return fr && v && v.xp ? { tr: fr.tr, xp: v.xp } : null; };
        const odH = function (n, key, val) {
          const q = nx(n); if (!q) return;
          const sx = function (x) { return q.tr.x0 + x * q.tr.s; }, sy = function (y) { return q.tr.y0 + y * q.tr.s; };
          const x0 = sx(q.xp.x0), x1 = sx(q.xp.x1), base = sy(q.xp.y1), a = sy(q.xp.L[1]), b = sy(q.xp.R[1]), yd = base + offOf(key, 2.4 * font);
          c2.lineWidth = Math.max(1, lw * 0.55); c2.beginPath();
          c2.moveTo(x0, a + gp); c2.lineTo(x0, yd + 0.5 * font); c2.moveTo(x1, b + gp); c2.lineTo(x1, yd + 0.5 * font);
          c2.moveTo(x0, yd); c2.lineTo(x1, yd); c2.stroke(); arrow(x1, yd, x0, yd); arrow(x0, yd, x1, yd);
          c2.font = fnt; c2.textAlign = 'center'; c2.textBaseline = 'bottom'; const tx = v6Txt(val, o.unit); c2.fillText(tx, (x0 + x1) / 2, yd - 0.25 * font);
          hits.push({ kind: 'odim', key: key, t: 'h', base: base, pk: pk, min: 0.8 * font, r: { x: x0, y: yd - 1.4 * font, w: x1 - x0, h: 1.9 * font } });
        };
        const odV = function (n, key, val) {
          const q = nx(n); if (!q) return;
          const sx = function (x) { return q.tr.x0 + x * q.tr.s; }, sy = function (y) { return q.tr.y0 + y * q.tr.s; };
          const y0 = sy(q.xp.y0), y1 = sy(q.xp.y1), base = sx(q.xp.x0), a = sx(q.xp.T[0]), b = sx(q.xp.B[0]), xd = base - offOf(key, 1.6 * font);
          c2.lineWidth = Math.max(1, lw * 0.55); c2.beginPath();
          c2.moveTo(a - gp, y0); c2.lineTo(xd - 0.5 * font, y0); c2.moveTo(b - gp, y1); c2.lineTo(xd - 0.5 * font, y1);
          c2.moveTo(xd, y0); c2.lineTo(xd, y1); c2.stroke(); arrow(xd, y1, xd, y0); arrow(xd, y0, xd, y1);
          c2.save(); c2.translate(xd - 0.25 * font, (y0 + y1) / 2); c2.rotate(-Math.PI / 2);
          c2.font = fnt; c2.textAlign = 'center'; c2.textBaseline = 'bottom'; c2.fillText(v6Txt(val, o.unit), 0, 0); c2.restore();
          hits.push({ kind: 'odim', key: key, t: 'v', base: base, pk: pk, min: 0.8 * font, r: { x: xd - 1.4 * font, y: y0, w: 1.9 * font, h: y1 - y0 } });
        };
        const fx = ['front', 'back', 'top', 'bottom'].find(function (n) { return frames[n]; });
        if (o.dimW && fx) odH(fx, 'W', ext[0]);
        const fy = ['right', 'left'].find(function (n) { return frames[n]; });
        if (o.dimD) { if (fy) odH(fy, 'D', ext[1]); else if (frames.top) odV('top', 'D', ext[1]); }
        const fz = ['right', 'front', 'left', 'back'].find(function (n) { return frames[n]; });
        if (o.dimH && fz) odV(fz, 'H', ext[2]);
      }
      if (o.lbl) {
        c2.font = fnt; c2.textAlign = 'center'; c2.textBaseline = 'bottom';
        for (const n of Object.keys(frames)) { const f = frames[n]; c2.fillText(n === 'iso' ? 'ISO' : L(V6_VIEWS[n].vi, V6_VIEWS[n].en), f.x + f.w / 2, f.y - 0.6 * font); }
      }
    } else {
      const P = R.plan, sc = R.sc * k;
      for (const pt of R.parts) {
        const off = V6S.off[pt.id] || [0, 0];
        const cx = W / 2 + (pt.cx - P.bx) * sc + off[0] * W, cy = H / 2 - (pt.cy - P.by) * sc + off[1] * H;
        const f = put(pt, cx, cy); hits.push({ kind: 'part', id: pt.id, r: f });
        const lines = [];
        if (o.pn) lines.push([pt.b.name + (pt.n > 1 ? '  x' + pt.n : ''), true]);
        if (o.pm) { const m = v6Mat(pt.b), g = v6Mass(pt.b); if (m || g) lines.push([[m, g].filter(Boolean).join('  ·  '), false]); }
        let y = f.y + f.h + 0.5 * font, wmax = 0;
        c2.textAlign = 'center'; c2.textBaseline = 'top';
        for (const ln of lines) {
          c2.font = v6Font(ln[1] ? font : font * 0.88, ln[1] ? true : o.fb); c2.fillStyle = ln[1] ? '#111' : '#444';
          c2.fillText(ln[0], cx, y); wmax = Math.max(wmax, c2.measureText(ln[0]).width); y += (ln[1] ? font : font * 0.88) * 1.3;
        }
        c2.fillStyle = '#111';
        if (lines.length) hits.push({ kind: 'label', id: pt.id, r: { x: cx - wmax / 2 - 3, y: f.y + f.h + 0.4 * font, w: wmax + 6, h: y - (f.y + f.h + 0.4 * font) } });
      }
      // total mass per material, one line each; the box's lower right corner sits at V6S.tot (bottom right by default)
      const tl = v6Totals(R.sc6.preps.map(function (p) { return p.b; }));
      if (o.tot && tl.length) {
        c2.font = fnt; c2.textAlign = 'left'; c2.textBaseline = 'top'; c2.fillStyle = '#111';
        const lh = font * 1.35, wm = Math.max.apply(null, tl.map(function (t) { return c2.measureText(t).width; })), hh = tl.length * lh - (lh - font);
        const tp = V6S.tot || [(W - 1.5 * font) / W, (H - 1.2 * font - (o.scn ? 1.7 * font : 0)) / H];
        const x0 = tp[0] * W - wm, y0 = tp[1] * H - hh;
        tl.forEach(function (t, i) { c2.fillText(t, x0, y0 + i * lh); });
        R.totPos = tp.slice();
        hits.push({ kind: 'tot', r: { x: x0 - 3, y: y0 - 3, w: wm + 6, h: hh + 6 } });
      }
    }
    R.frames = frames;
    if (o.scn) {
      c2.font = fnt; c2.textAlign = 'right'; c2.textBaseline = 'bottom';
      c2.fillText(L('Tỉ lệ ', 'Scale ') + v6Ratio(R.sc, o) + '    ' + L('Đơn vị: mm (in)', 'Units: mm (in)'), W - 1.5 * font, H - 1.2 * font);
    }
    // notes
    for (const n of V6S.notes[V6S.mode]) {
      const px = n.size * M.ppmm * k, ls = n.text.split('\n'), col = n.color || '#111111', al = n.align || 'left';
      c2.font = v6NoteFont(n, px); c2.textAlign = 'left'; c2.textBaseline = 'top'; c2.fillStyle = col;
      const ws = ls.map(function (t) { return c2.measureText(t).width; }), wm = Math.max.apply(null, [0].concat(ws));
      ls.forEach(function (t, i) {
        const x = n.x * W + (al === 'center' ? (wm - ws[i]) / 2 : al === 'right' ? wm - ws[i] : 0), y = n.y * H + i * px * 1.25;
        c2.fillText(t, x, y);
        if (n.under && t.trim()) { c2.strokeStyle = col; c2.lineWidth = Math.max(1, px * 0.06); c2.setLineDash([]); c2.beginPath(); c2.moveTo(x, y + px * 1.02); c2.lineTo(x + ws[i], y + px * 1.02); c2.stroke(); }
      });
      c2.fillStyle = '#111'; c2.strokeStyle = '#111';
      hits.push({ kind: 'note', id: n.id, r: { x: n.x * W - 3, y: n.y * H - 3, w: wm + 6, h: ls.length * px * 1.25 + 6 } });
    }
    // frames around groups of parts, the group name over the top left corner
    for (const f of (V6S.rects[V6S.mode] || [])) {
      const x = f.x * W, y = f.y * H, w = f.w * W, h = f.h * H, col = f.color || '#e53935', lw = Math.max(1, (f.lw || 0.5) * M.ppmm * k), fp = (f.ts || 5) * M.ppmm * k;
      c2.save(); c2.strokeStyle = col; c2.lineWidth = lw; c2.setLineDash([]); c2.lineJoin = 'miter';
      c2.beginPath(); c2.moveTo(x, y); c2.lineTo(x + w, y); c2.lineTo(x + w, y + h); c2.lineTo(x, y + h); c2.closePath(); c2.stroke();
      let tw = 0;
      if (f.title) { c2.font = v6Font(fp, true); c2.fillStyle = col; c2.textAlign = 'left'; c2.textBaseline = 'bottom'; c2.fillText(f.title, x + 0.2 * fp, y - lw / 2 - 0.25 * fp); tw = c2.measureText(f.title).width; }
      c2.restore();
      const m = Math.max(lw, 3), hs = V6S.hs || 7;
      hits.push({ kind: 'rect', id: f.id, r: { x: x - m, y: y - m, w: w + 2 * m, h: 2 * m } }, { kind: 'rect', id: f.id, r: { x: x - m, y: y + h - m, w: w + 2 * m, h: 2 * m } },
        { kind: 'rect', id: f.id, r: { x: x - m, y: y - m, w: 2 * m, h: h + 2 * m } }, { kind: 'rect', id: f.id, r: { x: x + w - m, y: y - m, w: 2 * m, h: h + 2 * m } });
      if (f.title) hits.push({ kind: 'rect', id: f.id, title: true, r: { x: x, y: y - lw / 2 - 1.3 * fp, w: tw + 0.4 * fp, h: 1.3 * fp } });
      hits.push({ kind: 'rectR', id: f.id, r: { x: x + w - hs, y: y + h - hs, w: 2 * hs, h: 2 * hs } });
    }
    return hits;
  }
  // ---------- dimensions picked on a view: each end is a vertex of a body (stable body id + point in the body's own
  // frame), found again in the geometry the sheet is drawn from; when that vertex is gone the dimension is marked lost
  // dim = { id, view, a: {uid, L}, b: {uid, L}, t: 'h' | 'v' | 'a', o: place of the dimension line (mm in the view), la }
  function v6DimVert(p, L) {
    const key = L.join(',');
    if (!p._dv) p._dv = new Map();
    if (p._dv.has(key)) return p._dv.get(key);
    const P = p.P, n = P.length / 3, diag = Math.hypot(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]) || 1, tol = Math.pow(2e-4 * diag, 2) + 1e-12;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) { const dx = P[3 * i] - L[0], dy = P[3 * i + 1] - L[1], dz = P[3 * i + 2] - L[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
    const r = bd <= tol ? best : -1; p._dv.set(key, r); return r;
  }
  function v6RuToSheet(v, fr, r, u) { const m = v.map; return { x: fr.tr.x0 + (r - m.R0) * m.S2 * fr.tr.s, y: fr.tr.y0 + (m.vh - (u - m.U0) * m.S2) * fr.tr.s, r: r, u: u }; }
  function v6SheetToRu(v, fr, x, y) { const m = v.map, px = (x - fr.tr.x0) / fr.tr.s, py = (y - fr.tr.y0) / fr.tr.s; return { r: px / m.S2 + m.R0, u: (m.vh - py) / m.S2 + m.U0 }; }
  function v6DimLoc(R, frames, n, ref) {
    const v = R.views[n], fr = frames[n]; if (!v || !fr || !ref || !v.map) return null;
    const id = dwIdOf(ref.uid), p = R.sc6.preps.find(function (q) { return q.b.id === id; }); if (!p) return null;
    const i = v6DimVert(p, ref.L); if (i < 0) return null;
    const m = v.map, c = m.ctr, D = m.D, x = p.W[3 * i] - c[0], y = p.W[3 * i + 1] - c[1], z = p.W[3 * i + 2] - c[2];
    return v6RuToSheet(v, fr, x * D.r[0] + y * D.r[1] + z * D.r[2], x * D.u[0] + y * D.u[1] + z * D.u[2]);
  }
  // is the reference still a vertex of the body as it is in the model now (no drawing needed)
  function v6RefValid(ref) {
    const b = S.bodies.find(function (x) { return x.uid === ref.uid; }); if (!b) return false;
    const P = b.geo.positions; let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], bd = Infinity;
    for (let i = 0; i < P.length; i += 3) {
      for (let k = 0; k < 3; k++) { if (P[i + k] < lo[k]) lo[k] = P[i + k]; if (P[i + k] > hi[k]) hi[k] = P[i + k]; }
      const dx = P[i] - ref.L[0], dy = P[i + 1] - ref.L[1], dz = P[i + 2] - ref.L[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) bd = d;
    }
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    return bd <= Math.pow(2e-4 * diag, 2) + 1e-12;
  }
  // where the dimension line runs and what it measures (mm), from its two ends on the sheet
  function v6DimGeom(v, fr, dm, A, B) {
    if (dm.t === 'h') return { val: Math.abs(A.r - B.r), P1: v6RuToSheet(v, fr, A.r, dm.o), P2: v6RuToSheet(v, fr, B.r, dm.o) };
    if (dm.t === 'v') return { val: Math.abs(A.u - B.u), P1: v6RuToSheet(v, fr, dm.o, A.u), P2: v6RuToSheet(v, fr, dm.o, B.u) };
    const dr = B.r - A.r, du = B.u - A.u, l = Math.hypot(dr, du) || 1, nr = -du / l, nu = dr / l;
    return { val: l, P1: v6RuToSheet(v, fr, A.r + nr * dm.o, A.u + nu * dm.o), P2: v6RuToSheet(v, fr, B.r + nr * dm.o, B.u + nu * dm.o) };
  }
  function v6DrawDims(c2, o, R, frames, font, lw, fnt, arrow, hits, W, H) {
    const list = (V6S.dims['6v'] || []).slice(), lost = [];
    if (V6S.dt && V6S.dt.tmp) list.push(V6S.dt.tmp);
    for (const dm of list) {
      const v = R.views[dm.view], fr = frames[dm.view]; if (!v || !fr) continue;
      const A = v6DimLoc(R, frames, dm.view, dm.a), B = v6DimLoc(R, frames, dm.view, dm.b), tmp = V6S.dt && dm === V6S.dt.tmp;
      c2.save(); c2.lineWidth = Math.max(1, lw * 0.55); c2.font = fnt; c2.textAlign = 'center'; c2.textBaseline = 'bottom';
      if (!A || !B) {
        // reference lost: never shown as if it were still right
        lost.push(dm.id);
        const la = dm.la || [0.5, 0.5, 0.55, 0.5], x1 = la[0] * W, y1 = la[1] * H, x2 = la[2] * W, y2 = la[3] * H;
        c2.strokeStyle = c2.fillStyle = '#d32f2f'; c2.setLineDash([lw * 3, lw * 2]);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.setLineDash([]);
        c2.fillText('? ' + L('mất tham chiếu', 'reference lost'), (x1 + x2) / 2, (y1 + y2) / 2 - 0.3 * font);
        hits.push({ kind: 'dim', id: dm.id, lost: true, r: { x: Math.min(x1, x2) - font, y: Math.min(y1, y2) - 1.4 * font, w: Math.abs(x2 - x1) + 2 * font, h: Math.abs(y2 - y1) + 1.8 * font } });
        c2.restore(); continue;
      }
      const g = v6DimGeom(v, fr, dm, A, B), P1 = g.P1, P2 = g.P2;
      if (!tmp) { const r5 = function (x) { return Math.round(x * 1e5) / 1e5; }; dm.la = [r5(P1.x / W), r5(P1.y / H), r5(P2.x / W), r5(P2.y / H)]; }
      c2.strokeStyle = c2.fillStyle = tmp ? '#2f8cff' : '#111';
      const ext = function (S0, E) {
        const dx = E.x - S0.x, dy = E.y - S0.y, l = Math.hypot(dx, dy); if (l < 1e-6) return;
        const g0 = Math.min(0.4 * font, l * 0.3), ux = dx / l, uy = dy / l;
        c2.moveTo(S0.x + ux * g0, S0.y + uy * g0); c2.lineTo(E.x + ux * 0.5 * font, E.y + uy * 0.5 * font);
      };
      c2.beginPath(); ext(A, P1); ext(B, P2); c2.moveTo(P1.x, P1.y); c2.lineTo(P2.x, P2.y); c2.stroke();
      if (Math.hypot(P2.x - P1.x, P2.y - P1.y) > 1e-6) { arrow(P2.x, P2.y, P1.x, P1.y); arrow(P1.x, P1.y, P2.x, P2.y); }
      let ang = Math.atan2(P2.y - P1.y, P2.x - P1.x); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      const mx = (P1.x + P2.x) / 2, my = (P1.y + P2.y) / 2, txt = v6Txt(g.val, o.unit), tw = c2.measureText(txt).width;
      c2.translate(mx, my); c2.rotate(ang); c2.fillText(txt, 0, -0.25 * font);
      c2.restore();
      if (!tmp) {
        const xs = [A.x, B.x, P1.x, P2.x, mx - tw / 2, mx + tw / 2], ys = [A.y, B.y, P1.y, P2.y, my - 1.3 * font, my + 0.3 * font];
        const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
        hits.push({ kind: 'dim', id: dm.id, r: { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 }, P1: P1, P2: P2 });
      }
    }
    R.lostDims = lost;
  }
  function v6DimVal(id) {
    const R = V6S.prev, dm = v6Dim(id); if (!R || !dm || !R.frames) return null;
    const A = v6DimLoc(R, R.frames, dm.view, dm.a), B = v6DimLoc(R, R.frames, dm.view, dm.b); if (!A || !B) return null;
    return v6DimGeom(R.views[dm.view], R.frames[dm.view], dm, A, B).val;
  }
  function v6Dim(id) { return (V6S.dims['6v'] || []).find(function (d) { return d.id === id; }); }
  // dimension tool: pick two points on one view, then place the line (its direction picks horizontal / vertical / aligned)
  function v6DimTool(on) {
    V6S.dt = on ? { a: null, b: null, view: null, hov: null, tmp: null, redo: null } : null;
    V6S.dsel = null;
    if (on && V6S.mode !== '6v') { V6S.dt = null; flash(L('Kích thước ghi trên các view của tab 6 Views', 'Dimensions go on the views of the 6 Views tab')); }
    $('v6Prev').style.cursor = V6S.dt ? 'crosshair' : 'default';
    v6Paint();
    if (typeof dwSyncRibbon === 'function') dwSyncRibbon();
  }
  function v6DimRef(q) {
    const p = V6S.prev.sc6.preps.find(function (x) { return x.b.id === q.b; }); if (!p) return null;
    return { uid: dwUidOf(q.b), L: [p.P[3 * q.i], p.P[3 * q.i + 1], p.P[3 * q.i + 2]] };
  }
  function v6DimPlace(t) {
    const dt = V6S.dt, R = V6S.prev, fr = R.frames[dt.view], v = R.views[dt.view];
    const A = v6DimLoc(R, R.frames, dt.view, dt.a), B = v6DimLoc(R, R.frames, dt.view, dt.b); if (!A || !B) return null;
    const M = v6SheetToRu(v, fr, t.x, t.y), r0 = Math.min(A.r, B.r), r1 = Math.max(A.r, B.r), u0 = Math.min(A.u, B.u), u1 = Math.max(A.u, B.u);
    const oU = M.u > u1 ? M.u - u1 : M.u < u0 ? u0 - M.u : 0, oR = M.r > r1 ? M.r - r1 : M.r < r0 ? r0 - M.r : 0;
    const dm = { id: dt.redo || 0, view: dt.view, a: dt.a, b: dt.b };
    if (oU > 0 && (oR === 0 || oU >= oR)) { dm.t = 'h'; dm.o = M.u; }
    else if (oR > 0) { dm.t = 'v'; dm.o = M.r; }
    else { const dr = B.r - A.r, du = B.u - A.u, l = Math.hypot(dr, du) || 1; dm.t = 'a'; dm.o = ((M.r - A.r) * -du + (M.u - A.u) * dr) / l; }
    return dm;
  }
  function v6DimSnap(t) {
    const R = V6S.prev, Ly = V6S.lay; if (!R || !R.snaps || !Ly) return null;
    const lim = 10 * Ly.dpr / Ly.s; let best = null, bd = lim * lim;
    for (const q of R.snaps) { if (V6S.dt && V6S.dt.a && q.view !== V6S.dt.view) continue; const d = (q.x - t.x) * (q.x - t.x) + (q.y - t.y) * (q.y - t.y); if (d < bd) { bd = d; best = q; } }
    return best;
  }
  function v6DimClick(t) {
    const dt = V6S.dt, q = dt.hov;
    if (!dt.a) { if (q) { dt.a = v6DimRef(q); dt.view = q.view; dt.ap = q; } }
    else if (!dt.b) { if (q && !(q.b === dt.ap.b && q.i === dt.ap.i)) { dt.b = v6DimRef(q); dt.tmp = v6DimPlace(t); } }
    else {
      const dm = v6DimPlace(t);
      if (dm) {
        if (dt.redo) { const old = v6Dim(dt.redo); Object.assign(old, dm, { id: dt.redo }); delete old.la; V6S.dt = null; $('v6Prev').style.cursor = 'default'; }
        else { dm.id = V6S.seq++; V6S.dims['6v'].push(dm); V6S.dt = { a: null, b: null, view: null, hov: null, tmp: null, redo: null }; }
        V6S.dsel = dm.id;
      }
    }
    v6Paint();
    if (typeof dwSyncRibbon === 'function') dwSyncRibbon();
  }
  function v6DelDim(id) { const L2 = V6S.dims['6v'], d = v6Dim(id || V6S.dsel); if (d) L2.splice(L2.indexOf(d), 1); V6S.dsel = null; v6Paint(); }
  // one view at a time: delete it, or send it back to its automatic place
  function v6DelView(n) {
    if (n === 'iso') { $('v6Iso').checked = false; $('v6Iso').dispatchEvent(new Event('change', { bubbles: true })); }
    else { const c = document.querySelector('.v6v[data-v=' + n + ']'); if (c) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } }
    V6S.vsel = null; v6Preview();
  }
  function v6ViewAuto(n) { if (n === 'iso') V6S.iso = null; else if (V6S.pos) delete V6S.pos[n]; v6Preview(); }
  // Auto Arrange (6 views): the views keep their size and stay on their projection lines; columns and rows are
  // spread so the gaps between them equal the gaps to the sheet border. Each box includes its view name and the
  // overall dimensions drawn beside it; the scale note at the bottom counts as the border. The iso picture takes the
  // free cell that leaves the widest gaps (top right first).
  function v6AutoEven() {
    const R = V6S.prev; if (!R || !R.frames || !R.o || R.o.exp) return false;
    const o = R.o, k = R.k || 1, F = R.frames, M = v6Metrics(o), f = M.font, W = o.W, H = o.H;
    const names = Object.keys(R.views).filter(function (n) { return F[n]; }), iso = !!(R.iso && F.iso);
    if (!names.length && !iso) return false;
    const fx = ['front', 'back', 'top', 'bottom'].find(function (n) { return F[n] && R.views[n]; });
    const fy = ['right', 'left'].find(function (n) { return F[n] && R.views[n]; });
    const fz = ['right', 'front', 'left', 'back'].find(function (n) { return F[n] && R.views[n]; });
    // box of an item around its picture centre: half sizes l, r, u, d (sheet px at full size)
    const box = function (n) {
      const w = F[n].w / k, h = F[n].h / k, b = { l: w / 2, r: w / 2, u: h / 2, d: h / 2 };
      if (o.lbl) b.u += 1.7 * f;
      if (o.dim && n !== 'iso') {
        if (n === fx || n === fy) b.d += 3 * f;
        if (n === fz || (!fy && n === 'top')) b.l += 2.7 * f;
      }
      return b;
    };
    const items = names.map(function (n) { return { n: n, c: V6_COL[n], r: V6_ROW[n], b: box(n) }; });
    const avH = H - (o.scn ? 2.6 * f : 0);
    const plan = function (list) {
      const cols = {}, rows = {};
      for (const it of list) {
        const c = cols[it.c] || (cols[it.c] = { l: 0, r: 0 }), r = rows[it.r] || (rows[it.r] = { u: 0, d: 0 });
        c.l = Math.max(c.l, it.b.l); c.r = Math.max(c.r, it.b.r); r.u = Math.max(r.u, it.b.u); r.d = Math.max(r.d, it.b.d);
      }
      const ck = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; }), rk = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
      const sw = ck.reduce(function (s, c) { return s + cols[c].l + cols[c].r; }, 0), sh = rk.reduce(function (s, r) { return s + rows[r].u + rows[r].d; }, 0);
      const gx = (W - sw) / (ck.length + 1), gy = (avH - sh) / (rk.length + 1), cx = {}, cy = {};
      let x = gx; for (const c of ck) { cx[c] = x + cols[c].l; x += cols[c].l + cols[c].r + gx; }
      let y = gy; for (const r of rk) { cy[r] = y + rows[r].u; y += rows[r].u + rows[r].d + gy; }
      return { cx: cx, cy: cy, gx: gx, gy: gy };
    };
    let best = null;
    if (iso) {
      const used = {}; for (const it of items) used[it.r + ',' + it.c] = 1;
      const maxC = items.reduce(function (m, it) { return Math.max(m, it.c); }, -1);
      const cand = [[0, 2], [0, 3], [2, 2], [2, 3], [0, 0], [2, 0]];
      if (!items.some(function (it) { return it.r !== 1; })) cand.push([1, maxC + 1]);
      if (!items.length) cand.push([1, 1]);
      cand.forEach(function (rc, i) {
        if (used[rc[0] + ',' + rc[1]]) return;
        const it = { n: 'iso', c: rc[1], r: rc[0], b: box('iso') }, p = plan(items.concat([it])), sc = Math.min(p.gx, p.gy) - i * 1e-3 * Math.min(W, H);
        if (!best || sc > best.sc) best = { sc: sc, p: p, it: it };
      });
    }
    const p = best ? best.p : plan(items), fr = function (c, r) { return [(p.cx[c] !== undefined ? p.cx[c] : W / 2) / W, (p.cy[r] !== undefined ? p.cy[r] : avH / 2) / H]; };
    const ctr = fr(1, 1);
    V6S.pos = { front: ctr, left: fr(0, 1)[0], right: fr(2, 1)[0], back: fr(3, 1)[0], top: fr(1, 0)[1], bottom: fr(1, 2)[1] };
    V6S.iso = best ? fr(best.it.c, best.it.r) : null;
    return true;
  }
  // Auto Arrange (exploded): every part (with its name / material lines) keeps its size and is laid out in rows (height
  // order top to bottom, left to right inside a row) so the gaps in a row equal the gaps to the sides of its area and
  // the gaps between rows equal those to the top / bottom. The number of rows is the one that leaves the widest gaps.
  // Frames: a part inside or over a frame is laid out inside that frame; the other parts go into the largest free area
  // of the sheet that touches no frame (nor the totals box / scale note), so nothing lands on a frame.
  function v6Rows(list, A) {
    const W = A.x1 - A.x0, H = A.y1 - A.y0, byY = list.slice().sort(function (a, b) { return a.cy - b.cy || a.cx - b.cx; });
    const totW = list.reduce(function (s2, it) { return s2 + it.w; }, 0);
    let best = null;
    for (let nr = 1; nr <= list.length; nr++) {
      const rows = []; let cur = [], done = 0;
      for (let i = 0; i < byY.length; i++) {
        cur.push(byY[i]); done += byY[i].w;
        const left = byY.length - i - 1, need = nr - rows.length - 1;
        if (need > 0 && (left === need || done >= totW * (rows.length + 1) / nr)) { rows.push(cur); cur = []; }
      }
      if (cur.length) rows.push(cur);
      const rh = rows.map(function (r) { return Math.max.apply(null, r.map(function (it) { return it.h; })); });
      const gy = (H - rh.reduce(function (a, b) { return a + b; }, 0)) / (rows.length + 1);
      const gx = rows.map(function (r) { return (W - r.reduce(function (a, it) { return a + it.w; }, 0)) / (r.length + 1); });
      const sc = Math.min(gy, Math.min.apply(null, gx));
      if (!best || sc > best.sc + 1e-6) best = { sc: sc, rows: rows, rh: rh, gy: gy, gx: gx };
    }
    const out = [];
    let y = A.y0 + best.gy;
    best.rows.forEach(function (r, i) {
      r.sort(function (a, b) { return a.cx - b.cx; });
      let x = A.x0 + best.gx[i];
      for (const it of r) { out.push({ it: it, cx: x + it.w / 2, cy: y + best.rh[i] / 2 }); x += it.w + best.gx[i]; }
      y += best.rh[i] + best.gy;
    });
    return { sc: best.sc, out: out };
  }
  function v6AutoExp() {
    const R = V6S.prev; if (!R || !R.hits || !R.o || !R.o.exp) return false;
    const o = R.o, k = R.k || 1, M = v6Metrics(o), f = M.font, W = o.W, H = o.H;
    const items = [];
    for (const h of R.hits) {
      if (h.kind !== 'part' && h.kind !== 'label') continue;
      let it = items.find(function (x) { return x.id === h.id; });
      const r = { x0: h.r.x / k, y0: h.r.y / k, x1: (h.r.x + h.r.w) / k, y1: (h.r.y + h.r.h) / k };
      if (!it) { it = { id: h.id, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, pc: null }; items.push(it); }
      else { it.x0 = Math.min(it.x0, r.x0); it.y0 = Math.min(it.y0, r.y0); it.x1 = Math.max(it.x1, r.x1); it.y1 = Math.max(it.y1, r.y1); }
      if (h.kind === 'part') it.pc = [(h.r.x + h.r.w / 2) / k, (h.r.y + h.r.h / 2) / k];
    }
    if (!items.length) return false;
    items.forEach(function (it) { it.w = it.x1 - it.x0; it.h = it.y1 - it.y0; it.cx = (it.x0 + it.x1) / 2; it.cy = (it.y0 + it.y1) / 2; });
    // frames (full-size px) and what has to stay free
    const frames = (V6S.rects.exp || []).map(function (fr) {
      const lw = Math.max(1, (fr.lw || 0.5) * M.ppmm), tp = fr.title ? 1.4 * (fr.ts || 5) * M.ppmm : 0;
      return { id: fr.id, x0: fr.x * W, y0: fr.y * H, x1: (fr.x + fr.w) * W, y1: (fr.y + fr.h) * H, lw: lw, tp: tp, list: [] };
    });
    const out = [];
    for (const it of items) {
      let bf = null, ba = 0;
      for (const fr of frames) {
        const a = Math.max(0, Math.min(it.x1, fr.x1) - Math.max(it.x0, fr.x0)) * Math.max(0, Math.min(it.y1, fr.y1) - Math.max(it.y0, fr.y0));
        if (a > ba) { ba = a; bf = fr; }
      }
      if (bf) bf.list.push(it); else out.push(it);
    }
    for (const fr of frames) if (fr.list.length) {
      const r = v6Rows(fr.list, { x0: fr.x0 + fr.lw, y0: fr.y0 + fr.lw, x1: fr.x1 - fr.lw, y1: fr.y1 - fr.lw });
      r.out.forEach(v6ExpPut);
    }
    if (out.length) {
      const c = 0.6 * f, obs = frames.map(function (fr) { return { x0: fr.x0 - c, y0: fr.y0 - fr.tp - c, x1: fr.x1 + c, y1: fr.y1 + c }; });
      const th = R.hits.find(function (h) { return h.kind === 'tot'; });
      if (th) { const tw = th.r.w / k, thh = th.r.h / k, bx = W - 1.5 * f, by = H - 1.2 * f - (o.scn ? 1.7 * f : 0); obs.push({ x0: bx - tw - c, y0: by - thh - c, x1: W, y1: H }); }
      if (o.scn) obs.push({ x0: W * 0.55, y0: H - 2.6 * f, x1: W, y1: H });
      const xs = [0, W], ys = [0, H];
      for (const b of obs) { xs.push(b.x0, b.x1); ys.push(b.y0, b.y1); }
      const ux = Array.from(new Set(xs.map(function (v) { return Math.max(0, Math.min(W, v)); }))).sort(function (a, b) { return a - b; });
      const uy = Array.from(new Set(ys.map(function (v) { return Math.max(0, Math.min(H, v)); }))).sort(function (a, b) { return a - b; });
      const need = out.reduce(function (s2, it) { return s2 + it.w * it.h; }, 0), wMax = Math.max.apply(null, out.map(function (it) { return it.w; })), hMax = Math.max.apply(null, out.map(function (it) { return it.h; }));
      let best = null;
      for (let a = 0; a < ux.length; a++) for (let b = a + 1; b < ux.length; b++) {
        if (ux[b] - ux[a] < wMax) continue;
        for (let p = 0; p < uy.length; p++) for (let q = p + 1; q < uy.length; q++) {
          const A = { x0: ux[a], x1: ux[b], y0: uy[p], y1: uy[q] };
          if (A.y1 - A.y0 < hMax || (A.x1 - A.x0) * (A.y1 - A.y0) < need) continue;
          if (obs.some(function (o2) { return o2.x0 < A.x1 - 1e-6 && o2.x1 > A.x0 + 1e-6 && o2.y0 < A.y1 - 1e-6 && o2.y1 > A.y0 + 1e-6; })) continue;
          const r = v6Rows(out, A);
          if (!best || r.sc > best.sc) best = r;
        }
      }
      // nothing free is big enough: the whole sheet, above the totals strip
      if (!best) best = v6Rows(out, { x0: 0, y0: 0, x1: W, y1: H - (o.scn ? 2.6 * f : 0) - (th ? th.r.h / k + 1.2 * f : 0) });
      best.out.forEach(v6ExpPut);
    }
    function v6ExpPut(q) {
      const it = q.it, pt = R.parts.find(function (x) { return x.id === it.id; }), P = R.plan;
      if (!pt || !it.pc) return;
      const px = q.cx + (it.pc[0] - it.cx), py = q.cy + (it.pc[1] - it.cy);
      const ax = W / 2 + (pt.cx - P.bx) * R.sc, ay = H / 2 - (pt.cy - P.by) * R.sc;
      V6S.off[it.id] = [(px - ax) / W, (py - ay) / H];
    }
    V6S.tot = null;
    return true;
  }
  // default place of the iso picture: the free corner right of the Top view (or top right)
  function v6IsoDefault(o, R, pos) {
    const v = R.iso, W = o.W * (R.k || 1), H = o.H * (R.k || 1), x = Math.min(0.97 - v.w / 2 / W, Math.max(pos.right || 0.75, 0.62)), y = Math.max(0.03 + v.h / 2 / H, (pos.top !== undefined && o.views.top ? pos.top : 0.2));
    return [x, y];
  }

  // ---------- files
  const V6_CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function v6Crc(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = V6_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function v6Encode(cv, o) {
    const blob = await new Promise(function (res) { cv.toBlob(res, o.fmt === 'jpg' ? 'image/jpeg' : 'image/png', o.q); });
    const src = new Uint8Array(await blob.arrayBuffer());
    if (o.fmt === 'jpg') {      // JFIF density = DPI
      if (src[2] === 0xff && src[3] === 0xe0 && src[6] === 0x4a && src[7] === 0x46) { src[13] = 1; src[14] = o.dpi >> 8; src[15] = o.dpi & 255; src[16] = o.dpi >> 8; src[17] = o.dpi & 255; }
      return new Blob([src], { type: 'image/jpeg' });
    }
    const ppm = Math.round(o.dpi / 0.0254), ch = new Uint8Array(21), dv = new DataView(ch.buffer);   // PNG pHYs chunk after IHDR
    dv.setUint32(0, 9); ch.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); ch[16] = 1; dv.setUint32(17, v6Crc(ch.subarray(4, 17)));
    const out = new Uint8Array(src.length + 21); out.set(src.subarray(0, 33)); out.set(ch, 33); out.set(src.subarray(33), 54);
    return new Blob([out], { type: 'image/png' });
  }
  function v6Sheet(o, R, k) {
    const cv = document.createElement('canvas'); cv.width = Math.round(o.W * k); cv.height = Math.round(o.H * k);
    const c2 = cv.getContext('2d');
    if (o.bg === 'w') { c2.fillStyle = '#fff'; c2.fillRect(0, 0, cv.width, cv.height); }
    R.k = k; v6Compose(c2, o, R, k);
    return cv;
  }
  async function v6Full(fmt) {
    const o = v6Sync(); if (fmt) { o.fmt = fmt; if (fmt === 'png') o.bg = $('v6Bg').value; }
    setBusy(true, L('Đang dựng bản vẽ…', 'Drawing the sheet…'));
    await new Promise(function (r) { setTimeout(r, 30); });
    try { const R = await v6Render(o, 1, o.ss); return { blob: await v6Encode(v6Sheet(o, R, 1), o), o: o }; }
    finally { setBusy(false); }
  }

  // ---------- panel
  function v6Size(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function v6Sync() {
    const o = v6Opt(), px = $('v6Paper').value === 'px', exp = o.exp;
    document.querySelectorAll('.v6px').forEach(function (r) { r.style.display = px ? '' : 'none'; });
    document.querySelectorAll('.v6jpg').forEach(function (r) { r.style.display = o.fmt === 'jpg' ? '' : 'none'; });
    document.querySelectorAll('#pop_v6 .v6m6').forEach(function (r) { r.style.display = exp ? 'none' : ''; });
    document.querySelectorAll('#pop_v6 .v6mE').forEach(function (r) { r.style.display = exp ? '' : 'none'; });
    document.querySelectorAll('#pop_v6 .v6isorow').forEach(function (r) { r.style.display = exp || o.iso ? '' : 'none'; });
    $('v6ShT').textContent = exp ? 'Exploded view' : '6 view';
    document.querySelectorAll('#v6Seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === V6S.mode); });
    document.querySelectorAll('#pop_v6 .v6isok').forEach(function (r) { r.style.display = !exp && o.iso ? '' : 'none'; });
    document.querySelectorAll('#pop_v6 .v6scc').forEach(function (r) { r.style.display = $('v6Scale').value === 'c' ? '' : 'none'; });
    ['v6DimW', 'v6DimD', 'v6DimH'].forEach(function (id) { $(id).parentNode.style.display = exp ? 'none' : ''; }); $('v6Unit').style.display = exp ? 'none' : ''; $('v6Lbl').parentNode.style.display = exp ? 'none' : '';
    $('v6Ori').style.display = px ? 'none' : ''; $('v6Bg').disabled = o.fmt === 'jpg';
    $('v6One').style.display = o.col === 'one' ? '' : 'none';
    $('v6Zm').disabled = $('v6ZmR').disabled = o.scale > 0;
    $('v6LwIn').textContent = '(' + (o.lw / 25.4).toFixed(3) + ' in)';
    v6PartRow();
    return o;
  }
  function v6PartRow() {
    const b = V6S.mode === 'exp' && S.bodies.find(function (x) { return x.id === V6S.psel; });
    document.querySelectorAll('#pop_v6 .v6part').forEach(function (r) { r.style.display = b ? '' : 'none'; });
    if (!b) return;
    if (document.activeElement !== $('v6PName')) $('v6PName').value = b.name;
    $('v6PMat').value = MATS.some(function (m) { return m[0] === b.material; }) ? b.material : '';
    $('v6PMass').textContent = v6Mass(b) || L('chưa có vật liệu', 'no material');
  }
  function v6MatOpts(sel) {
    sel.innerHTML = '';
    for (const m of MATS) { const op = document.createElement('option'); op.value = m[0]; op.textContent = (lang === 'en' ? m[2] : m[1]) + (m[3] && m[0] !== 'custom' ? ' (' + m[3] + ')' : ''); sel.appendChild(op); }
  }
  // body changes made here go to the body itself (and so to the body list and Properties)
  function v6SetName(b, n) {
    n = (n || '').trim();
    if (!n || n === b.name) return;
    pushUndo(); b.name = ''; b.name = uniqueName(safe(n)); refresh();
  }
  function v6SetMat(b, key) {
    const m = MATS.find(function (x) { return x[0] === key; }); if (!m || key === b.material) return;
    pushUndo(); b.material = m[0]; if (m[0] !== 'custom') b.density = m[3]; else if (!b.density) b.density = 1;
    refresh();
  }
  function v6Info(o, P, est) {
    const wm = o.W / o.dpi * 25.4, hm = o.H / o.dpi * 25.4, mp = (o.W * o.H / 1e6).toFixed(1);
    let s = '<b>' + L('Khổ', 'Paper') + ':</b> ' + wm.toFixed(0) + ' × ' + hm.toFixed(0) + ' mm  |  ' + (wm / 25.4).toFixed(2) + ' × ' + (hm / 25.4).toFixed(2) + ' in<br>' +
      '<b>' + L('Ảnh', 'Picture') + ':</b> ' + o.W + ' × ' + o.H + ' px · ' + o.dpi + ' dpi · ' + mp + ' Mpx' + (o.cut ? L(' (đã giới hạn)', ' (capped)') : '') + '<br>';
    if (P) {
      const e = P.sc6.ext;
      s += '<b>' + L('Mô hình', 'Model') + ':</b> ' + e.map(function (v) { return v.toFixed(1); }).join(' × ') + ' mm  |  ' + e.map(function (v) { return (v / 25.4).toFixed(2); }).join(' × ') + ' in<br>' +
        '<b>' + L('Tỉ lệ', 'Scale') + ':</b> ' + v6Ratio(P.sc, o) + (o.scale > 0 ? '' : L(' (vừa khổ)', ' (fit)')) + '<br>';
    }
    s += '<b>' + L('Dung lượng dự kiến', 'Expected size') + ':</b> <span id="v6Est">' + (est ? '≈ ' + v6Size(est) + ' (' + o.fmt.toUpperCase() + ')' : '…') + '</span>';
    $('v6Info').innerHTML = s;
  }

  // ---------- preview
  let v6Timer = 0, v6Busy = false, v6Again = false;
  function v6Preview() { clearTimeout(v6Timer); v6Timer = setTimeout(v6PreviewNow, 180); }
  // the sheet window is a viewport: the sheet sits at V6S.vz x the fitting size, shifted by V6S.vp (css px); zoom and pan only
  // repaint the pictures already rendered (scaled), a new render is made later and only when the zoom changed a lot
  function v6Layout(o) {
    const body = document.querySelector('#v6Sheet .v6body'), pc = $('v6Prev'), dpr = window.devicePixelRatio || 1;
    const bw = Math.max(100, body.clientWidth), bh = Math.max(80, body.clientHeight);
    if (pc.width !== Math.round(bw * dpr) || pc.height !== Math.round(bh * dpr)) { pc.width = Math.round(bw * dpr); pc.height = Math.round(bh * dpr); }
    pc.style.width = bw + 'px'; pc.style.height = bh + 'px'; pc.style.left = '0px'; pc.style.top = '0px';
    const fit = Math.min((bw - 16) / o.W, (bh - 16) / o.H), cw = o.W * fit * V6S.vz, ch = o.H * fit * V6S.vz;
    const x0 = (bw - cw) / 2 + V6S.vp[0], y0 = (bh - ch) / 2 + V6S.vp[1];
    return { dpr: dpr, bw: bw, bh: bh, x0: x0, y0: y0, cw: cw, ch: ch, kd: cw * dpr / o.W };
  }
  // render size of the preview: the screen size; after zooming in, 1.8x ahead so the next zoom steps need no new render
  function v6WantK(o, L, ahead) { return Math.min(L.kd * (ahead || 1), Math.sqrt(V6_PREVPX / (o.W * o.H))); }
  async function v6PreviewNow() {
    if (!v6Act) return;
    if (v6Busy) { v6Again = true; return; }
    v6Busy = true;
    const o = v6Sync(), pc = $('v6Prev');
    try {
      const L = v6Layout(o), k = v6WantK(o, L, V6S.vz > 1.05 ? V6S.kx || 1 : 1), big = o.W * o.H * k * k;
      V6S.prev = Object.assign(await v6Render(o, k, big > 3e6 ? 1 : Math.min(2, o.ss), true), { o: o, k: k });
      v6Paint();
      $('v6Zoom').textContent = o.W + ' × ' + o.H + ' px';
      // expected size: a small copy of the sheet encoded the same way, scaled up by area (larger pictures compress better)
      if (big <= 2.5e6 || !V6S.est) {
        v6Info(o, V6S.prev, V6S.est);
        const b = await new Promise(function (r) { v6Sheet(o, V6S.prev, k).toBlob(r, o.fmt === 'jpg' ? 'image/jpeg' : 'image/png', o.q); });
        V6S.est = b.size * Math.pow(1 / (k * k), 0.76) + 2048;
      }
      V6S.prev.k = k;
      v6Info(o, V6S.prev, V6S.est);
    } catch (e) {
      const g = pc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, pc.width, pc.height); g.fillStyle = '#a33'; g.font = '13px sans-serif'; g.fillText(e.message, 10, 22);
      V6S.prev = null; v6Info(o, null, 0);
    } finally { v6Busy = false; if (v6Again) { v6Again = false; v6Preview(); } }
  }
  // Smooth preview: zoom, pan and hover only scale a cached bitmap of the composed sheet (drawn once at the render size)
  // and redraw the selection boxes; the sharp vector compose at screen resolution follows once the mouse rests.
  let v6Raf = 0, v6RafFull = false, v6RafHov, v6CrispT = 0;
  const v6Cache = { cv: null, gen: -1, q: null };
  function v6PaintFast() { v6Sched(false); }
  function v6PaintSoon(h) { v6RafHov = h; v6Sched(true); }
  function v6Sched(full) {
    v6RafFull = v6RafFull || full;
    if (v6Raf) return;
    v6Raf = requestAnimationFrame(function () { const f = v6RafFull; v6Raf = 0; v6RafFull = false; if (f) v6Paint(v6RafHov); else v6Paint(V6S.hov, true); });
  }
  function v6CacheGet(q, hs) {
    if (v6Cache.cv && v6Cache.gen === V6S.cgen && v6Cache.q === q) return v6Cache.cv;
    const o = q.o, w = Math.max(1, Math.round(o.W * q.k)), h = Math.max(1, Math.round(o.H * q.k));
    const cv = v6Cache.cv && v6Cache.cv.width === w && v6Cache.cv.height === h ? v6Cache.cv : document.createElement('canvas');
    cv.width = w; cv.height = h;
    // the cached copy must not change the drawing state (dimension label anchors are written while composing)
    const g = cv.getContext('2d'), hits = q.hits, dl = (V6S.dims[V6S.mode] || []).map(function (d) { return d.la; });
    V6S.hs = hs; v6Compose(g, o, q, q.k); V6S.hs = 0; q.hits = hits;
    (V6S.dims[V6S.mode] || []).forEach(function (d, i) { if (dl[i] === undefined) delete d.la; else d.la = dl[i]; });
    v6Cache.cv = cv; v6Cache.gen = V6S.cgen; v6Cache.q = q;
    return cv;
  }
  function v6Paint(hover, fast) {
    const q = V6S.prev, pc = $('v6Prev'); if (!q) return;
    if (hover === undefined) hover = V6S.hov;
    if (!fast) { V6S.cgen = (V6S.cgen || 0) + 1; clearTimeout(v6CrispT); }
    else if (!q.hits) fast = false;
    const c2 = pc.getContext('2d'), o = q.o, L = v6Layout(o), dpr = L.dpr, s = L.kd / q.k;
    const sx = L.x0 * dpr, sy = L.y0 * dpr, sw = L.cw * dpr, sh = L.ch * dpr;
    V6S.lay = { ox: sx, oy: sy, s: s, dpr: dpr, W: o.W * q.k, H: o.H * q.k };
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.fillStyle = '#3a434f'; c2.fillRect(0, 0, pc.width, pc.height);
    c2.save(); c2.shadowColor = 'rgba(0,0,0,.5)'; c2.shadowBlur = 10 * dpr; c2.shadowOffsetY = 2 * dpr; c2.fillStyle = '#fff'; c2.fillRect(sx, sy, sw, sh); c2.restore();
    c2.save(); c2.beginPath(); c2.rect(sx, sy, sw, sh); c2.clip();
    if (o.bg !== 'w') {
      const t = Math.max(6, Math.round(12 * dpr)), x0 = Math.max(sx, 0), y0 = Math.max(sy, 0), x1 = Math.min(sx + sw, pc.width), y1 = Math.min(sy + sh, pc.height);
      c2.fillStyle = '#e9e9e9';
      for (let y = y0 - ((y0 - sy) % t); y < y1; y += t) for (let x = x0 - ((x0 - sx) % t); x < x1; x += t) if ((Math.round((x - sx) / t) + Math.round((y - sy) / t)) % 2) c2.fillRect(x, y, t, t);
    }
    c2.setTransform(s, 0, 0, s, sx, sy);
    if (fast) {
      const cv = v6CacheGet(q, 7 * dpr / s);
      c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = s > 1.5 ? 'low' : 'medium';
      c2.drawImage(cv, 0, 0, o.W * q.k, o.H * q.k);
      clearTimeout(v6CrispT); v6CrispT = setTimeout(function () { if (!V6S.pan && !V6S.drag) v6Paint(V6S.hov); }, V6_REST);
    } else {
      V6S.hs = 7 * dpr / s;
      q.hits = v6Compose(c2, o, q, q.k);
      V6S.hs = 0;
      // cached copy for the next zoom / pan, keeps the same generation as this compose
      v6Cache.gen = -1;
    }
    const u = dpr / s;
    const box = function (h, col, fill) {
      c2.save(); if (fill) { c2.fillStyle = fill; c2.fillRect(h.r.x - 4 * u, h.r.y - 4 * u, h.r.w + 8 * u, h.r.h + 8 * u); }
      c2.strokeStyle = col; c2.lineWidth = (fill ? 2.5 : 1.5) * u; c2.setLineDash(fill ? [] : [5 * u, 4 * u]); c2.strokeRect(h.r.x - 4 * u, h.r.y - 4 * u, h.r.w + 8 * u, h.r.h + 8 * u); c2.restore();
    };
    if (V6S.comb !== null) {
      // combine: the chosen part in blue, parts of the same mass light up in orange
      const cand = v6CombCands();
      for (const h of q.hits) if (h.kind === 'part') {
        if (h.id === V6S.comb) box(h, '#2f8cff', 'rgba(47,140,255,.10)');
        else if (cand.has(h.id)) box(h, hover && hover.id === h.id ? '#ff8a00' : '#f0a030', hover && hover.id === h.id ? 'rgba(255,150,0,.32)' : 'rgba(240,160,48,.18)');
      }
    } else for (const h of q.hits) {
      if ((h.kind === 'note' && (h.id === V6S.nsel || V6S.nsels.indexOf(h.id) >= 0)) || ((h.kind === 'part' || h.kind === 'label') && h.id === V6S.psel)) box(h, '#f0a030');
      else if (hover && h === hover) box(h, '#2f8cff');
    }
    if (V6S.comb === null) for (const h of q.hits) {
      if ((h.kind === 'view' && h.n === V6S.vsel) || (h.kind === 'iso' && V6S.vsel === 'iso') || (h.kind === 'dim' && h.id === V6S.dsel)) box(h, '#f0a030');
    }
    // the picked frame: dashed outline + resize handle
    const fr0 = V6S.rsel !== null && (V6S.rects[V6S.mode] || []).find(function (f) { return f.id === V6S.rsel; });
    if (fr0) {
      const W2 = o.W * q.k, H2 = o.H * q.k;
      c2.save(); c2.strokeStyle = '#2f8cff'; c2.lineWidth = 1.5 * u; c2.setLineDash([5 * u, 4 * u]); c2.strokeRect(fr0.x * W2 - 4 * u, fr0.y * H2 - 4 * u, fr0.w * W2 + 8 * u, fr0.h * H2 + 8 * u);
      c2.setLineDash([]); c2.fillStyle = '#2f8cff'; c2.fillRect((fr0.x + fr0.w) * W2 - 5 * u, (fr0.y + fr0.h) * H2 - 5 * u, 10 * u, 10 * u); c2.restore();
    }
    if (V6S.snapG) {
      const W2 = o.W * q.k, H2 = o.H * q.k;
      c2.save(); c2.strokeStyle = '#2f8cff'; c2.lineWidth = 1 * u; c2.setLineDash([6 * u, 4 * u]); c2.beginPath();
      for (const x of V6S.snapG.x) { c2.moveTo(x * W2, 0); c2.lineTo(x * W2, H2); }
      for (const y of V6S.snapG.y) { c2.moveTo(0, y * H2); c2.lineTo(W2, y * H2); }
      c2.stroke(); c2.restore();
    }
    if (V6S.rt && V6S.rt.a) {
      const a = V6S.rt.a, b = V6S.rt.b || a;
      c2.save(); c2.strokeStyle = $('v6Rc').value; c2.lineWidth = 1.5 * u; c2.setLineDash([6 * u, 4 * u]); c2.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); c2.restore();
    }
    if (V6S.dt) {
      const dot = function (q, fill) { c2.beginPath(); c2.arc(q.x, q.y, 5 * u, 0, Math.PI * 2); c2.lineWidth = 1.5 * u; c2.strokeStyle = '#ff7a00'; if (fill) { c2.fillStyle = '#ff7a00'; c2.fill(); } c2.stroke(); };
      if (V6S.dt.ap) dot(V6S.dt.ap, true);
      if (V6S.dt.hov) dot(V6S.dt.hov, false);
    }
    const isoH = q.hits.find(function (h) { return h.kind === 'isoR'; });
    if (isoH && hover && (hover.kind === 'iso' || hover.kind === 'isoR')) {
      c2.save(); c2.fillStyle = '#2f8cff'; c2.strokeStyle = '#fff'; c2.lineWidth = u;
      const r = isoH.r, a = r.w * 0.36; c2.fillRect(r.x + r.w / 2 - a, r.y + r.h / 2 - a, 2 * a, 2 * a); c2.strokeRect(r.x + r.w / 2 - a, r.y + r.h / 2 - a, 2 * a, 2 * a); c2.restore();
    }
    c2.restore(); c2.setTransform(1, 0, 0, 1, 0, 0);
  }
  // sheet (render) coordinates -> client rect, for the editor and tests
  function v6Scr(r) {
    const L = V6S.lay, pc = $('v6Prev'); if (!L) return null;
    const b = pc.getBoundingClientRect();
    return { x: b.left + (L.ox + r.x * L.s) / L.dpr, y: b.top + (L.oy + r.y * L.s) / L.dpr, w: r.w * L.s / L.dpr, h: r.h * L.s / L.dpr };
  }
  function v6Hit(e) {
    const q = V6S.prev, Ly = V6S.lay; if (!q || !q.hits || !Ly) return null;
    const pc = $('v6Prev'), r = pc.getBoundingClientRect();
    if (!r.width) return null;
    const x = ((e.clientX - r.left) * Ly.dpr - Ly.ox) / Ly.s, y = ((e.clientY - r.top) * Ly.dpr - Ly.oy) / Ly.s, m = 6 * Ly.dpr / Ly.s;
    let best = null;
    for (const h of q.hits) if (x >= h.r.x - m && x <= h.r.x + h.r.w + m && y >= h.r.y - m && y <= h.r.y + h.r.h + m) {
      // notes and labels over pictures
      const rank = { isoR: 4, rectR: 4, note: 3, tot: 3, dim: 3, odim: 3, rect: 2.5, label: 2, part: 1, iso: 1, view: 0 };
      if (!best || rank[h.kind] >= rank[best.kind]) best = h;
    }
    return { h: best, x: x, y: y };
  }
  // ---------- zoom / pan of the preview
  function v6ZoomUI() { $('v6Vz').value = $('v6VzR').value = Math.round(V6S.vz * 100); }
  function v6ZoomTo(z, mx, my) {
    z = Math.max(0.25, Math.min(12, z));
    const f = z / V6S.vz; if (Math.abs(f - 1) < 1e-4) return;
    if (mx === undefined) { mx = 0; my = 0; }
    V6S.vp = [mx - (mx - V6S.vp[0]) * f, my - (my - V6S.vp[1]) * f];
    if (z <= 1.0001) V6S.vp = [V6S.vp[0] * Math.min(1, z), V6S.vp[1] * Math.min(1, z)];
    V6S.vz = z; v6ZoomUI(); v6PaintFast();
    v6ZoomCheck();
  }
  let v6ZTimer = 0;
  function v6ZoomCheck() {
    clearTimeout(v6ZTimer);
    v6ZTimer = setTimeout(function () {
      const q = V6S.prev; if (!q) return;
      const want = v6WantK(q.o, v6Layout(q.o));
      if (want > q.k * 1.2) { V6S.kx = 1.8; v6PreviewNow(); }
      else if (want < q.k * 0.3) { V6S.kx = 1; v6PreviewNow(); }
    }, V6_REST);
  }
  function v6Fit() { V6S.vz = 1; V6S.vp = [0, 0]; v6ZoomUI(); v6PaintFast(); v6ZoomCheck(); }
  // ---------- combine parts of the same mass into one picture (exploded view)
  function v6CombCands() {
    const q = V6S.prev, out = new Set(); if (!q || V6S.comb === null) return out;
    const lead = S.bodies.find(function (b) { return b.id === V6S.comb; }); if (!lead) return out;
    for (const pt of q.parts) if (pt.id !== lead.id && v6Same(pt.b, lead)) out.add(pt.id);
    return out;
  }
  function v6CombStart(id) { V6S.comb = id; V6S.psel = id; v6Paint(); if (!v6CombCands().size) { flash(L('Không có body nào cùng khối lượng', 'No body with the same mass')); V6S.comb = null; v6Paint(); } }
  function v6CombEnd() { if (V6S.comb === null) return; V6S.comb = null; v6Paint(); }
  function v6CombAdd(id) {
    const Ld = V6S.comb, g = (V6S.grp[Ld] || []).slice();
    for (const x of [id].concat(V6S.grp[id] || [])) if (g.indexOf(x) < 0 && x !== Ld) g.push(x);
    delete V6S.grp[id]; delete V6S.off[id]; V6S.grp[Ld] = g;
    // one render later the member is gone; stay in combine mode while other parts of that mass are left
    v6PreviewNow().then(function () { if (V6S.comb !== null && !v6CombCands().size) v6CombEnd(); });
  }
  function v6Uncomb(id) { delete V6S.grp[id]; v6Preview(); }
  function v6Note(id) { return V6S.notes[V6S.mode].find(function (n) { return n.id === id; }); }
  // inline editor over the sheet: a note's text, or a part's name + material
  function v6Edit(h) {
    const ed = $('v6Ed'), t = $('v6EdT'), ms = $('v6EdM'), br = document.querySelector('#v6Sheet .v6body').getBoundingClientRect(), sr = v6Scr(h.r);
    let b = null, n = null;
    let fr = null;
    if (h.kind === 'note') { n = v6Note(h.id); t.value = n.text; t.rows = Math.max(2, n.text.split('\n').length); ms.style.display = 'none'; }
    else if (h.kind === 'rect') { fr = v6Rect(h.id); if (!fr) return; t.value = fr.title || ''; t.rows = 1; ms.style.display = 'none'; }
    else { b = S.bodies.find(function (x) { return x.id === h.id; }); if (!b) return; t.value = b.name; t.rows = 1; v6MatOpts(ms); ms.value = MATS.some(function (m) { return m[0] === b.material; }) ? b.material : ''; ms.style.display = ''; }
    ed.style.display = 'block';
    ed.style.left = Math.max(0, Math.min(br.width - 220, sr.x - br.left)) + 'px';
    ed.style.top = Math.max(0, Math.min(br.height - 110, sr.y + sr.h - br.top + 4)) + 'px';
    t.focus(); t.select();
    V6S.edit = { n: n, b: b, f: fr };
  }
  function v6EditDone(ok) {
    const E = V6S.edit; $('v6Ed').style.display = 'none'; V6S.edit = null;
    if (!E || !ok) return;
    if (E.f) { E.f.title = $('v6EdT').value.replace(/\n/g, ' ').trim(); v6Paint(); return; }
    if (E.n) { const v = $('v6EdT').value; if (v.trim()) E.n.text = v; else { const L2 = V6S.notes[V6S.mode]; L2.splice(L2.indexOf(E.n), 1); V6S.nsel = null; V6S.nsels = []; } v6Paint(); }
    else if (E.b) { v6SetName(E.b, $('v6EdT').value.replace(/\n/g, ' ')); v6SetMat(E.b, $('v6EdM').value); v6PartRow(); v6Paint(); v6Preview(); }
  }
  $('v6EdOk').addEventListener('click', function () { v6EditDone(true); });
  $('v6EdNo').addEventListener('click', function () { v6EditDone(false); });
  $('v6EdT').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (!V6S.edit || !V6S.edit.n || !e.shiftKey)) { e.preventDefault(); v6EditDone(true); }
    else if (e.key === 'Escape') { e.preventDefault(); v6EditDone(false); }
    e.stopPropagation();
  });
  (function () {
    const pc = $('v6Prev');
    pc.addEventListener('mousedown', function (e) {
      if (e.button === 1) { V6S.pan = { x: e.clientX, y: e.clientY, vp: V6S.vp.slice() }; e.preventDefault(); return; }
      if (e.button !== 0) return;
      const t = v6Hit(e); if (!t) return;
      const h = t.h;
      if (V6S.comb !== null) {
        const id = h && (h.kind === 'part' || h.kind === 'label') ? h.id : null;
        if (id !== null && v6CombCands().has(id)) v6CombAdd(id); else v6CombEnd();
        e.preventDefault(); return;
      }
      if (V6S.dt) { V6S.dt.hov = v6DimSnap(t); v6DimClick(t); e.preventDefault(); return; }
      if (V6S.rt) { V6S.rt.a = [t.x, t.y]; V6S.rt.b = null; e.preventDefault(); return; }
      V6S.rsel = h && (h.kind === 'rect' || h.kind === 'rectR') ? h.id : null;
      if (V6S.rsel !== null) v6RectCtl();
      V6S.vsel = h && h.kind === 'view' ? h.n : h && (h.kind === 'iso' || h.kind === 'isoR') ? 'iso' : null;
      V6S.dsel = h && h.kind === 'dim' ? h.id : null;
      if (h && h.kind === 'dim') { V6S.drag = { h: h, x: t.x, y: t.y, dim: h.id }; v6Paint(h); e.preventDefault(); return; }
      if (h && h.kind === 'odim') { V6S.nsel = null; V6S.nsels = []; V6S.drag = { h: h, x: t.x, y: t.y }; v6Paint(h); e.preventDefault(); return; }
      if (!h) V6S.pan = { x: e.clientX, y: e.clientY, vp: V6S.vp.slice() };
      if (V6S.edit) v6EditDone(true);
      // notes: each click on a note adds it to the picked set, a click on anything else (or empty space) clears it
      if (h && h.kind === 'note') { V6S.nsel = h.id; if (V6S.nsels.indexOf(h.id) < 0) V6S.nsels.push(h.id); }
      else { V6S.nsel = null; V6S.nsels = []; }
      if (h && (h.kind === 'part' || h.kind === 'label')) V6S.psel = h.id; else if (h) V6S.psel = null;
      if (h && h.kind === 'note') v6NoteCtl(v6Note(h.id));
      v6PartRow(); v6Paint(h);
      v6PickToList(h);
      if (typeof dwRefresh === 'function') dwRefresh(false);
      if (!h) return;
      // placements are taken over only when something is really moved (a click alone changes nothing)
      const pos0 = Object.assign({}, V6S.prev.pos, V6S.pos || {}), iso0 = V6S.iso || ((h.kind === 'iso' || h.kind === 'isoR') && V6S.prev.iso ? v6IsoDefault(V6S.prev.o, V6S.prev, pos0) : null);
      const tot0 = V6S.tot || (V6S.prev.totPos || [0.95, 0.95]).slice();
      if (h.kind === 'rect' || h.kind === 'rectR') {
        const f = v6Rect(h.id); V6S.drag = { h: h, x: t.x, y: t.y, rect: [f.x, f.y, f.w, f.h] }; e.preventDefault(); return;
      }
      if (h.kind === 'isoR') {
        const f = V6S.prev.hits.find(function (x) { return x.kind === 'iso'; }).r, c = [f.x + f.w / 2, f.y + f.h / 2];
        V6S.drag = { h: h, x: t.x, y: t.y, c: c, d0: Math.max(4, Math.hypot(t.x - c[0], t.y - c[1])), k0: V6S.prev.o.isoK, k: V6S.prev.o.isoK };
        if (!V6S.iso) V6S.iso = iso0;
        e.preventDefault(); return;
      }
      V6S.drag = { tot: tot0.slice(), h: h, x: t.x, y: t.y, pos: JSON.parse(JSON.stringify(pos0)), iso: iso0 && iso0.slice(), off: (V6S.off[h.id] || [0, 0]).slice(), note: h.kind === 'note' ? [v6Note(h.id).x, v6Note(h.id).y] : null,
        notes: h.kind === 'note' ? v6NSel().map(function (n) { return [n, n.x, n.y]; }) : null };
      e.preventDefault();
    });
    pc.addEventListener('dblclick', function (e) { const t = v6Hit(e); if (t && t.h && (t.h.kind === 'note' || t.h.kind === 'label' || t.h.kind === 'part' || t.h.kind === 'rect')) v6Edit(t.h); else if (t && !t.h) v6Fit(); });
    pc.addEventListener('wheel', function (e) {
      if (!V6S.prev) return;
      e.preventDefault();
      const r = pc.getBoundingClientRect();
      v6ZoomTo(V6S.vz * Math.exp(-Math.max(-300, Math.min(300, e.deltaY * (e.deltaMode ? 30 : 1))) * 0.0018), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    }, { passive: false });
    pc.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (V6S.comb !== null) { v6CombEnd(); return; }
      const t = v6Hit(e), h = t && t.h;
      if (V6S.dt) { v6DimTool(false); return; }
      if (h && h.kind === 'dim') {
        V6S.dsel = h.id; v6Paint(h);
        showMenu([[L('Chọn lại điểm', 'Pick the points again'), function () { v6DimTool(true); if (V6S.dt) V6S.dt.redo = h.id; }, 'edit'], [L('Xoá kích thước', 'Delete dimension'), function () { v6DelDim(h.id); }, 'del']], e.clientX, e.clientY);
        return;
      }
      if (h && h.kind === 'note') {
        if (V6S.nsels.indexOf(h.id) < 0) V6S.nsels = [h.id];
        const n = v6Note(h.id); V6S.nsel = h.id; v6NoteCtl(n); v6Paint(h);
        const sel = v6NSel(), cnt = sel.length > 1 ? ' (' + sel.length + ')' : '';
        const al = function (a) { return function () { v6NoteAlign(sel, a); }; }, tg = function (k2) { return function () { const on = !n[k2]; sel.forEach(function (x) { x[k2] = on; }); v6NoteCtl(n); v6Paint(); }; };
        const ck = function (on, t) { return (on ? '✓ ' : '') + t; };
        showMenu([[L('Căn trái khổ giấy', 'Align to paper left') + cnt, al('left'), 'dot'], [L('Căn giữa khổ giấy', 'Centre on the paper') + cnt, al('center'), 'dot'], [L('Căn phải khổ giấy', 'Align to paper right') + cnt, al('right'), 'dot'], null,
          [L('Căn trên khổ giấy', 'Align to paper top') + cnt, al('top'), 'dot'], [L('Căn giữa theo chiều dọc', 'Centre vertically') + cnt, al('middle'), 'dot'], [L('Căn dưới khổ giấy', 'Align to paper bottom') + cnt, al('bottom'), 'dot'], null,
          [ck(n.bold, L('Đậm', 'Bold')), tg('bold'), 'dot'], [ck(n.italic, L('Nghiêng', 'Italic')), tg('italic'), 'dot'], [ck(n.under, L('Gạch chân', 'Underline')), tg('under'), 'dot'], null,
          [L('Sao chép', 'Copy') + '  Ctrl+C', function () { v6NoteCopy(); }, 'dot'], [L('Dán', 'Paste') + '  Ctrl+V', function () { v6NotePaste(); }, 'dot'],
          [L('Sửa chữ', 'Edit text'), function () { v6Edit(h); }, 'ren'], [L('Xoá ghi chú', 'Delete note') + cnt, function () { v6DelNote(); }, 'del']], e.clientX, e.clientY);
        return;
      }
      if (h && (h.kind === 'rect' || h.kind === 'rectR')) {
        V6S.rsel = h.id; v6RectCtl(); v6Paint(h);
        const ht = V6S.prev.hits.find(function (x) { return x.kind === 'rect' && x.id === h.id && x.title; }) || h;
        showMenu([[L('Sửa tên khung', 'Rename frame'), function () { v6Edit(Object.assign({}, ht, { kind: 'rect' })); }, 'ren'], [L('Xoá khung', 'Delete frame'), function () { v6DelRect(); }, 'del']], e.clientX, e.clientY);
        return;
      }
      if (h && V6S.mode === '6v' && (h.kind === 'view' || h.kind === 'iso')) {
        const n = h.kind === 'iso' ? 'iso' : h.n; V6S.vsel = n; v6Paint(h);
        showMenu([[L('Xoá view', 'Delete view'), function () { v6DelView(n); }, 'del'], [L('Về vị trí tự động', 'Back to the automatic place'), function () { v6ViewAuto(n); }, 'home']], e.clientX, e.clientY);
        return;
      }
      if (!h || V6S.mode !== 'exp' || (h.kind !== 'part' && h.kind !== 'label')) return;
      V6S.psel = h.id; v6PartRow(); v6Paint(h);
      const items = [[L('Combine (gộp body cùng khối lượng)', 'Combine (bodies of the same mass)'), function () { v6CombStart(h.id); }, 'merge']];
      if ((V6S.grp[h.id] || []).length) items.push([L('Tách ra', 'Uncombine'), function () { v6Uncomb(h.id); }, 'split']);
      showMenu(items, e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
      if (!V6S.prev) return;
      if (V6S.pan) { V6S.vp = [V6S.pan.vp[0] + e.clientX - V6S.pan.x, V6S.pan.vp[1] + e.clientY - V6S.pan.y]; pc.style.cursor = 'grabbing'; v6PaintFast(); return; }
      const t = v6Hit(e); if (!t) return;
      if (V6S.rt) { if (V6S.rt.a) { V6S.rt.b = [t.x, t.y]; v6PaintFast(); } if (e.target === pc) pc.style.cursor = 'crosshair'; return; }
      if (V6S.dt && !V6S.drag) {
        if (e.target !== pc) return;
        V6S.dt.hov = v6DimSnap(t);
        if (V6S.dt.a && V6S.dt.b) V6S.dt.tmp = v6DimPlace(t);
        pc.style.cursor = 'crosshair'; v6PaintSoon(); return;
      }
      if (V6S.drag && V6S.drag.dim) {
        const dm = v6Dim(V6S.drag.dim), R = V6S.prev, v = dm && R.views[dm.view], fr = dm && R.frames[dm.view];
        if (dm && v && fr) {
          const A = v6DimLoc(R, R.frames, dm.view, dm.a), B = v6DimLoc(R, R.frames, dm.view, dm.b), M = v6SheetToRu(v, fr, t.x, t.y);
          if (A && B) { if (dm.t === 'h') dm.o = M.u; else if (dm.t === 'v') dm.o = M.r; else { const dr = B.r - A.r, du = B.u - A.u, l = Math.hypot(dr, du) || 1; dm.o = ((M.r - A.r) * -du + (M.u - A.u) * dr) / l; } }
        }
        v6PaintSoon(V6S.drag.h); return;
      }
      if (!V6S.drag) {
        if (e.target !== pc) return;
        const h = t.h;
        pc.style.cursor = V6S.comb !== null ? (h && v6CombCands().has(h.id) ? 'copy' : 'default') : !h ? 'grab' : h.kind === 'isoR' || h.kind === 'rectR' ? 'nwse-resize' : h.kind === 'odim' ? (h.t === 'h' ? 'ns-resize' : 'ew-resize') : h.kind === 'view' ? (h.n === 'front' ? 'move' : (h.n === 'top' || h.n === 'bottom') ? 'ns-resize' : 'ew-resize') : 'move';
        if (h !== V6S.hov) { V6S.hov = h; v6PaintFast(); }
        return;
      }
      const D = V6S.drag, h = D.h, dx = (t.x - D.x) / V6S.lay.W, dy = (t.y - D.y) / V6S.lay.H;
      if (Math.abs(t.x - D.x) + Math.abs(t.y - D.y) > 2 * V6S.lay.dpr / V6S.lay.s) D.moved = true;
      if (!D.moved && h.kind !== 'isoR') return;
      if (h.kind === 'view') {
        const P = JSON.parse(JSON.stringify(D.pos));
        if (h.n === 'front') { P.front = [P.front[0] + dx, P.front[1] + dy]; ['left', 'right', 'back'].forEach(function (k) { P[k] += dx; }); ['top', 'bottom'].forEach(function (k) { P[k] += dy; }); }
        else if (h.n === 'top' || h.n === 'bottom') P[h.n] += dy;
        else P[h.n] += dx;
        V6S.pos = P;
      } else if (h.kind === 'iso') V6S.iso = [D.iso[0] + dx, D.iso[1] + dy];
      else if (h.kind === 'part' || h.kind === 'label') V6S.off[h.id] = [D.off[0] + dx, D.off[1] + dy];
      else if (h.kind === 'note') { for (const q of D.notes) { q[0].x = q[1] + dx; q[0].y = q[2] + dy; } }
      else if (h.kind === 'odim') { if (!V6S.odo) V6S.odo = {}; const px = h.t === 'h' ? t.y - h.base : h.base - t.x; V6S.odo[h.key] = Math.round(Math.max(h.min, px) / h.pk * 100) / 100; }
      else if (h.kind === 'tot') V6S.tot = [D.tot[0] + dx, D.tot[1] + dy];
      else if (h.kind === 'rect') { const f = v6Rect(h.id); f.x = D.rect[0] + dx; f.y = D.rect[1] + dy; v6RectSnap(f, false); }
      else if (h.kind === 'rectR') { const f = v6Rect(h.id); f.w = Math.max(0.01, D.rect[2] + dx); f.h = Math.max(0.01, D.rect[3] + dy); v6RectSnap(f, true); }
      else if (h.kind === 'isoR') D.k = Math.max(0.1, Math.min(5, D.k0 * Math.hypot(t.x - D.c[0], t.y - D.c[1]) / D.d0));
      v6PaintSoon(h);
    });
    window.addEventListener('mouseup', function () {
      if (V6S.pan) { V6S.pan = null; pc.style.cursor = 'grab'; }
      if (V6S.rt && V6S.rt.a) { v6RectMake(V6S.rt.a, V6S.rt.b); return; }
      const D = V6S.drag; if (!D) return;
      V6S.drag = null; V6S.snapG = null;
      if (D.h.kind === 'isoR' && D.k !== D.k0) { $('v6IsoK').value = $('v6IsoKR').value = Math.round(D.k * 100); v6Paint(V6S.hov); v6Preview(); return; }
      v6Paint(V6S.hov);
    });
    pc.addEventListener('mouseleave', function () { if (!V6S.drag && V6S.hov) { V6S.hov = null; v6PaintFast(); } });
    window.addEventListener('keydown', function (e) {
      if (!v6Act || V6S.edit) return;
      if (V6S.comb !== null && e.key === 'Escape') { v6CombEnd(); e.preventDefault(); e.stopPropagation(); return; }
      if (V6S.rt && e.key === 'Escape') { V6S.rt = null; $('v6Prev').style.cursor = 'default'; v6Paint(); e.preventDefault(); e.stopPropagation(); return; }
      if (V6S.dt && e.key === 'Escape') {
        if (V6S.dt.a && !V6S.dt.redo) { V6S.dt = { a: null, b: null, view: null, hov: null, tmp: null, redo: null }; v6Paint(); } else v6DimTool(false);
        e.preventDefault(); e.stopPropagation(); return;
      }
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C') && v6NSel().length) { v6NoteCopy(); e.preventDefault(); e.stopPropagation(); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V') && V6S.clip && V6S.clip.length) { v6NotePaste(); e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (V6S.nsel) v6DelNote(); else if (V6S.rsel !== null) v6DelRect(); else if (V6S.dsel) v6DelDim(); else if (V6S.vsel && V6S.mode === '6v') v6DelView(V6S.vsel); else return;
        e.preventDefault(); e.stopPropagation();
      }
    }, true);
  })();
  // picked notes (the last one clicked is V6S.nsel, the style controls show it)
  function v6NSel() {
    const ids = V6S.nsels.slice(); if (V6S.nsel !== null && ids.indexOf(V6S.nsel) < 0) ids.push(V6S.nsel);
    return ids.map(v6Note).filter(Boolean);
  }
  function v6DelNote() { const L2 = V6S.notes[V6S.mode]; v6NSel().forEach(function (n) { L2.splice(L2.indexOf(n), 1); }); V6S.nsel = null; V6S.nsels = []; v6Paint(); }
  // align note boxes to the paper (margin = the one of the scale note); left / centre / right also align the lines
  function v6NoteAlign(list, a) {
    const q = V6S.prev; if (!q || !q.hits) return;
    const o = q.o, k = q.k || 1, M = v6Metrics(o), m = 1.5 * M.font, W = o.W, H = o.H;
    for (const n of list) {
      const h = q.hits.find(function (x) { return x.kind === 'note' && x.id === n.id; }); if (!h) continue;
      const w = (h.r.w - 6) / k, hh = (h.r.h - 6) / k;
      if (a === 'left') n.x = m / W; else if (a === 'center') n.x = (W - w) / 2 / W; else if (a === 'right') n.x = (W - m - w) / W;
      else if (a === 'top') n.y = m / H; else if (a === 'middle') n.y = (H - hh) / 2 / H; else if (a === 'bottom') n.y = (H - m - hh) / H;
      if (a === 'left' || a === 'center' || a === 'right') n.align = a;
    }
    const cur = v6Note(V6S.nsel); if (cur) v6NoteCtl(cur);
    v6Paint();
  }
  // Ctrl+C / Ctrl+V: the picked notes, pasted a little lower right each time (any sheet, any drawing type)
  function v6NoteCopy() { V6S.clip = JSON.parse(JSON.stringify(v6NSel())); V6S.clipN = 0; flash(L('Đã chép ', 'Copied ') + V6S.clip.length + L(' ghi chú', ' note(s)')); }
  function v6NotePaste() {
    if (!V6S.clip || !V6S.clip.length) return;
    V6S.clipN = (V6S.clipN || 0) + 1;
    const d = 0.02 * V6S.clipN, L2 = V6S.notes[V6S.mode] || (V6S.notes[V6S.mode] = []), ids = [];
    for (const c of V6S.clip) { const n = Object.assign({}, c, { id: V6S.seq++, x: Math.min(0.97, c.x + d), y: Math.min(0.97, c.y + d) }); L2.push(n); ids.push(n.id); }
    V6S.nsels = ids; V6S.nsel = ids[ids.length - 1]; v6NoteCtl(v6Note(V6S.nsel)); v6Paint();
  }
  $('v6AddT').addEventListener('click', function () {
    if (!V6S.prev) return;
    const n = Object.assign({ id: V6S.seq++, text: L('Ghi chú', 'Note'), x: 0.06, y: 0.06 }, v6NoteVals());
    V6S.notes[V6S.mode].push(n); V6S.nsel = n.id; V6S.nsels = [n.id]; v6Paint();
    const h = (V6S.prev.hits || []).find(function (x) { return x.kind === 'note' && x.id === n.id; });
    if (h) v6Edit(h);
  });
  $('v6DelT').addEventListener('click', v6DelNote);
  // note style: size, bold, font, alignment, italic, underline, colour (the picked note; the next note starts with them)
  function v6NoteVals() { return { size: v6Num('v6Ns', 4), bold: $('v6Nb').checked, font: $('v6Nf').value, align: $('v6Na').value, italic: $('v6Ni').checked, under: $('v6Nu').checked, color: $('v6Nc').value }; }
  function v6NoteCtl(n) {
    if (!n) return;
    $('v6Ns').value = $('v6NsR').value = n.size; $('v6Nb').checked = !!n.bold; $('v6Nf').value = n.font || 'Arial'; $('v6Na').value = n.align || 'left';
    $('v6Ni').checked = !!n.italic; $('v6Nu').checked = !!n.under; $('v6Nc').value = n.color || '#111111';
  }
  ['v6Ns', 'v6NsR', 'v6Nb', 'v6Nf', 'v6Na', 'v6Ni', 'v6Nu', 'v6Nc'].forEach(function (id) {
    const f = function () { const sel = v6NSel(); if (!sel.length) return; const v = v6NoteVals(); delete v.align; sel.forEach(function (n) { Object.assign(n, v); }); v6Paint(); };
    $(id).addEventListener('input', f); $(id).addEventListener('change', f);
  });
  // frames: drawn by dragging on the sheet with the Frame tool; edge / name drag to move, corner to resize
  function v6Rect(id) { return (V6S.rects[V6S.mode] || []).find(function (f) { return f.id === id; }); }
  // a moved / resized frame lines up with the edges of the other frames (within ~8 screen px); guides show the line
  function v6RectSnap(f, size) {
    const Ly = V6S.lay; V6S.snapG = null; if (!Ly) return;
    const tx = 8 * Ly.dpr / Ly.s / Ly.W, ty = 8 * Ly.dpr / Ly.s / Ly.H, others = (V6S.rects[V6S.mode] || []).filter(function (g) { return g !== f; });
    if (!others.length) return;
    const ex = [], ey = [];
    others.forEach(function (g) { ex.push(g.x, g.x + g.w); ey.push(g.y, g.y + g.h); });
    const near = function (vals, list, t) {
      let best = null;
      for (const v of vals) for (const e of list) { const d = e - v; if (Math.abs(d) <= t && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: e }; }
      return best;
    };
    const G = { x: [], y: [] };
    const bx = near(size ? [f.x + f.w] : [f.x, f.x + f.w], ex, tx), by = near(size ? [f.y + f.h] : [f.y, f.y + f.h], ey, ty);
    if (bx) { if (size) f.w = Math.max(0.01, f.w + bx.d); else f.x += bx.d; G.x.push(bx.at); }
    if (by) { if (size) f.h = Math.max(0.01, f.h + by.d); else f.y += by.d; G.y.push(by.at); }
    if (G.x.length || G.y.length) V6S.snapG = G;
  }
  function v6RectCtl() { const f = v6Rect(V6S.rsel); if (!f) return; $('v6Rc').value = f.color || '#e53935'; $('v6Rs').value = $('v6RsR').value = f.ts || 5; $('v6Rw').value = $('v6RwR').value = f.lw || 0.5; }
  function v6RectTool(on) {
    V6S.rt = on ? { a: null, b: null } : null;
    if (on) { V6S.dt = null; v6CombEnd(); }
    $('v6Prev').style.cursor = on ? 'crosshair' : 'default'; v6Paint();
  }
  function v6RectMake(a, b) {
    const Ly = V6S.lay; V6S.rt = null; $('v6Prev').style.cursor = 'default';
    if (!Ly) return;
    b = b || a;
    let x = Math.min(a[0], b[0]) / Ly.W, y = Math.min(a[1], b[1]) / Ly.H, w = Math.abs(b[0] - a[0]) / Ly.W, h = Math.abs(b[1] - a[1]) / Ly.H;
    if (Math.abs(b[0] - a[0]) * Ly.s / Ly.dpr < 8 || Math.abs(b[1] - a[1]) * Ly.s / Ly.dpr < 8) { w = 0.3; h = 0.25; x = Math.min(x, 0.98 - w); y = Math.min(y, 0.98 - h); }
    const L2 = V6S.rects[V6S.mode] || (V6S.rects[V6S.mode] = []);
    const f = { id: V6S.seq++, x: x, y: y, w: w, h: h, color: $('v6Rc').value, title: L('Cụm ', 'Group ') + (L2.length + 1), ts: v6Num('v6Rs', 5), lw: v6Num('v6Rw', 0.5) };
    L2.push(f); V6S.rsel = f.id; V6S.nsel = null; V6S.psel = null; v6Paint();
    const ht = (V6S.prev.hits || []).find(function (q) { return q.kind === 'rect' && q.id === f.id && q.title; });
    if (ht) v6Edit(ht);
  }
  function v6DelRect() { const L2 = V6S.rects[V6S.mode] || [], f = v6Rect(V6S.rsel); if (f) L2.splice(L2.indexOf(f), 1); V6S.rsel = null; v6Paint(); }
  $('v6AddR').addEventListener('click', function () { v6RectTool(!V6S.rt); });
  $('v6DelR').addEventListener('click', v6DelRect);
  ['v6Rc', 'v6Rs', 'v6RsR', 'v6Rw', 'v6RwR'].forEach(function (id) {
    const f = function () { const r = v6Rect(V6S.rsel); if (!r) return; r.color = $('v6Rc').value; r.ts = v6Num('v6Rs', 5); r.lw = v6Num('v6Rw', 0.5); v6Paint(); };
    $(id).addEventListener('input', f); $(id).addEventListener('change', f);
  });
  // a part picked on the exploded sheet lights up in the body lists (and the other way round, see dwBodyPick)
  function v6PickToList(h) {
    if (typeof DW === 'undefined' || !DW.doc || V6S.mode !== 'exp') return;
    let u = null;
    if (h && (h.kind === 'part' || h.kind === 'label')) { const pt = V6S.prev.parts.find(function (x) { return x.id === h.id; }); u = pt && pt.b.uid; }
    else if (h) u = null; else return;
    if (u === DW.bsel && u === V6S.hl) return;
    DW.bsel = u; V6S.hl = u; dwTreeSel();
  }
  // part row in the panel: rename / material of the selected part, straight onto the body
  v6MatOpts($('v6PMat'));
  $('v6PName').addEventListener('change', function () { const b = S.bodies.find(function (x) { return x.id === V6S.psel; }); if (b) { v6SetName(b, this.value); v6PartRow(); v6Paint(); } });
  $('v6PName').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); e.stopPropagation(); });
  $('v6PMat').addEventListener('change', function () { const b = S.bodies.find(function (x) { return x.id === V6S.psel; }); if (b) { v6SetMat(b, this.value); v6PartRow(); v6Paint(); } });
  // the body list / Properties changed a name, material or what is shown: follow
  let v6Sig = '';
  setInterval(function () {
    if (!v6Act || !V6S.prev) return;
    const sig = S.bodies.map(function (b) { return b.id + ':' + b.name + ':' + b.material + ':' + b.density + ':' + (b.visible ? 1 : 0) + (S.sel.has(b) ? 1 : 0) + ':' + b.color.join(','); }).join('|');
    if (v6Sig && sig !== v6Sig) {
      const geoSig = function (s) { return s.split('|').map(function (x) { const p = x.split(':'); return p[0] + p[4] + p[5]; }).join('|'); };
      if (geoSig(sig) !== geoSig(v6Sig)) v6Preview(); else { v6PartRow(); v6Paint(); }
    }
    v6Sig = sig;
  }, 700);

  // the panel and the sheet window move by their title bars (the sheet also resizes from its corner)
  function v6Move(el, hd, key) {
    try { const s = JSON.parse(localStorage.getItem(key) || 'null'); if (s && s.l) { el.style.left = s.l; el.style.top = s.t; el.style.right = 'auto'; if (s.w) { el.style.width = s.w; el.style.height = s.h; } } } catch (e) { }
    let dr = null;
    hd.addEventListener('mousedown', function (e) {
      if (e.target.closest('button,input,select') || el.closest('#dws')) return;
      const r = el.getBoundingClientRect(), pr = el.offsetParent.getBoundingClientRect();
      dr = { x: e.clientX - r.left, y: e.clientY - r.top, pr: pr }; e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dr) return;
      el.style.right = 'auto';
      el.style.left = Math.max(0, Math.min(dr.pr.width - 60, e.clientX - dr.pr.left - dr.x)) + 'px';
      el.style.top = Math.max(0, Math.min(dr.pr.height - 30, e.clientY - dr.pr.top - dr.y)) + 'px';
    });
    const save = function () { try { localStorage.setItem(key, JSON.stringify({ l: el.style.left, t: el.style.top, w: el.style.width, h: el.style.height })); } catch (e) { } };
    window.addEventListener('mouseup', function () { if (dr) { dr = null; save(); } });
    return save;
  }
  $('tpop').parentNode.appendChild($('pop_v6')); $('tpop').parentNode.appendChild($('v6Sheet'));
  $('v6VzR').addEventListener('input', function () { $('v6Vz').value = this.value; v6ZoomTo(+this.value / 100); });
  $('v6Vz').addEventListener('input', function () { const v = parseFloat(this.value); if (isFinite(v) && v > 0) { $('v6VzR').value = v; v6ZoomTo(v / 100); } });
  ['v6VzR', 'v6Vz'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { e.stopPropagation(); }); });
  $('v6VzFit').addEventListener('click', v6Fit);
  v6Move($('pop_v6'), document.querySelector('#pop_v6 .pophd'), 'mx.v6Pop');
  const v6SaveSheet = v6Move($('v6Sheet'), document.querySelector('#v6Sheet .v6hd'), 'mx.v6Sheet');
  if (window.ResizeObserver) {
    let last = '';
    new ResizeObserver(function () {
      const el = $('v6Sheet'), s = el.clientWidth + 'x' + el.clientHeight;
      if (!el.classList.contains('on') || s === last) return;
      last = s; v6Preview(); if (el.style.width) v6SaveSheet();
    }).observe($('v6Sheet'));
  }
  // shown / hidden by the Drawing Workspace
  function v6Activate(on) {
    v6Act = !!on;
    $('pop_v6').classList.toggle('on', v6Act); $('v6Sheet').classList.toggle('on', v6Act);
    if (!v6Act && V6S.edit) v6EditDone(false);
    if (!v6Act) V6S.comb = null;
    if (v6Act) v6Preview();
  }

  document.querySelectorAll('#pop_v6 input, #pop_v6 select').forEach(function (el) {
    if (/^v6(Ns|NsR|Nb|PName|PMat)$/.test(el.id)) return;
    el.addEventListener('input', v6Preview); el.addEventListener('change', v6Preview);
  });
  V6_PAIRS.forEach(function (p) {
    const r = $(p[0]), n = $(p[1]);
    r.addEventListener('input', function () { n.value = r.value; n.dispatchEvent(new Event('input')); });
    n.addEventListener('input', function () { r.value = n.value; });
  });
  // views switched or the sheet changed: a hand placement would no longer fit
  // a view switched on gets its automatic place, the others stay where they were put
  ['v6Scale', 'v6ScA', 'v6ScB', 'v6ScR', 'v6Paper', 'v6Ori', 'v6DimW', 'v6DimD', 'v6DimH', 'v6Lbl', 'v6ScN', 'v6Zm', 'v6Fs'].forEach(function (id) { $(id).addEventListener('change', function () { V6S.pos = null; V6S.iso = null; }); });
  $('v6Iso').addEventListener('change', function () { V6S.iso = null; });
  $('v6Ex').addEventListener('change', function () { V6S.off = {}; });
  function v6Rot(M) {
    const R = V6S.R;
    V6S.R = [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return M[i][0] * R[0][j] + M[i][1] * R[1][j] + M[i][2] * R[2][j]; }); });
    V6S.pos = null; V6S.iso = null; v6Preview();
  }
  $('v6RotZ').addEventListener('click', function () { v6Rot([[0, -1, 0], [1, 0, 0], [0, 0, 1]]); });
  $('v6RotZm').addEventListener('click', function () { v6Rot([[0, 1, 0], [-1, 0, 0], [0, 0, 1]]); });
  $('v6Tip').addEventListener('click', function () { v6Rot([[1, 0, 0], [0, 0, -1], [0, 1, 0]]); });
  $('v6Auto').addEventListener('click', function () {
    if (V6S.mode !== 'exp' && v6AutoEven()) { v6Preview(); return; }
    if (V6S.mode === 'exp' && v6AutoExp()) { v6Paint(); return; }
    V6S.pos = null; V6S.iso = null; V6S.off = {}; v6Preview();
  });
  // custom scale a : b — the slider runs on a log scale from 1:100 to 100:1
  function v6ScSync() { const a = parseFloat($('v6ScA').value) || 1, b = parseFloat($('v6ScB').value) || 1; $('v6ScR').value = Math.max(-2, Math.min(2, Math.log10(a / b))).toFixed(2); }
  $('v6ScR').addEventListener('input', function () {
    const r = Math.pow(10, +this.value), nice = function (v) { return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10; };
    if (r >= 1) { $('v6ScA').value = nice(r); $('v6ScB').value = 1; } else { $('v6ScA').value = 1; $('v6ScB').value = nice(1 / r); }
  });
  ['v6ScA', 'v6ScB'].forEach(function (id) { $(id).addEventListener('input', v6ScSync); });
  // ---------- the two drawings (6 view / Exploded view): own settings, switched in the panel, saved with the session
  function v6Ctls() { return Array.from(document.querySelectorAll('#pop_v6 input, #pop_v6 select')).filter(function (el) { return el.type !== 'range' && !/^v6(Ns|Nb|Nf|Na|Ni|Nu|Nc|Rc|Rs|Rw|PName|PMat)$/.test(el.id); }); }
  function v6Key(el) { return el.id || (el.dataset.v ? 'v:' + el.dataset.v : ''); }
  function v6Snap() { const c = {}; v6Ctls().forEach(function (el) { const k = v6Key(el); if (k) c[k] = el.type === 'checkbox' ? el.checked : el.value; }); return c; }
  // settings saved before the overall size had three switches: the one Dimensions switch sets all three
  function v6CfgMig(c) { return c && 'v6Dim' in c && !('v6DimW' in c) ? Object.assign({}, c, { v6DimW: c.v6Dim, v6DimD: c.v6Dim, v6DimH: c.v6Dim }) : c; }
  function v6Apply(c) {
    c = v6CfgMig(c);
    v6Ctls().forEach(function (el) { const k = v6Key(el); if (!k || !(k in c)) return; if (el.type === 'checkbox') el.checked = !!c[k]; else el.value = c[k]; });
    V6_PAIRS.forEach(function (p) { $(p[0]).value = $(p[1]).value; }); v6ScSync();
  }
  function v6StGet() { return { R: V6S.R, pos: V6S.pos, iso: V6S.iso, off: V6S.off, tot: V6S.tot, grp: V6S.grp, odo: V6S.odo }; }
  function v6StSet(t) { t = t || {}; V6S.R = t.R || [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; V6S.pos = t.pos || null; V6S.iso = t.iso || null; V6S.off = t.off || {}; V6S.tot = t.tot || null; V6S.grp = t.grp || {}; V6S.odo = t.odo || {}; }
  function v6SetMode(m) {
    if (V6S.edit) v6EditDone(false);
    V6S.dt = null; V6S.dsel = null; V6S.vsel = null;
    V6S.comb = null;
    if (m !== V6S.mode) { V6S.cfg[V6S.mode] = v6Snap(); V6S.st[V6S.mode] = v6StGet(); V6S.mode = m; v6Apply(V6S.cfg[m]); v6StSet(V6S.st[m]); }
    V6S.nsel = null; V6S.nsels = []; V6S.psel = null; V6S.rsel = null; V6S.rt = null; v6Sync(); v6Preview();
  }
  document.querySelectorAll('#v6Seg button').forEach(function (b) { b.addEventListener('click', function () { v6SetMode(b.dataset.k); }); });
  V6S.def = v6Snap(); V6S.cfg = { '6v': v6Snap(), exp: v6Snap() };
  // ---------- drawing state: one plain object (copy) per sheet; v6Grab reads it from the panel + V6S, v6Put writes it back
  function v6Grab() {
    V6S.cfg[V6S.mode] = v6Snap(); V6S.st[V6S.mode] = v6StGet();
    return JSON.parse(JSON.stringify({ mode: V6S.mode, cfg: V6S.cfg, st: V6S.st, notes: V6S.notes, rects: V6S.rects, seq: V6S.seq, dims: V6S.dims, hide: V6S.hide }));
  }
  function v6Blank() {
    return { mode: '6v', cfg: { '6v': Object.assign({}, V6S.def), exp: Object.assign({}, V6S.def) }, st: { '6v': {}, exp: {} }, notes: { '6v': [], exp: [] }, rects: { '6v': [], exp: [] }, seq: 1, dims: { '6v': [], exp: [] }, hide: [] };
  }
  function v6Put(d) {
    if (V6S.edit) v6EditDone(false);
    d = JSON.parse(JSON.stringify(d || v6Blank()));
    const cf = d.cfg || {}, sd = d.st || {};
    V6S.cfg = { '6v': Object.assign({}, V6S.def, v6CfgMig(cf['6v'])), exp: Object.assign({}, V6S.def, v6CfgMig(cf.exp)) };
    for (const m of ['6v', 'exp']) { const t = sd[m] || {}; V6S.st[m] = { R: t.R, pos: t.pos, iso: t.iso, tot: t.tot, off: t.off || {}, grp: t.grp || {}, odo: t.odo || {} }; }
    const nt = d.notes || {};
    V6S.notes = { '6v': nt['6v'] || [], exp: nt.exp || [] };
    const rc = d.rects || {}; V6S.rects = { '6v': rc['6v'] || [], exp: rc.exp || [] };
    const dd = d.dims || {}; V6S.dims = { '6v': dd['6v'] || [], exp: dd.exp || [] };
    V6S.hide = Array.isArray(d.hide) ? d.hide.slice() : [];
    V6S.seq = Math.max(d.seq || 1, 1 + Math.max.apply(null, [0].concat(V6S.notes['6v'], V6S.notes.exp, V6S.rects['6v'], V6S.rects.exp, V6S.dims['6v']).map(function (n) { return n.id || 0; })));
    V6S.mode = d.mode === 'exp' ? 'exp' : '6v'; v6Apply(V6S.cfg[V6S.mode]); v6StSet(V6S.st[V6S.mode]);
    V6S.nsel = null; V6S.nsels = []; V6S.psel = null; V6S.rsel = null; V6S.rt = null; V6S.prev = null; V6S.comb = null; V6S.dt = null; V6S.dsel = null; V6S.vsel = null; v6Sync(); v6Preview();
  }
  // body references (hand placements, combined groups) through f: id -> other key (undefined = drop)
  function v6MapIds(d, f) {
    d = JSON.parse(JSON.stringify(d));
    for (const m of ['6v', 'exp']) {
      const t = (d.st || {})[m]; if (!t) continue;
      const off = {}, grp = {};
      for (const k in (t.off || {})) { const n = f(k); if (n !== undefined) off[n] = t.off[k]; }
      for (const k in (t.grp || {})) { const n = f(k); if (n !== undefined) grp[n] = t.grp[k].map(function (x) { return f(String(x)); }).filter(function (x) { return x !== undefined; }); }
      t.off = off; t.grp = grp;
    }
    return d;
  }
  // session: body ids change when a session is opened, so body references are kept by body order
  function v6IdToIdx() { const idx = new Map(S.bodies.map(function (b, i) { return [String(b.id), i]; })); return function (k) { return idx.get(String(k)); }; }
  function v6IdxToId() { const ids = S.bodies.map(function (b) { return b.id; }); return function (k) { return ids[+k]; }; }
  function v6Dump() { return v6MapIds(v6Grab(), v6IdToIdx()); }
  function v6Load(d) { v6Put(d ? v6MapIds(d, v6IdxToId()) : null); }
  $('v6Save').addEventListener('click', function () {
    v6Full().then(function (r) {
      download([r.blob], 'mrt_' + (r.o.exp ? 'exploded' : '6view') + '_' + r.o.dpi + 'dpi.' + r.o.fmt);
      flash(L('Đã lưu ảnh ', 'Saved the picture ') + r.o.W + ' × ' + r.o.H + ' px, ' + r.o.dpi + ' dpi, ' + v6Size(r.blob.size));
      const e = $('v6Est'); if (e) e.textContent = v6Size(r.blob.size) + ' (' + r.o.fmt.toUpperCase() + L(', đã lưu)', ', saved)');
    }).catch(showError);
  });
  // copy: a picture sized for an e-mail (long side ~2000 px, white background, lines at least ~1.3 px), whatever the
  // export settings are
  const V6_MAILPX = 2000;
  async function v6MailBlob() {
    const o = v6Sync(); o.fmt = 'png'; o.bg = 'w';
    const k = Math.min(1, V6_MAILPX / Math.max(o.W, o.H)), ppmm = o.dpi / 25.4;
    o.lw = Math.max(o.lw, 1.3 / (ppmm * k));
    const R = await v6Render(o, k, 2), cv = v6Sheet(o, R, k);
    return { blob: await new Promise(function (r) { cv.toBlob(r, 'image/png'); }), w: cv.width, h: cv.height };
  }
  $('v6Copy').addEventListener('click', function () {
    setBusy(true, L('Đang chép ảnh…', 'Copying the picture…'));
    v6MailBlob().then(function (r) {
      setBusy(false);
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': r.blob })]).then(function () { flash(L('Đã chép ảnh vào clipboard (', 'Picture copied to the clipboard (') + r.w + ' × ' + r.h + ' px)'); });
    }).catch(function (e) { setBusy(false); showError(e); });
  });
