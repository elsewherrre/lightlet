/**
 * 微光集 — 共享工具函数
 * 日期格式化、UUID 生成、HTML 转义
 */
window.LightletUtils = (function () {
  const EXPIRY_DAYS_DEFAULT = 11;
  const MS_PER_DAY = 86400000;

  /* ─── 日期 ─── */
  function todayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function displayDate(dateStr) {
    const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
  }

  function timeStr(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function formatTimeShort(ts) {
    return timeStr(ts);
  }

  /* ─── 日期运算 ─── */
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(d1, d2) {
    const a = new Date(d1 + 'T00:00:00');
    const b = new Date(d2 + 'T00:00:00');
    return Math.round((b - a) / MS_PER_DAY);
  }

  function isExpired(createdAt, expiryDays) {
    const days = expiryDays || EXPIRY_DAYS_DEFAULT;
    return (Date.now() - createdAt) > days * MS_PER_DAY;
  }

  /* ─── ID ─── */
  function UUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* ─── HTML 安全 ─── */
  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /* ─── 常量 ─── */
  return {
    EXPIRY_DAYS_DEFAULT: EXPIRY_DAYS_DEFAULT,
    todayStr: todayStr,
    displayDate: displayDate,
    timeStr: timeStr,
    formatTimeShort: formatTimeShort,
    addDays: addDays,
    daysBetween: daysBetween,
    isExpired: isExpired,
    UUID: UUID,
    esc: esc
  };
})();
