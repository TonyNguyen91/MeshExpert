  // ================= 3D view shading in the sculpting style: MatCap + screen cavity + AO + cast shadow =================
  // ZS = settings (Settings ▸ 3D view, saved in localStorage 'mx.zs'). Off = the old flat shading.
  function zsDefaults() { return { on: true, mat: 'clay', tint: 35, light: 100, amb: 20, yaw: 0, pitch: 0, smooth: 35, cav: 60, ridge: 25, ao: 55, aoR: 18, sh: 35, shL: 35, shSoft: 40 }; }
  var ZS = zsDefaults(), ZG = null, zsSmoothEff = ZS.smooth, zsSmoothT = 0;
  try { const sv = JSON.parse(localStorage.getItem('mx.zs') || 'null'); if (sv) for (const k in ZS) if (typeof sv[k] === typeof ZS[k]) ZS[k] = sv[k]; } catch (e) { /* no storage */ }
  zsSmoothEff = ZS.smooth;
  function zsSave() { try { localStorage.setItem('mx.zs', JSON.stringify(ZS)); } catch (e) { /* no storage */ } }
  // key light direction in view space (x right, y up, z towards the viewer): upper left, in front
  const ZS_KEY = (function () { const v = [-0.55, 0.68, 0.55], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  // MatCap styles: albedo the picture is multiplied by, and the light model baked into the sphere
  const ZS_MATS = {
    clay: { vi: 'Đất sét mềm', en: 'Soft clay', alb: [0.86, 0.80, 0.74] },
    sculpt: { vi: 'Sculpt (tương phản)', en: 'Sculpt (contrast)', alb: [0.90, 0.79, 0.68] },
    gray: { vi: 'Xám', en: 'Grey', alb: [0.84, 0.84, 0.84] },
    white: { vi: 'Trắng', en: 'White', alb: [0.96, 0.96, 0.95] }
  };
  // linear light for a unit normal n under the style s (white albedo)
  function zsLight(s, x, y, z) {
    const K = ZS_KEY, nk = x * K[0] + y * K[1] + z * K[2];
    const F = [0.82, -0.22, 0.38], fl = Math.hypot(F[0], F[1], F[2]), nf = (x * F[0] + y * F[1] + z * F[2]) / fl;
    const hx = K[0], hy = K[1], hz = K[2] + 1, hl = Math.hypot(hx, hy, hz), nh = Math.max(0, (x * hx + y * hy + z * hz) / hl);
    const graze = Math.pow(1 - Math.max(z, 0), 3), up = 0.5 + 0.5 * y;
    if (s === 'sculpt') {
      const d = Math.pow(Math.max((nk + 0.1) / 1.1, 0), 2.5), f = Math.max(nf, 0);
      const sp = (0.3 * Math.pow(nh, 80) + 0.22 * Math.pow(nh, 12)) * Math.min(1, d * 4);
      return 1.55 * d + 0.45 * f * f + 0.05 + 0.04 * up + sp + 0.08 * graze;
    }
    if (s === 'gray') {
      const d = Math.pow(Math.max((nk + 0.2) / 1.2, 0), 1.5), f = Math.max(nf, 0);
      return 0.95 * d + 0.18 * f + 0.13 + 0.05 * up + 0.22 * Math.pow(nh, 30) + 0.06 * graze;
    }
    if (s === 'white') {
      const d = Math.max((nk + 0.3) / 1.3, 0), f = Math.max(nf, 0);
      return 0.75 * d * d + 0.22 * f + 0.3 + 0.06 * up + 0.14 * Math.pow(nh, 40) + 0.05 * graze;
    }
    // soft clay: steep key (the two sides of a ridge part clearly), a third-strength fill, warm/cool ambient, low sheen, cool rim lower right
    const k = Math.max(nk * 0.92 + 0.08, 0), d = Math.pow(k, 2.4), f = Math.max((nf + 0.25) / 1.25, 0);
    const len = Math.hypot(x, y), side = len > 1e-4 ? Math.min(1, Math.max(0, (x * 0.8 - y * 0.6) / len)) : 0;
    const sheen = (0.03 * Math.pow(nh, 8) + 0.09 * Math.pow(nh, 30)) * Math.min(1, k * 3);
    return 1.3 * d + 0.3 * f * f + (0.13 - 0.05 * Math.sqrt(up)) + sheen + (0.05 + 0.2 * side) * graze;
  }
  function zsMatcap(style) {
    const N = 256, px = new Uint8Array(N * N * 4), tint = style === 'clay' ? [1, 0.985, 0.96] : [1, 1, 1];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      let x = ((c + 0.5) / N - 0.5) / 0.495, y = ((r + 0.5) / N - 0.5) / 0.495;
      const q = x * x + y * y;
      if (q > 1) { const l = Math.sqrt(q); x /= l; y /= l; }
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y)), Lv = zsLight(style, x, y, z), o = 4 * (r * N + c);
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, Lv * tint[k])), 1 / 2.2));
      px[o + 3] = 255;
    }
    return px;
  }

  const ZS_VS = '#version 300 es\nin vec3 aPos;in vec3 aNor;uniform mat4 uM;uniform mat3 uR;uniform vec3 uT;uniform vec3 uS;uniform mat3 uN;out vec3 vV;out vec3 vW;out vec3 vN;' +
    'void main(){vec3 w=(uM*vec4(aPos,1.0)).xyz;vec3 v=uR*(w-uT);vW=w;vV=v;vN=uR*(uN*aNor);gl_Position=vec4(v.x*uS.x,v.y*uS.y,v.z*uS.z,1.0);}';
  const ZS_FS = '#version 300 es\nprecision highp float;in vec3 vV;in vec3 vW;in vec3 vN;uniform vec4 uColor;uniform float uSel;uniform vec4 uClip;uniform float uClipOn;' +
    'uniform sampler2D uMat;uniform mat3 uLR;uniform vec3 uClay;uniform float uTint;uniform vec2 uLev;uniform int uOut;out vec4 o;' +
    'void main(){if(uClipOn>0.5&&dot(uClip.xyz,vW)>uClip.w)discard;' +
    'vec3 fn=normalize(cross(dFdx(vV),dFdy(vV)));vec3 n=vN;float ln=length(n);n=ln>1e-6?n/ln:fn;' +
    'if(dot(n,fn)<0.0)n=-n;if(n.z<0.03)n=normalize(n+vec3(0.0,0.0,0.03-n.z));' +
    'bool cap=uClipOn>0.5&&!gl_FrontFacing;' +
    'if(uOut==1){vec3 m=cap?vec3(0.0,0.0,1.0):n;vec3 L=uLR*vec3(' + ZS_KEY.join(',') + ');o=vec4(m*0.5+0.5,0.5+0.5*dot(m,L));return;}' +
    'vec3 base=uSel>2.5?vec3(0.18,0.78,1.0):uSel>1.5?vec3(1.0,0.3,0.2):uSel>0.5?vec3(1.0,0.55,0.06):uColor.rgb;' +
    'if(cap){o=vec4(base*0.45+vec3(0.16,0.03,0.03),uColor.a);return;}' +
    'float t=uSel>0.5?max(uTint,0.85):uTint;vec3 alb=mix(uClay,min(base*1.12,vec3(1.0)),t);' +
    'vec3 l=transpose(uLR)*n;vec3 mc=texture(uMat,l.xy*0.495+0.5).rgb*uLev.x+uLev.y;' +
    'o=vec4(min(mc*alb,vec3(1.0)),uColor.a);}';
  const ZS_QVS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  // half resolution: r = ambient occlusion, g = cast shadow, ba = the depth (packed) for the upsampling
  const ZS_OFS = '#version 300 es\nprecision highp float;uniform highp sampler2D uDep;uniform sampler2D uNrm;uniform vec3 uS;uniform vec2 uFull;' +
    'uniform float uR;uniform float uShL;uniform float uShSoft;uniform float uThick;uniform vec3 uL;uniform int uAo;uniform int uSh;out vec4 o;' +
    'float dAt(ivec2 q){return texelFetch(uDep,clamp(q,ivec2(0),ivec2(uFull)-1),0).r;}' +
    'vec3 posAt(ivec2 q,float d){vec2 c=(vec2(q)+0.5)/uFull*2.0-1.0;return vec3(c.x/uS.x,c.y/uS.y,(2.0*d-1.0)/uS.z);}' +
    'vec2 toPx(vec3 P){return (vec2(P.x*uS.x,P.y*uS.y)*0.5+0.5)*uFull;}' +
    'vec2 pk(float z){float x=clamp(z,0.0,1.0)*255.0;return vec2(floor(x)/255.0,fract(x));}' +
    'void main(){ivec2 p=ivec2(gl_FragCoord.xy)*2;float d=dAt(p);if(d>=1.0){o=vec4(0.0,0.0,1.0,1.0);return;}' +
    'vec3 P=posAt(p,d);vec4 nt=texelFetch(uNrm,p,0);vec3 n=normalize(nt.xyz*2.0-1.0);float facing=nt.a*2.0-1.0;' +
    'float px=2.0/(uS.y*uFull.y);float nz=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));' +
    'float ao=0.0;if(uAo==1){float rp=clamp(uR,3.0,0.15*uFull.y);float r=rp*px;float r2=r*r;' +
    'for(int i=0;i<16;i++){float a=(float(i)+0.5)/16.0;float ang=float(i)*2.39996+nz*6.2831853;vec2 of=vec2(cos(ang),sin(ang))*rp*sqrt(a);' +
    'ivec2 q=p+ivec2(of);float dq=dAt(q);if(dq>=1.0)continue;vec3 v=posAt(q,dq)-P;float vv=dot(v,v);' +
    'float cs=(dot(v,n)-0.03*r)/sqrt(vv+1e-12)-0.12;ao+=max(cs,0.0)*max(1.0-vv/r2,0.0);}' +
    'ao=clamp((ao*4.2/16.0-0.05)/0.95,0.0,1.0);}' +
    'float sh=0.0;if(uSh==1&&facing>-0.25){vec3 t1=normalize(abs(uL.z)<0.9?cross(uL,vec3(0.0,0.0,1.0)):cross(uL,vec3(1.0,0.0,0.0)));vec3 t2=cross(uL,t1);' +
    'for(int k=0;k<3;k++){float u=fract(nz+float(k)/3.0);float ang=u*6.2831853;float sp=uShSoft*0.18*sqrt((float(k)+0.5)/3.0);' +
    'vec3 L=normalize(uL+(t1*cos(ang)+t2*sin(ang))*sp);vec3 st=P+n*(px*2.0)+L*px;float jt=fract(nz*7.13+float(k)*0.618);' +
    'for(int i=0;i<20;i++){float t=(float(i)+jt)/20.0;vec3 Q=st+L*(t*t*uShL+px*float(i));vec2 s=toPx(Q);' +
    'if(any(lessThan(s,vec2(0.0)))||any(greaterThanEqual(s,uFull)))break;ivec2 q=ivec2(s);float dq=dAt(q);if(dq>=1.0)continue;' +
    'float dz=posAt(q,dq).z-Q.z;if(dz>px*2.0+0.04*distance(Q,P)&&dz<uThick){sh+=(1.0-smoothstep(0.75,1.0,t))/3.0;break;}}}' +
    'sh*=smoothstep(-0.25,0.3,facing);}' +
    'o=vec4(ao,sh,pk(d));}';
  // full resolution: the occlusion brought up (depth aware), screen-space cavity from the normals, multiplied into the picture (2·src·dst)
  const ZS_CFS = '#version 300 es\nprecision highp float;uniform highp sampler2D uDep;uniform sampler2D uNrm;uniform sampler2D uOcc;uniform vec4 uK;uniform float uCk;uniform float uGap;out vec4 o;' +
    'float up(vec2 v){return (v.x*255.0+v.y)/255.0;}' +
    'vec3 nAt(ivec2 q,vec3 n0,float d0){ivec2 s=textureSize(uDep,0);q=clamp(q,ivec2(0),s-1);float d=texelFetch(uDep,q,0).r;' +
    'if(d>=1.0||abs(d-d0)>uGap)return n0;return texelFetch(uNrm,q,0).xyz*2.0-1.0;}' +
    'void main(){ivec2 p=ivec2(gl_FragCoord.xy);float d=texelFetch(uDep,p,0).r;if(d>=1.0)discard;' +
    'vec2 h=(vec2(p)+0.5)*0.5-0.5;ivec2 b=ivec2(floor(h));vec2 f=h-floor(h);ivec2 hs=textureSize(uOcc,0);vec2 s=vec2(0.0);float ws=0.0;' +
    'for(int j=-1;j<=2;j++)for(int i=-1;i<=2;i++){vec4 t=texelFetch(uOcc,clamp(b+ivec2(i,j),ivec2(0),hs-1),0);vec2 dd=vec2(float(i),float(j))-f;' +
    'float w=exp(-dot(dd,dd)*0.55)/(abs(up(t.ba)-d)*900.0+0.02);s+=t.rg*w;ws+=w;}' +
    'vec2 oc=s/max(ws,1e-6);' +
    'vec3 n0=texelFetch(uNrm,p,0).xyz*2.0-1.0;float cv=0.0;' +
    'for(int k=1;k<=2;k++){int e=max(1,int(uCk*float(k*k)));' +
    'vec3 r=nAt(p+ivec2(e,0),n0,d),l=nAt(p-ivec2(e,0),n0,d),u=nAt(p+ivec2(0,e),n0,d),w=nAt(p-ivec2(0,e),n0,d);cv+=(r.x-l.x)+(u.y-w.y);}' +
    'cv*=0.5;float rid=smoothstep(0.04,0.55,cv);float val=smoothstep(0.04,0.55,-cv);' +
    'float fct=(1.0-uK.x*oc.x)*(1.0-uK.y*oc.y)*(1.0-uK.z*val*0.85)*(1.0+uK.w*rid*0.55);' +
    'o=vec4(vec3(clamp(fct,0.0,2.0)*0.5),1.0);}';

  function zsProgram(vs, fs, names, attrs) {
    const mk = function (type, s) { const sh = gl.createShader(type); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn('zs shader', gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    (attrs || []).forEach(function (a, i) { gl.bindAttribLocation(p, i, a); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('zs link', gl.getProgramInfoLog(p)); return null; }
    const u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u };
  }
  // GL objects, made on first use; ZG.bad = could not be made (fall back to the flat shading)
  function zsGL() {
    if (ZG) return ZG.bad ? null : ZG;
    ZG = { bad: true };
    if (!gl) return null;
    const m = zsProgram(ZS_VS, ZS_FS, ['uM', 'uR', 'uT', 'uS', 'uN', 'uColor', 'uSel', 'uClip', 'uClipOn', 'uMat', 'uLR', 'uClay', 'uTint', 'uLev', 'uOut'], ['aPos', 'aNor']);
    const oc = zsProgram(ZS_QVS, ZS_OFS, ['uDep', 'uNrm', 'uS', 'uFull', 'uR', 'uShL', 'uShSoft', 'uThick', 'uL', 'uAo', 'uSh']);
    const cp = zsProgram(ZS_QVS, ZS_CFS, ['uDep', 'uNrm', 'uOcc', 'uK', 'uCk', 'uGap']);
    if (!m || !oc || !cp) return null;
    ZG = { bad: false, m: m, oc: oc, cp: cp, quad: gl.createVertexArray(), mat: gl.createTexture(), matKey: '', w: 0, h: 0, fb: null, nrm: null, dep: null, fbO: null, occ: null };
    return ZG;
  }
  function zsTex(t, w, h, ifmt, fmt, type, filt) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function zsTargets(G, w, h) {
    if (G.w === w && G.h === h && G.fb) return true;
    if (G.fb) { gl.deleteFramebuffer(G.fb); gl.deleteFramebuffer(G.fbO); gl.deleteTexture(G.nrm); gl.deleteTexture(G.dep); gl.deleteTexture(G.occ); }
    G.w = w; G.h = h;
    G.nrm = gl.createTexture(); zsTex(G.nrm, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    G.dep = gl.createTexture(); zsTex(G.dep, w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    G.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, G.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.nrm, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, G.dep, 0);
    const ok1 = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    G.ow = Math.max(1, w >> 1); G.oh = Math.max(1, h >> 1);
    G.occ = gl.createTexture(); zsTex(G.occ, G.ow, G.oh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    G.fbO = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.occ, 0);
    const ok2 = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    G.ok = ok1 && ok2;
    return G.ok;
  }

  // ---- per geometry: corner normals smoothed between faces closer than the smoothing angle (sharp CAD edges stay sharp) ----
  function zsBuild(g, angDeg) {
    const P = g.positions, I = g.indices, nt = I.length / 3, nv = P.length / 3;
    // weld coincident points first (an STL soup has every triangle on its own vertices)
    let wid = null, nw = nv;
    if (nv > nt * 2.2) {
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { const v = P[3 * i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
      const q = Math.max(1e-9, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 1e-7), map = new Map();
      wid = new Uint32Array(nv); nw = 0;
      for (let i = 0; i < nv; i++) {
        const key = Math.round(P[3 * i] / q) + ',' + Math.round(P[3 * i + 1] / q) + ',' + Math.round(P[3 * i + 2] / q);
        let w = map.get(key);
        if (w === undefined) { w = nw++; map.set(key, w); }
        wid[i] = w;
      }
    }
    const W = function (i) { return wid ? wid[i] : i; };
    const fn = new Float32Array(nt * 3), fu = new Float32Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
      fn[3 * t] = x; fn[3 * t + 1] = y; fn[3 * t + 2] = z; fu[3 * t] = x / l; fu[3 * t + 1] = y / l; fu[3 * t + 2] = z / l;
    }
    const cnt = new Uint32Array(nw + 1);
    for (let i = 0; i < nt * 3; i++) cnt[W(I[i]) + 1]++;
    for (let i = 0; i < nw; i++) cnt[i + 1] += cnt[i];
    const adj = new Uint32Array(nt * 3), fill = cnt.slice(0, nw);
    for (let i = 0; i < nt * 3; i++) adj[fill[W(I[i])]++] = (i / 3) | 0;
    const cosA = Math.cos(Math.min(89.9, Math.max(0, angDeg)) * Math.PI / 180), smooth = angDeg > 0.5;
    const pos = new Float32Array(nt * 9), nor = new Int8Array(nt * 9);
    for (let t = 0; t < nt; t++) {
      const tx = fu[3 * t], ty = fu[3 * t + 1], tz = fu[3 * t + 2];
      for (let k = 0; k < 3; k++) {
        const vi = I[3 * t + k], o = 9 * t + 3 * k;
        pos[o] = P[3 * vi]; pos[o + 1] = P[3 * vi + 1]; pos[o + 2] = P[3 * vi + 2];
        let x = tx, y = ty, z = tz;
        if (smooth) {
          x = 0; y = 0; z = 0;
          const w = W(vi);
          for (let j = cnt[w]; j < cnt[w + 1]; j++) {
            const f = adj[j];
            if (fu[3 * f] * tx + fu[3 * f + 1] * ty + fu[3 * f + 2] * tz >= cosA) { x += fn[3 * f]; y += fn[3 * f + 1]; z += fn[3 * f + 2]; }
          }
          const l = Math.hypot(x, y, z);
          if (l > 1e-20) { x /= l; y /= l; z /= l; } else { x = tx; y = ty; z = tz; }
        }
        nor[o] = Math.round(x * 127); nor[o + 1] = Math.round(y * 127); nor[o + 2] = Math.round(z * 127);
      }
    }
    return { pos: pos, nor: nor, count: nt * 3 };
  }
  function zsFree(g) {
    const z = g && g.zs;
    if (!z || !gl) return;
    gl.deleteVertexArray(z.vao); gl.deleteBuffer(z.pb); gl.deleteBuffer(z.nb);
    g.zs = null;
  }
  function zsGeo(g) {
    let z = g.zs;
    if (z && z.ang === zsSmoothEff && z.ref === g.gl && z.n === g.indices.length) return z;
    zsFree(g);
    const d = zsBuild(g, zsSmoothEff);
    z = { vao: gl.createVertexArray(), pb: gl.createBuffer(), nb: gl.createBuffer(), count: d.count, ang: zsSmoothEff, ref: g.gl, n: g.indices.length };
    gl.bindVertexArray(z.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, z.pb); gl.bufferData(gl.ARRAY_BUFFER, d.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, z.nb); gl.bufferData(gl.ARRAY_BUFFER, d.nor, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 0, 0);
    gl.bindVertexArray(null);
    g.zs = z;
    return z;
  }

  function zsActive() { return !!(ZS.on && gl && zsGL()); }
  function zsLR() {   // light turn (view space): yaw about the view's up axis, then pitch about its right axis — column major
    const a = ZS.yaw * Math.PI / 180, b = ZS.pitch * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    // R = Ry(a) · Rx(b)
    const R = [ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb];   // rows
    return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  }
  function zsLight3() { const m = zsLR(), K = ZS_KEY; return [m[0] * K[0] + m[3] * K[1] + m[6] * K[2], m[1] * K[0] + m[4] * K[1] + m[7] * K[2], m[2] * K[0] + m[5] * K[1] + m[8] * K[2]]; }
  function zsNormalMat(m) {   // cofactor matrix of the upper 3x3 (= inverse transpose up to a positive scale), column major
    const a = function (r, c) { return m[c * 4 + r]; };
    const C = [
      a(1, 1) * a(2, 2) - a(1, 2) * a(2, 1), -(a(1, 0) * a(2, 2) - a(1, 2) * a(2, 0)), a(1, 0) * a(2, 1) - a(1, 1) * a(2, 0),
      -(a(0, 1) * a(2, 2) - a(0, 2) * a(2, 1)), a(0, 0) * a(2, 2) - a(0, 2) * a(2, 0), -(a(0, 0) * a(2, 1) - a(0, 1) * a(2, 0)),
      a(0, 1) * a(1, 2) - a(0, 2) * a(1, 1), -(a(0, 0) * a(1, 2) - a(0, 2) * a(1, 0)), a(0, 0) * a(1, 1) - a(0, 1) * a(1, 0)];
    const det = a(0, 0) * C[0] + a(0, 1) * C[1] + a(0, 2) * C[2], s = det < 0 ? -1 : 1;
    return [C[0] * s, C[3] * s, C[6] * s, C[1] * s, C[4] * s, C[7] * s, C[2] * s, C[5] * s, C[8] * s];
  }
  // switch to the MatCap program and set what is the same for every body this frame
  function zsBegin(out) {
    const G = zsGL(), u = G.m.u, R = cam.R;
    gl.useProgram(G.m.p);
    if (G.matKey !== ZS.mat) {
      G.matKey = ZS.mat;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.mat);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, zsMatcap(ZS.mat));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.mat); gl.uniform1i(u.uMat, 0);
    gl.uniformMatrix3fv(u.uR, false, [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
    gl.uniform3f(u.uT, cam.target[0], cam.target[1], cam.target[2]);
    gl.uniform3f(u.uS, 1 / (cam.zoom * cam.w / H), 1 / cam.zoom, -1 / depthRange());
    gl.uniformMatrix3fv(u.uLR, false, zsLR());
    const M = ZS_MATS[ZS.mat] || ZS_MATS.clay;
    gl.uniform3f(u.uClay, M.alb[0], M.alb[1], M.alb[2]);
    gl.uniform1f(u.uTint, ZS.tint / 100);
    gl.uniform2f(u.uLev, ZS.light / 100, ZS.amb / 100 * 0.35);
    gl.uniform1i(u.uOut, out ? 1 : 0);
    gl.uniform1f(u.uClipOn, clipOn() ? 1 : 0);
    const cp = clipPlane();
    gl.uniform4f(u.uClip, cp[0], cp[1], cp[2], cp[3]);
  }
  function zsDraw(b, alpha, sel) {
    const u = ZG.m.u, z = zsGeo(b.geo), m = dispMatrix(b);
    gl.uniformMatrix4fv(u.uM, false, m);
    gl.uniformMatrix3fv(u.uN, false, zsNormalMat(m));
    gl.uniform4f(u.uColor, b.color[0] / 255, b.color[1] / 255, b.color[2] / 255, alpha);
    gl.uniform1f(u.uSel, sel);
    gl.bindVertexArray(z.vao); gl.drawArrays(gl.TRIANGLES, 0, z.count);
  }
  // the filled body in drawBody (the caller's program is set back afterwards)
  function zsFill(b, alpha, sel) {
    zsBegin(false); zsDraw(b, alpha, sel);
    gl.useProgram(prog);
  }
  const zsPostOn = function () { return zsActive() && (ZS.ao > 0 || ZS.sh > 0 || ZS.cav > 0 || ZS.ridge > 0); };
  // pass 1: normals + depth of the opaque bodies into a texture
  function zsPrepass(list, pw, ph) {
    const G = zsGL();
    if (!G || !list.length || !zsTargets(G, pw, ph)) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fb);
    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0.5, 0.5, 1, 0.5); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    zsBegin(true);
    for (const b of list) { gl.frontFace(M.det3(b.matrix) < 0 ? gl.CW : gl.CCW); zsDraw(b, 1, 0); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(prog);
    return true;
  }
  // passes 2-3: occlusion at half size, then multiplied into what is drawn
  function zsComposite(pw, ph) {
    const G = ZG, dpr = window.devicePixelRatio || 1;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindVertexArray(G.quad);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.dep);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.nrm);
    const uS = [1 / (cam.zoom * cam.w / H), 1 / cam.zoom, -1 / depthRange()], rad = mainCam.radius || 1;
    if (ZS.ao > 0 || ZS.sh > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbO); gl.viewport(0, 0, G.ow, G.oh);
      const u = G.oc.u, L = zsLight3();
      gl.useProgram(G.oc.p);
      gl.uniform1i(u.uDep, 1); gl.uniform1i(u.uNrm, 2);
      gl.uniform3f(u.uS, uS[0], uS[1], uS[2]); gl.uniform2f(u.uFull, pw, ph);
      gl.uniform1f(u.uR, ZS.aoR * dpr);
      gl.uniform1f(u.uShL, rad * ZS.shL / 100 * 1.6); gl.uniform1f(u.uShSoft, ZS.shSoft / 100); gl.uniform1f(u.uThick, rad * 0.5);
      gl.uniform3f(u.uL, L[0], L[1], L[2]);
      gl.uniform1i(u.uAo, ZS.ao > 0 ? 1 : 0); gl.uniform1i(u.uSh, ZS.sh > 0 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbO); gl.viewport(0, 0, G.ow, G.oh);
      gl.clearColor(0, 0, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, pw, ph);
    const u = G.cp.u;
    gl.useProgram(G.cp.p);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.occ);
    gl.uniform1i(u.uDep, 1); gl.uniform1i(u.uNrm, 2); gl.uniform1i(u.uOcc, 3);
    gl.uniform4f(u.uK, ZS.ao / 100, ZS.sh / 100, ZS.cav / 100, ZS.ridge / 100);
    gl.uniform1f(u.uCk, Math.max(1, dpr));
    // two neighbours further apart in depth than a ~75° slope over 6 px are different surfaces (no cavity across them)
    const pxW = 2 * cam.zoom / ph;
    gl.uniform1f(u.uGap, pxW * 6 * 4 / (2 * depthRange()));
    gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR); gl.colorMask(true, true, true, false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.colorMask(true, true, true, true); gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.useProgram(prog);
  }

  // ---- Settings ▸ 3D view panel ----
  const ZS_ROWS = [
    ['tint', 'Màu body', 'Body colour', 0, 100, 1, '%', 'Trộn màu đất sét (0) với màu riêng của body (100)', 'Blend the clay colour (0) with the body\'s own colour (100)'],
    ['light', 'Cường độ đèn', 'Light', 30, 200, 1, '%', 'Độ sáng của ảnh MatCap', 'Brightness of the MatCap'],
    ['amb', 'Ánh sáng nền', 'Ambient', 0, 100, 1, '%', 'Nâng vùng tối, không đổi hướng đèn', 'Lifts the dark side, light direction unchanged'],
    ['yaw', 'Xoay đèn ngang', 'Light turn', -180, 180, 1, '°', 'Xoay hướng đèn quanh trục đứng của màn hình', 'Turns the light about the screen\'s vertical axis'],
    ['pitch', 'Xoay đèn dọc', 'Light tilt', -90, 90, 1, '°', 'Nghiêng đèn lên / xuống', 'Tilts the light up / down'],
    ['smooth', 'Góc làm mượt', 'Smoothing angle', 0, 90, 1, '°', 'Hai mặt kề lệch nhau ít hơn góc này thì bóng mượt qua cạnh; 0 = giữ mặt phẳng từng tam giác', 'Neighbouring faces closer than this shade smoothly across the edge; 0 = flat triangles'],
    ['cav', 'Cavity rãnh', 'Cavity (creases)', 0, 100, 1, '%', 'Làm tối rãnh, khe, chân gờ (theo pháp tuyến trên màn hình)', 'Darkens creases, slots, inner corners (from the on-screen normals)'],
    ['ridge', 'Cavity gờ', 'Cavity (ridges)', 0, 100, 1, '%', 'Làm sáng mép lồi, gờ', 'Brightens convex edges and ridges'],
    ['ao', 'AO', 'AO', 0, 100, 1, '%', 'Ambient occlusion: tối dần ở góc trong, sát chân vách', 'Ambient occlusion: darkens inner corners and wall feet'],
    ['aoR', 'Bán kính AO', 'AO radius', 2, 60, 1, 'px', 'Bán kính vùng AO trên màn hình', 'On-screen radius of the AO'],
    ['sh', 'Bóng đổ', 'Cast shadow', 0, 100, 1, '%', 'Độ tối của bóng đổ theo hướng đèn', 'Darkness of the shadow cast from the light'],
    ['shL', 'Độ dài bóng', 'Shadow length', 5, 100, 1, '%', 'Bóng dài tối đa, theo cỡ mô hình', 'Longest shadow, relative to the model size'],
    ['shSoft', 'Độ mềm bóng', 'Shadow softness', 0, 100, 1, '%', 'Mép bóng mềm hay sắc', 'Soft or hard shadow edge']
  ];
  function zsSync() {
    const p = $('zsPanel');
    if (!p) return;
    $('zsOn').checked = ZS.on; $('zsMat').value = ZS.mat;
    ZS_ROWS.forEach(function (r) { const k = r[0]; $('zsR_' + k).value = ZS[k]; $('zsN_' + k).value = ZS[k]; });
    p.classList.toggle('off', !ZS.on);
    p.querySelectorAll('.zsr input, .zsr select').forEach(function (el) { el.disabled = !ZS.on; });
  }
  function zsSet(k, v) {
    if (k === 'on') ZS.on = !!v;
    else if (k === 'mat') ZS.mat = ZS_MATS[v] ? v : 'clay';
    else {
      const r = ZS_ROWS.find(function (x) { return x[0] === k; });
      if (!r || !isFinite(+v)) return;
      ZS[k] = Math.max(r[3], Math.min(r[4], Math.round(+v / r[5]) * r[5]));
      if (k === 'smooth') {   // rebuilding the normals of a big mesh on every tick of the slider would stall it
        clearTimeout(zsSmoothT);
        zsSmoothT = setTimeout(function () { zsSmoothEff = ZS.smooth; dirty = true; }, 250);
      }
    }
    zsSave(); zsSync(); dirty = true;
  }
  function zsBuildPanel() {
    const p = $('zsPanel');
    if (!p || p.dataset.built) return;
    p.dataset.built = '1';
    let h = '<div class="row"><label title="Bóng kiểu MatCap + cavity + AO + bóng đổ (như ZBrush). Tắt = hiển thị phẳng như cũ" data-en-title="MatCap + cavity + AO + cast shadow shading (sculpting style). Off = the old flat shading">' +
      '<input type="checkbox" id="zsOn"> <span data-en="Sculpt-style 3D shading">Hiển thị 3D kiểu ZBrush</span></label></div>';
    h += '<div class="row zsr" title="Ảnh MatCap: kiểu ánh sáng chiếu lên vật" data-en-title="MatCap: how the light falls on the model"><span class="lbl" data-en="Material">Vật liệu</span><select id="zsMat" style="width:150px">';
    for (const k in ZS_MATS) h += '<option value="' + k + '" data-en="' + ZS_MATS[k].en + '">' + ZS_MATS[k].vi + '</option>';
    h += '</select></div>';
    ZS_ROWS.forEach(function (r) {
      h += '<div class="row zsr" title="' + r[7] + '" data-en-title="' + r[8].replace(/"/g, '&quot;') + '"><span class="lbl" data-en="' + r[2] + '">' + r[1] + '</span>' +
        '<input type="range" id="zsR_' + r[0] + '" min="' + r[3] + '" max="' + r[4] + '" step="' + r[5] + '">' +
        '<input type="number" class="s" id="zsN_' + r[0] + '" min="' + r[3] + '" max="' + r[4] + '" step="' + r[5] + '"><span class="unit">' + r[6] + '</span></div>';
    });
    h += '<div class="btns"><button id="zsReset" data-en="Back to defaults">Về mặc định</button></div>';
    p.innerHTML = h;
    $('zsOn').addEventListener('change', function () { zsSet('on', this.checked); });
    $('zsMat').addEventListener('change', function () { zsSet('mat', this.value); });
    ZS_ROWS.forEach(function (r) {
      $('zsR_' + r[0]).addEventListener('input', function () { zsSet(r[0], this.value); });
      $('zsN_' + r[0]).addEventListener('change', function () { zsSet(r[0], this.value); });
    });
    $('zsReset').addEventListener('click', function () { const on = ZS.on; ZS = zsDefaults(); ZS.on = on; zsSmoothEff = ZS.smooth; zsSave(); zsSync(); dirty = true; });
    zsSync();
  }
  function zsTab(k) {
    document.querySelectorAll('#setTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); });
    document.querySelectorAll('#setdlg .setPg').forEach(function (d) { d.style.display = d.dataset.k === k ? '' : 'none'; });
  }
  document.querySelectorAll('#setTabs button').forEach(function (b) { b.addEventListener('click', function () { zsTab(b.dataset.k); }); });
  zsBuildPanel(); zsTab('view');
