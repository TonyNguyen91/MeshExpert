
  // ================= reference geometry: points, lines, planes, axes made in the 3D view =================
  // Each lives in world coordinates: {id, type, name, p, p2 (line / axis end), n, u, size (plane), base, off, flip, vis}.
  S.gax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  S.geos = []; S.geoSeq = 1; S.geoSel = null; S.geoPick = []; S.geoPlane = null; S.geoMode = { gline: 'pp', gplane: 'face' }; S.axPick = null; S.geoSet = new Set(); S.gl = { act: 0, v: {} };
  const GEO_COL = { point: '#ff7ad9', line: '#ffd166', axis: '#c58bff', plane: '#78c8ff' };
  const GEO_PFX = { point: 'P', line: 'L', axis: 'A', plane: 'PL' };
  const geoById = function (id) { return S.geos.filter(function (g) { return g.id === id; })[0] || null; };
  function geoAdd(g) {
    pushUndo();
    g.id = S.geoSeq++; g.vis = true;
    g.name = GEO_PFX[g.type] + (S.geos.filter(function (o) { return o.type === g.type; }).length + 1);
    S.geos.push(g); S.geoSel = g.id; S.skSel = null;
    updateSketchList(); dirty = true;
    flash(L('Đã tạo ', 'Created ') + g.name, false);
    return g;
  }
  function deleteGeo(id) { deleteGeos([id]); }
  function deleteGeos(ids) {
    const k = new Set(ids), n = S.geos.filter(function (o) { return k.has(o.id); }).length;
    if (!n) return;
    pushUndo(); S.geos = S.geos.filter(function (o) { return !k.has(o.id); });
    if (k.has(S.geoSel)) S.geoSel = null; for (const i of ids) S.geoSet.delete(i);
    updateSketchList(); dirty = true; flash(L('Đã xóa ', 'Deleted ') + n + ' geometry', false);
  }
  const geoIsSel = function (g) { return S.geoSet.has(g.id) || g.id === S.geoSel; };
  function geoSelList() { const k = new Set(S.geoSet); if (S.geoSel) k.add(S.geoSel); return S.geos.filter(function (g) { return k.has(g.id); }); }
  function geoSelOnly(ids) { S.geoSet = new Set(ids); S.geoSel = ids.length ? ids[ids.length - 1] : null; if (ids.length) S.skSel = null; updateSketchList(); dirty = true; }
  function hideGeos(list) { if (!list.length) return; pushUndo(); for (const g of list) g.vis = false; S.geoSet.clear(); S.geoSel = null; updateSketchList(); dirty = true; flash(L('Đã ẩn ', 'Hidden: ') + list.length + L(' geometry (hiện lại ở danh sách Sketches / Geos)', ' geometry (show again in the Sketches / Geos list)'), false); }
  // ---------- the world origin as geometry to snap to: point O, the X / Y / Z axes and the three base planes ----------
  const ORG_PL = [['XY (Top)', [0, 0, 1], [1, 0, 0]], ['XZ (Front)', [0, -1, 0], [1, 0, 0]], ['YZ (Right)', [1, 0, 0], [0, 1, 0]]];
  function originGeos() {
    if (!$('cAxes').checked) return [];
    const Ln = originLn(), out = [{ id: 'oO', origin: true, type: 'point', p: [0, 0, 0], name: L('Gốc O', 'Origin O') }];
    for (let i = 0; i < 3; i++) out.push({ id: 'oA' + i, origin: true, type: 'axis', p: [0, 0, 0], p2: V.mul(AXES[i], Ln), name: L('Trục ', 'Axis ') + 'XYZ'[i] });
    ORG_PL.forEach(function (q, i) {
      const n = q[1], u = q[2], v = V.cross(n, u), sz = Ln * 0.46, c = Ln * 0.32;
      out.push({ id: 'oP' + i, origin: true, type: 'plane', n: n, u: u, size: sz, p: V.add(V.mul(u, c), V.mul(v, c)), org: [0, 0, 0], short: q[0].split(' ')[0], name: L('Mặt ', 'Plane ') + q[0] });
    });
    return out;
  }
  function originLn() { return 90 * 2 * mainCam.zoom / H; }   // a fixed size on screen (90 px), whatever the zoom
  const snapGeos = function () { return S.geos.concat(originGeos()); };
  function planeCorners(g) {
    const u = g.u, v = V.cross(g.n, u), s = g.size / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) { return V.add(g.p, V.add(V.mul(u, k[0] * s), V.mul(v, k[1] * s))); });
  }
  const anyPerp = function (n) { return V.norm(V.cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); };
  // ---------- drawing ----------
  function drawGeos() {
    for (const g of originGeos()) {                          // the base planes, small and faint, by the origin axes
      if (g.type !== 'plane') continue;
      const q = planeCorners(g).map(project);
      ctx.fillStyle = 'rgba(160,190,220,0.07)'; ctx.beginPath(); q.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill();
      ctx.setLineDash([4, 3]); poly2(q.concat([q[0]]), 'rgba(170,200,230,0.55)', 1); ctx.setLineDash([]);
      const lp = q[2]; ctx.font = '10px "Segoe UI", Arial'; ctx.fillStyle = 'rgba(190,210,235,0.75)'; ctx.fillText(g.short, lp[0] + 3, lp[1] - 3);
    }
    for (const g of S.geos) {
      if (g.vis === false) continue;
      const sel = geoIsSel(g), col = sel ? '#ffffff' : GEO_COL[g.type];
      let lp;
      if (g.type === 'point') { const q = project(g.p); line2([q[0] - 6, q[1]], [q[0] + 6, q[1]], col, 1.5); line2([q[0], q[1] - 6], [q[0], q[1] + 6], col, 1.5); dot2(q, col, sel ? 4 : 3); lp = q; }
      else if (g.type === 'line' || g.type === 'axis') {
        const a = project(g.p), b = project(g.p2);
        ctx.setLineDash(g.type === 'axis' ? [10, 3, 2, 3] : []); line2(a, b, col, sel ? 2.6 : 1.8); ctx.setLineDash([]);
        if (g.type === 'line') { dot2(a, col, 2.5); dot2(b, col, 2.5); }
        lp = b;
      } else if (g.type === 'plane') {
        const q = planeCorners(g).map(project);
        ctx.fillStyle = sel ? 'rgba(255,255,255,0.10)' : 'rgba(120,200,255,0.10)'; ctx.beginPath(); q.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill();
        poly2(q.concat([q[0]]), col, sel ? 2 : 1.2);
        const c = project(g.p), e = project(V.add(g.p, V.mul(g.n, g.size * 0.18)));
        line2(c, e, col, 1.2); dot2(e, col, 2);
        lp = q[2];
      }
      ctx.font = '11px "Segoe UI", Arial'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,14,0.85)'; ctx.strokeText(g.name, lp[0] + 6, lp[1] - 6); ctx.fillStyle = col; ctx.fillText(g.name, lp[0] + 6, lp[1] - 6);
    }
    for (const p of S.geoPick) { const q = project(p); dot2(q, '#14181d', 6); dot2(q, '#ffcf5a', 4.5); }
    if (S.geoPlane) { const q = project(S.geoPlane.p), e = project(V.add(S.geoPlane.p, V.mul(S.geoPlane.n, sceneSize() * 0.2))); line2(q, e, '#ffcf5a', 2); dot2(q, '#ffcf5a', 4.5); }
    if (S.tool === 'gline') drawGlPicks();
  }
  // ---------- picking a geometry under the cursor (as the selection filter allows) ----------
  // opt.thru === false: the origin items count only where no body is in front (the measuring tools)
  function geoAt(px, py, opt) {
    const F = S.flt, thru = !opt || opt.thru !== false;
    let best = null, bd = 9, mh;
    const GS = snapGeos(), w = viewer();
    // the origin items sit behind the meshes: a mesh in front of them at the cursor hides them
    const hidden = function (g, p) { if (!g.origin || thru) return false; if (mh === undefined) mh = pick(px, py) || null; return !!mh && V.dot(mh.point, w) > V.dot(p, w) + 1e-6 * (1 + Math.abs(V.dot(p, w))); };   // otherwise picked through the bodies
    for (const g of GS) {
      if (g.vis === false || g.type !== 'point' || !F.point) continue;
      const q = project(g.p), d = Math.hypot(q[0] - px, q[1] - py);
      if (d < bd && !hidden(g, g.p)) { bd = d; best = { kind: 'point', p: g.p.slice(), at: g.p.slice(), text: g.name, geo: g }; }
    }
    if (F.point) for (const g of S.geos) {                   // ends and midpoint of the lines / axes
      if (g.vis === false || (g.type !== 'line' && g.type !== 'axis')) continue;
      const cand = [[g.p, L(' · đầu', ' · start')], [g.p2, L(' · cuối', ' · end')], [V.mul(V.add(g.p, g.p2), 0.5), L(' · giữa', ' · mid')]];
      for (const c of cand) { const q = project(c[0]), d = Math.hypot(q[0] - px, q[1] - py); if (d < Math.min(bd, 7)) { bd = d; best = { kind: 'point', p: c[0].slice(), at: c[0].slice(), text: g.name + c[1], geo: g, sub: 'vtx' }; } }
    }
    if (best) return best;
    bd = 6;
    for (const g of GS) {
      if (g.vis === false || (g.type === 'line' ? !F.line : g.type === 'axis' ? !(F.axis || F.line) : true)) continue;
      const a = project(g.p), b = project(g.p2), ax = b[0] - a[0], ay = b[1] - a[1], l2 = ax * ax + ay * ay;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - a[0]) * ax + (py - a[1]) * ay) / l2)) : 0, d = Math.hypot(px - a[0] - t * ax, py - a[1] - t * ay);
      const at0 = V.add(g.p, V.mul(V.sub(g.p2, g.p), t));
      if (d < bd && !hidden(g, at0)) {
        bd = d; const dir = V.norm(V.sub(g.p2, g.p)), at = at0;
        best = { kind: 'edge', sub: 'line', pts: [g.p.slice(), g.p2.slice()], dir: dir, len: V.len(V.sub(g.p2, g.p)), p: g.p.slice(), at: at, lines: [[g.p, g.p2]], text: g.name, geo: g };
      }
    }
    if (best || !F.plane) return best;
    for (const g of GS) {
      if (g.vis === false || g.type !== 'plane') continue;
      const q = planeCorners(g).map(project);
      let inside = false;
      for (let i = 0, j = 3; i < 4; j = i++) { const a = q[i], b = q[j]; if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; }
      let edge = false;                                     // inside the square: only where no mesh is in the way, or right on its border
      for (let i = 0, j = 3; i < 4; j = i++) { const a = q[j], b = q[i], ax = b[0] - a[0], ay = b[1] - a[1], l2 = ax * ax + ay * ay, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - a[0]) * ax + (py - a[1]) * ay) / l2)) : 0; if (Math.hypot(px - a[0] - t * ax, py - a[1] - t * ay) < 6) edge = true; }
      if (!edge && (!inside || ((!g.origin || !thru) && pick(px, py)))) continue;
      const r = screenRay(px, py), dn = V.dot(r.d, g.n);
      const at = Math.abs(dn) > 1e-9 ? V.add(r.o, V.mul(r.d, V.dot(V.sub(g.p, r.o), g.n) / dn)) : g.p.slice();
      if (hidden(g, at)) continue;
      return { kind: 'plane', n: g.n.slice(), p: at, at: at, lines: [planeCorners(g).concat([planeCorners(g)[0]])], text: g.name, geo: g };
    }
    return null;
  }
  // a geometry, else what the mesh offers under the cursor (null when the filter allows nothing there)
  function pickEnt(px, py, allowFree) {
    const g = geoAt(px, py);
    if (g) return g;
    const h = pickNear(px, py);
    if (!h) return null;
    const e = entityAt(h, px, py, false);
    if (e.free && (!allowFree || e.blocked)) return null;
    e.bname = h.body.name;
    return e;
  }
  // the point a pick stands for
  function entPoint(e) {
    if (e.kind === 'point') return e.p;
    if (e.kind === 'edge' && e.sub === 'arc' && e.c && S.flt.center) return e.c;
    return e.at;
  }
  const ptEnt = function (e) { const p = entPoint(e); return { kind: 'point', p: p, at: p, text: e.kind === 'point' ? e.text : L('Điểm', 'Point'), lines: e.lines }; };
  // ---------- the tools ----------
  function geoToolEnt(t, px, py) {
    const e = pickEnt(px, py, true);
    if (!e) return null;
    const m = S.geoMode, n = S.geoPick.length;
    if (t === 'gplane' && m.gplane === 'face') return e.kind === 'plane' ? e : null;
    if (t === 'gline') { const r = glTarget(e); return r ? r.show : null; }
    if (t === 'gaxis' && !n && (e.kind === 'cyl' || (e.kind === 'edge' && (e.sub === 'line' || (e.sub === 'arc' && e.n))))) return e;
    return ptEnt(e);
  }
  function sceneSize() { return Math.max(10, mainCam.radius * 0.45); }
  function geoToolClick(t, px, py) {
    const e = geoToolEnt(t, px, py), m = S.geoMode;
    if (!e) { flash(L('Không có gì hợp lệnh / bộ lọc ở chỗ này', 'Nothing here fits the command / filter')); return; }
    if (t === 'gpoint') { geoAdd({ type: 'point', p: e.p.slice() }); return; }
    if (t === 'gplane' && m.gplane === 'face') {
      const n = V.norm(e.n), g = { type: 'plane', base: { p: e.at.slice(), n: n }, off: +$('geoOff').value || 0, flip: $('geoFlip').checked, size: sceneSize(), u: anyPerp(n) };
      planeFromBase(g); geoAdd(g); return;
    }
    if (t === 'gline') { glClick(pickEnt(px, py, true)); return; }
    if (t === 'gaxis' && e.kind !== 'point') {
      let c, d, len;
      if (e.kind === 'cyl') {
        c = e.c; d = V.norm(e.dir); let t0 = Infinity, t1 = -Infinity;
        for (const l of e.lines || []) for (const q of l) { const s = V.dot(V.sub(q, c), d); t0 = Math.min(t0, s); t1 = Math.max(t1, s); }
        if (!(t1 > t0)) { t0 = -e.r * 2; t1 = e.r * 2; }
        const ext = (t1 - t0) * 0.15; geoAdd({ type: 'axis', p: V.add(c, V.mul(d, t0 - ext)), p2: V.add(c, V.mul(d, t1 + ext)) }); return;
      }
      if (e.sub === 'arc') { c = e.c; d = V.norm(e.n); len = Math.max(e.r * 3, sceneSize() * 0.3); geoAdd({ type: 'axis', p: V.sub(c, V.mul(d, len / 2)), p2: V.add(c, V.mul(d, len / 2)) }); return; }
      const a = e.pts[0], b = e.pts[e.pts.length - 1], ext = V.mul(V.sub(b, a), 0.15);
      geoAdd({ type: 'axis', p: V.sub(a, ext), p2: V.add(b, ext) }); return;
    }
    // point picks: plane (3), axis (2)
    S.geoPick.push(e.p.slice()); dirty = true;
    const need = t === 'gplane' ? 3 : 2;
    if (S.geoPick.length < need) { flash(L('Điểm ', 'Point ') + S.geoPick.length + '/' + need, true); return; }
    const P = S.geoPick; S.geoPick = [];
    if (t === 'gplane') {
      const n = V.cross(V.sub(P[1], P[0]), V.sub(P[2], P[0]));
      if (V.len(n) < 1e-9) { flash(L('3 điểm thẳng hàng: không dựng được mặt phẳng', 'The 3 points are in a line: no plane')); return; }
      const c = V.mul(V.add(V.add(P[0], P[1]), P[2]), 1 / 3), sz = Math.max(V.len(V.sub(P[1], P[0])), V.len(V.sub(P[2], P[0])), V.len(V.sub(P[2], P[1]))) * 1.4;
      geoAdd({ type: 'plane', p: c, n: V.norm(n), u: V.norm(V.sub(P[1], P[0])), size: Math.max(sz, 1) }); return;
    }
    if (V.len(V.sub(P[1], P[0])) < 1e-9) { flash(L('Hai điểm trùng nhau', 'The two points are the same')); return; }
    geoAdd({ type: t === 'gaxis' ? 'axis' : 'line', p: P[0], p2: P[1] });
  }
  // ---------- Line: three ways, each with its own pick boxes ----------
  // pp: start point → end point · ppl: point + plane, normal to the plane · pv: start point + a direction (edge, axis, plane normal)
  const GL_SLOTS = {
    pp: [['a', 'pt', 'Điểm đầu', 'Start point'], ['b', 'pt', 'Điểm cuối', 'End point']],
    ppl: [['pt', 'pt', 'Điểm', 'Point'], ['pl', 'plane', 'Mặt phẳng (line vuông góc mặt này)', 'Plane (the line is normal to it)']],
    pv: [['pt', 'pt', 'Điểm đầu', 'Start point'], ['v', 'vec', 'Hướng: cạnh thẳng / trục / pháp tuyến mặt', 'Direction: straight edge / axis / plane normal']]
  };
  const GL_HINT = {
    pp: ['Dài = 0: line nối đúng 2 điểm. Nhập độ dài: line đi từ điểm đầu về phía điểm cuối, dài đúng số đó.', 'Length 0: the line joins the 2 points. A length: from the start point towards the end point, that long.'],
    ppl: ['Dài = 0: line đi từ điểm xuống tới mặt phẳng. Nhập độ dài: dài đúng số đó (Đảo chiều để quay hướng).', 'Length 0: from the point down to the plane. A length: that long (Flip turns it round).'],
    pv: ['Line đi từ điểm đầu theo hướng đã chọn, dài đúng số đã nhập (Đảo chiều để quay hướng).', 'From the start point along the picked direction, as long as typed (Flip turns it round).']
  };
  const glSlots = function () { return GL_SLOTS[S.geoMode.gline] || GL_SLOTS.pp; };
  function glAccept(e, kind) {
    if (!e) return null;
    if (kind === 'pt') { const q = ptEnt(e); return { val: { p: q.p.slice(), text: q.text || L('Điểm', 'Point') }, show: q }; }
    if (kind === 'plane') return e.kind === 'plane' ? { val: { p: e.p.slice(), n: V.norm(e.n), text: e.text || L('Mặt phẳng', 'Plane') }, show: e } : null;
    e = lineOfVtx(e);
    const d = axDir(e);
    return d ? { val: { d: V.norm(d), at: (e.at || e.p).slice(), text: (e.text || L('Hướng', 'Direction')) + (e.kind === 'plane' ? L(' (pháp tuyến)', ' (normal)') : '') }, show: e } : null;
  }
  // which box a click on this entity fills: the active one, else the next free one that takes it
  function glTarget(e) {
    if (!e) return null;
    const sl = glSlots(), v = S.gl.v, order = [];
    if (S.geoMode.gline === 'ppl' && e.kind === 'plane' && !v.pl) order.push(1);   // a plane goes to the plane box, picked first or second
    order.push(S.gl.act);
    for (let i = 0; i < sl.length; i++) if (!v[sl[i][0]]) order.push(i);
    for (const i of order) { if (i == null || i >= sl.length) continue; const r = glAccept(e, sl[i][1]); if (r) { r.i = i; return r; } }
    return null;
  }
  function glClick(e) {
    const r = glTarget(e), sl = glSlots();
    if (!r) { flash(L('Ô đang chọn cần: ', 'The active box needs: ') + L(sl[S.gl.act][2], sl[S.gl.act][3]), true); return; }
    const g0 = geoById(S.geoSel); if (g0 && g0.type === 'line') S.geoSel = null;   // a new line from here on, not an edit of the last one
    S.gl.v[sl[r.i][0]] = r.val;
    let nx = -1; for (let k = 1; k <= sl.length; k++) { const j = (r.i + k) % sl.length; if (!S.gl.v[sl[j][0]]) { nx = j; break; } }
    S.gl.act = nx < 0 ? r.i : nx;
    glPanel(); dirty = true;
    flash(glReady() ? L('Đủ rồi: chỉnh độ dài / đảo chiều nếu cần, rồi bấm "Tạo line" hoặc Enter', 'Ready: set the length / flip if needed, then press "Create line" or Enter') : L('Giờ chọn: ', 'Now pick: ') + L(sl[S.gl.act][2], sl[S.gl.act][3]), true);
  }
  const glReady = function () { return glSlots().every(function (q) { return !!S.gl.v[q[0]]; }); };
  function glBase() {
    const m = S.geoMode.gline, v = S.gl.v;
    if (m === 'pp') { const d = V.sub(v.b.p, v.a.p); if (V.len(d) < 1e-9) return null; return { p: v.a.p.slice(), f: v.b.p.slice(), d: V.norm(d) }; }
    if (m === 'ppl') { const p = v.pt.p, pl = v.pl, f = V.sub(p, V.mul(pl.n, V.dot(V.sub(p, pl.p), pl.n))), to = V.sub(f, p); return { p: p.slice(), f: f, d: V.len(to) > 1e-6 ? V.norm(to) : pl.n.slice() }; }
    return { p: v.pt.p.slice(), f: null, d: v.v.d.slice() };
  }
  // the ends from the base and the Length / Flip fields (length 0 = to the end point / plane)
  function lineFromBase(g, quiet) {
    const Ln = +$('geoLen').value || 0, fl = $('geoLFlip').checked, d = fl ? V.mul(g.lb.d, -1) : g.lb.d;
    g.lb.len = Ln; g.lb.flip = fl;
    if (Ln > 0) { g.p = g.lb.p.slice(); g.p2 = V.add(g.lb.p, V.mul(d, Ln)); return true; }
    if (!g.lb.f) { if (!quiet) flash(L('Hãy nhập độ dài cho line', 'Type a length for the line')); return false; }
    if (V.len(V.sub(g.lb.f, g.lb.p)) < 1e-6) { if (!quiet) flash(L('Điểm nằm trên mặt phẳng: hãy nhập độ dài', 'The point lies on the plane: type a length')); dirty = true; return false; }
    g.p = g.lb.p.slice(); g.p2 = g.lb.f.slice(); return true;
  }
  function glMake() {
    if (!glReady()) { const sl = glSlots(); flash(L('Còn thiếu: ', 'Still missing: ') + sl.filter(function (q) { return !S.gl.v[q[0]]; }).map(function (q) { return L(q[2], q[3]); }).join(', '), true); return; }
    const lb = glBase();
    if (!lb) { flash(L('Hai điểm trùng nhau', 'The two points are the same')); return; }
    const g = { type: 'line', lb: lb, mode: S.geoMode.gline };
    if (!lineFromBase(g)) return;
    S.gl = { act: 0, v: {} }; geoAdd(g); glPanel();
  }
  function glPreview() {
    if (!glReady()) return null;
    const lb = glBase(); if (!lb) return null;
    const g = { lb: lb }; return lineFromBase(g, true) ? g : null;
  }
  function drawGlPicks() {
    const v = S.gl.v, PC = '#ffcf5a', sl = glSlots();
    sl.forEach(function (q, i) {
      const x = v[q[0]]; if (!x) return;
      const lbl = String(i + 1);
      if (q[1] === 'pt') { const c = project(x.p); dot2(c, '#14181d', 7); dot2(c, PC, 5); tag(c[0] + 12, c[1] - 12, lbl, '#14181d', PC); }
      else { const o = x.at || x.p, dir = x.d || x.n, c = project(o), e = project(V.add(o, V.mul(dir, sceneSize() * 0.2))); arrow2(c, e, PC, 10, 4); line2(c, e, PC, 2); tag(e[0] + 10, e[1] - 10, lbl, '#14181d', PC); }
    });
    const g = glPreview();
    if (g) { const a = project(g.p), b = project(g.p2); ctx.setLineDash([7, 4]); line2(a, b, '#ffe14a', 2.2); ctx.setLineDash([]); dot2(a, '#ffe14a', 3); dot2(b, '#ffe14a', 3); const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; tag(m[0], m[1] - 14, f2(V.len(V.sub(g.p2, g.p))) + ' mm', '#14181d', '#ffe14a'); }
  }
  // title bar of the small tool panel: drag it anywhere, collapse it, double-click to put it back
  function tpHead(t) {
    const n = { move: ['Di chuyển', 'Move'], rotate: ['Xoay', 'Rotate'], scale: ['Tỉ lệ', 'Scale'], mate: ['Ghép mặt / trục', 'Mate'], gpoint: ['Point', 'Point'], gline: ['Line', 'Line'], gplane: ['Plane', 'Plane'], gaxis: ['Axis', 'Axis'] }[t];
    if (n) $('tpTitle').textContent = L(n[0], n[1]);
    tpClamp();
  }
  function tpSave() {
    const p = $('tpop');
    try { localStorage.setItem('mx.tpop', JSON.stringify({ l: p.style.left, t: p.style.top, m: p.classList.contains('min') })); } catch (e) { }
  }
  function tpClamp() {
    const p = $('tpop'), par = p.offsetParent; if (!par || p.style.display === 'none') return;
    const l = Math.max(0, Math.min(par.clientWidth - p.offsetWidth - 2, p.offsetLeft)), t = Math.max(0, Math.min(par.clientHeight - 24, p.offsetTop));
    p.style.left = l + 'px'; p.style.top = t + 'px';
  }
  (function () {
    const p = $('tpop'), hd = $('tpHd'), mb = $('tpMin');
    try { const s = JSON.parse(localStorage.getItem('mx.tpop') || 'null'); if (s) { if (s.l) p.style.left = s.l; if (s.t) p.style.top = s.t; p.classList.toggle('min', !!s.m); } } catch (e) { }
    mb.textContent = p.classList.contains('min') ? '▸' : '▾';
    mb.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    mb.addEventListener('click', function (e) {
      e.stopPropagation(); p.classList.toggle('min'); mb.textContent = p.classList.contains('min') ? '▸' : '▾'; tpSave();
    });
    let dr = null;
    hd.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
      dr = { x: e.clientX, y: e.clientY, l: p.offsetLeft, t: p.offsetTop, w: p.offsetWidth };
    });
    window.addEventListener('mousemove', function (e) {
      if (!dr) return;
      const par = p.offsetParent, W = par ? par.clientWidth : innerWidth, H = par ? par.clientHeight : innerHeight;
      p.style.left = Math.max(0, Math.min(W - dr.w - 2, dr.l + e.clientX - dr.x)) + 'px';
      p.style.top = Math.max(0, Math.min(H - 24, dr.t + e.clientY - dr.y)) + 'px';
    });
    window.addEventListener('mouseup', function () { if (dr) { dr = null; tpSave(); } });
    hd.addEventListener('dblclick', function (e) { if (e.target === mb) return; p.style.left = ''; p.style.top = ''; tpSave(); });
    window.addEventListener('resize', tpClamp);
  })();
  // the pick boxes of the Line panel
  function glPanel() {
    const box = $('geoSlots'); if (!box) return;
    box.innerHTML = '';
    glSlots().forEach(function (q, i) {
      const x = S.gl.v[q[0]], d = document.createElement('div');
      d.className = 'gslot' + (S.gl.act === i ? ' act' : '') + (x ? ' ok' : ''); d.dataset.slot = i;
      d.innerHTML = '<span class="gn">' + (i + 1) + '</span><span class="gk"></span><span class="gv' + (x ? '' : ' empty') + '"></span>' + (x ? '<span class="gx" title="Bỏ">✕</span>' : '');
      d.querySelector('.gk').textContent = L(q[2], q[3]);
      d.querySelector('.gv').textContent = x ? x.text : (S.gl.act === i ? L('← bấm trên màn hình 3D', '← click in the 3D view') : L('(chưa chọn)', '(not picked)'));
      d.title = d.querySelector('.gk').textContent + ': ' + d.querySelector('.gv').textContent;
      d.addEventListener('click', function (ev) {
        if (ev.target.classList.contains('gx')) delete S.gl.v[q[0]];
        S.gl.act = i; glPanel(); dirty = true;
      });
      box.appendChild(d);
    });
    $('geoLenRow').title = L.apply(null, GL_HINT[S.geoMode.gline] || GL_HINT.pp);
    $('geoMake').disabled = !glReady();
  }
  $('geoMake').addEventListener('click', glMake);
  $('geoClr').addEventListener('click', function () { S.gl = { act: 0, v: {} }; glPanel(); dirty = true; });
  window.addEventListener('keydown', function (e) {
    if (S.tool !== 'gline' || e.key !== 'Enter' || S.sk) return;
    const tg = (e.target.tagName || '').toLowerCase();
    if (tg === 'textarea' || (tg === 'input' && e.target.id !== 'geoLen')) return;
    e.preventDefault(); glMake();
  });
  function planeFromBase(g) {
    const n = g.flip ? V.mul(g.base.n, -1) : g.base.n;
    g.n = n.slice(); g.p = V.add(g.base.p, V.mul(g.base.n, g.off || 0));
  }
  function geoToolUI(t) {
    const box = $('geoModes'), m = S.geoMode, opts = t === 'gline' ? [['pp', 'Điểm – Điểm', 'Point – Point'], ['ppl', 'Điểm – Mặt (vuông góc)', 'Point – Plane (normal)'], ['pv', 'Điểm – Vector', 'Point – Vector']] : t === 'gplane' ? [['face', 'Theo mặt', 'On face'], ['3p', '3 điểm', '3 points']] : [];
    box.innerHTML = '';
    for (const o of opts) {
      const b = document.createElement('button'); b.textContent = L(o[1], o[2]); b.className = m[t] === o[0] ? 'primary' : ''; b.dataset.gm = o[0];
      b.addEventListener('click', function () {
        m[t] = o[0]; S.geoPick = []; S.gl = { act: 0, v: {} };
        if (t === 'gline' && o[0] === 'pv' && !(+$('geoLen').value > 0)) { $('geoLen').value = 20; $('geoLenR').value = 20; }
        geoToolUI(t); dirty = true;
      });
      box.appendChild(b);
    }
    $('geoPlaneOpt').style.display = t === 'gplane' && m.gplane === 'face' ? 'flex' : 'none';
    $('geoLineOpt').style.display = t === 'gline' ? 'block' : 'none'; S.geoPlane = null;
    $('tpGeo').style.maxWidth = t === 'gline' ? '390px' : '';
    const sp = geoById(S.geoSel);
    if (t === 'gplane' && sp && sp.base) { $('geoOff').value = sp.off || 0; $('geoOffR').value = sp.off || 0; $('geoFlip').checked = !!sp.flip; }
    if (t === 'gline' && sp && sp.lb && sp.lb.len !== undefined) { $('geoLen').value = sp.lb.len; $('geoLenR').value = Math.min(200, sp.lb.len); $('geoLFlip').checked = !!sp.lb.flip; }
    if (t === 'gline') glPanel();
  }
  // offset / flip change the selected plane made on a face
  function geoPlaneEdit(fromRange) {
    if (fromRange) $('geoOff').value = $('geoOffR').value; else $('geoOffR').value = $('geoOff').value;
    const g = geoById(S.geoSel);
    if (!g || !g.base) return;
    g.off = +$('geoOff').value || 0; g.flip = $('geoFlip').checked; planeFromBase(g); dirty = true;
  }
  // length / flip change the selected normal line
  function geoLineEdit(fromRange) {
    if (fromRange) $('geoLen').value = $('geoLenR').value; else $('geoLenR').value = $('geoLen').value;
    const g = geoById(S.geoSel);
    if (g && g.lb) lineFromBase(g);
    if (S.tool === 'gline') glPanel();
    dirty = true;
  }
  $('geoLen').addEventListener('input', function () { geoLineEdit(false); });
  $('geoLenR').addEventListener('input', function () { geoLineEdit(true); });
  $('geoLFlip').addEventListener('change', function () { geoLineEdit(false); });
  $('geoOff').addEventListener('input', function () { geoPlaneEdit(false); });
  $('geoOffR').addEventListener('input', function () { geoPlaneEdit(true); });
  $('geoFlip').addEventListener('change', function () { geoPlaneEdit(false); });
  // ---------- the X axis of the move / rotate / scale handles ----------
  function axDir(e) {
    if (e.kind === 'edge' && e.sub === 'line') return e.dir || V.norm(V.sub(e.pts[e.pts.length - 1], e.pts[0]));
    if (e.kind === 'edge' && e.sub === 'arc' && e.n) return e.n;
    if (e.kind === 'cyl') return e.dir;
    if (e.kind === 'plane') return e.n;
    return null;
  }
  // a pick on a line's end / midpoint stands for the line itself where a direction is wanted
  function lineOfVtx(e) {
    if (!e || e.sub !== 'vtx' || !e.geo) return e;
    const g = e.geo;
    return { kind: 'edge', sub: 'line', pts: [g.p.slice(), g.p2.slice()], dir: V.norm(V.sub(g.p2, g.p)), len: V.len(V.sub(g.p2, g.p)), p: g.p.slice(), at: e.p.slice(), lines: [[g.p, g.p2]], text: g.name, geo: g };
  }
  function axPickEnt(px, py) { const e = lineOfVtx(pickEnt(px, py, false)); return e ? (axDir(e) ? e : ptEnt(e)) : null; }
  function showGax() { const x = S.gax[0]; $('axX').value = +f2(x[0], 4); $('axY').value = +f2(x[1], 4); $('axZ').value = +f2(x[2], 4); $('bAxReset').classList.toggle('primary', !gaxWorld()); }
  function axPickClick(px, py) {
    const e = axPickEnt(px, py);
    if (!e) { flash(L('Hãy bấm cạnh, trục, mặt phẳng hoặc 2 điểm (theo bộ lọc)', 'Click an edge, an axis, a plane or 2 points (as the filter allows)')); return; }
    let d = axDir(e);
    if (!d) {
      S.axPick.pts.push(e.p.slice()); S.geoPick = S.axPick.pts.slice(); dirty = true;
      if (S.axPick.pts.length < 2) { flash(L('Bấm điểm thứ hai: trục X đi từ điểm 1 tới điểm 2', 'Click the second point: X runs from point 1 to point 2'), true); return; }
      d = V.sub(S.axPick.pts[1], S.axPick.pts[0]);
      if (V.len(d) < 1e-9) { S.axPick.pts = []; S.geoPick = []; flash(L('Hai điểm trùng nhau', 'The two points are the same')); return; }
    }
    setGaxX(d); S.axPick = null; S.geoPick = []; $('bAxPick').classList.remove('primary'); showGax();
    canvas.style.cursor = toolCursor(); flash(L('Trục X của tay nắm đã theo ', 'The handle X axis now follows ') + (e.text || L('hướng đã chọn', 'the picked direction')), false); dirty = true;
  }
  $('bAxPick').addEventListener('click', function () {
    S.axPick = S.axPick ? null : { pts: [] }; S.geoPick = []; S.pivPick = false; $('bPivPick').classList.remove('primary');
    this.classList.toggle('primary', !!S.axPick); canvas.style.cursor = toolCursor();
    flash(S.axPick ? L('Bấm cạnh thẳng, trục (mặt trụ / cạnh tròn), mặt phẳng (pháp tuyến) hoặc 2 điểm để đặt trục X', 'Click a straight edge, an axis (cylinder / round edge), a plane (its normal) or 2 points to set the X axis') : '', true); dirty = true;
  });
  $('bAxSet').addEventListener('click', function () {
    const v = [+$('axX').value || 0, +$('axY').value || 0, +$('axZ').value || 0];
    if (V.len(v) < 1e-9) { flash(L('Vector trục X phải khác 0', 'The X vector must not be zero')); return; }
    setGaxX(v); showGax(); dirty = true;
  });
  ['axX', 'axY', 'axZ'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('bAxSet').click(); } }); });
  $('bAxReset').addEventListener('click', function () { S.gax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; showGax(); dirty = true; });
  showGax();
  // ---------- the list (under the sketches) ----------
  function appendGeoRows(box) {
    for (const g of S.geos) {
      const row = document.createElement('div');
      row.className = 'srow geo' + (geoIsSel(g) ? ' sel' : '');
      const cv = document.createElement('input'); cv.type = 'checkbox'; cv.checked = g.vis !== false;
      cv.addEventListener('click', function (e) { e.stopPropagation(); });
      cv.addEventListener('change', function () { pushUndo(); g.vis = cv.checked; dirty = true; });
      const nm = document.createElement('span'); nm.className = 'nm'; nm.innerHTML = '<b style="color:' + GEO_COL[g.type] + '">' + { point: '•', line: '／', axis: '┆', plane: '▱' }[g.type] + '</b> ' + g.name;
      const info = document.createElement('span'); info.className = 'num'; info.textContent = { point: L('điểm', 'point'), line: L('đường', 'line'), axis: L('trục', 'axis'), plane: L('mặt phẳng', 'plane') }[g.type];
      row.appendChild(cv); row.appendChild(nm); row.appendChild(info);
      row.addEventListener('click', function (ev) {
        if (ev.ctrlKey || ev.shiftKey) { if (S.geoSet.has(g.id)) S.geoSet.delete(g.id); else S.geoSet.add(g.id); S.geoSel = g.id; S.skSel = null; updateSketchList(); dirty = true; return; }
        geoSelOnly([g.id]); if (S.tool === 'gplane' || S.tool === 'gline') geoToolUI(S.tool);
      });
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault(); if (!S.geoSet.has(g.id)) geoSelOnly([g.id]);
        showMenu([[L('Đổi tên', 'Rename'), function () { const n = prompt(L('Tên:', 'Name:'), g.name); if (n && n.trim()) { pushUndo(); g.name = n.trim().replace(/['\\]/g, ''); updateSketchList(); dirty = true; } }],
          [g.vis !== false ? L('Ẩn', 'Hide') : L('Hiện', 'Show'), function () { pushUndo(); g.vis = g.vis === false; updateSketchList(); dirty = true; }], null,
          [L('Xóa', 'Delete'), function () { deleteGeo(g.id); }]], e.clientX, e.clientY);
      });
      box.appendChild(row);
    }
  }
  // ---------- STEP: the geometry as a wireframe set beside the solids ----------
  function stepNum(v) { if (Math.abs(v) < 1e-12) v = 0; const s = String(+v.toPrecision(15)); return /[.eE]/.test(s) ? s.replace('e', 'E') : s + '.'; }
  function stepAddGeos(txt, geos) {
    const sr = txt.match(/#(\d+)=SHAPE_REPRESENTATION\('[^']*',\(#(\d+)\),#(\d+)\);/);
    if (!sr || !geos.length) return txt;
    let n = 0; txt.replace(/#(\d+)=/g, function (a, k) { n = Math.max(n, +k); return a; }); n++;
    const out = [], items = [], nm = function (s) { return String(s).replace(/[^\x20-\x7e]/g, '_').replace(/'/g, ''); }, ref = function (k) { return '#' + k; };
    const cp = function (p, name) { const id = n++; out.push('#' + id + "=CARTESIAN_POINT('" + nm(name) + "',(" + p.map(stepNum).join(',') + '));'); return id; };
    // a straight segment as a LINE trimmed at its two ends (the form CAD readers take most reliably)
    const seg = function (a, b, name) {
      const L = V.len(V.sub(b, a));
      if (!(L > 1e-9)) return null;
      const d = V.mul(V.sub(b, a), 1 / L), pa = cp(a, ''), pb = cp(b, ''), dir = n++, vec = n++, ln = n++, tc = n++;
      out.push('#' + dir + "=DIRECTION('',(" + d.map(stepNum).join(',') + '));');
      out.push('#' + vec + "=VECTOR('',#" + dir + ',1.);');
      out.push('#' + ln + "=LINE('',#" + pa + ',#' + vec + ');');
      out.push('#' + tc + "=TRIMMED_CURVE('" + nm(name) + "',#" + ln + ',(#' + pa + ',PARAMETER_VALUE(0.)),(#' + pb + ',PARAMETER_VALUE(' + stepNum(L) + ')),.T.,.PARAMETER.);');
      items.push(tc); return tc;
    };
    const cross = $('cStepCross') && $('cStepCross').checked, cs = Math.max(0.5, sceneSize() * 0.02);
    for (const g of geos) {
      if (g.type === 'point') {
        items.push(cp(g.p, g.name));
        if (cross) for (const a of AXES) seg(V.sub(g.p, V.mul(a, cs)), V.add(g.p, V.mul(a, cs)), g.name + '_' + 'XYZ'[AXES.indexOf(a)]);   // readers without points (Onshape) still get the spot
        continue;
      }
      if (g.type === 'plane') { const c = planeCorners(g); for (let k = 0; k < 4; k++) seg(c[k], c[(k + 1) % 4], g.name + '_' + (k + 1)); continue; }
      if (g.type === 'circle' || g.type === 'arc') {         // sketch circles / arcs: a CIRCLE, trimmed for an arc
        const c0 = cp(g.c, ''), dn = n++, du = n++, ax = n++, ci = n++;
        out.push('#' + dn + "=DIRECTION('',(" + g.n.map(stepNum).join(',') + '));');
        out.push('#' + du + "=DIRECTION('',(" + g.u.map(stepNum).join(',') + '));');
        out.push('#' + ax + "=AXIS2_PLACEMENT_3D('',#" + c0 + ',#' + dn + ',#' + du + ');');
        out.push('#' + ci + "=CIRCLE('" + (g.type === 'circle' ? nm(g.name) : '') + "',#" + ax + ',' + stepNum(g.r) + ');');
        if (g.type === 'circle') { items.push(ci); continue; }
        const v = V.cross(g.n, g.u), at = function (a) { return V.add(g.c, V.add(V.mul(g.u, g.r * Math.cos(a)), V.mul(v, g.r * Math.sin(a)))); };
        const pa = cp(at(g.a0), ''), pb = cp(at(g.a1), ''), tc = n++;
        out.push('#' + tc + "=TRIMMED_CURVE('" + nm(g.name) + "',#" + ci + ',(#' + pa + '),(#' + pb + '),.T.,.CARTESIAN.);');
        items.push(tc); continue;
      }
      seg(g.p, g.p2, g.name);
    }
    if (!items.length) return txt;
    const set = n++, rep = n++, rel = n++;
    out.push('#' + set + "=GEOMETRIC_CURVE_SET('Geometry',(" + items.map(ref).join(',') + '));');
    out.push('#' + rep + "=GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION('Geometry',(#" + set + ',#' + sr[2] + '),#' + sr[3] + ');');
    out.push('#' + rel + "=SHAPE_REPRESENTATION_RELATIONSHIP('','',#" + sr[1] + ',#' + rep + ');');
    const k = txt.lastIndexOf('ENDSEC;');
    return txt.slice(0, k) + out.join('\n') + '\n' + txt.slice(k);
  }
  try { const v = localStorage.getItem('mrt_stepcross'); if (v !== null) $('cStepCross').checked = v === '1'; } catch (e) { /* no storage */ }
  $('cStepCross').addEventListener('change', function () { try { localStorage.setItem('mrt_stepcross', this.checked ? '1' : '0'); } catch (e) { /* no storage */ } });
  // a STEP file holding only the geometry
  function stepGeosOnly(geos) {
    const head = ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('MeshExpert geometry'),'2;1');", "FILE_NAME('','',(''),('MeshExpert'),'MeshExpert','MeshExpert','');",
      "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));", 'ENDSEC;', 'DATA;',
      "#1=APPLICATION_CONTEXT('managed model based 3d engineering');", "#2=APPLICATION_PROTOCOL_DEFINITION('international standard','ap242_managed_model_based_3d_engineering',2014,#1);",
      "#3=PRODUCT_CONTEXT('',#1,'mechanical');", "#4=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');", '#5=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));',
      '#6=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));', '#7=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());',
      "#8=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.0001),#5,'distance_accuracy_value','confusion accuracy');",
      "#9=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#8))GLOBAL_UNIT_ASSIGNED_CONTEXT((#5,#6,#7))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'));",
      "#10=CARTESIAN_POINT('',(0.,0.,0.));", "#11=DIRECTION('',(1.,0.,0.));", "#12=DIRECTION('',(0.,0.,1.));", "#13=AXIS2_PLACEMENT_3D('',#10,#12,#11);",
      "#14=PRODUCT('Geometry','Geometry','',(#3));", "#15=PRODUCT_DEFINITION_FORMATION('','',#14);", "#16=PRODUCT_DEFINITION('design','',#15,#4);",
      "#17=PRODUCT_DEFINITION_SHAPE('','',#16);", "#18=SHAPE_REPRESENTATION('Geometry',(#13),#9);", '#19=SHAPE_DEFINITION_REPRESENTATION(#17,#18);',
      "#20=PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#14));", 'ENDSEC;', 'END-ISO-10303-21;'];
    return stepAddGeos(head.join('\n') + '\n', geos);
  }
  // ---------- sketch "pick a plane": light up the flat face (or Geometry plane) the cursor snaps to ----------
  function skRegTris(b, f, ri) {
    if (!b.feat.rt) b.feat.rt = new Map();
    let t = b.feat.rt.get(ri);
    if (!t) { t = []; for (let i = 0; i < f.reg.length; i++) if (f.reg[i] === ri) t.push(i); b.feat.rt.set(ri, t); }
    return t;
  }
  function skPlaneEnt(px, py) {
    const ray = screenRay(px, py), h = pickNear(px, py);
    let best = null, bt = h ? h.t : Infinity;
    for (const g of snapGeos()) {                            // Geometry planes (and the base planes), whichever is in front of the mesh
      if (g.vis === false || g.type !== 'plane') continue;
      const dn = V.dot(ray.d, g.n);
      if (Math.abs(dn) < 1e-9) continue;
      const t = V.dot(V.sub(g.p, ray.o), g.n) / dn, at = V.add(ray.o, V.mul(ray.d, t)), u = g.u, v = V.cross(g.n, u), r = V.sub(at, g.p), s = g.size / 2 * 1.02;
      if (Math.abs(V.dot(r, u)) > s || Math.abs(V.dot(r, v)) > s || (t > bt && !(g.origin && !(best && best.geo.origin)))) continue;   // base planes: picked through anything
      if (best && best.geo.origin && !g.origin) continue;
      bt = t; best = { geo: g, n: g.n.slice(), o: (g.org || g.p).slice(), u: g.u.slice(), poly: planeCorners(g), text: g.name };
    }
    if (best || !h) return best;
    const b = h.body, f = featOf(b), ri = f.reg[h.tri], R = f.regions[ri];
    if (!R || R.type !== 'plane') return { bad: true, at: h.point };
    const off = S.cmp ? [0, 0, 0] : b.off, wm = worldMesh(b);
    return { body: b, n: R.n.slice(), o: h.point.slice(), tris: skRegTris(b, f, ri), pos: wm.positions, idx: wm.indices, off: off, text: L('Mặt phẳng', 'Flat face') };
  }
  function drawSkHov() {
    const e = S.skHov;
    if (!e) return;
    const HC = '#ffe14a';
    if (e.bad) { const q = project(e.at); tag(q[0], q[1] - 20, L('Không phải mặt phẳng', 'Not a flat face'), '#ffffff', '#e05050'); return; }
    ctx.fillStyle = 'rgba(255,225,74,0.38)';
    if (e.poly) {
      const q = e.poly.map(project);
      ctx.beginPath(); q.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill();
      poly2(q.concat([q[0]]), HC, 2.5);
    } else {
      const P = e.pos, I = e.idx, o = e.off, pr = function (k) { return project([P[k * 3] + o[0], P[k * 3 + 1] + o[1], P[k * 3 + 2] + o[2]]); };
      ctx.beginPath();
      for (const t of e.tris) { const a = pr(I[t * 3]), b = pr(I[t * 3 + 1]), c = pr(I[t * 3 + 2]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); }
      ctx.fill();
    }
    const c = project(e.o), tip = project(V.add(e.o, V.mul(e.n, sceneSize() * 0.08)));
    line2(c, tip, HC, 2); dot2(c, HC, 4);
    tag(c[0], c[1] - 22, e.text, '#ffffff', HC);
  }

  // ---------- the Sketches / Geos list: export them as STEP, hide / show them all ----------
  function sketchGeos() {                                    // visible sketches as STEP items (construction left out)
    const out = [];
    for (const s of S.sketches) {
      if (!s.visible) continue;
      const f = s.frame, m = s.m, u = V.norm(f.u);
      let n = V.norm(f.n);
      if (V.dot(V.cross(n, u), f.v) < 0) n = V.mul(n, -1);    // so that angles in the sketch turn the same way in 3D
      let k = 0;
      for (const e of m.ents) {
        if (e.cons) continue;
        const g = skGeo(m, e), nm = s.name + '_' + (++k);
        if (g.t === 'line') out.push({ type: 'line', p: sk3(f, g.a), p2: sk3(f, g.b), name: nm });
        else if (g.t === 'point') out.push({ type: 'point', p: sk3(f, g.p), name: nm });
        else if (g.t === 'circle') out.push({ type: 'circle', c: sk3(f, g.c), n: n, u: u, r: g.r, name: nm });
        else if (g.t === 'arc') out.push({ type: 'arc', c: sk3(f, g.c), n: n, u: u, r: g.r, a0: g.a0, a1: g.a1, name: nm });
      }
    }
    return out;
  }
  function exportGeoStep() {
    if (blocked()) return;
    const geos = S.geos.filter(function (g) { return g.vis !== false; }), sks = sketchGeos();
    if (!geos.length && !sks.length) { flash(L('Không có sketch / geometry nào đang hiện để xuất', 'No visible sketch / geometry to export')); return; }
    download([stepGeosOnly(geos.concat(sks))], 'geometry.step');
    flash(L('Đã xuất STEP: ', 'STEP written: ') + geos.length + ' geometry, ' + S.sketches.filter(function (s) { return s.visible; }).length + ' sketch', true);
  }
  function geoAllVisible() { return S.sketches.some(function (s) { return s.visible; }) || S.geos.some(function (g) { return g.vis !== false; }); }
  function toggleGeoVis() {
    if (!S.sketches.length && !S.geos.length) return;
    const show = !geoAllVisible();
    pushUndo();
    for (const s of S.sketches) s.visible = show;
    for (const g of S.geos) g.vis = show;
    updateSketchList(); dirty = true;
  }
  function updGeoVisBtn() { const b = $('bGeoVis'); if (b) b.classList.toggle('off', !geoAllVisible()); }
  $('bGeoStep').addEventListener('click', exportGeoStep);
  $('bGeoVis').addEventListener('click', toggleGeoVis);

  // right-click on a geometry in the 3D view
  function geoMenu(g, x, y) {
    if (!S.geoSet.has(g.id) && S.geoSel !== g.id) geoSelOnly([g.id]);
    const list = geoSelList(), many = list.length > 1;
    showMenu([[L('Ẩn', 'Hide') + (many ? ' (' + list.length + ')' : ''), function () { hideGeos(geoSelList()); }],
      ...(many ? [] : [[L('Đổi tên', 'Rename'), function () { const n = prompt(L('Tên:', 'Name:'), g.name); if (n && n.trim()) { pushUndo(); g.name = n.trim().replace(/['\\]/g, ''); updateSketchList(); dirty = true; } }]]), null,
      [L('Xóa', 'Delete') + (many ? ' (' + list.length + ')' : ''), function () { deleteGeos(geoSelList().map(function (o) { return o.id; })); }]], x, y);
  }

  // ---------- tooling analysis: the pull direction from a plane / line / axis, and hiding the bodies not analysed ----------
  S.ucPick = false; S.ucDir = null; S.ucList = null; S.ucHid = null;
  function ucPickEnt(px, py) { const e = lineOfVtx(pickEnt(px, py, false)); return e && axDir(e) ? e : null; }
  function ucPickStart() { S.ucPick = true; S.axPick = null; $('bUcPick').classList.add('primary'); canvas.style.cursor = 'crosshair'; flash(L('Bấm một mặt phẳng (lấy pháp tuyến), cạnh thẳng, đường hoặc trục làm hướng mở khuôn (theo bộ lọc)', 'Click a plane (its normal), a straight edge, a line or an axis for the pull direction (as the filter allows)'), true); dirty = true; }
  function ucPickStop() { if (!S.ucPick) return; S.ucPick = false; $('bUcPick').classList.remove('primary'); canvas.style.cursor = toolCursor(); S.hovEnt = null; dirty = true; }
  function ucDirText() {
    const u = S.ucDir; if (!u) { $('ucDirTxt').textContent = L('(chưa chọn)', '(not picked)'); return; }
    const d = u.flip ? V.mul(u.d, -1) : u.d;
    $('ucDirTxt').textContent = u.text + ' → ' + d.map(function (v) { return f2(v, 3); }).join(', ');
  }
  function ucPickClick(px, py) {
    const e = ucPickEnt(px, py);
    if (!e) { flash(L('Ở đây không có mặt phẳng / cạnh thẳng / trục nào (xem bộ lọc)', 'No plane / straight edge / axis here (see the filter)')); return; }
    S.ucDir = { d: V.norm(axDir(e)), at: (e.at || e.p).slice(), text: e.text || L('Hướng', 'Direction'), flip: $('ucFlip').checked };
    $('ucAx').value = 'pick'; $('ucVecRow').style.display = 'flex'; ucDirText(); ucPickStop();
    flash(L('Hướng mở khuôn: ', 'Pull direction: ') + S.ucDir.text + L('. Bấm "Phân tích".', '. Press "Analyse".'), false);
  }
  $('bUcPick').addEventListener('click', function () { if (S.ucPick) ucPickStop(); else ucPickStart(); });
  $('ucFlip').addEventListener('change', function () { if (S.ucDir) { S.ucDir.flip = this.checked; ucDirText(); dirty = true; } });
  ucDirText();
  function drawUcDir() {
    const u = S.ucDir;
    if (!u || $('ucAx').value !== 'pick' || !$('pop_undercut') || !$('pop_undercut').classList.contains('on')) return;
    const d = u.flip ? V.mul(u.d, -1) : u.d, a = project(u.at), b = project(V.add(u.at, V.mul(d, sceneSize() * 0.3)));
    line2(a, b, '#ff9f1a', 2.5); arrow2(a, b, '#ff9f1a', 12, 5); tag(b[0] + 12, b[1] - 10, L('Mở khuôn', 'Pull'), '#14181d', '#ff9f1a');
  }
  // hide every shown body that was not analysed; bring them back when the box is cleared or the colours go
  function ucIsoApply() {
    const on = $('ucIso').checked && S.ucList && S.ucList.length;
    if (on) {
      const keep = new Set(S.ucList);
      if (!S.ucHid) S.ucHid = [];
      for (const b of S.bodies) if (b.visible && !keep.has(b)) { b.visible = false; S.ucHid.push(b); }
    } else if (S.ucHid) {
      for (const b of S.ucHid) if (S.bodies.indexOf(b) >= 0) b.visible = true;
      S.ucHid = null;
    } else return;
    updateExplode(); sceneChanged(false); refresh(); dirty = true;
  }
  $('ucIso').addEventListener('change', function () {
    if (this.checked && !(S.ucList && S.ucList.length)) S.ucList = selBodies();
    ucIsoApply();
  });

  // ---------- Section "Snap": a flat or curved face of a mesh, a Geometry plane or a base plane ----------
  function secSnapEnt(px, py) {
    const e = skPlaneEnt(px, py);
    if (e && !e.bad) return e;
    const h = pickNear(px, py);
    return h ? { n: h.normal.slice(), o: h.point.slice(), tris: [], pos: null, idx: null, off: [0, 0, 0], text: L('Mặt trên mesh', 'Mesh face') } : null;
  }
  function secSnapClick(px, py) {
    const e = secSnapEnt(px, py);
    if (!e) { flash(L('Ở đây không có mặt mesh hay plane nào', 'No mesh face or plane here')); return; }
    const sc = S.sec, n = V.norm(e.n);
    sc.nPick = n; sc.axis = 'pick'; $('secAx').value = 'pick'; sc.on = true; $('secOn').checked = true;
    updateSection();
    sc.s = Math.max(0, Math.min(1, (V.dot(n, e.o) - sc.min) / (sc.max - sc.min)));
    $('secPos').value = Math.round(sc.s * 1000);
    S.skHov = null; updateSection(); setTool('select');
    flash(L('Mặt cắt theo: ', 'Section on: ') + e.text, false);
  }
