
  // ---------- BVH + ray casting ----------
  function buildBVH(P, I) {
    const nt = I.length / 3;
    const tb = new Float32Array(nt * 6), cen = new Float32Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      for (let k = 0; k < 3; k++) {
        const x = P[a + k], y = P[b + k], z = P[c + k];
        const mn = Math.min(x, y, z), mx = Math.max(x, y, z);
        tb[6 * t + k] = mn; tb[6 * t + 3 + k] = mx; cen[3 * t + k] = (mn + mx) / 2;
      }
    }
    const order = new Uint32Array(nt);
    for (let i = 0; i < nt; i++) order[i] = i;
    let cap = Math.max(64, nt >> 1);
    let nb = new Float32Array(cap * 6), nl = new Int32Array(cap * 2);
    let count = 1;
    const stack = [0, 0, nt];
    const bmn = [0, 0, 0], bmx = [0, 0, 0], cmn = [0, 0, 0], cmx = [0, 0, 0];
    while (stack.length) {
      const end = stack.pop(), start = stack.pop(), node = stack.pop();
      for (let k = 0; k < 3; k++) { bmn[k] = cmn[k] = Infinity; bmx[k] = cmx[k] = -Infinity; }
      for (let i = start; i < end; i++) {
        const t = order[i];
        for (let k = 0; k < 3; k++) {
          const lo = tb[6 * t + k], hi = tb[6 * t + 3 + k], c = cen[3 * t + k];
          if (lo < bmn[k]) bmn[k] = lo; if (hi > bmx[k]) bmx[k] = hi;
          if (c < cmn[k]) cmn[k] = c; if (c > cmx[k]) cmx[k] = c;
        }
      }
      for (let k = 0; k < 3; k++) { nb[6 * node + k] = bmn[k]; nb[6 * node + 3 + k] = bmx[k]; }
      const n = end - start;
      let axis = 0;
      if (cmx[1] - cmn[1] > cmx[axis] - cmn[axis]) axis = 1;
      if (cmx[2] - cmn[2] > cmx[axis] - cmn[axis]) axis = 2;
      if (n <= 4 || !(cmx[axis] - cmn[axis] > 0)) { nl[2 * node] = -(start + 1); nl[2 * node + 1] = n; continue; }
      const mid = (cmn[axis] + cmx[axis]) / 2;
      let i = start, j = end - 1;
      while (i <= j) {
        if (cen[3 * order[i] + axis] < mid) i++;
        else { const tmp = order[i]; order[i] = order[j]; order[j] = tmp; j--; }
      }
      let m = i;
      if (m === start || m === end) m = (start + end) >> 1;
      if (count + 2 > cap) {
        cap *= 2;
        const nb2 = new Float32Array(cap * 6); nb2.set(nb); nb = nb2;
        const nl2 = new Int32Array(cap * 2); nl2.set(nl); nl = nl2;
      }
      const l = count++, r = count++;
      nl[2 * node] = l; nl[2 * node + 1] = r;
      stack.push(l, start, m, r, m, end);
    }
    return { nb: nb, nl: nl, order: order, P: P, I: I };
  }

  let hitT = 0, hitTri = -1;
  const rstack = [];
  // Closest (or any) hit with tmin < t < tmax. Result in hitT / hitTri.
  function rayCast(bvh, ox, oy, oz, dx, dy, dz, tmin, tmax, skip, any) {
    const nb = bvh.nb, nl = bvh.nl, order = bvh.order, P = bvh.P, I = bvh.I;
    const ix = 1 / (dx === 0 ? 1e-300 : dx), iy = 1 / (dy === 0 ? 1e-300 : dy), iz = 1 / (dz === 0 ? 1e-300 : dz);
    hitTri = -1;
    let best = tmax;
    rstack.length = 0; rstack.push(0);
    while (rstack.length) {
      const node = rstack.pop(), o6 = 6 * node;
      let t0 = (nb[o6] - ox) * ix, t1 = (nb[o6 + 3] - ox) * ix, tn, tf;
      if (t0 > t1) { tn = t1; tf = t0; } else { tn = t0; tf = t1; }
      t0 = (nb[o6 + 1] - oy) * iy; t1 = (nb[o6 + 4] - oy) * iy;
      if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
      if (t0 > tn) tn = t0; if (t1 < tf) tf = t1;
      t0 = (nb[o6 + 2] - oz) * iz; t1 = (nb[o6 + 5] - oz) * iz;
      if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
      if (t0 > tn) tn = t0; if (t1 < tf) tf = t1;
      if (!(tn <= tf) || tf < tmin || tn > best) continue;
      const l = nl[2 * node];
      if (l >= 0) { rstack.push(l, nl[2 * node + 1]); continue; }
      const s = -l - 1, e = s + nl[2 * node + 1];
      for (let i = s; i < e; i++) {
        const tri = order[i];
        if (tri === skip) continue;
        const a = 3 * I[3 * tri], b = 3 * I[3 * tri + 1], c = 3 * I[3 * tri + 2];
        const ax = P[a], ay = P[a + 1], az = P[a + 2];
        const e1x = P[b] - ax, e1y = P[b + 1] - ay, e1z = P[b + 2] - az;
        const e2x = P[c] - ax, e2y = P[c + 1] - ay, e2z = P[c + 2] - az;
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det === 0) continue;
        const inv = 1 / det;
        const tx = ox - ax, ty = oy - ay, tz = oz - az;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (!(u >= 0 && u <= 1)) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (!(v >= 0 && u + v <= 1)) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > tmin && t < best) {
          best = t; hitTri = tri;
          if (any) { hitT = t; return true; }
        }
      }
    }
    hitT = best;
    return hitTri >= 0;
  }
  function raycast(bvh, o, d, tmin, tmax, skip) {
    if (rayCast(bvh, o[0], o[1], o[2], d[0], d[1], d[2], tmin, tmax, skip === undefined ? -1 : skip, false)) return { t: hitT, tri: hitTri };
    return null;
  }
  // Is the point inside a closed mesh? (majority vote over 3 ray directions)
  function inside(bvh, x, y, z) {
    const dirs = [[0.577, 0.613, 0.539], [-0.71, 0.33, 0.62], [0.21, -0.87, -0.44]];
    let votes = 0;
    for (const d of dirs) {
      let n = 0, t = 0;
      for (let k = 0; k < 10000; k++) {
        if (!rayCast(bvh, x, y, z, d[0], d[1], d[2], t, Infinity, -1, false)) break;
        n++; t = hitT * (1 + 1e-9) + 1e-9;
      }
      if (n & 1) votes++;
    }
    return votes >= 2;
  }

  // ---------- tooling analysis: draft / undercut along a pull direction ----------
  // classes: 0 = released by the +dir half, 1 = released by the -dir half, 2 = draft below minimum, 3 = undercut
  function undercut(mesh, dir, minDraftDeg, progress) {
    const P = mesh.positions, I = mesh.indices, nt = I.length / 3;
    const bvh = buildBVH(P, I);
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const dx = dir[0] / dl, dy = dir[1] / dl, dz = dir[2] / dl;
    const nb = bvh.nb;
    const diag = Math.hypot(nb[3] - nb[0], nb[4] - nb[1], nb[5] - nb[2]) || 1;
    const eps = diag * 1e-6;
    const sinMin = Math.sin(Math.max(0, minDraftDeg) * Math.PI / 180);
    const classes = new Uint8Array(nt);
    const area = [0, 0, 0, 0];
    for (let t = 0; t < nt; t++) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(l > 0)) continue;
      nx /= l; ny /= l; nz /= l;
      const nd = nx * dx + ny * dy + nz * dz;
      const s = nd >= 0 ? 1 : -1;
      const cx = (P[a] + P[b] + P[c]) / 3 + nx * eps, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3 + ny * eps, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3 + nz * eps;
      let cls;
      if (rayCast(bvh, cx, cy, cz, s * dx, s * dy, s * dz, 0, Infinity, t, true)) cls = 3;
      else if (Math.abs(nd) < sinMin) cls = 2;
      else cls = s > 0 ? 0 : 1;
      classes[t] = cls; area[cls] += l / 2;
      if (progress && (t & 32767) === 0) progress(t / nt);
    }
    return { classes: classes, area: area };
  }

  // ---------- collision between two meshes ----------
  function segTri(P, p, q, T, a, b, c) {
    const dx = P[q] - P[p], dy = P[q + 1] - P[p + 1], dz = P[q + 2] - P[p + 2];
    const e1x = T[b] - T[a], e1y = T[b + 1] - T[a + 1], e1z = T[b + 2] - T[a + 2];
    const e2x = T[c] - T[a], e2y = T[c + 1] - T[a + 1], e2z = T[c + 2] - T[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    const sc = (e1x * e1x + e1y * e1y + e1z * e1z) * (e2x * e2x + e2y * e2y + e2z * e2z) * (dx * dx + dy * dy + dz * dz);
    if (det * det <= 1e-18 * sc) return false;
    const inv = 1 / det, E = 1e-7;
    const tx = P[p] - T[a], ty = P[p + 1] - T[a + 1], tz = P[p + 2] - T[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (!(u >= -E && u <= 1 + E)) return false;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (!(v >= -E && u + v <= 1 + E)) return false;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > E && t < 1 - E;
  }
  function collide(A, B) {
    const PA = A.positions, IA = A.indices, PB = B.positions, IB = B.indices;
    const ntA = IA.length / 3, ntB = IB.length / 3;
    const bvh = buildBVH(PB, IB);
    const nb = bvh.nb, nl = bvh.nl, order = bvh.order;
    const flagsA = new Uint8Array(ntA), flagsB = new Uint8Array(ntB);
    let pairs = 0;
    const st = [];
    for (let t = 0; t < ntA; t++) {
      const a0 = 3 * IA[3 * t], a1 = 3 * IA[3 * t + 1], a2 = 3 * IA[3 * t + 2];
      const x0 = Math.min(PA[a0], PA[a1], PA[a2]), x1 = Math.max(PA[a0], PA[a1], PA[a2]);
      const y0 = Math.min(PA[a0 + 1], PA[a1 + 1], PA[a2 + 1]), y1 = Math.max(PA[a0 + 1], PA[a1 + 1], PA[a2 + 1]);
      const z0 = Math.min(PA[a0 + 2], PA[a1 + 2], PA[a2 + 2]), z1 = Math.max(PA[a0 + 2], PA[a1 + 2], PA[a2 + 2]);
      st.length = 0; st.push(0);
      while (st.length) {
        const node = st.pop(), o = 6 * node;
        if (x1 < nb[o] || x0 > nb[o + 3] || y1 < nb[o + 1] || y0 > nb[o + 4] || z1 < nb[o + 2] || z0 > nb[o + 5]) continue;
        const l = nl[2 * node];
        if (l >= 0) { st.push(l, nl[2 * node + 1]); continue; }
        const s = -l - 1, e = s + nl[2 * node + 1];
        for (let i = s; i < e; i++) {
          const tb = order[i];
          const b0 = 3 * IB[3 * tb], b1 = 3 * IB[3 * tb + 1], b2 = 3 * IB[3 * tb + 2];
          if (segTri(PA, a0, a1, PB, b0, b1, b2) || segTri(PA, a1, a2, PB, b0, b1, b2) || segTri(PA, a2, a0, PB, b0, b1, b2) ||
              segTri(PB, b0, b1, PA, a0, a1, a2) || segTri(PB, b1, b2, PA, a0, a1, a2) || segTri(PB, b2, b0, PA, a0, a1, a2)) {
            flagsA[t] = 1; flagsB[tb] = 1; pairs++;
          }
        }
      }
    }
    let contain = 0; // 1: A inside B, 2: B inside A
    if (pairs === 0 && ntA && ntB) {
      const va = 3 * IA[0], vb = 3 * IB[0];
      if (inside(bvh, PA[va], PA[va + 1], PA[va + 2])) contain = 1;
      else if (inside(buildBVH(PA, IA), PB[vb], PB[vb + 1], PB[vb + 2])) contain = 2;
    }
    return { flagsA: flagsA, flagsB: flagsB, pairs: pairs, contain: contain };
  }

  // ---------- mesh statistics ----------
  function stats(P, I) {
    let area = 0, vol = 0;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const ox = (mn[0] + mx[0]) / 2, oy = (mn[1] + mx[1]) / 2, oz = (mn[2] + mx[2]) / 2;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const ax = P[a] - ox, ay = P[a + 1] - oy, az = P[a + 2] - oz;
      const bx = P[b] - ox, by = P[b + 1] - oy, bz = P[b + 2] - oz;
      const cx = P[c] - ox, cy = P[c + 1] - oy, cz = P[c + 2] - oz;
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
      vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    }
    return { area: area, volume: Math.abs(vol), min: mn, max: mx };
  }
  // Count boundary and non-manifold edges.
  function topology(I, nv) {
    const n = I.length, keys = new Float64Array(n);
    for (let t = 0; t < n; t += 3) {
      for (let c = 0; c < 3; c++) {
        const a = I[t + c], b = I[t + (c + 1) % 3];
        keys[t + c] = a < b ? a * nv + b : b * nv + a;
      }
    }
    keys.sort();
    let border = 0, nonManifold = 0, i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && keys[j] === keys[i]) j++;
      if (j - i === 1) border++; else if (j - i > 2) nonManifold++;
      i = j;
    }
    return { border: border, nonManifold: nonManifold };
  }


  // ---------- closest point on a mesh ----------
  let cpD2 = 0, cpX = 0, cpY = 0, cpZ = 0, cpTri = -1;
  const cstack = [];
  function closest(bvh, x, y, z, maxD2) {
    const nb = bvh.nb, nl = bvh.nl, order = bvh.order, P = bvh.P, I = bvh.I;
    let best = maxD2; cpTri = -1;
    cstack.length = 0; cstack.push(0);
    while (cstack.length) {
      const node = cstack.pop(), o = 6 * node;
      const ex = x < nb[o] ? nb[o] - x : x > nb[o + 3] ? x - nb[o + 3] : 0;
      const ey = y < nb[o + 1] ? nb[o + 1] - y : y > nb[o + 4] ? y - nb[o + 4] : 0;
      const ez = z < nb[o + 2] ? nb[o + 2] - z : z > nb[o + 5] ? z - nb[o + 5] : 0;
      if (ex * ex + ey * ey + ez * ez >= best) continue;
      const l = nl[2 * node];
      if (l >= 0) {
        // visit the child whose box centre is nearer last-pushed (popped first)
        const r = nl[2 * node + 1], a = 6 * l, b = 6 * r;
        const da = Math.abs((nb[a] + nb[a + 3]) / 2 - x) + Math.abs((nb[a + 1] + nb[a + 4]) / 2 - y) + Math.abs((nb[a + 2] + nb[a + 5]) / 2 - z);
        const db = Math.abs((nb[b] + nb[b + 3]) / 2 - x) + Math.abs((nb[b + 1] + nb[b + 4]) / 2 - y) + Math.abs((nb[b + 2] + nb[b + 5]) / 2 - z);
        if (da < db) cstack.push(r, l); else cstack.push(l, r);
        continue;
      }
      const s = -l - 1, e = s + nl[2 * node + 1];
      for (let i = s; i < e; i++) {
        const tri = order[i];
        const a = 3 * I[3 * tri], b = 3 * I[3 * tri + 1], c = 3 * I[3 * tri + 2];
        const ax = P[a], ay = P[a + 1], az = P[a + 2];
        const abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az;
        const acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
        const apx = x - ax, apy = y - ay, apz = z - az;
        const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
        let v, w;
        if (d1 <= 0 && d2 <= 0) { v = 0; w = 0; }
        else {
          const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
          const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
          if (d3 >= 0 && d4 <= d3) { v = 1; w = 0; }
          else {
            const vc = d1 * d4 - d3 * d2;
            if (vc <= 0 && d1 >= 0 && d3 <= 0) { v = d1 / (d1 - d3); w = 0; }
            else {
              const cx = apx - acx, cy = apy - acy, cz = apz - acz;
              const d5 = abx * cx + aby * cy + abz * cz, d6 = acx * cx + acy * cy + acz * cz;
              if (d6 >= 0 && d5 <= d6) { v = 0; w = 1; }
              else {
                const vb = d5 * d2 - d1 * d6;
                if (vb <= 0 && d2 >= 0 && d6 <= 0) { v = 0; w = d2 / (d2 - d6); }
                else {
                  const va = d3 * d6 - d5 * d4;
                  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); v = 1 - w; }
                  else { const den = 1 / (va + vb + vc); v = vb * den; w = vc * den; }
                }
              }
            }
          }
        }
        const qx = ax + abx * v + acx * w, qy = ay + aby * v + acy * w, qz = az + abz * v + acz * w;
        const dd = (x - qx) * (x - qx) + (y - qy) * (y - qy) + (z - qz) * (z - qz);
        if (dd < best) { best = dd; cpTri = tri; cpX = qx; cpY = qy; cpZ = qz; }
      }
    }
    cpD2 = best;
    return cpTri >= 0;
  }

  // Signed distance from every vertex of B to the surface of A (+ = outside A).
  function deviation(B, A, progress) {
    const PB = B.positions, nv = PB.length / 3, PA = A.positions, IA = A.indices;
    const bvh = buildBVH(PA, IA);
    const dist = new Float32Array(nv);
    let mn = Infinity, mx = -Infinity, sumAbs = 0, sum2 = 0;
    for (let i = 0; i < nv; i++) {
      const x = PB[3 * i], y = PB[3 * i + 1], z = PB[3 * i + 2];
      closest(bvh, x, y, z, Infinity);
      let d = Math.sqrt(cpD2);
      const a = 3 * IA[3 * cpTri], b = 3 * IA[3 * cpTri + 1], c = 3 * IA[3 * cpTri + 2];
      const ux = PA[b] - PA[a], uy = PA[b + 1] - PA[a + 1], uz = PA[b + 2] - PA[a + 2];
      const wx = PA[c] - PA[a], wy = PA[c + 1] - PA[a + 1], wz = PA[c + 2] - PA[a + 2];
      if ((uy * wz - uz * wy) * (x - cpX) + (uz * wx - ux * wz) * (y - cpY) + (ux * wy - uy * wx) * (z - cpZ) < 0) d = -d;
      dist[i] = d;
      if (d < mn) mn = d; if (d > mx) mx = d;
      sumAbs += Math.abs(d); sum2 += d * d;
      if (progress && (i & 16383) === 0) progress(i / nv);
    }
    return { dist: dist, min: mn, max: mx, meanAbs: sumAbs / (nv || 1), rms: Math.sqrt(sum2 / (nv || 1)) };
  }

  // Best rigid transform (rotation + translation) taking src points onto dst points (Horn's quaternion method).
  function rigidFit(src, dst) {
    const n = Math.min(src.length, dst.length);
    const cs = [0, 0, 0], cd = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { cs[k] += src[i][k] / n; cd[k] += dst[i][k] / n; }
    const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += (src[i][r] - cs[r]) * (dst[i][c] - cd[c]);
    const Sxx = S[0], Sxy = S[1], Sxz = S[2], Syx = S[3], Syy = S[4], Syz = S[5], Szx = S[6], Szy = S[7], Szz = S[8];
    const A = [[Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx], [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
      [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy], [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
    const Vv = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += A[p][q] * A[p][q];
      if (off < 1e-30) break;
      for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 4; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < 4; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < 4; k++) { const vkp = Vv[k][p], vkq = Vv[k][q]; Vv[k][p] = c * vkp - s * vkq; Vv[k][q] = s * vkp + c * vkq; }
      }
    }
    let bi = 0;
    for (let k = 1; k < 4; k++) if (A[k][k] > A[bi][bi]) bi = k;
    let w = Vv[0][bi], x = Vv[1][bi], y = Vv[2][bi], z = Vv[3][bi];
    const ql = Math.hypot(w, x, y, z) || 1; w /= ql; x /= ql; y /= ql; z /= ql;
    const R = [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
    const t = [cd[0] - (R[0] * cs[0] + R[1] * cs[1] + R[2] * cs[2]), cd[1] - (R[3] * cs[0] + R[4] * cs[1] + R[5] * cs[2]), cd[2] - (R[6] * cs[0] + R[7] * cs[1] + R[8] * cs[2])];
    return [R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, t[0], t[1], t[2], 1];
  }
  function mat4mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  // Iterative closest point in three stages (coarse to fine, trimming outliers harder each time).
  // Starts from the current pose of B, so a rough manual alignment is expected first. Returns the extra transform for B.
  function icp(B, A, iters, progress) {
    const PB = B.positions, nv = PB.length / 3;
    const bvh = buildBVH(A.positions, A.indices);
    const stages = [{ n: 1500, k: 3.0, it: 30 }, { n: 6000, k: 2.5, it: 40 }, { n: 12000, k: 2.0, it: 40 }];
    let T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], rms = 0, done = 0, total = 0;
    for (const st of stages) total += st.it;
    for (const st of stages) {
      const step = Math.max(1, Math.floor(nv / st.n));
      let prev = Infinity;
      for (let it = 0; it < st.it; it++) {
        const src = [], dst = [], ds = [];
        for (let i = 0; i < nv; i += step) {
          const x0 = PB[3 * i], y0 = PB[3 * i + 1], z0 = PB[3 * i + 2];
          const x = T[0] * x0 + T[4] * y0 + T[8] * z0 + T[12], y = T[1] * x0 + T[5] * y0 + T[9] * z0 + T[13], z = T[2] * x0 + T[6] * y0 + T[10] * z0 + T[14];
          closest(bvh, x, y, z, Infinity);
          src.push([x, y, z]); dst.push([cpX, cpY, cpZ]); ds.push(Math.sqrt(cpD2));
        }
        const sorted = ds.slice().sort(function (a, b) { return a - b; });
        const lim = Math.max(sorted[Math.floor(sorted.length / 2)] * st.k, 1e-12);
        const s2 = [], d2 = [];
        let sum = 0;
        for (let k = 0; k < ds.length; k++) if (ds[k] <= lim) { s2.push(src[k]); d2.push(dst[k]); sum += ds[k] * ds[k]; }
        rms = Math.sqrt(sum / (s2.length || 1));
        if (s2.length < 3) break;
        T = mat4mul(rigidFit(s2, d2), T);
        if (progress) progress((done + it + 1) / total);
        if (Math.abs(prev - rms) < 1e-6 * (1e-9 + rms)) break;
        prev = rms;
      }
      done += st.it;
    }
    // final polish: point-to-plane steps (they do not stall when surfaces slide along each other)
    const PA = A.positions, IA = A.indices, step = Math.max(1, Math.floor(nv / 12000));
    let prevP = Infinity;
    for (let it = 0; it < 30; it++) {
      const rows = [], ds = [];
      let cx = 0, cy = 0, cz = 0, cnt = 0;
      for (let i = 0; i < nv; i += step) {
        const x0 = PB[3 * i], y0 = PB[3 * i + 1], z0 = PB[3 * i + 2];
        const x = T[0] * x0 + T[4] * y0 + T[8] * z0 + T[12], y = T[1] * x0 + T[5] * y0 + T[9] * z0 + T[13], z = T[2] * x0 + T[6] * y0 + T[10] * z0 + T[14];
        closest(bvh, x, y, z, Infinity);
        const a = 3 * IA[3 * cpTri], b = 3 * IA[3 * cpTri + 1], c = 3 * IA[3 * cpTri + 2];
        const ux = PA[b] - PA[a], uy = PA[b + 1] - PA[a + 1], uz = PA[b + 2] - PA[a + 2];
        const wx = PA[c] - PA[a], wy = PA[c + 1] - PA[a + 1], wz = PA[c + 2] - PA[a + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (!(nl > 0)) continue;
        nx /= nl; ny /= nl; nz /= nl;
        rows.push([x, y, z, nx, ny, nz, (cpX - x) * nx + (cpY - y) * ny + (cpZ - z) * nz]);
        ds.push(Math.sqrt(cpD2)); cx += x; cy += y; cz += z; cnt++;
      }
      if (cnt < 6) break;
      cx /= cnt; cy /= cnt; cz /= cnt;
      const sorted = ds.slice().sort(function (p, q) { return p - q; });
      const lim = Math.max(sorted[Math.floor(sorted.length / 2)] * 2.5, 1e-12);
      const N = [], rhs = [0, 0, 0, 0, 0, 0];
      for (let r = 0; r < 6; r++) N.push([0, 0, 0, 0, 0, 0]);
      let sum = 0, used = 0;
      for (let k = 0; k < rows.length; k++) {
        if (ds[k] > lim) continue;
        const q = rows[k], px = q[0] - cx, py = q[1] - cy, pz = q[2] - cz;
        const j = [py * q[5] - pz * q[4], pz * q[3] - px * q[5], px * q[4] - py * q[3], q[3], q[4], q[5]];
        for (let r = 0; r < 6; r++) { rhs[r] += j[r] * q[6]; for (let c = 0; c < 6; c++) N[r][c] += j[r] * j[c]; }
        sum += q[6] * q[6]; used++;
      }
      rms = Math.sqrt(sum / (used || 1));
      // solve N x = rhs (Gaussian elimination with pivoting, lightly damped)
      for (let r = 0; r < 6; r++) N[r][r] += 1e-9 * (1 + N[r][r]);
      let ok = true;
      for (let c = 0; c < 6 && ok; c++) {
        let piv = c;
        for (let r = c + 1; r < 6; r++) if (Math.abs(N[r][c]) > Math.abs(N[piv][c])) piv = r;
        if (Math.abs(N[piv][c]) < 1e-300) { ok = false; break; }
        const tmp = N[c]; N[c] = N[piv]; N[piv] = tmp; const tr = rhs[c]; rhs[c] = rhs[piv]; rhs[piv] = tr;
        for (let r = c + 1; r < 6; r++) { const f = N[r][c] / N[c][c]; for (let k = c; k < 6; k++) N[r][k] -= f * N[c][k]; rhs[r] -= f * rhs[c]; }
      }
      if (!ok) break;
      const xs = [0, 0, 0, 0, 0, 0];
      for (let r = 5; r >= 0; r--) { let v = rhs[r]; for (let k = r + 1; k < 6; k++) v -= N[r][k] * xs[k]; xs[r] = v / N[r][r]; }
      const ang = Math.sqrt(xs[0] * xs[0] + xs[1] * xs[1] + xs[2] * xs[2]);
      let Rm = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (ang > 1e-15) {
        const ax = xs[0] / ang, ay = xs[1] / ang, az = xs[2] / ang, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
        Rm = [t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay, t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax, t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c];
      }
      // x' = R (x - c) + c + t
      const tx = cx + xs[3] - (Rm[0] * cx + Rm[1] * cy + Rm[2] * cz), ty = cy + xs[4] - (Rm[3] * cx + Rm[4] * cy + Rm[5] * cz), tz = cz + xs[5] - (Rm[6] * cx + Rm[7] * cy + Rm[8] * cz);
      T = mat4mul([Rm[0], Rm[3], Rm[6], 0, Rm[1], Rm[4], Rm[7], 0, Rm[2], Rm[5], Rm[8], 0, tx, ty, tz, 1], T);
      if (Math.abs(prevP - rms) < 1e-9 * (1e-9 + rms) || rms < 1e-12) break;
      prevP = rms;
    }
    return { matrix: T, rms: rms };
  }

  return { parse: parse, weld: weld, decimate: decimate, split: split, writeSTL: writeSTL, writeOBJ: writeOBJ, zipStore: zipStore,
    buildBVH: buildBVH, raycast: raycast, undercut: undercut, collide: collide, stats: stats, topology: topology, deviation: deviation, rigidFit: rigidFit, icp: icp };
