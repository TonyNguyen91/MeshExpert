
  // ===================== Drawing Workspace =====================
  // A full-window work area for 2D drawings (Capture > Drawing): own ribbon (tabs 6 Views / Exploded View), the sheet
  // canvas in the middle (the drawing engine of v6.js), the Drawing Tree on the right (document + sheets, with the sheet
  // properties under it) and the sheet bar at the bottom (sheet tabs + Save / Discard / Duplicate). The 3D workspace stays
  // as it is underneath; going back changes nothing in the model.
  //
  // Drawing document  DW.doc = { v, id, name (null = "Drawing of <model>"), created, modified, active, sheets: [sheet] }
  // Sheet             { id, name, saved, work, dirty }
  //   work  = the sheet as it is on the canvas now; saved = what "Save" (sheet) last kept. Both are drawing states of
  //   v6.js (v6Grab form: panel values + placements per drawing type, notes), independent copies per sheet.
  // The document goes into the session file (.mrtl) as meta.drawDoc, body references by body order (as v6Dump).
  const DW = { open: false, doc: null, sig: '', ren: null, drag: null, side: 320 };
  const DW_VER = 1;
  function dwUid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function dwClone(o) { return JSON.parse(JSON.stringify(o)); }
  function dwModelName() {
    if (S.sesName) return S.sesName.replace(/\.mrtl$/i, '');
    const b = S.bodies[0]; return b ? b.name : 'Model';
  }
  function dwDocName() { const d = dwDoc(); return d.name || 'Drawing of "' + dwModelName() + '"'; }
  function dwNewDoc(state) {
    const st = state || v6Blank(), sh = { id: dwUid('s'), name: 'Sheet 1', saved: dwClone(st), work: dwClone(st), dirty: false };
    return { v: DW_VER, id: dwUid('d'), name: null, created: Date.now(), modified: Date.now(), active: sh.id, sheets: [sh] };
  }
  function dwDoc() { if (!DW.doc) DW.doc = dwNewDoc(v6Grab()); return DW.doc; }
  function dwSheet(id) { return dwDoc().sheets.find(function (s) { return s.id === id; }); }
  function dwCur() { const d = dwDoc(); return dwSheet(d.active) || d.sheets[0]; }
  // compare two drawing states by what they hold (defaults filled in; note counter and the open ribbon tab ignored)
  function dwCanon(st) {
    st = st || {}; const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], out = { cfg: {}, st: {}, notes: {} };
    for (const m of ['6v', 'exp']) {
      out.cfg[m] = Object.assign({}, V6S.def, (st.cfg || {})[m]);
      const t = (st.st || {})[m] || {};
      out.st[m] = { R: t.R || I, pos: t.pos || null, iso: t.iso || null, off: t.off || {}, tot: t.tot || null, grp: t.grp || {} };
      out.notes[m] = (st.notes || {})[m] || [];
    }
    return JSON.stringify(out);
  }
  // the canvas -> the active sheet's working copy
  function dwCapture() {
    if (!DW.doc) return;
    const s = dwCur(); s.work = v6Grab(); s.dirty = dwCanon(s.work) !== dwCanon(s.saved);
  }
  function dwShow(s) { DW.doc.active = s.id; v6Put(s.work); dwTabSet(s.work.mode); }
  // ---------- sheet commands
  function dwOpenSheet(id) {
    const d = dwDoc(); if (id === d.active || !dwSheet(id)) return;
    dwCapture(); dwShow(dwSheet(id)); dwRefresh(true);
  }
  function dwNextName(base) {
    const names = new Set(dwDoc().sheets.map(function (s) { return s.name; }));
    if (!base) { let n = dwDoc().sheets.length + 1; while (names.has('Sheet ' + n)) n++; return 'Sheet ' + n; }
    let nm = base, k = 2; while (names.has(nm)) nm = base + ' ' + (k++);
    return nm;
  }
  function dwNewSheet() {
    dwCapture();
    const d = dwDoc(), st = v6Blank(), s = { id: dwUid('s'), name: dwNextName(), saved: dwClone(st), work: dwClone(st), dirty: false };
    d.sheets.push(s); d.modified = Date.now(); dwShow(s); dwRefresh(true);
    return s;
  }
  function dwDupSheet(id) {
    dwCapture();
    const d = dwDoc(), src = dwSheet(id || d.active); if (!src) return null;
    const s = { id: dwUid('s'), name: dwNextName(src.name + ' Copy'), saved: dwClone(src.work), work: dwClone(src.work), dirty: false };
    d.sheets.splice(d.sheets.indexOf(src) + 1, 0, s); d.modified = Date.now(); dwShow(s); dwRefresh(true);
    flash(L('Đã tạo ', 'Created ') + s.name);
    return s;
  }
  function dwDelSheet(id) {
    const d = dwDoc(), s = dwSheet(id); if (!s) return;
    if (!confirm(L('Xoá ' + s.name + '? Không hoàn tác được.', 'Delete ' + s.name + '? This cannot be undone.'))) return;
    dwCapture();
    const i = d.sheets.indexOf(s); d.sheets.splice(i, 1); d.modified = Date.now();
    if (!d.sheets.length) { const st = v6Blank(); d.sheets.push({ id: dwUid('s'), name: 'Sheet 1', saved: dwClone(st), work: dwClone(st), dirty: false }); }
    if (d.active === id || !dwSheet(d.active)) dwShow(d.sheets[Math.min(i, d.sheets.length - 1)]);
    dwRefresh(true);
  }
  function dwSaveSheet() {
    dwCapture();
    const s = dwCur(); s.saved = dwClone(s.work); s.dirty = false; dwDoc().modified = Date.now();
    dwRefresh(true); flash(L('Đã lưu ', 'Saved ') + s.name);
  }
  function dwDiscard() {
    dwCapture();
    const s = dwCur();
    if (!s.dirty) { flash(L(s.name + ' không có thay đổi chưa lưu', s.name + ' has no unsaved changes')); return; }
    if (!confirm(L('Bỏ các thay đổi chưa lưu của ' + s.name + '?', 'Discard the unsaved changes of ' + s.name + '?'))) return;
    s.work = dwClone(s.saved); s.dirty = false; dwShow(s); dwRefresh(true);
  }
  function dwMoveSheet(id, beforeId) {
    const d = dwDoc(), s = dwSheet(id); if (!s || id === beforeId) return;
    d.sheets.splice(d.sheets.indexOf(s), 1);
    const j = beforeId ? d.sheets.findIndex(function (x) { return x.id === beforeId; }) : -1;
    if (j < 0) d.sheets.push(s); else d.sheets.splice(j, 0, s);
    d.modified = Date.now(); dwRefresh(true);
  }
  function dwRenameSheet(id, name) {
    const s = dwSheet(id); name = (name || '').trim(); if (!s || !name || name === s.name) return;
    s.name = name; dwDoc().modified = Date.now(); dwRefresh(true);
  }
  function dwRenameDoc(name) { const d = dwDoc(); name = (name || '').trim(); d.name = name && name !== dwDocName() ? name : d.name; d.modified = Date.now(); dwRefresh(true); }
  async function dwExport(id, fmt) {
    if (id && id !== dwDoc().active) dwOpenSheet(id);
    const s = dwCur(), r = await v6Full(fmt);
    download([r.blob], s.name.replace(/[\\/:*?"<>|]+/g, '_') + '.' + r.o.fmt);
    flash(L('Đã xuất ', 'Exported ') + s.name + ' (' + r.o.fmt.toUpperCase() + ', ' + r.o.W + ' × ' + r.o.H + ' px)');
  }
  // ---------- session (.mrtl)
  function dwDump() {
    const d = dwDoc(); dwCapture();
    const f = v6IdToIdx();
    return { v: DW_VER, id: d.id, name: d.name, created: d.created, modified: d.modified, active: d.active,
      sheets: d.sheets.map(function (s) { return { id: s.id, name: s.name, saved: v6MapIds(s.saved, f), work: v6MapIds(s.work, f), dirty: s.dirty }; }) };
  }
  // d = meta.drawDoc of a session, or null: a new document whose Sheet 1 is the drawing now on the engine
  // (that is how sessions saved before the workspace existed come in: their drawing becomes Sheet 1)
  function dwLoad(d) {
    if (d && d.sheets && d.sheets.length) {
      const f = v6IdxToId();
      DW.doc = { v: DW_VER, id: d.id || dwUid('d'), name: d.name || null, created: d.created || Date.now(), modified: d.modified || Date.now(), active: d.active,
        sheets: d.sheets.map(function (s) { const w = v6MapIds(s.work || s.saved || v6Blank(), f); return { id: s.id || dwUid('s'), name: s.name || 'Sheet', saved: v6MapIds(s.saved || w, f), work: w, dirty: !!s.dirty }; }) };
      if (!dwSheet(DW.doc.active)) DW.doc.active = DW.doc.sheets[0].id;
      v6Put(dwCur().work);
    } else DW.doc = dwNewDoc(v6Grab());
    DW.sig = '';
    if (DW.open) { dwTabSet(dwCur().work.mode); dwRefresh(true); }
  }
  // ---------- open / close
  function dwOpen() {
    dwDoc();
    DW.open = true; document.body.classList.add('dws-on');
    closeMenu();
    v6Activate(true); dwTabSet(V6S.mode); dwRefresh(true);
    setTimeout(function () { ribFit($('dwsRibbon')); v6Preview(); }, 0);
  }
  function dwClose() {
    if (DW.ren) DW.ren.done(true);
    dwCapture(); v6Activate(false);
    DW.open = false; document.body.classList.remove('dws-on'); closeMenu();
    if (typeof dirty !== 'undefined') dirty = true;
  }
  // ---------- icons
  const DW_IC = {
    sheet: '<path d="M5 3h10l4 4v14H5z" fill="#e8eef5" stroke="#9cc4ee"/><path d="M15 3v4h4" stroke="#9cc4ee"/><path d="M8 17h8M8 14h5" stroke="#4f86c4"/><path d="M17 12v6M14 15h6" stroke="#f0a030" stroke-width="1.8"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="#9cc4ee" stroke-width="1.8"/><rect x="8" y="8" width="8" height="8" fill="#4f86c4" stroke="#2b557f"/>',
    props: '<rect x="4" y="4" width="16" height="16" rx="2" fill="#1f2a36" stroke="#9cc4ee"/><path d="M7 9h6M7 13h10M7 17h8" stroke="#e8eef5"/><circle cx="16" cy="9" r="1.6" fill="#f0a030"/>',
    front: '<rect x="6" y="6" width="12" height="12" fill="#4f86c4" stroke="#2b557f"/>',
    iso: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="#4f86c4" stroke="#2b557f"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="#cfe0f5"/>',
    six: '<rect x="9" y="2.5" width="6" height="5" fill="#3d6fa8" stroke="#2b557f"/><rect x="9" y="9" width="6" height="6" fill="#4f86c4" stroke="#2b557f"/><rect x="2.5" y="9" width="5" height="6" fill="#3d6fa8" stroke="#2b557f"/><rect x="16.5" y="9" width="5" height="6" fill="#3d6fa8" stroke="#2b557f"/><rect x="9" y="16.5" width="6" height="5" fill="#3d6fa8" stroke="#2b557f"/>',
    arrange: '<rect x="3" y="4" width="7" height="6" fill="#4f86c4" stroke="#2b557f"/><rect x="14" y="4" width="7" height="6" fill="#4f86c4" stroke="#2b557f"/><rect x="3" y="14" width="7" height="6" fill="#4f86c4" stroke="#2b557f"/><path d="M14 17h7M17.5 13.5v7" stroke="#f0a030" stroke-width="1.8"/>',
    rotR: '<path d="M18 8a7 7 0 1 0 1.5 6" stroke="#9cc4ee" stroke-width="1.8"/><path d="M19 3v5h-5" stroke="#f0a030" stroke-width="1.8"/>',
    rotL: '<path d="M6 8a7 7 0 1 1-1.5 6" stroke="#9cc4ee" stroke-width="1.8"/><path d="M5 3v5h5" stroke="#f0a030" stroke-width="1.8"/>',
    tip: '<path d="M5 7h10a4 4 0 0 1 0 8H8" stroke="#9cc4ee" stroke-width="1.8"/><path d="M11 12l-3 3 3 3" stroke="#f0a030" stroke-width="1.8"/>',
    edge: '<path d="M4 18L12 4l8 14z" stroke="#e8eef5" stroke-width="1.8"/>',
    hid: '<path d="M4 18L12 4l8 14z" stroke="#e8eef5" stroke-width="1.5"/><path d="M8 13h8" stroke="#9cc4ee" stroke-dasharray="2 2"/>',
    name: '<path d="M5 6h14M12 6v13" stroke="#e8eef5" stroke-width="1.8"/>',
    dim: '<path d="M4 8v8M20 8v8M4 12h16" stroke="#9cc4ee"/><path d="M7 10l-3 2 3 2M17 10l3 2-3 2" stroke="#f0a030"/>',
    scale: '<path d="M4 20L20 4" stroke="#9cc4ee" stroke-width="1.8"/><path d="M14 4h6v6" stroke="#f0a030" stroke-width="1.8"/>',
    text: '<path d="M5 5h14M12 5v14M9 19h6" stroke="#e8eef5" stroke-width="1.8"/><path d="M18 14v6M15 17h6" stroke="#f0a030" stroke-width="1.8"/>',
    png: '<path d="M5 3h10l4 4v14H5z" fill="#1f2a36" stroke="#9cc4ee"/><path d="M8 17l3-4 2 2 3-4 2 6z" fill="#6fd08c"/>',
    jpg: '<path d="M5 3h10l4 4v14H5z" fill="#1f2a36" stroke="#9cc4ee"/><circle cx="10" cy="11" r="2" fill="#f0a030"/><path d="M7 18l4-4 3 2 3-3 2 5z" fill="#4f86c4"/>',
    copy: '<rect x="8" y="8" width="11" height="12" fill="#1f2a36" stroke="#9cc4ee"/><path d="M5 16V4h11" stroke="#9cc4ee"/>',
    explode: '<rect x="9" y="9" width="6" height="6" fill="#4f86c4" stroke="#2b557f"/><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3" stroke="#f0a030" stroke-width="1.8"/>',
    reset: '<path d="M5 12a7 7 0 1 0 2-5" stroke="#9cc4ee" stroke-width="1.8"/><path d="M4 4v5h5" stroke="#f0a030" stroke-width="1.8"/>',
    comb: '<rect x="3" y="6" width="7" height="7" fill="#4f86c4" stroke="#2b557f"/><rect x="14" y="11" width="7" height="7" fill="#4f86c4" stroke="#2b557f"/><path d="M10 9.5h3l1 4" stroke="#f0a030" stroke-width="1.8"/>',
    sep: '<rect x="3" y="4" width="7" height="7" fill="#4f86c4" stroke="#2b557f"/><rect x="14" y="13" width="7" height="7" fill="#4f86c4" stroke="#2b557f"/><path d="M11 12l2 0" stroke="#f0a030" stroke-width="1.8" stroke-dasharray="1.5 1.5"/>',
    mass: '<path d="M7 9h10l2 11H5z" fill="#4f86c4" stroke="#2b557f"/><circle cx="12" cy="6" r="2.2" stroke="#9cc4ee"/>',
    back: '<path d="M10 6l-6 6 6 6M4 12h16" stroke="#e8eef5" stroke-width="1.8"/>',
    save: '<path d="M5 4h11l3 3v13H5z" fill="#1f2a36" stroke="#9cc4ee"/><rect x="8" y="4" width="7" height="5" fill="#4f86c4"/><rect x="8" y="13" width="8" height="6" fill="#e8eef5"/>',
    discard: '<path d="M6 6l12 12M18 6L6 18" stroke="#e57373" stroke-width="1.8"/>',
    dup: '<rect x="8" y="8" width="11" height="12" fill="#1f2a36" stroke="#9cc4ee"/><path d="M5 16V4h11" stroke="#9cc4ee"/><path d="M13.5 11v6M10.5 14h6" stroke="#f0a030" stroke-width="1.6"/>',
    drawing: '<path d="M3 2h13l5 5v15H3z" fill="#e8eef5" stroke="#9cc4ee"/><rect x="5.5" y="5" width="4.5" height="3.5" fill="#3d6fa8"/><rect x="5.5" y="10" width="4.5" height="4.5" fill="#4f86c4"/><rect x="11.5" y="10" width="3.5" height="4.5" fill="#3d6fa8"/>'
  };
  function dwIco(k, n) { n = n || 16; return '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + (DW_IC[k] || '') + '</svg>'; }
  // ribbon pieces: vi text + data-en (applyLang swaps them)
  function dwEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function dwT(vi, en) { return '<span data-en="' + dwEsc(en) + '">' + dwEsc(vi) + '</span>'; }
  function dwTip(vi, en) { return ' title="' + dwEsc(vi) + '" data-en-title="' + dwEsc(en) + '"'; }
  function dwBB(attr, ic, vi, en, tv, te) { return '<button class="bb" ' + attr + dwTip(tv || vi, te || en) + '>' + dwIco(ic, 30) + dwT(vi, en) + '</button>'; }
  function dwSB(attr, ic, vi, en, tv, te) { return '<button class="sb" ' + attr + dwTip(tv || vi, te || en) + '>' + dwIco(ic, 16) + dwT(vi, en) + '</button>'; }
  function dwGrp(vi, en, body) { return '<div class="rgrp"><div class="rbody">' + body + '</div><div class="rtitle" data-en="' + dwEsc(en) + '">' + dwEsc(vi) + '</div></div>'; }
  function dwCol(body) { return '<div class="rcol">' + body + '</div>'; }
  function dwSel(bind, tv, te) { return '<select data-bind="' + bind + '"' + dwTip(tv, te) + '></select>'; }
  function dwSlider(vi, en, rng, num, tv, te) {
    return '<div class="dwsRow"' + dwTip(tv, te) + '>' + dwT(vi, en) + '<input type="range" data-bind="' + rng + '"><input type="number" data-bind="' + num + '"></div>';
  }
  function dwSheetGrp() {
    return dwGrp('Sheet', 'Sheet', dwBB('data-act="newSheet"', 'sheet', 'Sheet mới', 'New Sheet', 'Tạo Sheet mới trong bản vẽ', 'Add a new sheet to the drawing') +
      dwCol('<div class="dwsRow">' + dwSel('v6Paper', 'Khổ giấy', 'Paper size') + dwSel('v6Ori', 'Hướng giấy', 'Orientation') + '</div>' +
        dwSB('data-act="fit"', 'fit', 'Vừa khung', 'Fit to Sheet', 'Cả tờ giấy vừa khung nhìn (bấm đúp chỗ trống cũng được)', 'Whole sheet in view (or double-click an empty spot)') +
        dwSB('data-act="props" data-on="props"', 'props', 'Bảng thuộc tính', 'Properties', 'Ẩn / hiện bảng thuộc tính Sheet bên phải', 'Show / hide the sheet properties on the right')));
  }
  function dwDisplayGrp() {
    return dwGrp('Hiển thị', 'Display', dwCol(dwSB('data-chk="#v6Edge"', 'edge', 'Nét cạnh', 'Show Edges') + dwSB('data-chk="#v6Hid"', 'hid', 'Nét khuất', 'Hidden Lines')) +
      dwCol('<div class="dwsRow">' + dwT('Màu', 'Colour') + dwSel('v6Col', 'Tô bóng / một màu / trắng (nét vẽ)', 'Shaded / one colour / white (line drawing)') + '</div>' +
        '<div class="dwsRow">' + dwT('Sáng', 'Light') + dwSel('v6Light', 'Ánh sáng', 'Lighting') + '</div>'));
  }
  function dwOutGrp() {
    return dwGrp('Chú thích', 'Annotate', dwBB('data-click="#v6AddT"', 'text', 'Thêm chữ', 'Add Text', 'Thêm ghi chú chữ (kéo để dời, bấm đúp để sửa, Delete để xoá)', 'Add a text note (drag to move, double-click to edit, Delete to remove)')) +
      dwGrp('Xuất', 'Export', dwCol(dwSB('data-act="png"', 'png', 'PNG', 'PNG', 'Xuất Sheet này thành ảnh PNG', 'Export this sheet as PNG') + dwSB('data-act="jpg"', 'jpg', 'JPG', 'JPG', 'Xuất Sheet này thành ảnh JPG', 'Export this sheet as JPG') +
        dwSB('data-click="#v6Copy"', 'copy', 'Chép ảnh', 'Copy', 'Chép ảnh Sheet vào clipboard', 'Copy the sheet picture to the clipboard')));
  }
  function dwRibbonHtml() {
    const v = function (k, vi, en) { return dwSB('data-chk=".v6v[data-v=' + k + ']"', 'front', vi, en, 'Bật / tắt view ' + vi, 'Show / hide the ' + en); };
    const six = dwSheetGrp() +
      dwGrp('Tạo view', 'View Creation', dwCol(v('front', 'Trước', 'Front View') + v('top', 'Trên', 'Top View') + v('bottom', 'Dưới', 'Bottom View')) +
        dwCol(v('left', 'Trái', 'Left View') + v('right', 'Phải', 'Right View') + v('back', 'Sau', 'Rear View')) +
        dwBB('data-chk="#v6Iso"', 'iso', 'Iso', 'Isometric', 'Bật / tắt hình chiếu iso', 'Show / hide the isometric view') +
        dwBB('data-act="all6"', 'six', 'Đủ 6 view', 'All 6 Views', 'Bật cả 6 view (góc chiếu thứ ba)', 'Show all six views (third angle)')) +
      dwGrp('Bố trí', 'View Layout', dwBB('data-click="#v6Auto"', 'arrange', 'Xếp tự động', 'Auto Arrange', 'Xếp lại các view về vị trí tự động (bỏ vị trí kéo tay)', 'Put the views back in the automatic layout (drops hand placements)') +
        dwCol(dwSB('data-click="#v6RotZ"', 'rotR', 'Xoay 90°', 'Rotate 90°', 'Xoay mô hình 90° quanh trục đứng (đổi mặt Trước)', 'Turn the model 90° about the vertical axis (changes the Front)') +
          dwSB('data-click="#v6RotZm"', 'rotL', 'Xoay -90°', 'Rotate -90°', 'Xoay mô hình -90° quanh trục đứng', 'Turn the model -90° about the vertical axis') +
          dwSB('data-click="#v6Tip"', 'tip', 'Lật 90°', 'Flip 90°', 'Lật mô hình 90° quanh trục ngang', 'Tip the model 90° about the horizontal axis'))) +
      dwDisplayGrp() +
      dwGrp('Thuộc tính view', 'View Properties', dwCol('<div class="dwsRow">' + dwT('Tỉ lệ', 'Scale') + dwSel('v6Scale', 'Tỉ lệ bản vẽ', 'Drawing scale') + '</div>' +
          dwSlider('Cỡ', 'Size', 'v6ZmR', 'v6Zm', 'Cỡ hình khi tỉ lệ là Vừa khổ (%)', 'Picture size with Fit scale (%)') +
          dwSlider('Iso', 'Iso', 'v6IsoKR', 'v6IsoK', 'Cỡ hình iso (%)', 'Size of the iso picture (%)')) +
        dwCol(dwSB('data-chk="#v6Lbl"', 'name', 'Tên view', 'View Names') + dwSB('data-chk="#v6Dim"', 'dim', 'Kích thước', 'Dimensions', 'Kích thước bao', 'Overall dimensions') + dwSB('data-chk="#v6ScN"', 'scale', 'Ghi tỉ lệ', 'Scale Note'))) +
      dwOutGrp();
    const exp = dwSheetGrp() +
      dwGrp('Explode', 'Explode', dwCol(dwSlider('Độ tách', 'Distance', 'v6ExR', 'v6Ex', 'Mức tách các linh kiện ra khỏi tâm cụm (%)', 'How far the parts move out from the centre (%)') +
          dwSB('data-act="resetExp"', 'reset', 'Bỏ vị trí kéo tay', 'Reset Explode', 'Đưa các linh kiện về vị trí tách tự động', 'Put the parts back where the automatic explode places them') +
          dwSB('data-click="#v6Auto"', 'arrange', 'Xếp tự động', 'Auto Arrange', 'Xếp lại toàn bộ (linh kiện, ô tổng khối lượng)', 'Lay everything out again (parts, totals box)')) +
        dwBB('data-act="comb"', 'comb', 'Combine', 'Combine', 'Gộp các linh kiện cùng khối lượng vào linh kiện đang chọn trên bản vẽ (hoặc chuột phải lên linh kiện)', 'Combine parts of the same mass into the part picked on the sheet (or right-click a part)') +
        dwBB('data-act="sep"', 'sep', 'Tách ra', 'Separate', 'Tách nhóm của linh kiện đang chọn', 'Split the group of the picked part')) +
      dwGrp('Sắp xếp', 'Arrangement', dwCol(dwSB('data-click="#v6RotZ"', 'rotR', 'Xoay 90°', 'Rotate 90°', 'Xoay cả cụm 90° quanh trục đứng', 'Turn the assembly 90° about the vertical axis') +
          dwSB('data-click="#v6RotZm"', 'rotL', 'Xoay -90°', 'Rotate -90°', 'Xoay cả cụm -90° quanh trục đứng', 'Turn the assembly -90° about the vertical axis') +
          dwSB('data-click="#v6Tip"', 'tip', 'Lật 90°', 'Flip 90°', 'Lật cả cụm 90° quanh trục ngang', 'Tip the assembly 90° about the horizontal axis')) +
        dwCol(dwSlider('Xoay', 'Turn', 'v6AzR', 'v6Az', 'Góc nhìn quanh trục đứng (°)', 'View angle about the vertical axis (°)') +
          dwSlider('Nghiêng', 'Tilt', 'v6ElR', 'v6El', 'Góc nhìn từ trên xuống (°)', 'Angle looking down (°)'))) +
      dwGrp('Thông tin', 'Information', dwCol(dwSB('data-chk="#v6PN"', 'name', 'Tên linh kiện', 'Component Name') + dwSB('data-chk="#v6PM"', 'mass', 'Vật liệu + khối lượng', 'Material + Mass') +
        dwSB('data-chk="#v6Tot"', 'mass', 'Tổng khối lượng', 'Total Mass', 'Tổng khối lượng theo vật liệu (góc dưới phải, kéo để dời)', 'Total mass per material (bottom right, drag to move)'))) +
      dwDisplayGrp() + dwOutGrp();
    return '<div class="rpage" data-k="6v">' + six + '</div><div class="rpage" data-k="exp">' + exp + '</div>';
  }
  // ---------- building the workspace
  (function () {
    const w = document.createElement('div'); w.id = 'dws';
    w.innerHTML =
      '<div id="dwsHd"><span class="dwsLogo">' + dwIco('drawing', 20) + 'Drawing Workspace</span><span class="dwsDoc" id="dwsDocName"></span><span class="grow"></span>' +
      '<button id="dwsSaveDoc"' + dwTip('Lưu tài liệu: ghi cả phiên (.mrtl) gồm mọi Sheet — Ctrl+Shift+S để lưu thành file khác', 'Save document: writes the session (.mrtl) with every sheet — Ctrl+Shift+S saves as another file') + '>' + dwIco('save') + dwT('Lưu tài liệu', 'Save Document') + '</button>' +
      '<button id="dwsBack" class="primary"' + dwTip('Quay lại 3D Workspace (bản vẽ vẫn giữ nguyên)', 'Back to the 3D workspace (the drawing stays as it is)') + '>' + dwIco('back') + dwT('3D Workspace', '3D Workspace') + '</button></div>' +
      '<div id="dwsTop"><div id="dwsTabs"><button class="rtab" data-k="6v">6 Views</button><button class="rtab" data-k="exp">Exploded View</button></div>' +
      '<div id="dwsRibbon" class="ribfit">' + dwRibbonHtml() + '</div></div>' +
      '<div id="dwsMid"><div id="dwsCanvas"></div><div id="dwsSplit"' + dwTip('Kéo để đổi bề rộng cột bên phải', 'Drag to resize the right column') + '></div><div id="dwsSide">' +
      '<div class="dwsPh">' + dwIco('drawing', 14) + dwT('Drawing Tree', 'Drawing Tree') + '<span class="grow"></span><button id="dwsTreeAdd"' + dwTip('Sheet mới', 'New sheet') + '>+</button></div>' +
      '<div id="dwsTree"></div>' +
      '<div class="dwsPh">' + dwIco('props', 14) + dwT('Thuộc tính Sheet', 'Sheet Properties') + '</div><div id="dwsProps"></div></div></div>' +
      '<div id="dwsBar"><div id="dwsTabsS"></div><span id="dwsState"></span><div class="dwsBtns">' +
      '<button id="dwsSave" class="primary"' + dwTip('Lưu Sheet hiện tại (Ctrl+S): giữ toàn bộ view, vị trí, tỉ lệ, hiển thị, ghi chú', 'Save the current sheet (Ctrl+S): keeps every view, position, scale, display setting and note') + '>' + dwIco('save') + dwT('Save', 'Save') + '</button>' +
      '<button id="dwsDiscard"' + dwTip('Bỏ các thay đổi chưa lưu của Sheet hiện tại (về lần Save trước)', 'Drop the unsaved changes of the current sheet (back to its last Save)') + '>' + dwIco('discard') + dwT('Discard', 'Discard') + '</button>' +
      '<button id="dwsDup"' + dwTip('Nhân bản Sheet hiện tại (Ctrl+D)', 'Duplicate the current sheet (Ctrl+D)') + '>' + dwIco('dup') + dwT('Duplicate', 'Duplicate') + '</button></div></div>';
    document.body.appendChild(w);
    // the drawing engine's sheet window and panel live inside the workspace
    const cv = $('v6Sheet'), pp = $('pop_v6');
    [cv, pp].forEach(function (el) { el.style.left = el.style.top = el.style.width = el.style.height = el.style.right = ''; });
    $('dwsCanvas').appendChild(cv); $('dwsProps').appendChild(pp);
    // ribbon selects copy their options from the panel
    w.querySelectorAll('#dwsRibbon select[data-bind]').forEach(function (sel) {
      const src = $(sel.dataset.bind);
      Array.from(src.options).forEach(function (o) { const n = o.cloneNode(true); n.removeAttribute('data-vi'); sel.appendChild(n); });
    });
    w.querySelectorAll('#dwsRibbon input[data-bind]').forEach(function (inp) {
      const src = $(inp.dataset.bind); ['min', 'max', 'step'].forEach(function (a) { if (src.hasAttribute(a)) inp.setAttribute(a, src.getAttribute(a)); });
    });
    if (lang === 'en') {
      w.querySelectorAll('[data-en]').forEach(function (el) { el.dataset.vi = el.innerHTML; el.innerHTML = el.dataset.en; });
      w.querySelectorAll('[data-en-title]').forEach(function (el) { el.dataset.viTitle = el.title; el.title = el.dataset.enTitle; });
    }
  })();
  // ribbon -> panel controls (the panel stays the one place the drawing reads its settings from)
  function dwFire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  const DW_ACT = {
    newSheet: dwNewSheet,
    fit: function () { v6Fit(); },
    props: function () { $('dwsProps').classList.toggle('off'); dwSyncRibbon(); },
    all6: function () { document.querySelectorAll('.v6v').forEach(function (c) { if (!c.checked) { c.checked = true; dwFire(c); } }); },
    png: function () { dwExport(null, 'png').catch(showError); },
    jpg: function () { dwExport(null, 'jpg').catch(showError); },
    resetExp: function () { V6S.off = {}; v6Preview(); },
    comb: function () {
      if (V6S.psel === null || V6S.psel === undefined) { flash(L('Bấm chọn một linh kiện trên bản vẽ trước', 'Pick a part on the sheet first')); return; }
      v6CombStart(V6S.psel);
    },
    sep: function () {
      if (V6S.psel === null || V6S.psel === undefined || !(V6S.grp[V6S.psel] || []).length) { flash(L('Linh kiện đang chọn chưa gộp nhóm', 'The picked part is not combined')); return; }
      v6Uncomb(V6S.psel);
    }
  };
  $('dwsRibbon').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act && DW_ACT[b.dataset.act]) DW_ACT[b.dataset.act]();
    else if (b.dataset.click) $(b.dataset.click.slice(1)).click();
    else if (b.dataset.chk) { const c = document.querySelector(b.dataset.chk); if (c) { c.checked = !c.checked; dwFire(c); } }
    dwSyncRibbon();
  });
  $('dwsRibbon').addEventListener('input', function (e) {
    const el = e.target; if (!el.dataset || !el.dataset.bind) return;
    const t = $(el.dataset.bind); t.value = el.value; dwFire(t); dwSyncRibbon();
  });
  $('dwsRibbon').addEventListener('change', function (e) {
    const el = e.target; if (!el.dataset || !el.dataset.bind || el.tagName !== 'SELECT') return;
    const t = $(el.dataset.bind); t.value = el.value; dwFire(t); dwSyncRibbon();
  });
  $('dwsRibbon').addEventListener('keydown', function (e) { if (e.target.tagName === 'INPUT') e.stopPropagation(); });
  function dwSyncRibbon() {
    const r = $('dwsRibbon');
    r.querySelectorAll('[data-bind]').forEach(function (el) { const t = $(el.dataset.bind); if (t && document.activeElement !== el && el.value !== t.value) el.value = t.value; });
    r.querySelectorAll('button[data-chk]').forEach(function (b) { const c = document.querySelector(b.dataset.chk); b.classList.toggle('on', !!(c && c.checked)); });
    r.querySelectorAll('button[data-on=props]').forEach(function (b) { b.classList.toggle('on', !$('dwsProps').classList.contains('off')); });
    const sel = V6S.psel !== null && V6S.psel !== undefined;
    r.querySelectorAll('button[data-act=comb]').forEach(function (b) { b.classList.toggle('hl', V6S.comb !== null); });
    r.querySelectorAll('button[data-act=sep]').forEach(function (b) { b.disabled = !(sel && (V6S.grp[V6S.psel] || []).length); });
  }
  function dwTabSet(k) {
    k = k === 'exp' ? 'exp' : '6v';
    document.querySelectorAll('#dwsTabs .rtab').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); });
    document.querySelectorAll('#dwsRibbon .rpage').forEach(function (p) { p.classList.toggle('on', p.dataset.k === k); });
    if (V6S.mode !== k) v6SetMode(k);
    if (DW.open) setTimeout(function () { ribFit($('dwsRibbon')); }, 0);
    dwSyncRibbon();
  }
  document.querySelectorAll('#dwsTabs .rtab').forEach(function (b) { b.addEventListener('click', function () { dwTabSet(b.dataset.k); }); });
  // ---------- tree + sheet bar
  function dwStatus(s) { return s.dirty ? ['mod', L('Đã sửa', 'Modified'), L('Có thay đổi chưa Save', 'Has changes not saved')] : ['ok', L('Đã lưu', 'Saved'), L('Đã Save', 'Saved')]; }
  function dwRefresh(force) {
    if (!DW.open && !force) return;
    const d = dwDoc();
    const sig = [lang, dwDocName(), d.active].concat(d.sheets.map(function (s) { return s.id + '|' + s.name + '|' + (s.dirty ? 1 : 0); })).join('\n');
    if (!force && sig === DW.sig) { dwSyncRibbon(); return; }
    if (DW.ren) return;   // renaming: redraw after
    DW.sig = sig;
    $('dwsDocName').textContent = dwDocName();
    const tr = $('dwsTree'); tr.innerHTML = '';
    const root = document.createElement('div'); root.className = 'dwsNode root'; root.dataset.root = '1';
    root.innerHTML = dwIco('drawing', 15) + '<span class="nm"></span>'; root.querySelector('.nm').textContent = dwDocName(); root.title = dwDocName();
    tr.appendChild(root);
    const bar = $('dwsTabsS'); bar.innerHTML = '';
    d.sheets.forEach(function (s) {
      const st = dwStatus(s);
      const n = document.createElement('div'); n.className = 'dwsNode sheet' + (s.id === d.active ? ' on' : ''); n.dataset.id = s.id; n.draggable = true;
      n.innerHTML = dwIco('sheet', 15) + '<span class="nm"></span><span class="st ' + st[0] + '" title="' + dwEsc(st[2]) + '">● ' + dwEsc(st[1]) + '</span>';
      n.querySelector('.nm').textContent = s.name; tr.appendChild(n);
      const t = document.createElement('div'); t.className = 'dwsTab' + (s.id === d.active ? ' on' : ''); t.dataset.id = s.id; t.draggable = true;
      t.innerHTML = '<span class="nm"></span><span class="st ' + st[0] + '" title="' + dwEsc(st[2]) + '">●</span>'; t.querySelector('.nm').textContent = s.name;
      bar.appendChild(t);
    });
    const add = document.createElement('div'); add.className = 'dwsTab add'; add.textContent = '+'; add.dataset.add = '1'; add.title = L('Sheet mới', 'New sheet'); bar.appendChild(add);
    const cur = dwCur(), cs = dwStatus(cur);
    $('dwsState').innerHTML = '<span></span> · <b class="' + cs[0] + '">' + dwEsc(cs[1]) + '</b>'; $('dwsState').firstChild.textContent = cur.name;
    dwSyncRibbon();
  }
  // inline rename in the tree or on a sheet tab
  function dwStartRename(el, id) {
    if (DW.ren) DW.ren.done(true);
    const nm = el.querySelector('.nm'), old = id ? dwSheet(id).name : dwDocName();
    const inp = document.createElement('input'); inp.value = old; nm.textContent = ''; nm.appendChild(inp); inp.focus(); inp.select();
    const ren = { done: function (ok) {
      if (DW.ren !== ren) return; DW.ren = null;
      const v = inp.value; if (ok) { if (id) dwRenameSheet(id, v); else dwRenameDoc(v); }
      dwRefresh(true);
    } };
    DW.ren = ren;
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') ren.done(true); else if (e.key === 'Escape') ren.done(false); });
    inp.addEventListener('blur', function () { ren.done(true); });
    inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }
  function dwNodeOf(e) { return e.target.closest('.dwsNode, .dwsTab'); }
  ['dwsTree', 'dwsTabsS'].forEach(function (cid) {
    const c = $(cid);
    c.addEventListener('click', function (e) {
      const n = dwNodeOf(e); if (!n || DW.ren) return;
      if (n.dataset.add) dwNewSheet(); else if (n.dataset.id) dwOpenSheet(n.dataset.id);
    });
    c.addEventListener('dblclick', function (e) { const n = dwNodeOf(e); if (!n || n.dataset.add) return; dwStartRename(n, n.dataset.id || null); });
    c.addEventListener('contextmenu', function (e) {
      e.preventDefault(); const n = dwNodeOf(e); if (!n || n.dataset.add) return;
      if (n.dataset.root) {
        showMenu([[L('Sheet mới', 'New Sheet'), dwNewSheet, 'dup'], [L('Đổi tên bản vẽ', 'Rename Drawing'), function () { dwStartRename(n, null); }, 'ren']], e.clientX, e.clientY);
        return;
      }
      const id = n.dataset.id;
      showMenu([[L('Mở', 'Open'), function () { dwOpenSheet(id); }, 'show'], [L('Đổi tên', 'Rename'), function () { dwStartRename(n, id); }, 'ren'],
        [L('Nhân bản', 'Duplicate'), function () { dwDupSheet(id); }, 'dup'], [L('Xoá', 'Delete'), function () { dwDelSheet(id); }, 'del'], null,
        [L('Xuất PNG', 'Export as PNG'), function () { dwExport(id, 'png').catch(showError); }, 'stl'], [L('Xuất JPG', 'Export as JPG'), function () { dwExport(id, 'jpg').catch(showError); }, 'stl']], e.clientX, e.clientY);
    });
    // reorder by drag and drop
    c.addEventListener('dragstart', function (e) { const n = dwNodeOf(e); if (!n || !n.dataset.id) { e.preventDefault(); return; } DW.drag = n.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', n.dataset.id); } catch (er) { } });
    c.addEventListener('dragover', function (e) {
      if (!DW.drag) return; const n = dwNodeOf(e); e.preventDefault();
      c.querySelectorAll('.dragover').forEach(function (x) { x.classList.remove('dragover'); });
      if (n && (n.dataset.id || n.dataset.add)) n.classList.add('dragover');
    });
    c.addEventListener('drop', function (e) {
      e.preventDefault(); const n = dwNodeOf(e), id = DW.drag; DW.drag = null;
      c.querySelectorAll('.dragover').forEach(function (x) { x.classList.remove('dragover'); });
      if (!id || !n) return;
      if (n.dataset.add || n.dataset.root) dwMoveSheet(id, n.dataset.root ? dwDoc().sheets[0].id : null);
      else dwMoveSheet(id, n.dataset.id);
    });
    c.addEventListener('dragend', function () { DW.drag = null; c.querySelectorAll('.dragover').forEach(function (x) { x.classList.remove('dragover'); }); });
  });
  $('dwsTreeAdd').addEventListener('click', dwNewSheet);
  $('dwsSave').addEventListener('click', dwSaveSheet);
  $('dwsDiscard').addEventListener('click', dwDiscard);
  $('dwsDup').addEventListener('click', function () { dwDupSheet(); });
  $('dwsBack').addEventListener('click', dwClose);
  $('dwsSaveDoc').addEventListener('click', function () { dwCapture(); saveSession().catch(showError); });
  $('b_dws').addEventListener('click', dwOpen);
  // right column width
  (function () {
    try { const w = +localStorage.getItem('mx.dwsSide'); if (w > 200) DW.side = w; } catch (e) { }
    $('dwsSide').style.width = DW.side + 'px';
    let dr = null;
    $('dwsSplit').addEventListener('mousedown', function (e) { dr = { x: e.clientX, w: $('dwsSide').offsetWidth }; e.preventDefault(); });
    window.addEventListener('mousemove', function (e) { if (!dr) return; DW.side = Math.max(220, Math.min(window.innerWidth * 0.5, dr.w - (e.clientX - dr.x))); $('dwsSide').style.width = DW.side + 'px'; });
    window.addEventListener('mouseup', function () { if (!dr) return; dr = null; try { localStorage.setItem('mx.dwsSide', DW.side); } catch (e) { } v6Preview(); ribFit($('dwsRibbon')); });
  })();
  // keys while drawing: Ctrl+S = Save Sheet, Ctrl+Shift+S = save the document as another file, Ctrl+D = duplicate sheet;
  // the 3D workspace's shortcuts do not act (its undo would change the model behind the drawing)
  window.addEventListener('keydown', function (e) {
    if (!DW.open) return;
    const k = (e.key || '').toLowerCase(), tag = e.target && e.target.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && ['checkbox', 'radio', 'range', 'color', 'button'].indexOf(e.target.type) < 0);
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 's') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) { dwCapture(); saveSessionAs().catch(showError); } else dwSaveSheet(); return; }
      if (k === 'd') { e.preventDefault(); e.stopPropagation(); dwDupSheet(); return; }
      if ((k === 'z' || k === 'y') && !typing) { e.preventDefault(); e.stopPropagation(); flash(L('Hoàn tác trong Drawing chưa có — dùng Discard để về lần Save trước', 'Undo is not in Drawing yet — Discard goes back to the last Save')); return; }
    }
    if (typing) return;
    e.stopPropagation();
  }, true);
  // follow the canvas: working copy, Modified / Saved, ribbon states
  setInterval(function () { if (!DW.open || DW.ren) return; dwCapture(); dwRefresh(false); }, 500);
  window.addEventListener('resize', function () { if (DW.open) ribFit($('dwsRibbon')); });
