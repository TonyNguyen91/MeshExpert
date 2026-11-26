  // ===================== Drawing: link to the 3D model =====================
  // Sheets always draw the bodies of the 3D model as they are now: there is no snapshot, no "update", no missing body.
  // Every body has a stable id (b.uid, kept in the session file); a sheet keeps only the list of bodies it hides
  // (state.hide). A body deleted in 3D simply leaves every sheet; a new body shows up in every sheet.
  const DWU = { hist: new Map() };
  function dwNewUid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  // every body needs its own uid (the drawing picks, hides and places bodies by it): give one to a body that has none
  // or shares it with an earlier body (undo steps made before v1.6.5 did not keep it)
  function dwFixUids() {
    const seen = new Set();
    for (const b of S.bodies) { if (!b.uid || seen.has(b.uid)) b.uid = dwNewUid(); seen.add(b.uid); }
  }
  function dwBodyByUid(uid) { return S.bodies.find(function (b) { return b.uid === uid; }) || null; }
  // drawing state keys (placements, groups) use body ids at run time and body uids in the file
  function dwIdOf(uid) { const b = dwBodyByUid(uid); return b ? b.id : undefined; }
  function dwUidOf(id) { id = +id; const b = S.bodies.find(function (x) { return x.id === id; }); return b ? b.uid : undefined; }
  // the bodies the open sheet draws: every body of the model but the ones this sheet hides
  function dwBodies() {
    if (!DW.doc) return v6Live();
    return S.bodies.filter(function (b) { return V6S.hide.indexOf(b.uid) < 0; });
  }
  function dwHideOf(s) { return ((s.id === dwDoc().active ? V6S.hide : s.work.hide) || []).filter(function (u) { return !!dwBodyByUid(u); }); }
  function dwViewsOf(s) {
    const st = s.id === dwDoc().active ? v6Grab() : s.work, m = st.mode === 'exp' ? 'exp' : '6v', c = st.cfg[m] || {};
    if (m === 'exp') return ['Exploded view'];
    const n = V6_ORDER.filter(function (k) { return c['v:' + k] === true; });
    if (c.v6Iso) n.push('iso');
    return n;
  }
  function dwViewName(n) { return n === 'iso' ? 'ISO' : n === 'Exploded view' ? n : L(V6_VIEWS[n].vi, V6_VIEWS[n].en); }
  // what changed for one sheet
  // ---------- undo / redo of a sheet (snapshots of its state as it changes)
  function dwHist(s) { let h = DWU.hist.get(s.id); if (!h) { h = { u: [], r: [], last: null }; DWU.hist.set(s.id, h); } return h; }
  function dwHistNote(s, j) {
    // compared by content (dwCanon): values the drawing only derives while drawing (dimension label anchors) are not steps
    const h = dwHist(s), c = dwCanon(JSON.parse(j));
    if (h.last !== null && h.lastC !== c) { h.u.push(h.last); if (h.u.length > 80) h.u.shift(); h.r = []; }
    h.last = j; h.lastC = c;
  }
  function dwHistReset(s) { const h = dwHist(s); h.last = JSON.stringify(v6Grab()); h.lastC = dwCanon(JSON.parse(h.last)); }
  function dwUndo(redo) {
    if (!DW.doc) return;
    dwCapture();
    const s = dwCur(), h = dwHist(s), from = redo ? h.r : h.u, to = redo ? h.u : h.r;
    if (!from.length) { flash(redo ? L('Không còn gì để làm lại', 'Nothing to redo') : L('Không còn gì để hoàn tác', 'Nothing to undo')); return; }
    to.push(h.last); const j = from.pop();
    s.work = JSON.parse(j); v6Put(s.work); h.last = JSON.stringify(v6Grab()); h.lastC = dwCanon(JSON.parse(h.last));
    DW.sig = ''; dwRefresh(true);
  }
