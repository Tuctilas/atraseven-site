/**
 * redutor-bg.js | O redutor se monta como FUNDO do site, conforme a rolagem da página.
 * Canvas fixo atrás de todo o conteúdo. Começa no topo girando e, conforme desce,
 * as peças entram pelas laterais/topo e se encaixam — montado por completo perto do fim.
 * Tom suave (verde da marca, baixa opacidade) para não atrapalhar a leitura.
 */
(function () {
  const canvas = document.getElementById("redutor-bg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const ACCENT = "#2e9e7a";          // verde, visível sobre branco
  const BASE = 0.40;                  // opacidade global do fundo
  const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* Cache de gradientes.
     createLinearGradient/createRadialGradient alocam objeto novo a cada
     chamada, e o desenho fazia ~10 por quadro (uma por engrenagem, eixo,
     tampa, motor e carcaça) — 600 alocações por segundo, só para jogar
     fora no quadro seguinte. Como todos dependem apenas da geometria, que
     só muda no resize, ficam guardados aqui. */
  let grads = new Map();
  function grad(chave, criar) {
    let g = grads.get(chave);
    if (!g) { g = criar(); grads.set(chave, g); }
    return g;
  }

  let w = 0, h = 0, dpr = 1;
  function resize() {
    /* Teto de 1.5 em vez de 2: em tela 1920x1080 com dpr 2 o canvas teria
       8,3 megapixels para limpar e repintar a cada quadro. Como o fundo é
       decorativo e de baixa opacidade, 1.5 é indistinguível a olho e corta
       ~45% dos pixels. */
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    grads.clear();       // a geometria mudou; os gradientes velhos não servem
    medirContato();
    precisaDesenhar = true;
  }
  window.addEventListener("resize", resize);

  /* progresso: 0 no topo; 1 quando a seção de contato entra em cena.
     Assim o redutor já está montado/girando em "Vamos Trabalhar Juntos" e
     NÃO "desmonta" quando o painel de IA (mais abaixo) expande. */
  let target = 0, disp = 0, spinAccum = 0, lastT = performance.now();
  let precisaDesenhar = true;

  /* A posição do #contato só muda quando o layout muda. Media uma vez por
     quadro com getBoundingClientRect, o que força o navegador a recalcular
     o layout 60 vezes por segundo no meio da rolagem — o clássico layout
     thrashing, que é justamente o que faz a rolagem "travar" em degraus.
     Agora fica em cache e só é remedida no resize e quando a altura do
     documento muda (imagens carregando, conteúdo da API chegando). */
  let contatoTop = 0, alturaConhecida = 0;
  function medirContato() {
    const el = document.getElementById("contato");
    contatoTop = el
      ? el.getBoundingClientRect().top + window.scrollY
      : document.documentElement.scrollHeight - window.innerHeight;
    alturaConhecida = document.documentElement.scrollHeight;
  }

  function readProgress() {
    if (document.documentElement.scrollHeight !== alturaConhecida) medirContato();
    const denom = Math.max(1, contatoTop - window.innerHeight * 0.5);
    target = Math.min(Math.max(window.scrollY / denom, 0), 1);
  }

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const part = (p, s, e) => clamp((p - s) / (e - s), 0, 1);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ── engrenagem realista (port do assembly) ── */
  function gear(cx, cy, r, teeth, angle, alpha) {
    const toothH = r * 0.22, rootR = r - toothH * 0.6, rimR = r * 0.70, hubR = r * 0.30, holeR = r * 0.16;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(angle);
    const mg = grad("gear" + r, () => {
      const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r * 1.1);
      g.addColorStop(0, "rgba(46,158,122,0.16)");
      g.addColorStop(0.6, "rgba(46,158,122,0.05)");
      g.addColorStop(1, "rgba(46,158,122,0.02)");
      return g;
    });
    ctx.fillStyle = mg; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const b = (i / teeth) * Math.PI * 2;
      const a0 = b, a1 = b + (0.30 / teeth) * Math.PI * 2, a2 = b + (0.45 / teeth) * Math.PI * 2,
            a3 = b + (0.55 / teeth) * Math.PI * 2, a4 = b + (0.70 / teeth) * Math.PI * 2, a5 = b + (1.0 / teeth) * Math.PI * 2;
      const pt = (ang, rad) => [Math.cos(ang) * rad, Math.sin(ang) * rad];
      const p0 = pt(a0, rootR);
      if (i === 0) ctx.moveTo(p0[0], p0[1]); else ctx.lineTo(p0[0], p0[1]);
      const p1 = pt(a1, rootR), p2 = pt(a2, r), p3 = pt(a3, r), p4 = pt(a4, rootR), p5 = pt(a5, rootR);
      ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.lineTo(p5[0], p5[1]);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, rimR, 0, Math.PI * 2); ctx.stroke();
    const holes = Math.max(4, Math.floor(teeth / 4));
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * Math.PI * 2, rr = (rimR + hubR) / 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.07, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, holeR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(-holeR * 0.28, -holeR - holeR * 0.5, holeR * 0.56, holeR * 0.6);
    ctx.restore();
  }

  function rrect(x, y, rw, rh, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
    ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
    ctx.arcTo(x, y + rh, x, y, rad);
    ctx.arcTo(x, y, x + rw, y, rad);
    ctx.closePath();
  }
  function rrectPath(x, y, rw, rh, rad) {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
    ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
    ctx.arcTo(x, y + rh, x, y, rad);
    ctx.arcTo(x, y, x + rw, y, rad);
  }

  function shaft(xIn, xEnd, y, th, alpha, dir) {
    ctx.save(); ctx.globalAlpha = alpha;
    const g = grad("shaft" + y + "|" + th, () => {
      const gr = ctx.createLinearGradient(0, y - th, 0, y + th);
      gr.addColorStop(0, "rgba(46,158,122,0.10)");
      gr.addColorStop(0.5, "rgba(46,158,122,0.30)");
      gr.addColorStop(1, "rgba(46,158,122,0.10)");
      return gr;
    });
    ctx.fillStyle = g; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6;
    const x0 = Math.min(xIn, xEnd), x1 = Math.max(xIn, xEnd);
    ctx.beginPath(); rrectPath(x0, y - th / 2, x1 - x0, th, th * 0.25); ctx.fill(); ctx.stroke();
    const stepX = dir < 0 ? x0 : x1 - th * 1.4;
    ctx.beginPath(); rrectPath(stepX, y - th * 0.32, th * 1.4, th * 0.64, 2); ctx.fill(); ctx.stroke();
    const fx = dir < 0 ? x0 : x1;
    ctx.beginPath(); ctx.ellipse(fx, y, th * 0.5, th * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(46,158,122,0.12)"; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function bearingCap(cx, cy, r, n, alpha, rot) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2;
    const g = grad("cap" + cx + "|" + cy + "|" + r, () => {
      const gr = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      gr.addColorStop(0, "rgba(46,158,122,0.12)"); gr.addColorStop(1, "rgba(46,158,122,0.04)");
      return gr;
    });
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(46,158,122,0.18)";
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2, br = r * 0.81;
      ctx.save(); ctx.translate(cx + Math.cos(a) * br, cy + Math.sin(a) * br);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const ka = (k / 6) * Math.PI * 2; const px = Math.cos(ka) * 3.6, py = Math.sin(ka) * 3.6; k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function wrench(bx, by, len, angle, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(bx, by); ctx.rotate(angle);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2;
    const wd = len * 0.115, headR = len * 0.17;
    const g = grad("wrench" + headR, () => {
      const gr = ctx.createLinearGradient(0, -headR, 0, headR);
      gr.addColorStop(0, "rgba(46,158,122,0.34)");
      gr.addColorStop(1, "rgba(46,158,122,0.10)");
      return gr;
    });
    ctx.fillStyle = g;
    ctx.beginPath(); rrectPath(0, -wd / 2, len * 0.74, wd, wd * 0.5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6, px = Math.cos(a) * headR * 0.56, py = Math.sin(a) * headR * 0.56; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(len * 0.74, 0); ctx.rotate(0.16);
    ctx.fillStyle = g;
    const jw = headR * 1.05, slot = headR * 0.78;
    ctx.beginPath();
    ctx.moveTo(0, -headR); ctx.lineTo(jw, -headR); ctx.lineTo(jw, -slot / 2);
    ctx.lineTo(jw * 0.42, -slot / 2); ctx.lineTo(jw * 0.42, slot / 2); ctx.lineTo(jw, slot / 2);
    ctx.lineTo(jw, headR); ctx.lineTo(0, headR);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore(); ctx.restore();
  }

  function motor(rightX, cy, bw, bh, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    const x = rightX - bw, y = cy - bh / 2;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.4;
    const g = grad("motor" + x + "|" + y + "|" + bh, () => {
      const gr = ctx.createLinearGradient(x, y, x, y + bh);
      gr.addColorStop(0, "rgba(46,158,122,0.16)");
      gr.addColorStop(0.5, "rgba(46,158,122,0.05)");
      gr.addColorStop(1, "rgba(46,158,122,0.12)");
      return gr;
    });
    ctx.fillStyle = g;
    rrect(x, y, bw, bh, bh * 0.22); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.globalAlpha = alpha * 0.55;
    for (let i = 1; i < 10; i++) { const fx = x + bw * 0.12 + i * (bw * 0.075); ctx.beginPath(); ctx.moveTo(fx, y + bh * 0.12); ctx.lineTo(fx, y + bh * 0.88); ctx.stroke(); }
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, cy, bh * 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * bh * 0.14, cy + Math.sin(a) * bh * 0.14); ctx.lineTo(x + Math.cos(a) * bh * 0.38, cy + Math.sin(a) * bh * 0.38); ctx.stroke(); }
    ctx.lineWidth = 1.8;
    rrect(x + bw * 0.40, y - bh * 0.18, bw * 0.28, bh * 0.20, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rightX, cy - bh * 0.30); ctx.lineTo(rightX, cy + bh * 0.30); ctx.stroke();
    ctx.lineWidth = 2.2;
    rrect(x + bw * 0.12, y + bh, bw * 0.24, bh * 0.12, 3); ctx.stroke();
    rrect(x + bw * 0.64, y + bh, bw * 0.24, bh * 0.12, 3); ctx.stroke();
    ctx.restore();
  }

  /* ── desenho: peças espalhadas (topo) -> convergem ao centro -> giram (fim) ── */
  function draw() {
    ctx.clearRect(0, 0, w, h);
    const p = reduce ? 1 : disp;

    const s = clamp(Math.min(w / 880, h / 760), 0.42, 1.15) * 1.15;

    // geometria local (centro do trem na origem)
    const Rc = 100 * s, Ct = 28;
    const RmL = 68 * s, RmLt = 20, RmS = 38 * s, RmSt = 11;
    const Rp = 40 * s, Pt = 11;
    const P = { x: 0, y: 0 };
    const M = { x: (Rp + RmL) * 0.92, y: 0 };
    const C = { x: M.x + (RmS + Rc) * 0.92, y: 0 };
    const shaftInLeft = P.x - Rp - 70 * s;
    const trainCenterX = (P.x + C.x) / 2;
    const hx = (P.x - Rp) - 26 * s, hy = -Rc - 26 * s;
    const hw = (C.x + Rc + 34 * s) - hx, hh = (Rc + 42 * s) - hy;

    // convergência: peças espalhadas (p=0) -> montadas no centro (p~0.85)
    const conv = easeOut(clamp(p / 0.85, 0, 1));
    const inv = 1 - conv;
    const settle = smooth(0.85, 1.0, p);

    // giro: acompanha a montagem e ganha giro contínuo (idle) ao se completar
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
    if (!reduce) spinAccum += dt * 1.1 * settle;
    const angP = conv * 5 + spinAccum;
    const angM = -angP * (Rp / RmL);
    const angC = angP * (Rp / RmL) * (RmS / Rc);

    const aMain = BASE * (0.78 + 0.22 * conv);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(w / 2, h / 2);     // centralizado, SEM rotação de grupo (não orbita)
    ctx.translate(-trainCenterX, 0);

    /* 1. CARCAÇA (espalhada embaixo -> sobe ao centro) */
    ctx.save(); ctx.translate(inv * 0, inv * 210 * s);
    (function () {
      const a = aMain;
      ctx.save(); ctx.globalAlpha = a;
      const bg = grad("carcaca" + hx + "|" + hy + "|" + hh, () => {
        const gr = ctx.createLinearGradient(hx, hy, hx, hy + hh);
        gr.addColorStop(0, "rgba(46,158,122,0.10)"); gr.addColorStop(0.5, "rgba(46,158,122,0.03)"); gr.addColorStop(1, "rgba(46,158,122,0.08)");
        return gr;
      });
      ctx.fillStyle = bg; ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.6;
      rrect(hx, hy, hw, hh, 20 * s); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.globalAlpha = a * 0.7;
      ctx.beginPath(); ctx.moveTo(hx + 6 * s, 0); ctx.lineTo(hx + hw - 6 * s, 0); ctx.stroke();
      ctx.globalAlpha = a * 0.5; ctx.lineWidth = 1.3;
      for (let i = 0; i < 5; i++) {
        const rx = hx + 14 * s + i * 7 * s, rx2 = hx + hw - 14 * s - i * 7 * s;
        ctx.beginPath(); ctx.moveTo(rx, hy + 18 * s); ctx.lineTo(rx, -10 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx2, hy + 18 * s); ctx.lineTo(rx2, -10 * s); ctx.stroke();
      }
      ctx.globalAlpha = a; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(P.x, P.y, Rp * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(M.x, M.y, RmS * 0.80, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(C.x, C.y, Rc * 0.50, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2.4; const fy = hy + hh;
      [hx + 20 * s, hx + hw - 66 * s].forEach((fx) => { rrect(fx, fy - 3 * s, 48 * s, 18 * s, 4 * s); ctx.fill(); ctx.stroke(); });
      ctx.restore();
    })();
    ctx.restore();

    /* 2. EIXO DE ENTRADA + PINHÃO (espalhado à esquerda) */
    ctx.save(); ctx.translate(inv * -255 * s, inv * -120 * s);
    shaft(shaftInLeft, P.x, P.y, 13 * s, aMain, -1);
    gear(P.x, P.y, Rp, Pt, angP, aMain);
    ctx.restore();

    /* 3. INTERMEDIÁRIA COMPOSTA (espalhada no topo) */
    ctx.save(); ctx.translate(inv * 90 * s, inv * -240 * s);
    gear(M.x, M.y, RmL, RmLt, angM, aMain);
    gear(M.x, M.y, RmS, RmSt, angM, aMain);
    ctx.restore();

    /* 4. COROA + EIXO DE SAÍDA (espalhados à direita) */
    ctx.save(); ctx.translate(inv * 270 * s, inv * 120 * s);
    shaft(C.x, C.x + Rc + 86 * s, C.y, 18 * s, aMain, 1);
    gear(C.x, C.y, Rc, Ct, angC, aMain);
    ctx.restore();

    /* 5. MOTOR (aparece e converge da esquerda) */
    const aMot = smooth(0.45, 0.80, p) * BASE;
    if (aMot > 0) {
      ctx.save(); ctx.translate(inv * -320 * s, inv * 170 * s);
      motor(shaftInLeft, 0, 132 * s, RmL * 1.5, aMot);
      ctx.restore();
    }

    /* 6. TAMPAS + PARAFUSOS (acabamento, convergindo das laterais) */
    const aCap = smooth(0.6, 0.86, p) * BASE;
    if (aCap > 0) {
      const ci = 1 - smooth(0.6, 0.86, p);
      ctx.save(); ctx.translate(ci * -160 * s, 0); bearingCap(P.x, P.y, Rp * 0.52, 6, aCap, 0.4); ctx.restore();
      ctx.save(); ctx.translate(ci * 160 * s, 0); bearingCap(C.x, C.y, Rc * 0.34, 8, aCap, 0.2); ctx.restore();
    }

    /* chaves apertando (passam vindo das laterais e somem ao fim) */
    const wt = clamp((p - 0.62) / 0.22, 0, 1);
    const wA = Math.sin(wt * Math.PI) * BASE * 0.8;
    if (wA > 0) {
      const wob = Math.sin(wt * Math.PI * 3), wi = 1 - wt;
      ctx.save(); ctx.translate(wi * 150 * s, 0);
      wrench(C.x, C.y - Rc * 0.34 * 0.81, 78 * s, -Math.PI * 0.30 + wob * 0.18, wA);
      ctx.restore();
      ctx.save(); ctx.translate(wi * -150 * s, 0);
      wrench(P.x + Rp * 0.52 * 0.81, P.y, 56 * s, Math.PI * 0.62 - wob * 0.18, wA);
      ctx.restore();
    }

    ctx.restore();
  }

  function frame() {
    requestAnimationFrame(frame);

    // Aba em segundo plano: não há o que pintar, e o rAF ainda pode
    // disparar durante a transição.
    if (document.hidden) { lastT = performance.now(); return; }

    readProgress();
    const antes = disp;
    disp += (target - disp) * 0.12;            // suaviza o acompanhamento da rolagem

    /* Só repinta quando a imagem realmente muda. Duas fontes de mudança:
       a rolagem (disp caminhando até target) e o giro contínuo, que só
       existe depois que o redutor termina de montar (settle > 0).
       Parado no topo da página as duas são nulas e o quadro seria
       idêntico ao anterior — antes ele era repintado assim mesmo, 60
       vezes por segundo, competindo com a rolagem pela CPU. */
    const rolando = Math.abs(target - disp) > 0.0004 || Math.abs(disp - antes) > 0.0004;
    const girando = !reduce && disp > 0.85;
    if (!rolando && !girando && !precisaDesenhar) { lastT = performance.now(); return; }
    precisaDesenhar = false;

    draw();
  }

  resize();
  // Recalcula quando o conteúdo da API chega e muda a altura da página
  window.addEventListener("load", medirContato);
  requestAnimationFrame(frame);
})();
