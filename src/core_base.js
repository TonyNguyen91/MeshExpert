
function MeshCore() {
  'use strict';

  // ---------- helpers ----------
  function compact(positions, indices) {
    const nv = positions.length / 3;
    const map = new Int32Array(nv).fill(-1);
    let n = 0;
    for (let i = 0; i < indices.length; i++) { const v = indices[i]; if (map[v] < 0) map[v] = n++; }
    const pos = new Float32Array(n * 3);
    for (let v = 0; v < nv; v++) {
      const m = map[v];
      if (m >= 0) { pos[3 * m] = positions[3 * v]; pos[3 * m + 1] = positions[3 * v + 1]; pos[3 * m + 2] = positions[3 * v + 2]; }
    }
    const idx = new Uint32Array(indices.length);
    for (let i = 0; i < indices.length; i++) idx[i] = map[indices[i]];
    return { positions: pos, indices: idx };
  }

  // Merge vertices with identical coordinates, drop degenerate triangles.
  function weld(positions, indices) {
    const nIn = positions.length / 3;
    const src = new Float32Array(nIn * 3);
    for (let i = 0; i < src.length; i++) src[i] = positions[i] + 0;
    const sb = new Uint32Array(src.buffer);
    let cap = 16; while (cap < nIn * 2) cap *= 2;
    const mask = cap - 1;
    const table = new Int32Array(cap).fill(-1);
    const remap = new Uint32Array(nIn);
    const out = new Float32Array(nIn * 3);
    const ob = new Uint32Array(out.buffer);
    let nv = 0;
    for (let i = 0; i < nIn; i++) {
      const a = sb[3 * i], b = sb[3 * i + 1], c = sb[3 * i + 2];
      let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791);
      h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h &= mask;
      for (;;) {
        const e = table[h];
        if (e < 0) { table[h] = nv; ob[3 * nv] = a; ob[3 * nv + 1] = b; ob[3 * nv + 2] = c; remap[i] = nv++; break; }
        if (ob[3 * e] === a && ob[3 * e + 1] === b && ob[3 * e + 2] === c) { remap[i] = e; break; }
        h = (h + 1) & mask;
      }
    }
    const nt = indices ? Math.floor(indices.length / 3) : Math.floor(nIn / 3);
    const idx = new Uint32Array(nt * 3);
    let k = 0;
    for (let t = 0; t < nt; t++) {
      const a = remap[indices ? indices[3 * t] : 3 * t];
      const b = remap[indices ? indices[3 * t + 1] : 3 * t + 1];
      const c = remap[indices ? indices[3 * t + 2] : 3 * t + 2];
      if (a === b || b === c || a === c) continue;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
    }
    return compact(out.subarray(0, nv * 3), idx.subarray(0, k));
  }

  // ---------- parsers ----------
  function parseSTL(buf) {
    const size = buf.byteLength;
    const dv = new DataView(buf);
    let isBin = false, n = 0;
    if (size >= 84) { n = dv.getUint32(80, true); if (84 + 50 * n === size) isBin = true; }
    if (!isBin) {
      const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(size, 4096)));
      if (/^\s*solid/i.test(head) && /facet|endsolid/i.test(head)) {
        const text = new TextDecoder().decode(buf);
        const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
        let arr = new Float32Array(1 << 16), len = 0, m;
        while ((m = re.exec(text)) !== null) {
          if (len + 3 > arr.length) { const a2 = new Float32Array(arr.length * 2); a2.set(arr); arr = a2; }
          arr[len++] = +m[1]; arr[len++] = +m[2]; arr[len++] = +m[3];
        }
        len -= len % 9;
        return weld(arr.subarray(0, len), null);
      }
      if (size < 84) throw new Error('File STL khong hop le');
      n = Math.min(n, Math.floor((size - 84) / 50));
    }
    const pos = new Float32Array(n * 9);
    let o = 84, p = 0;
    for (let t = 0; t < n; t++, o += 50) {
      for (let j = 0; j < 9; j++) pos[p++] = dv.getFloat32(o + 12 + 4 * j, true);
    }
    return weld(pos, null);
  }

  function parseOBJ(buf) {
    const text = new TextDecoder().decode(buf);
    let pos = new Float32Array(1 << 16), np = 0;
    let idx = new Uint32Array(1 << 16), ni = 0;
    let start = 0;
    const L = text.length;
    while (start < L) {
      let end = text.indexOf('\n', start);
      if (end < 0) end = L;
      const c0 = text.charCodeAt(start), c1 = text.charCodeAt(start + 1);
      if (c0 === 118 && (c1 === 32 || c1 === 9)) { // "v "
        const tk = text.substring(start + 2, end).trim().split(/\s+/);
        if (np + 3 > pos.length) { const a2 = new Float32Array(pos.length * 2); a2.set(pos); pos = a2; }
        pos[np++] = +tk[0]; pos[np++] = +tk[1]; pos[np++] = +tk[2];
      } else if (c0 === 102 && (c1 === 32 || c1 === 9)) { // "f "
        const tk = text.substring(start + 2, end).trim().split(/\s+/);
        const nvNow = np / 3;
        const f = [];
        for (let i = 0; i < tk.length; i++) {
          let v = parseInt(tk[i], 10);
          if (isNaN(v)) continue;
          v = v < 0 ? nvNow + v : v - 1;
          f.push(v);
        }
        for (let i = 1; i + 1 < f.length; i++) {
          if (ni + 3 > idx.length) { const a2 = new Uint32Array(idx.length * 2); a2.set(idx); idx = a2; }
          idx[ni++] = f[0]; idx[ni++] = f[i]; idx[ni++] = f[i + 1];
        }
      }
      start = end + 1;
    }
    const nvAll = np / 3;
    for (let i = 0; i < ni; i++) if (idx[i] >= nvAll) throw new Error('File OBJ co chi so dinh khong hop le');
    return weld(pos.subarray(0, np), idx.subarray(0, ni));
  }

  function parse(name, buf) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const mesh = ext === 'obj' ? parseOBJ(buf) : parseSTL(buf);
    if (mesh.indices.length === 0) throw new Error('Khong doc duoc tam giac nao trong file');
    return mesh;
  }

  // ---------- decimation (quadric error metric, iterative edge collapse) ----------
  function decimate(mesh, opt, progress) {
    const P = mesh.positions, I = mesh.indices;
    const nv = P.length / 3;
    let nt = I.length / 3;
    const startTris = nt;
    const edgeMode = opt.mode === 'edge';

    let mn0 = Infinity, mn1 = Infinity, mn2 = Infinity, mx0 = -Infinity, mx1 = -Infinity, mx2 = -Infinity;
    for (let i = 0; i < nv; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      if (x < mn0) mn0 = x; if (x > mx0) mx0 = x;
      if (y < mn1) mn1 = y; if (y > mx1) mx1 = y;
      if (z < mn2) mn2 = z; if (z > mx2) mx2 = z;
    }
    const scale = Math.max(mx0 - mn0, mx1 - mn1, mx2 - mn2) || 1;
    const c0 = (mn0 + mx0) / 2, c1 = (mn1 + mx1) / 2, c2 = (mn2 + mx2) / 2;

    const vx = new Float64Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      vx[3 * i] = (P[3 * i] - c0) / scale; vx[3 * i + 1] = (P[3 * i + 1] - c1) / scale; vx[3 * i + 2] = (P[3 * i + 2] - c2) / scale;
    }
    const vq = new Float64Array(nv * 10);
    const useFree = !!opt.freeEdge;
    const bq = useFree ? new Float64Array(nv * 10) : null;
    const vts = new Int32Array(nv), vtc = new Int32Array(nv);
    const vb = new Uint8Array(nv);
    const tv = new Int32Array(I);
    const terr = new Float64Array(nt * 4);
    const tdel = new Uint8Array(nt), tdirty = new Uint8Array(nt);
    const tn = new Float64Array(nt * 3);
    let rtid = new Int32Array(nt * 3 + 1024), rtv = new Uint8Array(nt * 3 + 1024), rlen = 0;
    const Q = new Float64Array(10), BQ = new Float64Array(10);
    let px = 0, py = 0, pz = 0, sharedCount = 0, deletedTris = 0;
    let del0 = new Uint8Array(64), del1 = new Uint8Array(64);
    const stamp = new Int32Array(nv); let stampId = 0;
    // Number of vertices adjacent to both i0 and i1 (link condition: must equal the shared triangle count).
    function commonNeighbors(i0, i1) {
      stampId += 2;
      let n = 0;
      let s = vts[i0], e = s + vtc[i0];
      for (let r = s; r < e; r++) {
        const t = rtid[r];
        if (tdel[t]) continue;
        stamp[tv[3 * t]] = stampId; stamp[tv[3 * t + 1]] = stampId; stamp[tv[3 * t + 2]] = stampId;
      }
      stamp[i0] = 0; stamp[i1] = 0;
      s = vts[i1]; e = s + vtc[i1];
      for (let r = s; r < e; r++) {
        const t = rtid[r];
        if (tdel[t]) continue;
        for (let c = 0; c < 3; c++) {
          const v = tv[3 * t + c];
          if (stamp[v] === stampId) { stamp[v] = stampId + 1; n++; }
        }
      }
      return n;
    }
    const BORDER_W = 10;

    function det(m, a11, a12, a13, a21, a22, a23, a31, a32, a33) {
      return m[a11] * m[a22] * m[a33] + m[a13] * m[a21] * m[a32] + m[a12] * m[a23] * m[a31]
           - m[a13] * m[a22] * m[a31] - m[a11] * m[a23] * m[a32] - m[a12] * m[a21] * m[a33];
    }
    function vErr(m, x, y, z) {
      return m[0] * x * x + 2 * m[1] * x * y + 2 * m[2] * x * z + 2 * m[3] * x + m[4] * y * y
           + 2 * m[5] * y * z + 2 * m[6] * y + m[7] * z * z + 2 * m[8] * z + m[9];
    }
    function addPlane(arr, v, a, b, c, d, w) {
      const o = 10 * v;
      arr[o] += w * a * a; arr[o + 1] += w * a * b; arr[o + 2] += w * a * c; arr[o + 3] += w * a * d;
      arr[o + 4] += w * b * b; arr[o + 5] += w * b * c; arr[o + 6] += w * b * d;
      arr[o + 7] += w * c * c; arr[o + 8] += w * c * d; arr[o + 9] += w * d * d;
    }
    function calcError(i0, i1) {
      const a = 3 * i0, b = 3 * i1;
      const x0 = vx[a], y0 = vx[a + 1], z0 = vx[a + 2], x1 = vx[b], y1 = vx[b + 1], z1 = vx[b + 2];
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const l2 = dx * dx + dy * dy + dz * dz;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
      if (edgeMode) { px = mx; py = my; pz = mz; return l2; }
      const qa = 10 * i0, qb = 10 * i1;
      for (let k = 0; k < 10; k++) Q[k] = vq[qa + k] + vq[qb + k];
      const border = vb[i0] & vb[i1];
      const d = det(Q, 0, 1, 2, 1, 4, 5, 2, 5, 7);
      if (!border && Math.abs(d) > 1e-10) {
        const inv = 1 / d;
        const x = -inv * det(Q, 1, 2, 3, 4, 5, 6, 5, 7, 8);
        const y = inv * det(Q, 0, 2, 3, 1, 5, 6, 2, 7, 8);
        const z = -inv * det(Q, 0, 1, 3, 1, 4, 6, 2, 5, 8);
        const ex = x - mx, ey = y - my, ez = z - mz;
        if (ex * ex + ey * ey + ez * ez <= 4 * l2) { px = x; py = y; pz = z; return vErr(Q, x, y, z); }
      }
      const e1 = vErr(Q, x0, y0, z0), e2 = vErr(Q, x1, y1, z1), e3 = vErr(Q, mx, my, mz);
      if (e1 <= e2 && e1 <= e3) { px = x0; py = y0; pz = z0; return e1; }
      if (e2 <= e3) { px = x1; py = y1; pz = z1; return e2; }
      px = mx; py = my; pz = mz; return e3;
    }
    function triNormal(t) {
      const a = 3 * tv[3 * t], b = 3 * tv[3 * t + 1], c = 3 * tv[3 * t + 2];
      const ux = vx[b] - vx[a], uy = vx[b + 1] - vx[a + 1], uz = vx[b + 2] - vx[a + 2];
      const wx = vx[c] - vx[a], wy = vx[c + 1] - vx[a + 1], wz = vx[c + 2] - vx[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l > 1e-300) { tn[3 * t] = nx / l; tn[3 * t + 1] = ny / l; tn[3 * t + 2] = nz / l; return true; }
      return false;
    }
    function triErrors(t) {
      const a = tv[3 * t], b = tv[3 * t + 1], c = tv[3 * t + 2];
      const e0 = calcError(a, b), e1 = calcError(b, c), e2 = calcError(c, a);
      terr[4 * t] = e0; terr[4 * t + 1] = e1; terr[4 * t + 2] = e2;
      terr[4 * t + 3] = Math.min(e0, e1, e2);
    }
    function edgeTriCount(a, b) {
      let n = 0;
      const s = vts[a], e = s + vtc[a];
      for (let r = s; r < e; r++) {
        const t = rtid[r];
        if (tdel[t]) continue;
        if (tv[3 * t] === b || tv[3 * t + 1] === b || tv[3 * t + 2] === b) n++;
      }
      return n;
    }
    // Would collapsing i0 -> (px,py,pz) flip any triangle around i0? Also flags triangles shared with i1.
    function flipped(x, y, z, i0, i1, deleted) {
      sharedCount = 0;
      const s = vts[i0], n = vtc[i0];
      for (let k = 0; k < n; k++) {
        const t = rtid[s + k];
        if (tdel[t]) continue;
        const c = rtv[s + k];
        const id1 = tv[3 * t + (c + 1) % 3], id2 = tv[3 * t + (c + 2) % 3];
        if (id1 === i1 || id2 === i1) { deleted[k] = 1; sharedCount++; continue; }
        let ax = vx[3 * id1] - x, ay = vx[3 * id1 + 1] - y, az = vx[3 * id1 + 2] - z;
        let bx = vx[3 * id2] - x, by = vx[3 * id2 + 1] - y, bz = vx[3 * id2 + 2] - z;
        const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz);
        if (la < 1e-300 || lb < 1e-300) return true;
        ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
        if (Math.abs(ax * bx + ay * by + az * bz) > 0.999) return true;
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const ln = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= ln; ny /= ln; nz /= ln;
        deleted[k] = 0;
        if (nx * tn[3 * t] + ny * tn[3 * t + 1] + nz * tn[3 * t + 2] < 0.2) return true;
      }
      return false;
    }
    function pushRef(t, c) {
      if (rlen >= rtid.length) {
        const n = Math.floor(rtid.length * 1.5) + 1024;
        const a = new Int32Array(n); a.set(rtid); rtid = a;
        const b = new Uint8Array(n); b.set(rtv); rtv = b;
      }
      rtid[rlen] = t; rtv[rlen] = c; rlen++;
    }
    function updateTriangles(i0, vi, deleted) {
      const s = vts[vi], n = vtc[vi];
      for (let k = 0; k < n; k++) {
        const t = rtid[s + k];
        if (tdel[t]) continue;
        if (deleted[k]) { tdel[t] = 1; deletedTris++; continue; }
        const c = rtv[s + k];
        tv[3 * t + c] = i0;
        tdirty[t] = 1;
        triNormal(t);
        triErrors(t);
        pushRef(t, c);
      }
    }
    function updateMesh(iter) {
      if (iter > 0) {
        let dst = 0;
        for (let i = 0; i < nt; i++) {
          if (tdel[i]) continue;
          if (dst !== i) {
            tv[3 * dst] = tv[3 * i]; tv[3 * dst + 1] = tv[3 * i + 1]; tv[3 * dst + 2] = tv[3 * i + 2];
            terr[4 * dst] = terr[4 * i]; terr[4 * dst + 1] = terr[4 * i + 1]; terr[4 * dst + 2] = terr[4 * i + 2]; terr[4 * dst + 3] = terr[4 * i + 3];
            tn[3 * dst] = tn[3 * i]; tn[3 * dst + 1] = tn[3 * i + 1]; tn[3 * dst + 2] = tn[3 * i + 2];
          }
          dst++;
        }
        nt = dst;
        tdel.fill(0, 0, nt);
      }
      vtc.fill(0);
      for (let i = 0; i < 3 * nt; i++) vtc[tv[i]]++;
      let acc = 0;
      for (let v = 0; v < nv; v++) { vts[v] = acc; acc += vtc[v]; vtc[v] = 0; }
      for (let t = 0; t < nt; t++) {
        for (let c = 0; c < 3; c++) {
          const v = tv[3 * t + c];
          const r = vts[v] + vtc[v]++;
          rtid[r] = t; rtv[r] = c;
        }
      }
      rlen = 3 * nt;
      if (iter !== 0) return;

      for (let t = 0; t < nt; t++) {
        if (!triNormal(t)) continue;
        const a = tv[3 * t];
        const nx = tn[3 * t], ny = tn[3 * t + 1], nz = tn[3 * t + 2];
        const d = -(nx * vx[3 * a] + ny * vx[3 * a + 1] + nz * vx[3 * a + 2]);
        addPlane(vq, a, nx, ny, nz, d, 1); addPlane(vq, tv[3 * t + 1], nx, ny, nz, d, 1); addPlane(vq, tv[3 * t + 2], nx, ny, nz, d, 1);
      }
      const ids = [], cnt = [];
      for (let v = 0; v < nv; v++) {
        ids.length = 0; cnt.length = 0;
        const s = vts[v], n = vtc[v];
        for (let k = 0; k < n; k++) {
          const t = rtid[s + k];
          for (let c = 0; c < 3; c++) {
            const id = tv[3 * t + c];
            let j = 0;
            for (; j < ids.length; j++) if (ids[j] === id) break;
            if (j === ids.length) { ids.push(id); cnt.push(1); } else cnt[j]++;
          }
        }
        for (let j = 0; j < ids.length; j++) if (cnt[j] === 1) vb[ids[j]] = 1;
      }
      for (let t = 0; t < nt; t++) {
        for (let c = 0; c < 3; c++) {
          const a = tv[3 * t + c], b = tv[3 * t + (c + 1) % 3];
          if (!(vb[a] && vb[b]) || edgeTriCount(a, b) !== 1) continue;
          const ex = vx[3 * b] - vx[3 * a], ey = vx[3 * b + 1] - vx[3 * a + 1], ez = vx[3 * b + 2] - vx[3 * a + 2];
          const nx = tn[3 * t], ny = tn[3 * t + 1], nz = tn[3 * t + 2];
          let mx = ey * nz - ez * ny, my = ez * nx - ex * nz, mz = ex * ny - ey * nx;
          const l = Math.sqrt(mx * mx + my * my + mz * mz);
          if (l < 1e-300) continue;
          mx /= l; my /= l; mz /= l;
          const d = -(mx * vx[3 * a] + my * vx[3 * a + 1] + mz * vx[3 * a + 2]);
          addPlane(vq, a, mx, my, mz, d, BORDER_W); addPlane(vq, b, mx, my, mz, d, BORDER_W);
          if (bq) { addPlane(bq, a, mx, my, mz, d, 1); addPlane(bq, b, mx, my, mz, d, 1); }
        }
      }
      for (let t = 0; t < nt; t++) triErrors(t);
    }

    const target = opt.useTarget ? Math.max(0, Math.floor(opt.targetTris)) : 0;
    const limit = opt.useMax ? Math.pow(Math.max(0, opt.maxValue) / scale, 2) : Infinity;
    const feTol2 = useFree ? Math.pow(Math.max(0, opt.freeEdgeTol) / scale, 2) : Infinity;
    const span = Math.max(1, startTris - target);
    let stall = 0;

    for (let iter = 0; iter < 2000; iter++) {
      if (startTris - deletedTris <= target) break;
      if (iter % 5 === 0) updateMesh(iter);
      tdirty.fill(0, 0, nt);
      const threshold = 1e-9 * Math.pow(iter + 3, 7);
      const thr = Math.min(threshold, limit);
      let collapses = 0;
      for (let i = 0; i < nt; i++) {
        if (terr[4 * i + 3] > thr || tdel[i] || tdirty[i]) continue;
        for (let j = 0; j < 3; j++) {
          if (!(terr[4 * i + j] <= thr)) continue;
          const i0 = tv[3 * i + j], i1 = tv[3 * i + (j + 1) % 3];
          if (vb[i0] !== vb[i1]) continue;
          const err = calcError(i0, i1);
          if (err > limit) continue;
          const x = px, y = py, z = pz;
          if (del0.length < vtc[i0]) del0 = new Uint8Array(vtc[i0] * 2);
          if (del1.length < vtc[i1]) del1 = new Uint8Array(vtc[i1] * 2);
          if (flipped(x, y, z, i0, i1, del0)) continue;
          const shared = sharedCount;
          if (flipped(x, y, z, i1, i0, del1)) continue;
          if (shared > 2 || shared < 1) continue;
          if (vb[i0] && shared !== 1) continue;
          if (commonNeighbors(i0, i1) !== shared) continue;
          if (bq && vb[i0]) {
            for (let k = 0; k < 10; k++) BQ[k] = bq[10 * i0 + k] + bq[10 * i1 + k];
            if (vErr(BQ, x, y, z) > feTol2) continue;
            for (let k = 0; k < 10; k++) bq[10 * i0 + k] = BQ[k];
          }
          vx[3 * i0] = x; vx[3 * i0 + 1] = y; vx[3 * i0 + 2] = z;
          for (let k = 0; k < 10; k++) vq[10 * i0 + k] += vq[10 * i1 + k];
          const tstart = rlen;
          updateTriangles(i0, i0, del0);
          updateTriangles(i0, i1, del1);
          const tcount = rlen - tstart;
          if (tcount <= vtc[i0]) {
            if (tcount) { rtid.copyWithin(vts[i0], tstart, tstart + tcount); rtv.copyWithin(vts[i0], tstart, tstart + tcount); }
            rlen = tstart;
          } else vts[i0] = tstart;
          vtc[i0] = tcount;
          collapses++;
          break;
        }
        if (startTris - deletedTris <= target) break;
      }
      if (progress) progress(Math.min(1, deletedTris / span));
      if (collapses === 0) {
        if (threshold >= limit) { stall++; if (stall >= 5) break; }
        else if (threshold > 1e3) { stall++; if (stall >= 10) break; }
      } else stall = 0;
    }

    let k = 0;
    const idx = new Uint32Array((startTris - deletedTris) * 3);
    for (let t = 0; t < nt; t++) {
      if (tdel[t]) continue;
      idx[k++] = tv[3 * t]; idx[k++] = tv[3 * t + 1]; idx[k++] = tv[3 * t + 2];
    }
    const pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      pos[3 * i] = vx[3 * i] * scale + c0; pos[3 * i + 1] = vx[3 * i + 1] * scale + c1; pos[3 * i + 2] = vx[3 * i + 2] * scale + c2;
    }
    const out = compact(pos, idx.subarray(0, k));
    out.before = startTris; out.after = k / 3;
    return out;
  }

  // ---------- split into connected bodies ----------
  function split(mesh, opt) {
    const P = mesh.positions, I = mesh.indices;
    const nv = P.length / 3, nt = I.length / 3;
    const parent = new Int32Array(nv);
    for (let i = 0; i < nv; i++) parent[i] = i;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    for (let t = 0; t < nt; t++) {
      const a = find(I[3 * t]), b = find(I[3 * t + 1]), c = find(I[3 * t + 2]);
      if (a !== b) parent[b] = a;
      const a2 = find(a);
      if (a2 !== c) parent[find(c)] = a2;
    }
    const compOfRoot = new Int32Array(nv).fill(-1);
    const counts = [];
    const triComp = new Int32Array(nt);
    for (let t = 0; t < nt; t++) {
      const r = find(I[3 * t]);
      let c = compOfRoot[r];
      if (c < 0) { c = counts.length; compOfRoot[r] = c; counts.push(0); }
      counts[c]++; triComp[t] = c;
    }
    const order = counts.map((n, i) => i).sort((a, b) => counts[b] - counts[a]);
    const minTris = Math.max(1, opt.minTris || 1);
    const groupOfComp = new Int32Array(counts.length).fill(-1);
    let ng = 0, smallComps = 0, smallGroup = -1;
    for (const c of order) if (counts[c] >= minTris) groupOfComp[c] = ng++;
    for (const c of order) if (counts[c] < minTris) {
      smallComps++;
      if (opt.keepSmall) { if (smallGroup < 0) smallGroup = ng++; groupOfComp[c] = smallGroup; }
    }
    const triCount = new Int32Array(ng), vertCount = new Int32Array(ng);
    const vLocal = new Int32Array(nv).fill(-1), vGroup = new Int32Array(nv).fill(-1);
    for (let t = 0; t < nt; t++) {
      const g = groupOfComp[triComp[t]];
      if (g < 0) continue;
      triCount[g]++;
      for (let c = 0; c < 3; c++) { const v = I[3 * t + c]; if (vLocal[v] < 0) { vLocal[v] = vertCount[g]++; vGroup[v] = g; } }
    }
    const bodies = [];
    for (let g = 0; g < ng; g++) bodies.push({ positions: new Float32Array(vertCount[g] * 3), indices: new Uint32Array(triCount[g] * 3), small: g === smallGroup });
    for (let v = 0; v < nv; v++) {
      const g = vGroup[v];
      if (g < 0) continue;
      const p = bodies[g].positions, o = 3 * vLocal[v];
      p[o] = P[3 * v]; p[o + 1] = P[3 * v + 1]; p[o + 2] = P[3 * v + 2];
    }
    const fill = new Int32Array(ng);
    for (let t = 0; t < nt; t++) {
      const g = groupOfComp[triComp[t]];
      if (g < 0) continue;
      const ix = bodies[g].indices; let o = fill[g];
      ix[o++] = vLocal[I[3 * t]]; ix[o++] = vLocal[I[3 * t + 1]]; ix[o++] = vLocal[I[3 * t + 2]];
      fill[g] = o;
    }
    return { bodies: bodies, totalComponents: counts.length, smallComponents: smallComps };
  }

  // ---------- writers ----------
  function writeSTL(mesh, title) {
    const P = mesh.positions, I = mesh.indices, nt = I.length / 3;
    const buf = new ArrayBuffer(84 + 50 * nt);
    const dv = new DataView(buf);
    const head = (title || 'MeshExpert').substring(0, 79);
    for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
    dv.setUint32(80, nt, true);
    let o = 84;
    for (let t = 0; t < nt; t++, o += 50) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
      dv.setFloat32(o + 12, P[a], true); dv.setFloat32(o + 16, P[a + 1], true); dv.setFloat32(o + 20, P[a + 2], true);
      dv.setFloat32(o + 24, P[b], true); dv.setFloat32(o + 28, P[b + 1], true); dv.setFloat32(o + 32, P[b + 2], true);
      dv.setFloat32(o + 36, P[c], true); dv.setFloat32(o + 40, P[c + 1], true); dv.setFloat32(o + 44, P[c + 2], true);
    }
    return new Uint8Array(buf);
  }
  function writeOBJ(mesh) {
    const P = mesh.positions, I = mesh.indices;
    const parts = ['# MeshExpert\n'];
    let chunk = [];
    for (let i = 0; i < P.length; i += 3) {
      chunk.push('v ' + P[i] + ' ' + P[i + 1] + ' ' + P[i + 2]);
      if (chunk.length >= 20000) { parts.push(chunk.join('\n') + '\n'); chunk = []; }
    }
    for (let i = 0; i < I.length; i += 3) {
      chunk.push('f ' + (I[i] + 1) + ' ' + (I[i + 1] + 1) + ' ' + (I[i + 2] + 1));
      if (chunk.length >= 20000) { parts.push(chunk.join('\n') + '\n'); chunk = []; }
    }
    if (chunk.length) parts.push(chunk.join('\n') + '\n');
    return new TextEncoder().encode(parts.join(''));
  }

  let crcTable = null;
  function crc32(u8) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // Uncompressed ZIP. files: [{name, data: Uint8Array}] -> array of Uint8Array parts
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    }
    let cdSize = 0;
    for (const c of central) cdSize += c.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return parts.concat(central, [new Uint8Array(end.buffer)]);
  }

