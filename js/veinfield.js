/**
 * 微光集 — 脉络模式渲染引擎
 * 白底 + 黑色浮动圆点 + 连线
 * 数据视角：看到事项之间的结构与关联
 *
 * 视效层次：
 *   - done: 实心黑点 + 微弱呼吸
 *   - pending: 空心环 + 脉冲
 *   - expired: 灰点
 *   - 连线：基于时间邻近的建议虚线（未确认）/ 实线（已确认）
 */
window.VeinField = (function () {
  var canvas, ctx;
  var cssW, cssH;
  var userLights = [];
  var lightPositions = {};
  var animFrame, animTime = 0;
  var selectedId = null;

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

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    if (cssW < 10 || cssH < 10) { cssW = 320; cssH = 480; }
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rehashAll();
  }

  /* ═══════════════════════════════════════
    数据更新
  ═══════════════════════════════════════ */
  function update(lights) {
    userLights = lights || [];
    rehashAll();
  }

  function selectLight(id) {
    selectedId = id;
  }

  function clearSelection() {
    selectedId = null;
  }

  function rehashAll() {
    lightPositions = {};
    if (!userLights.length) return;
    var margin = 50;
    var availW = Math.max(cssW - margin * 2, 50);
    var availH = Math.max(cssH - margin * 2, 50);
    for (var i = 0; i < userLights.length; i++) {
      var light = userLights[i];
      lightPositions[light.id] = posFromId(light.id, i, availW, availH, margin);
    }
  }

  function posFromId(id, idx, maxW, maxH, margin) {
    var h = hashStr(id);
    var x = margin + ((h & 0xFFFF) / 0xFFFF) * maxW;
    var y = margin + (((h >>> 16) & 0xFFFF) / 0xFFFF) * maxH;
    // 网格化微调避免重叠
    var col = idx % 4;
    var row = Math.floor(idx / 4);
    var jx = (col - 1.5) * 6;
    var jy = (row % 5 - 2) * 6;
    return { x: clamp(x + jx, margin, margin + maxW), y: clamp(y + jy, margin, margin + maxH) };
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
    // 白底
    ctx.fillStyle = '#fafaf8';
    ctx.fillRect(0, 0, cssW, cssH);

    // 微弱网格点背景
    drawGridPoints(now);

    // 连线（建议关联）
    drawSuggestedLinks(now);

    // 节点
    drawNodes(now);
  }

  /* ─── 背景网格点 ─── */
  function drawGridPoints(t) {
    var step = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for (var x = step; x < cssW; x += step) {
      for (var y = step; y < cssH; y += step) {
        var wave = Math.sin(t * 0.0003 + x * 0.01 + y * 0.007) * 0.5;
        var r = 0.8 + wave;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ─── 建议连线（时间邻近 2h 内的 done 事项之间画虚线） ─── */
  function drawSuggestedLinks(t) {
    var doneLights = userLights.filter(function (l) { return l.status === 'done'; });
    if (doneLights.length < 2) return;

    var pairs = [];
    for (var i = 0; i < doneLights.length; i++) {
      for (var j = i + 1; j < doneLights.length; j++) {
        var a = doneLights[i], b = doneLights[j];
        var pa = lightPositions[a.id], pb = lightPositions[b.id];
        if (!pa || !pb) continue;
        var timeGap = Math.abs(a.completedAt - b.completedAt);
        if (timeGap < 7200000) { // 2 小时内
          pairs.push({ a: pa, b: pb, gap: timeGap });
        }
      }
    }

    // 最多画 12 条，取时间最近的
    pairs.sort(function (x, y) { return x.gap - y.gap; });
    pairs = pairs.slice(0, 12);

    for (var k = 0; k < pairs.length; k++) {
      var p = pairs[k];
      var alpha = 0.06 + (1 - p.gap / 7200000) * 0.10;
      ctx.strokeStyle = 'rgba(0,0,0,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 8]);
      ctx.beginPath();
      ctx.moveTo(p.a.x, p.a.y);
      ctx.lineTo(p.b.x, p.b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ─── 节点 ─── */
  function drawNodes(t) {
    for (var i = 0; i < userLights.length; i++) {
      var light = userLights[i];
      var pos = lightPositions[light.id];
      if (!pos) continue;

      var isSelected = selectedId === light.id;

      if (light.status === 'done') {
        drawVeinDone(pos.x, pos.y, t, isSelected);
      } else if (light.status === 'expired') {
        drawVeinExpired(pos.x, pos.y, t, isSelected);
      } else {
        drawVeinPending(pos.x, pos.y, t, isSelected);
      }
    }
  }

  /* done：实心黑点 + 微弱呼吸光晕 */
  function drawVeinDone(x, y, t, sel) {
    var breathe = 1 + Math.sin(t * 0.0015) * 0.06;
    var r = sel ? 12 : 9;
    r *= breathe;

    // 外光晕
    var g1 = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.8);
    g1.addColorStop(0, 'rgba(0,0,0,0.08)');
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();

    // 主体
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // 亮心
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.2, 0, Math.PI * 2); ctx.fill();

    // 选中高亮环
    if (sel) {
      ctx.strokeStyle = 'rgba(90,122,106,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /* pending：空心环 + 脉冲 */
  function drawVeinPending(x, y, t, sel) {
    var pulse = 0.5 + Math.sin(t * 0.0025) * 0.25;
    var r = sel ? 11 : 8;

    ctx.strokeStyle = 'rgba(0,0,0,' + (pulse * 0.2).toFixed(2) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

    // 微点
    ctx.fillStyle = 'rgba(0,0,0,' + (pulse * 0.08).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();

    if (sel) {
      ctx.strokeStyle = 'rgba(90,122,106,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /* expired：浅灰点 */
  function drawVeinExpired(x, y, t, sel) {
    var r = sel ? 10 : 6.5;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // 虚线环
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    if (sel) {
      ctx.strokeStyle = 'rgba(90,122,106,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /* ═══════════════════════════════════════
    点击命中检测
  ═══════════════════════════════════════ */
  function hitTest(mx, my) {
    var hitR = 28;
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

  return {
    init: init,
    update: update,
    resize: resize,
    hitTest: hitTest,
    getPos: getPos,
    selectLight: selectLight,
    clearSelection: clearSelection,
    destroy: destroy
  };
})();
