
  // ===================== Drawing: export (PNG / JPG per sheet, PDF per sheet or all sheets) =====================
  // PDF pages are built from the drawing itself, not from a picture of it: edges, hidden lines, dimension lines, arrows
  // and texts are vector (texts with the PDF's Helvetica; a text with letters outside its character set, such as
  // Vietnamese ư / ơ / ộ, goes into the picture layer at full resolution); the shaded fill of the views is one JPEG under
  // the vectors. Page size = the sheet's paper size; one page per sheet in Drawing Tree order.
  // PDF standard fonts: Helvetica / Times / Courier in 4 styles each (F1..F12); a canvas font maps by its first family
  const DW_PDFFONT = { H: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'], T: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'], C: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'] };
  const DW_PDFCSS = { H: 'Arial, Helvetica, "Liberation Sans", sans-serif', T: '"Times New Roman", Times, "Liberation Serif", serif', C: '"Courier New", Courier, "Liberation Mono", monospace' };
  function dwFam(f) {
    const first = String(f).replace(/^.*?[\d.]+px\s*/, '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    return /times|georgia|cambria|garamond|^serif$/.test(first) ? 'T' : /courier|consolas|mono/.test(first) ? 'C' : 'H';
  }
  function dwFontRes(op) { const fi = ['H', 'T', 'C'].indexOf(op.fam || 'H') * 4 + (op.bold ? 1 : 0) + (op.it ? 2 : 0); return 'F' + (fi + 1); }
  function dwAnsi(s) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 255 || (c >= 128 && c < 160)) return false; } return true; }
  // a 2D context that draws pictures on `real` and records lines / texts as vectors (sheet px)
  function dwRecCtx(real) {
    const ops = []; let path = [];
    const tp = function (x, y) { const m = real.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
    const sc = function () { const m = real.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); };
    const H = {
      __rec: ops, __tp: tp,
      beginPath: function () { path = []; },
      moveTo: function (x, y) { path.push(['m'].concat(tp(x, y))); },
      lineTo: function (x, y) { path.push(['l'].concat(tp(x, y))); },
      closePath: function () { path.push(['h']); },
      stroke: function () { const k = sc(); ops.push({ t: 'S', p: path.slice(), w: real.lineWidth * k, c: real.strokeStyle, d: real.getLineDash().map(function (v) { return v * k; }) }); },
      fill: function () { ops.push({ t: 'F', p: path.slice(), c: real.fillStyle }); },
      fillText: function (s, x, y) {
        s = String(s);
        if (!dwAnsi(s) || !s.trim()) { real.fillText(s, x, y); return; }
        const m = real.measureText(s), al = real.textAlign, w = m.width, f = real.font, bl = real.textBaseline;
        const dx = al === 'center' ? -w / 2 : (al === 'right' || al === 'end') ? -w : 0;
        const asc = m.actualBoundingBoxAscent; real.textBaseline = 'alphabetic'; const ascA = real.measureText(s).actualBoundingBoxAscent; real.textBaseline = bl;
        const yb = y - asc + ascA, px = parseFloat((f.match(/([\d.]+)px/) || [0, 12])[1]), bold = /bold|[6-9]00/.test(f), it = /italic|oblique/.test(f);
        const fam = dwFam(f);
        real.font = (it ? 'italic ' : '') + (bold ? 'bold ' : '') + px + 'px ' + DW_PDFCSS[fam]; const wa = real.measureText(s).width; real.font = f;
        const t = real.getTransform();
        ops.push({ t: 'T', s: s, x: x + dx, y: yb, size: px, bold: bold, it: it, fam: fam, hz: wa > 0 ? w / wa : 1, m: [t.a, t.b, t.c, t.d, t.e, t.f], c: real.fillStyle });
      }
    };
    return new Proxy(real, {
      get: function (t, k) { if (k in H) return H[k]; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
      set: function (t, k, v) { t[k] = v; return true; }
    });
  }
  // a view's edge lines (view px) onto the record, through the view -> sheet placement
  function dwRecEdges(c2, vec, tr) {
    const conv = function (lines) {
      const p = [];
      for (const ln of lines) for (let i = 0; i < ln.length; i += 2) { const q = c2.__tp(tr.x0 + ln[i] * tr.s, tr.y0 + ln[i + 1] * tr.s); p.push([i ? 'l' : 'm', q[0], q[1]]); }
      return p;
    };
    if (vec.hid.length) { const w = Math.max(1, vec.lw * 0.6) * tr.s; c2.__rec.push({ t: 'S', p: conv(vec.hid), w: w, c: '#7d7d7d', d: [4 * vec.lw * tr.s, 3 * vec.lw * tr.s], cap: 1 }); }
    if (vec.vis.length) c2.__rec.push({ t: 'S', p: conv(vec.vis), w: vec.lw * tr.s, c: '#111111', d: [], cap: 1 });
  }
  // one page: the open sheet at full size
  async function dwPdfPage() {
    const o = v6Sync(); o.vec = true; o.bg = 'w';
    const R = await v6Render(o, 1, o.ss); R.k = 1;
    const cv = document.createElement('canvas'); cv.width = o.W; cv.height = o.H;
    const c2 = cv.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, o.W, o.H);
    const rec = dwRecCtx(c2); v6Compose(rec, o, R, 1);
    const jb = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', 0.92); });
    return { W: o.W, H: o.H, dpi: o.dpi, jpg: new Uint8Array(await jb.arrayBuffer()), ops: rec.__rec };
  }
  function dwCss(c) {
    c = String(c || '#000').trim();
    let m = c.match(/^#([0-9a-f]{3})$/i); if (m) return [0, 1, 2].map(function (i) { return parseInt(m[1][i] + m[1][i], 16) / 255; });
    m = c.match(/^#([0-9a-f]{6})/i); if (m) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16) / 255; });
    m = c.match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(',').slice(0, 3).map(function (v) { return (+v) / 255; });
    return [0, 0, 0];
  }
  function dwN(v) { return (Math.round(v * 1000) / 1000).toString(); }
  function dwLatin1(str) { const u = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255; return u; }
  function dwPdfStr(s) { return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }
  function dwPdfOps(ops) {
    const out = [];
    const path = function (p) { for (const q of p) out.push(q[0] === 'h' ? 'h' : dwN(q[1]) + ' ' + dwN(q[2]) + ' ' + q[0]); };
    for (const op of ops) {
      const c = dwCss(op.c).map(dwN).join(' ');
      if (op.t === 'S') {
        if (!op.p.length) continue;
        out.push(c + ' RG', dwN(Math.max(0.1, op.w)) + ' w', '1 J 1 j', '[' + (op.d || []).map(dwN).join(' ') + '] 0 d'); path(op.p); out.push('S');
      } else if (op.t === 'F') { if (!op.p.length) continue; out.push(c + ' rg'); path(op.p); out.push('f'); }
      else if (op.t === 'T') {
        const m = op.m, sz = op.size, hz = op.hz;
        const tm = [m[0] * hz * sz, m[1] * hz * sz, -m[2] * sz, -m[3] * sz, m[0] * op.x + m[2] * op.y + m[4], m[1] * op.x + m[3] * op.y + m[5]];
        out.push(c + ' rg', 'BT /' + dwFontRes(op) + ' 1 Tf ' + tm.map(dwN).join(' ') + ' Tm ' + dwPdfStr(op.s) + ' Tj ET');
      }
    }
    return out.join('\n');
  }
  async function dwDeflate(u8) {
    if (!window.CompressionStream) return null;
    const st = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  async function dwPdfBuild(pages) {
    const parts = [], offs = []; let len = 0;
    const add = function (x) { const b = typeof x === 'string' ? dwLatin1(x) : x; parts.push(b); len += b.length; };
    const obj = function (n, chunks) { offs[n] = len; add(n + ' 0 obj\n'); chunks.forEach(add); add('\nendobj\n'); };
    add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    const np = pages.length, P0 = 15, kids = pages.map(function (p, i) { return (P0 + 3 * i) + ' 0 R'; }).join(' ');
    obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    obj(2, ['<< /Type /Pages /Kids [' + kids + '] /Count ' + np + ' >>']);
    const fonts = DW_PDFFONT.H.concat(DW_PDFFONT.T, DW_PDFFONT.C);
    fonts.forEach(function (nm, i) { obj(3 + i, ['<< /Type /Font /Subtype /Type1 /BaseFont /' + nm + ' /Encoding /WinAnsiEncoding >>']); });
    const fres = fonts.map(function (nm, i) { return '/F' + (i + 1) + ' ' + (3 + i) + ' 0 R'; }).join(' ');
    for (let i = 0; i < np; i++) {
      const p = pages[i], s = 72 / p.dpi, wpt = p.W * s, hpt = p.H * s, n = P0 + 3 * i;
      const content = 'q\n' + dwN(wpt) + ' 0 0 ' + dwN(hpt) + ' 0 0 cm\n/Im0 Do\nQ\nq\n' + dwN(s) + ' 0 0 ' + dwN(-s) + ' 0 ' + dwN(hpt) + ' cm\n' + dwPdfOps(p.ops) + '\nQ\n';
      const raw = dwLatin1(content), z = await dwDeflate(raw);
      obj(n, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + dwN(wpt) + ' ' + dwN(hpt) + '] /Resources << /Font << ' + fres + ' >> /XObject << /Im0 ' + (n + 2) + ' 0 R >> >> /Contents ' + (n + 1) + ' 0 R >>']);
      obj(n + 1, ['<< /Length ' + (z || raw).length + (z ? ' /Filter /FlateDecode' : '') + ' >>\nstream\n', z || raw, '\nendstream']);
      obj(n + 2, ['<< /Type /XObject /Subtype /Image /Width ' + p.W + ' /Height ' + p.H + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpg.length + ' >>\nstream\n', p.jpg, '\nendstream']);
    }
    const nobj = P0 + 3 * np, xref = len;
    let x = 'xref\n0 ' + nobj + '\n0000000000 65535 f \n';
    for (let i = 1; i < nobj; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    add(x + 'trailer\n<< /Size ' + nobj + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }
  // every sheet into its own file (PNG / JPG / PDF), file name = sheet name; with the folder picker (when the browser has
  // it) all files go into one chosen folder, otherwise they are downloaded one after the other
  async function dwExportEach(fmt) {
    const d = dwDoc(); dwCapture();
    let dir = null;
    if (window.showDirectoryPicker) {
      try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); }
      catch (e) { if (e && e.name === 'AbortError') return; dir = null; }
    }
    const keep = d.active, out = [], used = {};
    setBusy(true, L('Đang xuất từng Sheet…', 'Exporting each sheet…'));
    await new Promise(function (r) { setTimeout(r, 30); });
    try {
      for (const s of d.sheets) {
        if (d.active !== s.id) { d.active = s.id; v6Put(s.work); }
        let blob;
        if (fmt === 'pdf') blob = await dwPdfBuild([await dwPdfPage()]);
        else {
          const o = v6Sync(); o.fmt = fmt; o.bg = fmt === 'png' ? $('v6Bg').value : 'w';
          const R = await v6Render(o, 1, o.ss); blob = await v6Encode(v6Sheet(o, R, 1), o);
        }
        let nm = (s.name || 'Sheet').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Sheet', base = nm, i = 2;
        while (used[nm.toLowerCase()]) nm = base + ' (' + (i++) + ')';
        used[nm.toLowerCase()] = 1;
        out.push([nm + '.' + fmt, blob]);
      }
    } finally {
      const k = dwSheet(keep); d.active = keep; v6Put(k.work); dwTabKeep(k.work.mode); dwHistReset(k);
      setBusy(false);
    }
    if (dir) {
      for (const f of out) { const fh = await dir.getFileHandle(f[0], { create: true }), w = await fh.createWritable(); await w.write(f[1]); await w.close(); }
      flash(L('Đã lưu ', 'Saved ') + out.length + L(' file vào thư mục ', ' file(s) into the folder ') + dir.name);
    } else {
      for (const f of out) { download([f[1]], f[0]); await new Promise(function (r) { setTimeout(r, 350); }); }
      flash(L('Đã xuất ', 'Exported ') + out.length + ' file ' + fmt.toUpperCase());
    }
    return out.map(function (f) { return f[0]; });
  }
  // PDF of some sheets (ids, Drawing Tree order), the open sheet comes back afterwards
  async function dwExportPdf(ids, fname) {
    const d = dwDoc(); dwCapture();
    const keep = d.active, pages = [];
    setBusy(true, L('Đang dựng PDF…', 'Building the PDF…'));
    await new Promise(function (r) { setTimeout(r, 30); });
    try {
      for (const id of ids) {
        const s = dwSheet(id); if (!s) continue;
        if (d.active !== id) { d.active = id; v6Put(s.work); }
        pages.push(await dwPdfPage());
      }
    } finally {
      const k = dwSheet(keep); d.active = keep; v6Put(k.work); dwTabKeep(k.work.mode); dwHistReset(k);
      setBusy(false);
    }
    const blob = await dwPdfBuild(pages);
    download([blob], fname.replace(/[\\/:*?"<>|]+/g, '_') + '.pdf');
    flash(L('Đã xuất PDF ', 'Exported PDF ') + pages.length + L(' trang, ', ' page(s), ') + v6Size(blob.size));
    return blob;
  }
