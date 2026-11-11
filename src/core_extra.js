
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
    let area = 0, vol = 0, sx = 0, sy = 0, sz = 0, px = 0, py = 0, pz = 0;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const ox = (mn[0] + mx[0]) / 2, oy = (mn[1] + mx[1]) / 2, oz = (mn[2] + mx[2]) / 2;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const ax = P[a] - ox, ay = P[a + 1] - oy, az = P[a + 2] - oz;
      const bx = P[b] - ox, by = P[b + 1] - oy, bz = P[b + 2] - oz;
      const cx = P[c] - ox, cy = P[c + 1] - oy, cz = P[c + 2] - oz;
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const at = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
      const v = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
      area += at; vol += v;
      // centroid of the tetrahedron (box centre, a, b, c), and of the triangle
      sx += v * (ax + bx + cx) / 4; sy += v * (ay + by + cy) / 4; sz += v * (az + bz + cz) / 4;
      px += at * (ax + bx + cx) / 3; py += at * (ay + by + cy) / 3; pz += at * (az + bz + cz) / 3;
    }
    // centre of mass of the enclosed volume; a surface that encloses (almost) nothing falls back to the centre of its area
    let cen = [ox, oy, oz], solid = area > 0 && Math.abs(vol) > 1e-9 * Math.pow(area, 1.5);
    if (solid) {
      cen = [ox + sx / vol, oy + sy / vol, oz + sz / vol];
      for (let k = 0; k < 3; k++) if (!(cen[k] >= mn[k] && cen[k] <= mx[k])) solid = false;
    }
    if (!solid && area > 0) cen = [ox + px / area, oy + py / area, oz + pz / area];
    return { area: area, volume: Math.abs(vol), min: mn, max: mx, centroid: cen, solid: solid };
  }
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


  // ---------- advanced split ----------
  // opt.mode: 'vertex' (pieces sharing a vertex stay together), 'edge' (must share an edge),
  //           'shell' (closed shells that only touch are separated), 'concave' / 'crease' (also cut where the
  //           surface folds by opt.angle degrees or more; 'concave' cuts inward folds only).
  function labelsToBodies(P, I, label, ncomp, opt) {
    const nv = P.length / 3, nt = I.length / 3;
    const counts = new Int32Array(ncomp);
    for (let t = 0; t < nt; t++) counts[label[t]]++;
    const order = new Array(ncomp);
    for (let i = 0; i < ncomp; i++) order[i] = i;
    order.sort(function (a, b) { return counts[b] - counts[a] || a - b; });
    const minTris = Math.max(1, opt.minTris || 1);
    const groupOf = new Int32Array(ncomp).fill(-1);
    let ng = 0, small = 0, smallGroup = -1;
    for (const c of order) if (counts[c] >= minTris) groupOf[c] = ng++;
    for (const c of order) if (counts[c] < minTris) { small++; if (opt.keepSmall) { if (smallGroup < 0) smallGroup = ng++; groupOf[c] = smallGroup; } }
    // triangles bucketed by group
    const gStart = new Int32Array(ng + 1);
    for (let t = 0; t < nt; t++) { const g = groupOf[label[t]]; if (g >= 0) gStart[g + 1]++; }
    for (let g = 0; g < ng; g++) gStart[g + 1] += gStart[g];
    const gTris = new Int32Array(gStart[ng]), cur = gStart.slice(0, ng);
    for (let t = 0; t < nt; t++) { const g = groupOf[label[t]]; if (g >= 0) gTris[cur[g]++] = t; }
    const seen = new Int32Array(nv).fill(-1), local = new Int32Array(nv);
    const bodies = [];
    for (let g = 0; g < ng; g++) {
      let n = 0;
      for (let k = gStart[g]; k < gStart[g + 1]; k++) {
        const t = 3 * gTris[k];
        for (let c = 0; c < 3; c++) { const v = I[t + c]; if (seen[v] !== g) { seen[v] = g; local[v] = n++; } }
      }
      const pos = new Float32Array(3 * n), idx = new Uint32Array(3 * (gStart[g + 1] - gStart[g]));
      let o = 0;
      for (let k = gStart[g]; k < gStart[g + 1]; k++) {
        const t = 3 * gTris[k];
        for (let c = 0; c < 3; c++) {
          const v = I[t + c], l = local[v];
          pos[3 * l] = P[3 * v]; pos[3 * l + 1] = P[3 * v + 1]; pos[3 * l + 2] = P[3 * v + 2];
          idx[o++] = l;
        }
      }
      bodies.push({ positions: pos, indices: idx, small: g === smallGroup });
    }
    return { bodies: bodies, totalComponents: ncomp, smallComponents: small };
  }

  // half-edge h = 3 * t + c runs from I[h] to the next corner of triangle t.
  // Returns adj[h] = the half-edge on the other side of that edge (-1 on a border), pairing the faces of each
  // shell correctly where more than two triangles meet on one edge.
  function edgeAdjacency(P, I, nv, onGroup) {
    const nh = I.length;
    const nxt = function (h) { return h % 3 === 2 ? h - 2 : h + 1; };
    const start = new Uint32Array(nv + 1);
    for (let h = 0; h < nh; h++) { const a = I[h], b = I[nxt(h)]; if (a !== b) start[(a < b ? a : b) + 1]++; }
    for (let v = 0; v < nv; v++) start[v + 1] += start[v];
    const arr = new Uint32Array(start[nv]), cur = start.slice(0, nv);
    for (let h = 0; h < nh; h++) { const a = I[h], b = I[nxt(h)]; if (a !== b) arr[cur[a < b ? a : b]++] = h; }
    const hiOf = function (h) { const a = I[h], b = I[nxt(h)]; return a > b ? a : b; };
    const adj = new Int32Array(nh).fill(-1);
    let border = 0, multi = 0;
    const pair = function (h1, h2) { adj[h1] = h2; adj[h2] = h1; };
    function radial(s, e) {
      const h0 = arr[s], lo = Math.min(I[h0], I[nxt(h0)]), hi = hiOf(h0);
      const ax = P[3 * lo], ay = P[3 * lo + 1], az = P[3 * lo + 2];
      let dx = P[3 * hi] - ax, dy = P[3 * hi + 1] - ay, dz = P[3 * hi + 2] - az;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      let ux = 0, uy = 0, uz = 0, vx = 0, vy = 0, vz = 0, have = false;
      const items = [];
      for (let k = s; k < e; k++) {
        const h = arr[k], t = h - h % 3, p = I[t + (h % 3 + 2) % 3];
        let wx = P[3 * p] - ax, wy = P[3 * p + 1] - ay, wz = P[3 * p + 2] - az;
        const along = wx * dx + wy * dy + wz * dz;
        wx -= along * dx; wy -= along * dy; wz -= along * dz;
        const wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
        let th = 1e9;                                   // flat (zero-area) triangles go last
        if (wl > 1e-12 * dl) {
          if (!have) { have = true; ux = wx / wl; uy = wy / wl; uz = wz / wl; vx = dy * uz - dz * uy; vy = dz * ux - dx * uz; vz = dx * uy - dy * ux; }
          th = Math.atan2(wx * vx + wy * vy + wz * vz, wx * ux + wy * uy + wz * uz);
          if (th < 0) th += 2 * Math.PI;
          if (th > 2 * Math.PI - 1e-3) th -= 2 * Math.PI;
        }
        // a triangle that runs lo -> hi has its solid side towards smaller angles (-1); the reverse, larger (+1)
        items.push({ h: h, th: th, s: I[h] === lo ? -1 : 1 });
      }
      items.sort(function (x, y) { return x.th - y.th; });
      const n = items.length;
      for (let i = 0; i < n;) {                          // faces lying on top of each other: solid side decides the order
        let j = i + 1;
        while (j < n && items[j].th - items[i].th < 1e-3) j++;
        if (j - i > 1) { const part = items.slice(i, j).sort(function (x, y) { return x.s - y.s; }); for (let k = i; k < j; k++) items[k] = part[k - i]; }
        i = j;
      }
      const used = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (used[i] || items[i].s !== 1) continue;
        const j = (i + 1) % n;
        if (j !== i && !used[j] && items[j].s === -1) { pair(items[i].h, items[j].h); used[i] = used[j] = 1; }
      }
      let prev = -1;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        if (prev < 0) prev = i; else { pair(items[prev].h, items[i].h); prev = -1; }
      }
    }
    for (let v = 0; v < nv; v++) {
      const s = start[v], e = start[v + 1], len = e - s;
      if (len < 1) continue;
      if (len > 48) arr.subarray(s, e).sort(function (x, y) { return hiOf(x) - hiOf(y); });
      else for (let i = s + 1; i < e; i++) { const x = arr[i], kx = hiOf(x); let j = i - 1; while (j >= s && hiOf(arr[j]) > kx) { arr[j + 1] = arr[j]; j--; } arr[j + 1] = x; }
      for (let i = s; i < e;) {
        const k = hiOf(arr[i]);
        let j = i + 1;
        while (j < e && hiOf(arr[j]) === k) j++;
        if (j - i === 1) border++;
        else if (j - i === 2) pair(arr[i], arr[i + 1]);
        else { multi++; if (onGroup) onGroup(arr, i, j); else radial(i, j); }
        i = j;
      }
    }
    return { adj: adj, border: border, multi: multi };
  }

  function splitAdv(mesh, opt) {
    const P = mesh.positions, I = mesh.indices, nv = P.length / 3, nt = I.length / 3;
    const mode = opt.mode || 'vertex';
    const par = new Int32Array(nt);
    for (let t = 0; t < nt; t++) par[t] = t;
    const find = function (a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const union = function (a, b) { a = find(a); b = find(b); if (a !== b) par[b] = a; };
    let adj = null, info = null;
    const cuts = [];
    if (mode === 'vertex') {
      const first = new Int32Array(nv).fill(-1);
      for (let h = 0; h < 3 * nt; h++) { const v = I[h], t = (h / 3) | 0; if (first[v] < 0) first[v] = t; else union(first[v], t); }
    } else if (mode === 'edge') {
      info = edgeAdjacency(P, I, nv, function (arr, i, j) { for (let k = i + 1; k < j; k++) union((arr[i] / 3) | 0, (arr[k] / 3) | 0); });
      adj = info.adj;
      for (let h = 0; h < 3 * nt; h++) if (adj[h] > h) union((h / 3) | 0, (adj[h] / 3) | 0);
    } else {
      info = edgeAdjacency(P, I, nv, null);
      adj = info.adj;
      if (mode === 'shell') {
        for (let h = 0; h < 3 * nt; h++) if (adj[h] > h) union((h / 3) | 0, (adj[h] / 3) | 0);
      } else {
        // unit normals; a zero-area triangle borrows the normal of the neighbour on its longest edge
        const N = new Float32Array(3 * nt), flat = [];
        let vol6 = 0;
        for (let t = 0; t < nt; t++) {
          const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
          const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
          const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
          vol6 += P[a] * nx + P[a + 1] * ny + P[a + 2] * nz;
          const e2 = Math.max(ux * ux + uy * uy + uz * uz, wx * wx + wy * wy + wz * wz);
          if (l > 1e-7 * e2 && l > 0) { N[3 * t] = nx / l; N[3 * t + 1] = ny / l; N[3 * t + 2] = nz / l; } else flat.push(t);
        }
        for (const t of flat) {
          let best = -1, bl = -1;
          for (let c = 0; c < 3; c++) {
            const a = 3 * I[3 * t + c], b = 3 * I[3 * t + (c + 1) % 3], l = (P[a] - P[b]) * (P[a] - P[b]) + (P[a + 1] - P[b + 1]) * (P[a + 1] - P[b + 1]) + (P[a + 2] - P[b + 2]) * (P[a + 2] - P[b + 2]);
            if (l > bl) { bl = l; best = c; }
          }
          const o = adj[3 * t + best];
          if (o >= 0) { const u = 3 * ((o / 3) | 0), sg = I[o] !== I[3 * t + best] ? 1 : -1; N[3 * t] = sg * N[u]; N[3 * t + 1] = sg * N[u + 1]; N[3 * t + 2] = sg * N[u + 2]; }
        }
        // a closed mesh whose volume comes out negative is inside out: "concave" then means the opposite fold
        const sense = info.border === 0 && vol6 < 0 ? -1 : 1;
        const cosT = Math.cos((opt.angle || 60) * Math.PI / 180), concave = mode === 'concave';
        for (let h = 0; h < 3 * nt; h++) {
          const o = adj[h];
          if (o <= h) continue;
          const t1 = (h / 3) | 0, t2 = (o / 3) | 0;
          if (t1 === t2) continue;
          const a = 3 * t1, b = 3 * t2, sg = I[h] !== I[o] ? 1 : -1;
          const n1x = N[a], n1y = N[a + 1], n1z = N[a + 2], n2x = sg * N[b], n2y = sg * N[b + 1], n2z = sg * N[b + 2];
          let cut = false;
          if ((n1x || n1y || n1z) && (n2x || n2y || n2z)) {
            cut = n1x * n2x + n1y * n2y + n1z * n2z <= cosT;
            if (cut && concave) {
              const e = 3 * I[h], p = 3 * I[b + (o % 3 + 2) % 3], q = 3 * I[a + (h % 3 + 2) % 3];
              const d = (P[p] - P[e]) * n1x + (P[p + 1] - P[e + 1]) * n1y + (P[p + 2] - P[e + 2]) * n1z +
                (P[q] - P[e]) * n2x + (P[q + 1] - P[e + 1]) * n2y + (P[q + 2] - P[e + 2]) * n2z;
              cut = sense * d > 0;
            }
          }
          if (cut) cuts.push(h); else union(t1, t2);
        }
      }
    }
    // region ids
    const label = new Int32Array(nt), idOf = new Int32Array(nt).fill(-1);
    let nc = 0;
    for (let t = 0; t < nt; t++) { const r = find(t); if (idOf[r] < 0) idOf[r] = nc++; label[t] = idOf[r]; }
    let merged = 0, capped = false;
    if (cuts.length && nc > 1) {
      // per region: area, triangle count, and how long a border it shares with each neighbour
      const area = new Float64Array(nc), tris = new Int32Array(nc);
      const triArea = function (t) {
        const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
      };
      let total = 0;
      for (let t = 0; t < nt; t++) { const a = triArea(t); area[label[t]] += a; tris[label[t]]++; total += a; }
      const shared = new Map();
      for (const h of cuts) {
        const c1 = label[(h / 3) | 0], c2 = label[(adj[h] / 3) | 0];
        if (c1 === c2) continue;
        const a = 3 * I[h], b = 3 * I[h % 3 === 2 ? h - 2 : h + 1];
        const len = Math.sqrt((P[a] - P[b]) * (P[a] - P[b]) + (P[a + 1] - P[b + 1]) * (P[a + 1] - P[b + 1]) + (P[a + 2] - P[b + 2]) * (P[a + 2] - P[b + 2]));
        const key = c1 < c2 ? c1 * nc + c2 : c2 * nc + c1;
        shared.set(key, (shared.get(key) || 0) + len);
      }
      const nb = new Array(nc);
      shared.forEach(function (len, key) {
        const c2 = key % nc, c1 = (key - c2) / nc;
        (nb[c1] || (nb[c1] = [])).push(c2, len); (nb[c2] || (nb[c2] = [])).push(c1, len);
      });
      const cp = new Int32Array(nc);
      for (let c = 0; c < nc; c++) cp[c] = c;
      const cfind = function (a) { while (cp[a] !== a) { cp[a] = cp[cp[a]]; a = cp[a]; } return a; };
      const bestNeighbour = function (c, r) {
        const list = nb[c];
        if (!list) return -1;
        const acc = new Map();
        let best = -1, bl = 0;
        for (let k = 0; k < list.length; k += 2) {
          const ro = cfind(list[k]);
          if (ro === r) continue;
          const l = (acc.get(ro) || 0) + list[k + 1];
          acc.set(ro, l);
          if (l > bl) { bl = l; best = ro; }
        }
        return best;
      };
      const join = function (r, into) { cp[r] = into; area[into] += area[r]; tris[into] += tris[r]; merged++; };
      const order = new Array(nc);
      for (let c = 0; c < nc; c++) order[c] = c;
      order.sort(function (x, y) { return area[x] - area[y]; });
      // 1) specks: regions too small to be a part go to the neighbour they share the longest border with
      const aMin = total * (opt.minAreaFrac === undefined ? 1e-4 : opt.minAreaFrac), tMin = Math.max(1, opt.minTris || 1);
      for (let pass = 0; pass < 8; pass++) {
        let changed = false;
        for (const c of order) {
          const r = cfind(c);
          if (area[r] >= aMin && tris[r] >= tMin) continue;
          const to = bestNeighbour(c, r);
          if (to >= 0) { join(r, to); changed = true; }
        }
        if (!changed) break;
      }
      // 2) floors: a region that encloses no material once its open rim is closed (the bottom of a pocket, a dimple)
      //    is not a part of its own; it goes back to its neighbour
      if (mode === 'concave') {
        let cx = 0, cy = 0, cz = 0;
        for (let v = 0; v < nv; v++) { cx += P[3 * v]; cy += P[3 * v + 1]; cz += P[3 * v + 2]; }
        cx /= nv || 1; cy /= nv || 1; cz /= nv || 1;
        const root = new Int32Array(nt);
        for (let t = 0; t < nt; t++) root[t] = cfind(label[t]);
        const vol = new Float64Array(nc), rim = new Float64Array(4 * nc);
        const sense = info.border === 0 ? (function () { let v6 = 0; for (let t = 0; t < nt; t++) { const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2]; v6 += (P[a] - cx) * ((P[b + 1] - cy) * (P[c + 2] - cz) - (P[b + 2] - cz) * (P[c + 1] - cy)) + (P[a + 1] - cy) * ((P[b + 2] - cz) * (P[c] - cx) - (P[b] - cx) * (P[c + 2] - cz)) + (P[a + 2] - cz) * ((P[b] - cx) * (P[c + 1] - cy) - (P[b + 1] - cy) * (P[c] - cx)); } return v6 < 0 ? -1 : 1; })() : 1;
        const det = function (a, b, c) {
          const ax = P[a] - cx, ay = P[a + 1] - cy, az = P[a + 2] - cz, bx = P[b] - cx, by = P[b + 1] - cy, bz = P[b + 2] - cz;
          return ax * (by * c[2] - bz * c[1]) + ay * (bz * c[0] - bx * c[2]) + az * (bx * c[1] - by * c[0]);
        };
        for (let t = 0; t < nt; t++) {
          const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
          vol[root[t]] += det(a, b, [P[c] - cx, P[c + 1] - cy, P[c + 2] - cz]);
        }
        const onRim = function (h) { const o = adj[h]; return o < 0 || root[(o / 3) | 0] !== root[(h / 3) | 0]; };
        for (let h = 0; h < 3 * nt; h++) {
          if (!onRim(h)) continue;
          const r = 4 * root[(h / 3) | 0], a = 3 * I[h], b = 3 * I[h % 3 === 2 ? h - 2 : h + 1];
          const len = Math.sqrt((P[a] - P[b]) * (P[a] - P[b]) + (P[a + 1] - P[b + 1]) * (P[a + 1] - P[b + 1]) + (P[a + 2] - P[b + 2]) * (P[a + 2] - P[b + 2]));
          rim[r] += len * (P[a] + P[b]) / 2; rim[r + 1] += len * (P[a + 1] + P[b + 1]) / 2; rim[r + 2] += len * (P[a + 2] + P[b + 2]) / 2; rim[r + 3] += len;
        }
        for (let h = 0; h < 3 * nt; h++) {
          if (!onRim(h)) continue;
          const rr = root[(h / 3) | 0], r = 4 * rr, a = 3 * I[h], b = 3 * I[h % 3 === 2 ? h - 2 : h + 1], w = rim[r + 3] || 1;
          vol[rr] += det(b, a, [rim[r] / w - cx, rim[r + 1] / w - cy, rim[r + 2] / w - cz]);   // closing triangle (b, a, rim centre)
        }
        let biggest = -1;
        for (let c = 0; c < nc; c++) if (cp[c] === c && (biggest < 0 || area[c] > area[biggest])) biggest = c;
        const floors = [];
        for (const c of order) {
          const r = cfind(c);
          if (r !== c || r === biggest) continue;
          if (sense * vol[r] / 6 < 1e-3 * Math.pow(area[r], 1.5)) floors.push(r);
        }
        const members = new Array(nc);
        for (let c = 0; c < nc; c++) { const r = cfind(c); (members[r] || (members[r] = [])).push(c); }
        for (const r of floors) {
          if (cfind(r) !== r) continue;
          let best = -1, bl = 0;
          const acc = new Map();
          for (const c of members[r]) {
            const list = nb[c];
            if (!list) continue;
            for (let k = 0; k < list.length; k += 2) {
              const ro = cfind(list[k]);
              if (ro === r) continue;
              const l = (acc.get(ro) || 0) + list[k + 1];
              acc.set(ro, l);
              if (l > bl) { bl = l; best = ro; }
            }
          }
          if (best >= 0) { for (const c of members[r]) members[best].push(c); join(r, best); }
        }
      }
      // 3) never hand back a shattered surface: fold the smallest regions into their neighbours until at most maxParts remain
      if (opt.maxParts) for (let pass = 0; pass < 12; pass++) {
        const roots = [];
        for (let c = 0; c < nc; c++) if (cp[c] === c) roots.push(c);
        if (roots.length <= opt.maxParts) break;
        roots.sort(function (x, y) { return area[x] - area[y]; });
        const thr = area[roots[roots.length - opt.maxParts - 1]];
        let changed = false;
        for (const c of order) {
          const r = cfind(c);
          if (area[r] > thr) continue;
          const to = bestNeighbour(c, r);
          if (to >= 0) { join(r, to); changed = true; capped = true; }
        }
        if (!changed) break;
      }
      if (merged) {
        const re = new Int32Array(nc).fill(-1);
        let n2 = 0;
        for (let t = 0; t < nt; t++) { const r = cfind(label[t]); if (re[r] < 0) re[r] = n2++; label[t] = re[r]; }
        nc = n2;
      }
    }
    const out = labelsToBodies(P, I, label, nc, opt);
    out.border = info ? info.border : -1; out.multi = info ? info.multi : -1; out.cuts = cuts.length; out.merged = merged; out.capped = capped;
    return out;
  }


  // ---------- open boundaries and hole filling ----------
  // loops[k] = vertex ids around one open boundary, in the direction of the triangles that own it
  function boundary(P, I) {
    const nv = P.length / 3, nh = I.length, adj = edgeAdjacency(P, I, nv, null).adj;
    const nxt = function (h) { return h % 3 === 2 ? h - 2 : h + 1; };
    const first = new Int32Array(nv).fill(-1), link = new Int32Array(nh).fill(-1);
    let nb = 0;
    for (let h = 0; h < nh; h++) if (adj[h] < 0 && I[h] !== I[nxt(h)]) { link[h] = first[I[h]]; first[I[h]] = h; nb++; }
    const edges = new Uint32Array(2 * nb), used = new Uint8Array(nh), loops = [];
    let k = 0;
    for (let h = 0; h < nh; h++) {
      if (adj[h] >= 0 || I[h] === I[nxt(h)]) continue;
      edges[k++] = I[h]; edges[k++] = I[nxt(h)];
      if (used[h]) continue;
      const loop = [];
      let cur = h, closed = false;
      for (;;) {
        used[cur] = 1; loop.push(I[cur]);
        const b = I[nxt(cur)];
        let n = first[b];
        while (n >= 0 && used[n]) n = link[n];
        if (n < 0) { closed = b === I[h]; break; }
        cur = n;
      }
      if (closed && loop.length >= 3) loops.push(new Uint32Array(loop));
    }
    return { edges: edges, loops: loops };
  }

  // level 1: flat patch; 2: + patch triangles sized like the surrounding mesh; 3: + relaxed (smooth membrane);
  // 4: + shaped to continue the curvature of the surface around the hole
  function fillHoles(mesh, opt, progress) {
    const P0 = mesh.positions, I0 = mesh.indices, nv0 = P0.length / 3, level = opt.level || 1;
    const bnd = boundary(P0, I0);
    // area-weighted vertex normals, to tell which way a patch has to face
    const VN = new Float32Array(3 * nv0);
    for (let t = 0; t < I0.length; t += 3) {
      const a = 3 * I0[t], b = 3 * I0[t + 1], c = 3 * I0[t + 2];
      const ux = P0[b] - P0[a], uy = P0[b + 1] - P0[a + 1], uz = P0[b + 2] - P0[a + 2], wx = P0[c] - P0[a], wy = P0[c + 1] - P0[a + 1], wz = P0[c + 2] - P0[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const v of [a, b, c]) { VN[v] += nx; VN[v + 1] += ny; VN[v + 2] += nz; }
    }
    const addP = [], addI = [];
    let filled = 0, skipped = 0, newVerts = 0;
    const t0 = Date.now();
    for (let li = 0; li < bnd.loops.length; li++) {
      const loop = bnd.loops[li], m = loop.length;
      if (opt.only !== undefined && opt.only >= 0 && li !== opt.only) continue;
      if (opt.maxEdges > 0 && m > opt.maxEdges) { skipped++; continue; }
      // local copy; the patch runs against the boundary direction so that it faces the same way as the surface
      const L = new Uint32Array(m), X = new Array(3 * m);
      for (let i = 0; i < m; i++) { const v = loop[m - 1 - i]; L[i] = v; X[3 * i] = P0[3 * v]; X[3 * i + 1] = P0[3 * v + 1]; X[3 * i + 2] = P0[3 * v + 2]; }
      const T = earClip(X, L, VN, m);
      let per = 0;
      for (let i = 0; i < m; i++) { const j = (i + 1) % m; per += Math.hypot(X[3 * i] - X[3 * j], X[3 * i + 1] - X[3 * j + 1], X[3 * i + 2] - X[3 * j + 2]); }
      const Lt = per / m;
      if (level >= 2) refinePatch(X, T, Lt, 250000);
      if (level >= 3 && X.length / 3 > m) smoothPatch(X, T, m, L, P0, I0, level >= 4, Lt, t0 + (opt.budgetMs || 6000));
      for (let v = m; v < X.length / 3; v++) addP.push(X[3 * v], X[3 * v + 1], X[3 * v + 2]);
      for (let k = 0; k < T.length; k++) addI.push(T[k] < m ? L[T[k]] : nv0 + newVerts + T[k] - m);
      newVerts += X.length / 3 - m; filled++;
      if (progress) progress((li + 1) / bnd.loops.length);
    }
    const pos = new Float32Array(P0.length + addP.length), idx = new Uint32Array(I0.length + addI.length);
    pos.set(P0); pos.set(addP, P0.length); idx.set(I0); idx.set(addI, I0.length);
    return { positions: pos, indices: idx, filled: filled, skipped: skipped, holes: bnd.loops.length, added: addI.length / 3 };
  }
  // close a polygon by repeatedly cutting off the corner with the smallest interior angle
  function earClip(X, L, VN, m) {
    const prev = new Int32Array(m), next = new Int32Array(m), ver = new Int32Array(m), T = [];
    for (let i = 0; i < m; i++) { prev[i] = (i + m - 1) % m; next[i] = (i + 1) % m; }
    const angle = function (i) {
      const p = 3 * prev[i], n = 3 * next[i], c = 3 * i;
      const ax = X[p] - X[c], ay = X[p + 1] - X[c + 1], az = X[p + 2] - X[c + 2], bx = X[n] - X[c], by = X[n + 1] - X[c + 1], bz = X[n + 2] - X[c + 2];
      const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz);
      if (la < 1e-30 || lb < 1e-30) return 0;
      let ang = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb))));
      // (prev, i, next) must face the way the surface does at i; if it does not, the corner is a reflex one
      const nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax, g = 3 * L[i];
      if (nx * VN[g] + ny * VN[g + 1] + nz * VN[g + 2] < 0) ang = 2 * Math.PI - ang;
      return ang;
    };
    const heap = [];
    const push = function (i) {
      const e = [angle(i), i, ver[i]];
      let k = heap.length; heap.push(e);
      while (k > 0) { const q = (k - 1) >> 1; if (heap[q][0] <= e[0]) break; heap[k] = heap[q]; k = q; }
      heap[k] = e;
    };
    const pop = function () {
      const top = heap[0], e = heap.pop();
      if (heap.length) {
        let k = 0;
        for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[c][0] >= e[0]) break; heap[k] = heap[c]; k = c; }
        heap[k] = e;
      }
      return top;
    };
    for (let i = 0; i < m; i++) push(i);
    let left = m;
    while (left > 3 && heap.length) {
      const e = pop(), i = e[1];
      if (ver[i] !== e[2] || next[i] < 0) continue;
      const p = prev[i], n = next[i];
      T.push(p, i, n);
      next[p] = n; prev[n] = p; next[i] = -1; left--;
      ver[p]++; ver[n]++; push(p); push(n);
    }
    for (let i = 0; i < m; i++) if (next[i] >= 0) { T.push(prev[i], i, next[i]); break; }
    return T;
  }
  // split the long inner edges of a patch and flip edges towards well-shaped triangles
  function refinePatch(X, T, Lt, maxTris) {
    const K = 2097152, lim2 = 2.25 * Lt * Lt;
    const edges = function () {
      const em = new Map();
      for (let t = 0; t < T.length; t += 3) for (let c = 0; c < 3; c++) {
        const a = T[t + c], b = T[t + (c + 1) % 3], key = a < b ? a * K + b : b * K + a, e = em.get(key);
        if (e) e[1] = t; else em.set(key, [t, -1]);
      }
      return em;
    };
    const d2 = function (a, b) { const x = X[3 * a] - X[3 * b], y = X[3 * a + 1] - X[3 * b + 1], z = X[3 * a + 2] - X[3 * b + 2]; return x * x + y * y + z * z; };
    const corner = function (t, a, b) { for (let c = 0; c < 3; c++) if (T[t + c] === a && T[t + (c + 1) % 3] === b) return c; return -1; };
    const ang = function (c, a, b) {   // angle at c in triangle (a, b, c)
      const la = d2(c, a), lb = d2(c, b), lc = d2(a, b), den = 2 * Math.sqrt(la * lb);
      return den > 0 ? Math.acos(Math.max(-1, Math.min(1, (la + lb - lc) / den))) : 0;
    };
    for (let pass = 0; pass < 16; pass++) {
      let em = edges(), changed = 0;
      let lock = new Uint8Array(T.length / 3);
      em.forEach(function (e, key) {
        if (e[1] < 0 || lock[e[0] / 3] || lock[e[1] / 3]) return;
        const b = key % K, a = (key - b) / K;
        if (d2(a, b) <= lim2 || X.length / 3 >= K - 2) return;
        const mid = X.length / 3;
        X.push((X[3 * a] + X[3 * b]) / 2, (X[3 * a + 1] + X[3 * b + 1]) / 2, (X[3 * a + 2] + X[3 * b + 2]) / 2);
        for (const t of e) {
          let c = corner(t, a, b), u = a, v = b;
          if (c < 0) { c = corner(t, b, a); u = b; v = a; }
          const w = T[t + (c + 2) % 3];
          T[t] = u; T[t + 1] = mid; T[t + 2] = w; T.push(mid, v, w);
          lock[t / 3] = 1;
        }
        changed++;
      });
      for (let r = 0; r < 2; r++) {
        em = edges(); lock = new Uint8Array(T.length / 3);
        em.forEach(function (e, key) {
          if (e[1] < 0 || lock[e[0] / 3] || lock[e[1] / 3]) return;
          const b0 = key % K, a0 = (key - b0) / K;
          let t1 = e[0], t2 = e[1], a = a0, b = b0, c1 = corner(t1, a, b);
          if (c1 < 0) { a = b0; b = a0; c1 = corner(t1, a, b); }
          const c2 = corner(t2, b, a);
          if (c1 < 0 || c2 < 0) return;
          const c = T[t1 + (c1 + 2) % 3], d = T[t2 + (c2 + 2) % 3];
          if (c === d || em.has(c < d ? c * K + d : d * K + c)) return;
          if (ang(c, a, b) + ang(d, a, b) <= Math.PI + 1e-6) return;
          T[t1] = a; T[t1 + 1] = d; T[t1 + 2] = c; T[t2] = d; T[t2 + 1] = b; T[t2 + 2] = c;
          lock[t1 / 3] = lock[t2 / 3] = 1;
        });
      }
      if (!changed || T.length / 3 > maxTris) break;
    }
  }
  // move the new vertices of a patch: membrane (each vertex to the middle of its neighbours) and, with curv, on to a
  // surface whose bending is spread evenly, which carries the curvature of the surrounding mesh across the hole
  function smoothPatch(X, T, m, L, P0, I0, curv, Lt, deadline) {
    const n = X.length / 3, nbs = new Array(n);
    for (let v = 0; v < n; v++) nbs[v] = [];
    const link = function (a, b) { if (nbs[a].indexOf(b) < 0) nbs[a].push(b); };
    for (let t = 0; t < T.length; t += 3) for (let c = 0; c < 3; c++) { const a = T[t + c], b = T[t + (c + 1) % 3]; link(a, b); link(b, a); }
    const eps2 = 1e-10 * Lt * Lt;
    for (let it = 0; it < 400; it++) {
      let mv = 0;
      for (let v = m; v < n; v++) {
        const nb = nbs[v]; let x = 0, y = 0, z = 0;
        for (const q of nb) { x += X[3 * q]; y += X[3 * q + 1]; z += X[3 * q + 2]; }
        x /= nb.length; y /= nb.length; z /= nb.length;
        const dx = x - X[3 * v], dy = y - X[3 * v + 1], dz = z - X[3 * v + 2];
        mv = Math.max(mv, dx * dx + dy * dy + dz * dz);
        X[3 * v] = x; X[3 * v + 1] = y; X[3 * v + 2] = z;
      }
      if (mv < eps2) break;
    }
    if (!curv) return;
    // rim vertices also see their neighbours in the original mesh: that is where the surrounding curvature comes from
    const local = new Map(), outer = new Array(m);
    for (let i = 0; i < m; i++) { local.set(L[i], i); outer[i] = []; }
    for (let t = 0; t < I0.length; t += 3) for (let c = 0; c < 3; c++) {
      const i = local.get(I0[t + c]);
      if (i === undefined) continue;
      for (let k = 1; k < 3; k++) { const g = I0[t + (c + k) % 3]; if (!local.has(g) && outer[i].indexOf(g) < 0) outer[i].push(g); }
    }
    const U = new Float64Array(3 * n), deg = new Float64Array(n);
    for (let v = 0; v < n; v++) deg[v] = nbs[v].length + (v < m ? outer[v].length : 0);
    const nu = new Float64Array(n);
    for (let v = m; v < n; v++) { let s = 0; for (const q of nbs[v]) s += 1 / deg[q]; nu[v] = 1 + s / deg[v]; }
    const maxIt = Math.min(6000, 200 + 6 * (n - m));
    for (let it = 0; it < maxIt; it++) {
      for (let v = 0; v < n; v++) {
        let x = 0, y = 0, z = 0;
        for (const q of nbs[v]) { x += X[3 * q]; y += X[3 * q + 1]; z += X[3 * q + 2]; }
        if (v < m) for (const g of outer[v]) { x += P0[3 * g]; y += P0[3 * g + 1]; z += P0[3 * g + 2]; }
        U[3 * v] = x / deg[v] - X[3 * v]; U[3 * v + 1] = y / deg[v] - X[3 * v + 1]; U[3 * v + 2] = z / deg[v] - X[3 * v + 2];
      }
      let mv = 0;
      for (let v = m; v < n; v++) {
        let x = 0, y = 0, z = 0;
        for (const q of nbs[v]) { x += U[3 * q]; y += U[3 * q + 1]; z += U[3 * q + 2]; }
        const k = nbs[v].length, dx = (x / k - U[3 * v]) / nu[v], dy = (y / k - U[3 * v + 1]) / nu[v], dz = (z / k - U[3 * v + 2]) / nu[v];
        X[3 * v] -= dx; X[3 * v + 1] -= dy; X[3 * v + 2] -= dz;
        mv = Math.max(mv, dx * dx + dy * dy + dz * dz);
      }
      if (mv < eps2 || ((it & 31) === 31 && Date.now() > deadline)) break;
    }
  }

  // ---------- shape recognition for the measuring tools ----------
  function eig3(m) {      // symmetric 3x3 [xx, xy, xz, yy, yz, zz] -> { val: [3], vec: [[3], [3], [3]] }, largest first
    const a = [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 30; sweep++) {
      let off = 0;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
      if (off < 1e-30) break;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
        for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
        for (let k = 0; k < 3; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
      }
    }
    const o = [0, 1, 2].sort(function (i, j) { return a[j][j] - a[i][i]; });
    return { val: o.map(function (i) { return a[i][i]; }), vec: o.map(function (i) { return [v[0][i], v[1][i], v[2][i]]; }) };
  }
  // least-squares circle through 2D points -> [cx, cy, r]
  function fitCircle2(pts) {
    let sx = 0, sy = 0; const n = pts.length / 2;
    for (let i = 0; i < n; i++) { sx += pts[2 * i]; sy += pts[2 * i + 1]; }
    sx /= n; sy /= n;
    let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (let i = 0; i < n; i++) { const u = pts[2 * i] - sx, v = pts[2 * i + 1] - sy; suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
    const det = suu * svv - suv * suv;
    if (Math.abs(det) < 1e-300) return null;
    const bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2, uc = (bu * svv - bv * suv) / det, vc = (suu * bv - suv * bu) / det;
    return [uc + sx, vc + sy, Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)];
  }
  // sharp edges (fold of ang degrees or more, or an open border) chained into lines, arcs and free curves
  function featEdges(P, I, ang) {
    const nv = P.length / 3, nt = I.length / 3, nh = I.length, adj = edgeAdjacency(P, I, nv, null).adj;
    const nxt = function (h) { return h % 3 === 2 ? h - 2 : h + 1; };
    const N = new Float32Array(3 * nt), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    let total = 0;
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    for (let t = 0; t < nt; t++) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      total += l / 2;
      if (l > 0) { N[3 * t] = nx / l; N[3 * t + 1] = ny / l; N[3 * t + 2] = nz / l; }
    }
    const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
    const F = { adj: adj, N: N, diag: diag, area: total, sharp: new Uint8Array(nh), chainOf: new Int32Array(nh).fill(-1), corner: new Uint8Array(nv), chains: [], faceOf: new Int32Array(nt).fill(-1), faces: [] };
    const cosA = Math.cos((ang || 30) * Math.PI / 180), deg = new Uint32Array(nv + 1);
    let ns = 0;
    for (let h = 0; h < nh; h++) {
      const o = adj[h];
      if (I[h] === I[nxt(h)]) continue;
      let s = o < 0;
      if (!s) { const a = 3 * ((h / 3) | 0), b = 3 * ((o / 3) | 0), sg = I[h] !== I[o] ? 1 : -1; s = sg * (N[a] * N[b] + N[a + 1] * N[b + 1] + N[a + 2] * N[b + 2]) < cosA; }
      if (!s) continue;
      F.sharp[h] = 1;
      if (o < 0 || h < o) { deg[I[h] + 1]++; deg[I[nxt(h)] + 1]++; ns++; }
    }
    if (ns > 400000) return F;                              // a noisy scan: edges would mean nothing
    for (let v = 0; v < nv; v++) deg[v + 1] += deg[v];
    const inc = new Int32Array(2 * ns), cur = deg.slice(0, nv);
    for (let h = 0; h < nh; h++) if (F.sharp[h] && (adj[h] < 0 || h < adj[h])) { inc[cur[I[h]]++] = h; inc[cur[I[nxt(h)]]++] = h; }
    const other = function (h, v) { return I[h] === v ? I[nxt(h)] : I[h]; };
    for (let v = 0; v < nv; v++) {
      const d = deg[v + 1] - deg[v];
      if (!d) continue;
      if (d !== 2) { F.corner[v] = 1; continue; }
      const a = 3 * other(inc[deg[v]], v), b = 3 * other(inc[deg[v] + 1], v), c = 3 * v;
      const ax = P[c] - P[a], ay = P[c + 1] - P[a + 1], az = P[c + 2] - P[a + 2], bx = P[b] - P[c], by = P[b + 1] - P[c + 1], bz = P[b + 2] - P[c + 2];
      const den = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz);
      if (den > 0 && (ax * bx + ay * by + az * bz) / den < 0.6428) F.corner[v] = 1;      // the edge turns by more than 50 degrees
    }
    const seen = new Uint8Array(nh);
    const walk = function (h0, v0) {
      const vs = [v0], hs = [];
      let h = h0, v = v0;
      for (;;) {
        seen[h] = 1; hs.push(h);
        v = other(h, v); vs.push(v);
        if (F.corner[v] || v === v0) break;
        const a = inc[deg[v]], b = inc[deg[v] + 1];
        h = a === h ? b : a;
        if (seen[h]) break;
      }
      const id = F.chains.length, ch = { v: vs, closed: vs[vs.length - 1] === v0 && !F.corner[v0], type: 'curve', len: 0 };
      for (const q of hs) { F.chainOf[q] = id; if (adj[q] >= 0) F.chainOf[adj[q]] = id; }
      classifyChain(P, ch, diag);
      F.chains.push(ch);
    };
    for (let v = 0; v < nv; v++) if (F.corner[v]) for (let k = deg[v]; k < deg[v + 1]; k++) if (!seen[inc[k]]) walk(inc[k], v);
    for (let k = 0; k < inc.length; k++) if (!seen[inc[k]]) walk(inc[k], I[inc[k]]);
    return F;
  }
  function classifyChain(P, ch, diag) {
    const vs = ch.v, n = vs.length, a = 3 * vs[0], b = 3 * vs[n - 1];
    let len = 0;
    for (let i = 0; i + 1 < n; i++) { const p = 3 * vs[i], q = 3 * vs[i + 1]; len += Math.hypot(P[p] - P[q], P[p + 1] - P[q + 1], P[p + 2] - P[q + 2]); }
    ch.len = len;
    const tol = Math.max(1e-5 * diag, 0.002 * len);
    if (!ch.closed) {
      const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], dl = Math.hypot(dx, dy, dz);
      let dev = 0;
      if (dl > 0) for (let i = 1; i + 1 < n; i++) {
        const p = 3 * vs[i], x = P[p] - P[a], y = P[p + 1] - P[a + 1], z = P[p + 2] - P[a + 2];
        dev = Math.max(dev, Math.hypot(y * dz - z * dy, z * dx - x * dz, x * dy - y * dx) / dl);
      }
      if (dl > 0 && dev <= tol) { ch.type = 'line'; return; }
    }
    const np = ch.closed ? n - 1 : n;
    if (np < (ch.closed ? 6 : 4)) return;
    // plane of the points, then a circle in that plane
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < np; i++) { const p = 3 * vs[i]; cx += P[p]; cy += P[p + 1]; cz += P[p + 2]; }
    cx /= np; cy /= np; cz /= np;
    const m = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < np; i++) { const p = 3 * vs[i], x = P[p] - cx, y = P[p + 1] - cy, z = P[p + 2] - cz; m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z; }
    const e = eig3(m), u = e.vec[0], w = e.vec[1], nrm = e.vec[2], pts = new Float64Array(2 * np);
    let flat = 0;
    for (let i = 0; i < np; i++) {
      const p = 3 * vs[i], x = P[p] - cx, y = P[p + 1] - cy, z = P[p + 2] - cz;
      pts[2 * i] = x * u[0] + y * u[1] + z * u[2]; pts[2 * i + 1] = x * w[0] + y * w[1] + z * w[2];
      flat = Math.max(flat, Math.abs(x * nrm[0] + y * nrm[1] + z * nrm[2]));
    }
    const c = fitCircle2(pts);
    if (!c || !(c[2] > 0) || c[2] > 20 * diag) return;
    const tc = Math.max(1e-4 * diag, 0.01 * c[2]);
    if (flat > tc) return;
    for (let i = 0; i < np; i++) if (Math.abs(Math.hypot(pts[2 * i] - c[0], pts[2 * i + 1] - c[1]) - c[2]) > tc) return;
    ch.type = 'arc'; ch.r = c[2]; ch.n = nrm;
    ch.c = [cx + c[0] * u[0] + c[1] * w[0], cy + c[0] * u[1] + c[1] * w[1], cz + c[0] * u[2] + c[1] * w[2]];
  }
  // the plane, cylinder or sphere that triangle tri lies on, with every connected triangle that fits it (null if none)
  function fitFace(P, I, F, tri) {
    if (F.faceOf[tri] >= 0) return F.faces[F.faceOf[tri]];
    if (F.faceOf[tri] === -2) return null;
    const adj = F.adj, N = F.N, nt = I.length / 3, diag = F.diag;
    const n0 = [N[3 * tri], N[3 * tri + 1], N[3 * tri + 2]];
    if (!(n0[0] || n0[1] || n0[2])) { F.faceOf[tri] = -2; return null; }
    const cen = function (t) { const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2]; return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3]; };
    const areaOf = function (t) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    };
    const mark = new Int32Array(nt); let stamp = 0;
    // connected triangles from tri that pass test(t); stops at limit
    const flood = function (test, limit) {
      stamp++;
      const out = [tri]; mark[tri] = stamp;
      for (let k = 0; k < out.length && out.length < limit; k++) {
        const t = out[k];
        for (let c = 0; c < 3; c++) {
          const o = adj[3 * t + c];
          if (o < 0) continue;
          const u = (o / 3) | 0;
          if (mark[u] === stamp) continue;
          mark[u] = stamp;
          if (test(u, t)) out.push(u);
        }
      }
      let a = 0;
      for (const t of out) a += areaOf(t);
      return { tris: out, area: a };
    };
    const p0 = cen(tri), tolP = 5e-4 * diag;
    // plane
    const d0 = n0[0] * p0[0] + n0[1] * p0[1] + n0[2] * p0[2];
    const plane = flood(function (u) {
      if (N[3 * u] * n0[0] + N[3 * u + 1] * n0[1] + N[3 * u + 2] * n0[2] < 0.99939) return false;        // 2 degrees
      for (let c = 0; c < 3; c++) { const v = 3 * I[3 * u + c]; if (Math.abs(P[v] * n0[0] + P[v + 1] * n0[1] + P[v + 2] * n0[2] - d0) > tolP) return false; }
      return true;
    }, 1e9);
    // a sample of the smooth surface around tri
    const sample = flood(function (u, t) {
      const d = N[3 * u] * N[3 * t] + N[3 * u + 1] * N[3 * t + 1] + N[3 * u + 2] * N[3 * t + 2];
      return d > 0.82 && N[3 * u] * n0[0] + N[3 * u + 1] * n0[1] + N[3 * u + 2] * n0[2] > 0.2;
    }, 500).tris;
    const cov = [0, 0, 0, 0, 0, 0];
    for (const t of sample) { const w = areaOf(t), x = N[3 * t], y = N[3 * t + 1], z = N[3 * t + 2]; cov[0] += w * x * x; cov[1] += w * x * y; cov[2] += w * x * z; cov[3] += w * y * y; cov[4] += w * y * z; cov[5] += w * z * z; }
    const e = eig3(cov);
    const median = function (a) { a.sort(function (x, y) { return x - y; }); return a.length ? a[a.length >> 1] : NaN; };
    let best = null;
    const consider = function (f) { if (f && (!best || f.area > best.area)) best = f; };
    // cylinder: the normals lie in one plane; its normal is the axis
    if (e.val[1] > 1e-4 * e.val[0] && e.val[2] < 0.05 * e.val[1]) {
      let ax = e.vec[2];
      for (let round = 0; round < 2; round++) {
        const perp = function (v) { const k = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2]; return [v[0] - k * ax[0], v[1] - k * ax[1], v[2] - k * ax[2]]; };
        const np = perp(n0), nl = Math.hypot(np[0], np[1], np[2]);
        if (nl < 0.5) break;
        const rs = [];
        for (const t of sample) {
          const dn = perp([N[3 * t] - n0[0], N[3 * t + 1] - n0[1], N[3 * t + 2] - n0[2]]), l2 = dn[0] * dn[0] + dn[1] * dn[1] + dn[2] * dn[2];
          if (l2 < 0.0025) continue;
          const q = cen(t), dp = perp([q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]]);
          rs.push((dp[0] * dn[0] + dp[1] * dn[1] + dp[2] * dn[2]) / l2);
        }
        let R = median(rs);
        if (!isFinite(R) || Math.abs(R) < 1e-9 * diag || Math.abs(R) > 20 * diag) break;
        let c = [p0[0] - R * np[0] / nl, p0[1] - R * np[1] / nl, p0[2] - R * np[2] / nl];
        let reg = null;
        for (let pass = 0; pass < 2; pass++) {
          const r = Math.abs(R), sg = R > 0 ? 1 : -1, tol = Math.min(tolP * 2, 0.15 * r), cc = c;
          reg = flood(function (u) {
            for (let k = 0; k < 3; k++) { const v = 3 * I[3 * u + k], d = perp([P[v] - cc[0], P[v + 1] - cc[1], P[v + 2] - cc[2]]); if (Math.abs(Math.hypot(d[0], d[1], d[2]) - r) > tol) return false; }
            const q = cen(u), d = perp([q[0] - cc[0], q[1] - cc[1], q[2] - cc[2]]), dl = Math.hypot(d[0], d[1], d[2]) || 1;
            return sg * (N[3 * u] * d[0] + N[3 * u + 1] * d[1] + N[3 * u + 2] * d[2]) / dl > 0.9;
          }, 1e9);
          if (reg.tris.length < 4 || pass) break;
          // refit: axis from the normals of the region, circle from its vertices
          const cv = [0, 0, 0, 0, 0, 0];
          for (const t of reg.tris) { const w = areaOf(t), x = N[3 * t], y = N[3 * t + 1], z = N[3 * t + 2]; cv[0] += w * x * x; cv[1] += w * x * y; cv[2] += w * x * z; cv[3] += w * y * y; cv[4] += w * y * z; cv[5] += w * z * z; }
          const e2 = eig3(cv);
          if (e2.val[1] > 1e-4 * e2.val[0] && e2.val[2] < 0.05 * e2.val[1]) ax = e2.vec[2];
          const u1 = e2.vec[0], pu = perp(u1), pl = Math.hypot(pu[0], pu[1], pu[2]) || 1, bu = [pu[0] / pl, pu[1] / pl, pu[2] / pl];
          const bw = [ax[1] * bu[2] - ax[2] * bu[1], ax[2] * bu[0] - ax[0] * bu[2], ax[0] * bu[1] - ax[1] * bu[0]], pts = [];
          for (const t of reg.tris) for (let k = 0; k < 3; k++) { const v = 3 * I[3 * t + k], x = P[v] - p0[0], y = P[v + 1] - p0[1], z = P[v + 2] - p0[2]; pts.push(x * bu[0] + y * bu[1] + z * bu[2], x * bw[0] + y * bw[1] + z * bw[2]); }
          const fc = fitCircle2(pts);
          if (!fc) break;
          c = [p0[0] + fc[0] * bu[0] + fc[1] * bw[0], p0[1] + fc[0] * bu[1] + fc[1] * bw[1], p0[2] + fc[0] * bu[2] + fc[1] * bw[2]];
          R = sg * fc[2];
        }
        if (reg && reg.tris.length >= 4) {
          // how far round the cylinder the region goes: a facet strip or two is not enough to call it a cylinder
          let lo = 1;
          for (const t of reg.tris) lo = Math.min(lo, N[3 * t] * n0[0] + N[3 * t + 1] * n0[1] + N[3 * t + 2] * n0[2]);
          if (lo < 0.94) consider({ type: 'cyl', tris: reg.tris, area: reg.area, c: c, a: ax, r: Math.abs(R) });
        }
        break;
      }
    }
    // sphere
    if (e.val[2] > 0.004 * e.val[0]) {
      const rs = [];
      for (const t of sample) {
        const dn = [N[3 * t] - n0[0], N[3 * t + 1] - n0[1], N[3 * t + 2] - n0[2]], l2 = dn[0] * dn[0] + dn[1] * dn[1] + dn[2] * dn[2];
        if (l2 < 0.0025) continue;
        const q = cen(t);
        rs.push(((q[0] - p0[0]) * dn[0] + (q[1] - p0[1]) * dn[1] + (q[2] - p0[2]) * dn[2]) / l2);
      }
      let R = median(rs);
      if (isFinite(R) && Math.abs(R) > 1e-9 * diag && Math.abs(R) < 20 * diag) {
        let c = [p0[0] - R * n0[0], p0[1] - R * n0[1], p0[2] - R * n0[2]], reg = null;
        for (let pass = 0; pass < 2; pass++) {
          const r = Math.abs(R), sg = R > 0 ? 1 : -1, tol = Math.min(tolP * 2, 0.15 * r), cc = c;
          reg = flood(function (u) {
            for (let k = 0; k < 3; k++) { const v = 3 * I[3 * u + k]; if (Math.abs(Math.hypot(P[v] - cc[0], P[v + 1] - cc[1], P[v + 2] - cc[2]) - r) > tol) return false; }
            const q = cen(u), d = [q[0] - cc[0], q[1] - cc[1], q[2] - cc[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1;
            return sg * (N[3 * u] * d[0] + N[3 * u + 1] * d[1] + N[3 * u + 2] * d[2]) / dl > 0.9;
          }, 1e9);
          if (reg.tris.length < 8 || pass) break;
          // refit: |x|^2 = 2 c.x + (r^2 - |c|^2), linear in (c, k), relative to p0
          const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], B = [0, 0, 0, 0];
          for (const t of reg.tris) for (let k = 0; k < 3; k++) {
            const v = 3 * I[3 * t + k], row = [2 * (P[v] - p0[0]), 2 * (P[v + 1] - p0[1]), 2 * (P[v + 2] - p0[2]), 1], rhs = (row[0] * row[0] + row[1] * row[1] + row[2] * row[2]) / 4;
            for (let i = 0; i < 4; i++) { B[i] += row[i] * rhs; for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j]; }
          }
          const x = solveN(A, B);
          if (!x) break;
          const r2 = x[3] + x[0] * x[0] + x[1] * x[1] + x[2] * x[2];
          if (!(r2 > 0)) break;
          c = [p0[0] + x[0], p0[1] + x[1], p0[2] + x[2]]; R = sg * Math.sqrt(r2);
        }
        if (reg && reg.tris.length >= 8) {
          const cv = [0, 0, 0, 0, 0, 0];
          for (const t of reg.tris) { const w = areaOf(t), x = N[3 * t], y = N[3 * t + 1], z = N[3 * t + 2]; cv[0] += w * x * x; cv[1] += w * x * y; cv[2] += w * x * z; cv[3] += w * y * y; cv[4] += w * y * z; cv[5] += w * z * z; }
          const e3 = eig3(cv);
          if (e3.val[2] > 0.004 * e3.val[0]) consider({ type: 'sph', tris: reg.tris, area: reg.area, c: c, r: Math.abs(R) });
        }
      }
    }
    if (plane.tris.length >= 2 && plane.area >= 1e-4 * F.area && (!best || plane.area >= 0.75 * best.area)) best = { type: 'plane', tris: plane.tris, area: plane.area, n: n0, p: p0 };
    if (!best) { F.faceOf[tri] = -2; return null; }
    // outline of the region, for highlighting
    stamp++;
    for (const t of best.tris) mark[t] = stamp;
    const rim = [];
    for (const t of best.tris) for (let c = 0; c < 3 && rim.length < 12000; c++) { const o = adj[3 * t + c]; if (o < 0 || mark[(o / 3) | 0] !== stamp) rim.push(I[3 * t + c], I[3 * t + (c + 1) % 3]); }
    best.rim = rim;
    const id = F.faces.length;
    F.faces.push(best);
    for (const t of best.tris) F.faceOf[t] = id;
    return best;
  }
  function solveN(A, B) {
    const n = B.length, M = A.map(function (r, i) { return r.concat([B[i]]); });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null;
      const tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map(function (r, i) { return r[n] / r[i]; });
  }


  // ---------- open borders and hole filling ----------
  function borderEdges(P, I) {
    const nv = P.length / 3, adj = edgeAdjacency(P, I, nv, null).adj, out = [];
    for (let h = 0; h < I.length; h++) { const a = I[h], b = I[h % 3 === 2 ? h - 2 : h + 1]; if (adj[h] < 0 && a !== b) out.push(a, b); }
    return new Uint32Array(out);
  }
  // closed loops of border edges, each in the direction the border runs in its triangles
  function borderLoops(P, I) {
    const E = borderEdges(P, I), ne = E.length / 2, from = new Map(), used = new Uint8Array(ne), loops = [];
    for (let e = 0; e < ne; e++) { const a = E[2 * e]; if (from.has(a)) from.get(a).push(e); else from.set(a, [e]); }
    for (let e0 = 0; e0 < ne; e0++) {
      if (used[e0]) continue;
      const path = [], pos = new Map();
      let e = e0;
      for (;;) {
        used[e] = 1;
        const a = E[2 * e], b = E[2 * e + 1];
        pos.set(a, path.length); path.push(a);
        if (pos.has(b)) {                                   // closed: cut the loop off (a pinched border gives several)
          const k = pos.get(b), loop = path.splice(k);
          for (const v of loop) pos.delete(v);
          if (loop.length >= 3) loops.push(loop);
          if (!path.length) break;
          // continue from b, which stays the end of what is left
          pos.delete(path[path.length - 1]); path.pop();
          const nx = (from.get(b) || []).find(function (x) { return !used[x]; });
          if (nx === undefined) break;
          e = nx; continue;
        }
        const nx = (from.get(b) || []).find(function (x) { return !used[x]; });
        if (nx === undefined) break;                         // dead end: not a closed border
        e = nx;
      }
    }
    return { loops: loops, edges: ne };
  }
  // merge border vertices that lie within tol of each other (closes cracks between patches that were never joined)
  function stitch(mesh, tol) {
    const P = mesh.positions, I = mesh.indices, nv = P.length / 3, E = borderEdges(P, I);
    const isB = new Uint8Array(nv);
    for (let i = 0; i < E.length; i++) isB[E[i]] = 1;
    const par = new Int32Array(nv);
    for (let v = 0; v < nv; v++) par[v] = v;
    const find = function (a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const grid = new Map(), inv = 1 / tol, t2 = tol * tol;
    let merged = 0;
    for (let v = 0; v < nv; v++) {
      if (!isB[v]) continue;
      const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
      let hit = -1;
      for (let dx = -1; dx <= 1 && hit < 0; dx++) for (let dy = -1; dy <= 1 && hit < 0; dy++) for (let dz = -1; dz <= 1 && hit < 0; dz++) {
        const list = grid.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
        if (!list) continue;
        for (const u of list) { const ex = P[3 * u] - x, ey = P[3 * u + 1] - y, ez = P[3 * u + 2] - z; if (ex * ex + ey * ey + ez * ez <= t2) { hit = u; break; } }
      }
      if (hit >= 0) { par[v] = find(hit); merged++; }
      else { const k = cx + ',' + cy + ',' + cz; if (grid.has(k)) grid.get(k).push(v); else grid.set(k, [v]); }
    }
    if (!merged) return { positions: P, indices: I, merged: 0 };
    const out = [];
    for (let t = 0; t < I.length; t += 3) { const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]); if (a !== b && b !== c && a !== c) out.push(a, b, c); }
    const m = compact(P, new Uint32Array(out));
    return { positions: m.positions, indices: m.indices, merged: merged };
  }
  // opt.level: 1 = flat patch, 2 = patch re-meshed to the size of the surrounding triangles, 3 = also bent to continue the
  // surface around the hole. opt.maxPerimeter (0 = every hole), opt.stitch (tolerance, 0 = off), opt.only (loop numbers).
  function fillHoles(mesh, opt) {
    let P = mesh.positions, I = mesh.indices, stitched = 0;
    if (opt.stitch > 0) { const s = stitch(mesh, opt.stitch); P = s.positions; I = s.indices; stitched = s.merged; }
    const nv0 = P.length / 3, level = opt.level || 1, B = borderLoops(P, I), loops = B.loops;
    const X = Array.prototype.slice.call(P), T = [];        // growing vertex list, new triangles
    const sub = function (a, b) { return [X[3 * a] - X[3 * b], X[3 * a + 1] - X[3 * b + 1], X[3 * a + 2] - X[3 * b + 2]]; };
    const crs = function (u, w) { return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
    const dt = function (u, w) { return u[0] * w[0] + u[1] * w[1] + u[2] * w[2]; };
    const ln = function (u) { return Math.sqrt(dt(u, u)); };
    // normal of the existing surface at each border vertex
    const vn = new Map();
    {
      const onB = new Set();
      for (const l of loops) for (const v of l) onB.add(v);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        if (!onB.has(a) && !onB.has(b) && !onB.has(c)) continue;
        const n = crs(sub(b, a), sub(c, a));
        for (const v of [a, b, c]) if (onB.has(v)) { const q = vn.get(v) || [0, 0, 0]; q[0] += n[0]; q[1] += n[1]; q[2] += n[2]; vn.set(v, q); }
      }
    }
    let filled = 0, skipped = 0, fi = 0;
    const patches = [];
    for (const loop of loops) {
      const n = loop.length;
      let per = 0;
      for (let i = 0; i < n; i++) per += ln(sub(loop[i], loop[(i + 1) % n]));
      const idx = fi++;
      if ((opt.maxPerimeter > 0 && per > opt.maxPerimeter) || (opt.only && opt.only.indexOf(idx) < 0)) { skipped++; continue; }
      // 1) close the loop by clipping, each time, the corner with the smallest opening
      const ring = loop.slice(), nr = ring.map(function (v) { const q = vn.get(v) || [0, 0, 1], l = ln(q) || 1; return [q[0] / l, q[1] / l, q[2] / l]; });
      const tri = [];
      const angleAt = function (i) {
        const m = ring.length, p = ring[(i + m - 1) % m], v = ring[i], q = ring[(i + 1) % m];
        const a = sub(p, v), b = sub(q, v), la = ln(a), lb = ln(b);
        if (la === 0 || lb === 0) return 0;
        let ang = Math.acos(Math.max(-1, Math.min(1, dt(a, b) / (la * lb))));
        if (dt(crs(sub(q, p), sub(v, p)), nr[i]) < 0) ang = 2 * Math.PI - ang;   // the corner opens the other way
        return ang;
      };
      while (ring.length > 3) {
        let bi = 0, ba = Infinity;
        for (let i = 0; i < ring.length; i++) { const a = angleAt(i); if (a < ba) { ba = a; bi = i; } }
        const m = ring.length, ip = (bi + m - 1) % m, iq = (bi + 1) % m, p = ring[ip], v = ring[bi], q = ring[iq];
        tri.push([p, q, v]);
        const tn = crs(sub(q, p), sub(v, p)), tl = ln(tn) || 1;
        for (const k of [ip, iq]) { const r = nr[k], w = [r[0] + 0.5 * tn[0] / tl, r[1] + 0.5 * tn[1] / tl, r[2] + 0.5 * tn[2] / tl], wl = ln(w) || 1; nr[k] = [w[0] / wl, w[1] / wl, w[2] / wl]; }
        ring.splice(bi, 1); nr.splice(bi, 1);
      }
      tri.push([ring[0], ring[2], ring[1]]);
      // 2) re-mesh: split the long inner edges, then flip edges towards well-shaped triangles
      const fixed = new Set(loop), target = per / n;
      if (level >= 2 && n > 3) {
        const key = function (a, b) { return a < b ? a + '_' + b : b + '_' + a; };
        for (let round = 0; round < 12; round++) {
          const em = new Map();
          tri.forEach(function (t, ti) { for (let c = 0; c < 3; c++) { const k = key(t[c], t[(c + 1) % 3]); if (em.has(k)) em.get(k).push(ti, c); else em.set(k, [ti, c]); } });
          const cand = [];
          em.forEach(function (e) { if (e.length === 4) { const t = tri[e[0]], a = t[e[1]], b = t[(e[1] + 1) % 3], l = ln(sub(a, b)); if (l > 1.5 * target) cand.push([l, e]); } });
          if (!cand.length) break;
          cand.sort(function (x, y) { return y[0] - x[0]; });
          const busy = new Uint8Array(tri.length);
          for (const cd of cand) {
            const e = cd[1], t1 = e[0], t2 = e[2];
            if (busy[t1] || busy[t2]) continue;
            busy[t1] = busy[t2] = 1;
            const A = tri[t1], a = A[e[1]], b = A[(e[1] + 1) % 3], c = A[(e[1] + 2) % 3], Bt = tri[t2], d = Bt[(e[3] + 2) % 3];
            const m = X.length / 3;
            X.push((X[3 * a] + X[3 * b]) / 2, (X[3 * a + 1] + X[3 * b + 1]) / 2, (X[3 * a + 2] + X[3 * b + 2]) / 2);
            tri[t1] = [a, m, c]; tri[t2] = [m, b, c]; tri.push([b, m, d], [m, a, d]);
          }
          // flips
          for (let pass = 0; pass < 3; pass++) {
            const em2 = new Map();
            tri.forEach(function (t, ti) { for (let c = 0; c < 3; c++) { const k = key(t[c], t[(c + 1) % 3]); if (em2.has(k)) em2.get(k).push(ti, c); else em2.set(k, [ti, c]); } });
            const touched = new Uint8Array(tri.length);
            let flips = 0;
            em2.forEach(function (e) {
              if (e.length !== 4 || touched[e[0]] || touched[e[2]]) return;
              const A = tri[e[0]], a = A[e[1]], b = A[(e[1] + 1) % 3], c = A[(e[1] + 2) % 3], d = tri[e[2]][(e[3] + 2) % 3];
              if (c === d || em2.has(key(c, d))) return;
              const ang = function (o, u, w) { const x = sub(u, o), y = sub(w, o); return Math.acos(Math.max(-1, Math.min(1, dt(x, y) / ((ln(x) * ln(y)) || 1)))); };
              if (ang(c, a, b) + ang(d, a, b) <= Math.PI + 1e-6) return;
              // keep the patch from folding: both new triangles must face the same way as the old ones
              const n0 = crs(sub(b, a), sub(c, a)), n1 = crs(sub(d, a), sub(c, a)), n2 = crs(sub(c, b), sub(d, b));
              if (dt(n0, n1) <= 0 || dt(n0, n2) <= 0) return;
              tri[e[0]] = [a, d, c]; tri[e[2]] = [d, b, c]; touched[e[0]] = touched[e[2]] = 1; flips++;
            });
            if (!flips) break;
          }
        }
      }
      patches.push({ tri: tri, fixed: fixed, first: T.length / 3, target: target });
      for (const t of tri) T.push(t[0], t[1], t[2]);
      filled++;
    }
    // 3) fairing: new vertices settle where the surface around the hole would continue (thin-plate energy)
    const nv1 = X.length / 3;
    if (level >= 3 && nv1 > nv0) {
      const nb = new Map(), add = function (a, b) { let s = nb.get(a); if (!s) { s = new Set(); nb.set(a, s); } s.add(b); };
      const ring1 = new Set();
      for (const p of patches) for (const v of p.fixed) ring1.add(v);
      for (let t = 0; t < I.length; t += 3) for (let c = 0; c < 3; c++) { const a = I[t + c]; if (ring1.has(a)) { add(a, I[t + (c + 1) % 3]); add(a, I[t + (c + 2) % 3]); } }
      for (let t = 0; t < T.length; t += 3) for (let c = 0; c < 3; c++) { add(T[t + c], T[t + (c + 1) % 3]); add(T[t + c], T[t + (c + 2) % 3]); }
      // unknowns: the new vertices. Equations: at every new vertex and every rim vertex the vertex should sit at the
      // average of its neighbours ("umbrella" = 0). Least squares over all of them, solved by conjugate gradients.
      const rows = [], id = new Map();
      nb.forEach(function (st, v) { id.set(v, rows.length); rows.push(v); });
      const nrw = rows.length, deg = new Float64Array(nrw), free = new Uint8Array(nrw), lists = new Array(nrw);
      for (let i = 0; i < nrw; i++) { const l = Array.from(nb.get(rows[i])); deg[i] = l.length; free[i] = rows[i] >= nv0 ? 1 : 0; lists[i] = l; }
      const loc = lists.map(function (l) { return l.map(function (q) { return id.has(q) ? id.get(q) : -1; }); });
      const mulB = function (x, out) {                       // out = B x   (x is zero on fixed vertices)
        for (let i = 0; i < nrw; i++) { let sm = 0; const l = loc[i]; for (let k = 0; k < l.length; k++) { const j = l[k]; if (j >= 0 && free[j]) sm += x[j]; } out[i] = sm / deg[i] - (free[i] ? x[i] : 0); }
      };
      const mulBt = function (r, out) {                      // out = B' r, on the free vertices
        for (let i = 0; i < nrw; i++) { if (!free[i]) { out[i] = 0; continue; } let sm = 0; const l = loc[i]; for (let k = 0; k < l.length; k++) { const j = l[k]; if (j >= 0) sm += r[j] / deg[j]; } out[i] = sm - r[i]; }
      };
      const nfree = nv1 - nv0, maxIt = opt.maxIter || Math.min(20000, 6 * nfree + 200);
      for (let ax = 0; ax < 3; ax++) {
        const x = new Float64Array(nrw), r = new Float64Array(nrw), sv = new Float64Array(nrw), pv = new Float64Array(nrw), q = new Float64Array(nrw);
        for (let i = 0; i < nrw; i++) {                       // start from the flat patch: r = -(umbrella)
          const l = lists[i]; let sm = 0;
          for (const u of l) sm += X[3 * u + ax];
          r[i] = -(sm / deg[i] - X[3 * rows[i] + ax]);
        }
        mulBt(r, sv);
        let g = 0;
        for (let i = 0; i < nrw; i++) { pv[i] = sv[i]; g += sv[i] * sv[i]; }
        const g0 = g;
        for (let it = 0; it < maxIt && g > 1e-18 * g0 && g > 0; it++) {
          mulB(pv, q);
          let qq = 0;
          for (let i = 0; i < nrw; i++) qq += q[i] * q[i];
          if (qq === 0) break;
          const al = g / qq;
          for (let i = 0; i < nrw; i++) { x[i] += al * pv[i]; r[i] -= al * q[i]; }
          mulBt(r, sv);
          let gn = 0;
          for (let i = 0; i < nrw; i++) gn += sv[i] * sv[i];
          const be = gn / g; g = gn;
          for (let i = 0; i < nrw; i++) pv[i] = sv[i] + be * pv[i];
        }
        for (let i = 0; i < nrw; i++) if (free[i]) X[3 * rows[i] + ax] += x[i];
      }
    }
    const I2 = new Uint32Array(I.length + T.length);
    I2.set(I); I2.set(T, I.length);
    return { positions: new Float32Array(X), indices: I2, holes: loops.length, filled: filled, skipped: skipped, added: T.length / 3, stitched: stitched, openEdges: B.edges };
  }

  // ---------- feature recognition: planes, cylinders, spheres, edges, corners ----------
  function solveLin(A, b) {                                  // Gaussian elimination with pivoting; returns null when singular
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      if (Math.abs(A[p][i]) < 1e-14) return null;
      const tr = A[i]; A[i] = A[p]; A[p] = tr; const tb = b[i]; b[i] = b[p]; b[p] = tb;
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
    return x;
  }
  function eig3(m) {                                         // symmetric 3x3 [xx,xy,xz,yy,yz,zz] -> values ascending + vectors
    const a = [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 30; sweep++) {
      let off = 0;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
      if (off < 1e-30) break;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
        for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
        for (let k = 0; k < 3; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
      }
    }
    const o = [0, 1, 2].sort(function (i, j) { return a[i][i] - a[j][j]; });
    return { val: o.map(function (i) { return a[i][i]; }), vec: o.map(function (i) { return [v[0][i], v[1][i], v[2][i]]; }) };
  }
  function fitCircle2(xs, ys) {                              // algebraic circle through 2D points
    const n = xs.length; let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    sx /= n; sy /= n;
    let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0;
    for (let i = 0; i < n; i++) { const x = xs[i] - sx, y = ys[i] - sy, r = x * x + y * y; a += x * x; b += x * y; c += y * y; d += x * r; e += y * r; f += r; }
    const s = solveLin([[a, b, 0], [b, c, 0], [0, 0, 1]], [d / 2, e / 2, 0]);
    if (!s) return null;
    const r = Math.sqrt(s[0] * s[0] + s[1] * s[1] + f / n);
    let rms = 0;
    for (let i = 0; i < n; i++) { const q = Math.hypot(xs[i] - sx - s[0], ys[i] - sy - s[1]) - r; rms += q * q; }
    return { cx: sx + s[0], cy: sy + s[1], r: r, rms: Math.sqrt(rms / n) };
  }
  function features(mesh, opt) {
    opt = opt || {};
    const P = mesh.positions, I = mesh.indices, nv = P.length / 3, nt = I.length / 3;
    const adj = edgeAdjacency(P, I, nv, null).adj;
    const N = new Float32Array(3 * nt), A = new Float32Array(nt);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
    for (let t = 0; t < nt; t++) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      A[t] = l / 2;
      if (l > 0) { N[3 * t] = nx / l; N[3 * t + 1] = ny / l; N[3 * t + 2] = nz / l; }
    }
    const cosFlat = Math.cos(0.8 * Math.PI / 180), cosSmooth = Math.cos((opt.smooth || 22) * Math.PI / 180), tolD = 1e-4 * diag;
    // 1) flat patches, grown from the largest triangles outwards
    const label = new Int32Array(nt).fill(-1), order = new Uint32Array(nt);
    for (let t = 0; t < nt; t++) order[t] = t;
    order.sort(function (x, y) { return A[y] - A[x]; });
    const rArea = [], rN = [], rD = [], stack = [];
    for (let oi = 0; oi < nt; oi++) {
      const s = order[oi];
      if (label[s] >= 0 || A[s] === 0) continue;
      const id = rArea.length, nx = N[3 * s], ny = N[3 * s + 1], nz = N[3 * s + 2], a0 = 3 * I[3 * s], d = nx * P[a0] + ny * P[a0 + 1] + nz * P[a0 + 2];
      let area = 0;
      label[s] = id; stack.push(s);
      while (stack.length) {
        const t = stack.pop();
        area += A[t];
        for (let c = 0; c < 3; c++) {
          const o = adj[3 * t + c];
          if (o < 0) continue;
          const u = (o / 3) | 0;
          if (label[u] >= 0 || A[u] === 0) continue;
          const sg = I[o] !== I[3 * t + c] ? 1 : -1;
          if (sg * (nx * N[3 * u] + ny * N[3 * u + 1] + nz * N[3 * u + 2]) < cosFlat) continue;
          const p = 3 * I[3 * u + (o % 3 + 2) % 3];
          if (Math.abs(nx * P[p] + ny * P[p + 1] + nz * P[p + 2] - d) > tolD) continue;
          label[u] = id; stack.push(u);
        }
      }
      rArea.push(area); rN.push([nx, ny, nz]); rD.push(d);
    }
    for (let t = 0; t < nt; t++) if (label[t] < 0) { label[t] = rArea.length; rArea.push(0); rN.push([0, 0, 1]); rD.push(0); }
    // a flat patch is a real plane unless it is one facet of a rounded surface: then a neighbour it meets at a
    // shallow angle is about as large as itself
    const nr0 = rArea.length, rival = new Float64Array(nr0);
    for (let h = 0; h < 3 * nt; h++) {
      const o = adj[h];
      if (o <= h) continue;
      const t = (h / 3) | 0, u = (o / 3) | 0, r1 = label[t], r2 = label[u];
      if (r1 === r2) continue;
      const sg = I[o] !== I[h] ? 1 : -1, dp = sg * (N[3 * t] * N[3 * u] + N[3 * t + 1] * N[3 * u + 1] + N[3 * t + 2] * N[3 * u + 2]);
      if (dp < cosSmooth) continue;
      if (rArea[r2] > rival[r1]) rival[r1] = rArea[r2];
      if (rArea[r1] > rival[r2]) rival[r2] = rArea[r1];
    }
    const isPlane = new Uint8Array(nr0);
    let totalArea = 0;
    for (let t = 0; t < nt; t++) totalArea += A[t];
    for (let r = 0; r < nr0; r++) isPlane[r] = rArea[r] > 2e-5 * totalArea && rival[r] < 0.35 * rArea[r] ? 1 : 0;
    // 2) everything else: rounded regions grown across shallow edges
    const reg = new Int32Array(nt).fill(-1), regs = [], remap = new Int32Array(nr0).fill(-1);
    for (let t = 0; t < nt; t++) {
      const r = label[t];
      if (!isPlane[r]) continue;
      if (remap[r] < 0) { remap[r] = regs.length; regs.push({ type: 'plane', n: rN[r], d: rD[r], area: rArea[r], tris: 0 }); }
      reg[t] = remap[r]; regs[remap[r]].tris++;
    }
    for (let s = 0; s < nt; s++) {
      if (reg[s] >= 0) continue;
      const id = regs.length, list = [];
      reg[s] = id; stack.push(s);
      while (stack.length) {
        const t = stack.pop();
        list.push(t);
        for (let c = 0; c < 3; c++) {
          const o = adj[3 * t + c];
          if (o < 0) continue;
          const u = (o / 3) | 0;
          if (reg[u] >= 0) continue;
          const sg = I[o] !== I[3 * t + c] ? 1 : -1;
          if (A[u] > 0 && A[t] > 0 && sg * (N[3 * t] * N[3 * u] + N[3 * t + 1] * N[3 * u + 1] + N[3 * t + 2] * N[3 * u + 2]) < cosSmooth) continue;
          reg[u] = id; stack.push(u);
        }
      }
      const R = { type: 'free', tris: list.length, area: 0 };
      regs.push(R);
      if (list.length < 6) continue;
      // fit a cylinder or a sphere to the region
      const seen = new Set(); let c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0;
      for (const t of list) {
        const w = A[t], x = N[3 * t], y = N[3 * t + 1], z = N[3 * t + 2];
        R.area += w; c0 += w * x * x; c1 += w * x * y; c2 += w * x * z; c3 += w * y * y; c4 += w * y * z; c5 += w * z * z;
        seen.add(I[3 * t]); seen.add(I[3 * t + 1]); seen.add(I[3 * t + 2]);
      }
      const vs = Array.from(seen), m = vs.length, E = eig3([c0, c1, c2, c3, c4, c5]), tot = E.val[0] + E.val[1] + E.val[2];
      if (tot <= 0 || E.val[1] < 0.004 * tot) continue;                    // (almost) flat: nothing to fit
      if (E.val[0] < 2e-4 * tot) {                             // all normals square to one direction: a cylinder about it
        const ax = E.vec[0], u = E.vec[1], w = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
        const xs = new Float64Array(m), ys = new Float64Array(m); let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < m; i++) { const p = 3 * vs[i], x = P[p], y = P[p + 1], z = P[p + 2]; xs[i] = x * u[0] + y * u[1] + z * u[2]; ys[i] = x * w[0] + y * w[1] + z * w[2]; const h = x * ax[0] + y * ax[1] + z * ax[2]; if (h < lo) lo = h; if (h > hi) hi = h; }
        const f = fitCircle2(xs, ys);
        if (f && f.r < 50 * diag && f.rms < 0.01 * f.r + 1e-5 * diag) {
          const mid = (lo + hi) / 2;
          R.type = 'cyl'; R.axis = ax; R.r = f.r; R.h = hi - lo;
          R.c = [f.cx * u[0] + f.cy * w[0] + mid * ax[0], f.cx * u[1] + f.cy * w[1] + mid * ax[1], f.cx * u[2] + f.cy * w[2] + mid * ax[2]];
        }
      } else {
        let sx = 0, sy = 0, sz = 0;
        for (const v of vs) { sx += P[3 * v]; sy += P[3 * v + 1]; sz += P[3 * v + 2]; }
        sx /= m; sy /= m; sz /= m;
        const M4 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], bb = [0, 0, 0, 0];
        for (const v of vs) {
          const x = P[3 * v] - sx, y = P[3 * v + 1] - sy, z = P[3 * v + 2] - sz, q = [2 * x, 2 * y, 2 * z, 1], rr = x * x + y * y + z * z;
          for (let i = 0; i < 4; i++) { bb[i] += q[i] * rr; for (let j = 0; j < 4; j++) M4[i][j] += q[i] * q[j]; }
        }
        const s = solveLin(M4, bb);
        if (s) {
          const r = Math.sqrt(Math.max(0, s[3] + s[0] * s[0] + s[1] * s[1] + s[2] * s[2]));
          let rms = 0;
          for (const v of vs) { const q = Math.hypot(P[3 * v] - sx - s[0], P[3 * v + 1] - sy - s[1], P[3 * v + 2] - sz - s[2]) - r; rms += q * q; }
          rms = Math.sqrt(rms / m);
          if (r > 0 && r < 50 * diag && rms < 0.01 * r + 1e-5 * diag) { R.type = 'sphere'; R.c = [sx + s[0], sy + s[1], sz + s[2]]; R.r = r; }
        }
      }
    }
    // 3) edges: runs of mesh edges between the same two regions (or on an open border), cut at corners
    const eA = [], eB = [], eR1 = [], eR2 = [], inc = new Map();
    let nEdge = 0;                                          // a surface this broken up is a scan: no usable edges on it
    for (let h = 0; h < 3 * nt; h++) { const o = adj[h]; if (o < 0 || (o > h && reg[(o / 3) | 0] !== reg[(h / 3) | 0])) nEdge++; }
    const noisy = nEdge > 60000 && nEdge > 0.1 * nt;
    for (let h = 0; h < 3 * nt && !noisy; h++) {
      const o = adj[h], a = I[h], b = I[h % 3 === 2 ? h - 2 : h + 1];
      if (a === b) continue;
      const r1 = reg[(h / 3) | 0], r2 = o < 0 ? -1 : reg[(o / 3) | 0];
      if (o >= 0 && (o < h || r1 === r2)) continue;
      const e = eA.length;
      eA.push(a); eB.push(b); eR1.push(Math.min(r1, r2)); eR2.push(Math.max(r1, r2));
      for (const v of [a, b]) { if (inc.has(v)) inc.get(v).push(e); else inc.set(v, [e]); }
    }
    const ne = eA.length, corner = new Set();
    inc.forEach(function (l, v) { if (l.length !== 2 || eR1[l[0]] !== eR1[l[1]] || eR2[l[0]] !== eR2[l[1]]) corner.add(v); });
    const usedE = new Uint8Array(ne), chains = [];
    const walk = function (e0, v0) {                         // follow the run from v0 through e0 until a corner or back home
      const vs = [v0]; let e = e0, v = v0;
      for (;;) {
        usedE[e] = 1;
        v = eA[e] === v ? eB[e] : eA[e];
        vs.push(v);
        if (corner.has(v) || v === v0) break;
        const l = inc.get(v), nx = l[0] === e ? l[1] : l[0];
        if (usedE[nx]) break;
        e = nx;
      }
      return vs;
    };
    const mkChain = function (vs, e0) {
      const pts = vs.map(function (v) { return [P[3 * v], P[3 * v + 1], P[3 * v + 2]]; }), n = pts.length, closed = n > 2 && vs[0] === vs[n - 1];
      let len = 0;
      for (let i = 0; i + 1 < n; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
      const ch = { pts: pts, closed: closed, len: len, r1: eR1[e0], r2: eR2[e0], type: 'curve' };
      const tol = 2e-4 * diag + 1e-3 * len;
      if (!closed) {                                          // straight?
        const a = pts[0], b = pts[n - 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], dl = Math.hypot(dx, dy, dz);
        let dev = 0;
        if (dl > 0) for (let i = 1; i + 1 < n; i++) { const x = pts[i][0] - a[0], y = pts[i][1] - a[1], z = pts[i][2] - a[2], t = (x * dx + y * dy + z * dz) / dl; dev = Math.max(dev, Math.sqrt(Math.max(0, x * x + y * y + z * z - t * t))); }
        if (dl > 0 && dev <= tol) { ch.type = 'line'; ch.p = a; ch.dir = [dx / dl, dy / dl, dz / dl]; return ch; }
      }
      const k = closed ? n - 1 : n;
      if (k >= 4) {                                           // arc or circle?
        let sx = 0, sy = 0, sz = 0;
        for (let i = 0; i < k; i++) { sx += pts[i][0]; sy += pts[i][1]; sz += pts[i][2]; }
        sx /= k; sy /= k; sz /= k;
        let c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0;
        for (let i = 0; i < k; i++) { const x = pts[i][0] - sx, y = pts[i][1] - sy, z = pts[i][2] - sz; c0 += x * x; c1 += x * y; c2 += x * z; c3 += y * y; c4 += y * z; c5 += z * z; }
        const E = eig3([c0, c1, c2, c3, c4, c5]), nrm = E.vec[0], u = E.vec[2], w = E.vec[1];
        if (Math.sqrt(Math.max(0, E.val[0]) / k) <= tol) {
          const xs = new Float64Array(k), ys = new Float64Array(k);
          for (let i = 0; i < k; i++) { const x = pts[i][0] - sx, y = pts[i][1] - sy, z = pts[i][2] - sz; xs[i] = x * u[0] + y * u[1] + z * u[2]; ys[i] = x * w[0] + y * w[1] + z * w[2]; }
          const f = fitCircle2(xs, ys);
          if (f && f.rms <= tol && f.r < 50 * diag) { ch.type = 'arc'; ch.r = f.r; ch.n = nrm; ch.c = [sx + f.cx * u[0] + f.cy * w[0], sy + f.cx * u[1] + f.cy * w[1], sz + f.cx * u[2] + f.cy * w[2]]; }
        }
      }
      return ch;
    };
    corner.forEach(function (v) { for (const e of inc.get(v)) if (!usedE[e]) chains.push(mkChain(walk(e, v), e)); });
    for (let e = 0; e < ne; e++) if (!usedE[e]) chains.push(mkChain(walk(e, eA[e]), e));
    for (const r of regs) r.chains = [];
    chains.forEach(function (c, i) { if (c.r1 >= 0) regs[c.r1].chains.push(i); if (c.r2 >= 0 && c.r2 !== c.r1) regs[c.r2].chains.push(i); });
    return { reg: reg, regions: regs, chains: chains, corners: corner.size, noisy: noisy };
  }

  return { parse: parse, weld: weld, decimate: decimate, split: split, borderEdges: borderEdges, borderLoops: borderLoops, stitch: stitch, fillHoles: fillHoles, features: features, boundary: boundary, fillHoles: fillHoles, featEdges: featEdges, fitFace: fitFace, splitAdv: splitAdv, edgeAdjacency: edgeAdjacency, writeSTL: writeSTL, writeOBJ: writeOBJ, zipStore: zipStore,
    buildBVH: buildBVH, raycast: raycast, undercut: undercut, collide: collide, stats: stats, topology: topology, deviation: deviation, rigidFit: rigidFit, icp: icp };
