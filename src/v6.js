
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
  const V6S = { mode: '6v', R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], pos: null, iso: null, off: {}, tot: null, notes: { '6v': [], exp: [] }, nsel: null, psel: null,
    prev: null, fine: new Map(), seq: 1, cfg: null, st: { '6v': {}, exp: {} }, def: null, grp: {}, comb: null, vz: 1, vp: [0, 0], lay: null, est: 0 };
  const V6_PREVPX = 12e6;   // the preview never renders the sheet above this many pixels (zooming further only scales)
  const V6_PAIRS = [['v6DpiR', 'v6Dpi'], ['v6WR', 'v6W'], ['v6HR', 'v6H'], ['v6LwR', 'v6Lw'], ['v6AngR', 'v6Ang'], ['v6QR', 'v6Q'], ['v6AzR', 'v6Az'], ['v6ElR', 'v6El'], ['v6ExR', 'v6Ex'],
    ['v6ZmR', 'v6Zm'], ['v6FsR', 'v6Fs'], ['v6NsR', 'v6Ns'], ['v6IsoKR', 'v6IsoK']];
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
    return { isoK: Math.max(0.1, Math.min(5, v6Num('v6IsoK', 100) / 100)), tot: exp && $('v6Tot').checked, exp: exp, views: views, iso: !exp && $('v6Iso').checked, az: v6Num('v6Az', 45), el: v6Num('v6El', 30), spread: v6Num('v6Ex', 80) / 100,
      pn: $('v6PN').checked, pm: $('v6PM').checked,
      col: $('v6Col').value, one: v6Hex($('v6One').value), light: $('v6Light').value, fine: $('v6Fine').checked,
      edge: $('v6Edge').checked, hidden: $('v6Hid').checked, ang: v6Num('v6Ang', 30), dim: !exp && $('v6Dim').checked, unit: $('v6Unit').value,
      lbl: !exp && $('v6Lbl').checked, scn: $('v6ScN').checked, scale: scale, zoom: v6Num('v6Zm', 100) / 100,
      fs: v6Num('v6Fs', 2.6), fb: $('v6Fb').checked, W: W, H: H, cut: cut, dpi: dpi,
      lw: v6Num('v6Lw', 0.25), ss: +$('v6SS').value || 1, fmt: fmt, q: v6Num('v6Q', 92) / 100, bg: fmt === 'jpg' ? 'w' : $('v6Bg').value };
  }
  function v6Bodies() {
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
    return { b: b, W: W, I: I, N: N, NN: NN, fixed: fixed, sil: sil, lo: lo, hi: hi, color: [b.color[0] / 255, b.color[1] / 255, b.color[2] / 255] };
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
    g.bindFramebuffer(g.FRAMEBUFFER, null); g.deleteFramebuffer(fb); g.deleteRenderbuffer(cb); g.deleteRenderbuffer(db);
    const cv = document.createElement('canvas'); cv.width = vw; cv.height = vh;
    const c2 = cv.getContext('2d'); c2.putImageData(fill, 0, 0);
    if (o.edge || o.col === 'white') {
      // farthest depth of the 3x3 neighbourhood: an edge is hidden only when everything around it is in front
      const tmp = new Float32Array(vw * vh), dep = new Float32Array(vw * vh);
      for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) { const i = y * vw + x; let m = raw[i]; if (x > 0 && raw[i - 1] > m) m = raw[i - 1]; if (x < vw - 1 && raw[i + 1] > m) m = raw[i + 1]; tmp[i] = m; }
      for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) { const i = y * vw + x; let m = tmp[i]; if (y > 0 && tmp[i - vw] > m) m = tmp[i - vw]; if (y < vh - 1 && tmp[i + vw] > m) m = tmp[i + vw]; dep[i] = m; }
      const vis = new Path2D(), hid = new Path2D(), tol = 1.5e-3, c = sc6.ctr;
      const proj = function (W, i) { const x = W[3 * i] - c[0], y = W[3 * i + 1] - c[1], z = W[3 * i + 2] - c[2]; return [(x * r[0] + y * r[1] + z * r[2] - R0) * S2, vh - (x * u[0] + y * u[1] + z * u[2] - U0) * S2, (x * d[0] + y * d[1] + z * d[2] - d0) / (d1 - d0)]; };
      const seg = function (A, B) {
        const n2 = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 0.75));
        let state = -1;
        for (let i = 0; i <= n2; i++) {
          const t = i / n2, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, z = A[2] + (B[2] - A[2]) * t, ix = Math.floor(x), iy = Math.floor(y);
          const on = ix < 0 || iy < 0 || ix >= vw || iy >= vh || dep[iy * vw + ix] >= z - tol ? 1 : 0;
          if (on !== state) { if (state >= 0) (state ? vis : hid).lineTo(x, y); (on ? vis : hid).moveTo(x, y); state = on; }
          if (i === n2) (state ? vis : hid).lineTo(x, y);
        }
      };
      for (const p of preps) {
        for (const e of p.fixed) seg(proj(p.W, e[0]), proj(p.W, e[1]));
        const N = p.N;
        for (const e of p.sil) {
          const a = N[3 * e[2]] * d[0] + N[3 * e[2] + 1] * d[1] + N[3 * e[2] + 2] * d[2], b2 = N[3 * e[3]] * d[0] + N[3 * e[3] + 1] * d[1] + N[3 * e[3] + 2] * d[2];
          if (a * b2 < 0 || (a === 0) !== (b2 === 0)) seg(proj(p.W, e[0]), proj(p.W, e[1]));
        }
      }
      const lw = lwPx * s2;
      c2.lineCap = 'round'; c2.lineJoin = 'round';
      if (o.hidden) { c2.save(); c2.strokeStyle = '#7d7d7d'; c2.lineWidth = Math.max(1, lw * 0.6); c2.setLineDash([4 * lw, 3 * lw]); c2.stroke(hid); c2.restore(); }
      c2.strokeStyle = '#111111'; c2.lineWidth = lw; c2.stroke(vis);
    }
    return { cv: cv, ss: s2, pad: pad, w: er * sc, h: eu * sc, rc: (rg[0] + rg[1]) / 2, uc: (rg[2] + rg[3]) / 2 };
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
    try {
      if (o.exp) {
        for (const it of plan.items) out.parts.push(Object.assign(v6View(G, sc6, [it.p], plan.D, sc * k, ss, M.lw * k, o), { id: it.id, n: it.n, b: it.p.b, cx: it.cx, cy: it.cy }));
      } else {
        out.pos = V6S.pos || v6Auto(o, sc6.ext, sc).pos;
        for (const n of v6Names(o)) out.views[n] = v6View(G, sc6, sc6.preps, v6Dirs(V6_VIEWS[n]), sc * k, ss, M.lw * k, o);
        if (o.iso) out.iso = v6View(G, sc6, sc6.preps, v6Dirs(v6IsoSpec(o.az, o.el)), sc * k * o.isoK, ss, M.lw * k * Math.min(1, o.isoK), o);
      }
    } finally { v6Release(G, sc6); }
    return out;
  }

  // ---------- the sheet: pictures, dimensions, names, notes, drawn at k x full size; returns hit boxes
  function v6Font(px, bold) { return (bold ? 'bold ' : '') + Math.round(px) + 'px "Segoe UI", Arial, sans-serif'; }
  function v6Compose(c2, o, R, k) {
    const W = o.W * k, H = o.H * k, M = v6Metrics(o), font = M.font * k, lw = M.lw * k, hits = [], frames = {};
    c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
    const put = function (v, cx, cy, f) {
      f = f || 1;
      const w = v.w * f, h = v.h * f, x = cx - w / 2, y = cy - h / 2, pad = v.pad / v.ss * f;
      c2.drawImage(v.cv, x - pad, y - pad, v.cv.width / v.ss * f, v.cv.height / v.ss * f);
      return { x: x, y: y, w: w, h: h };
    };
    c2.fillStyle = '#111'; c2.strokeStyle = '#111'; c2.setLineDash([]);
    const fnt = v6Font(font, o.fb);
    if (!o.exp) {
      const pos = V6S.pos || R.pos;
      for (const n of Object.keys(R.views)) { const c = v6Centre(pos, n); frames[n] = put(R.views[n], c[0] * W, c[1] * H); hits.push({ kind: 'view', n: n, r: frames[n] }); }
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
      const ext = R.sc6.ext;
      if (o.dim) {
        const fx = frames.front || frames.back || frames.top || frames.bottom;
        if (fx) dimH(fx.x, fx.x + fx.w, fx.y + fx.h, fx.y + fx.h + 2.4 * font, ext[0]);
        const fy = frames.right || frames.left;
        if (fy) dimH(fy.x, fy.x + fy.w, fy.y + fy.h, fy.y + fy.h + 2.4 * font, ext[1]);
        else if (frames.top) { const t = frames.top; dimV(t.y, t.y + t.h, t.x, t.x - 1.6 * font, ext[1]); }
        const fz = frames.right || frames.front || frames.left || frames.back;
        if (fz) dimV(fz.y, fz.y + fz.h, fz.x, fz.x - 1.6 * font, ext[2]);
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
    if (o.scn) {
      c2.font = fnt; c2.textAlign = 'right'; c2.textBaseline = 'bottom';
      c2.fillText(L('Tỉ lệ ', 'Scale ') + v6Ratio(R.sc, o) + '    ' + L('Đơn vị: mm (in)', 'Units: mm (in)'), W - 1.5 * font, H - 1.2 * font);
    }
    // notes
    for (const n of V6S.notes[V6S.mode]) {
      const px = n.size * M.ppmm * k, ls = n.text.split('\n');
      c2.font = v6Font(px, n.bold); c2.textAlign = 'left'; c2.textBaseline = 'top'; c2.fillStyle = '#111';
      let wm = 0; ls.forEach(function (s, i) { c2.fillText(s, n.x * W, n.y * H + i * px * 1.25); wm = Math.max(wm, c2.measureText(s).width); });
      hits.push({ kind: 'note', id: n.id, r: { x: n.x * W - 3, y: n.y * H - 3, w: wm + 6, h: ls.length * px * 1.25 + 6 } });
    }
    return hits;
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
    $('v6Dim').parentNode.style.display = exp ? 'none' : ''; $('v6Unit').style.display = exp ? 'none' : ''; $('v6Lbl').parentNode.style.display = exp ? 'none' : '';
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
  function v6WantK(o, L) { return Math.min(L.kd, Math.sqrt(V6_PREVPX / (o.W * o.H))); }
  async function v6PreviewNow() {
    if (!$('pop_v6').classList.contains('on')) return;
    if (v6Busy) { v6Again = true; return; }
    v6Busy = true;
    const o = v6Sync(), pc = $('v6Prev');
    try {
      const L = v6Layout(o), k = v6WantK(o, L), big = o.W * o.H * k * k;
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
  function v6Paint(hover) {
    const q = V6S.prev, pc = $('v6Prev'); if (!q) return;
    if (hover === undefined) hover = V6S.hov;
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
    V6S.hs = 7 * dpr / s;
    q.hits = v6Compose(c2, o, q, q.k);
    V6S.hs = 0;
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
      if ((h.kind === 'note' && h.id === V6S.nsel) || ((h.kind === 'part' || h.kind === 'label') && h.id === V6S.psel)) box(h, '#f0a030');
      else if (hover && h === hover) box(h, '#2f8cff');
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
      const rank = { isoR: 4, note: 3, tot: 3, label: 2, part: 1, iso: 1, view: 0 };
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
    V6S.vz = z; v6ZoomUI(); v6Paint();
    v6ZoomCheck();
  }
  let v6ZTimer = 0;
  function v6ZoomCheck() {
    clearTimeout(v6ZTimer);
    v6ZTimer = setTimeout(function () {
      const q = V6S.prev; if (!q) return;
      const want = v6WantK(q.o, v6Layout(q.o));
      if (want > q.k * 1.15 || want < q.k * 0.55) v6PreviewNow();
    }, 260);
  }
  function v6Fit() { V6S.vz = 1; V6S.vp = [0, 0]; v6ZoomUI(); v6Paint(); v6ZoomCheck(); }
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
    if (h.kind === 'note') { n = v6Note(h.id); t.value = n.text; t.rows = Math.max(2, n.text.split('\n').length); ms.style.display = 'none'; }
    else { b = S.bodies.find(function (x) { return x.id === h.id; }); if (!b) return; t.value = b.name; t.rows = 1; v6MatOpts(ms); ms.value = MATS.some(function (m) { return m[0] === b.material; }) ? b.material : ''; ms.style.display = ''; }
    ed.style.display = 'block';
    ed.style.left = Math.max(0, Math.min(br.width - 220, sr.x - br.left)) + 'px';
    ed.style.top = Math.max(0, Math.min(br.height - 110, sr.y + sr.h - br.top + 4)) + 'px';
    t.focus(); t.select();
    V6S.edit = { n: n, b: b };
  }
  function v6EditDone(ok) {
    const E = V6S.edit; $('v6Ed').style.display = 'none'; V6S.edit = null;
    if (!E || !ok) return;
    if (E.n) { const v = $('v6EdT').value; if (v.trim()) E.n.text = v; else { const L2 = V6S.notes[V6S.mode]; L2.splice(L2.indexOf(E.n), 1); V6S.nsel = null; } v6Paint(); }
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
      if (!h) V6S.pan = { x: e.clientX, y: e.clientY, vp: V6S.vp.slice() };
      if (V6S.edit) v6EditDone(true);
      V6S.nsel = h && h.kind === 'note' ? h.id : null;
      if (h && (h.kind === 'part' || h.kind === 'label')) V6S.psel = h.id; else if (h) V6S.psel = null;
      if (h && h.kind === 'note') { const n = v6Note(h.id); $('v6Ns').value = $('v6NsR').value = n.size; $('v6Nb').checked = n.bold; }
      v6PartRow(); v6Paint(h);
      if (!h) return;
      if (h.kind === 'view' && !V6S.pos) V6S.pos = JSON.parse(JSON.stringify(V6S.prev.pos));
      if ((h.kind === 'iso' || h.kind === 'isoR') && !V6S.iso) V6S.iso = v6IsoDefault(V6S.prev.o, V6S.prev, V6S.pos || V6S.prev.pos);
      if (h.kind === 'tot' && !V6S.tot) V6S.tot = (V6S.prev.totPos || [0.95, 0.95]).slice();
      if (h.kind === 'isoR') {
        const f = V6S.prev.hits.find(function (x) { return x.kind === 'iso'; }).r, c = [f.x + f.w / 2, f.y + f.h / 2];
        V6S.drag = { h: h, x: t.x, y: t.y, c: c, d0: Math.max(4, Math.hypot(t.x - c[0], t.y - c[1])), k0: V6S.prev.o.isoK, k: V6S.prev.o.isoK };
        e.preventDefault(); return;
      }
      V6S.drag = { tot: V6S.tot && V6S.tot.slice(), h: h, x: t.x, y: t.y, pos: JSON.parse(JSON.stringify(V6S.pos)), iso: V6S.iso && V6S.iso.slice(), off: (V6S.off[h.id] || [0, 0]).slice(), note: h.kind === 'note' ? [v6Note(h.id).x, v6Note(h.id).y] : null };
      e.preventDefault();
    });
    pc.addEventListener('dblclick', function (e) { const t = v6Hit(e); if (t && t.h && (t.h.kind === 'note' || t.h.kind === 'label' || t.h.kind === 'part')) v6Edit(t.h); else if (t && !t.h) v6Fit(); });
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
      if (!h || V6S.mode !== 'exp' || (h.kind !== 'part' && h.kind !== 'label')) return;
      V6S.psel = h.id; v6PartRow(); v6Paint(h);
      const items = [[L('Combine (gộp body cùng khối lượng)', 'Combine (bodies of the same mass)'), function () { v6CombStart(h.id); }, 'merge']];
      if ((V6S.grp[h.id] || []).length) items.push([L('Tách ra', 'Uncombine'), function () { v6Uncomb(h.id); }, 'split']);
      showMenu(items, e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
      if (!V6S.prev) return;
      if (V6S.pan) { V6S.vp = [V6S.pan.vp[0] + e.clientX - V6S.pan.x, V6S.pan.vp[1] + e.clientY - V6S.pan.y]; pc.style.cursor = 'grabbing'; v6Paint(); return; }
      const t = v6Hit(e); if (!t) return;
      if (!V6S.drag) {
        if (e.target !== pc) return;
        const h = t.h;
        pc.style.cursor = V6S.comb !== null ? (h && v6CombCands().has(h.id) ? 'copy' : 'default') : !h ? 'grab' : h.kind === 'isoR' ? 'nwse-resize' : h.kind === 'view' ? (h.n === 'front' ? 'move' : (h.n === 'top' || h.n === 'bottom') ? 'ns-resize' : 'ew-resize') : 'move';
        if (h !== V6S.hov) { V6S.hov = h; v6Paint(h); }
        return;
      }
      const D = V6S.drag, h = D.h, dx = (t.x - D.x) / V6S.lay.W, dy = (t.y - D.y) / V6S.lay.H;
      if (Math.abs(t.x - D.x) + Math.abs(t.y - D.y) > 2) D.moved = true;
      if (h.kind === 'view') {
        const P = JSON.parse(JSON.stringify(D.pos));
        if (h.n === 'front') { P.front = [P.front[0] + dx, P.front[1] + dy]; ['left', 'right', 'back'].forEach(function (k) { P[k] += dx; }); ['top', 'bottom'].forEach(function (k) { P[k] += dy; }); }
        else if (h.n === 'top' || h.n === 'bottom') P[h.n] += dy;
        else P[h.n] += dx;
        V6S.pos = P;
      } else if (h.kind === 'iso') V6S.iso = [D.iso[0] + dx, D.iso[1] + dy];
      else if (h.kind === 'part' || h.kind === 'label') V6S.off[h.id] = [D.off[0] + dx, D.off[1] + dy];
      else if (h.kind === 'note') { const n = v6Note(h.id); n.x = D.note[0] + dx; n.y = D.note[1] + dy; }
      else if (h.kind === 'tot') V6S.tot = [D.tot[0] + dx, D.tot[1] + dy];
      else if (h.kind === 'isoR') D.k = Math.max(0.1, Math.min(5, D.k0 * Math.hypot(t.x - D.c[0], t.y - D.c[1]) / D.d0));
      v6Paint(h);
    });
    window.addEventListener('mouseup', function () {
      if (V6S.pan) { V6S.pan = null; pc.style.cursor = 'grab'; }
      const D = V6S.drag; if (!D) return;
      V6S.drag = null;
      if (D.h.kind === 'isoR' && D.k !== D.k0) { $('v6IsoK').value = $('v6IsoKR').value = Math.round(D.k * 100); v6Paint(V6S.hov); v6Preview(); return; }
      v6Paint(V6S.hov);
    });
    pc.addEventListener('mouseleave', function () { if (!V6S.drag && V6S.hov) { V6S.hov = null; v6Paint(); } });
    window.addEventListener('keydown', function (e) {
      if ($('pop_v6').classList.contains('on') && V6S.comb !== null && e.key === 'Escape') { v6CombEnd(); e.preventDefault(); e.stopPropagation(); return; }
      if (!$('pop_v6').classList.contains('on') || !V6S.nsel || V6S.edit) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { v6DelNote(); e.preventDefault(); e.stopPropagation(); }
    }, true);
  })();
  function v6DelNote() { const L2 = V6S.notes[V6S.mode], n = v6Note(V6S.nsel); if (n) L2.splice(L2.indexOf(n), 1); V6S.nsel = null; v6Paint(); }
  $('v6AddT').addEventListener('click', function () {
    if (!V6S.prev) return;
    const n = { id: V6S.seq++, text: L('Ghi chú', 'Note'), x: 0.06, y: 0.06, size: v6Num('v6Ns', 4), bold: $('v6Nb').checked };
    V6S.notes[V6S.mode].push(n); V6S.nsel = n.id; v6Paint();
    const h = (V6S.prev.hits || []).find(function (x) { return x.kind === 'note' && x.id === n.id; });
    if (h) v6Edit(h);
  });
  $('v6DelT').addEventListener('click', v6DelNote);
  ['v6Ns', 'v6NsR', 'v6Nb'].forEach(function (id) {
    $(id).addEventListener('input', function () { const n = v6Note(V6S.nsel); if (!n) return; n.size = v6Num('v6Ns', n.size); n.bold = $('v6Nb').checked; v6Paint(); });
  });
  // part row in the panel: rename / material of the selected part, straight onto the body
  v6MatOpts($('v6PMat'));
  $('v6PName').addEventListener('change', function () { const b = S.bodies.find(function (x) { return x.id === V6S.psel; }); if (b) { v6SetName(b, this.value); v6PartRow(); v6Paint(); } });
  $('v6PName').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); e.stopPropagation(); });
  $('v6PMat').addEventListener('change', function () { const b = S.bodies.find(function (x) { return x.id === V6S.psel; }); if (b) { v6SetMat(b, this.value); v6PartRow(); v6Paint(); } });
  // the body list / Properties changed a name, material or what is shown: follow
  let v6Sig = '';
  setInterval(function () {
    if (!$('pop_v6').classList.contains('on') || !V6S.prev) return;
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
      if (e.target.closest('button,input,select')) return;
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
  new MutationObserver(function () {
    const on = $('pop_v6').classList.contains('on');
    $('v6Sheet').classList.toggle('on', on);
    if (!on && V6S.edit) v6EditDone(false);
    if (!on) V6S.comb = null;
    if (on) v6Preview();
  }).observe($('pop_v6'), { attributes: true, attributeFilter: ['class'] });

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
  document.querySelectorAll('.v6v').forEach(function (c) { c.addEventListener('change', function () { V6S.pos = null; }); });
  ['v6Scale', 'v6ScA', 'v6ScB', 'v6ScR', 'v6Paper', 'v6Ori', 'v6Dim', 'v6Lbl', 'v6ScN', 'v6Zm', 'v6Fs'].forEach(function (id) { $(id).addEventListener('change', function () { V6S.pos = null; V6S.iso = null; }); });
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
  $('v6Auto').addEventListener('click', function () { V6S.pos = null; V6S.iso = null; V6S.off = {}; v6Preview(); });
  // custom scale a : b — the slider runs on a log scale from 1:100 to 100:1
  function v6ScSync() { const a = parseFloat($('v6ScA').value) || 1, b = parseFloat($('v6ScB').value) || 1; $('v6ScR').value = Math.max(-2, Math.min(2, Math.log10(a / b))).toFixed(2); }
  $('v6ScR').addEventListener('input', function () {
    const r = Math.pow(10, +this.value), nice = function (v) { return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10; };
    if (r >= 1) { $('v6ScA').value = nice(r); $('v6ScB').value = 1; } else { $('v6ScA').value = 1; $('v6ScB').value = nice(1 / r); }
  });
  ['v6ScA', 'v6ScB'].forEach(function (id) { $(id).addEventListener('input', v6ScSync); });
  // ---------- the two drawings (6 view / Exploded view): own settings, switched in the panel, saved with the session
  function v6Ctls() { return Array.from(document.querySelectorAll('#pop_v6 input, #pop_v6 select')).filter(function (el) { return el.type !== 'range' && !/^v6(Ns|Nb|PName|PMat)$/.test(el.id); }); }
  function v6Key(el) { return el.id || (el.dataset.v ? 'v:' + el.dataset.v : ''); }
  function v6Snap() { const c = {}; v6Ctls().forEach(function (el) { const k = v6Key(el); if (k) c[k] = el.type === 'checkbox' ? el.checked : el.value; }); return c; }
  function v6Apply(c) {
    v6Ctls().forEach(function (el) { const k = v6Key(el); if (!k || !(k in c)) return; if (el.type === 'checkbox') el.checked = !!c[k]; else el.value = c[k]; });
    V6_PAIRS.forEach(function (p) { $(p[0]).value = $(p[1]).value; }); v6ScSync();
  }
  function v6StGet() { return { R: V6S.R, pos: V6S.pos, iso: V6S.iso, off: V6S.off, tot: V6S.tot, grp: V6S.grp }; }
  function v6StSet(t) { t = t || {}; V6S.R = t.R || [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; V6S.pos = t.pos || null; V6S.iso = t.iso || null; V6S.off = t.off || {}; V6S.tot = t.tot || null; V6S.grp = t.grp || {}; }
  function v6SetMode(m) {
    if (V6S.edit) v6EditDone(false);
    V6S.comb = null;
    if (m !== V6S.mode) { V6S.cfg[V6S.mode] = v6Snap(); V6S.st[V6S.mode] = v6StGet(); V6S.mode = m; v6Apply(V6S.cfg[m]); v6StSet(V6S.st[m]); }
    V6S.nsel = null; V6S.psel = null; v6Sync(); v6Preview();
  }
  document.querySelectorAll('#v6Seg button').forEach(function (b) { b.addEventListener('click', function () { v6SetMode(b.dataset.k); }); });
  V6S.def = v6Snap(); V6S.cfg = { '6v': v6Snap(), exp: v6Snap() };
  // session: body ids change when a session is opened, so hand placements of parts are kept by body order
  function v6Dump() {
    V6S.cfg[V6S.mode] = v6Snap(); V6S.st[V6S.mode] = v6StGet();
    const idx = new Map(S.bodies.map(function (b, i) { return [String(b.id), i]; })), st = {};
    for (const m of ['6v', 'exp']) {
      const t = V6S.st[m] || {}, off = {};
      for (const id in (t.off || {})) if (idx.has(id)) off[idx.get(id)] = t.off[id];
      const grp = {};
      for (const id in (t.grp || {})) if (idx.has(id)) grp[idx.get(id)] = t.grp[id].filter(function (x) { return idx.has(String(x)); }).map(function (x) { return idx.get(String(x)); });
      st[m] = { R: t.R || null, pos: t.pos || null, iso: t.iso || null, tot: t.tot || null, off: off, grp: grp };
    }
    return { mode: V6S.mode, cfg: JSON.parse(JSON.stringify(V6S.cfg)), st: st, notes: JSON.parse(JSON.stringify(V6S.notes)), seq: V6S.seq };
  }
  function v6Load(d) {
    if (V6S.edit) v6EditDone(false);
    d = d || {};
    const ids = S.bodies.map(function (b) { return b.id; }), cf = d.cfg || {}, sd = d.st || {};
    V6S.cfg = { '6v': Object.assign({}, V6S.def, cf['6v']), exp: Object.assign({}, V6S.def, cf.exp) };
    for (const m of ['6v', 'exp']) {
      const t = sd[m] || {}, off = {};
      for (const i in (t.off || {})) if (ids[i] !== undefined) off[ids[i]] = t.off[i];
      const grp = {};
      for (const i in (t.grp || {})) if (ids[i] !== undefined) grp[ids[i]] = t.grp[i].filter(function (j) { return ids[j] !== undefined; }).map(function (j) { return ids[j]; });
      V6S.st[m] = { R: t.R, pos: t.pos, iso: t.iso, tot: t.tot, off: off, grp: grp };
    }
    const nt = d.notes || {};
    V6S.notes = { '6v': nt['6v'] || [], exp: nt.exp || [] };
    V6S.seq = Math.max(d.seq || 1, 1 + Math.max.apply(null, [0].concat(V6S.notes['6v'], V6S.notes.exp).map(function (n) { return n.id || 0; })));
    V6S.mode = d.mode === 'exp' ? 'exp' : '6v'; v6Apply(V6S.cfg[V6S.mode]); v6StSet(V6S.st[V6S.mode]);
    V6S.nsel = null; V6S.psel = null; V6S.prev = null; V6S.comb = null; v6Sync(); v6Preview();
  }
  $('v6Save').addEventListener('click', function () {
    v6Full().then(function (r) {
      download([r.blob], 'mrt_' + (r.o.exp ? 'exploded' : '6view') + '_' + r.o.dpi + 'dpi.' + r.o.fmt);
      flash(L('Đã lưu ảnh ', 'Saved the picture ') + r.o.W + ' × ' + r.o.H + ' px, ' + r.o.dpi + ' dpi, ' + v6Size(r.blob.size));
      const e = $('v6Est'); if (e) e.textContent = v6Size(r.blob.size) + ' (' + r.o.fmt.toUpperCase() + L(', đã lưu)', ', saved)');
    }).catch(showError);
  });
  $('v6Copy').addEventListener('click', function () {
    v6Full('png').then(function (r) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': r.blob })]).then(function () { flash(L('Đã chép ảnh vào clipboard', 'Picture copied to the clipboard')); });
    }).catch(showError);
  });
