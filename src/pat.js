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
