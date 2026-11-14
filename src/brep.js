
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
    return (r.feats || []).every(function (f) { return BR_FEATS[f.type]; });
  }
  function brBase(r) {
    const reg = skRegions(r.ents).regions.filter(function (g, i) { return !r.off || r.off.indexOf(i) < 0; });
    if (!reg.length || reg.some(function (g) { return g.segs.some(function (s) { return !s; }); })) throw new Error('profile');
    const plane = { origin: r.frame.o, x_dir: r.frame.u, y_dir: r.frame.v };
    const regions = reg.map(function (g) { return { outer: { segs: g.segs[0] }, holes: g.segs.slice(1).map(function (s) { return { segs: s }; }) }; });
    const p = r.params;
    if (r.type === 'extrude') {
      const d = p.depth, n = V.norm(r.frame.n), es = p.edge && p.edge !== 'none' ? (p.edgeSize || 0) : 0, sh = p.shell || 0;
      if (!(d > 0)) throw new Error('depth');
      if (es * (p.edgeBoth ? 2 : 1) >= d || (sh > 0 && sh >= d)) throw new Error('size');
      const top = p.sym ? d / 2 : p.flip ? -d : d, bot = p.sym ? -d / 2 : 0, out = top > bot ? 1 : -1;
      let id;
      if (!p.draft) id = brCall({ op: 'extrude', plane: plane, regions: regions, start: p.sym ? -d / 2 : p.flip ? -d : 0, end: p.sym ? d / 2 : p.flip ? 0 : d }).id;
      else {                                                  // draft: the profile is the section at the bottom, the walls lean in going up
        const pl = p.sym ? { origin: V.add(r.frame.o, V.mul(n, -d / 2)), x_dir: r.frame.u, y_dir: r.frame.v } : plane;
        id = brCall({ op: 'extrudeTapered', plane: pl, regions: regions, from: 0, to: d, dir: p.flip && !p.sym ? -1 : 1, taper: -p.draft * Math.PI / 180 }).id;
      }
      const lvl = function (q) { return V.dot(V.sub(q, r.frame.o), n); };
      const swap = function (nx) { brCall({ op: 'free', id: id }); id = nx; };
      if (es > 0) {                                           // round / bevel the edges of the end face(s)
        const caps = [top].concat(p.edgeBoth && !sh ? [bot] : []), tol = 1e-6 * (1 + d);
        const pts = brCall({ op: 'info', id: id }).edges.filter(function (e) { return caps.some(function (h) { return Math.abs(lvl(e.mid) - h) < tol; }); }).map(function (e) { return e.mid; });
        if (pts.length) swap(brCall(p.edge === 'fillet' ? { op: 'fillet', id: id, r: es, edges: pts } : { op: 'chamfer', id: id, d: es, edges: pts }).id);
      }
      if (sh > 0) {                                           // hollow, open at the end face(s)
        const m = brCall({ op: 'mesh', id: id, chord: 0.5 }), P = m.pos, T = m.tri, seen = new Set(), open = [], tol = 1e-5 * (1 + d);
        for (let t = 0; t < T.length; t += 3) {
          const fc = m.face[t / 3];
          if (seen.has(fc)) continue;
          const A = [P[3 * T[t]], P[3 * T[t] + 1], P[3 * T[t] + 2]], B = [P[3 * T[t + 1]], P[3 * T[t + 1] + 1], P[3 * T[t + 1] + 2]], C = [P[3 * T[t + 2]], P[3 * T[t + 2] + 1], P[3 * T[t + 2] + 2]];
          const c = V.mul(V.add(V.add(A, B), C), 1 / 3), nn = V.cross(V.sub(B, A), V.sub(C, A));
          if (Math.abs(lvl(c) - top) < tol && V.dot(nn, n) * out > 0.99 * V.len(nn)) { seen.add(fc); open.push(c); }
        }
        if (!open.length) throw new Error('shell: end face not found');
        swap(brCall({ op: 'shell', id: id, t: sh, open: open }).id);
      }
      return id;
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
    const T = m.tri, I = [], own = new Map(), E = [], nv = out.length / 3;
    for (let t = 0; t < T.length; t += 3) {
      const a = at[T[t]], b = at[T[t + 1]], c = at[T[t + 2]];
      if (a === b || b === c || a === c) continue;
      I.push(a, b, c);
      const fc = m.face[t / 3];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {          // a mesh edge between two different B-rep faces is a B-rep edge
        const k = u < v ? u * nv + v : v * nv + u, o = own.get(k);
        if (o === undefined) own.set(k, fc); else if (o !== fc && o !== -1) { E.push(u, v); own.set(k, -1); }
      }
    }
    return { positions: Float32Array.from(out), indices: Uint32Array.from(I), edges: Uint32Array.from(E), engine: 'brep' };
  }
  // the geometry of an engine mesh: it knows it is B-rep and carries its true edges for drawing
  function brGeo(bm) {
    const g = makeGeo(bm.positions, bm.indices);
    g.brep = true; g.brepE = bm.edges;
    return g;
  }
  // mesh of a recipe from the engine, or null (then the caller uses the mesh method)
  async function brepMeshOf(r) {
    try {
      const id = await brepSolid(r);
      if (id === null) { brLast = brCan(r) ? brWhy : L('lệnh này chưa có trong lõi B-rep (Replace face)', 'this command is not in the B-rep engine yet (Replace face)'); return null; }
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
    const l = selBodies();
    if (!l.length) { needSel(); return; }
    const solids = l.filter(function (b) { return b.solid && brCan(b.solid); });
    if (!solids.length) { flash(L('STEP (solid) chỉ xuất khối solid dựng từ sketch và đang là B-rep. Sketch / geometry xuất bằng nút STEP ở danh sách Sketches / Geos', 'STEP (solid) is only for B-rep solids built from sketches. Sketches / geometry go out with the STEP button on the Sketches / Geos list'), true); return; }
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
      const skip = l.length - solids.length;
      flash(L('Đã xuất STEP: ', 'STEP written: ') + solids.length + L(' khối', ' solids') + (skip ? L(' · bỏ qua ', ' · skipped ') + skip + L(' body không phải B-rep', ' non-B-rep bodies') : ''), true);
    } catch (e) { showError(e); }
    setBusy(false);
  }
  $('bStep').addEventListener('click', exportStep);
