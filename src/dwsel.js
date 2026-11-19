
  // ===================== Drawing: source bodies of a sheet =====================
  // Source bodies = the bodies a sheet is made from (list of stable body ids, V6S.src of the open sheet; null = follow the
  // bodies shown in 3D). Hidden bodies (V6S.hide) stay sources but are not drawn. Displayed = sources - hidden.
  // Picked in the Source Bodies panel, or in the 3D viewport with the normal selection (click / Ctrl+click), Enter to use
  // the picked bodies, Esc to go back; or right-click bodies in 3D > Create Drawing Sheet.
  const DWS = { chk: null, hid: null, q: '' };
  function dwBodyType(b) { return b.solid ? 'B-rep' : 'Mesh'; }
  function dwSrcOpen(keep) {
    dwCapture();
    if (!keep) {
      const s = dwCur();
      DWS.chk = new Set(V6S.src ? V6S.src : v6Live().map(function (b) { return b.uid; }));
      DWS.hid = new Set(V6S.hide); DWS.q = ''; DWS.miss = V6S.src ? V6S.src.filter(function (u) { return !dwBodyByUid(u); }) : []; DWS.sheet = s.id;
    }
    $('dwsSrcQ').value = DWS.q;
    dwSrcList(); $('dwsSrc').classList.add('on'); $('dwsSrcQ').focus();
  }
  function dwSrcRows() {
    const rows = S.bodies.map(function (b) { return { uid: b.uid, name: b.name, type: dwBodyType(b), miss: false }; });
    for (const u of (DWS.miss || [])) rows.push({ uid: u, name: dwSnapName(u, dwSheet(DWS.sheet)), type: '—', miss: true });
    return rows;
  }
  function dwSrcList() {
    const q = DWS.q.trim().toLowerCase(), list = $('dwsSrcL'); list.innerHTML = '';
    const rows = dwSrcRows();
    for (const r of rows) {
      if (q && r.name.toLowerCase().indexOf(q) < 0) continue;
      const el = document.createElement('label'); el.className = 'dwsSrcR' + (r.miss ? ' miss' : ''); el.dataset.uid = r.uid;
      el.innerHTML = '<input type="checkbox" class="c"><span class="nm"></span><span class="ty"></span><button class="eye" type="button"></button>';
      el.querySelector('.c').checked = DWS.chk.has(r.uid);
      el.querySelector('.nm').textContent = r.name;
      el.querySelector('.ty').textContent = r.miss ? L('Mất', 'Missing') : r.type;
      const eye = el.querySelector('.eye'), hid = DWS.hid.has(r.uid);
      eye.textContent = hid ? L('Đang ẩn', 'Hidden') : L('Hiện', 'Shown'); eye.classList.toggle('off', hid); eye.disabled = !DWS.chk.has(r.uid);
      eye.title = L('Ẩn tạm trong bản vẽ (vẫn là body nguồn)', 'Hide in the drawing for now (stays a source body)');
      list.appendChild(el);
    }
    const n = rows.filter(function (r) { return DWS.chk.has(r.uid); }).length;
    $('dwsSrcN').textContent = L('Đã chọn ', 'Selected ') + n + ' / ' + rows.length;
  }
  function dwSrcApply() {
    const rows = dwSrcRows(), src = rows.map(function (r) { return r.uid; }).filter(function (u) { return DWS.chk.has(u); });
    if (!src.length) { flash(L('Chọn ít nhất một body', 'Pick at least one body')); return; }
    V6S.src = src; V6S.hide = src.filter(function (u) { return DWS.hid.has(u); });
    const s = dwCur(); dwBaseline(s, src);
    $('dwsSrc').classList.remove('on'); V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
  function dwSrcCancel() { $('dwsSrc').classList.remove('on'); }
  // ---------- picking in the 3D viewport
  function dwPickStart() {
    DW.pick = true; $('dwsSrc').classList.remove('on');
    S.sel.clear(); for (const b of S.bodies) if (DWS.chk.has(b.uid)) S.sel.add(b);
    if (typeof refresh === 'function') refresh();
    document.body.classList.remove('dws-on'); $('dwsPick').classList.add('on'); dwPickCount();
    if (typeof dirty !== 'undefined') dirty = true;
  }
  function dwPickCount() { if (DW.pick) $('dwsPickN').textContent = L('Dùng ', 'Use ') + S.sel.size + L(' body đang chọn (Enter)', ' picked bodies (Enter)'); }
  function dwPickEnd(ok) {
    if (!DW.pick) return;
    DW.pick = false; $('dwsPick').classList.remove('on'); document.body.classList.add('dws-on');
    if (ok) { DWS.chk = new Set(Array.from(S.sel).map(function (b) { return b.uid; })); DWS.hid = new Set(Array.from(DWS.hid).filter(function (u) { return DWS.chk.has(u); })); }
    dwSrcOpen(true);
  }
  // right-click in 3D: a new sheet made from the picked bodies
  function dwCreateFromSel() {
    const uids = (S.sel.size ? Array.from(S.sel) : S.bodies.filter(function (b) { return b.visible; })).map(function (b) { return b.uid; });
    if (!DW.open) dwOpen();
    dwNewSheet(uids);
  }
  // ---------- tree: hide / show a source body, drop it from the sources
  function dwSrcHide(uid, on) {
    if (!V6S.src) V6S.src = v6Live().map(function (b) { return b.uid; });
    const i = V6S.hide.indexOf(uid);
    if (on && i < 0) V6S.hide.push(uid); else if (!on && i >= 0) V6S.hide.splice(i, 1);
    V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
  function dwSrcDrop(uid) {
    if (!V6S.src) V6S.src = v6Live().map(function (b) { return b.uid; });
    if (V6S.src.length <= 1) { flash(L('Sheet cần ít nhất một body nguồn', 'A sheet needs at least one source body')); return; }
    V6S.src = V6S.src.filter(function (u) { return u !== uid; }); V6S.hide = V6S.hide.filter(function (u) { return u !== uid; });
    V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
