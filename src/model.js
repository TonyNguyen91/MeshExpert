  // ================= sketches (parametric, with constraints) =================
  // A sketch lives on a plane {o, u, v, n}. Its model (see core_sketch.js) holds points shared by lines, circles and
  // arcs, plus constraints and dimensions. Finished sketches stay in the "Sketches" list on the left.
  S.sketches = []; S.skSeq = 1; S.skSel = null;
  S.sk = null;                                               // the sketch being edited
  S.fd = null;                                               // open feature dialog
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
  // ---------- flat geometry (coordinates) ----------
  function skTess(e) {
    if (e.t === 'line') return [e.a, e.b];
    if (e.t === 'point') return [e.p];
    const full = e.t === 'circle', a0 = full ? 0 : e.a0, span = full ? TAU : e.a1 - e.a0, n = Math.max(2, Math.ceil(span / (Math.PI / 36))), out = [];
    for (let k = 0; k <= n; k++) out.push(onC(e.c, e.r, a0 + span * k / n));
    return out;
  }
  const skEnds = function (e) { return e.t === 'line' ? [e.a, e.b] : e.t === 'arc' ? [onC(e.c, e.r, e.a0), onC(e.c, e.r, e.a1)] : []; };
  // closed outlines of flat entities, grouped into regions (outline + its holes)
  function skRegions(ents) {
    const use = ents.filter(function (e) { return !e.axis && e.t !== 'point'; }), loops = [];
    let size = 1;
    for (const e of use) for (const p of skTess(e)) size = Math.max(size, Math.abs(p[0]), Math.abs(p[1]));
    const tol = 1e-6 * size, nodes = [], open = [], items = [];
    const node = function (p) { for (let i = 0; i < nodes.length; i++) if (d2(nodes[i].p, p) <= tol) return i; nodes.push({ p: p, e: [] }); return nodes.length - 1; };
    for (const e of use) {
      if (e.t === 'circle') { const l = skTess(e); l.pop(); l.segs = [{ type: 'arc', center: e.c.slice(), radius: e.r, start: 0, sweep: TAU }]; loops.push(l); continue; }
      const en = skEnds(e), it = { e: e, a: node(en[0]), b: node(en[1]), used: false };
      if (it.a === it.b) continue;
      nodes[it.a].e.push(it); nodes[it.b].e.push(it); items.push(it);
    }
    for (const s0 of items) {
      if (s0.used) continue;
      const pts = [], chain = [], segs = [];
      let it = s0, at = s0.a, okLoop = true;
      for (;;) {
        it.used = true; chain.push(it);
        const t = skTess(it.e), fwd = it.a === at;
        segs.push(skSeg(it.e, fwd));
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
      if (okLoop && nodes[s0.a].e.length === 2 && pts.length >= 3) { pts.segs = segs; loops.push(pts); } else for (const c of chain) open.push(c.e);
    }
    const area = function (l) { let a = 0; for (let i = 0, n = l.length; i < n; i++) { const p = l[i], q = l[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const info = loops.map(function (l) { return { l: l, a: Math.abs(area(l)), depth: 0, parent: -1 }; }).filter(function (q) { return q.a > 1e-12; });
    info.forEach(function (q, i) {
      info.forEach(function (o, j) { if (i !== j && o.a > q.a && skInside(q.l[0], o.l)) { q.depth++; if (q.parent < 0 || o.a < info[q.parent].a) q.parent = j; } });
    });
    const regions = [];
    info.forEach(function (q) { const ccw = area(q.l) > 0; if (q.depth % 2 === 0) { q.reg = { loops: [ccw ? q.l : q.l.slice().reverse()], segs: [skSegsDir(q.l.segs, ccw)] }; regions.push(q.reg); } });
    info.forEach(function (q) { if (q.depth % 2 === 1 && q.parent >= 0 && info[q.parent].reg) { const cw = area(q.l) < 0; info[q.parent].reg.loops.push(cw ? q.l : q.l.slice().reverse()); info[q.parent].reg.segs.push(skSegsDir(q.l.segs, cw)); } });
    return { regions: regions, open: open.length };
  }
  // exact outline pieces (line / arc) of a loop, for the B-rep engine
  function skSeg(e, fwd) {
    if (e.t === 'line') return fwd ? { type: 'line', a: e.a.slice(), b: e.b.slice() } : { type: 'line', a: e.b.slice(), b: e.a.slice() };
    const sw = e.a1 - e.a0;
    return fwd ? { type: 'arc', center: e.c.slice(), radius: e.r, start: e.a0, sweep: sw } : { type: 'arc', center: e.c.slice(), radius: e.r, start: e.a1, sweep: -sw };
  }
  function skSegsDir(segs, keep) {
    if (!segs) return null;
    if (keep) return segs;
    return segs.slice().reverse().map(function (g) { return g.type === 'line' ? { type: 'line', a: g.b, b: g.a } : { type: 'arc', center: g.center, radius: g.radius, start: g.start + g.sweep, sweep: -g.sweep }; });
  }
  function skInside(p, l) { let c = false; for (let i = 0, n = l.length, j = n - 1; i < n; j = i++) { const a = l[i], b = l[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  // flat geometry of one model entity (construction included)
  function skGeo(m, e) {
    const P = function (i) { return m.pts[i]; };
    if (e.t === 'line') return { t: 'line', a: P(e.a), b: P(e.b) };
    if (e.t === 'point') return { t: 'point', p: P(e.p) };
    if (e.t === 'circle') return { t: 'circle', c: P(e.c), r: e.r };
    const c = P(e.c), a0 = angOf(c, P(e.a));
    return { t: 'arc', c: c, r: d2(c, P(e.a)), a0: a0, a1: a0 + norm2pi(angOf(c, P(e.b)) - a0) };
  }
  const entPts = function (e) { return e.t === 'line' ? [e.a, e.b] : e.t === 'point' ? [e.p] : e.t === 'arc' ? [e.c, e.a, e.b] : [e.c]; };
  function nearestOn(g, p, clamp) {                          // nearest point of flat geometry g to p (null when off an arc / segment)
    if (g.t === 'line') {
      const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((p[0] - g.a[0]) * dx + (p[1] - g.a[1]) * dy) / l2 : 0;
      if (clamp) t = Math.max(0, Math.min(1, t)); else if (t < 0 || t > 1) return null;
      return [g.a[0] + t * dx, g.a[1] + t * dy];
    }
    if (g.t === 'point') return g.p;
    const a = angOf(g.c, p);
    if (g.t === 'arc' && norm2pi(a - g.a0) > g.a1 - g.a0 + 1e-9) return null;
    return onC(g.c, g.r, a);
  }
  function sketchById(id) { for (const s of S.sketches) if (s.id === id) return s; return null; }
  const skProfiles = function (s) { return skRegions(core.skFlat(s.m)); };

  // ---------- sketch list (left panel) ----------
  function updateSketchList() {
    const box = $('sketchList');
    if (!box) return;
    box.innerHTML = '';
    if (!S.sketches.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L('Chưa có sketch. Bấm "✏ Sketch" để vẽ.', 'No sketch yet. Press "✏ Sketch" to draw one.'); box.appendChild(e); return; }
    for (const s of S.sketches) {
      const row = document.createElement('div');
      row.className = 'srow' + (S.skSel === s.id ? ' sel' : '') + (S.fd && S.fd.sketchId === s.id ? ' use' : '');
      const cv = document.createElement('input'); cv.type = 'checkbox'; cv.checked = s.visible; cv.title = L('Ẩn / hiện (Y)', 'Show / hide (Y)');
      cv.addEventListener('click', function (e) { e.stopPropagation(); });
      cv.addEventListener('change', function () { pushUndo(); s.visible = cv.checked; dirty = true; });
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = '✏ ' + s.name;
      const r = skProfiles(s), info = document.createElement('span'); info.className = 'num';
      info.textContent = r.regions.length + L(' biên dạng', ' profiles');
      row.appendChild(cv); row.appendChild(nm); row.appendChild(info);
      row.addEventListener('click', function () {
        if (S.fd && featUseSketch(s.id)) return;
        S.skSel = s.id; updateSketchList(); dirty = true;
      });
      row.addEventListener('dblclick', function () { editSketch(s); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); S.skSel = s.id; updateSketchList(); sketchMenu(s, e.clientX, e.clientY); });
      box.appendChild(row);
    }
  }
  function sketchMenu(s, x, y) {
    showMenu([[L('Sửa sketch', 'Edit sketch'), function () { editSketch(s); }],
      [L('Đổi tên', 'Rename'), function () { const n = prompt(L('Tên sketch:', 'Sketch name:'), s.name); if (n && n.trim()) { pushUndo(); s.name = n.trim(); updateSketchList(); } }],
      [s.visible ? L('Ẩn (Y)', 'Hide (Y)') : L('Hiện (Y)', 'Show (Y)'), function () { pushUndo(); s.visible = !s.visible; updateSketchList(); dirty = true; }], null,
      ['Extrude…', function () { S.skSel = s.id; openFeature('extrude'); }], ['Revolve…', function () { S.skSel = s.id; openFeature('revolve'); }], null,
      [L('Xóa sketch', 'Delete sketch'), function () { deleteSketch(s); }]], x, y);
  }
  function deleteSketch(s) { pushUndo(); S.sketches = S.sketches.filter(function (o) { return o !== s; }); if (S.skSel === s.id) S.skSel = null; updateSketchList(); dirty = true; }
  function editSketch(s) { if (blocked() || S.sk) return; closeFeature(); closeDlg(); skEnter(s.frame, s.m, s.id, s.name); }

  // ---------- sketch mode ----------
  const SK_FIELDS = {
    line: [['skL', 'L', ''], ['skA', L('Góc°', 'Angle°'), '']], rect: [['skW', 'W', ''], ['skH', 'H', '']], crect: [['skW', 'W', ''], ['skH', 'H', '']], circle: [['skD', 'Ø', '']],
    poly: [['skN', L('Số cạnh', 'Sides'), '6'], ['skD', 'Ø', '']], slot: [['skW', L('Rộng', 'Width'), '']], fillet: [['skR', 'R', '2']], offset: [['skO', 'd', '2']]
  };
  const SK_HINT = {
    select: ['Bấm chọn điểm / nét / ràng buộc / kích thước (bấm nhiều cái liên tiếp); kéo để di chuyển phần còn tự do; nhấp đúp kích thước để sửa số; Delete để xóa', 'Click points / entities / constraints / dimensions (one after another); drag to move what is still free; double-click a dimension to change it; Delete removes'],
    line: ['Bấm các điểm nối tiếp; tự thêm ràng buộc ngang / dọc / trùng điểm. Bấm lại điểm đầu để khép kín, Esc hoặc nhấp đúp để dừng. Gõ L / góc rồi bấm (hoặc Enter) để lấy số chính xác', 'Click point after point; horizontal / vertical / coincident are added automatically. Click the first point to close, Esc or double-click to stop. Type L / angle, then click (or Enter)'],
    rect: ['Bấm 2 góc đối diện; hoặc gõ W, H rồi bấm góc thứ hai', 'Click two opposite corners; or type W, H and click the second corner'],
    crect: ['Bấm tâm rồi bấm một góc', 'Click the centre, then a corner'],
    circle: ['Bấm tâm rồi bấm bán kính; gõ Ø thì chỉ cần bấm tâm', 'Click the centre, then the radius; with Ø typed one click places it'],
    arc: ['Bấm điểm đầu, điểm cuối, rồi một điểm trên cung', 'Click the start, the end, then a point on the arc'],
    tarc: ['Bấm vào đầu mút của một đường / cung, rồi bấm điểm cuối: cung tiếp tuyến', 'Click the end of a line / arc, then the end point: a tangent arc'],
    poly: ['Bấm tâm rồi bấm một đỉnh', 'Click the centre, then one corner'],
    slot: ['Bấm tâm đầu, tâm cuối, rồi bấm (hoặc gõ) bề rộng', 'Click the first centre, the second centre, then click (or type) the width'],
    point: ['Bấm để đặt điểm', 'Click to place a point'],
    fillet: ['Bấm vào góc giữa 2 đường thẳng', 'Click the corner between two lines'],
    trim: ['Bấm vào đoạn cần cắt bỏ', 'Click the piece to remove'],
    offset: ['Bấm vào nét cần offset, ở phía muốn dời sang', 'Click the entity to offset, on the side it should move to'],
    mirror: ['Bấm đường thẳng làm trục đối xứng', 'Click the line to mirror about'],
    dim: ['Bấm 1 hoặc 2 đối tượng (điểm, đường, cung, tròn), rồi bấm chỗ trống để đặt kích thước và gõ số', 'Click 1 or 2 items (point, line, arc, circle), then click empty space to place the dimension and type the value']
  };
  const SK_CONS = {
    coinc: ['Trùng điểm / điểm nằm trên nét: chọn 2 điểm, hoặc 1 điểm + 1 nét', 'Coincident: pick 2 points, or a point and an entity'],
    conc: ['Đồng tâm: chọn 2 cung / đường tròn', 'Concentric: pick 2 arcs / circles'],
    par: ['Song song: chọn 2 đường thẳng', 'Parallel: pick 2 lines'],
    tan: ['Tiếp tuyến: chọn đường thẳng + cung / tròn, hoặc 2 cung / tròn', 'Tangent: pick a line + an arc / circle, or 2 arcs / circles'],
    h: ['Nằm ngang: chọn đường thẳng, hoặc 2 điểm', 'Horizontal: pick lines, or 2 points'],
    v: ['Thẳng đứng: chọn đường thẳng, hoặc 2 điểm', 'Vertical: pick lines, or 2 points'],
    perp: ['Vuông góc: chọn 2 đường thẳng', 'Perpendicular: pick 2 lines'],
    eq: ['Bằng nhau: chọn 2 đường thẳng hoặc 2 cung / tròn', 'Equal: pick 2 lines or 2 arcs / circles'],
    mid: ['Trung điểm: chọn 1 điểm + 1 đường thẳng', 'Midpoint: pick a point and a line'],
    sym: ['Đối xứng: chọn 2 điểm + đường thẳng làm trục', 'Symmetric: pick 2 points and the line to mirror about'],
    fix: ['Cố định: chọn điểm hoặc nét', 'Fix: pick points or entities']
  };
  const SK_GLYPH = { h: 'H', v: 'V', par: '∥', perp: '⊥', eq: '=', tan: 'T', mid: 'M', fix: '⚓', sym: '⇋', on: '◦', fixr: '⚓' };
  const skVal = function (id) { const el = $(id); if (!el || el.value === '') return NaN; return +el.value; };
  function skSetTool(t) {
    const sk = S.sk;
    if (sk.tool !== t) skFlush();
    sk.tool = t; sk.pts = []; sk.cmode = null; sk.pend = []; sk.dimPrev = null;
    if (t !== 'select' && t !== 'mirror') sk.sel.clear();
    document.querySelectorAll('#sktools [data-sk]').forEach(function (b) { b.classList.toggle('on', b.dataset.sk === t); });
    document.querySelectorAll('#sktools [data-cn]').forEach(function (b) { b.classList.remove('on'); });
    const box = $('skFields');
    box.innerHTML = '';
    for (const f of SK_FIELDS[t] || []) {
      const lb = document.createElement('label'), sp = document.createElement('span'), inp = document.createElement('input');
      sp.textContent = f[1]; inp.type = 'number'; inp.id = f[0]; inp.value = f[2]; inp.step = 'any';
      lb.appendChild(sp); lb.appendChild(inp); box.appendChild(lb);
    }
    const h = SK_HINT[t];
    flash(h ? L(h[0], h[1]) : '', true); dirty = true;
  }
  function skEnter(frame, model, id, name) {
    if (blocked()) return;
    setTool('select');
    const m = model ? JSON.parse(JSON.stringify(model)) : core.skModel();
    S.sk = { id: id || null, name: name || '', frame: frame, m: m, tool: 'line', pts: [], cur: null, sel: new Set(), hov: null, hist: [], snap: null, an: null, pend: [], cmode: null, hits: [], dimPrev: null };
    skAnalyseNow();
    $('tools').style.display = 'none'; $('sktools').style.display = 'flex'; $('skplane').style.display = 'none';
    mainCam.R = [frame.u[0], frame.u[1], frame.u[2], frame.v[0], frame.v[1], frame.v[2], frame.n[0], frame.n[1], frame.n[2]];
    if (!S.bodies.length && !m.ents.length) { mainCam.target = frame.o.slice(); mainCam.zoom = 60; }
    canvas.style.cursor = 'crosshair';
    skSetTool(m.ents.length ? 'select' : 'line');
  }
  function skLeave(keep) {
    const sk = S.sk;
    if (!sk) return;
    skFlush(); skDimEditEnd(false);
    S.sk = null;
    $('tools').style.display = 'flex'; $('sktools').style.display = 'none';
    canvas.style.cursor = toolCursor();
    if (keep) {
      pushUndo();
      let s = sk.id ? sketchById(sk.id) : null;
      if (s) s.m = sk.m;
      else { s = { id: S.skSeq++, name: L('Sketch ', 'Sketch ') + S.skSeq, frame: sk.frame, m: sk.m, visible: true }; s.name = 'Sketch ' + (s.id); S.sketches.push(s); }
      S.skSel = s.id;
      const r = skProfiles(s);
      flash(L('Sketch có ', 'The sketch has ') + r.regions.length + L(' biên dạng kín', ' closed profiles') + (r.open ? L(', ' + r.open + ' nét hở', ', ' + r.open + ' open entities') : '') + L('. Chọn nó rồi bấm Extrude hoặc Revolve.', '. Select it and press Extrude or Revolve.'), true);
      if (sk.id) regenFromSketch(s);
      updateSketchList();
    } else flash('');
    dirty = true;
  }
  const skPush = function () { const sk = S.sk; sk.hist.push(JSON.stringify(sk.m)); if (sk.hist.length > 100) sk.hist.shift(); };
  function skAnalyseNow() { const sk = S.sk; sk.an = core.skAnalyse(sk.m); }
  // drop dangling points left by an unfinished tool (renumbers points)
  function skFlush() { const sk = S.sk; if (!sk) return; sk.pts = []; core.skCompact(sk.m); skAnalyseNow(); }
  function skGridStep() { const raw = 26 * 2 * cam.zoom / H, k = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / k; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * k; }
  // what a click would hit: an existing point, a midpoint, a point on an entity, the grid, or a free point
  function skSnap(px, py) {
    const sk = S.sk, m = sk.m, f = sk.frame, p = skFromScreen(f, px, py);
    if (!p) return null;
    let best = null, bd = 9;
    const scr = function (q) { const s = skScr(f, q); return Math.hypot(s[0] - px, s[1] - py); };
    m.pts.forEach(function (q, i) { const d = scr(q); if (d < bd) { bd = d; best = { p: q.slice(), pid: i, kind: i ? 'pt' : 'origin' }; } });
    if (best) return best;
    m.ents.forEach(function (e, i) { if (e.t !== 'line') return; const q = [(m.pts[e.a][0] + m.pts[e.b][0]) / 2, (m.pts[e.a][1] + m.pts[e.b][1]) / 2], d = scr(q); if (d < bd) { bd = d; best = { p: q, pid: -1, mid: i, kind: 'mid' }; } });
    if (best) return best;
    bd = 7;
    m.ents.forEach(function (e, i) { if (e.t === 'point') return; const q = nearestOn(skGeo(m, e), p, false); if (!q) return; const d = scr(q); if (d < bd) { bd = d; best = { p: q, pid: -1, on: i, kind: 'on' }; } });
    if (best) return best;
    if ($('skGrid').checked) { const st = skGridStep() / 5; return { p: [Math.round(p[0] / st) * st, Math.round(p[1] / st) * st], pid: -1, kind: 'grid' }; }
    return { p: p, pid: -1, kind: '' };
  }
  // a point for a snap: the existing one, or a new one with the inferred "on" / "midpoint" constraint
  function skPt(sn) {
    const m = S.sk.m;
    if (sn.pid >= 0) return sn.pid;
    m.pts.push([sn.p[0], sn.p[1]]);
    const id = m.pts.length - 1;
    if (sn.on >= 0 && sn.on !== undefined) m.cons.push({ t: 'on', p: id, e: sn.on });
    if (sn.mid >= 0 && sn.mid !== undefined) m.cons.push({ t: 'mid', p: id, e: sn.mid });
    return id;
  }
  const newPt = function (p) { const m = S.sk.m; m.pts.push([p[0], p[1]]); return m.pts.length - 1; };
  // line end with typed length / angle, or snapped horizontal / vertical (returns the inferred constraint)
  function skLineEnd(a, sn) {
    const Lv = skVal('skL'), Av = skVal('skA'), p = sn.p;
    let dx = p[0] - a[0], dy = p[1] - a[1], len = Math.hypot(dx, dy), hv = null;
    if (!isNaN(Av)) {
      const ux = Math.cos(Av * Math.PI / 180), uy = Math.sin(Av * Math.PI / 180), t = dx * ux + dy * uy;
      len = Math.abs(t); dx = (t < 0 ? -1 : 1) * ux; dy = (t < 0 ? -1 : 1) * uy;
    } else if (len > 0) { dx /= len; dy /= len; } else return { p: a.slice(), hv: null, snapped: false };
    if (!isNaN(Lv) && Lv > 0) len = Lv;
    const typed = !isNaN(Lv) || !isNaN(Av);
    if (sn.pid >= 0 && !typed) return { p: p.slice(), hv: Math.abs(p[1] - a[1]) < 1e-9 * (1 + len) ? 'h' : Math.abs(p[0] - a[0]) < 1e-9 * (1 + len) ? 'v' : null, snapped: true };
    if (isNaN(Av)) { const k = Math.tan(3 * Math.PI / 180); if (Math.abs(dy) < k * Math.abs(dx)) { dy = 0; dx = Math.sign(dx); hv = 'h'; } else if (Math.abs(dx) < k * Math.abs(dy)) { dx = 0; dy = Math.sign(dy); hv = 'v'; } }
    return { p: [a[0] + dx * len, a[1] + dy * len], hv: hv, snapped: false };
  }
  function skRectEnd(a, p) {
    const Wv = skVal('skW'), Hv = skVal('skH');
    return [isNaN(Wv) || Wv <= 0 ? p[0] : a[0] + (p[0] < a[0] ? -Wv : Wv), isNaN(Hv) || Hv <= 0 ? p[1] : a[1] + (p[1] < a[1] ? -Hv : Hv)];
  }
  function skCircle3(a, b, m) {                              // centre of the circle through a, b, m
    const ax = b[0] - a[0], ay = b[1] - a[1], bx = m[0] - a[0], by = m[1] - a[1], dd = 2 * (ax * by - ay * bx);
    if (Math.abs(dd) < 1e-12) return null;
    const ux = (by * (ax * ax + ay * ay) - ay * (bx * bx + by * by)) / dd, uy = (ax * (bx * bx + by * by) - bx * (ax * ax + ay * ay)) / dd;
    return [a[0] + ux, a[1] + uy];
  }
  const ccwThrough = function (c, a, b, m) { return norm2pi(angOf(c, m) - angOf(c, a)) < norm2pi(angOf(c, b) - angOf(c, a)); };
  // ---------- hit testing ----------
  function skItemAt(px, py) {
    const sk = S.sk, m = sk.m, f = sk.frame;
    let best = null, bd = 8;
    m.pts.forEach(function (q, i) { const s = skScr(f, q), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = 'p' + i; } });
    if (best) return best;
    for (const h of sk.hits) if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h.key;
    bd = 7;
    m.ents.forEach(function (e, i) {
      if (e.t === 'point') return;
      const q = skTess(skGeo(m, e)).map(function (p) { return skScr(f, p); });
      for (let k = 0; k + 1 < q.length; k++) {
        const ax = q[k + 1][0] - q[k][0], ay = q[k + 1][1] - q[k][1], l2 = ax * ax + ay * ay, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - q[k][0]) * ax + (py - q[k][1]) * ay) / l2)) : 0;
        const d = Math.hypot(px - q[k][0] - t * ax, py - q[k][1] - t * ay);
        if (d < bd) { bd = d; best = 'e' + i; }
      }
    });
    return best;
  }
  const kOf = function (key) { return { k: key[0], i: +key.slice(1) }; };
  const pointEnt = function (m, pid) { for (let i = 0; i < m.ents.length; i++) if (m.ents[i].t === 'point' && m.ents[i].p === pid) return i; return -1; };
  // ---------- applying changes ----------
  // run a change on the sketch; if the constraints cannot be met, or it adds nothing new, everything goes back
  function skChange(fn, opt) {
    const sk = S.sk, before = JSON.stringify(sk.m), dof0 = sk.an ? sk.an.dof : core.skAnalyse(sk.m).dof;
    fn(sk.m);
    const r = core.skSolve(sk.m);
    if (!r.ok) { sk.m = JSON.parse(before); flash(L('Không thỏa được: ràng buộc / kích thước này xung đột với các ràng buộc đã có', 'Cannot be met: this constraint / dimension conflicts with the existing ones')); skAnalyseNow(); dirty = true; return false; }
    const an = core.skAnalyse(sk.m);
    if (opt && opt.reduce && an.dof >= dof0) { sk.m = JSON.parse(before); flash(L('Thừa: hình đã bị ràng buộc theo hướng này rồi', 'Redundant: the sketch is already constrained this way')); skAnalyseNow(); dirty = true; return false; }
    sk.hist.push(before); if (sk.hist.length > 100) sk.hist.shift();
    sk.an = an; dirty = true;
    return true;
  }
  function skConstrain(type) {
    const sk = S.sk, m = sk.m, items = Array.from(sk.sel).map(kOf);
    const P = items.filter(function (o) { return o.k === 'p'; }).map(function (o) { return o.i; });
    const Ei = items.filter(function (o) { return o.k === 'e'; }).map(function (o) { return o.i; });
    // a point entity picked as an entity counts as its point
    for (let k = Ei.length - 1; k >= 0; k--) if (m.ents[Ei[k]].t === 'point') { P.push(m.ents[Ei[k]].p); Ei.splice(k, 1); }
    const T = function (i) { return m.ents[i].t; }, lines = Ei.filter(function (i) { return T(i) === 'line'; }), rounds = Ei.filter(function (i) { return T(i) === 'circle' || T(i) === 'arc'; });
    let fn = null;
    if (type === 'coinc') {
      if (P.length === 2 && !Ei.length) fn = function (mm) { core.skMerge(mm, P[0], P[1]); };
      else if (P.length === 1 && Ei.length === 1) fn = function (mm) { mm.cons.push({ t: 'on', p: P[0], e: Ei[0] }); };
    } else if (type === 'conc') { if (rounds.length === 2 && Ei.length === 2) fn = function (mm) { core.skMerge(mm, mm.ents[rounds[0]].c, mm.ents[rounds[1]].c); }; }
    else if (type === 'par' || type === 'perp') { if (lines.length === 2 && Ei.length === 2 && !P.length) fn = function (mm) { mm.cons.push({ t: type, e: lines.slice() }); }; }
    else if (type === 'tan') {
      if (Ei.length === 2 && !P.length && rounds.length >= 1) {
        let k = 1;
        if (rounds.length === 2) { const a = skGeo(m, m.ents[rounds[0]]), b = skGeo(m, m.ents[rounds[1]]), d = d2(a.c, b.c); k = Math.abs(d - (a.r + b.r)) <= Math.abs(d - Math.abs(a.r - b.r)) ? 1 : -1; }
        fn = function (mm) { mm.cons.push({ t: 'tan', e: Ei.slice(), k: k }); };
      }
    } else if (type === 'h' || type === 'v') {
      if (lines.length && lines.length === Ei.length && !P.length) fn = function (mm) { for (const i of lines) mm.cons.push({ t: type, e: i }); };
      else if (P.length === 2 && !Ei.length) fn = function (mm) { mm.cons.push({ t: type, p: P.slice() }); };
    } else if (type === 'eq') {
      if (Ei.length >= 2 && !P.length && (lines.length === Ei.length || rounds.length === Ei.length)) fn = function (mm) { for (let i = 1; i < Ei.length; i++) mm.cons.push({ t: 'eq', e: [Ei[0], Ei[i]] }); };
    } else if (type === 'mid') { if (P.length === 1 && lines.length === 1 && Ei.length === 1) fn = function (mm) { mm.cons.push({ t: 'mid', p: P[0], e: lines[0] }); }; }
    else if (type === 'sym') { if (P.length === 2 && lines.length === 1 && Ei.length === 1) fn = function (mm) { mm.cons.push({ t: 'sym', p: P.slice(), e: lines[0] }); }; }
    else if (type === 'fix') {
      if (P.length || Ei.length) fn = function (mm) {
        const ids = new Set(P.filter(function (i) { return i > 0; }));
        for (const i of Ei) { for (const q of entPts(mm.ents[i])) if (q > 0) ids.add(q); if (mm.ents[i].t === 'circle') mm.cons.push({ t: 'fixr', e: i, v: mm.ents[i].r }); }
        ids.forEach(function (q) { mm.cons.push({ t: 'fix', p: q, at: mm.pts[q].slice() }); });
      };
    }
    if (!fn) return false;
    if (skChange(fn, { reduce: true })) sk.sel.clear();
    return true;
  }
  // ---------- dimensions ----------
  function skDimCandidate(items, mouse) {
    const m = S.sk.m, P = [], E = [];
    for (const it of items) { const o = kOf(it); if (o.k === 'p') P.push(o.i); else if (o.k === 'e') { if (m.ents[o.i].t === 'point') P.push(m.ents[o.i].p); else E.push(o.i); } }
    const T = function (i) { return m.ents[i].t; };
    const pp = function (a, b) {                             // two points: aligned, horizontal or vertical by where the mouse is
      const A = m.pts[a], B = m.pts[b];
      if (mouse) {
        const inX = mouse[0] > Math.min(A[0], B[0]) && mouse[0] < Math.max(A[0], B[0]), inY = mouse[1] > Math.min(A[1], B[1]) && mouse[1] < Math.max(A[1], B[1]);
        if (inX && !inY && Math.abs(A[0] - B[0]) > 1e-9) return { t: 'hdist', p: [a, b], s: B[0] >= A[0] ? 1 : -1 };
        if (inY && !inX && Math.abs(A[1] - B[1]) > 1e-9) return { t: 'vdist', p: [a, b], s: B[1] >= A[1] ? 1 : -1 };
      }
      return { t: 'dist', p: [a, b] };
    };
    if (P.length === 2 && !E.length) return pp(P[0], P[1]);
    if (P.length === 1 && E.length === 1) {
      if (T(E[0]) === 'line') { const e = m.ents[E[0]], A = m.pts[e.a], B = m.pts[e.b], q = m.pts[P[0]], s = (B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0]) >= 0 ? 1 : -1; return { t: 'pld', p: P[0], e: E[0], s: s }; }
      return pp(P[0], m.ents[E[0]].c);
    }
    if (!P.length && E.length === 1) {
      const e = m.ents[E[0]];
      if (e.t === 'line') return pp(e.a, e.b);
      return { t: e.t === 'circle' ? 'diam' : 'rad', e: E[0] };
    }
    if (!P.length && E.length === 2) {
      if (T(E[0]) === 'line' && T(E[1]) === 'line') {
        const a = m.ents[E[0]], b = m.ents[E[1]], da = [m.pts[a.b][0] - m.pts[a.a][0], m.pts[a.b][1] - m.pts[a.a][1]], db = [m.pts[b.b][0] - m.pts[b.a][0], m.pts[b.b][1] - m.pts[b.a][1]];
        const cr = (da[0] * db[1] - da[1] * db[0]) / (Math.hypot(da[0], da[1]) * Math.hypot(db[0], db[1]) || 1);
        if (Math.abs(cr) < 1e-6) { const q = m.pts[b.a], A = m.pts[a.a], s = da[0] * (q[1] - A[1]) - da[1] * (q[0] - A[0]) >= 0 ? 1 : -1; return { t: 'pld', p: b.a, e: E[0], s: s }; }
        return { t: 'ang', e: [E[0], E[1]], s: cr >= 0 ? 1 : -1 };
      }
      if (T(E[0]) !== 'line' && T(E[1]) !== 'line') return pp(m.ents[E[0]].c, m.ents[E[1]].c);
      const li = T(E[0]) === 'line' ? E[0] : E[1], ci = li === E[0] ? E[1] : E[0], e = m.ents[li], A = m.pts[e.a], B = m.pts[e.b], q = m.pts[m.ents[ci].c];
      return { t: 'pld', p: m.ents[ci].c, e: li, s: (B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0]) >= 0 ? 1 : -1 };
    }
    return null;
  }
  // where a dimension is anchored (its label sits at anchor + at)
  function dimAnchor(m, c) {
    const P = function (i) { return m.pts[i]; };
    if (c.t === 'dist' || c.t === 'hdist' || c.t === 'vdist') { const q = c.p ? [P(c.p[0]), P(c.p[1])] : [P(m.ents[c.e].a), P(m.ents[c.e].b)]; return [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2]; }
    if (c.t === 'pld') { const e = m.ents[c.e], g = skGeo(m, e), q = P(c.p), f = nearestOn(g, q, false) || nearestOnLine(g, q); return [(q[0] + f[0]) / 2, (q[1] + f[1]) / 2]; }
    if (c.t === 'rad' || c.t === 'diam') return P(m.ents[c.e].c);
    if (c.t === 'lang') return P(m.ents[c.e].a);
    if (c.t === 'ang') { const x = lineX(m, c.e[0], c.e[1]); return x || P(m.ents[c.e[0]].a); }
    return [0, 0];
  }
  function nearestOnLine(g, p) { const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], l2 = dx * dx + dy * dy || 1e-12, t = ((p[0] - g.a[0]) * dx + (p[1] - g.a[1]) * dy) / l2; return [g.a[0] + t * dx, g.a[1] + t * dy]; }
  function lineX(m, i, j) {
    const a = m.ents[i], b = m.ents[j], p = m.pts[a.a], r = [m.pts[a.b][0] - p[0], m.pts[a.b][1] - p[1]], q = m.pts[b.a], s = [m.pts[b.b][0] - q[0], m.pts[b.b][1] - q[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
    return [p[0] + t * r[0], p[1] + t * r[1]];
  }
  function skPlaceDim(c, at) {
    const sk = S.sk, m = sk.m;
    c.v = core.skCurValue(m, c);
    if (c.t === 'ang' && c.v < 0) { c.s = -(c.s || 1); c.v = -c.v; }
    if (c.t === 'hdist' || c.t === 'vdist' || c.t === 'pld') { if (c.v < 0) { c.s = -(c.s || 1); c.v = -c.v; } }
    const an = dimAnchor(m, c);
    c.at = [at[0] - an[0], at[1] - an[1]];
    if (!skChange(function (mm) { mm.cons.push(c); }, { reduce: true })) return;
    sk.sel.clear(); sk.pend = []; sk.dimPrev = null;
    skDimEdit(sk.m.cons.length - 1);
  }
  // type a dimension's value in a box over the canvas
  function skDimEdit(ci) {
    const sk = S.sk, c = sk.m.cons[ci];
    if (!c) return;
    const an = dimAnchor(sk.m, c), q = skScr(sk.frame, [an[0] + c.at[0], an[1] + c.at[1]]), inp = $('skDimIn');
    inp.style.display = 'block'; inp.style.left = (q[0] - 40) + 'px'; inp.style.top = (q[1] - 13) + 'px';
    inp.value = +c.v.toFixed(4); inp.dataset.ci = ci;
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  }
  function skDimEditEnd(apply) {
    const inp = $('skDimIn');
    if (inp.style.display !== 'block') return;
    inp.style.display = 'none';
    const sk = S.sk;
    if (!sk || !apply) return;
    const ci = +inp.dataset.ci, c = sk.m.cons[ci], v = parseFloat(String(inp.value).replace(',', '.'));
    if (!c || !isFinite(v) || ((c.t === 'rad' || c.t === 'diam' || c.t === 'dist') && v <= 0)) { flash(L('Giá trị không hợp lệ', 'Invalid value')); return; }
    if (Math.abs(v - c.v) < 1e-12) return;
    skChange(function (mm) { mm.cons[ci].v = c.t === 'hdist' || c.t === 'vdist' || c.t === 'pld' || c.t === 'ang' ? Math.abs(v) : v; if (v < 0 && c.s) mm.cons[ci].s = -c.s; });
  }
  // ---------- trim ----------
  function skCutsOf(m, i) {                                  // where entity i meets the others: [{t, p, o}]
    const e = skGeo(m, m.ents[i]), out = [];
    const onArc = function (o, p) { return o.t === 'circle' || norm2pi(angOf(o.c, p) - o.a0) <= o.a1 - o.a0 + 1e-9; };
    const par = function (p) { if (e.t === 'line') { const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1]; return ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / (dx * dx + dy * dy); } return e.t === 'circle' ? norm2pi(angOf(e.c, p)) : norm2pi(angOf(e.c, p) - e.a0); };
    const onE = function (p) { if (e.t === 'line') { const t = par(p); return t > -1e-9 && t < 1 + 1e-9; } return onArc(e, p); };
    const lineCirc = function (l, c) {
      const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], fx = l.a[0] - c.c[0], fy = l.a[1] - c.c[1], A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r, D = B * B - 4 * A * C, r = [];
      if (D < 0 || A === 0) return r;
      for (const sg of [-1, 1]) { const t = (-B + sg * Math.sqrt(D)) / (2 * A); if (t > -1e-9 && t < 1 + 1e-9) r.push([l.a[0] + t * dx, l.a[1] + t * dy]); }
      return r;
    };
    m.ents.forEach(function (oe, j) {
      if (j === i || oe.t === 'point') return;
      const o = skGeo(m, oe);
      let pts = [];
      if (e.t === 'line' && o.t === 'line') {
        const x1 = e.a[0], y1 = e.a[1], x2 = e.b[0], y2 = e.b[1], x3 = o.a[0], y3 = o.a[1], x4 = o.b[0], y4 = o.b[1], den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) > 1e-12) { const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den, u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den; if (u > -1e-9 && u < 1 + 1e-9) pts.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]); }
      } else if (e.t === 'line') pts = lineCirc(e, o).filter(function (p) { return onArc(o, p); });
      else if (o.t === 'line') pts = lineCirc(o, e);
      else {
        const d = d2(e.c, o.c);
        if (d > 1e-12 && d <= e.r + o.r + 1e-9 && d >= Math.abs(e.r - o.r) - 1e-9) {
          const a = (e.r * e.r - o.r * o.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, e.r * e.r - a * a)), ux = (o.c[0] - e.c[0]) / d, uy = (o.c[1] - e.c[1]) / d, mx = e.c[0] + a * ux, my = e.c[1] + a * uy;
          pts = [[mx - h * uy, my + h * ux], [mx + h * uy, my - h * ux]].filter(function (p) { return onArc(o, p); });
        }
      }
      for (const p of pts) if (onE(p)) out.push({ t: par(p), p: p, o: j });
    });
    return { cuts: out, par: par, g: e };
  }
  function skTrim(i, click) {
    skChange(function (m) {
      const e = m.ents[i], c = skCutsOf(m, i), t = c.par(click), S0 = core.skScale(m);
      const ptAt = function (cut) {                          // reuse a point already there, else a new point on the cutting entity
        for (let k = 0; k < m.pts.length; k++) if (d2(m.pts[k], cut.p) < 1e-7 * S0) return k;
        const id = newPt(cut.p); m.cons.push({ t: 'on', p: id, e: cut.o }); return id;
      };
      if (e.t === 'circle') {
        const cs = c.cuts.slice().sort(function (x, y) { return x.t - y.t; });
        if (cs.length < 2) { core.skDeleteEnts(m, [i]); return; }
        let lo = cs[cs.length - 1], hi = cs[0];
        for (let k = 0; k + 1 < cs.length; k++) if (t >= cs[k].t && t <= cs[k + 1].t) { lo = cs[k]; hi = cs[k + 1]; }
        const a = ptAt(hi), b = ptAt(lo);
        m.ents[i] = { t: 'arc', c: e.c, a: a, b: b, cons: e.cons };
        m.cons = m.cons.filter(function (q) { return !((q.t === 'fixr') && q.e === i); });
        return;
      }
      const span = e.t === 'line' ? 1 : c.g.a1 - c.g.a0, eps = 1e-9 * Math.max(1, span);
      let lo = null, hi = null;
      for (const q of c.cuts) { if (q.t < t - eps && q.t > eps && (!lo || q.t > lo.t)) lo = q; if (q.t > t + eps && q.t < span - eps && (!hi || q.t < hi.t)) hi = q; }
      if (!lo && !hi) { core.skDeleteEnts(m, [i]); return; }
      const endKey = e.t === 'line' ? ['a', 'b'] : ['a', 'b'];
      if (lo && hi) {
        const pl = ptAt(lo), ph = ptAt(hi), b0 = e[endKey[1]];
        e[endKey[1]] = pl;
        m.ents.push(Object.assign({}, e, { a: ph, b: b0 }));
      } else if (lo) e[endKey[1]] = ptAt(lo);
      else e[endKey[0]] = ptAt(hi);
    });
  }
  // ---------- fillet ----------
  function skFillet(px, py) {
    const sk = S.sk, R = skVal('skR');
    if (!(R > 0)) { flash(L('Nhập bán kính R', 'Type the radius R')); return; }
    const m = sk.m;
    let best = -1, bd = 14;
    m.pts.forEach(function (q, k) {
      const ls = m.ents.filter(function (e) { return e.t === 'line' && (e.a === k || e.b === k); });
      if (ls.length !== 2) return;
      const s = skScr(sk.frame, q), d = Math.hypot(s[0] - px, s[1] - py);
      if (d < bd) { bd = d; best = k; }
    });
    if (best < 0) { flash(L('Không thấy góc giữa 2 đường thẳng tại đây', 'No corner between two lines here')); return; }
    const k = best, li = [], c = m.pts[k];
    m.ents.forEach(function (e, i) { if (e.t === 'line' && (e.a === k || e.b === k)) li.push(i); });
    const other = function (i) { const e = m.ents[i]; return m.pts[e.a === k ? e.b : e.a]; };
    const p1 = other(li[0]), p2 = other(li[1]);
    const u1 = [(p1[0] - c[0]) / d2(p1, c), (p1[1] - c[1]) / d2(p1, c)], u2 = [(p2[0] - c[0]) / d2(p2, c), (p2[1] - c[1]) / d2(p2, c)];
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))), dist = R / Math.tan(th / 2);
    if (!(th > 1e-3 && th < Math.PI - 1e-3) || dist >= d2(p1, c) || dist >= d2(p2, c)) { flash(L('Bán kính quá lớn cho góc này', 'The radius is too large for this corner')); return; }
    const t1 = [c[0] + u1[0] * dist, c[1] + u1[1] * dist], t2 = [c[0] + u2[0] * dist, c[1] + u2[1] * dist], bl = Math.hypot(u1[0] + u2[0], u1[1] + u2[1]), kk = R / Math.sin(th / 2) / bl;
    const cen = [c[0] + (u1[0] + u2[0]) * kk, c[1] + (u1[1] + u2[1]) * kk], ccw = norm2pi(angOf(cen, t2) - angOf(cen, t1)) < Math.PI;
    skChange(function (mm) {
      const a = newPt(t1), b = newPt(t2), cc = newPt(cen);
      for (const [i, p] of [[li[0], a], [li[1], b]]) { const e = mm.ents[i]; if (e.a === k) e.a = p; else e.b = p; }
      const ai = mm.ents.length;
      mm.ents.push(ccw ? { t: 'arc', c: cc, a: a, b: b } : { t: 'arc', c: cc, a: b, b: a });
      mm.cons.push({ t: 'tan', e: [li[0], ai] }, { t: 'tan', e: [li[1], ai] }, { t: 'rad', e: ai, v: R, at: [R * 0.8, R * 0.8] });
      // like Onshape's virtual sharp: the old corner stays as a construction point on both lines, so dimensions to it live on
      if (mm.cons.some(function (q) { return q !== undefined && [].concat(q.p === undefined ? [] : q.p).indexOf(k) >= 0 && q.t !== 'on'; })) {
        mm.ents.push({ t: 'point', p: k, cons: true }); mm.cons.push({ t: 'on', p: k, e: li[0] }, { t: 'on', p: k, e: li[1] });
      }
      core.skCompact(mm);
    });
  }
  // ---------- offset / mirror ----------
  function skOffset(i, q) {
    const d = skVal('skO');
    if (!(d > 0)) { flash(L('Nhập khoảng offset d', 'Type the offset distance d')); return; }
    skChange(function (m) {
      const e = m.ents[i], g = skGeo(m, e);
      if (e.t === 'line') {
        const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], l = Math.hypot(dx, dy), sg = ((q[0] - g.a[0]) * -dy + (q[1] - g.a[1]) * dx) >= 0 ? 1 : -1, nx = -dy / l * d * sg, ny = dx / l * d * sg;
        const a = newPt([g.a[0] + nx, g.a[1] + ny]), b = newPt([g.b[0] + nx, g.b[1] + ny]), ni = m.ents.length;
        m.ents.push({ t: 'line', a: a, b: b });
        m.cons.push({ t: 'par', e: [i, ni] }, { t: 'pld', p: a, e: i, v: d, s: sg, at: [nx / 2, ny / 2] });
      } else if (e.t === 'circle') { const r = g.r + (d2(q, g.c) > g.r ? d : -d); if (r <= 1e-9) throw new Error('r'); m.ents.push({ t: 'circle', c: e.c, r: r }); }
      else if (e.t === 'arc') {
        const r = g.r + (d2(q, g.c) > g.r ? d : -d); if (r <= 1e-9) throw new Error('r');
        m.ents.push({ t: 'arc', c: e.c, a: newPt(onC(g.c, r, g.a0)), b: newPt(onC(g.c, r, g.a1)) });
      }
    });
  }
  function skMirror(axisI) {
    const sk = S.sk, ids = Array.from(sk.sel).map(kOf).filter(function (o) { return o.k === 'e' && o.i !== axisI; }).map(function (o) { return o.i; });
    if (!ids.length) { flash(L('Chọn các nét cần đối xứng trước (công cụ Chọn), rồi bấm Mirror', 'Select the entities to mirror first (Select tool), then press Mirror')); return; }
    skChange(function (m) {
      const ax = m.ents[axisI], A = m.pts[ax.a], B = m.pts[ax.b], dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy, S0 = core.skScale(m), map = new Map();
      const mp = function (k) {
        if (map.has(k)) return map.get(k);
        const p = m.pts[k], t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / l2, f = [A[0] + t * dx, A[1] + t * dy];
        let id = k;
        if (d2(p, f) > 1e-7 * S0) { id = newPt([2 * f[0] - p[0], 2 * f[1] - p[1]]); m.cons.push({ t: 'sym', p: [k, id], e: axisI }); }
        map.set(k, id); return id;
      };
      for (const i of ids) {
        const e = m.ents[i], ni = m.ents.length;
        if (e.t === 'line') m.ents.push({ t: 'line', a: mp(e.a), b: mp(e.b), cons: e.cons });
        else if (e.t === 'point') m.ents.push({ t: 'point', p: mp(e.p) });
        else if (e.t === 'circle') { m.ents.push({ t: 'circle', c: mp(e.c), r: e.r, cons: e.cons }); m.cons.push({ t: 'eq', e: [i, ni] }); }
        else m.ents.push({ t: 'arc', c: mp(e.c), a: mp(e.b), b: mp(e.a), cons: e.cons });
      }
    });
    sk.sel.clear(); skSetTool('select');
  }
  // ---------- clicks ----------
  function skClick(px, py, ev) {
    const sk = S.sk, m = sk.m, t = sk.tool;
    if ($('skDimIn').style.display === 'block') { skDimEditEnd(true); return; }
    if (t === 'select' || sk.cmode) {
      const it = skItemAt(px, py);
      if (!it) { sk.sel.clear(); dirty = true; return; }
      if (sk.sel.has(it)) sk.sel.delete(it); else sk.sel.add(it);
      if (sk.cmode) skConstrain(sk.cmode);
      dirty = true; return;
    }
    if (t === 'dim') {
      const it = skItemAt(px, py), mouse = skFromScreen(sk.frame, px, py);
      if (it && it[0] !== 'c' && sk.pend.length < 2 && sk.pend.indexOf(it) < 0) { sk.pend.push(it); sk.sel = new Set(sk.pend); sk.dimPrev = skDimCandidate(sk.pend, mouse); dirty = true; return; }
      if (sk.pend.length && mouse) { const c = skDimCandidate(sk.pend, mouse); if (c) skPlaceDim(c, mouse); else { flash(L('Không đo được cặp này', 'This pair cannot be dimensioned')); sk.pend = []; sk.sel.clear(); } }
      dirty = true; return;
    }
    if (t === 'trim') { const it = skItemAt(px, py); if (it && it[0] === 'e' && m.ents[+it.slice(1)].t !== 'point') skTrim(+it.slice(1), skFromScreen(sk.frame, px, py)); return; }
    if (t === 'offset') { const it = skItemAt(px, py); if (it && it[0] === 'e' && m.ents[+it.slice(1)].t !== 'point') { try { skOffset(+it.slice(1), skFromScreen(sk.frame, px, py)); } catch (e) { flash(L('Khoảng offset lớn hơn bán kính', 'The offset is larger than the radius')); } } return; }
    if (t === 'mirror') { const it = skItemAt(px, py); if (it && it[0] === 'e' && m.ents[+it.slice(1)].t === 'line') skMirror(+it.slice(1)); else flash(L('Hãy bấm vào một đường thẳng', 'Click a straight line')); return; }
    if (t === 'fillet') { skFillet(px, py); return; }
    const sn = skSnap(px, py);
    if (!sn) return;
    const p = sn.p;
    const commit = function (fn) { skChange(fn); sk.pts = []; };
    if (t === 'point') { commit(function (mm) { if (sn.pid >= 0 && pointEnt(mm, sn.pid) >= 0) return; mm.ents.push({ t: 'point', p: skPt(sn) }); }); return; }
    if (t === 'line') {
      if (!sk.pts.length) { sk.pts = [{ id: skPt(sn) }]; dirty = true; return; }
      const a0 = sk.pts[sk.pts.length - 1].id, A = m.pts[a0], q = skLineEnd(A, sn);
      if (d2(A, q.p) < 1e-9) return;
      const Lv = skVal('skL'), Av = skVal('skA');
      let endId = -1;
      const ok = skChange(function (mm) {
        const b = q.snapped ? skPt(sn) : (function () { const s2 = skSnapAt(q.p); return s2 >= 0 ? s2 : newPt(q.p); })();
        endId = b;
        const li = mm.ents.length;
        mm.ents.push({ t: 'line', a: a0, b: b });
        if (q.hv) mm.cons.push({ t: q.hv, e: li });
        if (!isNaN(Lv) && Lv > 0) mm.cons.push({ t: 'dist', p: [a0, b], v: Lv, at: [0, 0] });
        if (!isNaN(Av)) mm.cons.push({ t: 'lang', e: li, v: Av, s: 1, at: [0, 0] });
      });
      if (!ok) return;
      if ($('skL')) $('skL').value = ''; if ($('skA')) $('skA').value = '';
      if (endId === sk.pts[0].id || sn.pid >= 0 && sk.pts.length > 0 && endId !== sk.pts[0].id && m.ents.filter(function (e) { return entPts(e).indexOf(endId) >= 0; }).length > 1) sk.pts = []; else sk.pts.push({ id: endId });
      dirty = true; return;
    }
    if (t === 'rect' || t === 'crect') {
      if (!sk.pts.length) { sk.pts = [{ id: skPt(sn), p: p.slice() }]; dirty = true; return; }
      const a = m.pts[sk.pts[0].id], Wv = skVal('skW'), Hv = skVal('skH');
      let c0, c2;
      if (t === 'rect') { c0 = a; c2 = skRectEnd(a, p); }
      else { const hw = !isNaN(Wv) && Wv > 0 ? Wv / 2 : Math.abs(p[0] - a[0]), hh = !isNaN(Hv) && Hv > 0 ? Hv / 2 : Math.abs(p[1] - a[1]); c0 = [a[0] - hw, a[1] - hh]; c2 = [a[0] + hw, a[1] + hh]; }
      if (Math.abs(c2[0] - c0[0]) < 1e-9 || Math.abs(c2[1] - c0[1]) < 1e-9) return;
      const first = sk.pts[0].id;
      commit(function (mm) {
        const k0 = t === 'rect' ? first : newPt(c0), k1 = newPt([c2[0], c0[1]]), k2 = t === 'rect' && sn.pid >= 0 && !(Wv > 0) && !(Hv > 0) ? sn.pid : newPt(c2), k3 = newPt([c0[0], c2[1]]), n0 = mm.ents.length;
        mm.ents.push({ t: 'line', a: k0, b: k1 }, { t: 'line', a: k1, b: k2 }, { t: 'line', a: k2, b: k3 }, { t: 'line', a: k3, b: k0 });
        mm.cons.push({ t: 'h', e: n0 }, { t: 'v', e: n0 + 1 }, { t: 'h', e: n0 + 2 }, { t: 'v', e: n0 + 3 });
        if (t === 'crect') { const dg = mm.ents.length; mm.ents.push({ t: 'line', a: k0, b: k2, cons: true }, { t: 'line', a: k1, b: k3, cons: true }); mm.cons.push({ t: 'mid', p: first, e: dg }, { t: 'mid', p: first, e: dg + 1 }); }
        if (Wv > 0) mm.cons.push({ t: 'hdist', p: [k0, k1], v: Wv, s: 1, at: [0, -6] });
        if (Hv > 0) mm.cons.push({ t: 'vdist', p: [k1, k2], v: Hv, s: 1, at: [6, 0] });
      });
      return;
    }
    if (t === 'circle') {
      const D = skVal('skD');
      if (D > 0) { commit(function (mm) { const i = mm.ents.length; mm.ents.push({ t: 'circle', c: skPt(sn), r: D / 2 }); mm.cons.push({ t: 'diam', e: i, v: D, at: [D * 0.6, D * 0.6] }); }); return; }
      if (!sk.pts.length) { sk.pts = [{ id: skPt(sn) }]; dirty = true; return; }
      const c = sk.pts[0].id, r = d2(m.pts[c], p);
      if (r > 1e-9) commit(function (mm) { const i = mm.ents.length; mm.ents.push({ t: 'circle', c: c, r: r }); if (sn.pid >= 0 || sn.on >= 0) { const id = skPt(sn); mm.cons.push({ t: 'on', p: id, e: i }); } }); else sk.pts = [];
      return;
    }
    if (t === 'arc') {
      sk.pts.push({ id: sk.pts.length < 2 ? skPt(sn) : -1, p: p.slice() });
      if (sk.pts.length < 3) { dirty = true; return; }
      const A = m.pts[sk.pts[0].id], B = m.pts[sk.pts[1].id], c = skCircle3(A, B, p), ia = sk.pts[0].id, ib = sk.pts[1].id;
      if (c) commit(function (mm) { const cc = newPt(c); mm.ents.push(ccwThrough(c, A, B, p) ? { t: 'arc', c: cc, a: ia, b: ib } : { t: 'arc', c: cc, a: ib, b: ia }); }); else sk.pts = [];
      return;
    }
    if (t === 'tarc') {
      if (!sk.pts.length) {
        if (sn.pid < 0) { flash(L('Hãy bấm vào đầu mút của một đường thẳng / cung', 'Click the end of a line / arc')); return; }
        const ei = m.ents.findIndex(function (e) { return (e.t === 'line' || e.t === 'arc') && (e.a === sn.pid || e.b === sn.pid); });
        if (ei < 0) { flash(L('Điểm này không phải đầu mút đường thẳng / cung', 'This point is not the end of a line / arc')); return; }
        sk.pts = [{ id: sn.pid, e: ei }]; dirty = true; return;
      }
      const st = sk.pts[0], arc = tangentArc(m, st, p);
      if (!arc) return;
      commit(function (mm) { const b = skPt(sn), cc = newPt(arc.c), ai = mm.ents.length; mm.ents.push(arc.ccw ? { t: 'arc', c: cc, a: st.id, b: b } : { t: 'arc', c: cc, a: b, b: st.id }); mm.cons.push({ t: 'tan', e: [st.e, ai] }); });
      return;
    }
    if (t === 'poly') {
      if (!sk.pts.length) { sk.pts = [{ id: skPt(sn) }]; dirty = true; return; }
      const ci = sk.pts[0].id, c = m.pts[ci], n = Math.max(3, Math.min(64, Math.round(skVal('skN') || 6))), D = skVal('skD'), r = D > 0 ? D / 2 : d2(c, p), a0 = angOf(c, p);
      if (r > 1e-9) commit(function (mm) {
        const ids = [], c0 = mm.ents.length;
        for (let k = 0; k < n; k++) ids.push(newPt(onC(c, r, a0 + TAU * k / n)));
        mm.ents.push({ t: 'circle', c: ci, r: r, cons: true });
        for (let k = 0; k < n; k++) { mm.ents.push({ t: 'line', a: ids[k], b: ids[(k + 1) % n] }); mm.cons.push({ t: 'on', p: ids[k], e: c0 }); if (k) mm.cons.push({ t: 'eq', e: [c0 + 1, c0 + 1 + k] }); }
        if (D > 0) mm.cons.push({ t: 'diam', e: c0, v: D, at: [r, r] });
      }); else sk.pts = [];
      return;
    }
    if (t === 'slot') {
      sk.pts.push({ id: sk.pts.length < 2 ? skPt(sn) : -1, p: p.slice() });
      const Wv = skVal('skW');
      if (sk.pts.length < 2 || (sk.pts.length < 3 && !(Wv > 0))) { dirty = true; return; }
      const i1 = sk.pts[0].id, i2 = sk.pts[1].id, C1 = m.pts[i1], C2 = m.pts[i2], L0 = d2(C1, C2);
      if (L0 < 1e-9) { sk.pts = []; return; }
      const ux = (C2[0] - C1[0]) / L0, uy = (C2[1] - C1[1]) / L0, nx = -uy, ny = ux;
      const r = Wv > 0 ? Wv / 2 : Math.abs((p[0] - C1[0]) * nx + (p[1] - C1[1]) * ny);
      if (r < 1e-9) { sk.pts = []; return; }
      commit(function (mm) {
        const a1 = newPt([C1[0] + nx * r, C1[1] + ny * r]), b1 = newPt([C2[0] + nx * r, C2[1] + ny * r]), b2 = newPt([C2[0] - nx * r, C2[1] - ny * r]), a2 = newPt([C1[0] - nx * r, C1[1] - ny * r]), k = mm.ents.length;
        mm.ents.push({ t: 'line', a: a1, b: b1 }, { t: 'arc', c: i2, a: b2, b: b1 }, { t: 'line', a: b2, b: a2 }, { t: 'arc', c: i1, a: a1, b: a2 }, { t: 'line', a: i1, b: i2, cons: true });
        mm.cons.push({ t: 'tan', e: [k, k + 1] }, { t: 'tan', e: [k + 2, k + 1] }, { t: 'tan', e: [k, k + 3] }, { t: 'tan', e: [k + 2, k + 3] }, { t: 'eq', e: [k + 1, k + 3] });
        if (Wv > 0) mm.cons.push({ t: 'rad', e: k + 1, v: Wv / 2, at: [r, r] });
      });
      return;
    }
  }
  function skSnapAt(p) { const m = S.sk.m; for (let i = 0; i < m.pts.length; i++) if (d2(m.pts[i], p) < 1e-9 * core.skScale(m)) return i; return -1; }
  function tangentArc(m, st, p) {
    const e = m.ents[st.e], S0 = m.pts[st.id];
    let t;
    if (e.t === 'line') { const o = m.pts[e.a === st.id ? e.b : e.a]; t = [S0[0] - o[0], S0[1] - o[1]]; }
    else { const c = m.pts[e.c], r = [S0[0] - c[0], S0[1] - c[1]]; t = st.id === e.b ? [-r[1], r[0]] : [r[1], -r[0]]; }
    const tl = Math.hypot(t[0], t[1]); if (tl < 1e-12) return null;
    t = [t[0] / tl, t[1] / tl];
    const n = [-t[1], t[0]], dx = p[0] - S0[0], dy = p[1] - S0[1], den = 2 * (dx * n[0] + dy * n[1]);
    if (Math.abs(den) < 1e-9) return null;
    const k = (dx * dx + dy * dy) / den;
    return { c: [S0[0] + n[0] * k, S0[1] + n[1] * k], ccw: k > 0 };
  }
  // ---------- dragging ----------
  function skDown(px, py) {
    const sk = S.sk;
    if (!sk || sk.tool !== 'select' || sk.cmode) return null;
    const it = skItemAt(px, py);
    if (!it) return null;
    const o = kOf(it), m = sk.m, at = skFromScreen(sk.frame, px, py);
    if (o.k === 'p' && o.i === 0) return null;
    if (o.k === 'c' && core.SK_DIMS[m.cons[o.i].t]) return { type: 'sk', what: 'dim', ci: o.i, key: it, x0: px, y0: py, start: JSON.stringify(m) };
    if (o.k === 'c') return null;
    const g = { type: 'sk', what: o.k, i: o.i, key: it, x0: px, y0: py, from: at, start: JSON.stringify(m), base: m.pts.map(function (p) { return p.slice(); }) };
    return g;
  }
  function skDragMove(d, px, py) {
    const sk = S.sk, m = sk.m, at = skFromScreen(sk.frame, px, py);
    if (!at) return;
    if (Math.hypot(px - d.x0, py - d.y0) < 3 && !d.moved) return;
    d.moved = true;
    if (d.what === 'dim') { const c = m.cons[d.ci], an = dimAnchor(m, c); c.at = [at[0] - an[0], at[1] - an[1]]; dirty = true; return; }
    if (d.what === 'p') core.skSolve(m, { drag: { p: d.i, to: at } });
    else {
      const e = m.ents[d.i];
      if (e.t === 'circle' && d2(at, m.pts[e.c]) > 0) { const c = m.pts[e.c]; core.skSolve(m, { drag: { e: d.i, r: d2(at, c) } }); }
      else core.skSolve(m, { drag: { e: d.i, by: [at[0] - d.from[0], at[1] - d.from[1]], base: d.base } });
    }
    dirty = true;
  }
  function skDragEnd(d) {
    const sk = S.sk;
    if (!d.moved) { skClick(d.x0, d.y0); return; }
    sk.hist.push(d.start); if (sk.hist.length > 100) sk.hist.shift();
    skAnalyseNow(); dirty = true;
  }
  function skHover(px, py) {
    const sk = S.sk;
    sk.mouse = [px, py];
    if (sk.tool === 'select' || sk.cmode || sk.tool === 'dim' || sk.tool === 'trim' || sk.tool === 'offset' || sk.tool === 'mirror') { sk.hov = skItemAt(px, py); sk.cur = skFromScreen(sk.frame, px, py); sk.snap = null; }
    else { const s = skSnap(px, py); sk.cur = s ? s.p : null; sk.snap = s; sk.hov = null; }
    if (sk.tool === 'dim' && sk.pend.length) sk.dimPrev = skDimCandidate(sk.pend, sk.cur);
    canvas.style.cursor = sk.tool === 'select' && sk.hov ? 'pointer' : 'crosshair';
    dirty = true;
  }
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
  // ---------- drawing ----------
  const SKC = { free: '#6fc3ff', fixed: '#ffffff', cons: '#c58bff', sel: '#ffa726', hov: '#ffe14a', pre: '#ffcf5a' };
  function drawDim(m, f, c, color, hits, key) {
    const P = function (p) { return skScr(f, p); }, an = dimAnchor(m, c), Lp = [an[0] + (c.at ? c.at[0] : 0), an[1] + (c.at ? c.at[1] : 0)], LQ = P(Lp);
    ctx.save(); ctx.setLineDash([]);
    const arrowAt = function (from, tip) { arrow2(from, tip, color, 9, 3.5); };
    let text = '';
    if (c.t === 'dist' || c.t === 'hdist' || c.t === 'vdist') {
      const q = c.p ? [m.pts[c.p[0]], m.pts[c.p[1]]] : [m.pts[m.ents[c.e].a], m.pts[m.ents[c.e].b]];
      let u = c.t === 'hdist' ? [1, 0] : c.t === 'vdist' ? [0, 1] : [q[1][0] - q[0][0], q[1][1] - q[0][1]];
      const ul = Math.hypot(u[0], u[1]) || 1; u = [u[0] / ul, u[1] / ul];
      const nn = [-u[1], u[0]], o0 = (Lp[0] - q[0][0]) * nn[0] + (Lp[1] - q[0][1]) * nn[1], o1 = (Lp[0] - q[1][0]) * nn[0] + (Lp[1] - q[1][1]) * nn[1];
      const a = [q[0][0] + nn[0] * o0, q[0][1] + nn[1] * o0], b = [q[1][0] + nn[0] * o1, q[1][1] + nn[1] * o1];
      line2(P(q[0]), P(a), color, 1); line2(P(q[1]), P(b), color, 1); line2(P(a), P(b), color, 1.2);
      if (d2(P(a), P(b)) > 22) { arrowAt(P(b), P(a)); arrowAt(P(a), P(b)); }
      text = f2(c.v);
    } else if (c.t === 'pld') {
      const g = skGeo(m, m.ents[c.e]), q = m.pts[c.p], fpt = nearestOnLine(g, q), du = [g.b[0] - g.a[0], g.b[1] - g.a[1]], dl = Math.hypot(du[0], du[1]) || 1, u = [du[0] / dl, du[1] / dl];
      const s = (Lp[0] - (q[0] + fpt[0]) / 2) * u[0] + (Lp[1] - (q[1] + fpt[1]) / 2) * u[1], a = [fpt[0] + u[0] * s, fpt[1] + u[1] * s], b = [q[0] + u[0] * s, q[1] + u[1] * s];
      line2(P(fpt), P(a), color, 1); line2(P(q), P(b), color, 1); line2(P(a), P(b), color, 1.2);
      if (d2(P(a), P(b)) > 22) { arrowAt(P(b), P(a)); arrowAt(P(a), P(b)); }
      text = f2(c.v);
    } else if (c.t === 'rad' || c.t === 'diam') {
      const g = skGeo(m, m.ents[c.e]), dir = [Lp[0] - g.c[0], Lp[1] - g.c[1]], dl = Math.hypot(dir[0], dir[1]) || 1, u = [dir[0] / dl, dir[1] / dl], tip = [g.c[0] + u[0] * g.r, g.c[1] + u[1] * g.r];
      const from = c.t === 'diam' ? [g.c[0] - u[0] * g.r, g.c[1] - u[1] * g.r] : g.c;
      line2(P(from), P(dl > g.r ? Lp : tip), color, 1.2); arrowAt(P(g.c), P(tip)); if (c.t === 'diam') arrowAt(P(g.c), P(from));
      text = (c.t === 'diam' ? 'Ø' : 'R') + f2(c.v);
    } else if (c.t === 'ang' || c.t === 'lang') {
      const X = an, r = Math.max(1e-6, d2(Lp, X));
      let a0, sp;
      if (c.t === 'lang') { a0 = 0; sp = (c.s || 1) * c.v * Math.PI / 180; }
      else { const e1 = m.ents[c.e[0]], d1 = [m.pts[e1.b][0] - m.pts[e1.a][0], m.pts[e1.b][1] - m.pts[e1.a][1]]; a0 = Math.atan2(d1[1], d1[0]); sp = (c.s || 1) * c.v * Math.PI / 180; }
      const la = angOf(X, Lp);                             // draw the arc in the quadrant the label is in
      let best = [a0, sp], bestD = Infinity;
      for (const k of [0, Math.PI]) for (const sg of [1, -1]) { const s0 = a0 + k, s1 = sg * sp; const mid = s0 + s1 / 2, dd = Math.abs(Math.atan2(Math.sin(la - mid), Math.cos(la - mid))); if (dd < bestD) { bestD = dd; best = [s0, s1]; } }
      const q = []; for (let i = 0; i <= 24; i++) q.push(P(onC(X, r, best[0] + best[1] * i / 24)));
      poly2(q, color, 1.2);
      text = f2(c.v, 2) + '°';
    }
    ctx.restore();
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(14,18,22,0.92)'; ctx.fillRect(LQ[0] - w / 2, LQ[1] - 9, w, 18);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(LQ[0] - w / 2 + 0.5, LQ[1] - 8.5, w - 1, 17);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, LQ[0], LQ[1] + 4); ctx.textAlign = 'left';
    if (hits) hits.push({ key: key, x: LQ[0] - w / 2, y: LQ[1] - 9, w: w, h: 18 });
  }
  function drawSketchModel(s, live) {
    const m = s.m, f = s.frame, P = function (p) { return skScr(f, p); }, sk = live ? S.sk : null, an = sk ? sk.an : null;
    const flat = core.skFlat(m), reg = skRegions(flat);
    const picked = !live && (S.skSel === s.id || (S.fd && S.fd.sketchId === s.id));
    ctx.fillStyle = live ? 'rgba(95,224,255,0.14)' : picked ? 'rgba(255,167,38,0.16)' : 'rgba(95,224,255,0.07)'; ctx.beginPath();
    reg.regions.forEach(function (r, ri) {
      if (S.fd && S.fd.sketchId === s.id && S.fd.off && S.fd.off.has(ri)) return;
      for (const l of r.loops) { l.forEach(function (p, i) { const q = P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); }
    });
    ctx.fill('evenodd');
    m.ents.forEach(function (e, i) {
      const key = 'e' + i, sel = sk && sk.sel.has(key), hov = sk && sk.hov === key;
      const col = sel ? SKC.sel : hov ? SKC.hov : !live ? (picked ? '#ffc46b' : 'rgba(210,225,245,0.7)') : e.cons ? SKC.cons : an && an.entFree[i] ? SKC.free : SKC.fixed;
      if (e.t === 'point') { dot2(P(m.pts[e.p]), col, sel || hov ? 4.5 : 3.5); return; }
      if (e.cons) ctx.setLineDash([9, 5]);
      poly2(skTess(skGeo(m, e)).map(P), col, sel || hov ? 3.4 : live ? 2 : 1.4);
      ctx.setLineDash([]);
    });
    if (!live) return;
    m.pts.forEach(function (p, i) {
      const key = 'p' + i, sel = sk.sel.has(key), hov = sk.hov === key, q = P(p);
      if (i === 0) { dot2(q, sel ? SKC.sel : hov ? SKC.hov : '#ffffff', sel || hov ? 5 : 3.5); return; }
      dot2(q, '#11151a', sel || hov ? 6 : 4.2); dot2(q, sel ? SKC.sel : hov ? SKC.hov : an && an.ptFree[i] ? SKC.free : SKC.fixed, sel || hov ? 4.5 : 2.8);
    });
    // constraint marks and dimensions (clickable)
    const hits = [], stack = new Map();
    const entAnchor = function (ei) {
      const g = skGeo(m, m.ents[ei]);
      if (g.t === 'line') { const a = P(g.a), b = P(g.b); return { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: [b[0] - a[0], b[1] - a[1]] }; }
      if (g.t === 'point') return { p: P(g.p), d: [1, 0] };
      const a = g.t === 'circle' ? Math.PI / 4 : (g.a0 + g.a1) / 2;
      return { p: P(onC(g.c, g.r, a)), d: [-Math.sin(a), -Math.cos(a)] };
    };
    m.cons.forEach(function (c, ci) {
      const key = 'c' + ci, sel = sk.sel.has(key), hov = sk.hov === key;
      if (core.SK_DIMS[c.t]) { drawDim(m, f, c, sel ? SKC.sel : hov ? SKC.hov : '#9fe3ff', hits, key); return; }
      const g = SK_GLYPH[c.t];
      if (!g) return;
      const anchors = [];
      if (c.t === 'fix' || c.t === 'on' || c.t === 'mid' || (c.p !== undefined && c.e === undefined)) { const pp = Array.isArray(c.p) ? c.p : [c.p]; for (const k of pp) anchors.push({ p: P(m.pts[k]), d: [1, 0], key: 'p' + k }); }
      else for (const ei of [].concat(c.e)) { const a = entAnchor(ei); a.key = 'e' + ei; anchors.push(a); }
      for (const a of anchors) {
        const n = stack.get(a.key) || 0; stack.set(a.key, n + 1);
        const dl = Math.hypot(a.d[0], a.d[1]) || 1, ux = a.d[0] / dl, uy = a.d[1] / dl;
        const x = a.p[0] - uy * 15 + ux * (n * 19 - 0) - 8, y = a.p[1] + ux * 15 + uy * n * 19 - 8;
        ctx.fillStyle = sel ? SKC.sel : hov ? SKC.hov : 'rgba(30,38,48,0.92)'; ctx.fillRect(x, y, 16, 16);
        ctx.strokeStyle = 'rgba(160,190,220,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
        ctx.fillStyle = sel || hov ? '#111' : '#d7e6f5'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.fillText(g, x + 8, y + 12); ctx.textAlign = 'left';
        hits.push({ key: key, x: x, y: y, w: 16, h: 16 });
      }
    });
    sk.hits = hits;
  }
  function drawSketch() {
    if (S.fd && S.fd.lines) for (const l of S.fd.lines) poly2(l.map(project), '#ffcf5a', 1.6);
    if (S.cmp && S.cmp.split) return;
    const sk = S.sk;
    for (const s of S.sketches) if (s.visible && (!sk || sk.id !== s.id)) drawSketchModel(s, false);
    if (!sk) return;
    const f = sk.frame, P = function (p) { return skScr(f, p); };
    const st = skGridStep(), c = skFromScreen(f, W / 2, H / 2) || [0, 0], n = Math.ceil(Math.max(W, H) / 26) + 4, x0 = Math.round(c[0] / st) * st, y0 = Math.round(c[1] / st) * st;
    if (n < 400) {
      for (let k = -n; k <= n; k++) {
        const x = x0 + k * st, y = y0 + k * st, major = Math.abs(Math.round(x / st)) % 5 === 0, majorY = Math.abs(Math.round(y / st)) % 5 === 0;
        line2(P([x, y0 - n * st]), P([x, y0 + n * st]), major ? 'rgba(150,170,200,0.22)' : 'rgba(150,170,200,0.09)', 1);
        line2(P([x0 - n * st, y]), P([x0 + n * st, y]), majorY ? 'rgba(150,170,200,0.22)' : 'rgba(150,170,200,0.09)', 1);
      }
    }
    line2(P([-1e4, 0]), P([1e4, 0]), 'rgba(255,90,82,0.55)', 1.2); line2(P([0, -1e4]), P([0, 1e4]), 'rgba(82,208,106,0.55)', 1.2);
    drawSketchModel(sk, true);
    const m = sk.m, cur = sk.cur, t = sk.tool, PV = SKC.pre;
    if (sk.dimPrev && cur) { const c2 = Object.assign({}, sk.dimPrev); c2.v = Math.abs(core.skCurValue(m, c2)); const an = dimAnchor(m, c2); c2.at = [cur[0] - an[0], cur[1] - an[1]]; drawDim(m, f, c2, PV, null, ''); }
    const pt = function (o) { return o.id >= 0 ? m.pts[o.id] : o.p; };
    for (const o of sk.pts) dot2(P(pt(o)), PV, 4);
    if (cur && sk.pts.length && sk.snap) {
      const a = pt(sk.pts[sk.pts.length - 1]);
      if (t === 'line') { const q = skLineEnd(a, sk.snap), b = q.p, mm = P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); line2(P(a), P(b), PV, 2); tag(mm[0], mm[1] - 14, f2(d2(a, b)) + ' mm  ' + f2(norm2pi(angOf(a, b)) * 180 / Math.PI, 1) + '°', '#ffffff', PV); if (q.hv) { const bq = P(b); tag(bq[0] + 16, bq[1] + 16, q.hv === 'h' ? 'H' : 'V', '#111', PV); } }
      else if (t === 'rect' || t === 'crect') {
        const a0 = pt(sk.pts[0]); let c0, c2;
        if (t === 'rect') { c0 = a0; c2 = skRectEnd(a0, cur); } else { const Wv = skVal('skW'), Hv = skVal('skH'), hw = Wv > 0 ? Wv / 2 : Math.abs(cur[0] - a0[0]), hh = Hv > 0 ? Hv / 2 : Math.abs(cur[1] - a0[1]); c0 = [a0[0] - hw, a0[1] - hh]; c2 = [a0[0] + hw, a0[1] + hh]; }
        const mq = P(c2); poly2([P(c0), P([c2[0], c0[1]]), P(c2), P([c0[0], c2[1]]), P(c0)], PV, 2); tag(mq[0], mq[1] - 14, f2(Math.abs(c2[0] - c0[0])) + ' × ' + f2(Math.abs(c2[1] - c0[1])), '#ffffff', PV);
      }
      else if (t === 'circle') { const r = d2(a, cur), mq = P(cur); poly2(skTess({ t: 'circle', c: a, r: r }).map(P), PV, 2); tag(mq[0], mq[1] - 14, 'Ø ' + f2(2 * r), '#ffffff', PV); }
      else if (t === 'poly') { const nn = Math.max(3, Math.min(64, Math.round(skVal('skN') || 6))), D = skVal('skD'), r = D > 0 ? D / 2 : d2(a, cur), a0 = angOf(a, cur), q = []; for (let k = 0; k <= nn; k++) q.push(P(onC(a, r, a0 + TAU * k / nn))); poly2(q, PV, 2); }
      else if (t === 'arc') { if (sk.pts.length === 1) line2(P(a), P(cur), PV, 1.5); else { const A = pt(sk.pts[0]), B = pt(sk.pts[1]), cc = skCircle3(A, B, cur); if (cc) { const ccw = ccwThrough(cc, A, B, cur), r = d2(cc, A), a0 = angOf(cc, ccw ? A : B), a1 = a0 + norm2pi(angOf(cc, ccw ? B : A) - a0), mq = P(cur); poly2(skTess({ t: 'arc', c: cc, r: r, a0: a0, a1: a1 }).map(P), PV, 2); tag(mq[0], mq[1] - 14, 'R ' + f2(r), '#ffffff', PV); } } }
      else if (t === 'tarc') { const arc = tangentArc(m, sk.pts[0], cur); if (arc) { const A = m.pts[sk.pts[0].id], r = d2(arc.c, A), s0 = angOf(arc.c, arc.ccw ? A : cur), s1 = s0 + norm2pi(angOf(arc.c, arc.ccw ? cur : A) - s0); poly2(skTess({ t: 'arc', c: arc.c, r: r, a0: s0, a1: s1 }).map(P), PV, 2); } }
      else if (t === 'slot') { if (sk.pts.length === 1) line2(P(a), P(cur), PV, 1.5); else { const C1 = pt(sk.pts[0]), C2 = pt(sk.pts[1]), L0 = d2(C1, C2) || 1, nx = -(C2[1] - C1[1]) / L0, ny = (C2[0] - C1[0]) / L0, Wv = skVal('skW'), r = Wv > 0 ? Wv / 2 : Math.abs((cur[0] - C1[0]) * nx + (cur[1] - C1[1]) * ny); line2(P([C1[0] + nx * r, C1[1] + ny * r]), P([C2[0] + nx * r, C2[1] + ny * r]), PV, 2); line2(P([C1[0] - nx * r, C1[1] - ny * r]), P([C2[0] - nx * r, C2[1] - ny * r]), PV, 2); } }
    }
    if (cur && sk.snap) {
      const q = P(cur), k = sk.snap.kind;
      if (k && k !== 'grid') { ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 2; ctx.strokeRect(q[0] - 6, q[1] - 6, 12, 12); if (k === 'mid' || k === 'on') { ctx.fillStyle = '#ffe14a'; ctx.font = 'bold 11px Arial'; ctx.fillText(k === 'mid' ? 'M' : '◦', q[0] + 9, q[1] - 8); } }
      else { line2([q[0] - 6, q[1]], [q[0] + 6, q[1]], '#ffe14a', 1.5); line2([q[0], q[1] - 6], [q[0], q[1] + 6], '#ffe14a', 1.5); }
    }
    const an = sk.an, reg = skRegions(core.skFlat(m));
    label(12, H - 86, (cur ? 'U ' + f2(cur[0]) + '   V ' + f2(cur[1]) + ' mm   ·   ' : '') + (an ? (an.dof ? L('Còn ', '') + an.dof + L(' bậc tự do (nét xanh = chưa ràng buộc đủ)', ' degrees of freedom left (blue = not fully defined)') : L('Đã ràng buộc đủ', 'Fully defined')) : '') +
      (reg.regions.length ? '   ·   ' + reg.regions.length + L(' biên dạng kín', ' closed profiles') : '') + (reg.open ? '   ·   ' + reg.open + L(' nét hở', ' open') : ''));
  }
  // ---------- keys ----------
  const SK_KEYS = { KeyL: 'line', KeyR: 'rect', KeyC: 'circle', KeyA: 'arc', KeyG: 'tarc', KeyP: 'point', KeyT: 'trim', KeyO: 'offset', KeyD: 'dim', KeyS: 'select' };
  const SK_CKEYS = { KeyI: 'coinc', KeyH: 'h', KeyV: 'v', KeyE: 'eq', KeyB: 'par' };
  function sketchKey(e, typing) {
    const sk = S.sk;
    if (e.key === 'Escape') { skDimEditEnd(false); if (sk.pts.length || sk.pend.length) { skFlush(); sk.pend = []; sk.dimPrev = null; sk.sel.clear(); } else if (sk.cmode) { sk.cmode = null; skSetTool('select'); } else if (sk.sel.size) sk.sel.clear(); else skSetTool('select'); dirty = true; return true; }
    if (e.key === 'Enter') { if (e.target === $('skDimIn')) { e.preventDefault(); skDimEditEnd(true); return true; } if (sk.mouse && sk.pts.length) skClick(sk.mouse[0], sk.mouse[1], e); if (typing) e.target.blur(); return true; }
    if (typing) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { skDeleteSel(); return true; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); $('skUndo').click(); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (keymap.normal && comboOf(e) === keymap.normal) { normalView(); return true; }
    if (e.code === 'KeyQ') { skToggleCons(); return true; }
    if (!e.shiftKey && SK_KEYS[e.code]) { skSetTool(SK_KEYS[e.code]); return true; }
    if (!e.shiftKey && SK_CKEYS[e.code]) { skConsButton(SK_CKEYS[e.code]); return true; }
    if (e.code === 'Space') { e.preventDefault(); sk.sel.clear(); dirty = true; return true; }
    return false;
  }
  function skDeleteSel() {
    const sk = S.sk, items = Array.from(sk.sel).map(kOf);
    if (!items.length) { flash(L('Chọn điểm / nét / ràng buộc cần xóa trước', 'Select what to delete first')); return; }
    skChange(function (m) {
      const cs = items.filter(function (o) { return o.k === 'c'; }).map(function (o) { return o.i; }).sort(function (a, b) { return b - a; });
      for (const i of cs) m.cons.splice(i, 1);
      const es = new Set(items.filter(function (o) { return o.k === 'e'; }).map(function (o) { return o.i; }));
      for (const o of items) if (o.k === 'p') m.ents.forEach(function (e, i) { if (entPts(e).indexOf(o.i) >= 0) es.add(i); });
      core.skDeleteEnts(m, Array.from(es));
    });
    sk.sel.clear();
  }
  function skToggleCons() {
    const sk = S.sk, es = Array.from(sk.sel).map(kOf).filter(function (o) { return o.k === 'e'; });
    if (!es.length) { flash(L('Chọn nét cần chuyển thành / bỏ nét dựng (construction) trước', 'Select entities to toggle construction first')); return; }
    skChange(function (m) { for (const o of es) if (m.ents[o.i].t !== 'point') m.ents[o.i].cons = !m.ents[o.i].cons; });
  }
  function skConsButton(type) {
    const sk = S.sk;
    if (sk.tool !== 'select') { const keep = sk.sel; skSetTool('select'); sk.sel = keep; }
    if (sk.sel.size && skConstrain(type)) { dirty = true; return; }
    sk.cmode = type;
    document.querySelectorAll('#sktools [data-cn]').forEach(function (b) { b.classList.toggle('on', b.dataset.cn === type); });
    flash(L(SK_CONS[type][0], SK_CONS[type][1]) + L(' (Esc để thoát)', ' (Esc to stop)'), true);
    dirty = true;
  }
  canvas.addEventListener('dblclick', function (e) {
    const sk = S.sk;
    if (!sk) return;
    if (sk.tool === 'line') { skFlush(); dirty = true; return; }
    const p = evPos(e), it = skItemAt(p[0], p[1]);
    if (it && it[0] === 'c' && core.SK_DIMS[sk.m.cons[+it.slice(1)].t]) skDimEdit(+it.slice(1));
  });
  $('skDimIn').addEventListener('blur', function () { skDimEditEnd(true); });
  document.querySelectorAll('#sktools [data-sk]').forEach(function (b) { b.addEventListener('click', function () { if (!S.sk) return; if (b.dataset.sk === 'mirror') { const keep = S.sk.sel; skSetTool('mirror'); S.sk.sel = keep; } else skSetTool(b.dataset.sk); }); });
  document.querySelectorAll('#sktools [data-cn]').forEach(function (b) { b.addEventListener('click', function () { if (S.sk) skConsButton(b.dataset.cn); }); });
  $('skUndo').addEventListener('click', function () { const sk = S.sk; if (sk && sk.hist.length) { sk.m = JSON.parse(sk.hist.pop()); sk.pts = []; sk.sel.clear(); skAnalyseNow(); dirty = true; } });
  $('skDel').addEventListener('click', function () { if (S.sk) skDeleteSel(); });
  $('skCons').addEventListener('click', function () { if (S.sk) skToggleCons(); });
  $('skGrid').addEventListener('change', function () { dirty = true; });
  $('skOk').addEventListener('click', function () { skLeave(true); });
  $('skCancel').addEventListener('click', function () { skLeave(false); });
  $('bSketch').addEventListener('click', function () { startSketchCmd(); });
  function startSketchCmd() {
    if (blocked() || S.sk) return;
    closeFeature(); closeDlg();
    const el = $('skplane'); el.style.display = el.style.display === 'block' ? 'none' : 'block'; $('skEdit').disabled = !S.skSel;
  }
  document.querySelectorAll('#skplane [data-pl]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.dataset.pl;
      $('skplane').style.display = 'none';
      if (k === 'x') return;
      if (k === 'edit') { const s = sketchById(S.skSel); if (s) editSketch(s); return; }
      if (k === 'pick') { setTool('select'); S.tool = 'skplane'; canvas.style.cursor = 'crosshair'; flash(L('Bấm vào một mặt phẳng của mesh để đặt mặt vẽ', 'Click a flat face of a mesh to put the sketch plane on it'), true); return; }
      skEnter(SK_PLANES[k]);
    });
  });
