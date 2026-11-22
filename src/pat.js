  // ================= Pattern: linear and circular copies of the ticked bodies (one command) =================
  // B-rep solids keep their recipe in every copy (still exact, STEP, editable); meshes share their triangles.
  // "Merge into one body" joins the original and its copies with a boolean union (the result is a mesh).
  S.pat = { kind: 'lin' };
  const patNum = function (id, d) { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
  // direction / axis choices: the world axes, then the Line and Axis geometry
  function patRefs() {
    const out = [{ k: 'x', n: L('Trục X', 'X axis'), p: [0, 0, 0], d: [1, 0, 0] }, { k: 'y', n: L('Trục Y', 'Y axis'), p: [0, 0, 0], d: [0, 1, 0] }, { k: 'z', n: L('Trục Z', 'Z axis'), p: [0, 0, 0], d: [0, 0, 1] }];
    for (const g of S.geos) if ((g.type === 'line' || g.type === 'axis') && g.p && g.p2) { const d = V.sub(g.p2, g.p); if (V.len(d) > 1e-9) out.push({ k: 'g' + g.id, n: g.name, p: g.p.slice(), d: V.norm(d) }); }
    for (const k of ['pickD', 'pickA']) if (S.pat[k]) out.push(S.pat[k]);
    return out;
  }
  function patFill() {
    const refs = patRefs();
    ['patDir', 'patAx'].forEach(function (id) {
      const el = $(id), was = el.value;
      el.innerHTML = refs.map(function (r) { return '<option value="' + r.k + '">' + r.n.replace(/</g, '&lt;') + '</option>'; }).join('');
      if (refs.some(function (r) { return r.k === was; })) el.value = was; else el.value = id === 'patAx' ? 'z' : 'x';
    });
  }
  function patOpt() {
    const refs = patRefs(), kind = S.pat.kind;
    const ref = refs.filter(function (r) { return r.k === $(kind === 'lin' ? 'patDir' : 'patAx').value; })[0] || refs[0];
    return { kind: kind, ref: ref, flip: $('patFlip').checked, n: Math.max(2, Math.min(200, Math.round(patNum(kind === 'lin' ? 'patN' : 'patCN', 3)))),
      gap: patNum('patGap', 20), ang: Math.max(1, Math.min(360, patNum('patAng', 360))), merge: $('patMerge').checked };
  }
  // the transforms of copies 1..n-1
  function patMats(o) {
    const out = [];
    if (o.kind === 'lin') {
      const d = V.mul(o.ref.d, o.flip ? -1 : 1);
      for (let i = 1; i < o.n; i++) out.push(M.trans(V.mul(d, o.gap * i)));
    } else {
      const step = o.ang >= 359.999 ? 360 / o.n : o.ang / (o.n - 1), d = V.mul(o.ref.d, o.flip ? -1 : 1);
      for (let i = 1; i < o.n; i++) out.push(M.about(o.ref.p, M.rot(d, step * i * Math.PI / 180)));
    }
    return out;
  }
  function patList() { return selBodies().filter(function (b) { return b.visible; }); }
  function patPreview() {
    if (!$('pop_pat').classList.contains('on')) { if (S.pat.picking) patArm(false); if (S.patGhost) { S.patGhost = false; setGhosts([]); } return; }
    const list = patList(), o = patOpt(), mats = patMats(o), gh = [];
    $('patCnt').textContent = list.length ? list.length + L(' body đang chọn → ', ' ticked bodies → ') + (list.length * (mats.length + 1)) + L(' body', ' bodies') : L('Hãy tick các body cần tạo dãy', 'Tick the bodies to pattern');
    $('patOk').disabled = !list.length;
    if (list.length * mats.length <= 400) for (const b of list) for (const T of mats) gh.push({ geo: b.geo, matrix: M.mul(T, b.matrix), color: [0.3, 0.78, 1], alpha: 0.35 });
    S.patGhost = true; setGhosts(gh);
  }
  async function patApply() {
    const list = patList(); if (!list.length || blocked()) { if (!list.length) needSel(); return; }
    const o = patOpt(), mats = patMats(o);
    setBusy(true, 'Pattern...');
    try {
      pushUndo();
      const made = [];
      for (const b of list) {
        const group = [b];
        mats.forEach(function (T, i) {
          const c = addBody(b.name + '_' + (i + 2), b.geo, { orig: b.orig, matrix: M.mul(T, b.matrix), color: b.color, opacity: b.opacity, material: b.material, density: b.density,
            solid: b.solid ? JSON.parse(JSON.stringify(b.solid)) : null });
          c.geoBrep = b.geoBrep; group.push(c); made.push(c);
        });
        if (o.merge) {
          if (group.some(function (g) { return !closedBody(g); })) throw new Error(L('Body "', 'Body "') + b.name + L('" còn viền hở: không gộp được', '" has open borders: cannot merge'));
          let cur = worldMesh(group[0]);
          for (let i = 1; i < group.length; i++) cur = await boolRun(cur, worldMesh(group[i]), 'union');
          for (const g of group.slice(1)) removeBody(g);
          setGeo(b, makeGeo(cur.positions, cur.indices)); b.matrix = M.ident(); b.matrix0 = M.ident(); b.orig = b.geo;
        }
      }
      S.sel.clear(); for (const b of list) S.sel.add(b); if (!o.merge) for (const c of made) S.sel.add(c);
      setGhosts([]); S.patGhost = false;
      updateExplode(); geomChanged(); sceneChanged(false); refresh();
      flash(o.merge ? L('Đã tạo dãy và gộp thành ', 'Pattern made and merged into ') + list.length + ' body' : L('Đã tạo ', 'Made ') + made.length + L(' bản sao', ' copies'), true);
      $('pop_pat').classList.remove('on');
    } catch (e) { showError(e); }
    setBusy(false);
  }
  function patKind(k) {
    S.pat.kind = k;
    document.querySelectorAll('#patSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); });
    $('patLin').style.display = k === 'lin' ? '' : 'none'; $('patCir').style.display = k === 'cir' ? '' : 'none';
    if (S.pat.picking) patArm(false);
    patPreview();
  }
  document.querySelectorAll('#patSeg button').forEach(function (b) { b.addEventListener('click', function () { patKind(b.dataset.k); }); });
  $('b_pattern').addEventListener('click', function () { patFill(); openPop('pat', true); patKind(S.pat.kind); });
  // a direction / axis picked on a body: straight edge, flat face (its normal through the face) or cylindrical face (its axis)
  function patPickRef(h, px, py) {
    const f = featOf(h.body), el = pickEdge(h, px, py, false);
    if (el) {
      const c = f.chains[el[0]], a = c.pts[0], q = c.pts[c.pts.length - 1], d = V.sub(q, a);
      let straight = !c.closed && V.len(d) > 1e-6;
      if (straight) { const u = V.norm(d); for (const p of c.pts) { const w = V.sub(p, a); if (V.len(V.sub(w, V.mul(u, V.dot(w, u)))) > 1e-3 * (1 + V.len(d))) { straight = false; break; } } }
      if (straight) return { n: L('Cạnh ', 'Edge ') + h.body.name, p: a.slice(), d: V.norm(d) };
    }
    const R = f.regions[f.reg[h.tri]];
    if (R && R.type === 'plane') return { n: L('Pháp tuyến mặt ', 'Face normal ') + h.body.name, p: h.point.slice(), d: R.n.slice() };
    if (R && R.type === 'cyl') return { n: L('Trục mặt trụ ', 'Cylinder axis ') + h.body.name, p: R.c.slice(), d: V.norm(R.axis) };
    return null;
  }
  function patArm(on) {
    S.pat.picking = on ? (S.pat.kind === 'lin' ? 'D' : 'A') : null;
    $('patPickD').classList.toggle('on', S.pat.picking === 'D'); $('patPickA').classList.toggle('on', S.pat.picking === 'A');
  }
  ['patPickD', 'patPickA'].forEach(function (id) { $(id).addEventListener('click', function () { patArm(!S.pat.picking); if (S.pat.picking) flash(L('Bấm vào cạnh thẳng, mặt phẳng hoặc mặt trụ', 'Click a straight edge, a flat face or a cylindrical face')); }); });
  canvas.addEventListener('pointerdown', function (e) {
    if (!S.pat.picking || e.button !== 0 || !$('pop_pat').classList.contains('on')) return;
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, h = pickNear(px, py);
    e.stopImmediatePropagation(); e.preventDefault();
    if (!h) return;
    const ref = patPickRef(h, px, py);
    if (!ref) { flash(L('Chỗ này không có cạnh thẳng / mặt phẳng / mặt trụ', 'No straight edge, flat or cylindrical face here')); return; }
    const k = S.pat.picking === 'D' ? 'pickD' : 'pickA';
    ref.k = k; S.pat[k] = ref; patArm(false); patFill();
    $(k === 'pickD' ? 'patDir' : 'patAx').value = k; patPreview();
  }, true);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.pat.picking) patArm(false); });
  [['patNR', 'patN'], ['patGapR', 'patGap'], ['patCNR', 'patCN'], ['patAngR', 'patAng']].forEach(function (p) {
    const r = $(p[0]), n = $(p[1]);
    r.addEventListener('input', function () { n.value = r.value; patPreview(); });
    n.addEventListener('input', function () { r.value = n.value; patPreview(); });
  });
  ['patDir', 'patAx', 'patFlip', 'patMerge'].forEach(function (id) { $(id).addEventListener('change', patPreview); });
  $('patOk').addEventListener('click', function () { patApply().catch(showError); });
  document.querySelectorAll('[data-pop=pat].popx').forEach(function (b) { b.addEventListener('click', function () { setTimeout(patPreview, 0); }); });
  // keep the preview in step with the ticked bodies
  setInterval(function () { if ($('pop_pat').classList.contains('on')) { const k = patList().map(function (b) { return b.id + ':' + b.matrix.join(','); }).join('|'); if (k !== S.patKey) { S.patKey = k; patPreview(); } } else if (S.patGhost) patPreview(); }, 400);

  // ================= Mirror: the ticked bodies reflected across a plane (one command) =================
  // The reflection is baked into each body's own shape, so body placements stay plain turns and moves:
  //  - a B-rep solid keeps its recipe plus a 'mirror' step (still exact, editable from its sketch, STEP);
  //    "Merge" puts the mirrored half into the same solid with a B-rep union (one exact solid);
  //  - a mesh (or a solid opened from STEP) gets its triangles reflected and turned (outside stays outside);
  //    "Merge" joins the two with a boolean union (the result is a mesh).
  S.mir = {};
  function mirRefs() {
    const out = [{ k: 'yz', n: 'YZ (Right)', p: [0, 0, 0], d: [1, 0, 0] },
      { k: 'xz', n: 'XZ (Front)', p: [0, 0, 0], d: [0, 1, 0] },
      { k: 'xy', n: 'XY (Top)', p: [0, 0, 0], d: [0, 0, 1] }];
    for (const g of S.geos) if (g.type === 'plane' && g.p && g.n && V.len(g.n) > 1e-9) out.push({ k: 'g' + g.id, n: g.name, p: g.p.slice(), d: V.norm(g.n) });
    if (S.mir.pick) out.push(S.mir.pick);
    return out;
  }
  function mirFill() {
    const refs = mirRefs(), el = $('mirPl'), was = el.value;
    el.innerHTML = refs.map(function (r) { return '<option value="' + r.k + '">' + r.n.replace(/</g, '&lt;') + '</option>'; }).join('');
    el.value = refs.some(function (r) { return r.k === was; }) ? was : 'yz';
  }
  function mirOpt() {
    const refs = mirRefs(), ref = refs.filter(function (r) { return r.k === $('mirPl').value; })[0] || refs[0];
    const off = patNum('mirOff', 0);
    return { ref: ref, p: V.add(ref.p, V.mul(ref.d, off)), n: ref.d, merge: $('mirMerge').checked, keep: $('mirKeep').checked };
  }
  // reflection across the plane through p with unit normal n (column-major)
  function mirMat(p, n) {
    const d = 2 * V.dot(p, n), x = n[0], y = n[1], z = n[2];
    return [1 - 2 * x * x, -2 * x * y, -2 * x * z, 0, -2 * x * y, 1 - 2 * y * y, -2 * y * z, 0, -2 * x * z, -2 * y * z, 1 - 2 * z * z, 0, d * x, d * y, d * z, 1];
  }
  // the same reflection in a body's own coordinates
  function mirLocal(b, R) { return M.mul(M.inv(b.matrix), M.mul(R, b.matrix)); }
  // a mesh reflected by m (a reflection): points moved, each triangle turned so its outside stays outside;
  // B-rep edge lines (vertex pairs) carry over unchanged
  function mirMesh(positions, indices, m) {
    const P = positions, Q = new Float32Array(P.length), I = new Uint32Array(indices.length);
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      Q[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; Q[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; Q[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    for (let t = 0; t < indices.length; t += 3) { I[t] = indices[t]; I[t + 1] = indices[t + 2]; I[t + 2] = indices[t + 1]; }
    return { positions: Q, indices: I };
  }
  function mirGeo(geo, m) {
    const r = mirMesh(geo.positions, geo.indices, m), g = makeGeo(r.positions, r.indices);
    if (geo.brep) { g.brep = true; g.brepE = geo.brepE; }
    return g;
  }
  // a recipe with a mirror step added (m in the body's coordinates)
  function mirRecipe(r, m, merge) {
    const c = JSON.parse(JSON.stringify(r));
    c.feats = (c.feats || []).concat([{ type: 'mirror', m: m.map(function (v) { return +v.toFixed(12); }), merge: !!merge, v: 0, sel: {} }]);
    return c;
  }
  function mirList() { return selBodies().filter(function (b) { return b.visible; }); }
  function mirPreview() {
    if (!$('pop_mir').classList.contains('on')) { if (S.mir.picking) mirArm(false); if (S.mirGhost) { S.mirGhost = false; setGhosts([]); } return; }
    const list = mirList(), o = mirOpt(), R = mirMat(o.p, o.n), gh = [];
    $('mirCnt').textContent = list.length ? list.length + L(' body đang chọn', ' ticked bodies') : L('Hãy tick các body cần đối xứng', 'Tick the bodies to mirror');
    $('mirOk').disabled = !list.length;
    $('mirKeep').disabled = o.merge;
    for (const b of list) gh.push({ geo: b.geo, matrix: M.mul(R, b.matrix), color: [0.3, 0.78, 1], alpha: 0.35 });
    S.mirGhost = true; setGhosts(gh);
  }
  async function mirApply() {
    const list = mirList(); if (!list.length || blocked()) { if (!list.length) needSel(); return; }
    const o = mirOpt(), R = mirMat(o.p, o.n);
    setBusy(true, 'Mirror...');
    try {
      pushUndo();
      const made = [], meshOnly = [];
      for (const b of list) {
        const m = mirLocal(b, R);
        if (o.merge) {
          if (b.solid && brCan(b.solid)) {                     // one exact solid: the recipe gets a mirror + union step
            const r = mirRecipe(b.solid, m, true), bm = await brepMeshOf(r);
            if (bm) { setGeo(b, brGeo(bm), true); b.geoBrep = true; b.solid = r; continue; }
            meshOnly.push(b.name);
          }
          if (!closedBody(b)) throw new Error(L('Body "', 'Body "') + b.name + L('" còn viền hở: không gộp được', '" has open borders: cannot merge'));
          const half = worldMesh(b), other = mirMesh(half.positions, half.indices, R);
          const cur = await boolRun(half, other, 'union');
          setGeo(b, makeGeo(cur.positions, cur.indices)); b.matrix = M.ident(); b.matrix0 = M.ident(); b.orig = b.geo;
          continue;
        }
        const geo = mirGeo(b.geo, m), solid = b.solid ? mirRecipe(b.solid, m, false) : null;
        if (o.keep) {
          const c = addBody(b.name + '_mirror', geo, { orig: geo, matrix: b.matrix.slice(), color: b.color, opacity: b.opacity, material: b.material, density: b.density, solid: solid });
          c.geoBrep = b.geoBrep; made.push(c);
        } else {
          const wasBrep = b.geoBrep;
          setGeo(b, geo, true); b.orig = geo; b.geoBrep = wasBrep; b.solid = solid;
        }
      }
      S.sel.clear(); for (const b of list) S.sel.add(b); for (const c of made) S.sel.add(c);
      setGhosts([]); S.mirGhost = false;
      updateExplode(); geomChanged(); sceneChanged(false); refresh();
      flash((o.merge ? L('Đã đối xứng và gộp ', 'Mirrored and merged ') + list.length + ' body'
        : o.keep ? L('Đã tạo ', 'Made ') + made.length + L(' bản đối xứng', ' mirrored copies') : L('Đã đối xứng ', 'Mirrored ') + list.length + ' body') +
        (meshOnly.length ? L(' · lõi B-rep không gộp được ', ' · the B-rep engine could not merge ') + meshOnly.join(', ') + L(' (kết quả là mesh)', ' (the result is a mesh)') : ''), true);
      $('pop_mir').classList.remove('on');
    } catch (e) { showError(e); }
    setBusy(false);
  }
  $('b_mirror').addEventListener('click', function () { mirFill(); openPop('mir', true); mirPreview(); });
  // a mirror plane picked on a body: a flat face (the plane of the face)
  function mirArm(on) { S.mir.picking = !!on; $('mirPick').classList.toggle('on', S.mir.picking); }
  $('mirPick').addEventListener('click', function () { mirArm(!S.mir.picking); if (S.mir.picking) flash(L('Bấm vào một mặt phẳng trên body', 'Click a flat face on a body')); });
  canvas.addEventListener('pointerdown', function (e) {
    if (!S.mir.picking || e.button !== 0 || !$('pop_mir').classList.contains('on')) return;
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, h = pickNear(px, py);
    e.stopImmediatePropagation(); e.preventDefault();
    if (!h) return;
    const f = featOf(h.body), R = f.regions[f.reg[h.tri]];
    if (!R || R.type !== 'plane') { flash(L('Chỗ này không phải mặt phẳng', 'This is not a flat face')); return; }
    const n = V.norm(R.n);
    S.mir.pick = { k: 'pick', n: L('Mặt phẳng trên ', 'Flat face of ') + h.body.name, p: V.mul(n, R.d), d: n };
    mirArm(false); mirFill(); $('mirPl').value = 'pick'; mirPreview();
  }, true);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.mir.picking) mirArm(false); });
  $('mirOffR').addEventListener('input', function () { $('mirOff').value = this.value; mirPreview(); });
  $('mirOff').addEventListener('input', function () { $('mirOffR').value = this.value; mirPreview(); });
  ['mirPl', 'mirMerge', 'mirKeep'].forEach(function (id) { $(id).addEventListener('change', mirPreview); });
  $('mirOk').addEventListener('click', function () { mirApply().catch(showError); });
  document.querySelectorAll('[data-pop=mir].popx').forEach(function (b) { b.addEventListener('click', function () { setTimeout(mirPreview, 0); }); });
  setInterval(function () { if ($('pop_mir').classList.contains('on')) { const k = mirList().map(function (b) { return b.id + ':' + b.matrix.join(','); }).join('|'); if (k !== S.mirKey) { S.mirKey = k; mirPreview(); } } else if (S.mirGhost) mirPreview(); }, 400);
