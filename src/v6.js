
  // ================= 6 views: drawing-style orthographic projections (Top / Front / Left / Right / Back / Bottom) =================
  // Each view is rendered off screen (WebGL) into a depth image; edges (sharp mesh edges, B-rep edges, silhouettes) are then
  // traced with Canvas 2D and kept where the depth image shows they are not covered, so the lines have any width and stay smooth.
  const V6_VIEWS = {   // d = looking direction, r = screen right, u = screen up (Z is up)
    front: { d: [0, 1, 0], r: [1, 0, 0], u: [0, 0, 1], vi: 'TRƯỚC', en: 'FRONT' },
    back: { d: [0, -1, 0], r: [-1, 0, 0], u: [0, 0, 1], vi: 'SAU', en: 'BACK' },
    left: { d: [1, 0, 0], r: [0, -1, 0], u: [0, 0, 1], vi: 'TRÁI', en: 'LEFT' },
    right: { d: [-1, 0, 0], r: [0, 1, 0], u: [0, 0, 1], vi: 'PHẢI', en: 'RIGHT' },
    top: { d: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], vi: 'TRÊN', en: 'TOP' },
    bottom: { d: [0, 0, 1], r: [1, 0, 0], u: [0, -1, 0], vi: 'DƯỚI', en: 'BOTTOM' }
  };
  const V6_PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
  const V6_MAXPX = 120e6;
  let v6gl = null;

  function v6Num(id, def) { const v = parseFloat($(id).value); return isFinite(v) ? v : def; }
  function v6Opt() {
    const views = {};
    document.querySelectorAll('.v6v').forEach(function (c) { views[c.dataset.v] = c.checked; });
    const dpi = Math.max(72, Math.min(600, v6Num('v6Dpi', 300))), paper = $('v6Paper').value;
    let W, H;
    if (paper === 'px') { W = Math.round(v6Num('v6W', 3000)); H = Math.round(v6Num('v6H', 2000)); }
    else { let p = V6_PAPER[paper]; if ($('v6Ori').value === 'P') p = [p[1], p[0]]; W = Math.round(p[0] / 25.4 * dpi); H = Math.round(p[1] / 25.4 * dpi); }
    W = Math.max(100, W); H = Math.max(100, H);
    if (W * H > V6_MAXPX) { const k = Math.sqrt(V6_MAXPX / (W * H)); W = Math.floor(W * k); H = Math.floor(H * k); }
    return { views: views, style: $('v6Style').value, hidden: $('v6Hid').value === '1', dim: $('v6Dim').checked, unit: $('v6Unit').value,
      lbl: $('v6Lbl').checked, W: W, H: H, dpi: dpi, lw: v6Num('v6Lw', 0.25), ang: v6Num('v6Ang', 30), bg: $('v6Bg').value };
  }
  function v6Bodies() {
    const s = S.bodies.filter(function (b) { return b.visible && S.sel.has(b); });
    return s.length ? s : S.bodies.filter(function (b) { return b.visible; });
  }

  // world-space triangles + edge lists of one body
  function v6Prep(b, ang) {
    const m = dispMatrix(b), P = b.geo.positions, I = b.geo.indices, nv = P.length / 3, nt = I.length / 3;
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
    const N = new Float64Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      const a = 3 * I[3 * t], c = 3 * I[3 * t + 1], d = 3 * I[3 * t + 2];
      const ux = W[c] - W[a], uy = W[c + 1] - W[a + 1], uz = W[c + 2] - W[a + 2], vx = W[d] - W[a], vy = W[d + 1] - W[a + 1], vz = W[d + 2] - W[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      N[3 * t] = nx / l; N[3 * t + 1] = ny / l; N[3 * t + 2] = nz / l;
    }
    const em = new Map(), E = [];      // E: [va, vb, t1, t2 (-1 none), count]
    for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) {
      const a = id[I[3 * t + c]], bb = id[I[3 * t + (c + 1) % 3]]; if (a === bb) continue;
      const k = a < bb ? a * nv + bb : bb * nv + a;
      const e = em.get(k);
      if (e === undefined) { em.set(k, E.length); E.push([a, bb, t, -1, 1]); } else { const r = E[e]; if (r[3] < 0) r[3] = t; r[4]++; }
    }
    const brep = !!(b.geo.brepE && b.geo.brepE.length), cosA = Math.cos(ang * Math.PI / 180);
    const fixed = [], sil = [];       // fixed: segments drawn in every view; sil: edges between two triangles (silhouette candidates)
    if (brep) { const BE = b.geo.brepE; for (let i = 0; i < BE.length; i += 2) fixed.push([BE[i], BE[i + 1]]); }
    for (const e of E) {
      if (e[3] < 0 || e[4] > 2) { if (!brep) fixed.push([e[0], e[1]]); continue; }
      const t1 = e[2], t2 = e[3], c = N[3 * t1] * N[3 * t2] + N[3 * t1 + 1] * N[3 * t2 + 1] + N[3 * t1 + 2] * N[3 * t2 + 2];
      if (!brep && c < cosA) fixed.push([e[0], e[1]]); else sil.push(e);
    }
    return { W: W, I: I, N: N, fixed: fixed, sil: sil, lo: lo, hi: hi, color: b.color };
  }

  function v6GL() {
    if (v6gl) return v6gl;
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!g) throw new Error(L('Trình duyệt không có WebGL2', 'WebGL2 is not available'));
    const sh = function (type, src) { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s)); return s; };
    const vs = '#version 300 es\nprecision highp float;layout(location=0) in vec3 aP;uniform vec3 uR,uU,uD;uniform vec4 uBox;uniform vec2 uZ;out vec3 vP;\n' +
      'void main(){float x=dot(aP,uR),y=dot(aP,uU),z=dot(aP,uD);vP=vec3(x,y,-z);' +
      'gl_Position=vec4((x-uBox.x)/uBox.z*2.0-1.0,(y-uBox.y)/uBox.w*2.0-1.0,(z-uZ.x)/uZ.y*2.0-1.0,1.0);}';
    const fs = '#version 300 es\nprecision highp float;in vec3 vP;uniform int uMode;uniform vec3 uC;out vec4 o;\n' +
      'void main(){if(uMode==0){float v=floor(gl_FragCoord.z*16777215.0);float r=floor(v/65536.0);float gg=floor((v-r*65536.0)/256.0);float b=v-r*65536.0-gg*256.0;o=vec4(r,gg,b,255.0)/255.0;}' +
      'else{vec3 n=normalize(cross(dFdx(vP),dFdy(vP)));if(n.z<0.0)n=-n;float l=0.38+0.62*max(dot(n,normalize(vec3(-0.35,0.45,0.82))),0.0);o=vec4(uC*l,1.0);}}';
    const p = g.createProgram(); g.attachShader(p, sh(g.VERTEX_SHADER, vs)); g.attachShader(p, sh(g.FRAGMENT_SHADER, fs)); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
    const U = {}; ['uR', 'uU', 'uD', 'uBox', 'uZ', 'uMode', 'uC'].forEach(function (n) { U[n] = g.getUniformLocation(p, n); });
    v6gl = { g: g, p: p, U: U, max: g.getParameter(g.MAX_RENDERBUFFER_SIZE) };
    return v6gl;
  }

  // render one view: returns {w, h, depth (Float32 0..1, 1 = empty, already max-filtered 3x3), fill (ImageData)}
  function v6RenderView(G, preps, V6, box, zr, w, h, fillMode) {
    const g = G.g, U = G.U;
    const fb = g.createFramebuffer(), cb = g.createRenderbuffer(), db = g.createRenderbuffer();
    g.bindRenderbuffer(g.RENDERBUFFER, cb); g.renderbufferStorage(g.RENDERBUFFER, g.RGBA8, w, h);
    g.bindRenderbuffer(g.RENDERBUFFER, db); g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH_COMPONENT24, w, h);
    g.bindFramebuffer(g.FRAMEBUFFER, fb);
    g.framebufferRenderbuffer(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.RENDERBUFFER, cb);
    g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.RENDERBUFFER, db);
    g.viewport(0, 0, w, h); g.useProgram(G.p); g.enable(g.DEPTH_TEST); g.disable(g.CULL_FACE);
    g.uniform3fv(U.uR, V6.r); g.uniform3fv(U.uU, V6.u); g.uniform3fv(U.uD, V6.d); g.uniform4fv(U.uBox, box); g.uniform2fv(U.uZ, zr);
    const draw = function (mode) {
      g.clearColor(1, 1, 1, mode === 0 ? 1 : 0); g.clearDepth(1); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT); g.uniform1i(U.uMode, mode);
      for (const p of preps) {
        if (mode === 1) g.uniform3f(U.uC, p.color[0] / 255, p.color[1] / 255, p.color[2] / 255);
        g.bindVertexArray(p.vao); g.drawElements(g.TRIANGLES, p.I.length, g.UNSIGNED_INT, 0);
      }
    };
    const px = new Uint8Array(w * h * 4);
    draw(0); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
    const raw = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {          // flip to top-down
      const ro = (h - 1 - y) * w * 4, wo = y * w;
      for (let x = 0; x < w; x++) { const k = ro + 4 * x; raw[wo + x] = (px[k] * 65536 + px[k + 1] * 256 + px[k + 2]) / 16777215; }
    }
    const fill = new ImageData(w, h);
    if (fillMode) {
      draw(1); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
      for (let y = 0; y < h; y++) { const ro = (h - 1 - y) * w * 4, wo = y * w * 4; for (let x = 0; x < 4 * w; x++) fill.data[wo + x] = px[ro + x]; }
    } else {
      for (let i = 0; i < w * h; i++) if (raw[i] < 1) { fill.data[4 * i] = fill.data[4 * i + 1] = fill.data[4 * i + 2] = 255; fill.data[4 * i + 3] = 255; }
    }
    g.bindFramebuffer(g.FRAMEBUFFER, null); g.deleteFramebuffer(fb); g.deleteRenderbuffer(cb); g.deleteRenderbuffer(db);
    // farthest depth of the 3x3 neighbourhood: an edge is hidden only when everything around it is in front
    const tmp = new Float32Array(w * h), dep = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let m = raw[i]; if (x > 0 && raw[i - 1] > m) m = raw[i - 1]; if (x < w - 1 && raw[i + 1] > m) m = raw[i + 1]; tmp[i] = m; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let m = tmp[i]; if (y > 0 && tmp[i - w] > m) m = tmp[i - w]; if (y < h - 1 && tmp[i + w] > m) m = tmp[i + w]; dep[i] = m; }
    return { depth: dep, fill: fill };
  }

  // the whole sheet; k scales sizes for the preview
  function v6Draw(o, k) {
    const bodies = v6Bodies();
    if (!bodies.length) throw new Error(L('Không có body nào đang hiện', 'No visible body'));
    const names = ['top', 'front', 'left', 'right', 'back', 'bottom'].filter(function (n) { return o.views[n]; });
    if (!names.length) throw new Error(L('Chưa chọn view nào', 'No view chosen'));
    const W = Math.max(50, Math.round(o.W * k)), H = Math.max(50, Math.round(o.H * k)), ppmm = o.dpi / 25.4 * k;
    const G = v6GL(), g = G.g;
    const preps = bodies.map(function (b) { return v6Prep(b, o.ang); });
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of preps) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.lo[i]); hi[i] = Math.max(hi[i], p.hi[i]); }
    const ext = V.sub(hi, lo), ctr = V.mul(V.add(lo, hi), 0.5), big = Math.max(ext[0], ext[1], ext[2], 1e-6);
    for (const p of preps) {        // GPU copy, centred for float precision
      const F = new Float32Array(p.W.length);
      for (let i = 0; i < F.length; i += 3) { F[i] = p.W[i] - ctr[0]; F[i + 1] = p.W[i + 1] - ctr[1]; F[i + 2] = p.W[i + 2] - ctr[2]; }
      p.vao = g.createVertexArray(); g.bindVertexArray(p.vao);
      p.vb = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, p.vb); g.bufferData(g.ARRAY_BUFFER, F, g.STATIC_DRAW);
      g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, 0, 0);
      p.ib = g.createBuffer(); g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, p.ib); g.bufferData(g.ELEMENT_ARRAY_BUFFER, p.I, g.STATIC_DRAW);
    }
    // layout: columns Left | Front | Right | Back, rows Top | middle | Bottom (third angle)
    const colOf = { left: 0, front: 1, top: 1, bottom: 1, right: 2, back: 3 }, rowOf = { top: 0, bottom: 2, front: 1, left: 1, right: 1, back: 1 };
    const colW = [ext[1], ext[0], ext[1], ext[0]], rowH = [ext[1], ext[2], ext[1]];
    const cols = [0, 1, 2, 3].filter(function (c) { return names.some(function (n) { return colOf[n] === c; }); });
    const rows = [0, 1, 2].filter(function (r) { return names.some(function (n) { return rowOf[n] === r; }); });
    const fontPx = Math.max(9, 2.6 * ppmm), lw = Math.max(1, o.lw * ppmm);
    const gap = Math.max(0.05 * Math.min(W, H), (o.dim ? 4.5 : 1.5) * fontPx), margin = Math.max(0.04 * Math.min(W, H), (o.dim ? 4 : 1) * fontPx);
    const sumW = cols.reduce(function (s, c) { return s + colW[c]; }, 0) || big, sumH = rows.reduce(function (s, r) { return s + rowH[r]; }, 0) || big;
    // room under the middle row for the dimensions, above every row for the view names
    const rgap = rows.slice(1).map(function (r) { return gap + (o.lbl ? 1.4 * fontPx : 0) + (o.dim && r === 2 && rows.indexOf(1) >= 0 ? 3.6 * fontPx : 0); });
    const gapsH = rgap.reduce(function (s, v) { return s + v; }, 0), topRoom = o.lbl ? 1.4 * fontPx : 0;
    const sc = Math.max(1e-6, Math.min((W - 2 * margin - gap * (cols.length - 1)) / sumW, (H - 2 * margin - gapsH - topRoom) / sumH));
    const usedW = sumW * sc + gap * (cols.length - 1), usedH = sumH * sc + gapsH + topRoom;
    const colX = {}, rowY = {};
    let x = (W - usedW) / 2; for (const c of cols) { colX[c] = x; x += colW[c] * sc + gap; }
    let y = (H - usedH) / 2 + topRoom; rows.forEach(function (r, i) { rowY[r] = y; y += rowH[r] * sc + (rgap[i] || 0); });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    if (o.bg === 'w') { c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, W, H); }
    const tol = 1.5e-3, pad = Math.ceil(lw) + 2, lineC = '#111111';
    const frames = {};
    for (const n of names) {
      const V6 = V6_VIEWS[n];
      let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, d0 = Infinity, d1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        const q = [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]].map(function (v, j) { return v - ctr[j]; });
        const a = V.dot(q, V6.r), bq = V.dot(q, V6.u), dq = V.dot(q, V6.d);
        r0 = Math.min(r0, a); r1 = Math.max(r1, a); u0 = Math.min(u0, bq); u1 = Math.max(u1, bq); d0 = Math.min(d0, dq); d1 = Math.max(d1, dq);
      }
      const dz = Math.max(d1 - d0, 1e-6); d0 -= 0.01 * dz; d1 += 0.01 * dz;
      const vw = Math.max(2, Math.ceil((r1 - r0) * sc) + 2 * pad), vh = Math.max(2, Math.ceil((u1 - u0) * sc) + 2 * pad);
      if (vw > G.max || vh > G.max) throw new Error(L('Ảnh quá lớn cho card đồ hoạ, giảm DPI hoặc khổ giấy', 'Picture too large for the graphics card, lower the DPI or the paper size'));
      const R0 = r0 - pad / sc, U0 = u0 - pad / sc;
      const box = [R0, U0, vw / sc, vh / sc];
      const out = v6RenderView(G, preps, V6, box, [d0, d1 - d0], vw, vh, o.style !== 'line');
      const ox = Math.round(colX[colOf[n]] + ((colW[colOf[n]] - (r1 - r0)) / 2) * sc - pad), oy = Math.round(rowY[rowOf[n]] + ((rowH[rowOf[n]] - (u1 - u0)) / 2) * sc - pad);
      frames[n] = { x: ox + pad, y: oy + pad, w: (r1 - r0) * sc, h: (u1 - u0) * sc };
      if (o.style !== 'line' || o.bg === 't') {
        const t = document.createElement('canvas'); t.width = vw; t.height = vh; t.getContext('2d').putImageData(out.fill, 0, 0); c2.drawImage(t, ox, oy);
      }
      if (o.style === 'shade') continue;
      // edges
      const dep = out.depth, vis = new Path2D(), hid = new Path2D();
      const proj = function (p) { const q = [p[0] - ctr[0], p[1] - ctr[1], p[2] - ctr[2]]; return [(V.dot(q, V6.r) - R0) * sc, vh - (V.dot(q, V6.u) - U0) * sc, (V.dot(q, V6.d) - d0) / (d1 - d0)]; };
      const seg = function (A, B) {
        const n2 = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 0.75));
        let state = -1, sx = 0, sy = 0;
        for (let i = 0; i <= n2; i++) {
          const t = i / n2, px = A[0] + (B[0] - A[0]) * t, py = A[1] + (B[1] - A[1]) * t, pz = A[2] + (B[2] - A[2]) * t;
          const ix = Math.floor(px), iy = Math.floor(py);
          const on = ix < 0 || iy < 0 || ix >= vw || iy >= vh || dep[iy * vw + ix] >= pz - tol ? 1 : 0;
          if (on !== state) {
            if (state >= 0) (state ? vis : hid).lineTo(px + ox, py + oy);
            (on ? vis : hid).moveTo(px + ox, py + oy); state = on; sx = px; sy = py;
          }
          if (i === n2) (state ? vis : hid).lineTo(px + ox, py + oy);
        }
      };
      for (const p of preps) {
        const Wp = p.W, pt = function (i) { return [Wp[3 * i], Wp[3 * i + 1], Wp[3 * i + 2]]; };
        for (const e of p.fixed) seg(proj(pt(e[0])), proj(pt(e[1])));
        const d = V6.d, N = p.N;
        for (const e of p.sil) {
          const a = N[3 * e[2]] * d[0] + N[3 * e[2] + 1] * d[1] + N[3 * e[2] + 2] * d[2], b2 = N[3 * e[3]] * d[0] + N[3 * e[3] + 1] * d[1] + N[3 * e[3] + 2] * d[2];
          if (a * b2 < 0 || (a === 0) !== (b2 === 0)) seg(proj(pt(e[0])), proj(pt(e[1])));
        }
      }
      c2.lineCap = 'round'; c2.lineJoin = 'round';
      if (o.hidden) { c2.save(); c2.strokeStyle = '#8a8a8a'; c2.lineWidth = Math.max(1, lw * 0.6); c2.setLineDash([4 * lw, 3 * lw]); c2.stroke(hid); c2.restore(); }
      c2.strokeStyle = lineC; c2.lineWidth = lw; c2.stroke(vis);
    }
    for (const p of preps) { g.deleteVertexArray(p.vao); g.deleteBuffer(p.vb); g.deleteBuffer(p.ib); }
    // overall dimensions and view names
    c2.fillStyle = lineC; c2.strokeStyle = lineC; c2.setLineDash([]);
    const font = Math.round(fontPx) + 'px "Segoe UI", Arial, sans-serif';
    const txt = function (v) {
      const mm = (Math.round(v * 10) / 10).toFixed(1), inch = '[' + (v / 25.4).toFixed(1) + ' in]';
      return o.unit === 'mm' ? [mm] : o.unit === 'in' ? [(v / 25.4).toFixed(2) + ' in'] : [inch, mm];
    };
    const arrow = function (x0, y0, x1, y1) {
      const a = Math.atan2(y1 - y0, x1 - x0), L2 = 2.6 * fontPx / 2.6 * 1.1, wv = L2 * 0.32;
      c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x1 - L2 * Math.cos(a) + wv * Math.sin(a), y1 - L2 * Math.sin(a) - wv * Math.cos(a));
      c2.lineTo(x1 - L2 * Math.cos(a) - wv * Math.sin(a), y1 - L2 * Math.sin(a) + wv * Math.cos(a)); c2.closePath(); c2.fill();
    };
    const dimH = function (x0, x1, yb, yd, v) {   // horizontal: extension lines from yb down to yd
      c2.lineWidth = Math.max(1, lw * 0.55); c2.beginPath();
      c2.moveTo(x0, yb + 0.4 * fontPx); c2.lineTo(x0, yd + 0.5 * fontPx); c2.moveTo(x1, yb + 0.4 * fontPx); c2.lineTo(x1, yd + 0.5 * fontPx);
      c2.moveTo(x0, yd); c2.lineTo(x1, yd); c2.stroke(); arrow(x1, yd, x0, yd); arrow(x0, yd, x1, yd);
      const t = txt(v); c2.font = font; c2.textAlign = 'center'; c2.textBaseline = 'top';
      t.forEach(function (s, i) { c2.fillText(s, (x0 + x1) / 2, yd + 0.25 * fontPx + i * 1.1 * fontPx); });
    };
    const dimV = function (y0, y1, xb, xd, v) {   // vertical: extension lines from xb left to xd
      c2.lineWidth = Math.max(1, lw * 0.55); c2.beginPath();
      c2.moveTo(xb - 0.4 * fontPx, y0); c2.lineTo(xd - 0.5 * fontPx, y0); c2.moveTo(xb - 0.4 * fontPx, y1); c2.lineTo(xd - 0.5 * fontPx, y1);
      c2.moveTo(xd, y0); c2.lineTo(xd, y1); c2.stroke(); arrow(xd, y1, xd, y0); arrow(xd, y0, xd, y1);
      const t = txt(v); c2.font = font; c2.textAlign = 'right'; c2.textBaseline = 'middle';
      t.forEach(function (s, i) { c2.fillText(s, xd - 0.4 * fontPx, (y0 + y1) / 2 + (i - (t.length - 1) / 2) * 1.1 * fontPx); });
    };
    if (o.dim) {
      const fx = frames.front || frames.back || frames.top || frames.bottom;
      if (fx) { const below = frames.front || frames.back ? Math.max.apply(null, ['front', 'left', 'right', 'back'].filter(function (n) { return frames[n]; }).map(function (n) { return frames[n].y + frames[n].h; })) : fx.y + fx.h; dimH(fx.x, fx.x + fx.w, fx.y + fx.h, below + 1.6 * fontPx, ext[0]); }
      const fy = frames.right || frames.left;
      if (fy) { const below = Math.max.apply(null, ['front', 'left', 'right', 'back'].filter(function (n) { return frames[n]; }).map(function (n) { return frames[n].y + frames[n].h; })); dimH(fy.x, fy.x + fy.w, fy.y + fy.h, below + 1.6 * fontPx, ext[1]); }
      else if (frames.top && !frames.front && !frames.back) { const t = frames.top; dimV(t.y, t.y + t.h, t.x, t.x - 1.6 * fontPx, ext[1]); }
      const fz = frames.right || frames.front || frames.left || frames.back;
      if (fz) dimV(fz.y, fz.y + fz.h, fz.x, fz.x - 1.2 * fontPx, ext[2]);
    }
    if (o.lbl) {
      c2.font = 'bold ' + font; c2.textAlign = 'center'; c2.textBaseline = 'bottom';
      for (const n of names) { const f = frames[n]; c2.fillText(L(V6_VIEWS[n].vi, V6_VIEWS[n].en), f.x + f.w / 2, f.y - 0.5 * fontPx); }
    }
    return cv;
  }

  // PNG with the DPI written in (pHYs chunk after IHDR)
  const V6_CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function v6Crc(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = V6_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function v6Png(cv, dpi) {
    const blob = await new Promise(function (res) { cv.toBlob(res, 'image/png'); });
    const src = new Uint8Array(await blob.arrayBuffer()), ppm = Math.round(dpi / 0.0254);
    const ch = new Uint8Array(21), dv = new DataView(ch.buffer);
    dv.setUint32(0, 9); ch.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); ch[16] = 1;
    dv.setUint32(17, v6Crc(ch.subarray(4, 17)));
    const out = new Uint8Array(src.length + 21); out.set(src.subarray(0, 33)); out.set(ch, 33); out.set(src.subarray(33), 54);
    return new Blob([out], { type: 'image/png' });
  }

  function v6Sync() {
    const o = v6Opt(), px = $('v6Paper').value === 'px';
    document.querySelectorAll('.v6px').forEach(function (r) { r.style.display = px ? '' : 'none'; });
    $('v6Ori').style.display = px ? 'none' : '';
    $('v6Info').textContent = o.W + ' × ' + o.H + ' px';
    return o;
  }
  let v6Timer = 0;
  function v6Preview() {
    clearTimeout(v6Timer);
    v6Timer = setTimeout(function () {
      if (!$('pop_v6').classList.contains('on')) return;
      const o = v6Sync(), pc = $('v6Prev'), k = 300 / o.W;
      pc.width = 300; pc.height = Math.max(40, Math.round(o.H * k)); pc.style.height = pc.height + 'px';
      const g = pc.getContext('2d'); g.clearRect(0, 0, pc.width, pc.height);
      try { const cv = v6Draw(o, k); g.drawImage(cv, 0, 0, pc.width, pc.height); }
      catch (e) { g.fillStyle = '#666'; g.font = '12px sans-serif'; g.fillText(e.message, 8, 20); }
    }, 200);
  }
  async function v6Full() {
    const o = v6Sync();
    setBusy(true, L("Đang dựng 6 view…", "Drawing 6 views…"));
    await new Promise(function (r) { setTimeout(r, 30); });
    try { const cv = v6Draw(o, 1); return { blob: await v6Png(cv, o.dpi), o: o }; }
    finally { setBusy(false); }
  }
  document.querySelectorAll('#pop_v6 input, #pop_v6 select').forEach(function (el) { el.addEventListener('input', v6Preview); el.addEventListener('change', v6Preview); });
  [['v6DpiR', 'v6Dpi'], ['v6WR', 'v6W'], ['v6HR', 'v6H'], ['v6LwR', 'v6Lw'], ['v6AngR', 'v6Ang']].forEach(function (p) {
    const r = $(p[0]), n = $(p[1]);
    r.addEventListener('input', function () { n.value = r.value; });
    n.addEventListener('input', function () { r.value = n.value; });
  });
  document.querySelectorAll('.popb[data-pop=v6]').forEach(function (b) { b.addEventListener('click', function () { setTimeout(v6Preview, 0); }); });
  $('v6Save').addEventListener('click', function () {
    v6Full().then(function (r) { download([r.blob], 'mrt_6view_' + r.o.dpi + 'dpi.png'); flash(L('Đã lưu ảnh 6 view ', 'Saved the 6-view picture ') + r.o.W + ' × ' + r.o.H + ' px, ' + r.o.dpi + ' dpi'); }).catch(showError);
  });
  $('v6Copy').addEventListener('click', function () {
    v6Full().then(function (r) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': r.blob })]).then(function () { flash(L('Đã chép ảnh 6 view vào clipboard', '6-view picture copied to the clipboard')); });
    }).catch(showError);
  });
