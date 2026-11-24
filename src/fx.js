  // ---------- drawing effects (Drawing Workspace, Effects tab): run on the depth picture of each view after it is drawn
  // Depth step lines: a line where the depth jumps, put on the lower (farther) side and thicker for a higher step, so
  // two faces at different heights with the same normal are told apart and the reader sees which one is lower.
  // Step band: a soft dark band on the lower face along the foot of the step. Part outline: a line where one body meets
  // another (body number picture). Ambient occlusion, shadow (light fixed to the screen, so every view is lit alike) and
  // curvature shading complete the picture.
  // All passes are WebGL2 full-screen passes; the last one is drawn and read back in tiles so no single GPU job runs long.
  const FX_VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  // depth picture (uDep) is uploaded top-down; pictures drawn by the GPU (uE, uB, uId, uN) are bottom-up: F() converts
  const FX_HD = '#version 300 es\nprecision highp float;precision highp int;uniform sampler2D uDep;uniform ivec2 uSz;uniform float uDR,uThr;out vec4 o;\n' +
    'ivec2 P(){return ivec2(int(gl_FragCoord.x),uSz.y-1-int(gl_FragCoord.y));}\n' +
    'ivec2 C(ivec2 q){return clamp(q,ivec2(0),uSz-1);}\n' +
    'ivec2 F(ivec2 q){q=C(q);return ivec2(q.x,uSz.y-1-q.y);}\n' +
    'bool IN(ivec2 q){return q.x>=0&&q.y>=0&&q.x<uSz.x&&q.y<uSz.y;}\n' +
    'float D(ivec2 q){return texelFetch(uDep,C(q),0).r;}\n' +
    'bool BG(float d){return d>0.9999;}\n';
  // pass 1: per pixel, is it the lower side of a depth step (r = line width / 48 px, g = step height, log scale; g = 1:
  // background next to the object) and is it on a body boundary (b)
  const FX_EDGE = FX_HD + 'uniform sampler2D uId;uniform float uW;uniform int uIdOn;\n' +
    'int I(ivec2 q){vec4 c=texelFetch(uId,F(q),0);return int(c.r*255.0+0.5)+256*int(c.g*255.0+0.5);}\n' +
    'void main(){ivec2 p=P();float dp=D(p);bool bp=BG(dp);float w=0.0,jm=0.0,idb=0.0;int ip=uIdOn==1?I(p):0;\n' +
    'ivec2 S[4]=ivec2[4](ivec2(1,0),ivec2(-1,0),ivec2(0,1),ivec2(0,-1));\n' +
    'for(int k=0;k<4;k++){ivec2 s=S[k],q=p+s;if(!IN(q))continue;float dq=D(q);if(BG(dq))continue;\n' +
    ' if(uIdOn==1&&!bp){int iq=I(q);if(iq!=ip&&iq>0&&ip>0)idb=1.0;}\n' +
    ' float j;if(bp)j=1e6;else{float da=D(p-s);if(BG(da)||!IN(p-s))da=dp;j=((2.0*dp-da)-dq)*uDR;}\n' +
    ' if(j>uThr){jm=max(jm,j);if(uW>0.0){float f=clamp(0.6+0.2*log2(j/uThr),0.6,1.8);w=max(w,max(uW*f,0.8));}}}\n' +
    'float g=jm>0.0?(bp?1.0:clamp(log2(jm/uThr)/12.0,0.0,0.99)):0.0;o=vec4(min(w/48.0,1.0),g,idb,jm>0.0&&!bp?1.0:0.0);}';
  // pass 2: 8 x 8 blocks of pass 1, so the last pass looks for lines only near one
  const FX_BLK = '#version 300 es\nprecision highp float;precision highp int;uniform sampler2D uE;out vec4 o;\n' +
    'void main(){ivec2 b=ivec2(gl_FragCoord.xy)*8,s=textureSize(uE,0);vec4 m=vec4(0.0);\n' +
    'for(int y=0;y<8;y++)for(int x=0;x<8;x++){ivec2 q=b+ivec2(x,y);if(q.x<s.x&&q.y<s.y)m=max(m,texelFetch(uE,q,0));}o=m;}';
  // pass 3: the picture with the effects
  const FX_OUT = FX_HD + 'uniform sampler2D uE,uB,uBB,uCol,uN;uniform float uRad,uIdW,uBw,uBs,uS2,uAr,uAs,uCs,uCo,uSs;uniform vec3 uLc,uL;\n' +
    'float h1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\n' +
    'vec3 N(ivec2 q){vec3 n=texelFetch(uN,F(q),0).xyz*2.0-1.0;return n;}\n' +
    // one-sided depth slope (the smaller one, so a step next to the pixel does not tilt its plane)
    'float G1(ivec2 p,ivec2 s,float dp){float a=D(p+s),b=D(p-s);bool ia=IN(p+s)&&!BG(a),ib=IN(p-s)&&!BG(b);' +
    'if(ia&&ib){float u=a-dp,v=dp-b;return abs(u)<abs(v)?u:v;}if(ia)return a-dp;if(ib)return dp-b;return 0.0;}\n' +
    'bool NEAR(sampler2D t,int sz,float r,ivec2 p,bool st){ivec2 g0=F(p)/sz,bs=textureSize(t,0);int RB=int(ceil(r/float(sz)))+1;\n' +
    ' for(int by=-RB;by<=RB;by++)for(int bx=-RB;bx<=RB;bx++){ivec2 b=g0+ivec2(bx,by);if(b.x<0||b.y<0||b.x>=bs.x||b.y>=bs.y)continue;vec4 v=texelFetch(t,b,0);if(st?v.a>0.0:(v.r>0.0||v.b>0.0))return true;}return false;}\n' +
    'void main(){ivec2 p=P();float dp=D(p);bool bp=BG(dp);vec4 col=texelFetch(uCol,C(p),0);vec3 c=col.rgb;float cov=0.0;\n' +
    'int R=int(ceil(uRad));\n' +
    'if(R>0&&NEAR(uB,8,uRad,p,false)){\n' +
    ' for(int dy=-R;dy<=R;dy++)for(int dx=-R;dx<=R;dx++){float dd=length(vec2(dx,dy));if(dd>uRad+0.5)continue;ivec2 q=p+ivec2(dx,dy);if(!IN(q))continue;vec4 e=texelFetch(uE,F(q),0);\n' +
    '  if(e.r>0.0){float w=e.r*48.0;if(dd<=w+0.5){bool ok=e.g>=0.995?bp:(!bp&&dp>D(q)-0.5*uThr*exp2(e.g*12.0)/uDR);if(ok)cov=max(cov,clamp(w+0.5-dd,0.0,1.0));}}\n' +
    '  if(e.b>0.0&&!bp){float hw=max(uIdW*0.5,0.5);if(dd<=hw+0.5)cov=max(cov,clamp(hw+0.5-dd,0.0,1.0));}}}\n' +
    'if(!bp){vec2 gr=vec2(G1(p,ivec2(1,0),dp),G1(p,ivec2(0,1),dp));float jt=h1(vec2(p))*6.2831853,jr=h1(vec2(p)+17.3);\n' +
    // step band: the nearest point higher than the pixel's own plane by more than the step threshold darkens it
    ' if(uBs>0.0&&uBw>=1.0&&NEAR(uBB,64,uBw,p,true)){float band=0.0;for(int k=0;k<10;k++){float a=jt+float(k)*0.6283185;vec2 dv=vec2(cos(a),sin(a));\n' +
    '  for(int i=1;i<=8;i++){float t=max(1.0,uBw*(float(i)-jr)/8.0);ivec2 q=p+ivec2(round(dv*t));if(!IN(q))break;float dq=D(q);if(BG(dq))continue;\n' +
    '   float h=(dp+dot(gr,dv*t)-dq)*uDR;if(h>uThr){float v=1.0-t/uBw;v=v*v*(3.0-2.0*v)*mix(0.6,1.0,clamp((h-uThr)/(3.0*uThr),0.0,1.0));band=max(band,v);break;}}}\n' +
    '  c*=1.0-uBs*band;}\n' +
    // ambient occlusion: how much of the hemisphere above the pixel's own plane the nearby surface hides (radius in mm)
    ' if(uAs>0.0&&uAr>=1.0){float ao=0.0;for(int k=0;k<8;k++){float a=jt+float(k)*0.7853982;vec2 dv=vec2(cos(a),sin(a));float m=0.0;\n' +
    '  for(int i=1;i<=8;i++){float t=max(1.0,uAr*(float(i)-jr)/8.0);ivec2 q=p+ivec2(round(dv*t));if(!IN(q))break;float dq=D(q);if(BG(dq))continue;\n' +
    '   float h=(dp+dot(gr,dv*t)-dq)*uDR,dm=t/uS2,sn=h/sqrt(h*h+dm*dm),fo=1.0-(t/uAr)*(t/uAr);m=max(m,(sn-0.1)*fo);}\n' +
    '  ao+=max(m,0.0);}c*=1.0-uAs*clamp(ao/8.0*1.4,0.0,1.0);}\n' +
    // curvature: normals spreading apart (ridge) lighten, closing in (groove) darken; not across a depth step
    ' if(uCs>0.0){ivec2 X=ivec2(int(uCo),0),Y=ivec2(0,int(uCo));float a1=D(p+X),a2=D(p-X),a3=D(p+Y),a4=D(p-Y);\n' +
    '  if(IN(p+X)&&IN(p-X)&&IN(p+Y)&&IN(p-Y)&&!BG(a1)&&!BG(a2)&&!BG(a3)&&!BG(a4)&&max(max(abs(a1-dp),abs(a2-dp)),max(abs(a3-dp),abs(a4-dp)))*uDR<uThr*2.0){\n' +
    '   float cv=(N(p+X).x-N(p-X).x)+(N(p-Y).y-N(p+Y).y);c=clamp(c+vec3(uCs*0.45*clamp(cv*3.0,-1.0,1.0)),0.0,1.0);}}\n' +
    // shadow: light fixed to the screen (uL: x right, y up, z towards the viewer); faces turned away are dark, the rest
    // are dark when a surface rises above the ray walked from the pixel towards the light
    ' if(uSs>0.0){vec3 n=N(p);float shd=1.0-smoothstep(0.0,0.2,dot(n,uL));float lxy=length(uL.xy);\n' +
    '  if(shd<1.0&&lxy>0.01){vec2 dv=vec2(uL.x,-uL.y)/lxy;float hp=-dp*uDR,tm=min(float(max(uSz.x,uSz.y)),uDR/max(uL.z,0.05)*lxy*uS2),bias=max(uThr*0.5,1.5/uS2)+abs(dot(gr,dv))*uDR*2.0;\n' +
    '   for(int i=1;i<=48;i++){float u=(float(i)-jr*0.9)/48.0,t=max(1.5,u*u*tm);ivec2 q=p+ivec2(round(dv*t));if(!IN(q))break;float dq=D(q);if(BG(dq))continue;\n' +
    '    if(-dq*uDR>hp+uL.z*t/(uS2*lxy)+bias){shd=1.0;break;}}}\n' +
    '  c*=1.0-uSs*shd;}\n' +
    '}\n' +
    'o=bp?vec4(uLc,cov):vec4(mix(c,uLc,cov),1.0);}';

  function v6FxProg(G, fs) {
    const g = G.g, sh = function (t, s) { const x = g.createShader(t); g.shaderSource(x, s); g.compileShader(x); if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x)); return x; };
    const p = g.createProgram(); g.attachShader(p, sh(g.VERTEX_SHADER, FX_VS)); g.attachShader(p, sh(g.FRAGMENT_SHADER, fs)); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
    return p;
  }
  function v6FxGL(G) {
    if (G.fx) return G.fx;
    G.fx = { edge: v6FxProg(G, FX_EDGE), blk: v6FxProg(G, FX_BLK), out: v6FxProg(G, FX_OUT), vao: G.g.createVertexArray() };
    return G.fx;
  }
  // any effect switched on
  function v6FxOn(fx) { return !!fx && (fx.w > 0 || (fx.bs > 0 && fx.bw > 0) || fx.id || fx.as > 0 || fx.ss > 0 || fx.cs > 0); }
  function v6FxTex(g, w, h, ifmt, fmt, type, data) {
    const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data || null);
    return t;
  }
  // a = {vw, vh, raw (top-down depth 0..1), rgba (top-down colour picture), dr (depth range mm), S2 (px per model mm),
  // ppx (px per paper mm), tId / tN: GPU pictures of the body numbers / normals (bottom-up), nb (bodies)}
  // returns the new top-down colour picture (Uint8Array), or null when nothing is switched on
  function v6Fx(G, a, fx) {
    if (!v6FxOn(fx)) return null;
    const g = G.g, F = v6FxGL(G), vw = a.vw, vh = a.vh, made = [], fbs = [];
    const tex = function (w, h, i, f, t, d) { const x = v6FxTex(g, w, h, i, f, t, d); made.push(x); return x; };
    const target = function (t) { const f = g.createFramebuffer(); fbs.push(f); g.bindFramebuffer(g.FRAMEBUFFER, f); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t, 0); return f; };
    const U = function (p, n) { return g.getUniformLocation(p, n); };
    const bind = function (p, unit, name, t) { g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t); g.uniform1i(U(p, name), unit); };
    try {
      const idOn = fx.id && a.nb > 1, nOn = fx.ss > 0 || fx.cs > 0;
      // body-number and normal pictures: drawn by the caller in its geometry pass and owned by it
      const tId = idOn ? a.tId : null, tN = nOn ? a.tN : null;
      const tD = tex(vw, vh, g.R32F, g.RED, g.FLOAT, a.raw);
      const tC = tex(vw, vh, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, a.rgba);
      const thr = Math.max(1e-3, fx.t), wl = Math.min(24 / 1.8, fx.w * a.ppx);
      const common = function (p) { g.useProgram(p); bind(p, 0, 'uDep', tD); g.uniform2i(U(p, 'uSz'), vw, vh); g.uniform1f(U(p, 'uDR'), a.dr); g.uniform1f(U(p, 'uThr'), thr); };
      g.disable(g.DEPTH_TEST); g.disable(g.SCISSOR_TEST); g.disable(g.BLEND); g.bindVertexArray(F.vao);
      // pass 1
      const tE = tex(vw, vh, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, null); target(tE); g.viewport(0, 0, vw, vh);
      common(F.edge); g.uniform1f(U(F.edge, 'uW'), wl); g.uniform1i(U(F.edge, 'uIdOn'), tId ? 1 : 0); bind(F.edge, 1, 'uId', tId || tC);
      g.drawArrays(g.TRIANGLES, 0, 3);
      // pass 2
      const bw = Math.ceil(vw / 8), bh = Math.ceil(vh / 8), tB = tex(bw, bh, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, null); target(tB); g.viewport(0, 0, bw, bh);
      g.useProgram(F.blk); bind(F.blk, 0, 'uE', tE); g.drawArrays(g.TRIANGLES, 0, 3);
      const cw = Math.ceil(bw / 8), ch = Math.ceil(bh / 8), tBB = tex(cw, ch, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, null); target(tBB); g.viewport(0, 0, cw, ch);
      bind(F.blk, 0, 'uE', tB); g.drawArrays(g.TRIANGLES, 0, 3);
      // pass 3, in tiles read back one by one
      const tO = tex(vw, vh, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, null); target(tO); g.viewport(0, 0, vw, vh);
      const P = F.out; common(P); bind(P, 1, 'uE', tE); bind(P, 2, 'uB', tB); bind(P, 3, 'uCol', tC); bind(P, 4, 'uN', tN || tC); bind(P, 5, 'uBB', tBB);
      const idw = tId ? Math.max(1, 0.8 * fx.w * a.ppx) : 0;
      g.uniform1f(U(P, 'uRad'), wl > 0 || idw > 0 ? Math.min(24, Math.max(wl * 1.8, idw / 2)) : 0); g.uniform1f(U(P, 'uIdW'), idw);
      g.uniform1f(U(P, 'uBw'), fx.bw * a.ppx); g.uniform1f(U(P, 'uBs'), fx.bw > 0 ? fx.bs : 0); g.uniform1f(U(P, 'uS2'), a.S2);
      g.uniform3fv(U(P, 'uLc'), [0x11 / 255, 0x11 / 255, 0x11 / 255]);
      const sa = fx.sa * Math.PI / 180, se = fx.se * Math.PI / 180;
      g.uniform1f(U(P, 'uAr'), Math.min(256, fx.ar * a.S2)); g.uniform1f(U(P, 'uAs'), fx.as); g.uniform1f(U(P, 'uCs'), fx.cs); g.uniform1f(U(P, 'uCo'), Math.max(1, Math.round(0.12 * a.ppx)));
      g.uniform1f(U(P, 'uSs'), fx.ss); g.uniform3fv(U(P, 'uL'), [Math.cos(se) * Math.cos(sa), Math.cos(se) * Math.sin(sa), Math.sin(se)]);
      const out = new Uint8Array(vw * vh * 4), T = 1024;
      g.enable(g.SCISSOR_TEST);
      for (let ty = 0; ty < vh; ty += T) for (let tx = 0; tx < vw; tx += T) {
        const tw = Math.min(T, vw - tx), th = Math.min(T, vh - ty), buf = new Uint8Array(tw * th * 4);
        g.scissor(tx, ty, tw, th); g.drawArrays(g.TRIANGLES, 0, 3); g.readPixels(tx, ty, tw, th, g.RGBA, g.UNSIGNED_BYTE, buf);
        for (let y = 0; y < th; y++) out.set(buf.subarray(y * tw * 4, (y + 1) * tw * 4), ((vh - 1 - (ty + y)) * vw + tx) * 4);
      }
      g.disable(g.SCISSOR_TEST);
      return out;
    } finally {
      g.bindFramebuffer(g.FRAMEBUFFER, null); g.bindVertexArray(null);
      fbs.forEach(function (f) { g.deleteFramebuffer(f); }); made.forEach(function (t) { g.deleteTexture(t); });
      g.activeTexture(g.TEXTURE0); g.enable(g.DEPTH_TEST);
    }
  }
