
  // ===================== Drawing: source bodies =====================
  // Document level: ONE list of source bodies for the whole drawing (DW.doc.src, stable body ids), always shown in the
  // left column. A body deleted from the 3D model shows as missing there and can be replaced by another body (every
  // sheet, dimension and placement then refers to the new body; its sheets ask for an update).
  // Sheet level (Drawing Tree, right): the bodies of one sheet = V6S.src of the open sheet; null = every source body
  // (the default), or a list after bodies were removed; V6S.hide = bodies kept but not drawn.
  const DWS = { chk: null, q: '', mode: 'add', target: null };
  function dwBodyType(b) { return b.solid ? 'B-rep' : 'Mesh'; }
  function dwDocSrc() { const d = dwDoc(); if (!d.src) d.src = []; return d.src; }
  // sheets that use a source body
  function dwUsers(uid) { return dwDoc().sheets.filter(function (s) { return dwSrcOf(s).indexOf(uid) >= 0; }); }
  // ---------- left column
  function dwSrcRender() {
    const L2 = $('dwsSrcList'); if (!L2) return;
    const src = dwDocSrc(), d = dwDoc(); L2.innerHTML = '';
    $('dwsSrcCnt').textContent = '(' + src.length + ')';
    const changed = new Set(); d.sheets.forEach(function (s) { dwCheck(s).changed.forEach(function (u) { changed.add(u); }); });
    for (const u of src) {
      const b = dwBodyByUid(u), r = document.createElement('div'), n = dwUsers(u).length;
      r.className = 'dwsSrcI' + (b ? '' : ' miss') + (DW.bsel === u ? ' on' : ''); r.dataset.uid = u;
      r.innerHTML = '<span class="nm"></span><span class="ty"></span>' + (b ? (changed.has(u) ? '<span class="st upd" title="' + dwEsc(L('Hình trong 3D đã đổi, có Sheet cần cập nhật', 'Changed in 3D; some sheets need an update')) + '">⟳</span>' : '') :
        '<span class="st miss">✖ ' + dwEsc(L('Mất', 'Missing')) + '</span><button class="rep" type="button" title="' + dwEsc(L('Thay bằng một body khác của mô hình', 'Replace with another body of the model')) + '">' + dwEsc(L('Thay thế', 'Replace')) + '</button>') +
        '<span class="us" title="' + dwEsc(L('Số Sheet dùng body này', 'Sheets using this body')) + '">' + n + '</span>';
      r.querySelector('.nm').textContent = b ? b.name : dwSnapAny(u);
      r.querySelector('.ty').textContent = b ? dwBodyType(b) : '';
      if (!b) r.title = L('Body này đã bị xoá khỏi mô hình 3D — bản vẽ vẫn giữ hình cũ', 'This body was deleted from the 3D model — the drawing keeps its old shape');
      L2.appendChild(r);
    }
    if (!src.length) { const e = document.createElement('div'); e.className = 'dwsSrcE'; e.textContent = L('Chưa có body — bấm + để thêm', 'No body yet — press + to add'); L2.appendChild(e); }
  }
  function dwSnapAny(uid) { for (const s of dwDoc().sheets) { const r = s.rev && s.rev[uid]; if (r && DWU.snaps.has(r)) return DWU.snaps.get(r).name; } return uid; }
  // ---------- add / replace dialog (bodies of the model that are not sources yet)
  function dwSrcOpen(mode, target) {
    dwCapture();
    DWS.mode = mode || 'add'; DWS.target = target || null; DWS.chk = new Set(); DWS.q = '';
    $('dwsSrcT').textContent = DWS.mode === 'replace' ? L('Thay thế "', 'Replace "') + dwSnapAny(target) + L('" bằng…', '" with…') : L('Thêm vào Source Bodies', 'Add to the Source Bodies');
    $('dwsSrcAll').style.display = $('dwsSrcNone').style.display = DWS.mode === 'replace' ? 'none' : '';
    $('dwsSrcQ').value = ''; dwSrcList(); $('dwsSrc').classList.add('on'); $('dwsSrcQ').focus();
  }
  function dwSrcRows() {
    const src = dwDocSrc();
    return S.bodies.filter(function (b) { return src.indexOf(b.uid) < 0; }).map(function (b) { return { uid: b.uid, name: b.name, type: dwBodyType(b) }; });
  }
  function dwSrcList() {
    const q = DWS.q.trim().toLowerCase(), list = $('dwsSrcL'); list.innerHTML = '';
    const rows = dwSrcRows();
    for (const r of rows) {
      if (q && r.name.toLowerCase().indexOf(q) < 0) continue;
      const el = document.createElement('label'); el.className = 'dwsSrcR'; el.dataset.uid = r.uid;
      el.innerHTML = '<input type="' + (DWS.mode === 'replace' ? 'radio' : 'checkbox') + '" name="dwsrc" class="c"><span class="nm"></span><span class="ty"></span>';
      el.querySelector('.c').checked = DWS.chk.has(r.uid); el.querySelector('.nm').textContent = r.name; el.querySelector('.ty').textContent = r.type;
      list.appendChild(el);
    }
    if (!rows.length) { const e = document.createElement('div'); e.className = 'dwsSrcE'; e.textContent = L('Mọi body của mô hình đã có trong Source Bodies', 'Every body of the model is already a source body'); list.appendChild(e); }
    $('dwsSrcN').textContent = L('Đã chọn ', 'Selected ') + DWS.chk.size + ' / ' + rows.length;
  }
  function dwSrcApply() {
    const uids = dwSrcRows().map(function (r) { return r.uid; }).filter(function (u) { return DWS.chk.has(u); });
    if (!uids.length) { flash(L('Chọn ít nhất một body', 'Pick at least one body')); return; }
    $('dwsSrc').classList.remove('on');
    if (DWS.mode === 'replace') dwSrcReplace(DWS.target, uids[0]); else dwSrcAddUids(uids);
  }
  function dwSrcCancel() { $('dwsSrc').classList.remove('on'); }
  function dwSrcAddUids(uids) {
    const src = dwDocSrc(); let n = 0;
    for (const u of uids) if (src.indexOf(u) < 0 && dwBodyByUid(u)) { src.push(u); n++; }
    // sheets that take every source body get them; their revision starts now
    for (const s of dwDoc().sheets) dwBaseline(s, dwSrcOf(s));
    dwDoc().modified = Date.now(); V6S.prev = null; v6Preview(); DW.sig = ''; dwRefresh(true);
    if (n) flash(L('Đã thêm ', 'Added ') + n + L(' body vào Source Bodies', ' bodies to the Source Bodies'));
  }
  // in-app question (the browser's own confirm() can be switched off for a page, then it answers No without asking)
  function dwConfirm(title, msg, okText, cb) {
    const d = $('dwsDlg'), box = d.querySelector('.dwsDlgB');
    box.innerHTML = '<h3>' + dwEsc(title) + '</h3><p>' + dwEsc(msg) + '</p>';
    $('dwsDlgOk').style.display = ''; $('dwsDlgOk').textContent = okText; $('dwsDlgNo').textContent = L('Huỷ', 'Cancel');
    const x = $('dwsDlgX'); if (x) x.style.display = 'none';
    DW.dlg = function (ok) { d.classList.remove('on'); DW.dlg = null; if (ok) cb(); };
    d.classList.add('on');
  }
  // source bodies missing from the 3D model
  function dwSrcMissing() { return dwDocSrc().filter(function (u) { return !dwBodyByUid(u); }); }
  // remove source bodies (one uid or a list) from the document: the left list and every sheet; asks first when a sheet
  // still uses them
  function dwSrcRemoveDoc(uids) {
    uids = (Array.isArray(uids) ? uids : [uids]).filter(function (u) { return dwDocSrc().indexOf(u) >= 0; });
    if (!uids.length) return;
    const users = dwDoc().sheets.filter(function (s) { return uids.some(function (u) { return dwSrcOf(s).indexOf(u) >= 0; }); });
    const nm = uids.length === 1 ? '"' + (dwBodyByUid(uids[0]) ? dwBodyByUid(uids[0]).name : dwSnapAny(uids[0])) + '"' : uids.length + L(' body', ' bodies');
    if (!users.length) { dwSrcRemoveNow(uids); return; }
    dwConfirm(L('Bỏ khỏi Source Bodies', 'Remove from the Source Bodies'),
      L('Bỏ ' + nm + ' khỏi Source Bodies? Body sẽ biến mất khỏi ' + users.length + ' Sheet.', 'Remove ' + nm + ' from the Source Bodies? It leaves ' + users.length + ' sheet(s).'),
      L('Bỏ khỏi Source Bodies', 'Remove'), function () { dwSrcRemoveNow(uids); });
  }
  function dwSrcRemoveNow(uids) {
    dwCapture();
    const d = dwDoc(), out = function (u) { return uids.indexOf(u) < 0; };
    d.src = d.src.filter(out);
    const drop = function (st) { if (!st) return; if (Array.isArray(st.src)) st.src = st.src.filter(out); st.hide = (st.hide || []).filter(out); };
    for (const s of d.sheets) { drop(s.work); drop(s.saved); if (s.rev) uids.forEach(function (u) { delete s.rev[u]; }); }
    if (uids.indexOf(DW.bsel) >= 0) { DW.bsel = null; V6S.hl = null; }
    v6Put(dwCur().work); dwHistReset(dwCur()); d.modified = Date.now(); DW.sig = ''; dwRefresh(true);
    flash(L('Đã bỏ ', 'Removed ') + uids.length + L(' body khỏi Source Bodies', ' body(ies) from the Source Bodies'));
  }
  // a missing (or any) source body replaced by another body of the model, everywhere in the document
  function dwSrcReplace(oldU, newU) {
    if (!oldU || !newU || oldU === newU) return;
    dwCapture();
    const d = dwDoc(), nb = dwBodyByUid(newU); if (!nb) return;
    const oldId = dwIdOf(oldU), newId = nb.id, had = d.src.indexOf(newU) >= 0;
    d.src = d.src.map(function (u) { return u === oldU ? newU : u; }).filter(function (u, i, a) { return a.indexOf(u) === i; });
    const fixState = function (st) {
      const sw = function (arr) { return Array.isArray(arr) ? arr.map(function (u) { return u === oldU ? newU : u; }).filter(function (u, i, a) { return a.indexOf(u) === i; }) : arr; };
      st.src = sw(st.src); st.hide = sw(st.hide || []);
      for (const m of ['6v', 'exp']) for (const dm of ((st.dims || {})[m] || [])) { if (dm.a.uid === oldU) dm.a.uid = newU; if (dm.b.uid === oldU) dm.b.uid = newU; }
      return v6MapIds(st, function (k) { return +k === oldId ? newId : +k; });
    };
    for (const s of d.sheets) {
      s.work = fixState(s.work); s.saved = fixState(s.saved);
      // the sheet keeps showing the old shape and asks for an update to the new body
      if (s.rev && s.rev[oldU]) { if (!s.rev[newU] || !had) s.rev[newU] = s.rev[oldU]; delete s.rev[oldU]; }
    }
    v6Put(dwCur().work); dwHistReset(dwCur()); d.modified = Date.now(); DW.sig = ''; dwRefresh(true);
    flash(L('Đã thay bằng ', 'Replaced with ') + nb.name + L(' — các Sheet liên quan cần cập nhật', ' — the sheets using it need an update'));
  }
  // ---------- picking in the 3D viewport (to add, or to replace with the first picked body)
  function dwPickStart(mode, target) {
    DW.pick = { mode: mode || DWS.mode || 'add', target: target || DWS.target };
    $('dwsSrc').classList.remove('on');
    S.sel.clear(); if (typeof refresh === 'function') refresh();
    document.body.classList.remove('dws-on'); $('dwsPick').classList.add('on'); dwPickCount();
    if (typeof dirty !== 'undefined') dirty = true;
  }
  function dwPickCount() {
    if (!DW.pick) return;
    $('dwsPickN').textContent = DW.pick.mode === 'replace' ? L('Thay bằng body đang chọn (Enter)', 'Replace with the picked body (Enter)') : L('Thêm ', 'Add ') + S.sel.size + L(' body đang chọn (Enter)', ' picked bodies (Enter)');
  }
  function dwPickEnd(ok) {
    if (!DW.pick) return;
    const pk = DW.pick, sel = Array.from(S.sel).map(function (b) { return b.uid; });
    DW.pick = false; $('dwsPick').classList.remove('on'); document.body.classList.add('dws-on');
    if (!ok) return;
    if (pk.mode === 'replace') { if (sel.length) dwSrcReplace(pk.target, sel[0]); }
    else dwSrcAddUids(sel);
  }
  // right-click in 3D: a new sheet made from the picked bodies (added to the source bodies when needed)
  function dwCreateFromSel() {
    const uids = (S.sel.size ? Array.from(S.sel) : S.bodies.filter(function (b) { return b.visible; })).map(function (b) { return b.uid; });
    if (!DW.open) dwOpen();
    const src = dwDocSrc(); uids.forEach(function (u) { if (src.indexOf(u) < 0) src.push(u); });
    dwNewSheet(uids);
  }
  // ---------- bodies of one sheet (Drawing Tree): hide / show, remove, add back
  function dwSheetList() { return V6S.src ? V6S.src.slice() : dwDocSrc().slice(); }
  function dwSrcHide(uid, on) {
    const i = V6S.hide.indexOf(uid);
    if (on && i < 0) V6S.hide.push(uid); else if (!on && i >= 0) V6S.hide.splice(i, 1);
    V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
  function dwSrcDrop(uid) {
    const l = dwSheetList();
    // the last body may go only when it is missing from the model (nothing left to draw anyway)
    if (l.length <= 1 && dwBodyByUid(uid)) { flash(L('Sheet cần ít nhất một body', 'A sheet needs at least one body')); return; }
    V6S.src = l.filter(function (u) { return u !== uid; }); V6S.hide = V6S.hide.filter(function (u) { return u !== uid; });
    V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
  function dwSrcBack(uid) {
    const l = dwSheetList(); if (l.indexOf(uid) >= 0) return;
    const src = dwDocSrc(); l.push(uid);
    V6S.src = src.filter(function (u) { return l.indexOf(u) >= 0; });      // keep the document order
    if (V6S.src.length === src.length) V6S.src = null;                       // every source body again: follow the list
    dwBaseline(dwCur(), [uid]); V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
