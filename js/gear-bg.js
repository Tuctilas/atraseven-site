/**
 * gear-bg.js | Canvas de engrenagens animadas no fundo (95% ofuscado)
 * ATRA SEVEN
 */

(function () {
  const canvas = document.getElementById('gear-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, gears;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  /**
   * @param {number} x        - posição X
   * @param {number} y        - posição Y
   * @param {number} r        - raio base
   * @param {number} teeth    - número de dentes
   * @param {number} speed    - velocidade de rotação (rad/frame)
   * @param {number} dir      - direção: 1 ou -1
   */
  function makeGear(x, y, r, teeth, speed, dir) {
    return { x, y, r, teeth, speed, dir, angle: Math.random() * Math.PI * 2 };
  }

  function initGears() {
    gears = [
      makeGear(W * 0.85, H * 0.15, 110, 16,  0.003,  1),
      makeGear(W * 0.72, H * 0.28,  55, 10, -0.006, -1),
      makeGear(W * 0.10, H * 0.60, 140, 20,  0.002,  1),
      makeGear(W * 0.22, H * 0.45,  65, 11, -0.005, -1),
      makeGear(W * 0.50, H * 0.85,  90, 14,  0.004,  1),
      makeGear(W * 0.62, H * 0.75,  44,  9, -0.007, -1),
      makeGear(W * 0.35, H * 0.20,  70, 12,  0.0035, 1),
      makeGear(W * 0.90, H * 0.70,  80, 13, -0.003, -1),
    ];
  }

  function drawGear(g) {
    const { x, y, r, teeth, angle } = g;
    const toothH = r * 0.28;
    const innerR = r * 0.55;
    const holeR  = r * 0.18;
    const spokes = Math.max(4, Math.floor(teeth / 3));

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.strokeStyle = '#5ccda7';
    ctx.fillStyle   = 'rgba(92,205,167,0.04)';
    ctx.lineWidth   = 1.5;

    /* corpo + dentes */
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = ((i + 0.35) / teeth) * Math.PI * 2;
      const a2 = ((i + 0.65) / teeth) * Math.PI * 2;
      const a3 = ((i + 1)    / teeth) * Math.PI * 2;

      if (i === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
      else         ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);

      ctx.lineTo(Math.cos(a1) * (r + toothH), Math.sin(a1) * (r + toothH));
      ctx.lineTo(Math.cos(a2) * (r + toothH), Math.sin(a2) * (r + toothH));
      ctx.lineTo(Math.cos(a3) * r,             Math.sin(a3) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /* círculo interno */
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.stroke();

    /* raios */
    ctx.lineWidth = 1;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * holeR * 1.8,  Math.sin(a) * holeR * 1.8);
      ctx.lineTo(Math.cos(a) * innerR * 0.95, Math.sin(a) * innerR * 0.95);
      ctx.stroke();
    }

    /* furo central */
    ctx.beginPath();
    ctx.arc(0, 0, holeR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    gears.forEach(g => {
      g.angle += g.speed * g.dir;
      drawGear(g);
    });
    requestAnimationFrame(loop);
  }

  resize();
  initGears();
  loop();

  window.addEventListener('resize', () => {
    resize();
    initGears();
  });
})();
