  // ================= solids from sketches, boolean, solid edits, shortcuts =================
  function showMenu(items, x, y) {
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
  // ---------- see-through previews ----------
  S.ghosts = []; S.ghostHide = new Set();
  function setGhosts(list, hide) {
    const old = S.ghosts;
    S.ghosts = list || []; S.ghostHide = new Set(hide || []);
    for (const g of old) if (S.ghosts.every(function (n) { return n.geo !== g.geo; })) releaseGeo(g.geo);
    dirty = true;
  }
  function drawGhosts() {
    if (!S.ghosts.length || !gl) return;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const g of S.ghosts) {
      const o = ensureGL(g.geo);
      gl.uniformMatrix4fv(U.uM, false, g.matrix || M.ident()); gl.frontFace(gl.CCW);
      gl.uniform4f(U.uColor, g.color[0], g.color[1], g.color[2], g.alpha); gl.uniform1f(U.uSel, 0); gl.uniform1i(U.uMode, 0);
      gl.bindVertexArray(o.vao); gl.drawElements(gl.TRIANGLES, g.geo.indices.length, gl.UNSIGNED_INT, 0);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  const GHOST = { new: [0.35, 0.72, 1], add: [0.3, 0.9, 0.45], remove: [1, 0.35, 0.3], intersect: [1, 0.85, 0.3], result: [0.55, 0.8, 1] };

  // ---------- Manifold ----------
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
  const MF_ERR = function () { return new Error(L('Mesh chưa phải khối kín hợp lệ (có cạnh hở hoặc cạnh chung nhiều hơn 2 mặt). Hãy vá kín trước rồi thử lại.', 'A mesh is not a valid closed solid (open edges, or edges shared by more than 2 faces). Repair it first and try again.')); };
  // run fn(w, toM) with Manifold; every object made through toM / keep() is freed afterwards
  async function withMF(fn) {
    const w = await manifoldLib();
    if (!w) throw new Error(L('Không khởi động được thư viện Manifold', 'The Manifold library could not start'));
    const made = [];
    const keep = function (s) { made.push(s); return s; };
    const toM = function (m) {
      const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(m.positions), triVerts: new Uint32Array(m.indices) });
      mesh.merge();
      let s;
      try { s = new w.Manifold(mesh); } catch (e) { throw MF_ERR(); }
      return keep(s);
    };
    const fromM = function (s) {
      const out = s.getMesh(), n = out.numProp, V0 = out.vertProperties, nv = V0.length / n, P = new Float32Array(3 * nv);
      for (let i = 0; i < nv; i++) { P[3 * i] = V0[n * i]; P[3 * i + 1] = V0[n * i + 1]; P[3 * i + 2] = V0[n * i + 2]; }
      return { positions: P, indices: new Uint32Array(out.triVerts) };
    };
    try { return await fn(w, toM, fromM, keep); }
    catch (e) { if (String(e && (e.message || e.code || e)).indexOf('anifold') >= 0 && !/Manifold library/.test(String(e.message))) throw MF_ERR(); throw e; }
    finally { for (const s of made) { try { s.delete(); } catch (e2) { /* already freed */ } } }
  }
  async function boolRun(a, b, op) {
    const w = await manifoldLib();
    if (!w) return run('bool', { a: a, b: b, op: op }, function (p) { setProgress(p); });
    return withMF(function (w2, toM, fromM, keep) {
      const A = toM(a), B = toM(b), R = keep(op === 'union' ? A.add(B) : op === 'subtract' ? A.subtract(B) : A.intersect(B));
      const r = fromM(R); r.engine = 'manifold'; return r;
    });
  }
  const closedBody = function (b) { return holesOf(b.geo).edges === 0; };

  // ---------- Extrude / Revolve ----------
  const FERR = { depth: ['Chiều sâu phải lớn hơn 0', 'The depth must be more than 0'], size: ['Kích thước cạnh / vỏ lớn hơn chiều sâu khối', 'The edge size / wall is larger than the depth'],
    offset: ['Draft, chamfer, fillet hoặc bề dày vỏ quá lớn so với biên dạng (biên dạng bị thắt lại)', 'Draft, chamfer, fillet or wall is too large for this profile (it pinches off)'],
    axis: ['Biên dạng phải nằm hoàn toàn về một phía của trục xoay', 'The profile must lie entirely on one side of the axis'] };
  function featParams() {
    const fd = S.fd, op = document.querySelector('#fOp .on').dataset.op;
    if (fd.type === 'extrude') return { op: op, depth: +$('fDepth').value, sym: $('fSym').checked, flip: $('fFlip').checked, draft: +$('fDraft').value || 0, edge: $('fEdge').value, edgeSize: +$('fEdgeS').value || 0, edgeBoth: $('fEdgeB').checked, shell: +$('fShell').value || 0 };
    return { op: op, axis: $('fAxis').value, angle: +$('fAng').value };
  }
  // sketch = {frame, ents (flat)}; off = indices of profiles left out
  function featMesh(type, sketch, p, off) {
    const reg = skRegions(sketch.ents).regions.filter(function (r, i) { return !off || off.indexOf(i) < 0; });
    if (!reg.length) throw new Error('noprofile');
    if (type === 'extrude') {
      const d = p.depth, z0 = p.sym ? -d / 2 : p.flip ? -d : 0, z1 = p.sym ? d / 2 : p.flip ? 0 : d;
      const fr = p.flip && !p.sym ? { o: sketch.frame.o, u: sketch.frame.v, v: sketch.frame.u, n: V.mul(sketch.frame.n, -1) } : sketch.frame;
      const rg = p.flip && !p.sym ? reg.map(function (r) { return { loops: r.loops.map(function (l) { return l.map(function (q) { return [q[1], q[0]]; }).reverse(); }) }; }) : reg;
      const back = p.op !== 'new' && !p.sym ? Math.max(1e-3 * Math.abs(d), 1e-4) : 0;
      return core.extrudeSolid(rg, fr, { z0: (p.flip && !p.sym ? 0 : z0) - back, z1: p.flip && !p.sym ? d : z1, draft: p.draft * Math.PI / 180, edge: p.edge, edgeSize: p.edgeSize, edgeBoth: p.edgeBoth, shell: p.shell });
    }
    let ax = { p: [0, 0], d: p.axis === 'v' ? [0, 1] : [1, 0] };
    if (p.axis !== 'u' && p.axis !== 'v') { const e = sketch.ents.filter(function (q) { return q.axis; })[+p.axis]; if (!e) throw new Error('axis'); ax = { p: e.a, d: [e.b[0] - e.a[0], e.b[1] - e.a[1]] }; }
    return core.revolveSolid(reg, sketch.frame, ax, Math.min(360, Math.max(1, p.angle)) * Math.PI / 180);
  }
  // the sketch a feature reads: one from the list, or the copy kept inside a solid
  function fdSketch(fd) {
    const s = fd.sketchId ? sketchById(fd.sketchId) : null;
    if (s) return { frame: s.frame, ents: core.skFlat(s.m), m: s.m };
    if (fd.edit && fd.edit.solid) return { frame: fd.edit.solid.frame, ents: fd.edit.solid.ents, m: fd.edit.solid.m || null };
    return null;
  }
  function featPreview() {
    const fd = S.fd;
    if (!fd) return;
    fd.lines = null; fd.err = ''; fd.mesh = null;
    const sketch = fdSketch(fd);
    try {
      if (!sketch) throw new Error('nosketch');
      const p = featParams(), m = featMesh(fd.type, sketch, p, Array.from(fd.off));
      fd.mesh = m;
      const geo = makeGeo(m.positions, m.indices);
      setGhosts([{ geo: geo, color: GHOST[p.op], alpha: p.op === 'new' ? 0.5 : 0.42 }], fd.edit ? [fd.edit] : []);
    } catch (e) {
      const k = FERR[e.message];
      fd.err = k ? L(k[0], k[1]) : e.message === 'noprofile' ? L('Không còn biên dạng kín nào được chọn', 'No closed profile is selected') : e.message === 'nosketch' ? L('Hãy chọn một sketch', 'Pick a sketch') : String(e.message || e);
      setGhosts([], fd.edit ? [fd.edit] : []);
    }
    const op = document.querySelector('#fOp .on').dataset.op, n = selBodies().filter(function (b) { return b !== fd.edit; }).length;
    $('fNote').innerHTML = fd.err ? '<span style="color:var(--bad)">' + fd.err + '</span>' :
      (op === 'new' ? (fd.edit ? L('Sửa khối "', 'Editing "') + fd.edit.name + '"' : L('Tạo một khối solid mới.', 'Makes a new solid.')) :
      n ? L('Áp dụng lên ', 'Applies to the ') + n + L(' body đang tick; kết quả là mesh.', ' ticked bodies; the result is a mesh.') : '<span style="color:var(--bad)">' + L('Hãy tick body cần Add / Remove / Intersect.', 'Tick the bodies to Add to / Remove from / Intersect with.') + '</span>') +
      '<br>' + L('Bấm vào một biên dạng trên màn hình để bỏ / lấy lại nó.', 'Click a profile in the view to leave it out / take it back.');
    updateSketchList(); dirty = true;
  }
  function closeFeature() { if (!S.fd) return; S.fd = null; $('fdlg').style.display = 'none'; setGhosts([]); updateSketchList(); dirty = true; }
  function fillSketchSelect(fd) {
    const sel = $('fSketch'); sel.innerHTML = '';
    if (fd.edit && fd.edit.solid && !(fd.edit.solid.sketchId && sketchById(fd.edit.solid.sketchId))) { const o = document.createElement('option'); o.value = ''; o.textContent = L('(bản sketch lưu trong khối)', '(sketch kept in the solid)'); sel.appendChild(o); }
    for (const s of S.sketches) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name + ' · ' + skProfiles(s).regions.length + L(' biên dạng', ' profiles'); sel.appendChild(o); }
    sel.value = fd.sketchId ? String(fd.sketchId) : '';
  }
  function fillAxis(fd, keep) {
    const ax = $('fAxis'), sk = fdSketch(fd), old = ax.value; ax.innerHTML = '';
    [['u', L('Trục ngang của sketch (U)', 'Sketch horizontal axis (U)')], ['v', L('Trục dọc của sketch (V)', 'Sketch vertical axis (V)')]].concat((sk ? sk.ents : []).filter(function (e) { return e.axis; }).map(function (e, i) { return [String(i), L('Đường dựng ', 'Construction line ') + (i + 1) + L(' trong sketch', ' of the sketch')]; }))
      .forEach(function (o) { const el = document.createElement('option'); el.value = o[0]; el.textContent = o[1]; ax.appendChild(el); });
    if (keep && Array.from(ax.options).some(function (o) { return o.value === keep; })) ax.value = keep;
    else if (old && Array.from(ax.options).some(function (o) { return o.value === old; })) ax.value = old;
    else if (ax.options.length > 2) ax.value = '0';
  }
  // pick the sketch a feature works on (from the list or by clicking it in the view)
  function featUseSketch(id) {
    const fd = S.fd;
    if (!fd || fd.sketchId === id) return !!fd;
    fd.sketchId = id; fd.off = new Set(); fillSketchSelect(fd); fillAxis(fd); featPreview();
    return true;
  }
  function openFeature(type, edit) {
    if (blocked() || S.sk) { if (S.sk) flash(L('Hãy bấm "Xong sketch" trước', 'Finish the sketch first')); return; }
    closeDlg(); brepLib();
    let sid = edit && edit.solid ? edit.solid.sketchId || null : null;
    if (sid && !sketchById(sid)) sid = null;
    if (!edit) {
      sid = S.skSel && sketchById(S.skSel) ? S.skSel : null;
      if (!sid) { const c = S.sketches.filter(function (s) { return skProfiles(s).regions.length; }); if (c.length) sid = c[c.length - 1].id; }
      if (!sid) { flash(L('Chưa có sketch với biên dạng kín. Bấm "✏ Sketch" để vẽ trước.', 'There is no sketch with a closed profile yet. Press "✏ Sketch" to draw one.')); return; }
    }
    $('skplane').style.display = 'none';
    S.fd = { type: type, edit: edit || null, sketchId: sid, off: new Set(edit && edit.solid && edit.solid.off ? edit.solid.off : []), lines: null };
    $('fTitle').textContent = (type === 'extrude' ? 'Extrude' : 'Revolve') + (edit ? L(' (sửa)', ' (edit)') : '');
    $('fExt').style.display = type === 'extrude' ? 'block' : 'none'; $('fRev').style.display = type === 'revolve' ? 'block' : 'none';
    fillSketchSelect(S.fd);
    const p = edit ? edit.solid.params : null;
    fillAxis(S.fd, p && p.axis);
    document.querySelectorAll('#fOp button').forEach(function (b) { b.classList.toggle('on', b.dataset.op === 'new'); b.disabled = !!edit && b.dataset.op !== 'new'; });
    if (!p) { $('fSym').checked = false; $('fFlip').checked = false; $('fDraft').value = 0; $('fEdge').value = 'none'; $('fEdgeB').checked = false; $('fShell').value = 0; $('fAng').value = 360; }
    if (p && type === 'extrude') { $('fDepth').value = p.depth; $('fSym').checked = p.sym; $('fFlip').checked = p.flip; $('fDraft').value = p.draft; $('fEdge').value = p.edge; $('fEdgeS').value = p.edgeSize; $('fEdgeB').checked = p.edgeBoth; $('fShell').value = p.shell; }
    if (p && type === 'revolve') $('fAng').value = p.angle;
    $('fDepthR').value = $('fDepth').value; $('fAngR').value = $('fAng').value; $('fDraftR').value = $('fDraft').value;
    $('fdlg').style.display = 'block';
    featPreview();
  }
  // a click in the view while Extrude / Revolve is open: toggle a profile, or switch to another sketch
  function featClick(px, py) {
    const fd = S.fd, cur = fd.sketchId ? sketchById(fd.sketchId) : null;
    const hitIn = function (s) {
      const uv = skFromScreen(s.frame, px, py); if (!uv) return -1;
      const regs = skProfiles(s).regions;
      for (let i = regs.length - 1; i >= 0; i--) { const r = regs[i]; if (skInside(uv, r.loops[0]) && !r.loops.slice(1).some(function (h) { return skInside(uv, h); })) return i; }
      return -1;
    };
    if (cur) { const i = hitIn(cur); if (i >= 0) { if (fd.off.has(i)) fd.off.delete(i); else fd.off.add(i); featPreview(); return true; } }
    for (const s of S.sketches) if (s.visible && s !== cur && hitIn(s) >= 0) { featUseSketch(s.id); return true; }
    return false;
  }
  document.querySelectorAll('#fOp button').forEach(function (b) { b.addEventListener('click', function () { document.querySelectorAll('#fOp button').forEach(function (o) { o.classList.toggle('on', o === b); }); featPreview(); }); });
  ['fDepth', 'fSym', 'fFlip', 'fDraft', 'fEdge', 'fEdgeS', 'fEdgeB', 'fShell', 'fAxis', 'fAng'].forEach(function (id) { $(id).addEventListener('input', function () { if (id === 'fDepth') $('fDepthR').value = this.value; if (id === 'fAng') $('fAngR').value = this.value; if (id === 'fDraft') $('fDraftR').value = this.value; featPreview(); }); $(id).addEventListener('change', featPreview); });
  $('fDepthR').addEventListener('input', function () { $('fDepth').value = this.value; featPreview(); });
  $('fAngR').addEventListener('input', function () { $('fAng').value = this.value; featPreview(); });
  $('fDraftR').addEventListener('input', function () { $('fDraft').value = this.value; featPreview(); });
  $('fSketch').addEventListener('change', function () { const v = this.value; S.fd.sketchId = v ? +v : null; S.fd.off = new Set(); fillAxis(S.fd); featPreview(); });
  $('fNo').addEventListener('click', closeFeature);
  $('bExtrude').addEventListener('click', function () { openFeature('extrude'); });
  $('bRevolve').addEventListener('click', function () { openFeature('revolve'); });
  $('fOk').addEventListener('click', async function () {
    const fd = S.fd;
    if (!fd || busy) return;
    featPreview();
    if (!fd.mesh) { flash(fd.err); return; }
    const sk = fdSketch(fd), p = featParams(), m = fd.mesh;
    const recipe = { type: fd.type, frame: sk.frame, ents: JSON.parse(JSON.stringify(sk.ents)), m: sk.m ? JSON.parse(JSON.stringify(sk.m)) : null, sketchId: fd.sketchId, off: Array.from(fd.off), params: p, feats: fd.edit && fd.edit.solid ? fd.edit.solid.feats || [] : [] };
    if (p.op === 'new') {
      pushUndo();
      if (fd.edit) {
        const b = fd.edit;
        closeFeature();
        await rebuildSolid(b, recipe, m);
      } else { setBusy(true, L('Dựng khối...', 'Building the solid...')); const bm = await brepMeshOf(recipe), mm = bm || m; setBusy(false); const b = addBody(fd.type === 'extrude' ? 'Extrude' : 'Revolve', bm ? brGeo(bm) : makeGeo(mm.positions, mm.indices), { solid: recipe }); b.geoBrep = !!bm; S.sel = new Set([b]); closeFeature(); brNote(!!bm); }
      geomChanged(); sceneChanged(false);
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
  // a solid's base shape changed: rebuild it and replay its solid edits (fillet, shell...) on the new shape
  async function rebuildSolid(b, recipe, base) {
    setBusy(true, L('Dựng lại khối...', 'Rebuilding the solid...'));
    const bm = await brepMeshOf(recipe);
    setBusy(false);
    if (bm) { setGeo(b, brGeo(bm), true); b.geoBrep = true; b.solid = recipe; return; }
    let mesh = base, dropped = [];
    const feats = recipe.feats || [];
    if (feats.length) {
      setBusy(true, L('Dựng lại khối...', 'Rebuilding the solid...'));
      const keep = [];
      for (const f of feats) {
        try { mesh = await DRESS[f.type].apply(mesh, f, true); keep.push(f); } catch (e) { dropped.push(f.type); }
      }
      recipe.feats = keep;
      setBusy(false);
    }
    setGeo(b, makeGeo(mesh.positions, mesh.indices), true); b.solid = recipe;
    if (dropped.length) flash(L('Không áp lại được trên hình mới, đã bỏ: ', 'Could not be replayed on the new shape, dropped: ') + dropped.join(', '), true);
  }
  async function regenFromSketch(s) {
    const list = S.bodies.filter(function (b) { return b.solid && b.solid.sketchId === s.id; });
    if (!list.length) return;
    const flat = core.skFlat(s.m);
    for (const b of list) {
      const r = Object.assign({}, b.solid, { frame: s.frame, ents: flat, m: JSON.parse(JSON.stringify(s.m)) });
      try { const m = featMesh(r.type, { frame: s.frame, ents: flat }, r.params, r.off); await rebuildSolid(b, r, m); }
      catch (e) { flash(L('Khối "', 'Solid "') + b.name + L('" không dựng lại được từ sketch mới', '" could not be rebuilt from the new sketch'), true); }
    }
    geomChanged();
  }

  // ---------- picking edges and faces ----------
  // what the descriptor of an edge / face remembers is geometry in the body's own coordinates, so it can be
  // found again after the body is rebuilt
  const toLocal = function (b, p) { return M.point(M.inv(b.matrix), p); };
  const toLocalN = function (b, n) { return V.norm(M.vec(M.inv(b.matrix), n)); };
  function regionTris(f, r) { const out = []; for (let i = 0; i < f.reg.length; i++) if (f.reg[i] === r) out.push(i); return out; }
  function regionCentroid(mesh, f, r) {
    const P = mesh.positions, I = mesh.indices; let c = [0, 0, 0], a = 0;
    for (let t = 0; t < f.reg.length; t++) {
      if (f.reg[t] !== r) continue;
      const i = 3 * I[3 * t], j = 3 * I[3 * t + 1], k = 3 * I[3 * t + 2], w = V.len(V.cross([P[j] - P[i], P[j + 1] - P[i + 1], P[j + 2] - P[i + 2]], [P[k] - P[i], P[k + 1] - P[i + 1], P[k + 2] - P[i + 2]])) / 2;
      a += w; for (let q = 0; q < 3; q++) c[q] += w * (P[i + q] + P[j + q] + P[k + q]) / 3;
    }
    return a > 0 ? V.mul(c, 1 / a) : c;
  }
  function edgeDesc(b, f, ci) {
    const c = f.chains[ci], n = c.pts.length, pts = [];
    for (let k = 0; k < 9; k++) pts.push(toLocal(b, c.pts[Math.round(k * (n - 1) / 8)]));
    const rn = function (r) { const R = f.regions[r]; return R && R.type === 'plane' ? toLocalN(b, R.n) : null; };
    return { pts: pts, n: [rn(c.r1), rn(c.r2)] };
  }
  function faceDesc(b, f, r) {
    const R = f.regions[r], wm = worldMesh(b);
    const d = { type: R.type, c: toLocal(b, regionCentroid(wm, f, r)) };
    if (R.type === 'plane') d.n = toLocalN(b, R.n);
    if (R.type === 'cyl') { d.axis = toLocalN(b, R.axis); d.r = R.r; d.cc = toLocal(b, R.c); }
    return d;
  }
  function diagOf(mesh) { const g = makeGeo(mesh.positions, mesh.indices); return Math.hypot(g.max[0] - g.min[0], g.max[1] - g.min[1], g.max[2] - g.min[2]) || 1; }
  const segDist = function (p, a, b) { const ab = V.sub(b, a), l2 = V.dot(ab, ab), t = l2 > 0 ? Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / l2)) : 0; return V.len(V.sub(p, V.add(a, V.mul(ab, t)))); };
  function findEdge(f, d, tol) {
    let best = -1, bs = Infinity;
    f.chains.forEach(function (c, i) {
      if (c.r2 < 0 || c.r1 < 0) return;
      const rn = function (r) { const R = f.regions[r]; return R && R.type === 'plane' ? R.n : null; };
      const a = rn(c.r1), b = rn(c.r2);
      if (d.n[0] && d.n[1]) { const same = function (x, y) { return x && y && V.dot(x, y) > 0.995; }; if (!((same(a, d.n[0]) && same(b, d.n[1])) || (same(a, d.n[1]) && same(b, d.n[0])))) return; }
      let s = 0;
      for (const p of d.pts) { let m = Infinity; for (let k = 0; k + 1 < c.pts.length; k++) m = Math.min(m, segDist(p, c.pts[k], c.pts[k + 1])); s += m; }
      s /= d.pts.length;
      if (s < bs) { bs = s; best = i; }
    });
    return bs <= tol ? best : -1;
  }
  function findFace(mesh, f, d, tol) {
    let best = -1, bs = Infinity;
    f.regions.forEach(function (R, i) {
      if (R.type !== d.type) return;
      let s;
      if (d.type === 'plane') { if (V.dot(R.n, d.n) < 0.999) return; s = Math.abs(V.dot(R.n, d.c) - R.d) + 0.2 * V.len(V.sub(regionCentroid(mesh, f, i), d.c)); }
      else if (d.type === 'cyl') { if (Math.abs(V.dot(R.axis, d.axis)) < 0.999) return; const w = V.sub(R.c, d.cc); s = Math.abs(R.r - d.r) + V.len(V.sub(w, V.mul(d.axis, V.dot(w, d.axis)))); }
      else s = V.len(V.sub(regionCentroid(mesh, f, i), d.c));
      if (s < bs) { bs = s; best = i; }
    });
    return bs <= tol ? best : -1;
  }
  // the edge run under the cursor on a body (with its tangent neighbours if asked)
  function pickEdge(h, px, py, tangent) {
    const b = h.body, f = featOf(b), R = f.regions[f.reg[h.tri]];
    if (!R) return null;
    let best = -1, bd = 10, at = null;
    for (const ci of R.chains) {
      const c = f.chains[ci];
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = project(c.pts[i]), q = project(c.pts[i + 1]), ax = q[0] - a[0], ay = q[1] - a[1], l2 = ax * ax + ay * ay, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - a[0]) * ax + (py - a[1]) * ay) / l2)) : 0;
        const d = Math.hypot(px - a[0] - t * ax, py - a[1] - t * ay);
        if (d < bd) { bd = d; best = ci; at = V.add(c.pts[i], V.mul(V.sub(c.pts[i + 1], c.pts[i]), t)); }
      }
    }
    if (best < 0) return null;
    const out = [best];
    out.at = at;                                             // the point clicked on the edge (world)
    if (tangent) {                                           // follow edges that continue smoothly from the ends
      const dir = function (c, atEnd) { const n = c.pts.length, a = atEnd ? c.pts[n - 1] : c.pts[0], q = atEnd ? c.pts[n - 2] : c.pts[1]; return V.norm(V.sub(a, q)); };
      const near = function (a, q) { return V.len(V.sub(a, q)) < 1e-6 * (1 + V.len(a)); };
      for (let k = 0; k < out.length && out.length < 200; k++) {
        const c = f.chains[out[k]];
        if (c.closed) continue;
        for (const atEnd of [false, true]) {
          const end = atEnd ? c.pts[c.pts.length - 1] : c.pts[0], d0 = dir(c, atEnd);
          f.chains.forEach(function (o, j) {
            if (out.indexOf(j) >= 0 || o.closed || o.r1 < 0 || o.r2 < 0) return;
            const share = [c.r1, c.r2].some(function (r) { return r === o.r1 || r === o.r2; });
            if (!share) return;
            for (const oEnd of [false, true]) { const e2 = oEnd ? o.pts[o.pts.length - 1] : o.pts[0]; if (near(end, e2) && V.dot(d0, dir(o, oEnd)) < -0.985) { out.push(j); return; } }
          });
        }
      }
    }
    return out;
  }
  // ---------- solid edits ----------
  // every edit runs on a mesh in the body's own coordinates and returns the new mesh; `again` = replaying history
  function replacePlane(w, toM, keep, mesh, tris, nF, nT, dT, diag) {
    const L0 = 3 * diag, pad = 1e-3 * diag;
    const add = keep(toM(core.facePrism(mesh, tris, nF, -pad, L0)).trimByPlane([-nT[0], -nT[1], -nT[2]], -dT));
    const cut = keep(toM(core.facePrism(mesh, tris, nF, pad, -L0)).trimByPlane(nT, dT));
    return { add: add, cut: cut };
  }
  // put one flat face onto a plane: by moving vertices (keeps rounds attached); if that cannot work, by booleans
  async function facePlane(cur, fl, r, nT, dT) {
    try { return core.replaceFaceVerts(cur, fl, [r], nT, dT); }
    catch (e) {
      if (e.message === 'flip') throw new Error(L('Dời quá xa: mặt bên cạnh bị lật. Hãy dùng khoảng nhỏ hơn.', 'Too far: a neighbouring face would turn over. Use a smaller amount.'));
      const R = fl.regions[r], dg = diagOf(cur);
      return withMF(function (w2, toM, fromM, keep) { const o = replacePlane(w2, toM, keep, cur, regionTris(fl, r), R.n, nT, dT, dg); return fromM(keep(keep(toM(cur).add(o.add)).subtract(o.cut))); });
    }
  }
  const NEED = function (what) { return new Error(L('Không tìm thấy ' + what + ' đã chọn trên hình', 'The selected ' + what + ' was not found on the shape')); };
  const DRESS = {
    fillet: { title: 'Fillet', boxes: [['edges', 'edge', 'Cạnh', 'Edges']], num: ['Bán kính R', 'Radius R', 2, 0.1, 0, 20], tangent: true,
      apply: function (mesh, f, again) { return dressEdges(mesh, f, 'fillet', again); } },
    chamfer: { title: 'Chamfer', boxes: [['edges', 'edge', 'Cạnh', 'Edges']], num: ['Khoảng cách', 'Distance', 1, 0.1, 0, 20], tangent: true,
      apply: function (mesh, f, again) { return dressEdges(mesh, f, 'chamfer', again); } },
    moveface: { title: L('Move face', 'Move face'), boxes: [['faces', 'face', 'Mặt (phẳng / trụ)', 'Faces (flat / cylindrical)']], num: ['Khoảng dời (+ ra ngoài)', 'Offset (+ outwards)', 2, 0.1, -50, 50],
      apply: async function (mesh, f, again) {
        let cur = mesh;
        for (const d of f.sel.faces) {
          const fl = core.features(cur), dg = diagOf(cur), r = findFace(cur, fl, d, again ? 0.3 * dg : 1e-3 * dg + 1e-6);
          if (r < 0) throw NEED(L('mặt', 'face'));
          const R = fl.regions[r], tris = regionTris(fl, r);
          if (R.type === 'cyl') {
            const t0 = tris[0], I = cur.indices, P = cur.positions, a = 3 * I[3 * t0], n = (function () { const b = 3 * I[3 * t0 + 1], c = 3 * I[3 * t0 + 2]; return V.norm(V.cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]])); })();
            const w = V.sub([P[a], P[a + 1], P[a + 2]], R.c), rad = V.sub(w, V.mul(R.axis, V.dot(w, R.axis))), out = V.dot(n, rad) > 0 ? 1 : -1;
            cur = core.moveCylFace(cur, tris, R.axis, R.c, out * f.v);
            continue;
          }
          if (R.type !== 'plane') throw new Error(L('Move face chỉ dời được mặt phẳng hoặc mặt trụ', 'Move face only moves flat or cylindrical faces'));
          cur = await facePlane(cur, fl, r, R.n, R.d + f.v);
        }
        return cur;
      } },
    replace: { title: 'Replace face', boxes: [['faces', 'plane', 'Mặt cần thay', 'Faces to replace'], ['target', 'plane1', 'Mặt đích', 'Target face']], num: ['Offset', 'Offset', 0, 0.1, -50, 50],
      apply: async function (mesh, f, again) {
        let cur = mesh;
        const dg0 = diagOf(cur), tol = function (dg) { return again ? 0.3 * dg : 1e-3 * dg + 1e-6; };
        const flT = core.features(cur), rt = findFace(cur, flT, f.sel.target[0], tol(dg0));
        if (rt < 0) throw NEED(L('mặt đích', 'target face'));
        const RT = flT.regions[rt];
        for (const d of f.sel.faces) {
          const fl = core.features(cur), dg = diagOf(cur), r = findFace(cur, fl, d, tol(dg));
          if (r < 0) throw NEED(L('mặt', 'face'));
          const R = fl.regions[r];
          let nT = RT.n, dT = RT.d;
          if (V.dot(nT, R.n) < 0) { nT = V.mul(nT, -1); dT = -dT; }
          dT += f.v;
          cur = await facePlane(cur, fl, r, nT, dT);
        }
        return cur;
      } },
    shell: { title: 'Shell', boxes: [['faces', 'face', 'Mặt bỏ đi (để trống = rỗng kín)', 'Faces to remove (none = closed hollow)']], num: ['Bề dày', 'Thickness', 1.5, 0.1, 0.1, 20],
      apply: async function (mesh, f, again) {
        const fl = core.features(mesh), dg = diagOf(mesh), open = new Set();
        for (const d of f.sel.faces) { const r = findFace(mesh, fl, d, again ? 0.3 * dg : 1e-3 * dg + 1e-6); if (r < 0) throw NEED(L('mặt', 'face')); for (const t of regionTris(fl, r)) open.add(t); }
        if (!(f.v > 0)) throw new Error(L('Bề dày phải lớn hơn 0', 'The thickness must be more than 0'));
        const m = core.shellMesh(mesh, open, f.v);
        return withMF(function (w2, toM, fromM) { return fromM(toM(m)); });
      } },
    draft: { title: 'Draft', boxes: [['faces', 'plane', 'Mặt cần draft', 'Faces to draft'], ['neutral', 'plane1', 'Mặt trung tính', 'Neutral plane']], num: ['Góc°', 'Angle°', 1, 0.5, 0, 30], flip: true,
      apply: async function (mesh, f, again) {
        let cur = mesh;
        const tol = function (dg) { return again ? 0.3 * dg : 1e-3 * dg + 1e-6; };
        const flN = core.features(cur), rn = findFace(cur, flN, f.sel.neutral[0], tol(diagOf(cur)));
        if (rn < 0) throw NEED(L('mặt trung tính', 'neutral plane'));
        const N = flN.regions[rn], pull = V.mul(N.n, f.flip ? -1 : 1), a = f.v * Math.PI / 180;
        for (const d of f.sel.faces) {
          const fl = core.features(cur), dg = diagOf(cur), r = findFace(cur, fl, d, tol(dg));
          if (r < 0) throw NEED(L('mặt', 'face'));
          const R = fl.regions[r], c = V.dot(R.n, N.n);
          if (Math.abs(c) > 0.999) throw new Error(L('Mặt cần draft song song với mặt trung tính', 'A face to draft is parallel to the neutral plane'));
          const det = 1 - c * c, al = (R.d - c * N.d) / det, be = (N.d - c * R.d) / det, X = V.add(V.mul(R.n, al), V.mul(N.n, be));
          const pp = V.norm(V.sub(pull, V.mul(R.n, V.dot(pull, R.n)))), nT = V.norm(V.add(V.mul(R.n, Math.cos(a)), V.mul(pp, Math.sin(a)))), dT = V.dot(nT, X);
          cur = await facePlane(cur, fl, r, nT, dT);
        }
        return cur;
      } }
  };
  async function dressEdges(mesh, f, kind, again) {
    const fl = core.features(mesh), dg = diagOf(mesh), chains = [];
    for (const d of f.sel.edges) {
      const ci = findEdge(fl, d, again ? 0.3 * dg : 1e-3 * dg + 1e-6);
      if (ci < 0) throw NEED(L('cạnh', 'edge'));
      if (chains.every(function (c) { return c.ci !== ci; })) chains.push({ ci: ci, vs: fl.chains[ci].vs, r1: fl.chains[ci].r1 });
    }
    if (!(f.v > 0)) throw new Error(L('Kích thước phải lớn hơn 0', 'The size must be more than 0'));
    const t = core.edgeTool(mesh, fl.reg, chains, f.v, kind);
    if (!t) throw new Error(L('Có cạnh nằm trên viền hở: không bo / vát được', 'An edge lies on an open border: it cannot be rounded / bevelled'));
    return withMF(function (w, toM, fromM, keep) {
      let R = toM(mesh);
      if (t.conv.length) R = keep(R.subtract(keep(w.Manifold.union(t.conv.map(toM)))));
      if (t.conc.length) R = keep(R.add(keep(w.Manifold.union(t.conc.map(toM)))));
      return fromM(R);
    });
  }
  // ---------- the operation dialog (Boolean and the solid edits) ----------
  S.od = null;                                               // {cmd, sel: {box: [items]}, active, body}
  function closeDlg() { if (!S.od) return; S.od = null; $('odlg').style.display = 'none'; setGhosts([]); dirty = true; }
  function openDlg(cmd) {
    if (cmd !== 'boolean') brepLib();
    if (blocked() || S.sk) { if (S.sk) flash(L('Hãy bấm "Xong sketch" trước', 'Finish the sketch first')); return; }
    closeFeature(); closeDlg(); $('skplane').style.display = 'none';
    setTool('select');
    const od = { cmd: cmd, sel: {}, active: null, body: null, seq: 0 };
    if (cmd === 'boolean') {
      od.op = 'union';
      const list = selBodies();
      od.sel.tools = list.slice(); od.sel.targets = [];
      od.active = 'tools';
    } else {
      for (const b of DRESS[cmd].boxes) od.sel[b[0]] = [];
      od.active = DRESS[cmd].boxes[0][0];
      const sb = selBodies(); if (sb.length === 1) od.body = sb[0];
    }
    S.od = od;
    buildDlg();
    $('odlg').style.display = 'block';
    dlgPreview();
  }
  function boxLabel(it) {
    if (it.body && it.ci !== undefined) { const c = featOf(it.body).chains[it.ci]; return it.body.name + ' · ' + (c ? (c.type === 'line' ? L('cạnh thẳng ', 'line ') + f2(c.len) : c.type === 'arc' ? L('cung R', 'arc R') + f2(c.r) : L('cạnh cong ', 'curve ') + f2(c.len)) : '?'); }
    if (it.body && it.r !== undefined) { const R = featOf(it.body).regions[it.r]; return it.body.name + ' · ' + (R ? (R.type === 'plane' ? L('mặt phẳng', 'plane') : R.type === 'cyl' ? L('mặt trụ R', 'cylinder R') + f2(R.r) : R.type === 'sphere' ? L('mặt cầu', 'sphere') : L('mặt cong', 'curved face')) : '?'); }
    return it.name;
  }
  function buildDlg() {
    const od = S.od, el = $('odBody');
    let h = '';
    const box = function (key, title) {
      const items = od.sel[key] || [];
      h += '<div class="selbox' + (od.active === key ? ' on' : '') + '" data-box="' + key + '"><div class="sbt">' + title + ' <span class="cnt">' + items.length + '</span></div>';
      h += items.length ? items.map(function (it, i) { return '<div class="sbi">' + boxLabel(it).replace(/</g, '&lt;') + '<span data-rm="' + key + ':' + i + '">✕</span></div>'; }).join('') : '<div class="sbe">' + L('bấm để chọn trên màn hình', 'click to pick in the view') + '</div>';
      h += '</div>';
    };
    if (od.cmd === 'boolean') {
      $('odTitle').textContent = 'Boolean';
      h += '<div class="seg" id="odOp">' + ['union', 'subtract', 'intersect'].map(function (o) { return '<button data-op="' + o + '"' + (od.op === o ? ' class="on"' : '') + '>' + o.charAt(0).toUpperCase() + o.slice(1) + '</button>'; }).join('') + '</div>';
      box('tools', od.op === 'subtract' ? L('Tools (khối dùng để cắt)', 'Tools (bodies that cut)') : 'Tools');
      if (od.op === 'subtract') box('targets', L('Targets (khối bị cắt)', 'Targets (bodies to cut)'));
      h += '<div class="row"><label><input type="checkbox" id="odKeep"' + (od.keep ? ' checked' : '') + '> <span>' + L('Giữ lại tools', 'Keep tools') + '</span></label></div>';
    } else {
      const D = DRESS[od.cmd];
      $('odTitle').textContent = D.title;
      for (const b of D.boxes) box(b[0], L(b[2], b[3]));
      const n = D.num, v = od.v === undefined ? n[2] : od.v;
      h += '<div class="row"><span class="lbl">' + L(n[0], n[1]) + '</span><input type="number" id="odV" value="' + v + '" step="' + n[3] + '"><span class="unit">' + (od.cmd === 'draft' ? '°' : 'mm') + '</span></div>';
      h += '<div class="row"><input type="range" id="odR" min="' + n[4] + '" max="' + n[5] + '" step="' + n[3] + '" value="' + v + '"></div>';
      if (D.tangent) h += '<div class="row"><label><input type="checkbox" id="odTan"' + (od.tan !== false ? ' checked' : '') + '> <span>' + L('Lấy cả các cạnh nối tiếp tuyến', 'Tangent propagation') + '</span></label></div>';
      if (D.flip) h += '<div class="row"><label><input type="checkbox" id="odFlip"' + (od.flip ? ' checked' : '') + '> <span>' + L('Đảo hướng rút khuôn', 'Flip the pull direction') + '</span></label></div>';
    }
    h += '<div class="note" id="odNote"></div>';
    el.innerHTML = h;
    el.querySelectorAll('[data-box]').forEach(function (b) { b.addEventListener('click', function () { od.active = b.dataset.box; buildDlg(); }); });
    el.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); const q = b.dataset.rm.split(':'); od.sel[q[0]].splice(+q[1], 1); buildDlg(); dlgPreview(); }); });
    el.querySelectorAll('#odOp button').forEach(function (b) { b.addEventListener('click', function () { od.op = b.dataset.op; if (od.op !== 'subtract') { od.sel.tools = od.sel.tools.concat(od.sel.targets.filter(function (x) { return od.sel.tools.indexOf(x) < 0; })); od.sel.targets = []; od.active = 'tools'; } buildDlg(); dlgPreview(); }); });
    if ($('odKeep')) $('odKeep').addEventListener('change', function () { od.keep = this.checked; });
    if ($('odV')) { $('odV').addEventListener('input', function () { od.v = +this.value; $('odR').value = this.value; dlgPreview(); }); $('odR').addEventListener('input', function () { od.v = +this.value; $('odV').value = this.value; dlgPreview(); }); }
    if ($('odTan')) $('odTan').addEventListener('change', function () { od.tan = this.checked; });
    if ($('odFlip')) $('odFlip').addEventListener('change', function () { od.flip = this.checked; dlgPreview(); });
    dlgNote();
  }
  function dlgNote(extra) {
    const od = S.od; if (!od || !$('odNote')) return;
    let t = '';
    if (od.cmd === 'boolean') t = od.op === 'subtract' ? L('Bấm ô Tools hoặc Targets rồi bấm body trên màn hình / trong danh sách để đưa vào ô đó.', 'Click the Tools or Targets box, then click bodies in the view / list to put them there.') : L('Bấm các body cần gộp / giao vào ô Tools.', 'Click the bodies to combine into Tools.');
    else t = L('Bấm ô cần chọn rồi bấm ', 'Click a box, then click ') + (DRESS[od.cmd].boxes.some(function (b) { return b[1] === 'edge'; }) ? L('cạnh', 'edges') : L('mặt', 'faces')) + L(' trên body. Tất cả phải trên cùng 1 body kín.', ' on the body. All on one closed body.');
    $('odNote').innerHTML = t + (extra ? '<br>' + extra : '');
  }
  // a click in the view while the dialog is open
  function dlgClick(px, py, h) {
    const od = S.od, key = od.active;
    if (!key) return;
    if (od.cmd === 'boolean') {
      if (!h) return;
      const b = h.body, other = key === 'tools' ? 'targets' : 'tools', li = od.sel[key], i = li.indexOf(b);
      if (i >= 0) li.splice(i, 1); else { li.push(b); const j = (od.sel[other] || []).indexOf(b); if (j >= 0) od.sel[other].splice(j, 1); }
      buildDlg(); dlgPreview(); return;
    }
    if (!h) return;
    const D = DRESS[od.cmd], kind = D.boxes.filter(function (b) { return b[0] === key; })[0][1];
    if (od.body && od.body !== h.body) { const any = Object.keys(od.sel).some(function (k) { return od.sel[k].length; }); if (any) { flash(L('Các lựa chọn phải nằm trên cùng một body', 'Everything picked must be on the same body')); return; } }
    od.body = h.body;
    const f = featOf(h.body);
    if (kind === 'edge') {
      const list = pickEdge(h, px, py, od.tan !== false);
      if (!list) { flash(L('Bấm sát vào một cạnh (đường gãy giữa 2 mặt)', 'Click right on an edge (where two faces meet)')); return; }
      const li = od.sel[key], has = li.findIndex(function (it) { return it.ci === list[0]; });
      if (has >= 0) { const drop = new Set(list); od.sel[key] = li.filter(function (it) { return !drop.has(it.ci); }); }
      else for (const ci of list) if (li.every(function (it) { return it.ci !== ci; })) li.push({ body: h.body, ci: ci, at: ci === list[0] ? list.at : null });
    } else {
      const r = f.reg[h.tri], R = f.regions[r];
      if ((kind === 'plane' || kind === 'plane1') && R.type !== 'plane') { flash(L('Hãy bấm một mặt phẳng', 'Click a flat face')); return; }
      if (od.cmd === 'moveface' && R.type !== 'plane' && R.type !== 'cyl') { flash(L('Move face dời được mặt phẳng hoặc mặt trụ', 'Move face moves flat or cylindrical faces')); return; }
      const li = od.sel[key], has = li.findIndex(function (it) { return it.r === r; });
      if (has >= 0) li.splice(has, 1); else { if (kind === 'plane1') li.length = 0; li.push({ body: h.body, r: r, at: h.point || null }); }
      if (kind === 'plane1') { const nx = D.boxes.map(function (b) { return b[0]; }).filter(function (k) { return k !== key; })[0]; if (nx && !od.sel[nx].length) od.active = nx; }
    }
    buildDlg(); dlgPreview();
  }
  function dlgFeature() {                                     // the edit as a history record (descriptors in body coordinates)
    const od = S.od, b = od.body, f = featOf(b), rec = { type: od.cmd, v: od.v === undefined ? DRESS[od.cmd].num[2] : od.v, flip: !!od.flip, sel: {} };
    for (const k of Object.keys(od.sel)) rec.sel[k] = od.sel[k].map(function (it) { const d = it.ci !== undefined ? edgeDesc(b, f, it.ci) : faceDesc(b, f, it.r); if (it.at) d.at = toLocal(b, it.at); return d; });
    return rec;
  }
  function dlgReady() {
    const od = S.od;
    if (od.cmd === 'boolean') return od.op === 'subtract' ? od.sel.tools.length >= 1 && od.sel.targets.length >= 1 : od.sel.tools.length >= 2;
    if (!od.body) return false;
    return DRESS[od.cmd].boxes.every(function (b) { return od.cmd === 'shell' || od.sel[b[0]].length; });
  }
  let prevTimer = 0, prevSeq = 0;
  function dlgPreview() {
    clearTimeout(prevTimer);
    const od = S.od;
    if (!od) return;
    setGhosts([], []);
    if (!dlgReady()) return;
    const seq = ++prevSeq;
    prevTimer = setTimeout(async function () {
      try {
        const r = await dlgCompute();
        if (seq !== prevSeq || S.od !== od) return;
        const g = r.map(function (x) { return { geo: makeGeo(x.mesh.positions, x.mesh.indices), matrix: x.matrix, color: GHOST.result, alpha: 0.75 }; });
        setGhosts(g, r.map(function (x) { return x.hide; }).flat());
        dlgNote();
      } catch (e) { if (seq === prevSeq && S.od === od) { setGhosts([], []); dlgNote('<span style="color:var(--bad)">' + String(e.message || e) + '</span>'); } }
    }, 220);
  }
  // compute the outcome: [{mesh, matrix, hide: [bodies], body}]
  async function dlgCompute() {
    const od = S.od;
    if (od.cmd === 'boolean') {
      const bad = od.sel.tools.concat(od.sel.targets).filter(function (b) { return !closedBody(b); });
      if (bad.length) throw new Error(L('Body "', 'Body "') + bad[0].name + L('" còn viền hở: vá kín trước', '" has open borders: close it first'));
      if (od.op === 'subtract') {
        const out = [];
        for (const t of od.sel.targets) { let cur = worldMesh(t); for (const tool of od.sel.tools) cur = await boolRun(cur, worldMesh(tool), 'subtract'); out.push({ mesh: cur, matrix: M.ident(), hide: [t].concat(od.keep ? [] : od.sel.tools), body: t }); }
        return out;
      }
      let cur = worldMesh(od.sel.tools[0]);
      for (let i = 1; i < od.sel.tools.length; i++) cur = await boolRun(cur, worldMesh(od.sel.tools[i]), od.op);
      return [{ mesh: cur, matrix: M.ident(), hide: od.keep ? [] : od.sel.tools.slice(), body: od.sel.tools[0] }];
    }
    const b = od.body;
    if (!closedBody(b)) throw new Error(L('Body còn viền hở: vá kín trước', 'The body has open borders: close it first'));
    const rec = dlgFeature();
    if (b.solid && BR_FEATS[od.cmd]) {
      const bm = await brepMeshOf(Object.assign({}, b.solid, { feats: (b.solid.feats || []).concat([rec]) }));
      if (bm) return [{ mesh: bm, matrix: b.matrix, hide: [b], body: b, rec: rec }];
    }
    if (b.solid && !BR_FEATS[od.cmd]) brLast = L('lệnh này chưa có trong lõi B-rep', 'this command is not in the B-rep engine yet');
    let src = { positions: b.geo.positions, indices: b.geo.indices }, again = false;
    if (b.solid && b.geo.brep) {                               // the mesh method starts from its own mesh of the solid
      src = featMesh(b.solid.type, { frame: b.solid.frame, ents: b.solid.ents }, b.solid.params, b.solid.off);
      for (const f of b.solid.feats || []) src = await DRESS[f.type].apply(src, f, true);
      again = true;
    }
    const mesh = await DRESS[od.cmd].apply(src, rec, again);
    return [{ mesh: mesh, matrix: b.matrix, hide: [b], body: b, rec: rec }];
  }
  async function dlgOk() {
    const od = S.od;
    if (!od || busy) return;
    if (!dlgReady()) { flash(L('Chưa chọn đủ', 'Not everything is picked yet')); return; }
    clearTimeout(prevTimer); prevSeq++;
    showError(null); setBusy(true, od.cmd === 'boolean' ? 'Boolean...' : DRESS[od.cmd].title + '...');
    const t0 = performance.now();
    try {
      const res = await dlgCompute();
      pushUndo();
      if (od.cmd === 'boolean') {
        let tri = 0;
        if (od.op === 'subtract') {
          for (const r of res) { if (r.mesh.indices.length) { setGeo(r.body, makeGeo(r.mesh.positions, r.mesh.indices)); r.body.matrix = M.ident(); r.body.matrix0 = M.ident(); r.body.orig = r.body.geo; tri += r.mesh.indices.length / 3; } else removeBody(r.body); }
          if (!od.keep) for (const b of od.sel.tools) if (od.sel.targets.indexOf(b) < 0) removeBody(b);
        } else {
          const r = res[0], target = od.sel.tools[0];
          if (od.keep) { if (r.mesh.indices.length) addBody(target.name + '_' + od.op, makeGeo(r.mesh.positions, r.mesh.indices), { material: target.material, density: target.density }); }
          else {
            for (const b of od.sel.tools.slice(1)) removeBody(b);
            if (r.mesh.indices.length) { setGeo(target, makeGeo(r.mesh.positions, r.mesh.indices)); target.matrix = M.ident(); target.matrix0 = M.ident(); target.orig = target.geo; } else removeBody(target);
          }
          tri = r.mesh.indices.length / 3;
        }
        flash(tri ? od.op.charAt(0).toUpperCase() + od.op.slice(1) + ': ' + fmtN(tri) + L(' tam giác · ', ' triangles · ') + f2((performance.now() - t0) / 1000, 1) + L(' giây', ' s') : L('Kết quả rỗng (các body không giao nhau theo phép này).', 'The result is empty (the bodies do not overlap for this operation).'), true);
      } else {
        const r = res[0], b = r.body;
        setGeo(b, r.mesh.engine === 'brep' ? brGeo(r.mesh) : makeGeo(r.mesh.positions, r.mesh.indices), true); b.geoBrep = r.mesh.engine === 'brep'; if (b.solid) brNote(!!b.geo.brep);
        if (b.solid) { b.solid.feats = (b.solid.feats || []).concat([r.rec]); }
      }
      closeDlg();
    } catch (e) { showError(e); }
    setBusy(false); geomChanged();
  }
  $('odOk').addEventListener('click', dlgOk);
  $('odNo').addEventListener('click', closeDlg);
  // a body row clicked in the list while the Boolean dialog is open goes into the active box
  function dlgPickBody(b) { if (!S.od || S.od.cmd !== 'boolean') return false; dlgClick(0, 0, { body: b }); return true; }
  function dropLastFeat(b) {
    if (!b.solid || !b.solid.feats || !b.solid.feats.length) return;
    const r = Object.assign({}, b.solid, { feats: b.solid.feats.slice(0, -1) });
    pushUndo();
    let base;
    try { base = featMesh(r.type, { frame: r.frame, ents: r.ents }, r.params, r.off); } catch (e) { showError(e); return; }
    rebuildSolid(b, r, base).then(geomChanged);
  }
  // highlight what the dialog has picked, and what is under the cursor
  function drawDlgSel() {
    const od = S.od;
    if (!od || od.cmd === 'boolean') return;
    const draw = function (it, col, w) {
      if (!it || !it.body) return;
      const f = featOf(it.body);
      if (it.ci !== undefined) { const c = f.chains[it.ci]; if (c) poly2(c.pts.map(project), col, w); }
      else if (it.r !== undefined) { const R = f.regions[it.r]; if (R) for (const ci of R.chains) poly2(f.chains[ci].pts.map(project), col, w); }
    };
    for (const k of Object.keys(od.sel)) for (const it of od.sel[k]) draw(it, k === od.active ? '#ffa726' : '#7fd0ff', 4);
    if (od.hov) draw(od.hov, '#ffe14a', 3);
  }
  function dlgHover(px, py) {
    const od = S.od;
    if (!od || od.cmd === 'boolean') return false;
    const h = pickNear(px, py), key = od.active, D = DRESS[od.cmd];
    let hv = null;
    if (h && key) {
      const kind = D.boxes.filter(function (b) { return b[0] === key; })[0][1];
      if (kind === 'edge') { const l = pickEdge(h, px, py, false); if (l) hv = { body: h.body, ci: l[0] }; }
      else { const f = featOf(h.body); hv = { body: h.body, r: f.reg[h.tri] }; }
    }
    if (JSON.stringify(hv && [hv.ci, hv.r]) !== JSON.stringify(od.hov && [od.hov.ci, od.hov.r]) || (hv && od.hov && hv.body !== od.hov.body)) { od.hov = hv; dirty = true; }
    return true;
  }
  ['boolean', 'fillet', 'chamfer', 'moveface', 'replace', 'shell', 'draft'].forEach(function (c) { const el = $('b_' + c); if (el) el.addEventListener('click', function () { openDlg(c); }); });

  // ---------- shortcuts (Settings ⚙) ----------
  const CMDS = [['move', 'Di chuyển', 'Move', 'M'], ['rotate', 'Xoay', 'Rotate', 'R'], ['scale', 'Tỉ lệ', 'Scale', 'S'], ['sketch', 'Sketch', 'Sketch', 'Shift+S'],
    ['extrude', 'Extrude', 'Extrude', 'E'], ['revolve', 'Revolve', 'Revolve', 'Shift+R'], ['boolean', 'Boolean', 'Boolean', 'B'], ['fillet', 'Fillet', 'Fillet', 'Shift+F'],
    ['chamfer', 'Chamfer', 'Chamfer', 'Shift+C'], ['moveface', 'Move face', 'Move face', 'Shift+M'], ['replace', 'Replace face', 'Replace face', ''], ['shell', 'Shell', 'Shell', 'Shift+L'],
    ['draft', 'Draft', 'Draft', 'Shift+D'], ['normal', 'Normal view (nhìn thẳng hướng gần nhất)', 'Normal view (nearest straight view)', 'N'], ['hide', 'Ẩn / hiện body, sketch đang chọn', 'Hide / show the selected bodies, sketch', 'Y']];
  let keymap = {};
  function loadKeys() {
    keymap = {}; for (const c of CMDS) keymap[c[0]] = c[3];
    try { const s = JSON.parse(localStorage.getItem('mrt_keys') || '{}'); for (const k in s) if (k in keymap) keymap[k] = s[k]; } catch (e) { /* storage blocked: defaults */ }
  }
  function saveKeys() { try { localStorage.setItem('mrt_keys', JSON.stringify(keymap)); } catch (e) { /* not kept */ } }
  function comboOf(e) {
    if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) >= 0) return '';
    let k = e.code.indexOf('Key') === 0 ? e.code.slice(3) : e.code.indexOf('Digit') === 0 ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k;
  }
  function runShortcut(c) {
    if (c === 'move' || c === 'rotate' || c === 'scale') setTool(c);
    else if (c === 'sketch') startSketchCmd();
    else if (c === 'extrude' || c === 'revolve') openFeature(c);
    else if (c === 'hide') toggleHide();
    else if (c === 'normal') normalView();
    else openDlg(c);
  }
  function toggleHide() {
    if (blocked()) return;
    const sel = selBodies();
    if (sel.length) {
      pushUndo();
      const anyShown = sel.some(function (b) { return b.visible; });
      for (const b of sel) b.visible = !anyShown;
      if (anyShown) { S.sel.clear(); flash(L('Đã ẩn ', 'Hidden: ') + sel.length + L(' body. Bấm tên body trong danh sách rồi nhấn Y để hiện lại.', ' bodies. Click a body in the list and press Y to show it again.')); }
      updateExplode(); sceneChanged(false); refresh(); return;
    }
    const s = sketchById(S.skSel);
    if (s) { pushUndo(); s.visible = !s.visible; updateSketchList(); dirty = true; return; }
    flash(L('Hãy chọn body (hoặc sketch) cần ẩn / hiện', 'Select the bodies (or sketch) to hide / show'));
  }
  function buildSettings() {
    const t = $('keyTbl'); t.innerHTML = '';
    for (const c of CMDS) {
      const tr = t.insertRow(), a = tr.insertCell(), b = tr.insertCell(), inp = document.createElement('input');
      a.textContent = L(c[1], c[2]); inp.type = 'text'; inp.readOnly = true; inp.value = keymap[c[0]] || ''; inp.placeholder = L('(không)', '(none)'); inp.className = 'keyin';
      inp.addEventListener('keydown', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Backspace' || e.key === 'Delete') { keymap[c[0]] = ''; inp.value = ''; saveKeys(); return; }
        if (e.key === 'Escape' || e.key === 'Tab') { inp.blur(); return; }
        const k = comboOf(e); if (!k) return;
        const clash = CMDS.filter(function (o) { return o[0] !== c[0] && keymap[o[0]] === k; })[0];
        if (clash) keymap[clash[0]] = '';
        keymap[c[0]] = k; saveKeys(); buildSettings();
        if (clash) flash(L('Phím ' + k + ' đã chuyển từ "' + clash[1] + '" sang lệnh này', k + ' moved from "' + clash[2] + '" to this command'));
      });
      b.appendChild(inp);
    }
  }
  $('bSet').addEventListener('click', function () { const el = $('setdlg'); if (el.style.display === 'block') { el.style.display = 'none'; return; } buildSettings(); el.style.display = 'block'; });
  $('setClose').addEventListener('click', function () { $('setdlg').style.display = 'none'; });
  $('setReset').addEventListener('click', function () { try { localStorage.removeItem('mrt_keys'); } catch (e) { /* ignore */ } loadKeys(); buildSettings(); });
  loadKeys();
  // keys: sketch first, then the open dialogs, then the shortcuts
  function modelKey(e) {
    const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'textarea' || (tag === 'input' && ['checkbox', 'radio', 'range', 'color', 'button', 'file'].indexOf(e.target.type) < 0) || tag === 'select';
    if (e.target.classList && e.target.classList.contains('keyin')) return true;
    if (S.sk) return sketchKey(e, typing);
    if (S.fd) {
      if (e.key === 'Enter') { e.preventDefault(); $('fOk').click(); return true; }
      if (e.key === 'Escape') { $('fNo').click(); return true; }
    }
    if (S.od) {
      if (e.key === 'Enter') { e.preventDefault(); dlgOk(); return true; }
      if (e.key === 'Escape') { closeDlg(); return true; }
    }
    if (typing) return false;
    const k = comboOf(e);
    if (!k) return false;
    for (const c of CMDS) if (keymap[c[0]] && keymap[c[0]] === k) { e.preventDefault(); runShortcut(c[0]); return true; }
    if (e.key === 'Delete' && S.skSel && !S.sel.size) { const s = sketchById(S.skSel); if (s) { deleteSketch(s); return true; } }
    return false;
  }
  // clicks / hover in the view while a dialog is open
  function modelClick(px, py, e) {
    if (S.fd) return featClick(px, py);
    if (S.od) { dlgClick(px, py, S.od.cmd === 'boolean' ? pick(px, py) : pickNear(px, py)); return true; }
    return false;
  }
  function modelHover(px, py) { if (S.od) return dlgHover(px, py); return false; }
  function tipKeys() {                                       // show the shortcuts in the button tooltips
    const map = { normal: '#bNormal', move: '[data-tool=move]', rotate: '[data-tool=rotate]', scale: '[data-tool=scale]', sketch: '#bSketch', extrude: '#bExtrude', revolve: '#bRevolve' };
    for (const c of CMDS) { const el = map[c[0]] ? document.querySelector(map[c[0]]) : $('b_' + c[0]); if (el && keymap[c[0]]) el.title = (el.title || '').replace(/ \[.*\]$/, '') + ' [' + keymap[c[0]] + ']'; }
  }
  tipKeys();

  // ---------- Normal view: glide to the nearest straight view (or onto the sketch plane) ----------
  let viewAnim = 0;
  function normalView() {
    const R = mainCam.R;
    let T;
    if (S.sk) { const f = S.sk.frame; T = [f.u[0], f.u[1], f.u[2], f.v[0], f.v[1], f.v[2], f.n[0], f.n[1], f.n[2]]; }
    else {
      const ax = function (v) { let k = 0; for (let i = 1; i < 3; i++) if (Math.abs(v[i]) > Math.abs(v[k])) k = i; const o = [0, 0, 0]; o[k] = v[k] < 0 ? -1 : 1; return o; };
      const w = ax([R[6], R[7], R[8]]), u0 = [R[3], R[4], R[5]], u = ax(V.sub(u0, V.mul(w, V.dot(u0, w)))), r = V.cross(u, w);
      T = r.concat(u, w);
    }
    const A = R.slice(), t0 = performance.now(), id = ++viewAnim;
    (function step() {
      if (id !== viewAnim) return;
      const k = Math.min(1, (performance.now() - t0) / 260), e = k * k * (3 - 2 * k), M0 = A.map(function (a, i) { return a + (T[i] - a) * e; });
      const r = V.norm(M0.slice(0, 3)); let u = M0.slice(3, 6); u = V.norm(V.sub(u, V.mul(r, V.dot(u, r))));
      const w = V.cross(r, u);
      mainCam.R = k >= 1 ? T.slice() : r.concat(u, w); dirty = true;
      if (k < 1) requestAnimationFrame(step);
    })();
  }
  $('bNormal').addEventListener('click', normalView);

  // ---------- ribbon tabs ----------
  function showTab(t) {
    document.querySelectorAll('#rtabs .rtab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    document.querySelectorAll('#ribbon .rpage').forEach(function (p) { p.classList.toggle('on', p.dataset.page === t); });
    try { localStorage.setItem('mrt_tab', t); } catch (e) { /* not kept */ }
    dirty = true;
  }
  document.querySelectorAll('#rtabs .rtab').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
  try { const t = localStorage.getItem('mrt_tab'); if (t === 'home') showTab(t); } catch (e) { /* default tab */ }

  // ---------- floating panels opened from the ribbon (several may be open) ----------
  function openPop(k, on) {
    const el = $('pop_' + k); if (!el) return;
    const show = on === undefined ? !el.classList.contains('on') : on;
    el.classList.toggle('on', show);
    document.querySelectorAll('.popb[data-pop="' + k + '"]').forEach(function (b) { b.classList.toggle('on', show); });
    if (show) el.scrollIntoView({ block: 'nearest' });
  }
  document.querySelectorAll('[data-pop]').forEach(function (b) { b.addEventListener('click', function () { openPop(b.dataset.pop, b.classList.contains('popx') ? false : undefined); }); });
