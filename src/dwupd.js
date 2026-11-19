
  // ===================== Drawing: associative link to the 3D model =====================
  // Every body has a stable id (b.uid, kept in the session file). A body's revision = hash of its geometry + its
  // placement; renaming, colour or showing / hiding do not change it. A sheet keeps, per source body, the revision it was
  // last drawn from (sheet.rev[uid]) and the drawing keeps showing that geometry (a snapshot) until the sheet is updated,
  // so a change in 3D marks the sheet "Update Required" instead of silently redrawing it. A body deleted from the model
  // stays in the drawing from its snapshot and is marked missing.
  // Dependency: source body -> views of a sheet -> sheet -> document; updating touches only sheets that use the body.
  const DWU = { geoHash: new WeakMap(), snaps: new Map(), negId: new Map(), negSeq: -1, hist: new Map() };
  function dwNewUid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function dwGeoHash(geo) {
    let h = DWU.geoHash.get(geo); if (h) return h;
    let a = 0x811c9dc5 | 0, b = 0x01000193 ^ 0x5bd1e995;
    const mix = function (arr) {
      const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.byteLength >> 2);
      for (let i = 0; i < u.length; i++) { const x = u[i]; a = Math.imul(a ^ x, 16777619); b = Math.imul(b ^ (x + i), 2246822519) ^ (b >>> 13); }
      a = Math.imul(a ^ u.length, 16777619);
    };
    mix(geo.positions); mix(geo.indices);
    h = (a >>> 0).toString(36) + (b >>> 0).toString(36) + '.' + geo.positions.length;
    DWU.geoHash.set(geo, h); return h;
  }
  function dwRev(b) { return dwGeoHash(b.geo) + '@' + Array.from(b.matrix).map(function (v) { return +(+v).toFixed(6); }).join(','); }
  function dwBodyByUid(uid) { return S.bodies.find(function (b) { return b.uid === uid; }) || null; }
  function dwSnapTake(b) {
    const r = dwRev(b);
    if (!DWU.snaps.has(r)) DWU.snaps.set(r, { rev: r, uid: b.uid, name: b.name, material: b.material, density: b.density, color: b.color.slice(), matrix: Array.from(b.matrix), geo: b.geo });
    return r;
  }
  // ids the drawing engine uses: real body ids, negative ids for bodies that only live on in a snapshot
  function dwIdOf(uid) { const b = dwBodyByUid(uid); if (b) return b.id; if (!DWU.negId.has(uid)) DWU.negId.set(uid, DWU.negSeq--); return DWU.negId.get(uid); }
  function dwUidOf(id) {
    id = +id;
    if (id < 0) { for (const e of DWU.negId) if (e[1] === id) return e[0]; return undefined; }
    const b = S.bodies.find(function (x) { return x.id === id; }); return b ? b.uid : undefined;
  }
  function dwProxy(b, r) {
    if (!r || r === dwRev(b)) return b;
    const sn = DWU.snaps.get(r); if (!sn) return b;
    const p = Object.create(b); p.geo = sn.geo; p.matrix = sn.matrix; p.solid = null; p.stats = null; p.geoBrep = false; p.stale = true;
    return p;
  }
  function dwGhost(uid, sn) {
    return { id: dwIdOf(uid), uid: uid, name: sn.name, geo: sn.geo, orig: sn.geo, matrix: sn.matrix, matrix0: sn.matrix, color: sn.color, opacity: 1, visible: true,
      material: sn.material, density: sn.density, off: [0, 0, 0], ana: null, stats: null, solid: null, ghost: true };
  }
  function dwSnapName(uid, s) { const r = s && s.rev && s.rev[uid], sn = r && DWU.snaps.get(r); return sn ? sn.name : uid; }
  // the bodies the open sheet draws
  function dwBodies() {
    const s = DW.doc ? dwCur() : null, rev = (s && s.rev) || {};
    if (!V6S.src) return v6Live().map(function (b) { return dwProxy(b, rev[b.uid]); });
    const out = [];
    for (const u of V6S.src) {
      if (V6S.hide.indexOf(u) >= 0) continue;
      const b = dwBodyByUid(u);
      if (b) out.push(dwProxy(b, rev[u]));
      else { const sn = DWU.snaps.get(rev[u]); if (sn) out.push(dwGhost(u, sn)); }
    }
    return out;
  }
  // source bodies of a sheet (a sheet without its own list follows the bodies shown in 3D)
  function dwSrcOf(s) { const st = s.id === dwDoc().active && DW.doc ? { src: V6S.src } : s.work; return st.src ? st.src.slice() : v6Live().map(function (b) { return b.uid; }); }
  function dwHideOf(s) { return (s.id === dwDoc().active ? V6S.hide : s.work.hide) || []; }
  function dwBaseline(s, uids, all) {
    s.rev = s.rev || {};
    for (const u of uids) { const b = dwBodyByUid(u); if (b && (all || !s.rev[u])) s.rev[u] = dwSnapTake(b); }
  }
  function dwViewsOf(s) {
    const st = s.id === dwDoc().active ? v6Grab() : s.work, m = st.mode === 'exp' ? 'exp' : '6v', c = st.cfg[m] || {};
    if (m === 'exp') return ['Exploded view'];
    const n = V6_ORDER.filter(function (k) { return c['v:' + k] === true; });
    if (c.v6Iso) n.push('iso');
    return n;
  }
  function dwViewName(n) { return n === 'iso' ? 'ISO' : n === 'Exploded view' ? n : L(V6_VIEWS[n].vi, V6_VIEWS[n].en); }
  // what changed for one sheet
  function dwCheck(s) {
    const deps = dwSrcOf(s), rev = s.rev || {}, changed = [], missing = [], dims = [];
    for (const u of deps) { const b = dwBodyByUid(u); if (!b) missing.push(u); else if (rev[u] && rev[u] !== dwRev(b)) changed.push(u); }
    const st = s.id === dwDoc().active ? { dims: V6S.dims } : s.work;
    for (const dm of ((st.dims || {})['6v'] || [])) {
      const us = [dm.a.uid, dm.b.uid];
      if (us.some(function (u) { return changed.indexOf(u) >= 0 || missing.indexOf(u) >= 0 || !dwBodyByUid(u); })) dims.push({ dm: dm, ok: v6RefValid(dm.a) && v6RefValid(dm.b) });
    }
    const status = s.fail || s.rfail ? 'fail' : missing.length ? 'miss' : changed.length ? 'upd' : 'ok';
    return { s: s, deps: deps, changed: changed, missing: missing, dims: dims, status: status };
  }
  function dwUpdState(st) {
    return { ok: ['ok', L('Đồng bộ', 'Up to Date'), L('Bản vẽ khớp với mô hình 3D', 'The drawing matches the 3D model')],
      upd: ['upd', L('Cần cập nhật', 'Update Required'), L('Mô hình 3D đã đổi, bản vẽ còn theo hình cũ', 'The 3D model changed; the drawing still shows the old shape')],
      miss: ['miss', L('Thiếu body', 'Missing Source Body'), L('Body nguồn đã bị xoá khỏi mô hình', 'A source body was deleted from the model')],
      fail: ['fail', L('Lỗi cập nhật', 'Update Failed'), L('Không cập nhật được view', 'The views could not be updated')] }[st];
  }
  // plan of an update: scope 'all' | 'sheet' | 'sel' (only the given bodies)
  function dwUpdPlan(scope, only) {
    dwCapture();
    const sheets = scope === 'all' ? dwDoc().sheets : [dwCur()], items = [];
    for (const s of sheets) {
      const c = dwCheck(s);
      if (only) { c.changed = c.changed.filter(function (u) { return only.indexOf(u) >= 0; }); c.missing = c.missing.filter(function (u) { return only.indexOf(u) >= 0; }); c.dims = c.dims.filter(function (d) { return only.indexOf(d.dm.a.uid) >= 0 || only.indexOf(d.dm.b.uid) >= 0; }); }
      if (c.changed.length || c.missing.length || c.dims.length || s.fail || s.rfail) items.push(c);
    }
    return items;
  }
  function dwApplyUpd(items) {
    for (const c of items) {
      const s = c.s;
      try {
        for (const u of c.changed) {
          const b = dwBodyByUid(u);
          if (!b || !b.geo || !b.geo.indices || !b.geo.indices.length) throw new Error(L('Body không còn tam giác: ', 'Body has no triangles: ') + (b ? b.name : u));
          s.rev[u] = dwSnapTake(b);
        }
        s.fail = false; s.rfail = false; s.failMsg = '';
      } catch (e) { s.fail = true; s.failMsg = e.message; }
    }
    DW.sig = ''; v6Preview(); dwRefresh(true);
  }
  // the engine could (not) draw the open sheet
  function dwRenderFail(msg) { if (!DW.doc) return; const s = dwCur(); if (dwSrcOf(s).length && !s.rfail) { s.rfail = true; s.failMsg = msg; dwRefresh(true); } }
  function dwRenderOk() { if (!DW.doc) return; const s = dwCur(); if (s.rfail) { s.rfail = false; dwRefresh(true); } }
  // snapshots the session must carry: geometry a sheet still shows but the model no longer has
  function dwSnapsForSave() {
    const need = new Map();
    if (!DW.doc) return [];
    for (const s of DW.doc.sheets) for (const u in (s.rev || {})) {
      const r = s.rev[u], b = dwBodyByUid(u);
      if ((!b || dwRev(b) !== r) && DWU.snaps.has(r)) need.set(r, DWU.snaps.get(r));
    }
    return Array.from(need.values());
  }
  function dwSnapsLoad(list) {
    DWU.snaps.clear(); DWU.negId.clear(); DWU.negSeq = -1;
    for (const sn of (list || [])) DWU.snaps.set(sn.rev, sn);
  }
  // after a document is loaded: geometry the sheets are up to date with gets its snapshot now (before any edit)
  function dwSnapCurrent() {
    if (!DW.doc) return;
    for (const s of DW.doc.sheets) for (const u in (s.rev || {})) { const b = dwBodyByUid(u); if (b && dwRev(b) === s.rev[u]) dwSnapTake(b); }
  }
  // ---------- update dialog (Check for Updates / Update ...): list first, apply only after confirming
  function dwUpdDialog(scope, only, checkOnly) {
    const items = dwUpdPlan(scope, only);
    const d = $('dwsDlg'), box = d.querySelector('.dwsDlgB');
    const esc = dwEsc, nm = function (u, s) { const b = dwBodyByUid(u); return b ? b.name : dwSnapName(u, s); };
    let h = '<h3>' + esc(checkOnly ? L('Kiểm tra thay đổi', 'Check for Updates') : L('Xem trước cập nhật', 'Update Preview')) + '</h3>';
    if (!items.length) h += '<p class="ok">' + esc(L('Bản vẽ đã đồng bộ với mô hình 3D.', 'The drawing is up to date with the 3D model.')) + '</p>';
    const changedAll = new Set(), sheetsAff = [], views = [], miss = [], dims = [];
    for (const c of items) {
      c.changed.forEach(function (u) { changedAll.add(nm(u, c.s)); });
      if (c.changed.length || c.s.fail) { sheetsAff.push(c.s.name + (c.s.fail ? ' (' + L('lỗi lần trước', 'failed before') + ')' : '')); dwViewsOf(c.s).forEach(function (v) { views.push(c.s.name + ' · ' + dwViewName(v)); }); }
      c.missing.forEach(function (u) { miss.push(nm(u, c.s) + ' (' + c.s.name + ')'); });
      c.dims.forEach(function (x) { dims.push(c.s.name + ' · ' + L('kích thước ', 'dimension ') + '#' + x.dm.id + ' — ' + (x.ok ? L('tham chiếu còn, giá trị sẽ tính lại', 'reference kept, value recomputed') : L('MẤT THAM CHIẾU — cần chọn lại điểm', 'REFERENCE LOST — pick the points again'))); });
    }
    const sec = function (t, arr, cls) { if (!arr.length) return ''; return '<h4>' + esc(t) + ' (' + arr.length + ')</h4><ul class="' + (cls || '') + '">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; };
    h += sec(L('Body đã thay đổi', 'Changed bodies'), Array.from(changedAll)) + sec(L('Sheet bị ảnh hưởng', 'Affected sheets'), sheetsAff) + sec(L('View sẽ tạo lại', 'Views to regenerate'), views) +
      sec(L('Body bị mất (giữ hình cũ, không xoá khỏi bản vẽ)', 'Missing bodies (kept from the old shape, not removed)'), miss, 'bad') + sec(L('Kích thước / chú thích cần kiểm tra', 'Dimensions / annotations to check'), dims);
    box.innerHTML = h;
    const canApply = !checkOnly && items.some(function (c) { return c.changed.length || c.s.fail; });
    $('dwsDlgOk').style.display = canApply ? '' : 'none';
    $('dwsDlgOk').textContent = L('Áp dụng cập nhật', 'Apply Update');
    $('dwsDlgNo').textContent = checkOnly || !canApply ? L('Đóng', 'Close') : L('Huỷ', 'Cancel');
    DW.dlg = function (ok) { d.classList.remove('on'); DW.dlg = null; if (ok && canApply) { dwApplyUpd(items); flash(L('Đã cập nhật bản vẽ', 'Drawing updated')); } };
    d.classList.add('on');
    return items;
  }
  // ---------- undo / redo of a sheet (snapshots of its state as it changes)
  function dwHist(s) { let h = DWU.hist.get(s.id); if (!h) { h = { u: [], r: [], last: null }; DWU.hist.set(s.id, h); } return h; }
  function dwHistNote(s, j) {
    const h = dwHist(s);
    if (h.last !== null && h.last !== j) { h.u.push(h.last); if (h.u.length > 80) h.u.shift(); h.r = []; }
    h.last = j;
  }
  function dwHistReset(s) { const h = dwHist(s); h.last = JSON.stringify(v6Grab()); }
  function dwUndo(redo) {
    if (!DW.doc) return;
    dwCapture();
    const s = dwCur(), h = dwHist(s), from = redo ? h.r : h.u, to = redo ? h.u : h.r;
    if (!from.length) { flash(redo ? L('Không còn gì để làm lại', 'Nothing to redo') : L('Không còn gì để hoàn tác', 'Nothing to undo')); return; }
    to.push(h.last); const j = from.pop();
    s.work = JSON.parse(j); v6Put(s.work); h.last = JSON.stringify(v6Grab());
    s.dirty = dwCanon(s.work) !== dwCanon(s.saved); DW.sig = ''; dwRefresh(true);
  }
