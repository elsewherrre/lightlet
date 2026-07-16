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
    // 极小容器退避（避免初始化时尺寸为 0）
    if (cssW < 10 || cssH < 10) {
      cssW = 320; cssH = 480;
    }
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    // 重置变换，后续所有绘制命令使用 CSS 像素
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
    // 用 hash 不同段分别算 x / y，避免线性相关
    var x = margin + ((h & 0xFFFF) / 0xFFFF) * maxW;
    var y = margin + (((h >>> 16) & 0xFFFF) / 0xFFFF) * maxH;
    // 微调避免多星重叠：用 idx 做微小位移
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
      bgStars.push({
        x: ((seed & 0xFFFF) / 0xFFFF) * cssW,
        y: (((seed >> 16) & 0xFFFF) / 0xFFFF) * cssH,
        r: 0.4 + ((seed % 100) / 100) * 1.6,
        baseAlpha: 0.06 + ((seed % 80) / 100) * 0.22,
        freq: 0.0004 + ((seed % 60) / 100) * 0.002,
        phase: ((seed % 360) / 180) * Math.PI
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
    drawBursts(now);
  }

  /* ─── 背景星 ─── */
  function drawBgStars(t) {
    for (var i = 0; i < bgStars.length; i++) {
      var s = bgStars[i];
      var a = s.baseAlpha + Math.sin(t * s.freq + s.phase) * 0.06;
      a = Math.max(0.02, Math.min(0.35, a));
      ctx.fillStyle = 'rgba(200,210,220,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ─── 用户光点 ─── */
  function drawUserLights(t) {
    for (var i = 0; i < userLights.length; i++) {
      var light = userLights[i];
      var pos = lightPositions[light.id];
      if (!pos) continue;
      if (light.status === 'done') {
        drawDone(pos.x, pos.y, t);
      } else {
        drawPending(pos.x, pos.y, t);
      }
    }
  }

  /* 已完成星：三层径向渐变发光 */
  function drawDone(x, y, t) {
    var breathe = 1 + Math.sin(t * 0.0018) * 0.08;
    var r = 10 * breathe;

    // 第 1 层：外光晕
    var g1 = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
    g1.addColorStop(0, 'rgba(212,168,83,0.30)');
    g1.addColorStop(0.4, 'rgba(212,168,83,0.06)');
    g1.addColorStop(1, 'rgba(212,168,83,0)');
    ctx.fillStyle = g1;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();

    // 第 2 层：主体
    var g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, '#f5d78c');
    g2.addColorStop(0.55, '#d4a853');
    g2.addColorStop(1, '#a07828');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // 第 3 层：亮心
    var g3 = ctx.createRadialGradient(x, y, 0, x, y, r * 0.32);
    g3.addColorStop(0, 'rgba(255,255,240,1)');
    g3.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = g3;
    ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }

  /* 未完成星：脉冲环 + 微点 */
  function drawPending(x, y, t) {
    var pulse = 0.45 + Math.sin(t * 0.0025) * 0.25;
    var r = 8;

    ctx.strokeStyle = 'rgba(212,168,83,' + (pulse * 0.4).toFixed(2) + ')';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = 'rgba(212,168,83,' + (pulse * 0.12).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
  }

  /* ─── 爆发动画 ─── */
  function addBurst(x, y) {
    bursts.push({ x: x, y: y, start: Date.now(), duration: 650 });
  }

  function drawBursts(t) {
    for (var i = bursts.length - 1; i >= 0; i--) {
      var b = bursts[i];
      var p = (t - b.start) / b.duration;
      if (p >= 1) { bursts.splice(i, 1); continue; }

      var a = 1 - p;
      var r = 55 * p;
      var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, 'rgba(245,215,140,' + (a * 0.45) + ')');
      g.addColorStop(0.5, 'rgba(212,168,83,' + (a * 0.12) + ')');
      g.addColorStop(1, 'rgba(212,168,83,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ═══════════════════════════════════════
    点击命中检测
  ═══════════════════════════════════════ */
  function hitTest(mx, my) {
    var hitR = 24; // 宽松命中半径
    // 从后往前遍历（后画的在上层）
    for (var i = userLights.length - 1; i >= 0; i--) {
      var light = userLights[i];
      var pos = lightPositions[light.id];
      if (!pos) continue;
      var dx = mx - pos.x, dy = my - pos.y;
      if (dx * dx + dy * dy < hitR * hitR) {
        return { id: light.id, x: pos.x, y: pos.y, light: light };
      }
    }
    return null;
  }

  /** 获取某个光点在 CSS 像素中的位置 */
  function getPos(lightId) {
    return lightPositions[lightId] || null;
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
