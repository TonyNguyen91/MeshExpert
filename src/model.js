  // ================= sketch, solids from a sketch, boolean =================
  // A sketch lives on a plane {o, u, v, n}; entities are lines, circles and arcs in (u, v) millimetres.
  S.sk = null;                                               // the sketch being drawn: {frame, ents, tool, pts, cur, sel, hist, prev}
  S.sketch = null;                                           // the last finished sketch: {frame, ents}
  S.fd = null;                                               // open feature dialog: {type, edit, lines}
  const SK_PLANES = {
    top: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
    front: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] },
    right: { o: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] }
  };
  const sk3 = function (f, p) { return [f.o[0] + p[0] * f.u[0] + p[1] * f.v[0], f.o[1] + p[0] * f.u[1] + p[1] * f.v[1], f.o[2] + p[0] * f.u[2] + p[1] * f.v[2]]; };
  const skScr = function (f, p) { return project(sk3(f, p)); };
  function skFromScreen(f, px, py) {
    const r = screenRay(px, py), dn = V.dot(r.d, f.n);
    if (Math.abs(dn) < 1e-9) return null;
    const t = V.dot(V.sub(f.o, r.o), f.n) / dn, w = V.sub(V.add(r.o, V.mul(r.d, t)), f.o);
    return [V.dot(w, f.u), V.dot(w, f.v)];
  }
  const d2 = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  const TAU = 2 * Math.PI, angOf = function (c, p) { return Math.atan2(p[1] - c[1], p[0] - c[0]); }, onC = function (c, r, a) { return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; };
  const norm2pi = function (a) { a %= TAU; return a < 0 ? a + TAU : a; };
  // points along an entity (arcs run counter-clockwise from a0 to a1)
  function skTess(e) {
    if (e.t === 'line') return [e.a, e.b];
    const full = e.t === 'circle', a0 = full ? 0 : e.a0, span = full ? TAU : e.a1 - e.a0, n = Math.max(2, Math.ceil(span / (Math.PI / 36))), out = [];
    for (let k = 0; k <= n; k++) out.push(onC(e.c, e.r, a0 + span * k / n));
    return out;
  }
  const skEnds = function (e) { return e.t === 'line' ? [e.a, e.b] : e.t === 'arc' ? [onC(e.c, e.r, e.a0), onC(e.c, e.r, e.a1)] : []; };
  // closed outlines of the sketch, grouped into regions (outline + its holes)
  function skRegions(ents) {
    const use = ents.filter(function (e) { return !e.axis; }), loops = [];
    let size = 1;
    for (const e of use) for (const p of skTess(e)) size = Math.max(size, Math.abs(p[0]), Math.abs(p[1]));
    const tol = 1e-6 * size, nodes = [], open = [], items = [];
    const node = function (p) { for (let i = 0; i < nodes.length; i++) if (d2(nodes[i].p, p) <= tol) return i; nodes.push({ p: p, e: [] }); return nodes.length - 1; };
    for (const e of use) {
      if (e.t === 'circle') { const l = skTess(e); l.pop(); loops.push(l); continue; }
      const en = skEnds(e), it = { e: e, a: node(en[0]), b: node(en[1]), used: false };
      if (it.a === it.b) continue;
      nodes[it.a].e.push(it); nodes[it.b].e.push(it); items.push(it);
    }
    for (const s0 of items) {
      if (s0.used) continue;
      const pts = [];
      let it = s0, at = s0.a, okLoop = true;
      const chain = [];
      for (;;) {
        it.used = true; chain.push(it);
        const t = skTess(it.e), fwd = it.a === at;
        if (!fwd) t.reverse();
        t.pop();
        for (const p of t) pts.push(p);
        at = fwd ? it.b : it.a;
        if (nodes[at].e.length !== 2) { okLoop = false; break; }
        const nx = nodes[at].e[0] === it ? nodes[at].e[1] : nodes[at].e[0];
        if (nx === s0) break;
        if (nx.used) { okLoop = false; break; }
        it = nx;
      }
      if (okLoop && nodes[s0.a].e.length === 2 && pts.length >= 3) loops.push(pts); else for (const c of chain) open.push(c.e);
    }
    const area = function (l) { let a = 0; for (let i = 0, n = l.length; i < n; i++) { const p = l[i], q = l[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const inside = function (p, l) { let c = false; for (let i = 0, n = l.length, j = n - 1; i < n; j = i++) { const a = l[i], b = l[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const info = loops.map(function (l) { return { l: l, a: Math.abs(area(l)), depth: 0, parent: -1 }; }).filter(function (q) { return q.a > 1e-12; });
    info.forEach(function (q, i) {
      info.forEach(function (o, j) { if (i !== j && o.a > q.a && inside(q.l[0], o.l)) { q.depth++; if (q.parent < 0 || o.a < info[q.parent].a) q.parent = j; } });
    });
    const regions = [];
    info.forEach(function (q) { const ccw = area(q.l) > 0; if (q.depth % 2 === 0) { q.reg = { loops: [ccw ? q.l : q.l.slice().reverse()] }; regions.push(q.reg); } });
    info.forEach(function (q) { if (q.depth % 2 === 1 && q.parent >= 0 && info[q.parent].reg) info[q.parent].reg.loops.push(area(q.l) < 0 ? q.l : q.l.slice().reverse()); });
    return { regions: regions, open: open.length };
  }
  // ---------- sketch mode ----------
  const SK_FIELDS = {
    line: [['skL', 'L', ''], ['skA', L('Góc°', 'Angle°'), '']], rect: [['skW', 'W', ''], ['skH', 'H', '']], circle: [['skD', 'Ø', '']],
    poly: [['skN', L('Số cạnh', 'Sides'), '6'], ['skD', 'Ø', '']], fillet: [['skR', 'R', '2']], offset: [['skO', 'd', '2']]
  };
  const skVal = function (id) { const el = $(id); if (!el || el.value === '') return NaN; return +el.value; };
  function skSetTool(t) {
    const sk = S.sk;
    sk.tool = t; sk.pts = []; sk.sel = -1;
    document.querySelectorAll('#sktools [data-sk]').forEach(function (b) { b.classList.toggle('on', b.dataset.sk === t); });
    const box = $('skFields');
    box.innerHTML = '';
    for (const f of SK_FIELDS[t] || []) {
      const lb = document.createElement('label'), sp = document.createElement('span'), inp = document.createElement('input');
      sp.textContent = f[1]; inp.type = 'number'; inp.id = f[0]; inp.value = f[2]; inp.step = 'any';
      lb.appendChild(sp); lb.appendChild(inp); box.appendChild(lb);
    }
    const hint = {
      select: L('Bấm một nét để chọn; Delete để xóa', 'Click an entity to select it; Delete removes it'),
      line: L('Bấm các điểm nối tiếp; bấm lại điểm đầu để khép kín, Esc hoặc nhấp đúp để dừng. Gõ L / góc rồi bấm (hoặc Enter) để lấy số chính xác', 'Click point after point; click the first point again to close, Esc or double-click to stop. Type L / angle, then click (or Enter) for exact values'),
      rect: L('Bấm 2 góc đối diện; hoặc gõ W, H rồi bấm góc thứ hai', 'Click two opposite corners; or type W, H and click the second corner'),
      circle: L('Bấm tâm rồi bấm bán kính; gõ Ø thì chỉ cần bấm tâm', 'Click the centre, then the radius; with Ø typed one click places it'),
      arc: L('Bấm điểm đầu, điểm cuối, rồi một điểm trên cung', 'Click the start, the end, then a point on the arc'),
      poly: L('Bấm tâm rồi bấm một đỉnh', 'Click the centre, then one corner'),
      fillet: L('Bấm vào góc giữa 2 đường thẳng', 'Click the corner between two lines'),
      trim: L('Bấm vào đoạn cần cắt bỏ', 'Click the piece to remove'),
      offset: L('Bấm vào nét cần offset, ở phía muốn dời sang', 'Click the entity to offset, on the side it should move to')
    };
    flash(hint[t], true); dirty = true;
  }
  function skEnter(frame, ents) {
    if (blocked()) return;
    setTool('select');
    S.sk = { frame: frame, ents: ents ? JSON.parse(JSON.stringify(ents)) : [], tool: 'line', pts: [], cur: null, sel: -1, hist: [], prev: S.sketch, snap: null };
    $('tools').style.display = 'none'; $('sktools').style.display = 'flex'; $('skplane').style.display = 'none';
    mainCam.R = [frame.u[0], frame.u[1], frame.u[2], frame.v[0], frame.v[1], frame.v[2], frame.n[0], frame.n[1], frame.n[2]];
    if (!S.bodies.length) { mainCam.target = frame.o.slice(); mainCam.zoom = 60; }
    canvas.style.cursor = 'crosshair';
    skSetTool('line');
  }
  function skLeave(keep) {
    const sk = S.sk;
    if (!sk) return;
    S.sketch = keep ? { frame: sk.frame, ents: sk.ents } : sk.prev;
    S.sk = null;
    $('tools').style.display = 'flex'; $('sktools').style.display = 'none';
    canvas.style.cursor = toolCursor();
    if (keep) {
      const r = skRegions(sk.ents);
      flash(L('Sketch có ', 'The sketch has ') + r.regions.length + L(' biên dạng kín', ' closed profiles') + (r.open ? L(', ' + r.open + ' nét hở (không dùng để tạo khối)', ', ' + r.open + ' open entities (not used for solids)') : '') + L('. Bấm Extrude hoặc Revolve để tạo khối.', '. Press Extrude or Revolve to make a solid.'), true);
    } else flash('');
    dirty = true;
  }
  const skPush = function () { const sk = S.sk; sk.hist.push(JSON.stringify(sk.ents)); if (sk.hist.length > 100) sk.hist.shift(); };
  function skGridStep() { const raw = 26 * 2 * cam.zoom / H, k = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / k; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * k; }
  function skSnap(px, py) {
    const sk = S.sk, f = sk.frame, p = skFromScreen(f, px, py);
    if (!p) return null;
    let best = null, bd = 10;
    const tryPt = function (q, kind) { const s = skScr(f, q), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = { p: q.slice(), kind: kind }; } };
    tryPt([0, 0], 'origin');
    for (const e of sk.ents) {
      for (const q of skEnds(e)) tryPt(q, 'end');
      if (e.t === 'line') tryPt([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], 'mid'); else tryPt(e.c, 'centre');
    }
    for (const q of sk.pts) tryPt(q, 'end');
    if (best) return best;
    if ($('skGrid').checked) { const st = skGridStep() / 5; return { p: [Math.round(p[0] / st) * st, Math.round(p[1] / st) * st], kind: 'grid' }; }
    return { p: p, kind: '' };
  }
  // the line being drawn, with typed length / angle applied
  function skLineEnd(a, p) {
    const Lv = skVal('skL'), Av = skVal('skA');
    let dx = p[0] - a[0], dy = p[1] - a[1], len = Math.hypot(dx, dy);
    if (!isNaN(Av)) {
      const ux = Math.cos(Av * Math.PI / 180), uy = Math.sin(Av * Math.PI / 180), t = dx * ux + dy * uy;
      len = Math.abs(t); dx = (t < 0 ? -1 : 1) * ux; dy = (t < 0 ? -1 : 1) * uy;
    } else if (len > 0) { dx /= len; dy /= len; } else return a.slice();
    if (!isNaN(Lv) && Lv > 0) len = Lv;
    return [a[0] + dx * len, a[1] + dy * len];
  }
  function skRectEnd(a, p) {
    const Wv = skVal('skW'), Hv = skVal('skH');
    return [isNaN(Wv) || Wv <= 0 ? p[0] : a[0] + (p[0] < a[0] ? -Wv : Wv), isNaN(Hv) || Hv <= 0 ? p[1] : a[1] + (p[1] < a[1] ? -Hv : Hv)];
  }
  function skArc3(a, b, m) {                                 // arc from a to b through m, as a counter-clockwise arc
    const ax = b[0] - a[0], ay = b[1] - a[1], bx = m[0] - a[0], by = m[1] - a[1], dd = 2 * (ax * by - ay * bx);
    if (Math.abs(dd) < 1e-12) return null;
    const ux = (by * (ax * ax + ay * ay) - ay * (bx * bx + by * by)) / dd, uy = (ax * (bx * bx + by * by) - bx * (ax * ax + ay * ay)) / dd, c = [a[0] + ux, a[1] + uy], r = Math.hypot(ux, uy);
    let a0 = angOf(c, a), a1 = angOf(c, b);
    if (norm2pi(angOf(c, m) - a0) > norm2pi(a1 - a0)) { const t = a0; a0 = a1; a1 = t; }
    return { t: 'arc', c: c, r: r, a0: a0, a1: a0 + norm2pi(a1 - a0) };
  }
  // nearest entity to a screen position
  function skNearest(px, py, lim) {
    const sk = S.sk;
    let best = -1, bd = lim || 9;
    sk.ents.forEach(function (e, i) {
      const q = skTess(e).map(function (p) { return skScr(sk.frame, p); });
      for (let k = 0; k + 1 < q.length; k++) {
        const ax = q[k + 1][0] - q[k][0], ay = q[k + 1][1] - q[k][1], l2 = ax * ax + ay * ay, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - q[k][0]) * ax + (py - q[k][1]) * ay) / l2)) : 0;
        const d = Math.hypot(px - q[k][0] - t * ax, py - q[k][1] - t * ay);
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }
  // parameters (0..1 on a line, angle on a circle/arc) where e meets other entities
  function skCuts(e, others) {
    const out = [], onArc = function (o, p) { return o.t === 'circle' || norm2pi(angOf(o.c, p) - o.a0) <= o.a1 - o.a0 + 1e-9; };
    const par = function (p) { if (e.t === 'line') { const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1]; return ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / (dx * dx + dy * dy); } return e.t === 'circle' ? norm2pi(angOf(e.c, p)) : norm2pi(angOf(e.c, p) - e.a0); };
    const onE = function (p) { if (e.t === 'line') { const t = par(p); return t > -1e-9 && t < 1 + 1e-9; } return onArc(e, p); };
    const lineCirc = function (l, c) {
      const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], fx = l.a[0] - c.c[0], fy = l.a[1] - c.c[1], A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r, D = B * B - 4 * A * C, r = [];
      if (D < 0 || A === 0) return r;
      for (const sg of [-1, 1]) { const t = (-B + sg * Math.sqrt(D)) / (2 * A); if (t > -1e-9 && t < 1 + 1e-9) r.push([l.a[0] + t * dx, l.a[1] + t * dy]); }
      return r;
    };
    for (const o of others) {
      if (o === e) continue;
      let pts = [];
      if (e.t === 'line' && o.t === 'line') {
        const x1 = e.a[0], y1 = e.a[1], x2 = e.b[0], y2 = e.b[1], x3 = o.a[0], y3 = o.a[1], x4 = o.b[0], y4 = o.b[1], den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) > 1e-12) { const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den, u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den; if (u > -1e-9 && u < 1 + 1e-9) pts.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]); }
      } else if (e.t === 'line') pts = lineCirc(e, o).filter(function (p) { return onArc(o, p); });
      else if (o.t === 'line') pts = lineCirc(o, e);
      else {
        const d = d2(e.c, o.c);
        if (d > 1e-12 && d <= e.r + o.r && d >= Math.abs(e.r - o.r)) {
          const a = (e.r * e.r - o.r * o.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, e.r * e.r - a * a)), ux = (o.c[0] - e.c[0]) / d, uy = (o.c[1] - e.c[1]) / d, mx = e.c[0] + a * ux, my = e.c[1] + a * uy;
          pts = [[mx - h * uy, my + h * ux], [mx + h * uy, my - h * ux]].filter(function (p) { return onArc(o, p); });
        }
      }
      for (const p of pts) if (onE(p)) out.push(par(p));
    }
    return { cuts: out, par: par };
  }
  function skTrim(i, clickPt) {
    const sk = S.sk, e = sk.ents[i], c = skCuts(e, sk.ents), t = c.par(clickPt), add = [];
    if (e.t === 'circle') {
      const cs = c.cuts.slice().sort(function (x, y) { return x - y; });
      if (cs.length < 2) { sk.ents.splice(i, 1); return; }
      let lo = cs[cs.length - 1] - TAU, hi = cs[0];
      for (let k = 0; k + 1 < cs.length; k++) if (t >= cs[k] && t <= cs[k + 1]) { lo = cs[k]; hi = cs[k + 1]; }
      if (t > cs[cs.length - 1]) { lo = cs[cs.length - 1]; hi = cs[0] + TAU; }
      add.push({ t: 'arc', c: e.c, r: e.r, a0: hi, a1: hi + (TAU - (hi - lo)) });
    } else {
      const span = e.t === 'line' ? 1 : e.a1 - e.a0;
      let lo = 0, hi = span;
      for (const q of c.cuts) { if (q < t - 1e-9 && q > lo) lo = q; if (q > t + 1e-9 && q < hi) hi = q; }
      const piece = function (s0, s1) {
        if (s1 - s0 < 1e-9 * Math.max(1, span)) return;
        if (e.t === 'line') add.push({ t: 'line', a: [e.a[0] + s0 * (e.b[0] - e.a[0]), e.a[1] + s0 * (e.b[1] - e.a[1])], b: [e.a[0] + s1 * (e.b[0] - e.a[0]), e.a[1] + s1 * (e.b[1] - e.a[1])] });
        else add.push({ t: 'arc', c: e.c, r: e.r, a0: e.a0 + s0, a1: e.a0 + s1 });
      };
      piece(0, lo); piece(hi, span);
    }
    sk.ents.splice.apply(sk.ents, [i, 1].concat(add));
  }
  function skFillet(px, py) {
    const sk = S.sk, R = skVal('skR');
    if (!(R > 0)) { flash(L('Nhập bán kính R', 'Type the radius R')); return; }
    let best = null, bd = 14;
    const lines = sk.ents.filter(function (e) { return e.t === 'line'; });
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) for (const ka of ['a', 'b']) for (const kb of ['a', 'b']) {
      if (d2(lines[i][ka], lines[j][kb]) > 1e-9) continue;
      const s = skScr(sk.frame, lines[i][ka]), d = Math.hypot(s[0] - px, s[1] - py);
      if (d < bd) { bd = d; best = [lines[i], ka, lines[j], kb]; }
    }
    if (!best) { flash(L('Không thấy góc giữa 2 đường thẳng tại đây', 'No corner between two lines here')); return; }
    const l1 = best[0], l2 = best[2], c = l1[best[1]].slice(), p1 = l1[best[1] === 'a' ? 'b' : 'a'], p2 = l2[best[3] === 'a' ? 'b' : 'a'];
    const u1 = [(p1[0] - c[0]) / d2(p1, c), (p1[1] - c[1]) / d2(p1, c)], u2 = [(p2[0] - c[0]) / d2(p2, c), (p2[1] - c[1]) / d2(p2, c)];
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))), dist = R / Math.tan(th / 2);
    if (!(th > 1e-3 && th < Math.PI - 1e-3) || dist >= d2(p1, c) || dist >= d2(p2, c)) { flash(L('Bán kính quá lớn cho góc này', 'The radius is too large for this corner')); return; }
    const t1 = [c[0] + u1[0] * dist, c[1] + u1[1] * dist], t2 = [c[0] + u2[0] * dist, c[1] + u2[1] * dist], bl = Math.hypot(u1[0] + u2[0], u1[1] + u2[1]), k = R / Math.sin(th / 2) / bl;
    const cen = [c[0] + (u1[0] + u2[0]) * k, c[1] + (u1[1] + u2[1]) * k];
    let a0 = angOf(cen, t1), a1 = angOf(cen, t2);
    if (norm2pi(a1 - a0) > Math.PI) { const t = a0; a0 = a1; a1 = t; }
    skPush();
    l1[best[1]] = t1; l2[best[3]] = t2;
    sk.ents.push({ t: 'arc', c: cen, r: R, a0: a0, a1: a0 + norm2pi(a1 - a0) });
  }
  function skClick(px, py, ev) {
    const sk = S.sk, s = skSnap(px, py);
    if (!s) return;
    const p = s.p, t = sk.tool, add = function (list) { skPush(); for (const e of list) sk.ents.push(e); };
    if (t === 'select') { const i = skNearest(px, py); sk.sel = i === sk.sel ? -1 : i; }
    else if (t === 'line') {
      if (!sk.pts.length) sk.pts = [p];
      else {
        const a = sk.pts[sk.pts.length - 1], b = skLineEnd(a, p);
        if (d2(a, b) > 1e-9) {
          add([{ t: 'line', a: a.slice(), b: b }]);
          if (sk.pts.length > 1 && d2(b, sk.pts[0]) < 1e-9) sk.pts = []; else sk.pts.push(b);
          if ($('skL')) $('skL').value = ''; if ($('skA')) $('skA').value = '';
        }
      }
    } else if (t === 'rect') {
      if (!sk.pts.length) sk.pts = [p];
      else {
        const a = sk.pts[0], b = skRectEnd(a, p);
        if (Math.abs(b[0] - a[0]) > 1e-9 && Math.abs(b[1] - a[1]) > 1e-9) add([{ t: 'line', a: [a[0], a[1]], b: [b[0], a[1]] }, { t: 'line', a: [b[0], a[1]], b: [b[0], b[1]] }, { t: 'line', a: [b[0], b[1]], b: [a[0], b[1]] }, { t: 'line', a: [a[0], b[1]], b: [a[0], a[1]] }]);
        sk.pts = [];
      }
    } else if (t === 'circle') {
      const D = skVal('skD');
      if (D > 0) add([{ t: 'circle', c: p, r: D / 2 }]);
      else if (!sk.pts.length) sk.pts = [p];
      else { if (d2(sk.pts[0], p) > 1e-9) add([{ t: 'circle', c: sk.pts[0], r: d2(sk.pts[0], p) }]); sk.pts = []; }
    } else if (t === 'arc') {
      sk.pts.push(p);
      if (sk.pts.length === 3) { const a = skArc3(sk.pts[0], sk.pts[1], sk.pts[2]); if (a) add([a]); sk.pts = []; }
    } else if (t === 'poly') {
      if (!sk.pts.length) sk.pts = [p];
      else {
        const c = sk.pts[0], n = Math.max(3, Math.min(64, Math.round(skVal('skN') || 6))), D = skVal('skD'), r = D > 0 ? D / 2 : d2(c, p), a0 = angOf(c, p), list = [];
        if (r > 1e-9) for (let k = 0; k < n; k++) list.push({ t: 'line', a: onC(c, r, a0 + TAU * k / n), b: onC(c, r, a0 + TAU * (k + 1) / n) });
        for (let k = 0; k < list.length; k++) list[k].b = list[(k + 1) % list.length].a.slice();
        if (list.length) add(list);
        sk.pts = [];
      }
    } else if (t === 'fillet') skFillet(px, py);
    else if (t === 'trim') { const i = skNearest(px, py); if (i >= 0) { skPush(); skTrim(i, skFromScreen(sk.frame, px, py)); } }
    else if (t === 'offset') {
      const i = skNearest(px, py), d = skVal('skO'), q = skFromScreen(sk.frame, px, py);
      if (i >= 0 && d > 0) {
        const e = sk.ents[i];
        if (e.t === 'line') {
          const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], l = Math.hypot(dx, dy), sg = ((q[0] - e.a[0]) * -dy + (q[1] - e.a[1]) * dx) >= 0 ? 1 : -1, nx = -dy / l * d * sg, ny = dx / l * d * sg;
          add([{ t: 'line', a: [e.a[0] + nx, e.a[1] + ny], b: [e.b[0] + nx, e.b[1] + ny] }]);
        } else { const r = e.r + (d2(q, e.c) > e.r ? d : -d); if (r > 1e-9) add([Object.assign({}, e, { r: r, c: e.c.slice() })]); else flash(L('Khoảng offset lớn hơn bán kính', 'The offset is larger than the radius')); }
      } else if (!(d > 0)) flash(L('Nhập khoảng offset d', 'Type the offset distance d'));
    }
    dirty = true;
  }
  function skHover(px, py) { const s = skSnap(px, py); S.sk.cur = s ? s.p : null; S.sk.snap = s; S.sk.mouse = [px, py]; dirty = true; }
  function skPickPlane(px, py) {
    const h = pickNear(px, py);
    if (!h) { flash(L('Không trúng mesh nào', 'No mesh under the cursor')); return; }
    const e = entityAt(h, px, py, false);
    let n = e.kind === 'plane' ? V.norm(e.n) : h.normal;
    if (V.dot(n, viewer()) < 0) n = V.mul(n, -1);
    const u = V.norm(V.cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n));
    setTool('select');
    skEnter({ o: h.point.slice(), u: u, v: V.cross(n, u), n: n });
  }
  function drawSketch() {
    const sk = S.sk, sh = sk || S.sketch;
    if (S.fd && S.fd.lines) for (const l of S.fd.lines) poly2(l.map(project), '#ffcf5a', 1.6);
    if (!sh || (S.cmp && S.cmp.split)) return;
    const f = sh.frame, P = function (p) { return skScr(f, p); };
    if (sk) {                                                // grid and the two sketch axes
      const st = skGridStep(), c = skFromScreen(f, W / 2, H / 2) || [0, 0], n = Math.ceil(Math.max(W, H) / 26) + 4, x0 = Math.round(c[0] / st) * st, y0 = Math.round(c[1] / st) * st;
      if (n < 400) {
        ctx.lineWidth = 1;
        for (let k = -n; k <= n; k++) {
          const x = x0 + k * st, y = y0 + k * st, major = Math.abs(Math.round(x / st)) % 5 === 0, majorY = Math.abs(Math.round(y / st)) % 5 === 0;
          line2(P([x, y0 - n * st]), P([x, y0 + n * st]), major ? 'rgba(150,170,200,0.22)' : 'rgba(150,170,200,0.09)', 1);
          line2(P([x0 - n * st, y]), P([x0 + n * st, y]), majorY ? 'rgba(150,170,200,0.22)' : 'rgba(150,170,200,0.09)', 1);
        }
      }
      line2(P([-1e4, 0]), P([1e4, 0]), 'rgba(255,90,82,0.55)', 1.2); line2(P([0, -1e4]), P([0, 1e4]), 'rgba(82,208,106,0.55)', 1.2);
      dot2(P([0, 0]), '#ffffff', 3);
    }
    const reg = skRegions(sh.ents);
    ctx.fillStyle = sk ? 'rgba(95,224,255,0.16)' : 'rgba(95,224,255,0.10)'; ctx.beginPath();
    for (const r of reg.regions) for (const l of r.loops) { l.forEach(function (p, i) { const q = P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); }
    ctx.fill('evenodd');
    sh.ents.forEach(function (e, i) {
      const q = skTess(e).map(P), on = sk && i === sk.sel;
      if (e.axis) ctx.setLineDash([10, 4, 2, 4]);
      poly2(q, on ? '#ffa726' : e.axis ? '#c58bff' : sk ? '#ffffff' : 'rgba(210,225,245,0.75)', on ? 3.5 : sk ? 2 : 1.4);
      ctx.setLineDash([]);
      if (sk) for (const p of skEnds(e)) dot2(P(p), '#5fe0ff', 2.6);
    });
    if (!sk) return;
    const cur = sk.cur, t = sk.tool, PV = '#ffcf5a';
    for (const p of sk.pts) dot2(P(p), PV, 4);
    if (cur && sk.pts.length) {
      const a = sk.pts[sk.pts.length - 1];
      if (t === 'line') { const b = skLineEnd(a, cur), m = P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); line2(P(a), P(b), PV, 2); tag(m[0], m[1] - 14, f2(d2(a, b)) + ' mm  ' + f2(norm2pi(angOf(a, b)) * 180 / Math.PI, 1) + '°', '#ffffff', PV); }
      else if (t === 'rect') { const b = skRectEnd(sk.pts[0], cur), a0 = sk.pts[0], m = P(b); poly2([P(a0), P([b[0], a0[1]]), P(b), P([a0[0], b[1]]), P(a0)], PV, 2); tag(m[0], m[1] - 14, f2(Math.abs(b[0] - a0[0])) + ' × ' + f2(Math.abs(b[1] - a0[1])), '#ffffff', PV); }
      else if (t === 'circle') { const r = d2(a, cur), m = P(cur); poly2(skTess({ t: 'circle', c: a, r: r }).map(P), PV, 2); tag(m[0], m[1] - 14, 'Ø ' + f2(2 * r), '#ffffff', PV); }
      else if (t === 'poly') { const n = Math.max(3, Math.min(64, Math.round(skVal('skN') || 6))), D = skVal('skD'), r = D > 0 ? D / 2 : d2(a, cur), a0 = angOf(a, cur), q = []; for (let k = 0; k <= n; k++) q.push(P(onC(a, r, a0 + TAU * k / n))); poly2(q, PV, 2); }
      else if (t === 'arc') { if (sk.pts.length === 1) line2(P(a), P(cur), PV, 1.5); else { const ar = skArc3(sk.pts[0], sk.pts[1], cur); if (ar) { const m = P(cur); poly2(skTess(ar).map(P), PV, 2); tag(m[0], m[1] - 14, 'R ' + f2(ar.r), '#ffffff', PV); } } }
    }
    if (cur && sk.snap) {
      const q = P(cur), k = sk.snap.kind;
      if (k && k !== 'grid') { ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 2; ctx.strokeRect(q[0] - 6, q[1] - 6, 12, 12); }
      else { line2([q[0] - 6, q[1]], [q[0] + 6, q[1]], '#ffe14a', 1.5); line2([q[0], q[1] - 6], [q[0], q[1] + 6], '#ffe14a', 1.5); }
      label(12, H - 86, 'U ' + f2(cur[0]) + '   V ' + f2(cur[1]) + ' mm' + (reg.regions.length ? '   ·   ' + reg.regions.length + L(' biên dạng kín', ' closed profiles') : '') + (reg.open ? '   ·   ' + reg.open + L(' nét hở', ' open') : ''));
    }
  }
  function modelKey(e) {
    const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' && (e.target.type === 'number' || e.target.type === 'text');
    if (S.fd) {
      if (e.key === 'Enter') { e.preventDefault(); $('fOk').click(); return true; }
      if (e.key === 'Escape') { $('fNo').click(); return true; }
      return false;
    }
    const sk = S.sk;
    if (!sk) return false;
    if (e.key === 'Escape') { if (sk.pts.length) sk.pts = []; else skSetTool('select'); dirty = true; return true; }
    if (e.key === 'Enter') { if (sk.mouse && sk.pts.length) skClick(sk.mouse[0], sk.mouse[1], e); if (typing) e.target.blur(); return true; }
    if (typing) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (sk.sel >= 0) { skPush(); sk.ents.splice(sk.sel, 1); sk.sel = -1; dirty = true; } return true; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); $('skUndo').click(); return true; }
    if (e.code === 'Space') { e.preventDefault(); return true; }
    return false;
  }
  canvas.addEventListener('dblclick', function () { if (S.sk && S.sk.tool === 'line') { S.sk.pts = []; dirty = true; } });
  document.querySelectorAll('#sktools [data-sk]').forEach(function (b) { b.addEventListener('click', function () { if (S.sk) skSetTool(b.dataset.sk); }); });
  $('skUndo').addEventListener('click', function () { const sk = S.sk; if (sk && sk.hist.length) { sk.ents = JSON.parse(sk.hist.pop()); sk.pts = []; sk.sel = -1; dirty = true; } });
  $('skDel').addEventListener('click', function () { const sk = S.sk; if (sk && sk.sel >= 0) { skPush(); sk.ents.splice(sk.sel, 1); sk.sel = -1; dirty = true; } else flash(L('Dùng công cụ Chọn để bấm vào nét cần xóa trước', 'Use Select to click the entity to delete first')); });
  $('skAxis').addEventListener('click', function () {
    const sk = S.sk, e = sk && sk.ents[sk.sel];
    if (!e || e.t !== 'line') { flash(L('Dùng công cụ Chọn để bấm vào một đường thẳng trước', 'Use Select to click a straight line first')); return; }
    skPush(); e.axis = !e.axis; dirty = true;
  });
  $('skGrid').addEventListener('change', function () { dirty = true; });
  $('skOk').addEventListener('click', function () { skLeave(true); });
  $('skCancel').addEventListener('click', function () { skLeave(false); });
  $('bSketch').addEventListener('click', function () {
    if (blocked() || S.sk) return;
    closeFeature();
    const el = $('skplane'); el.style.display = el.style.display === 'block' ? 'none' : 'block'; $('skEdit').disabled = !S.sketch;
  });
  document.querySelectorAll('#skplane [data-pl]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.dataset.pl;
      $('skplane').style.display = 'none';
      if (k === 'x') return;
      if (k === 'edit') { if (S.sketch) skEnter(S.sketch.frame, S.sketch.ents); return; }
      if (k === 'pick') { setTool('select'); S.tool = 'skplane'; canvas.style.cursor = 'crosshair'; flash(L('Bấm vào một mặt phẳng của mesh để đặt mặt vẽ', 'Click a flat face of a mesh to put the sketch plane on it'), true); return; }
      skEnter(SK_PLANES[k]);
    });
  });

  // ---------- solids from the sketch ----------
  const FERR = { depth: ['Chiều sâu phải lớn hơn 0', 'The depth must be more than 0'], size: ['Kích thước cạnh / vỏ lớn hơn chiều sâu khối', 'The edge size / wall is larger than the depth'],
    offset: ['Draft, chamfer, fillet hoặc bề dày vỏ quá lớn so với biên dạng (biên dạng bị thắt lại)', 'Draft, chamfer, fillet or wall is too large for this profile (it pinches off)'],
    axis: ['Biên dạng phải nằm hoàn toàn về một phía của trục xoay', 'The profile must lie entirely on one side of the axis'] };
  function featParams() {
    const fd = S.fd, op = document.querySelector('#fOp .on').dataset.op;
    if (fd.type === 'extrude') return { op: op, depth: +$('fDepth').value, sym: $('fSym').checked, flip: $('fFlip').checked, draft: +$('fDraft').value || 0, edge: $('fEdge').value, edgeSize: +$('fEdgeS').value || 0, edgeBoth: $('fEdgeB').checked, shell: +$('fShell').value || 0 };
    return { op: op, axis: $('fAxis').value, angle: +$('fAng').value };
  }
  function featMesh(type, sketch, p) {
    const reg = skRegions(sketch.ents).regions;
    if (!reg.length) throw new Error('noprofile');
    if (type === 'extrude') {
      const d = p.depth, z0 = p.sym ? -d / 2 : p.flip ? -d : 0, z1 = p.sym ? d / 2 : p.flip ? 0 : d;
      // draft and end treatment are defined from the sketch plane outwards, so a flipped extrude is built mirrored
      const fr = p.flip && !p.sym ? { o: sketch.frame.o, u: sketch.frame.v, v: sketch.frame.u, n: V.mul(sketch.frame.n, -1) } : sketch.frame;
      const rg = p.flip && !p.sym ? reg.map(function (r) { return { loops: r.loops.map(function (l) { return l.map(function (q) { return [q[1], q[0]]; }).reverse(); }) }; }) : reg;
      // when the solid is added to / cut from a body it starts a hair behind the sketch plane, so that it never ends
      // exactly on the face the sketch was drawn on (two faces in one plane cannot be combined)
      const back = p.op !== 'new' && !p.sym ? Math.max(1e-3 * Math.abs(d), 1e-4) : 0;
      return core.extrudeSolid(rg, fr, { z0: (p.flip && !p.sym ? 0 : z0) - back, z1: p.flip && !p.sym ? d : z1, draft: p.draft * Math.PI / 180, edge: p.edge, edgeSize: p.edgeSize, edgeBoth: p.edgeBoth, shell: p.shell });
    }
    let ax = { p: [0, 0], d: p.axis === 'v' ? [0, 1] : [1, 0] };
    if (p.axis !== 'u' && p.axis !== 'v') { const e = sketch.ents.filter(function (q) { return q.axis; })[+p.axis]; if (!e) throw new Error('axis'); ax = { p: e.a, d: [e.b[0] - e.a[0], e.b[1] - e.a[1]] }; }
    return core.revolveSolid(reg, sketch.frame, ax, Math.min(360, Math.max(1, p.angle)) * Math.PI / 180);
  }
  function featPreview() {
    const fd = S.fd;
    if (!fd) return;
    fd.lines = null; fd.err = '';
    try {
      const m = featMesh(fd.type, fd.sketch, featParams()), f = core.features(m);
      fd.lines = f.chains.map(function (c) { return c.pts; }); fd.mesh = m;
    } catch (e) { const k = FERR[e.message]; fd.err = k ? L(k[0], k[1]) : e.message === 'noprofile' ? L('Sketch chưa có biên dạng kín', 'The sketch has no closed profile') : String(e.message || e); fd.mesh = null; }
    const op = document.querySelector('#fOp .on').dataset.op, n = selBodies().filter(function (b) { return b !== fd.edit; }).length;
    $('fNote').innerHTML = fd.err ? '<span style="color:var(--bad)">' + fd.err + '</span>' :
      op === 'new' ? (fd.edit ? L('Sửa khối "', 'Editing "') + fd.edit.name + '"' : L('Tạo một khối solid mới.', 'Makes a new solid.')) :
      n ? L('Áp dụng lên ', 'Applies to the ') + n + L(' body đang tick; kết quả là mesh.', ' ticked bodies; the result is a mesh.') : '<span style="color:var(--bad)">' + L('Hãy tick body cần Add / Remove / Intersect.', 'Tick the bodies to Add to / Remove from / Intersect with.') + '</span>';
    dirty = true;
  }
  function closeFeature() { S.fd = null; $('fdlg').style.display = 'none'; dirty = true; }
  function openFeature(type, edit) {
    if (blocked() || S.sk) { if (S.sk) flash(L('Hãy bấm "Xong sketch" trước', 'Finish the sketch first')); return; }
    const sketch = edit ? { frame: edit.solid.frame, ents: edit.solid.ents } : S.sketch;
    if (!sketch || !skRegions(sketch.ents).regions.length) { flash(L('Chưa có sketch với biên dạng kín. Bấm "Sketch" để vẽ trước.', 'There is no sketch with a closed profile yet. Press "Sketch" to draw one.')); return; }
    $('skplane').style.display = 'none';
    S.fd = { type: type, edit: edit || null, sketch: sketch, lines: null };
    $('fTitle').textContent = (type === 'extrude' ? 'Extrude' : 'Revolve') + (edit ? L(' (sửa)', ' (edit)') : '');
    $('fExt').style.display = type === 'extrude' ? 'block' : 'none'; $('fRev').style.display = type === 'revolve' ? 'block' : 'none';
    const ax = $('fAxis'); ax.innerHTML = '';
    [['u', L('Trục ngang của sketch (U)', 'Sketch horizontal axis (U)')], ['v', L('Trục dọc của sketch (V)', 'Sketch vertical axis (V)')]].concat(sketch.ents.filter(function (e) { return e.axis; }).map(function (e, i) { return [String(i), L('Đường trục ', 'Axis line ') + (i + 1) + L(' trong sketch', ' of the sketch')]; }))
      .forEach(function (o) { const el = document.createElement('option'); el.value = o[0]; el.textContent = o[1]; ax.appendChild(el); });
    if (ax.options.length > 2) ax.value = '0';
    const p = edit ? edit.solid.params : null;
    document.querySelectorAll('#fOp button').forEach(function (b) { b.classList.toggle('on', b.dataset.op === 'new'); b.disabled = !!edit && b.dataset.op !== 'new'; });
    if (!p) { $('fSym').checked = false; $('fFlip').checked = false; $('fDraft').value = 0; $('fEdge').value = 'none'; $('fEdgeB').checked = false; $('fShell').value = 0; $('fAng').value = 360; }   // a new feature starts plain
    if (p && type === 'extrude') { $('fDepth').value = p.depth; $('fSym').checked = p.sym; $('fFlip').checked = p.flip; $('fDraft').value = p.draft; $('fEdge').value = p.edge; $('fEdgeS').value = p.edgeSize; $('fEdgeB').checked = p.edgeBoth; $('fShell').value = p.shell; }
    if (p && type === 'revolve') { ax.value = p.axis; $('fAng').value = p.angle; }
    $('fDepthR').value = $('fDepth').value; $('fAngR').value = $('fAng').value;
    $('fdlg').style.display = 'block';
    featPreview();
  }
  document.querySelectorAll('#fOp button').forEach(function (b) { b.addEventListener('click', function () { document.querySelectorAll('#fOp button').forEach(function (o) { o.classList.toggle('on', o === b); }); featPreview(); }); });
  ['fDepth', 'fSym', 'fFlip', 'fDraft', 'fEdge', 'fEdgeS', 'fEdgeB', 'fShell', 'fAxis', 'fAng'].forEach(function (id) { $(id).addEventListener('input', function () { if (id === 'fDepth') $('fDepthR').value = this.value; if (id === 'fAng') $('fAngR').value = this.value; featPreview(); }); $(id).addEventListener('change', featPreview); });
  $('fDepthR').addEventListener('input', function () { $('fDepth').value = this.value; featPreview(); });
  $('fAngR').addEventListener('input', function () { $('fAng').value = this.value; featPreview(); });
  $('fNo').addEventListener('click', closeFeature);
  $('bExtrude').addEventListener('click', function () { openFeature('extrude'); });
  $('bRevolve').addEventListener('click', function () { openFeature('revolve'); });
  const closedBody = function (b) { return holesOf(b.geo).edges === 0; };
  // Booleans run in the Manifold library (embedded in this file). If it cannot start, the built-in routine takes over.
  let mfLib = null, mfTried = false;
  async function manifoldLib() {
    if (mfTried) return mfLib;
    mfTried = true;
    try {
      const bin = Uint8Array.from(atob(MANIFOLD_WASM_B64), function (c) { return c.charCodeAt(0); });
      const w = await ManifoldModule({ wasmBinary: bin });
      w.setup(); mfLib = w;
    } catch (e) { console.warn('Manifold not available, using the built-in boolean', e); mfLib = null; }
    return mfLib;
  }
  async function boolRun(a, b, op) {
    const w = await manifoldLib();
    if (!w) return run('bool', { a: a, b: b, op: op }, function (p) { setProgress(p); });
    await new Promise(function (r) { setTimeout(r, 20); });   // let the "busy" notice paint first
    const made = [];
    const solid = function (m) {
      const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(m.positions), triVerts: new Uint32Array(m.indices) });
      mesh.merge();
      const s = new w.Manifold(mesh); made.push(s);
      return s;
    };
    try {
      const A = solid(a), B = solid(b), R = op === 'union' ? A.add(B) : op === 'subtract' ? A.subtract(B) : A.intersect(B);
      made.push(R);
      const out = R.getMesh(), n = out.numProp, V0 = out.vertProperties, nv = V0.length / n, P = new Float32Array(3 * nv);
      for (let i = 0; i < nv; i++) { P[3 * i] = V0[n * i]; P[3 * i + 1] = V0[n * i + 1]; P[3 * i + 2] = V0[n * i + 2]; }
      return { positions: P, indices: new Uint32Array(out.triVerts), engine: 'manifold' };
    } catch (e) {
      if (String(e && (e.message || e.code || e)).indexOf('anifold') >= 0) throw new Error(L('Mesh chưa phải khối kín hợp lệ (có cạnh hở hoặc cạnh chung nhiều hơn 2 mặt). Hãy vá kín trước rồi thử lại.', 'A mesh is not a valid closed solid (open edges, or edges shared by more than 2 faces). Repair it first and try again.'));
      throw e;
    } finally { for (const s of made) { try { s.delete(); } catch (e2) { /* already freed */ } } }
  }
  $('fOk').addEventListener('click', async function () {
    const fd = S.fd;
    if (!fd || busy) return;
    featPreview();
    if (!fd.mesh) { flash(fd.err); return; }
    const p = featParams(), recipe = { type: fd.type, frame: fd.sketch.frame, ents: JSON.parse(JSON.stringify(fd.sketch.ents)), params: p }, m = fd.mesh;
    if (p.op === 'new') {
      pushUndo();
      if (fd.edit) { setGeo(fd.edit, makeGeo(m.positions, m.indices), true); fd.edit.solid = recipe; }
      else { const b = addBody(fd.type === 'extrude' ? 'Extrude' : 'Revolve', makeGeo(m.positions, m.indices), { solid: recipe }); S.sel = new Set([b]); }
      closeFeature(); geomChanged(); sceneChanged(false);
      return;
    }
    const targets = selBodies();
    if (!targets.length) { flash(L('Hãy tick body cần Add / Remove / Intersect', 'Tick the bodies to Add to / Remove from / Intersect with')); return; }
    if (!targets.every(closedBody)) { flash(L('Body đang tick còn viền hở: hãy vá kín trước (mục Vá lưới hở)', 'A ticked body has open borders: close it first (Repair open meshes)')); return; }
    closeFeature(); showError(null); setBusy(true, 'Boolean...');
    try {
      pushUndo();
      for (const t of targets) {
        const r = await boolRun(worldMesh(t), { positions: m.positions, indices: m.indices }, p.op === 'add' ? 'union' : p.op === 'remove' ? 'subtract' : 'intersect');
        if (!r.indices.length) { removeBody(t); continue; }
        setGeo(t, makeGeo(r.positions, r.indices)); t.matrix = M.ident(); t.matrix0 = M.ident(); t.orig = t.geo;
      }
    } catch (e) { showError(e); }
    setBusy(false); geomChanged();
  });
  function solidToMesh() {
    const list = selBodies().filter(function (b) { return b.solid; });
    if (!list.length) { flash(L('Không có khối solid nào đang được tick', 'No solid is ticked')); return; }
    pushUndo();
    for (const b of list) b.solid = null;
    flash(L('Đã chuyển ', 'Converted ') + list.length + L(' khối solid thành mesh', ' solids to meshes'));
    refresh();
  }
  function editSolid(b) { if (b.solid) openFeature(b.solid.type, b); }
  $('bToMesh').addEventListener('click', solidToMesh);

  // ---------- boolean between bodies ----------
  function boolOp() { return document.querySelector('#boolOp .on').dataset.op; }
  function updateBoolUI() {
    const list = Array.from(S.sel).filter(function (b) { return S.bodies.indexOf(b) >= 0; }), op = boolOp(), nm = function (b) { return b.name; };
    let h;
    if (list.length < 2) h = L('Hãy tick ít nhất 2 body.', 'Tick at least 2 bodies.');
    else if (op === 'subtract') h = '<b>Target:</b> ' + nm(list[0]) + '<br><b>Tools:</b> ' + list.slice(1).map(nm).join(', ');
    else h = '<b>Tools:</b> ' + list.map(nm).join(', ');
    if (list.some(function (b) { return !closedBody(b); })) h += '<br><span class="bad">' + L('Có body còn viền hở: vá kín trước.', 'Some bodies have open borders: close them first.') + '</span>';
    $('boolInfo').innerHTML = h;
    $('bBool').classList.toggle('primary', list.length >= 2);
  }
  document.querySelectorAll('#boolOp button').forEach(function (b) { b.addEventListener('click', function () { document.querySelectorAll('#boolOp button').forEach(function (o) { o.classList.toggle('on', o === b); }); updateBoolUI(); }); });
  $('bBool').addEventListener('click', async function () {
    if (blocked()) return;
    const list = Array.from(S.sel).filter(function (b) { return S.bodies.indexOf(b) >= 0; }), op = boolOp(), keep = $('boolKeep').checked;
    if (list.length < 2) { flash(L('Hãy tick ít nhất 2 body', 'Tick at least 2 bodies')); return; }
    if (!list.every(closedBody)) { flash(L('Boolean cần lưới kín: hãy vá các viền hở (màu đỏ) trước', 'Boolean needs closed meshes: fill the open (red) borders first')); return; }
    showError(null); setBusy(true, 'Boolean...');
    const t0 = performance.now();
    try {
      pushUndo();
      const target = list[0];
      let cur = worldMesh(target), before = 0;
      for (const b of list) before += b.geo.indices.length / 3;
      for (let i = 1; i < list.length; i++) cur = await boolRun(cur, worldMesh(list[i]), op);
      const tools = list.slice(1);
      if (keep) {                                            // the result becomes a new body, everything ticked stays
        if (cur.indices.length) addBody(target.name + '_' + op, makeGeo(cur.positions, cur.indices), { material: target.material, density: target.density });
      } else {
        for (const b of tools) removeBody(b);
        if (cur.indices.length) { setGeo(target, makeGeo(cur.positions, cur.indices)); target.matrix = M.ident(); target.matrix0 = M.ident(); target.orig = target.geo; } else removeBody(target);
      }
      $('boolRes').innerHTML = cur.indices.length ? op.charAt(0).toUpperCase() + op.slice(1) + ': ' + fmtN(before) + ' → <b>' + fmtN(cur.indices.length / 3) + '</b> ' + L('tam giác · ', 'triangles · ') + f2((performance.now() - t0) / 1000, 1) + L(' giây', ' s')
        : '<span class="bad">' + L('Kết quả rỗng (các body không giao nhau theo phép này).', 'The result is empty (the bodies do not overlap for this operation).') + '</span>';
    } catch (e) { showError(e); }
    setBusy(false); geomChanged();
  });
