
  // ===================== Drawing Workspace =====================
  // A full-window work area for 2D drawings (Capture > Drawing): own ribbon (tabs 6 Views / Exploded View), the sheet
  // canvas in the middle (the drawing engine of v6.js), the Drawing Tree on the right (document + sheets, with the sheet
  // properties under it) and the sheet bar at the bottom (sheet tabs + Save / Discard / Duplicate). The 3D workspace stays
  // as it is underneath; going back changes nothing in the model.
  //
  // Drawing document  DW.doc = { v, id, name (null = "Drawing of <model>"), created, modified, active, sheets: [sheet] }
  // Sheet             { id, name, work }: work = the sheet's drawing state (v6Grab form: panel values + placements per
  //   drawing type, notes, frames, dimensions, hide = bodies this sheet hides). Sheets always draw the 3D model as it is
  //   now (dwupd.js) and every change is kept at once: no Save / Discard per sheet, no Update.
  // The document goes into the session file (.mrtl) as meta.drawDoc (body references by stable body id). Other parts:
  // dwupd.js (bodies, undo), dwsel.js (bodies of a sheet), dwexp.js (PDF).
  const DW = { open: false, doc: null, sig: '', ren: null, drag: null, side: 320, bsel: null, fold: {} };
  const DW_VER = 4;
  function dwUid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function dwClone(o) { return JSON.parse(JSON.stringify(o)); }
  function dwModelName() {
    if (S.sesName) return S.sesName.replace(/\.mrtl$/i, '');
    const b = S.bodies[0]; return b ? b.name : 'Model';
  }
  function dwDocName() { const d = dwDoc(); return d.name || 'Drawing of "' + dwModelName() + '"'; }
  function dwNewDoc(state) {
    const st = state || v6Blank(), sh = { id: dwUid('s'), name: 'Sheet 1', work: dwClone(st) };
    // fresh: never opened in the Drawing Workspace (the first opening makes the sheets Dimension and Exploded)
    return { v: DW_VER, id: dwUid('d'), name: null, created: Date.now(), modified: Date.now(), active: sh.id, sheets: [sh], fresh: true };
  }
  function dwDoc() { if (!DW.doc) DW.doc = dwNewDoc(v6Grab()); return DW.doc; }
  function dwSheet(id) { return dwDoc().sheets.find(function (s) { return s.id === id; }); }
  function dwCur() { const d = dwDoc(); return dwSheet(d.active) || d.sheets[0]; }
  // compare two drawing states by what they hold (defaults filled in; note counter and the open ribbon tab ignored)
  function dwCanon(st) {
    st = st || {}; const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], out = { cfg: {}, st: {}, notes: {}, rects: {}, dims: {}, hide: st.hide || [] };
    for (const m of ['6v', 'exp']) {
      out.cfg[m] = Object.assign({}, V6S.def, v6CfgMig((st.cfg || {})[m]));
      const t = (st.st || {})[m] || {};
      out.st[m] = { R: t.R || I, pos: t.pos || null, iso: t.iso || null, off: t.off || {}, tot: t.tot || null, grp: t.grp || {}, odo: t.odo || {} };
      out.notes[m] = (st.notes || {})[m] || [];
      out.rects[m] = (st.rects || {})[m] || [];
      out.dims[m] = ((st.dims || {})[m] || []).map(function (d) { return [d.id, d.view, d.a, d.b, d.t, d.o]; });
    }
    return JSON.stringify(out);
  }
  // the canvas -> the active sheet's working copy
  function dwCapture() {
    if (!DW.doc) return;
    const s = dwCur(); s.work = v6Grab();
    dwHistNote(s, JSON.stringify(s.work));
  }
  function dwShow(s) { DW.doc.active = s.id; DW.bsel = null; V6S.hl = null; v6Put(s.work); dwTabKeep(s.work.mode); dwHistReset(s); }
  // a body picked in one of the lists lights up orange on the sheet (6 views and exploded); on the exploded sheet it is
  // also the picked part
  // (no new render: the orange comes from the body masks of the last render, see v6HlMask)
  function dwBodyPick(u) {
    DW.bsel = u;
    V6S.hl = u;
    if (V6S.mode === 'exp' && V6S.prev) {
      const pt = u ? V6S.prev.parts.find(function (x) { return x.b.uid === u; }) : null;
      V6S.psel = pt ? pt.id : null; v6PartRow();
    }
    dwTreeSel(); v6PaintSoon();
  }
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
  // a new sheet shows every body of the model (or only the given ones: the others hidden in it)
  function dwNewSheet(uids) {
    dwCapture();
    const d = dwDoc(), st = v6Blank();
    st.hide = Array.isArray(uids) ? S.bodies.map(function (b) { return b.uid; }).filter(function (u) { return uids.indexOf(u) < 0; }) : [];
    const s = { id: dwUid('s'), name: dwNextName(), work: dwClone(st) };
    d.sheets.push(s); d.modified = Date.now(); dwShow(s); dwRefresh(true);
    return s;
  }
  function dwDupSheet(id) {
    dwCapture();
    const d = dwDoc(), src = dwSheet(id || d.active); if (!src) return null;
    const s = { id: dwUid('s'), name: dwNextName(src.name + ' Copy'), work: dwClone(src.work) };
    d.sheets.splice(d.sheets.indexOf(src) + 1, 0, s); d.modified = Date.now(); dwShow(s); dwRefresh(true);
    flash(L('Đã tạo ', 'Created ') + s.name);
    return s;
  }
  function dwDelSheet(id) {
    const d = dwDoc(), s = dwSheet(id); if (!s) return;
    if (!confirm(L('Xoá ' + s.name + '? Không hoàn tác được.', 'Delete ' + s.name + '? This cannot be undone.'))) return;
    dwCapture();
    const i = d.sheets.indexOf(s); d.sheets.splice(i, 1); d.modified = Date.now();
    if (!d.sheets.length) { const st = v6Blank(); d.sheets.push({ id: dwUid('s'), name: 'Sheet 1', work: dwClone(st) }); }
    if (d.active === id || !dwSheet(d.active)) dwShow(d.sheets[Math.min(i, d.sheets.length - 1)]);
    dwRefresh(true);
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
    const f = function (k) { return dwUidOf(k); };
    return { v: DW_VER, id: d.id, name: d.name, created: d.created, modified: d.modified, active: d.active, fresh: d.fresh || undefined,
      sheets: d.sheets.map(function (s) { return { id: s.id, name: s.name, work: v6MapIds(s.work, f) }; }) };
  }
  // d = meta.drawDoc of a session, or null: a new document whose Sheet 1 is the drawing now on the engine (sessions
  // saved before the workspace existed). Older documents: version 1 referred to bodies by their order; versions 2-3 had
  // body lists (document "source bodies" and per-sheet lists) and a saved copy per sheet — the bodies they left out
  // become hidden bodies of the sheet, the working copy is kept, the rest (snapshots, revisions) is dropped.
  function dwLoad(d) {
    DWU.hist.clear();
    if (d && d.sheets && d.sheets.length) {
      const f = (d.v || 1) < 2 ? v6IdxToId() : function (k) { return dwIdOf(k); };
      const docSrc = Array.isArray(d.src) ? d.src : null;
      DW.doc = { v: DW_VER, id: d.id || dwUid('d'), name: d.name || null, created: d.created || Date.now(), modified: d.modified || Date.now(), active: d.active, fresh: !!d.fresh,
        sheets: d.sheets.map(function (s) {
          const w = v6MapIds(s.work || s.saved || v6Blank(), f);
          const keep = Array.isArray(w.src) ? w.src : (d.v || 1) >= 2 ? docSrc : null;
          if (keep) { const h = w.hide || []; S.bodies.forEach(function (b) { if (keep.indexOf(b.uid) < 0 && h.indexOf(b.uid) < 0) h.push(b.uid); }); w.hide = h; }
          delete w.src;
          return { id: s.id || dwUid('s'), name: s.name || 'Sheet', work: w };
        }) };
      if (!dwSheet(DW.doc.active)) DW.doc.active = DW.doc.sheets[0].id;
      v6Put(dwCur().work);
    } else DW.doc = dwNewDoc(v6Grab());
    DW.sig = ''; DW.bsel = null; V6S.hl = null;
    if (DW.open) { dwTabSet(dwCur().work.mode); dwRefresh(true); }
  }
  // ---------- open / close
  // the first time the workspace opens on a model: two sheets, Dimension (6 Views) and Exploded (Exploded View)
  function dwFirstSheets() {
    const d = dwDoc(); if (!d.fresh) return;
    delete d.fresh;
    const w = v6Grab(), a = dwClone(w), b = dwClone(w);
    a.mode = '6v'; b.mode = 'exp';
    const s1 = { id: dwUid('s'), name: 'Dimension', work: a }, s2 = { id: dwUid('s'), name: 'Exploded', work: b };
    d.sheets = [s1, s2]; d.active = s1.id; d.modified = Date.now();
    v6Put(s1.work); dwHistReset(s1);
  }
  function dwOpen() {
    dwDoc(); dwFirstSheets();
    DW.open = true; document.body.classList.add('dws-on');
    closeMenu();
    v6Activate(true); dwTabSet(V6S.mode); dwRefresh(true);
    setTimeout(function () { ribFit($('dwsRibbon')); v6Preview(); }, 0);
  }
  function dwClose() {
    if (DW.ren) DW.ren.done(true);
    v6DimTool(false);
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
    body: '<path d="M12 3.2l7.6 4.3L12 11.8 4.4 7.5z" fill="#b7d3f2"/><path d="M4.4 7.5L12 11.8v9L4.4 16.5z" fill="#5f93cf"/><path d="M19.6 7.5L12 11.8v9l7.6-4.3z" fill="#346599"/><path d="M12 3.2l7.6 4.3v9L12 20.8l-7.6-4.3v-9z" stroke="#1f4570" stroke-width="1.1"/><path d="M4.4 7.5L12 11.8l7.6-4.3M12 11.8v9" stroke="#1f4570" stroke-width=".8" stroke-opacity=".7"/>',
    bodyB: '<path d="M12 3.2l7.6 4.3L12 11.8 4.4 7.5z" fill="#ffd391"/><path d="M4.4 7.5L12 11.8v9L4.4 16.5z" fill="#f0a030"/><path d="M19.6 7.5L12 11.8v9l7.6-4.3z" fill="#b8730f"/><path d="M12 3.2l7.6 4.3v9L12 20.8l-7.6-4.3v-9z" stroke="#6e4405" stroke-width="1.1"/><path d="M4.4 7.5L12 11.8l7.6-4.3M12 11.8v9" stroke="#6e4405" stroke-width=".8" stroke-opacity=".7"/>',
    iso: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="#4f86c4" stroke="#2b557f"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="#cfe0f5"/>',
    arrange: '<rect x="3" y="4" width="7" height="6" fill="#4f86c4" stroke="#2b557f"/><rect x="14" y="4" width="7" height="6" fill="#4f86c4" stroke="#2b557f"/><rect x="3" y="14" width="7" height="6" fill="#4f86c4" stroke="#2b557f"/><path d="M14 17h7M17.5 13.5v7" stroke="#f0a030" stroke-width="1.8"/>',
    rotR: '<path d="M18 8a7 7 0 1 0 1.5 6" stroke="#9cc4ee" stroke-width="1.8"/><path d="M19 3v5h-5" stroke="#f0a030" stroke-width="1.8"/>',
    rotL: '<g transform="translate(24 0) scale(-1 1)"><path d="M18 8a7 7 0 1 0 1.5 6" stroke="#9cc4ee" stroke-width="1.8"/><path d="M19 3v5h-5" stroke="#f0a030" stroke-width="1.8"/></g>',
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
    tick: '<rect x="4" y="4" width="16" height="16" rx="3" stroke="#9cc4ee" stroke-width="1.6"/><path d="M8 12l3 3 5-6" stroke="#f0a030" stroke-width="1.8"/>',
    src: '<rect x="3" y="12" width="8" height="8" fill="#4f86c4" stroke="#2b557f"/><rect x="13" y="12" width="8" height="8" fill="#3d6fa8" stroke="#2b557f"/><path d="M7 10V5h10v5M12 5V2" stroke="#f0a030" stroke-width="1.6"/>',
    check: '<circle cx="10.5" cy="10.5" r="6" stroke="#9cc4ee" stroke-width="1.8"/><path d="M15 15l5 5" stroke="#9cc4ee" stroke-width="2"/><path d="M8 10.5l2 2 3.5-4" stroke="#6fd08c" stroke-width="1.8"/>',
    upd: '<path d="M19 8a8 8 0 0 0-14 2M5 16a8 8 0 0 0 14-2" stroke="#9cc4ee" stroke-width="1.8"/><path d="M19 3v5h-5M5 21v-5h5" stroke="#f0a030" stroke-width="1.8"/>',
    pdf: '<path d="M5 3h10l4 4v14H5z" fill="#1f2a36" stroke="#e57373"/><path d="M8 16h8M8 13h8M8 10h5" stroke="#e8eef5"/>',
    dimt: '<path d="M4 6v12M20 6v12M4 12h16" stroke="#9cc4ee" stroke-width="1.5"/><path d="M7 10l-3 2 3 2M17 10l3 2-3 2" stroke="#f0a030" stroke-width="1.5"/><circle cx="4" cy="6" r="1.6" fill="#f0a030"/><circle cx="20" cy="6" r="1.6" fill="#f0a030"/>',
    undo: '<path d="M9 7L4 12l5 5" stroke="#9cc4ee" stroke-width="1.8"/><path d="M4 12h10a6 6 0 0 1 0 12" stroke="#9cc4ee" stroke-width="1.8"/>',
    frame: '<rect x="3" y="7" width="18" height="13" stroke="#e57373" stroke-width="1.8"/><path d="M5 4h8" stroke="#e8eef5" stroke-width="1.8"/>',
    pic: '<rect x="3" y="5" width="18" height="14" rx="1.5" fill="#1f2a36" stroke="#9cc4ee"/><circle cx="8.5" cy="10" r="1.8" fill="#f0a030"/><path d="M5 17l5-5 3 3 2.5-2.5L19 17z" fill="#4f86c4"/>',
    look: '<circle cx="12" cy="12" r="7.5" fill="#4f86c4" stroke="#2b557f"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="#2b557f"/>',
    lines: '<path d="M4 7h16" stroke="#e8eef5" stroke-width="2.4"/><path d="M4 12h16" stroke="#9cc4ee" stroke-width="1.6"/><path d="M4 17h16" stroke="#9cc4ee"/>',
    drawing: '<path d="M3 2h13l5 5v15H3z" fill="#e8eef5" stroke="#9cc4ee"/><rect x="5.5" y="5" width="4.5" height="3.5" fill="#3d6fa8"/><rect x="5.5" y="10" width="4.5" height="4.5" fill="#4f86c4"/><rect x="11.5" y="10" width="3.5" height="4.5" fill="#3d6fa8"/>'
  };
  function dwIco(k, n) { n = n || 16; return '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + (DW_IC[k] || '') + '</svg>'; }
  // the eye of a body in the sheet tree: open = shown in this sheet, crossed out = hidden (drawn in the text colour)
  function dwEye(on) {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M2.5 12s3.5-6.2 9.5-6.2S21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/>' +
      (on ? '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>' : '<path d="M4 20L20 4"/>') + '</svg>';
  }
  // ribbon pieces: vi text + data-en (applyLang swaps them)
  function dwEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function dwT(vi, en) { return '<span data-en="' + dwEsc(en) + '">' + dwEsc(vi) + '</span>'; }
  function dwTip(vi, en) { return ' title="' + dwEsc(vi) + '" data-en-title="' + dwEsc(en) + '"'; }
  function dwBB(attr, ic, vi, en, tv, te) { return '<button class="bb" ' + attr + dwTip(tv || vi, te || en) + '>' + dwIco(ic, 30) + dwT(vi, en) + '</button>'; }
  function dwSB(attr, ic, vi, en, tv, te) { return '<button class="sb" ' + attr + dwTip(tv || vi, te || en) + '>' + dwIco(ic, 16) + dwT(vi, en) + '</button>'; }
  function dwGrp(vi, en, body) { return '<div class="rgrp"><div class="rbody">' + body + '</div><div class="rtitle" data-en="' + dwEsc(en) + '">' + dwEsc(vi) + '</div></div>'; }
  function dwCol(body) { return '<div class="rcol">' + body + '</div>'; }
  // icon-only small button (tooltip says what it does) and a text-glyph toggle (B / I / U)
  function dwIB(attr, ic, tv, te) { return '<button class="sb io" ' + attr + dwTip(tv, te) + '>' + dwIco(ic, 16) + '</button>'; }
  function dwGB(attr, glyph, tv, te) { return '<button class="sb io gl" ' + attr + dwTip(tv, te) + '>' + glyph + '</button>'; }
  // a column of sliders only: names, bars and numbers line up (grid)
  function dwColS(body) { return '<div class="rcol sl">' + body + '</div>'; }
  function dwRow(body, cls) { return '<div class="dwsRow' + (cls ? ' ' + cls : '') + '">' + body + '</div>'; }
  function dwSel(bind, tv, te) { return '<select data-bind="' + bind + '"' + dwTip(tv, te) + '></select>'; }
  function dwSlider(vi, en, rng, num, tv, te) {
    return '<div class="dwsRow"' + dwTip(tv, te) + '>' + dwT(vi, en) + '<input type="range" data-bind="' + rng + '"><input type="number" data-bind="' + num + '"></div>';
  }
  // shown only when a panel value matches (custom paper size, custom scale)
  function dwWhen(cond, html) { return '<div class="dwsWhen" data-when="' + cond + '">' + html + '</div>'; }
  function dwChk(sel, vi, en, tv, te) { return dwSB('data-chk="' + sel + '"', 'tick', vi, en, tv, te); }
  // narrow slider row (label, short range, number) for crowded groups
  function dwSliderS(vi, en, rng, num, tv, te) {
    return '<div class="dwsRow sm"' + dwTip(tv, te) + '>' + dwT(vi, en) + '<input type="range" data-bind="' + rng + '"><input type="number" data-bind="' + num + '"></div>';
  }
  // Export tab: what the picture will be (Info) and the export commands
  function dwOutGrp() {
    const sec = function (vi, en, body) { return '<div class="dwsXs"><div class="dwsXh">' + dwT(vi, en) + '</div><div class="dwsXb">' + body + '</div></div>'; };
    return dwGrp('Xuất', 'Export', sec('Sheet này', 'This Sheet', dwBB('data-act="png"', 'png', 'PNG', 'PNG', 'Xuất Sheet này thành ảnh PNG', 'Export this sheet as PNG') +
        dwBB('data-act="jpg"', 'jpg', 'JPG', 'JPG', 'Xuất Sheet này thành ảnh JPG', 'Export this sheet as JPG') +
        dwBB('data-act="pdf"', 'pdf', 'PDF', 'PDF', 'Xuất Sheet này thành PDF (nét vector)', 'Export this sheet as PDF (vector lines)')) +
      sec('Từng Sheet', 'Per Sheet', dwBB('data-act="eachPng"', 'png', 'PNG', 'PNG', 'Mỗi Sheet một file PNG riêng, tên file = tên Sheet', 'One PNG file per sheet, named after the sheet') +
        dwBB('data-act="eachJpg"', 'jpg', 'JPG', 'JPG', 'Mỗi Sheet một file JPG riêng, tên file = tên Sheet', 'One JPG file per sheet, named after the sheet') +
        dwBB('data-act="eachPdf"', 'pdf', 'PDF', 'PDF', 'Mỗi Sheet một file PDF riêng, tên file = tên Sheet', 'One PDF file per sheet, named after the sheet')) +
      sec('Tất cả Sheet', 'All Sheets', dwBB('data-act="pdfAll"', 'pdf', 'PDF gộp', 'All in 1 PDF', 'Xuất mọi Sheet vào một file PDF theo thứ tự Drawing Tree', 'All sheets into one PDF, in Drawing Tree order')) +
      sec('Clipboard', 'Clipboard', dwBB('data-click="#v6Copy"', 'copy', 'Chép ảnh', 'Copy', 'Chép ảnh Sheet vào clipboard (cỡ vừa để gửi mail, không theo thiết lập xuất)', 'Copy the sheet picture to the clipboard (e-mail size, not the export settings)'))).replace('class="rgrp"', 'class="rgrp keep dwsX"');
  }
  // Effects tab, in the style of ZBrush sub-palettes: each effect is a small palette with a title bar and an on / off
  // switch; its levels are ZBrush sliders (name on the left, value on the right inside the bar; drag anywhere on it,
  // double-click to type a value). The shadow palette has a light ball like ZBrush's Light palette: drag the light spot.
  function dwZs(num, rng, vi, en, tv, te) {
    return '<div class="zbs" tabindex="0" data-zb="' + num + '" data-zr="' + rng + '"' + dwTip(tv, te) + '><div class="zf"></div><i></i>' + '<span class="zl">' + dwT(vi, en) + '</span><span class="zv"></span></div>';
  }
  function dwZp(vi, en, on, body, cls) {
    return '<div class="zpal' + (cls ? ' ' + cls : '') + '"><div class="zph">' + (on ? '<button class="zon" data-zon="' + on + '"' + dwTip('Bật / tắt hiệu ứng', 'Effect on / off') + '></button>' : '') + dwT(vi, en) + '</div><div class="zpb">' + body + '</div></div>';
  }
  function dwFxHtml() {
    return '<div class="zrow">' +
      dwZp('Nét bậc', 'Step Lines', 'v6FxW', dwZs('v6FxT', 'v6FxTR', 'Ngưỡng', 'Threshold', 'Độ cao bậc nhỏ nhất được vẽ nét (mm trên vật). Nét nằm về phía mặt thấp hơn và dày hơn khi bậc cao hơn', 'Smallest step height that gets a line (mm on the object). The line lies on the lower face and gets thicker for a higher step') +
        dwZs('v6FxW', 'v6FxWR', 'Nét', 'Width', 'Bề dày nét bậc trên giấy (mm, 0 = tắt)', 'Step line width on paper (mm, 0 = off)')) +
      dwZp('Chân bậc', 'Step Band', 'v6FxBs', dwZs('v6FxB', 'v6FxBR', 'Rộng', 'Width', 'Bề rộng dải tối trên mặt thấp, sát chân bậc (mm trên giấy)', 'Width of the dark band on the lower face along the foot of a step (mm on paper)') +
        dwZs('v6FxBs', 'v6FxBsR', 'Đậm', 'Intensity', 'Độ đậm dải tối chân bậc (%, 0 = tắt)', 'Strength of the step band (%, 0 = off)')) +
      dwZp('AO', 'Ambient Occlusion', 'v6FxAs', dwZs('v6FxAs', 'v6FxAsR', 'Đậm', 'Intensity', 'Độ đậm AO (%, 0 = tắt): chân bậc, khe, lỗ tối dần', 'AO strength (%, 0 = off): the foot of steps, slots and holes darken') +
        dwZs('v6FxA', 'v6FxAR', 'Bán kính', 'Radius', 'Bán kính AO (mm trên vật)', 'AO radius (mm on the object)')) +
      dwZp('Bóng đổ', 'Shadow', 'v6FxS', '<div class="zlr"><canvas class="zball" width="112" height="112"' + dwTip('Quả cầu đèn: kéo đốm sáng để đổi hướng đèn (giữa = đèn chiếu thẳng, mép = đèn thấp, bóng dài)', 'Light ball: drag the light spot to move the light (middle = straight above, edge = low light, long shadows)') + '></canvas><div class="zcol">' +
        dwZs('v6FxS', 'v6FxSR', 'Đậm', 'Intensity', 'Độ đậm bóng đổ (%, 0 = tắt). Đèn gắn với màn hình nên mọi view sáng cùng một kiểu', 'Shadow strength (%, 0 = off). The light is fixed to the screen, so every view is lit alike') +
        dwZs('v6FxSa', 'v6FxSaR', 'Hướng', 'Angle', 'Hướng đèn trên màn hình (°): 0 = từ phải, 90 = từ trên, 180 = từ trái', 'Light direction on the screen (°): 0 = from the right, 90 = from the top, 180 = from the left') +
        dwZs('v6FxSe', 'v6FxSeR', 'Độ cao', 'Elevation', 'Độ cao đèn so với mặt giấy (°): thấp thì bóng dài', 'Light height above the paper (°): low gives long shadows') + '</div></div>', 'zwide') +
      dwZp('Độ cong', 'Curvature', 'v6FxC', dwZs('v6FxC', 'v6FxCR', 'Đậm', 'Intensity', 'Gờ sáng, rãnh tối theo độ cong bề mặt (%, 0 = tắt)', 'Ridges lighter, grooves darker by the surface curvature (%, 0 = off)')) +
      dwZp('Viền part', 'Part Outline', '#v6FxId', dwZs('v6FxOw', 'v6FxOwR', 'Nét', 'Width', 'Bề dày viền quanh từng part (mm trên giấy): đường bao của part và chỗ hai body gặp nhau', 'Width of the line round every part (mm on paper): its silhouette and where two bodies meet') +
        '<div class="zsw">' + dwT('Màu viền', 'Colour') + '<input type="color" data-bind="v6FxOc"' + dwTip('Màu viền part', 'Part outline colour') + '></div>') +
      dwZp('Mặc định', 'Default', null, '<button class="zdef" data-act="fxDef"' + dwTip('Đưa mọi hiệu ứng về thiết lập mặc định', 'Put every effect back to its default setting') + '>' + dwIco('reset', 22) + dwT('Mặc định', 'Default') + '</button>', 'zdefp') +
      '</div>';
  }
  // Drawing tab layout: every command shows on the ribbon (nothing folded away), three rows per group, left to right in
  // working order: sheet -> views (6 Views) / assembly and parts (Exploded) -> annotation -> look -> notes -> picture ->
  // arrange & type. Toggles are small orange-ringed buttons; rarely read labels give way to icons with tooltips.
  function dwRibbonHtml() {
    const v = function (k, vi, en) { return dwSB('data-chk=".v6v[data-v=' + k + ']"', 'front', vi, en, 'Bật / tắt view ' + vi, 'Show / hide the ' + en); };
    // ---- shared groups
    const sheetG = function (six) {
      return dwGrp('Sheet', 'Sheet', dwCol(dwSB('data-act="newSheet"', 'sheet', 'Sheet mới', 'New Sheet', 'Tạo Sheet mới (lấy đủ Source Bodies)', 'Add a new sheet (with every source body)') +
          dwSB('data-act="fit"', 'fit', 'Vừa khung', 'Fit', 'Cả tờ giấy vừa khung nhìn (bấm đúp chỗ trống cũng được)', 'Whole sheet in view (or double-click an empty spot)')) +
        dwCol(dwRow(dwSel('v6Paper', 'Khổ giấy', 'Paper size')) + dwRow(dwSel('v6Ori', 'Hướng giấy', 'Orientation')) +
          (six ? dwRow(dwSel('v6Scale', 'Tỉ lệ bản vẽ', 'Drawing scale')) : '')) +
        dwWhen('paper=px', dwCol(dwSliderS('W', 'W', 'v6WR', 'v6W', 'Bề rộng ảnh (px)', 'Picture width (px)') + dwSliderS('H', 'H', 'v6HR', 'v6H', 'Chiều cao ảnh (px)', 'Picture height (px)'))) +
        (six ? dwWhen('scale=c', dwCol('<div class="dwsRow"' + dwTip('Tỉ lệ tùy chọn a : b', 'Custom scale a : b') + '><input type="range" data-bind="v6ScR"><input type="number" data-bind="v6ScA"><span>:</span><input type="number" data-bind="v6ScB"></div>')) : ''));
    };
    // orientation of the whole model: 90° steps (icons) + picture size
    const orient = dwGrp('Hướng nhìn', 'Orientation', dwCol(dwRow(dwIB('data-click="#v6RotZ"', 'rotR', 'Xoay mô hình / cả cụm 90° quanh trục đứng', 'Turn the model / assembly 90° about the vertical axis') +
        dwIB('data-click="#v6RotZm"', 'rotL', 'Xoay mô hình / cả cụm -90° quanh trục đứng', 'Turn the model / assembly -90° about the vertical axis') +
        dwIB('data-click="#v6Tip"', 'tip', 'Lật mô hình / cả cụm 90° quanh trục ngang', 'Tip the model / assembly 90° about the horizontal axis'), 'ibar') +
      dwSliderS('Cỡ', 'Size', 'v6ZmR', 'v6Zm', 'Cỡ hình khi tỉ lệ là Vừa khổ (%)', 'Picture size with Fit scale (%)')));
    // look of the drawing: what is drawn, colour / light, lines & text
    const look = dwGrp('Hiển thị & nét', 'Display & Lines', dwCol(dwSB('data-chk="#v6Edge"', 'edge', 'Nét cạnh', 'Show Edges') + dwSB('data-chk="#v6Hid"', 'hid', 'Nét khuất', 'Hidden Lines') +
        dwChk('#v6Fine', 'B-rep mịn', 'Fine B-rep', 'Khối B-rep chia lưới mịn theo độ phân giải bản vẽ', 'B-rep solids meshed finely for the drawing resolution')) +
      dwCol(dwRow(dwSel('v6Col', 'Màu: tô bóng / một màu / trắng (nét vẽ)', 'Colour: shaded / one colour / white (line drawing)') + '<input type="color" data-bind="v6One"' + dwTip('Màu khi chọn Một màu', 'Colour for One colour') + '>') +
        dwRow(dwSel('v6Light', 'Ánh sáng', 'Lighting')) +
        dwSliderS('Góc', 'Angle', 'v6AngR', 'v6Ang', 'Cạnh lưới gãy hơn góc này thì vẽ nét (°)', 'Mesh edges sharper than this are drawn (°)')) +
      dwCol(dwSliderS('Nét', 'Line', 'v6LwR', 'v6Lw', 'Bề dày nét (mm)', 'Line width (mm)') +
        dwSliderS('Chữ', 'Text', 'v6FsR', 'v6Fs', 'Cỡ chữ của kích thước, tên view, tên linh kiện (mm)', 'Size of dimension, view and part texts (mm)') +
        dwRow(dwSel('v6Unit', 'Đơn vị ghi kích thước', 'Units of the dimensions') + dwGB('data-chk="#v6Fb"', '<b>B</b>', 'Chữ kích thước, tên view, tên linh kiện đậm', 'Bold dimension, view and part texts'))));
    const notes = dwGrp('Ghi chú', 'Notes', dwCol(dwRow(dwIB('data-click="#v6AddT"', 'text', 'Thêm ghi chú chữ (kéo để dời, bấm đúp để sửa, chuột phải: căn lề / kiểu chữ / xoá, Delete để xoá)', 'Add a text note (drag to move, double-click to edit, right-click: alignment / style / delete, Delete to remove)') +
          dwSel('v6Nf', 'Font chữ của ghi chú đang chọn', 'Font of the selected note'), 'ibar') +
        dwRow(dwGB('data-chk="#v6Nb"', '<b>B</b>', 'Ghi chú đang chọn in đậm', 'Selected note in bold') + dwGB('data-chk="#v6Ni"', '<i>I</i>', 'Ghi chú đang chọn in nghiêng', 'Selected note in italics') +
          dwGB('data-chk="#v6Nu"', '<u>U</u>', 'Gạch chân ghi chú đang chọn', 'Underline the selected note') + '<input type="color" data-bind="v6Nc"' + dwTip('Màu chữ của ghi chú đang chọn', 'Colour of the selected note') + '>', 'ibar') +
        dwSliderS('Cỡ', 'Size', 'v6NsR', 'v6Ns', 'Cỡ chữ của ghi chú đang chọn (mm)', 'Size of the selected note (mm)')));
    const pic = dwGrp('Ảnh xuất', 'Picture', dwCol(dwSliderS('DPI', 'DPI', 'v6DpiR', 'v6Dpi', 'Độ phân giải ảnh / PDF', 'Resolution of the picture / PDF') +
        dwRow(dwSel('v6SS', 'Khử răng cưa: dựng ảnh lớn hơn rồi thu nhỏ', 'Anti-aliasing: draw larger, then scale down') + dwSel('v6Bg', 'Nền ảnh PNG', 'PNG background'), 'sel2') +
        dwSliderS('JPG', 'JPG', 'v6QR', 'v6Q', 'Chất lượng JPG (%)', 'JPG quality (%)')));
    // ---- 6 Views
    const six = dwGrp('Hình chiếu', 'Views', dwCol(v('front', 'Trước', 'Front View') + v('top', 'Trên', 'Top View') + v('bottom', 'Dưới', 'Bottom View')) +
        dwCol(v('left', 'Trái', 'Left View') + v('right', 'Phải', 'Right View') + v('back', 'Sau', 'Rear View')) +
        dwCol(dwSB('data-chk="#v6Iso"', 'iso', 'Isometric', 'Isometric', 'Bật / tắt hình chiếu iso', 'Show / hide the isometric view') +
          dwSliderS('Xoay', 'Turn', 'v6AzR', 'v6Az', 'Góc xoay hình iso quanh trục đứng (°) — bật Isometric để dùng', 'Iso view angle about the vertical axis (°) — switch Isometric on to use') +
          dwSliderS('Nghiêng', 'Tilt', 'v6ElR', 'v6El', 'Góc nghiêng hình iso nhìn từ trên xuống (°) — bật Isometric để dùng', 'Iso view angle looking down (°) — switch Isometric on to use')) +
        dwCol('<div class="dwsRow sp"></div>' + dwSliderS('Cỡ iso', 'Iso size', 'v6IsoKR', 'v6IsoK', 'Cỡ hình iso (%) — bật Isometric để dùng', 'Size of the iso picture (%) — switch Isometric on to use'))) +
      dwGrp('Chú thích', 'Annotation', dwCol(dwSB('data-chk="#v6Lbl"', 'name', 'Tên view', 'View Names') + dwSB('data-chk="#v6ScN"', 'scale', 'Ghi tỉ lệ', 'Scale Note') +
          dwSB('data-act="dim"', 'dimt', 'Dimension', 'Dimension', 'Ghi kích thước: chọn 2 điểm trên một view rồi bấm chỗ đặt đường kích thước (ngang / dọc / theo hướng tuỳ chỗ đặt). Esc để thôi', 'Dimension: pick 2 points on a view, then click where the line goes (horizontal / vertical / aligned from where you place it). Esc to stop')) +
        dwCol(dwSB('data-chk="#v6DimW"', 'dim', 'Dài', 'Length', 'Kích thước bao: chiều dài (kéo đường kích thước để dời)', 'Overall size: length (drag the dimension line to move it)') + dwSB('data-chk="#v6DimD"', 'dim', 'Rộng', 'Width', 'Kích thước bao: chiều rộng (kéo đường kích thước để dời)', 'Overall size: width (drag the dimension line to move it)') + dwSB('data-chk="#v6DimH"', 'dim', 'Cao', 'Height', 'Kích thước bao: chiều cao (kéo đường kích thước để dời)', 'Overall size: height (drag the dimension line to move it)')));
    // ---- Exploded View
    const exp = dwGrp('Cụm lắp', 'Assembly', dwColS(dwSliderS('Explode', 'Explode', 'v6ExR', 'v6Ex', 'Kéo để tách các linh kiện ra khỏi tâm cụm (0 = cụm lắp nguyên, %)', 'Drag to pull the parts out from the centre (0 = assembled, %)') +
          dwSliderS('Xoay', 'Turn', 'v6AzR', 'v6Az', 'Góc nhìn cả cụm quanh trục đứng (°)', 'View angle about the vertical axis (°)') +
          dwSliderS('Nghiêng', 'Tilt', 'v6ElR', 'v6El', 'Góc nhìn cả cụm từ trên xuống (°)', 'Angle looking down (°)')) +
        dwCol(dwSB('data-act="resetExp"', 'reset', 'Bỏ kéo tay', 'Reset Explode', 'Đưa các linh kiện về vị trí tách tự động', 'Put the parts back where the automatic explode places them') +
          dwSB('data-act="comb"', 'comb', 'Combine', 'Combine', 'Gộp các linh kiện cùng khối lượng vào linh kiện đang chọn trên bản vẽ (hoặc chuột phải lên linh kiện)', 'Combine parts of the same mass into the part picked on the sheet (or right-click a part)') +
          dwSB('data-act="sep"', 'sep', 'Tách ra', 'Separate', 'Tách nhóm của linh kiện đang chọn', 'Split the group of the picked part'))) +
      // turning single parts (only the parts picked on the sheet)
      dwGrp('Xoay linh kiện', 'Part Rotation', dwColS(dwSliderS('Xoay', 'Turn', 'v6PtR', 'v6Pt', 'Xoay các linh kiện đang chọn quanh trục đứng của màn hình (°). Bấm linh kiện trên bản vẽ để chọn, bấm thêm để chọn nhiều', 'Turn the picked parts about the screen\'s vertical axis (°). Click parts on the sheet to pick them, click more to pick several') +
          dwSliderS('Nghiêng', 'Tilt', 'v6PiR', 'v6Pi', 'Nghiêng các linh kiện đang chọn quanh trục ngang của màn hình (°)', 'Tilt the picked parts about the screen\'s horizontal axis (°)') +
          dwSliderS('Lăn', 'Roll', 'v6PlR', 'v6Pl', 'Xoay các linh kiện đang chọn trong mặt giấy (°)', 'Roll the picked parts in the plane of the paper (°)')) +
        dwCol(dwIB('data-act="rotTurn"', 'rotR', 'Xoay các linh kiện đang chọn thêm 90° quanh trục đứng', 'Turn the picked parts 90° more about the vertical axis') +
          dwIB('data-act="rotTip"', 'tip', 'Lật các linh kiện đang chọn thêm 90° quanh trục ngang', 'Tilt the picked parts 90° more about the horizontal axis') +
          dwIB('data-act="rotReset"', 'reset', 'Đưa các linh kiện đang chọn về hướng như cả cụm', 'Put the picked parts back to the assembly\'s orientation'))) +
      dwGrp('Linh kiện', 'Parts', dwCol(dwSB('data-chk="#v6PN"', 'name', 'Tên', 'Name', 'Ghi tên linh kiện dưới hình', 'Part names under the pictures') + dwSB('data-chk="#v6PM"', 'mass', 'Vật liệu + KL', 'Material + Mass', 'Ghi vật liệu + khối lượng dưới hình', 'Material + mass under the pictures') +
          dwSB('data-chk="#v6Tot"', 'mass', 'Tổng KL', 'Total Mass', 'Tổng khối lượng theo vật liệu (góc dưới phải, kéo để dời)', 'Total mass per material (bottom right, drag to move)')) +
        dwCol(dwRow('<input type="text" data-bind="v6PName" class="dwsTxt" placeholder="—"' + dwTip('Tên body của linh kiện đang chọn trên bản vẽ (đổi cả trong 3D)', 'Name of the body of the part picked on the sheet (renames it in 3D too)') + '>') +
          dwRow(dwSel('v6PMat', 'Vật liệu của linh kiện đang chọn', 'Material of the picked part')) +
          dwRow('<span data-text="v6PMass"></span>', 'mass'))) +
      dwGrp('Khung', 'Frames', dwCol(dwSB('data-act="rect"', 'frame', 'Khung', 'Frame', 'Kẻ khung chữ nhật chia khu vực một cụm: kéo trên bản vẽ (bấm một điểm = khung mặc định). Kéo cạnh / tên để dời, kéo góc để đổi cỡ (tự thẳng hàng với khung khác), bấm đúp tên để sửa, chuột phải để sửa / xoá. Esc để thôi', 'Draw a rectangle around the parts of one group: drag on the sheet (a click gives a default frame). Drag an edge / the name to move, the corner to resize (snaps to the other frames), double-click the name to edit, right-click to rename / delete. Esc to stop') +
          dwRow(dwSel('v6Rp', 'Vị trí tên khung đang chọn (và khung mới): trong / ngoài khung, góc trên / dưới, trái / phải', 'Where the name of the picked frame (and of new frames) sits: inside / outside, top / bottom, left / right') + '<input type="color" data-bind="v6Rc"' + dwTip('Màu khung đang chọn (và khung mới)', 'Colour of the picked frame (and new frames)') + '>')) +
        dwColS(dwSliderS('Tên', 'Name', 'v6RsR', 'v6Rs', 'Cỡ chữ tên khung (mm)', 'Size of the frame name (mm)') +
          dwSliderS('Nét', 'Line', 'v6RwR', 'v6Rw', 'Bề dày nét khung (mm)', 'Frame line width (mm)')));
    const set = dwGrp('Thông tin', 'Info', '<div class="rcol dwsInfo" id="dwsInfo"></div>').replace('class="rgrp"', 'class="rgrp keep"') + dwOutGrp();
    // the same Auto Arrange button on both drawing types, right next to 2D Type (6 Views: views spaced evenly; Exploded: parts spread evenly, frames respected)
    const typ = dwGrp('Bố trí & loại bản vẽ', 'Arrange & Type', dwBB('data-click="#v6Auto"', 'arrange', 'Xếp tự động', 'Auto Arrange', '6 Views: căn các hình chiếu cách đều nhau và cách đều viền, giữ nguyên cỡ hình. Exploded: giãn đều các linh kiện, trong khung thì xếp trong khung, ngoài khung thì xếp ở chỗ trống', '6 Views: space the views evenly between each other and the border, keeping their size. Exploded: spread the parts evenly, inside their frame or in the free space') +
      '<button class="bb dwsType" data-act="type2d"' + dwTip('Chọn loại bản vẽ của Sheet: 6 Views hoặc Exploded View (hỏi trước khi đổi)', 'Pick the drawing type of the sheet: 6 Views or Exploded View (asks before switching)') + '>' +
      dwIco('drawing', 30) + '<span>2D Type</span><small class="dwsTypeL"></small></button>').replace('class="rgrp"', 'class="rgrp keep dwsTypeG"');
    const common = orient + look + notes + pic;
    return '<div class="rpage dwp" data-k="6v">' + sheetG(true) + six + common + typ + '</div><div class="rpage dwp" data-k="exp">' + sheetG(false) + exp + common + typ + '</div><div class="rpage" data-k="set">' + set + '</div><div class="rpage zbp" data-k="fx">' + dwFxHtml() + '</div>';
  }
  // ---------- building the workspace
  (function () {
    const w = document.createElement('div'); w.id = 'dws';
    w.innerHTML =
      '<div id="dwsHd"><span class="dwsLogo">' + dwIco('drawing', 20) + 'Drawing Workspace<small class="appVer">v' + APP_VER + '</small></span><span class="dwsDoc" id="dwsDocName"></span><span class="grow"></span>' +
      '<button id="dwsSaveDoc"' + dwTip('Lưu tài liệu: ghi cả phiên (.mrtl) gồm mọi Sheet — Ctrl+Shift+S để lưu thành file khác', 'Save document: writes the session (.mrtl) with every sheet — Ctrl+Shift+S saves as another file') + '>' + dwIco('save') + dwT('Lưu tài liệu', 'Save Document') + '</button>' +
      '<button id="dwsBack" class="primary"' + dwTip('Quay lại 3D Workspace (bản vẽ vẫn giữ nguyên)', 'Back to the 3D workspace (the drawing stays as it is)') + '>' + dwIco('back') + dwT('3D Workspace', '3D Workspace') + '</button></div>' +
      '<div id="dwsTop"><div id="dwsTabs"><button class="rtab" data-k="draw">Drawing</button><button class="rtab" data-k="set">Export</button><button class="rtab" data-k="fx" data-en="Effects">Hiệu ứng</button></div>' +
      '<div id="dwsRibbon" class="ribfit">' + dwRibbonHtml() + '</div></div>' +
      '<div id="dwsMid">' +
      '<div id="dwsCanvas"></div><div id="dwsSplit"' + dwTip('Kéo để đổi bề rộng cột bên phải', 'Drag to resize the right column') + '></div><div id="dwsSide">' +
      '<div class="dwsPh">' + dwIco('drawing', 14) + dwT('Drawing Tree', 'Drawing Tree') + '<span class="grow"></span><button id="dwsTreeAdd"' + dwTip('Sheet mới', 'New sheet') + '>+</button></div>' +
      '<div id="dwsTree"></div><div id="dwsProps"></div></div></div>' +
      '<div id="dwsBar"><div id="dwsTabsS"></div><span id="dwsState"></span><div class="dwsBtns">' +
      '<button id="dwsDup"' + dwTip('Nhân bản Sheet hiện tại (Ctrl+D)', 'Duplicate the current sheet (Ctrl+D)') + '>' + dwIco('dup') + dwT('Duplicate', 'Duplicate') + '</button></div></div>';
    document.body.appendChild(w);
    // the drawing engine's sheet window lives in the middle; its old settings panel stays hidden (every setting is on
    // the ribbon, bound to it) and keeps being the one place the engine reads its settings from
    const cv = $('v6Sheet'), pp = $('pop_v6');
    [cv, pp].forEach(function (el) { el.style.left = el.style.top = el.style.width = el.style.height = el.style.right = ''; });
    $('dwsCanvas').appendChild(cv); $('dwsProps').appendChild(pp); $('dwsInfo').appendChild($('v6Info'));
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
    newSheet: function () { dwNewSheet(); },
    pdf: function () { const s = dwCur(); dwExportPdf([s.id], s.name).catch(showError); },
    pdfAll: function () { dwExportPdf(dwDoc().sheets.map(function (s) { return s.id; }), dwDocName()).catch(showError); },
    dim: function () { v6DimTool(!V6S.dt); },
    fit: function () { v6Fit(); },
    png: function () { dwExport(null, 'png').catch(showError); },
    type2d: function (b) { dwTypeMenu(b); },
    eachPng: function () { dwExportEach('png').catch(showError); },
    eachJpg: function () { dwExportEach('jpg').catch(showError); },
    eachPdf: function () { dwExportEach('pdf').catch(showError); },
    rect: function () { v6RectTool(!V6S.rt); },
    jpg: function () { dwExport(null, 'jpg').catch(showError); },
    resetExp: function () { V6S.off = {}; v6Preview(); },
    // Effects tab: every effect back to the value it has when the app starts
    fxDef: function () {
      ['v6FxT', 'v6FxW', 'v6FxB', 'v6FxBs', 'v6FxA', 'v6FxAs', 'v6FxS', 'v6FxSa', 'v6FxSe', 'v6FxC', 'v6FxOw', 'v6FxOc', 'v6FxId'].forEach(function (id) {
        const el = $(id); if (el.type === 'checkbox') el.checked = el.defaultChecked; else el.value = el.defaultValue;
        const r = $(id + 'R'); if (r) r.value = el.value;
        dwFire(el);
      });
      document.querySelectorAll('#dwsRibbon .zon').forEach(function (b) { delete b.dataset.prev; });
      flash(L('Hiệu ứng về mặc định', 'Effects back to default'));
    },
    rotTurn: function () { v6RotSet(0, 90, true); },
    rotTip: function () { v6RotSet(1, 90, true); },
    rotReset: function () { v6RotReset(); },
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
    if (b.dataset.act && DW_ACT[b.dataset.act]) DW_ACT[b.dataset.act](b);
    else if (b.dataset.click) $(b.dataset.click.slice(1)).click();
    else if (b.dataset.chk) { const c = document.querySelector(b.dataset.chk); if (c) { c.checked = !c.checked; dwFire(c); } }
    dwSyncRibbon();
  });
  $('dwsRibbon').addEventListener('input', function (e) {
    const el = e.target; if (!el.dataset || !el.dataset.bind || el.type === 'text') return;
    const t = $(el.dataset.bind); t.value = el.value; dwFire(t); dwSyncRibbon();
  });
  $('dwsRibbon').addEventListener('change', function (e) {
    const el = e.target; if (!el.dataset || !el.dataset.bind || (el.tagName !== 'SELECT' && el.type !== 'text')) return;
    const t = $(el.dataset.bind); t.value = el.value; dwFire(t); dwSyncRibbon();
  });
  $('dwsRibbon').addEventListener('keydown', function (e) { if (e.target.tagName === 'INPUT') e.stopPropagation(); });
  // ---------- ZBrush-style controls of the Effects tab
  const DW_ZDEF = { v6FxW: 0.05, v6FxBs: 4, v6FxAs: 30, v6FxS: 30, v6FxC: 30 };      // what a switch turns an effect back on to
  function dwZbsDraw(z) {
    const src = $(z.dataset.zb), rg = $(z.dataset.zr); if (!src || !rg) return;
    const lo = +rg.min, hi = +rg.max, v = +src.value, f = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0;
    z.querySelector('.zf').style.width = (f * 100) + '%'; z.querySelector('i').style.left = 'calc(' + (f * 100) + '% - 1px)';
    const st = rg.step && rg.step !== 'any' ? +rg.step : 0, dec = st && st < 1 ? Math.min(3, String(st).split('.')[1].length) : 0;
    z.querySelector('.zv').textContent = (+v).toFixed(dec);
  }
  function dwZbsSet(z, v) {
    const src = $(z.dataset.zb), rg = $(z.dataset.zr), lo = +rg.min, hi = +rg.max, st = rg.step && rg.step !== 'any' ? +rg.step : 0;
    v = Math.max(lo, Math.min(hi, v)); if (st) v = Math.round((v - lo) / st) * st + lo;
    const s = String(+v.toFixed(6));
    if (src.value === s) return;
    src.value = s; dwFire(src); dwSyncRibbon();
  }
  function dwZball(cv) {
    const g = cv.getContext('2d'), W = cv.width, R = W / 2 - 6, c = W / 2;
    const sa = (+$('v6FxSa').value) * Math.PI / 180, se = (+$('v6FxSe').value) * Math.PI / 180, L = [Math.cos(se) * Math.cos(sa), Math.cos(se) * Math.sin(sa), Math.sin(se)];
    const on = +$('v6FxS').value > 0, im = g.createImageData(W, W), d = im.data;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const nx = (x - c) / R, ny = (c - y) / R, r2 = nx * nx + ny * ny, k = 4 * (y * W + x);
      if (r2 > 1) { d[k + 3] = 0; continue; }
      const nz = Math.sqrt(1 - r2), lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), hx = L[0], hy = L[1], hz = L[2] + 1, hl = Math.hypot(hx, hy, hz);
      const sp = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 40), v = Math.min(255, 38 + 170 * lam + 120 * sp), a = Math.min(1, (1 - Math.sqrt(r2)) * R);
      d[k] = v; d[k + 1] = v * (on ? 0.97 : 1); d[k + 2] = v * (on ? 0.92 : 1); d[k + 3] = 255 * a;
    }
    g.clearRect(0, 0, W, W); g.putImageData(im, 0, 0);
    const px = c + L[0] * R, py = c - L[1] * R;
    g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fillStyle = on ? '#ff9a2e' : '#9a9a9a'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#111'; g.stroke();
  }
  (function () {
    const rb = $('dwsRibbon');
    let drag = null;
    rb.addEventListener('pointerdown', function (e) {
      const z = e.target.closest('.zbs'), b = e.target.closest('.zball');
      if (z && e.button === 0 && !e.target.closest('input')) {
        const r = z.getBoundingClientRect(), rg = $(z.dataset.zr), fine = e.shiftKey;
        drag = { z: z, r: r, lo: +rg.min, hi: +rg.max, x0: e.clientX, v0: +$(z.dataset.zb).value, fine: fine };
        if (!z.zt || performance.now() - z.zt > 450) z.zv0 = $(z.dataset.zb).value;     // the value before a click (a double-click goes back to it)
        z.zt = performance.now();
        if (!fine) dwZbsSet(z, drag.lo + (e.clientX - r.left) / r.width * (drag.hi - drag.lo));   // ZBrush: the value jumps to the click
        z.classList.add('drag'); z.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      if (b && e.button === 0) { drag = { ball: b }; b.setPointerCapture(e.pointerId); dwZballAt(b, e); e.preventDefault(); }
    });
    rb.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (drag.ball) { dwZballAt(drag.ball, e); return; }
      const k = (drag.hi - drag.lo) / drag.r.width;
      dwZbsSet(drag.z, drag.fine ? drag.v0 + (e.clientX - drag.x0) * k * 0.1 : drag.lo + (e.clientX - drag.r.left) * k);    // Shift: ten times finer
    });
    const up = function () { if (drag && drag.z) drag.z.classList.remove('drag'); drag = null; };
    rb.addEventListener('pointerup', up); rb.addEventListener('pointercancel', up);
    function dwZballAt(b, e) {
      const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = 1 - (e.clientY - r.top) / r.height * 2, R = (b.width / 2 - 6) / (b.width / 2);
      let nx = x / R, ny = y / R; const l = Math.hypot(nx, ny); if (l > 1) { nx /= l; ny /= l; }
      const sa = (Math.atan2(ny, nx) * 180 / Math.PI + 360) % 360, se = Math.acos(Math.min(1, Math.hypot(nx, ny))) * 180 / Math.PI;
      const a = $('v6FxSa'), el = $('v6FxSe');
      a.value = Math.round(sa) % 360; el.value = Math.max(5, Math.min(85, Math.round(se)));
      dwFire(a); dwFire(el);
      if (+$('v6FxS').value <= 0) { $('v6FxS').value = DW_ZDEF.v6FxS; dwFire($('v6FxS')); }     // moving the light switches the shadow on
      dwSyncRibbon();
    }
    // double-click the slider: type the value
    rb.addEventListener('dblclick', function (e) {
      const z = e.target.closest('.zbs'); if (!z) return;
      const src = $(z.dataset.zb), inp = document.createElement('input');
      if (z.zv0 !== undefined && src.value !== z.zv0) { src.value = z.zv0; dwFire(src); dwSyncRibbon(); }      // the click before did not mean to move it
      inp.type = 'number'; inp.className = 'zin'; inp.value = src.value; inp.step = src.step || 'any';
      z.appendChild(inp); inp.focus(); inp.select();
      let fin = false;
      const done = function (ok) { if (fin) return; fin = true; const v = parseFloat(inp.value); if (inp.parentNode) inp.parentNode.removeChild(inp); if (ok && isFinite(v)) dwZbsSet(z, v); };
      inp.addEventListener('keydown', function (k) { if (k.key === 'Enter') done(true); else if (k.key === 'Escape') done(false); k.stopPropagation(); });
      inp.addEventListener('blur', function () { done(true); });
    });
    // arrow keys on a focused slider: one step (Shift: ten)
    rb.addEventListener('keydown', function (e) {
      const z = e.target.closest && e.target.closest('.zbs'); if (!z || e.target.tagName === 'INPUT') return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const rg = $(z.dataset.zr), st = +rg.step || (rg.max - rg.min) / 100;
      dwZbsSet(z, +$(z.dataset.zb).value + (e.key === 'ArrowRight' ? 1 : -1) * st * (e.shiftKey ? 10 : 1)); e.preventDefault(); e.stopPropagation();
    });
    // on / off switches: off puts the effect's strength to 0 (kept to come back to), on brings it back
    rb.addEventListener('click', function (e) {
      const b = e.target.closest('.zon'); if (!b) return;
      const k = b.dataset.zon;
      if (k[0] === '#') { const c = document.querySelector(k); c.checked = !c.checked; dwFire(c); }
      else {
        const src = $(k);
        if (+src.value > 0) { b.dataset.prev = src.value; src.value = 0; }
        else src.value = b.dataset.prev && +b.dataset.prev > 0 ? b.dataset.prev : DW_ZDEF[k];
        dwFire(src);
      }
      dwSyncRibbon(); e.stopPropagation();
    }, true);
  })();
  function dwSyncRibbon() {
    const r = $('dwsRibbon');
    r.querySelectorAll('.zbs').forEach(dwZbsDraw);
    r.querySelectorAll('.zon').forEach(function (b) {
      const k = b.dataset.zon, on = k[0] === '#' ? !!(document.querySelector(k) || {}).checked : +$(k).value > 0;
      b.classList.toggle('on', on); b.closest('.zpal').classList.toggle('off', !on);
    });
    r.querySelectorAll('.zball').forEach(dwZball);
    r.querySelectorAll('[data-bind]').forEach(function (el) { const t = $(el.dataset.bind); if (t && document.activeElement !== el && el.value !== t.value) el.value = t.value; });
    r.querySelectorAll('button[data-chk]').forEach(function (b) { const c = document.querySelector(b.dataset.chk); b.classList.toggle('on', !!(c && c.checked)); });
    r.querySelectorAll('[data-text]').forEach(function (el) { const t = $(el.dataset.text); el.textContent = t ? t.textContent : ''; });
    r.querySelectorAll('.dwsWhen').forEach(function (el) { const c = el.dataset.when.split('='); el.style.display = $('v6' + c[0][0].toUpperCase() + c[0].slice(1)).value === c[1] ? '' : 'none'; });
    r.querySelectorAll('.dwsTypeL').forEach(function (e) { e.textContent = V6S.mode === 'exp' ? 'Exploded View' : '6 Views'; });
    const iso = $('v6Iso').checked;
    r.querySelectorAll('.rpage[data-k="6v"] [data-bind=v6AzR], .rpage[data-k="6v"] [data-bind=v6Az], .rpage[data-k="6v"] [data-bind=v6ElR], .rpage[data-k="6v"] [data-bind=v6El], .rpage[data-k="6v"] [data-bind=v6IsoKR], .rpage[data-k="6v"] [data-bind=v6IsoK]').forEach(function (el) { el.disabled = !iso; el.closest('.dwsRow').classList.toggle('off', !iso); });
    const inf = $('dwsInfo'); if (inf) inf.title = $('v6Info').innerText;
    const part = V6S.psel !== null && V6S.psel !== undefined && V6S.psel >= 0;
    r.querySelectorAll('[data-bind=v6PName], [data-bind=v6PMat]').forEach(function (el) { el.disabled = !part; });
    const picked = V6S.mode === 'exp' && v6PSel().length > 0;
    r.querySelectorAll('[data-bind^=v6Pt], [data-bind^=v6Pi], [data-bind^=v6Pl], button[data-act^=rot]').forEach(function (el) { el.disabled = !picked; });
    const sel = V6S.psel !== null && V6S.psel !== undefined;
    r.querySelectorAll('button[data-act=comb]').forEach(function (b) { b.classList.toggle('hl', V6S.comb !== null); });
    r.querySelectorAll('button[data-act=dim]').forEach(function (b) { b.classList.toggle('hl', !!V6S.dt); });
    r.querySelectorAll('button[data-act=rect]').forEach(function (b) { b.classList.toggle('on', !!V6S.rt); });
    r.querySelectorAll('button[data-act=sep]').forEach(function (b) { b.disabled = !(sel && (V6S.grp[V6S.psel] || []).length); });
  }
  // tabs: Drawing (its groups follow the drawing type: page 6v or exp) and Export. k = 'draw' | '6v' | 'exp' | 'set'
  function dwTabSet(k) {
    if (k === 'draw') k = V6S.mode === 'exp' ? 'exp' : '6v';
    k = k === 'exp' || k === 'set' || k === 'fx' ? k : '6v';
    const side = k === 'set' || k === 'fx';
    document.querySelectorAll('#dwsTabs .rtab').forEach(function (b) { b.classList.toggle('on', b.dataset.k === (side ? k : 'draw')); });
    document.querySelectorAll('#dwsRibbon .rpage').forEach(function (p) { p.classList.toggle('on', p.dataset.k === k); });
    if (!side && V6S.mode !== k) v6SetMode(k);
    if (DW.open) setTimeout(function () { ribFit($('dwsRibbon')); }, 0);
    dwSyncRibbon();
  }
  // switching the drawing type of the sheet (6 Views <-> Exploded View, button 2D Type) asks first
  function dwTabAsk(k) {
    if ((k === '6v' || k === 'exp') && V6S.mode !== k && DW.open) {
      const ok = confirm(k === 'exp' ? L('Chuyển Sheet này sang bản vẽ Exploded View?\n(Thiết lập của bản vẽ 6 Views vẫn được giữ.)', 'Switch this sheet to the Exploded View drawing?\n(The 6 Views settings are kept.)')
        : L('Chuyển Sheet này sang bản vẽ 6 Views?\n(Thiết lập của bản vẽ Exploded View vẫn được giữ.)', 'Switch this sheet to the 6 Views drawing?\n(The Exploded View settings are kept.)'));
      if (!ok) return;
    }
    dwTabSet(k);
  }
  document.querySelectorAll('#dwsTabs .rtab').forEach(function (b) { b.addEventListener('click', function () { dwTabSet(b.dataset.k); }); });
  function dwTypeMenu(btn) {
    const r = btn.getBoundingClientRect(), ck = function (m, t) { return (V6S.mode === m ? '✓ ' : '') + t; };
    showMenu([[ck('6v', '6 Views'), function () { dwTabAsk('6v'); }, 'dot'], [ck('exp', 'Exploded View'), function () { dwTabAsk('exp'); }, 'dot']], r.left, r.bottom + 2);
  }
  // another sheet opened: the Export tab stays open, otherwise the tab of the sheet's drawing type
  function dwTabKeep(mode) { const t = document.querySelector('#dwsTabs .rtab.on'); dwTabSet(t && (t.dataset.k === 'set' || t.dataset.k === 'fx') ? t.dataset.k : mode); }
  // ---------- tree + sheet bar
  function dwRefresh(force) {
    if (!DW.open && !force) return;
    dwFixUids();
    const d = dwDoc(), cur = dwCur();
    const views = dwViewsOf(cur), hide = dwHideOf(cur), lost = (V6S.prev && V6S.prev.lostDims) || [];
    const sig = [lang, dwDocName(), d.active, JSON.stringify(DW.fold), V6S.vsel, views.join(','), hide.join(','), lost.join(','), S.bodies.map(function (b) { return b.uid + b.name + (b.solid ? 1 : 0); }).join(',')]
      .concat(d.sheets.map(function (x) { return x.id + '|' + x.name; })).join('\n');
    if (!force && sig === DW.sig) { dwSyncRibbon(); return; }
    if (DW.ren || (DW.drag && !force)) return;   // renaming / dragging: redraw after
    DW.sig = sig;
    $('dwsDocName').textContent = dwDocName();
    const tr = $('dwsTree'); tr.innerHTML = '';
    const node = function (cls, html, data) {
      const n = document.createElement('div'); n.className = 'dwsNode ' + cls; n.innerHTML = html;
      for (const k in (data || {})) n.dataset[k] = data[k];
      tr.appendChild(n); return n;
    };
    const root = node('root', dwIco('drawing', 15) + '<span class="nm"></span>', { root: '1' }); root.querySelector('.nm').textContent = dwDocName(); root.title = dwDocName();
    const bar = $('dwsTabsS'); bar.innerHTML = '';
    d.sheets.forEach(function (x) {
      const open = x.id === d.active && !DW.fold[x.id];
      const n = node('sheet' + (x.id === d.active ? ' on' : ''), '<span class="tw" title="' + dwEsc(open ? L('Thu gọn', 'Collapse') : L('Mở rộng', 'Expand')) + '">' + (open ? '▾' : '▸') + '</span>' + dwIco('sheet', 15) + '<span class="nm"></span>', { id: x.id });
      n.draggable = true; n.querySelector('.nm').textContent = x.name;
      const t = document.createElement('div'); t.className = 'dwsTab' + (x.id === d.active ? ' on' : ''); t.dataset.id = x.id; t.draggable = true;
      t.innerHTML = '<span class="nm"></span>'; t.querySelector('.nm').textContent = x.name; bar.appendChild(t);
      if (!open) return;
      // the open sheet: its views and the bodies of the model (eye = hide / show in this sheet)
      node('grp', '<span class="nm">' + dwEsc(L('Views', 'Views')) + ' (' + views.length + ')</span>');
      views.forEach(function (v) {
        const vn = node('child view' + (V6S.vsel === v ? ' on' : ''), dwIco(v === 'iso' ? 'iso' : v === 'Exploded view' ? 'explode' : 'front', 13) + '<span class="nm"></span>', { view: v });
        vn.querySelector('.nm').textContent = dwViewName(v);
      });
      node('grp', '<span class="nm">' + dwEsc(L('Body của Sheet', 'Bodies of the sheet')) + ' (' + S.bodies.length + (hide.length ? ', ' + L('ẩn ', 'hidden ') + hide.length : '') + ')</span>', { grp: 'body' });
      S.bodies.forEach(function (b) {
        const u = b.uid, hid = hide.indexOf(u) >= 0;
        const bn = node('child body' + (DW.bsel === u ? ' on' : '') + (hid ? ' hid' : ''), dwIco(b.solid ? 'bodyB' : 'body', 15) + '<span class="nm"></span>' +
          '<button class="eye' + (hid ? ' off' : '') + '" type="button" title="' + dwEsc(hid ? L('Hiện trong Sheet này', 'Show in this sheet') : L('Ẩn trong Sheet này', 'Hide in this sheet')) + '">' + dwEye(!hid) + '</button>', { uid: u });
        bn.querySelector('.nm').textContent = b.name + (b.solid ? ' · B-rep' : '');
      });
      if (lost.length) node('child warn', '<span class="nm">⚠ ' + lost.length + ' ' + dwEsc(L('kích thước mất tham chiếu', 'dimension(s) lost their reference')) + '</span>');
    });
    const add = document.createElement('div'); add.className = 'dwsTab add'; add.textContent = '+'; add.dataset.add = '1'; add.title = L('Sheet mới', 'New sheet'); bar.appendChild(add);
    $('dwsState').textContent = cur.name;
    dwSyncRibbon();
  }
  // the picked body in the tree, without rebuilding it
  function dwTreeSel() { document.querySelectorAll('#dwsTree .dwsNode.body').forEach(function (n) { n.classList.toggle('on', n.dataset.uid === DW.bsel); }); }
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
      if (n.dataset.uid && e.target.closest('.eye')) { dwSrcHide(n.dataset.uid, dwHideOf(dwCur()).indexOf(n.dataset.uid) < 0); return; }
      if (n.dataset.id && e.target.closest('.tw')) {
        if (n.dataset.id !== dwDoc().active) { DW.fold[n.dataset.id] = false; dwOpenSheet(n.dataset.id); } else DW.fold[n.dataset.id] = !DW.fold[n.dataset.id];
        dwRefresh(true); return;
      }
      if (n.dataset.add) dwNewSheet(); else if (n.dataset.id) dwOpenSheet(n.dataset.id);
      else if (n.dataset.view) { V6S.vsel = n.dataset.view === 'Exploded view' ? null : n.dataset.view; v6Paint(); dwRefresh(true); }
      else if (n.dataset.uid) dwBodyPick(DW.bsel === n.dataset.uid ? null : n.dataset.uid);
    });
    c.addEventListener('dblclick', function (e) { const n = dwNodeOf(e); if (!n || n.dataset.add || !(n.dataset.id || n.dataset.root)) return; dwStartRename(n, n.dataset.id || null); });
    c.addEventListener('contextmenu', function (e) {
      e.preventDefault(); const n = dwNodeOf(e); if (!n || n.dataset.add) return;
      if (n.dataset.root) {
        showMenu([[L('Sheet mới', 'New Sheet'), function () { dwNewSheet(); }, 'dup'], [L('Đổi tên bản vẽ', 'Rename Drawing'), function () { dwStartRename(n, null); }, 'ren'], null,
          [L('Xuất tất cả Sheet (PDF)', 'Export All Sheets (PDF)'), DW_ACT.pdfAll, 'stl']], e.clientX, e.clientY);
        return;
      }
      if (n.dataset.view) {
        const v = n.dataset.view; if (v === 'Exploded view') return;
        V6S.vsel = v; v6Paint();
        showMenu([[L('Xoá view', 'Delete view'), function () { v6DelView(v); }, 'del'], [L('Về vị trí tự động', 'Back to the automatic place'), function () { v6ViewAuto(v); }, 'home']], e.clientX, e.clientY);
        return;
      }
      if (n.dataset.uid) {
        const u = n.dataset.uid, hid = dwHideOf(dwCur()).indexOf(u) >= 0; dwBodyPick(u);
        showMenu([[hid ? L('Hiện trong Sheet này', 'Show in this sheet') : L('Ẩn trong Sheet này', 'Hide in this sheet'), function () { dwSrcHide(u, !hid); }, hid ? 'show' : 'hide'],
          [L('Chỉ hiện body này', 'Show only this body'), function () { dwSrcOnly([u]); }, 'show'], [L('Hiện mọi body', 'Show every body'), function () { dwSrcOnly(null); }, 'show']], e.clientX, e.clientY);
        return;
      }
      if (!n.dataset.id) return;
      const id = n.dataset.id;
      showMenu([[L('Mở', 'Open'), function () { dwOpenSheet(id); }, 'show'], [L('Đổi tên', 'Rename'), function () { dwStartRename(n, id); }, 'ren'],
        [L('Nhân bản', 'Duplicate'), function () { dwDupSheet(id); }, 'dup'], [L('Xoá', 'Delete'), function () { dwDelSheet(id); }, 'del'], null,
        [L('Xuất PNG', 'Export as PNG'), function () { dwExport(id, 'png').catch(showError); }, 'stl'], [L('Xuất JPG', 'Export as JPG'), function () { dwExport(id, 'jpg').catch(showError); }, 'stl'],
        [L('Xuất PDF', 'Export as PDF'), function () { const sh = dwSheet(id); dwExportPdf([id], sh.name).catch(showError); }, 'stl']], e.clientX, e.clientY);
    });
    // reorder by drag and drop
    c.addEventListener('dragstart', function (e) { const n = dwNodeOf(e); if (!n || !n.dataset.id) { e.preventDefault(); return; } DW.drag = n.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', n.dataset.id); } catch (er) { } });
    c.addEventListener('dragover', function (e) {
      if (!DW.drag) return; const n = dwNodeOf(e); e.preventDefault();
      c.querySelectorAll('.dragover').forEach(function (x) { x.classList.remove('dragover'); });
      if (n && (n.dataset.id || n.dataset.add || n.dataset.root)) n.classList.add('dragover');
    });
    c.addEventListener('drop', function (e) {
      e.preventDefault(); const n = dwNodeOf(e), id = DW.drag; DW.drag = null;
      c.querySelectorAll('.dragover').forEach(function (x) { x.classList.remove('dragover'); });
      if (!id || !n) return;
      if (!(n.dataset.add || n.dataset.root || n.dataset.id)) return;
      if (n.dataset.add || n.dataset.root) dwMoveSheet(id, n.dataset.root ? dwDoc().sheets[0].id : null);
      else dwMoveSheet(id, n.dataset.id);
    });
    c.addEventListener('dragend', function () { DW.drag = null; c.querySelectorAll('.dragover').forEach(function (x) { x.classList.remove('dragover'); }); });
  });
  $('dwsTreeAdd').addEventListener('click', function () { dwNewSheet(); });
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
  // keys while drawing: Ctrl+S = save the session, Ctrl+Shift+S = save it as another file, Ctrl+D = duplicate sheet;
  // the 3D workspace's shortcuts do not act (its undo would change the model behind the drawing)
  window.addEventListener('keydown', function (e) {
    if (!DW.open) return;
    const k = (e.key || '').toLowerCase(), tag = e.target && e.target.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && ['checkbox', 'radio', 'range', 'color', 'button'].indexOf(e.target.type) < 0);
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 's') { e.preventDefault(); e.stopPropagation(); dwCapture(); (e.shiftKey ? saveSessionAs() : saveSession()).catch(showError); return; }
      if (k === 'd') { e.preventDefault(); e.stopPropagation(); dwDupSheet(); return; }
      if ((k === 'z' || k === 'y') && !typing) { e.preventDefault(); e.stopPropagation(); dwUndo(k === 'y' || (k === 'z' && e.shiftKey)); return; }
    }
    if (typing) return;
    e.stopPropagation();
  }, true);
  // follow the canvas: working copy, Modified / Saved, ribbon states
  setInterval(function () { if (!DW.open || DW.ren) return; dwCapture(); dwRefresh(false); }, 500);
  window.addEventListener('resize', function () { if (DW.open) ribFit($('dwsRibbon')); });
