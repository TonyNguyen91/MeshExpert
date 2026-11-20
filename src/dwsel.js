  // ===================== Drawing: bodies of each sheet =====================
  // A sheet draws every body of the 3D model; it can hide some of them for itself (state.hide, by body uid). The list in
  // the Drawing Tree shows them all with an eye to hide / show. "Create Drawing Sheet" (3D menu) makes a sheet that shows
  // only the picked bodies (the others hidden in it).
  function dwSrcHide(uid, on) {
    const i = V6S.hide.indexOf(uid);
    if (on && i < 0) V6S.hide.push(uid); else if (!on && i >= 0) V6S.hide.splice(i, 1); else return;
    V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
  // show only these bodies in the open sheet (null = show every body)
  function dwSrcOnly(uids) {
    V6S.hide = uids ? S.bodies.map(function (b) { return b.uid; }).filter(function (u) { return uids.indexOf(u) < 0; }) : [];
    V6S.prev = null; v6Preview(); dwCapture(); dwRefresh(true);
  }
  // 3D: right-click > Create Drawing Sheet -> a new sheet showing the picked bodies
  function dwCreateFromSel() {
    const sel = S.bodies.filter(function (b) { return S.sel.has(b); });
    if (!sel.length) { flash(L('Chọn body trong 3D trước', 'Pick bodies in 3D first')); return; }
    if (!DW.open) dwOpen();
    const s = dwNewSheet(sel.map(function (b) { return b.uid; }));
    flash(L('Đã tạo ', 'Created ') + s.name + ' (' + sel.length + ' body)');
  }
