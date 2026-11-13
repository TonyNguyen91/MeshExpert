
  // ================= exact solids (embedded B-rep engine) =================
  // A solid made from a sketch is rebuilt in the B-rep engine from its recipe (Extrude / Revolve, then Fillet,
  // Chamfer, Shell). The engine gives exact faces, so rounds and walls come out clean and the solid can be
  // saved as STEP. Anything the engine cannot do falls back to the mesh method used before.
  let brW = null, brP = null, brWhy = '';
  const brKeep = new Map();                                  // recipe step key -> engine body id
  const brFail = new Set();                                  // recipe step keys the engine could not build
  async function brepLib() {
    if (brW) return brW;
    if (!brP) brP = (async function () {
      try {
        if (typeof BREP_GZ === 'undefined' || typeof wasm_bindgen === 'undefined') { brWhy = L('file không có lõi B-rep', 'this file has no B-rep engine'); return null; }
        if (typeof DecompressionStream === 'undefined') { brWhy = L('trình duyệt quá cũ (cần Chrome / Edge 80 trở lên)', 'the browser is too old (Chrome / Edge 80 or newer needed)'); return null; }
        const bin = Uint8Array.from(atob(BREP_GZ), function (c) { return c.charCodeAt(0); });
        const raw = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        brW = await wasm_bindgen({ module_or_path: await WebAssembly.compile(raw) });
      } catch (e) { console.warn('B-rep engine not available', e); brW = null; brWhy = L('không nạp được lõi B-rep: ', 'the B-rep engine could not load: ') + (e.message || e); }
      return brW;
    })();
    const w = await brP;
    if (!w) brP = null;
    return w;
  }
  const brEnc = new TextEncoder(), brDec = new TextDecoder();
  function brCall(o) {
    const w = brW;
    if (!w) throw new Error('B-rep engine not loaded');
    let r;
    try {
      const b = brEnc.encode(JSON.stringify(o)), p = w.mrt_alloc(b.length);
      new Uint8Array(w.memory.buffer, p, b.length).set(b);
      const n = w.mrt_call(p, b.length);
      w.mrt_free(p, b.length);
      r = JSON.parse(brDec.decode(new Uint8Array(w.memory.buffer, w.mrt_out(), n)));
    } catch (e) {                                             // the engine stopped: start a fresh one next time
      brW = null; brP = null; brKeep.clear(); brFail.clear();
      throw new Error('B-rep: ' + (e.message || e));
    }
    if (r.err) throw new Error(r.err);
    return r.ok;
  }
  const BR_FEATS = { fillet: true, chamfer: true, shell: true, moveface: true, draft: true };
  function brCan(r) {
    if (!r || (r.type !== 'extrude' && r.type !== 'revolve')) return false;
    if (r.type === 'extrude') { const p = r.params; if (p.draft || p.shell > 0 || (p.edge && p.edge !== 'none' && p.edgeSize > 0)) return false; }
    return (r.feats || []).every(function (f) { return BR_FEATS[f.type]; });
  }
  function brBase(r) {
    const reg = skRegions(r.ents).regions.filter(function (g, i) { return !r.off || r.off.indexOf(i) < 0; });
    if (!reg.length || reg.some(function (g) { return g.segs.some(function (s) { return !s; }); })) throw new Error('profile');
    const plane = { origin: r.frame.o, x_dir: r.frame.u, y_dir: r.frame.v };
    const regions = reg.map(function (g) { return { outer: { segs: g.segs[0] }, holes: g.segs.slice(1).map(function (s) { return { segs: s }; }) }; });
    const p = r.params;
    if (r.type === 'extrude') {
      const d = p.depth;
      return brCall({ op: 'extrude', plane: plane, regions: regions, start: p.sym ? -d / 2 : p.flip ? -d : 0, end: p.sym ? d / 2 : p.flip ? 0 : d }).id;
    }
    let o = [0, 0], dir = p.axis === 'v' ? [0, 1] : [1, 0];
    if (p.axis !== 'u' && p.axis !== 'v') { const e = r.ents.filter(function (q) { return q.axis; })[+p.axis]; if (!e) throw new Error('axis'); o = e.a; dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]]; }
    return brCall({ op: 'revolve', plane: plane, regions: regions, axisOrigin: o, axisDir: dir, angle: Math.min(360, Math.max(1, p.angle)) * Math.PI / 180 }).id;
  }
  function brFeat(id, f) {
    if (f.type !== 'moveface' && !(f.v > 0)) throw new Error('size');
    const facePt = function (d) { return d.at || d.c; };
    if (f.type === 'shell') return brCall({ op: 'shell', id: id, t: f.v, open: (f.sel.faces || []).map(facePt) }).id;
    if (f.type === 'moveface') return brCall({ op: 'offsetFaces', id: id, at: f.sel.faces.map(facePt), d: f.v }).id;
    if (f.type === 'draft') {
      const N = f.sel.neutral[0], n = V.norm(N.n), x = V.norm(Math.abs(n[0]) < 0.9 ? V.cross([1, 0, 0], n) : V.cross([0, 1, 0], n)), y = V.cross(n, x);
      return brCall({ op: 'draft', id: id, faces: f.sel.faces.map(facePt), neutral: { origin: facePt(N), x_dir: x, y_dir: y }, pull: V.mul(n, f.flip ? -1 : 1), angle: f.v * Math.PI / 180 }).id;
    }
    const pts = f.sel.edges.map(function (d) { return d.at || d.pts[4]; });
    return brCall(f.type === 'fillet' ? { op: 'fillet', id: id, r: f.v, edges: pts } : { op: 'chamfer', id: id, d: f.v, edges: pts }).id;
  }
  // the engine body of a recipe (null when the engine is missing or cannot build it)
  async function brepSolid(r) {
    if (!brCan(r) || !(await brepLib())) return null;
    while (brKeep.size > 40) { const k = brKeep.keys().next().value; try { brCall({ op: 'free', id: brKeep.get(k) }); } catch (e) { /* engine reset */ } brKeep.delete(k); }
    let key = JSON.stringify([r.type, r.frame, r.ents, r.params, r.off || []]);
    const step = function (k, make) {
      if (brFail.has(k)) throw new Error('known failure');
      let v = brKeep.get(k);
      if (v === undefined) { try { v = make(); } catch (e) { if (brW) { brFail.add(k); if (brFail.size > 200) brFail.clear(); } throw e; } brKeep.set(k, v); }
      return v;
    };
    let id = step(key, function () { return brBase(r); });
    for (const f of r.feats || []) {
      key += '|' + JSON.stringify([f.type, f.v, f.flip, f.sel]);
      const from = id;
      id = step(key, function () { return brFeat(from, f); });
    }
    return id;
  }
  function brMesh(id) {
    const m = brCall({ op: 'mesh', id: id, chord: 0.02 });
    // faces carry their own copies of shared nodes: weld equal points so the mesh is closed
    const P = m.pos, map = new Map(), at = new Int32Array(P.length / 3), out = [];
    for (let i = 0; i < at.length; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], k = Math.round(x * 1e5) + ',' + Math.round(y * 1e5) + ',' + Math.round(z * 1e5);
      let j = map.get(k);
      if (j === undefined) { j = out.length / 3; map.set(k, j); out.push(x, y, z); }
      at[i] = j;
    }
    const T = m.tri, I = [];
    for (let t = 0; t < T.length; t += 3) {
      const a = at[T[t]], b = at[T[t + 1]], c = at[T[t + 2]];
      if (a !== b && b !== c && a !== c) I.push(a, b, c);
    }
    return { positions: Float32Array.from(out), indices: Uint32Array.from(I), engine: 'brep' };
  }
  // mesh of a recipe from the engine, or null (then the caller uses the mesh method)
  async function brepMeshOf(r) {
    try {
      const id = await brepSolid(r);
      if (id === null) { brLast = brCan(r) ? brWhy : L('lệnh hoặc tùy chọn này chưa có trong lõi B-rep (draft / bo / vát / vỏ trong hộp thoại Extrude, Replace face)', 'this command or option is not in the B-rep engine yet (draft / round / bevel / wall in the Extrude dialog, Replace face)'); return null; }
      brLast = ''; return brMesh(id);
    }
    catch (e) { console.warn('B-rep:', e.message || e); brLast = L('lõi B-rep không dựng được: ', 'the B-rep engine could not build it: ') + (e.message === 'known failure' ? L('như lần trước', 'as before') : (e.message || e)); return null; }
  }
  let brLast = '';
  // tell which engine made the solid (and why not B-rep)
  function brNote(isBrep) {
    if (isBrep) flash(L('Khối B-rep (chính xác, xuất được STEP)', 'B-rep solid (exact, can be saved as STEP)'));
    else flash(L('Khối dựng bằng lưới — ', 'Built as a mesh — ') + (brLast || L('lõi B-rep không chạy', 'the B-rep engine did not run')), true);
  }
  async function exportStep() {
    const l = needSel();
    if (!l.length) return;
    const solids = l.filter(function (b) { return b.solid && brCan(b.solid); });
    if (!solids.length) { flash(L('STEP chỉ xuất được khối solid dựng từ sketch (Extrude / Revolve, Fillet, Chamfer, Shell, Move face, Draft)', 'STEP is only for solids built from sketches (Extrude / Revolve, Fillet, Chamfer, Shell, Move face, Draft)'), true); return; }
    showError(null); setBusy(true, 'STEP...');
    try {
      const ids = [];
      for (const b of solids) {
        const id = await brepSolid(b.solid);
        if (id === null) throw new Error(L('Không khởi động được lõi B-rep', 'The B-rep engine could not start'));
        ids.push(brCall({ op: 'transform', id: id, m: Array.from(b.matrix) }).id);   // both column-major
      }
      const txt = brCall({ op: 'step', ids: ids }).step;
      for (const id of ids) brCall({ op: 'free', id: id });
      download([txt], (solids.length === 1 ? safe(solids[0].name) : 'solids') + '.step');
      if (solids.length < l.length) flash(L('Bỏ qua ', 'Skipped ') + (l.length - solids.length) + L(' body không phải solid từ sketch', ' bodies that are not sketch solids'), true);
    } catch (e) { showError(e); }
    setBusy(false);
  }
  $('bStep').addEventListener('click', exportStep);
