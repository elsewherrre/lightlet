/**
 * 微光集 — 星空画布渲染引擎
 * Canvas 负责：背景星空 + 用户光点 + 动效
 * 交互检测通过 hitTest() 返回命中的光点，由 DOM 层处理卡片/按钮
 *
 * 坐标体系：所有绘制坐标使用 CSS 像素（已处理 devicePixelRatio）
 */
window.StarField = (function () {
  var canvas, ctx;
  var cssW, cssH;          // CSS 像素尺寸（非内部像素）
  var bgStars = [];
  var userLights = [];
  var bursts = [];
  var lightPositions = {}; // id → { x, y }
  var animFrame;
  var animTime = 0;
  var shootStar = null;    // 偶尔划过的流星
  var nextShoot = 0;       // 下一次流星时间

  /* ═══════════════════════════════════════
    初始化
  ═══════════════════════════════════════ */
  function init(canvasEl, lights) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    if (lights) userLights = lights;
    resize();
    startLoop();
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    resize();
  }

  /* ═══════════════════════════════════════
    尺寸 & DPR 处理
  ═══════════════════════════════════════ */
  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    if (cssW < 10 || cssH < 10) {
      cssW = 320; cssH = 480;
    }
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rehashAll();
  }

  /* ═══════════════════════════════════════
    光点数据更新
  ═══════════════════════════════════════ */
  function update(lights) {
    userLights = lights || [];
    rehashAll();
  }

  function rehashAll() {
    generateBgStars(260);
    lightPositions = {};
    if (!userLights.length) return;
    var margin = 45;
    var availW = Math.max(cssW - margin * 2, 50);
    var availH = Math.max(cssH - margin * 2, 50);
    for (var i = 0; i < userLights.length; i++) {
      var light = userLights[i];
      lightPositions[light.id] = posFromId(light.id, i, availW, availH, margin);
    }
  }

  /* ─── ID → 位置哈希 ─── */
  function posFromId(id, idx, maxW, maxH, margin) {
    var h = hashStr(id);
    var x = margin + ((h & 0xFFFF) / 0xFFFF) * maxW;
    var y = margin + (((h >>> 16) & 0xFFFF) / 0xFFFF) * maxH;
    var jitterX = (idx % 5 - 2) * 3;
    var jitterY = (Math.floor(idx / 5) % 5 - 2) * 3;
    return { x: clamp(x + jitterX, margin, margin + maxW), y: clamp(y + jitterY, margin, margin + maxH) };
  }

  /* ═══════════════════════════════════════
    背景星空生成
  ═══════════════════════════════════════ */
  function generateBgStars(count) {
    bgStars = [];
    var seed = 42;
    for (var i = 0; i < count; i++) {
      seed = (seed * 16807) % 2147483647;
      var warm = (seed % 360) < 120; // 30% 偏暖色
      var base = warm ? { r: 255, g: 220, b: 180 } : { r: 210, g: 220, b: 235 };
      bgStars.push({
        x: ((seed & 0xFFFF) / 0xFFFF) * cssW,
        y: (((seed >> 16) & 0xFFFF) / 0xFFFF) * cssH,
        r: 0.4 + ((seed % 100) / 100) * 1.8,
        baseAlpha: 0.08 + ((seed % 80) / 100) * 0.24,
        freq: 0.0004 + ((seed % 60) / 100) * 0.0026,
        phase: ((seed % 360) / 180) * Math.PI,
        driftX: (seed % 100) / 100 * Math.PI * 2,
        driftY: ((seed * 13) % 100) / 100 * Math.PI * 2,
        driftSpeed: 0.0001 + ((seed % 50) / 100) * 0.0003,
        driftR: 0.3 + ((seed % 70) / 100) * 0.8,
        color: base
      });
    }
  }

  /* ═══════════════════════════════════════
    动画循环
  ═══════════════════════════════════════ */
  function startLoop() {
    function frame(now) {
      animTime = now;
      draw(now);
      animFrame = requestAnimationFrame(frame);
    }
    animFrame = requestAnimationFrame(frame);
  }

  function draw(now) {
    ctx.clearRect(0, 0, cssW, cssH);
    drawBgStars(now);
    drawUserLights(now);
    drawShootStar(now);
    drawBursts(now);
  }

  /* ─── 背景星 ─── */
  function drawBgStars(t) {
    for (var i = 0; i < bgStars.length; i++) {
      var s = bgStars[i];
      var twinkle = Math.sin(t * s.freq + s.phase);
      var a = s.baseAlpha + twinkle * 0.10;          // 闪烁幅度加大
      a = Math.max(0.02, Math.min(0.42, a));

      var dx = Math.sin(t * s.driftSpeed + s.driftX) * s.driftR;
      var dy = Math.cos(t * s.driftSpeed * 0.7 + s.driftY) * s.driftR;

      var rgb = s.color.r + ',' + s.color.g + ',' + s.color.b;
      ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x + dx, s.y + dy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ─── 流星 ─── */
  function drawShootStar(t) {
    if (t > nextShoot) {
      shootStar = {
        x: Math.random() * cssW,
        y: Math.random() * cssH * 0.4,
        vx: -120 - Math.random() * 120,
        vy: 80 + Math.random() * 80,
        start: t,
        duration: 700 + Math.random() * 400
      };
      nextShoot = t + 8000 + Math.random() * 12000;
    }
    if (!shootStar) return;
    var p = (t - shootStar.start) / shootStar.duration;
    if (p >= 1) { shootStar = null; return; }
    var x = shootStar.x + shootStar.vx * p;
    var y = shootStar.y + shootStar.vy * p;
    var a = 1 - p;
    var grad = ctx.createLinearGradient(x, y, x - shootStar.vx * 0.15, y - shootStar.vy * 0.15);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,' + (a * 0.6).toFixed(2) + ')');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - shootStar.vx * 0.15, y - shootStar.vy * 0.15);
    ctx.stroke();
  }

  /* ─── 用户光点 ─── */
  function drawUserLights(t) {
    for (var i = 0; i < userLights.length; i++) {
      var light = userLights[i];
      var pos = lightPositions[light.id];
      if (!pos) continue;
      // 缓慢浮动：每个点按自己的相位微微漂移
      var driftX = Math.sin(t * 0.0004 + hashFloat(light.id) * Math.PI * 2) * 2.2;
      var driftY = Math.cos(t * 0.00035 + hashFloat(light.id) * Math.PI * 2) * 2.2;
      var finalPos = { x: pos.x + driftX, y: pos.y + driftY };

      if (light.status === 'done') {
        drawDone(finalPos.x, finalPos.y, t);
      } else if (light.status === 'expired') {
        drawExpired(finalPos.x, finalPos.y, t);
      } else {
        drawPending(finalPos.x, finalPos.y, t);
      }
    }
  }

  /* 已完成星：三层径向渐变发光 + 更明显呼吸 */
  function drawDone(x, y, t) {
    var breathe = 1 + Math.sin(t * 0.0016) * 0.14;
    var r = 10 * breathe;

    // 第 1 层：外光晕（更大更明显）
    var g1 = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.2);
    g1.addColorStop(0, 'rgba(212,168,83,0.42)');
    g1.addColorStop(0.35, 'rgba(212,168,83,0.10)');
    g1.addColorStop(1, 'rgba(212,168,83,0)');
    ctx.fillStyle = g1;
    ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();

    // 第 2 层：主体
    var g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, '#f8e0a0');
    g2.addColorStop(0.55, '#d4a853');
    g2.addColorStop(1, '#9e6f1f');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // 第 3 层：亮心
    var g3 = ctx.createRadialGradient(x, y, 0, x, y, r * 0.32);
    g3.addColorStop(0, 'rgba(255,255,245,1)');
    g3.addColorStop(1, 'rgba(255,255,245,0)');
    ctx.fillStyle = g3;
    ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }

  /* 未完成星：脉冲环 + 微点 + 更明显的呼吸感 */
  function drawPending(x, y, t) {
    var pulse = 0.42 + Math.sin(t * 0.0022) * 0.35;
    var r = 8;

    ctx.strokeStyle = 'rgba(212,168,83,' + (pulse * 0.55).toFixed(2) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = 'rgba(212,168,83,' + (0.18 + pulse * 0.22).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();

    // 增加一层微光晕，让未完成的点也能被注意到
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    g.addColorStop(0, 'rgba(212,168,83,' + (pulse * 0.06).toFixed(2) + ')');
    g.addColorStop(1, 'rgba(212,168,83,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2.5, 0, Math.PI * 2); ctx.fill();
  }

  /* 已过期星（在星夜模式下以暗淡形态出现） */
  function drawExpired(x, y, t) {
    var a = 0.15 + Math.sin(t * 0.001 + hashFloat(x + y) * Math.PI * 2) * 0.05;
    ctx.strokeStyle = 'rgba(150,140,120,' + a.toFixed(2) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(150,140,120,' + (a * 0.5).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
  }

  /* ─── 爆发动画 ─── */
  function addBurst(x, y) {
    bursts.push({ x: x, y: y, start: Date.now(), duration: 900 });
  }

  function drawBursts() {
    var now = Date.now();
    for (var i = bursts.length - 1; i >= 0; i--) {
      var b = bursts[i];
      var p = (now - b.start) / b.duration;
      if (p >= 1) { bursts.splice(i, 1); continue; }
      if (p < 0) { continue; }

      var a = 1 - p;
      var r = 80 * p;

      // 光晕扩散
      var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, Math.max(r, 1));
      g.addColorStop(0, 'rgba(250,225,150,' + (a * 0.55) + ')');
      g.addColorStop(0.55, 'rgba(212,168,83,' + (a * 0.18) + ')');
      g.addColorStop(1, 'rgba(212,168,83,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(r, 1), 0, Math.PI * 2); ctx.fill();

      // 放射星芒
      drawStarBurst(b.x, b.y, r, a);
    }
  }

  function drawStarBurst(x, y, r, a) {
    var rays = 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(animTime * 0.001);
    ctx.strokeStyle = 'rgba(255,240,190,' + (a * 0.35).toFixed(2) + ')';
    ctx.lineWidth = 1.2;
    for (var i = 0; i < rays; i++) {
      var angle = (i / rays) * Math.PI * 2;
      var len = r * (0.55 + 0.45 * Math.sin(animTime * 0.008 + i));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ═══════════════════════════════════════
    点击命中检测
  ═══════════════════════════════════════ */
  function hitTest(mx, my) {
    var hitR = 26;
    for (var i = userLights.length - 1; i >= 0; i--) {
      var light = userLights[i];
      var pos = lightPositions[light.id];
      if (!pos) continue;
      // 命中检测时也要考虑当前漂移偏移
      var driftX = Math.sin(animTime * 0.0004 + hashFloat(light.id) * Math.PI * 2) * 2.2;
      var driftY = Math.cos(animTime * 0.00035 + hashFloat(light.id) * Math.PI * 2) * 2.2;
      var dx = mx - (pos.x + driftX), dy = my - (pos.y + driftY);
      if (dx * dx + dy * dy < hitR * hitR) {
        return { id: light.id, x: pos.x + driftX, y: pos.y + driftY, light: light };
      }
    }
    return null;
  }

  /** 获取某个光点在 CSS 像素中的位置（用于卡片定位） */
  function getPos(lightId) {
    var pos = lightPositions[lightId];
    if (!pos) return null;
    return {
      x: pos.x + Math.sin(animTime * 0.0004 + hashFloat(lightId) * Math.PI * 2) * 2.2,
      y: pos.y + Math.cos(animTime * 0.00035 + hashFloat(lightId) * Math.PI * 2) * 2.2
    };
  }

  /* ═══════════════════════════════════════
    工具
  ═══════════════════════════════════════ */
  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h & h;
    }
    return Math.abs(h);
  }

  function hashFloat(s) {
    return (hashStr(String(s)) % 1000) / 1000;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function destroy() {
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener('resize', onResize);
  }

  /* ─── 导出 ─── */
  return {
    init: init,
    update: update,
    resize: resize,
    hitTest: hitTest,
    getPos: getPos,
    addBurst: addBurst,
    destroy: destroy
  };
})();
