/**
 * 微光集 — 业务逻辑 API
 * 所有视图层通过此 API 读写数据，不直接碰存储层
 *
 * 实体：Light { id, text, createdAt, completedAt, date, status }
 * 状态：pending（进行中）、done（已完成）、expired（过期沉入遗忘之海）
 * 规则：pending 事项每日自动带入今日；超过 N 天未完成 → expired
 */
window.LightletAPI = (function () {
  var DB = window.LightletDB;
  var U = window.LightletUtils;

  var EXPIRY_DAYS = U.EXPIRY_DAYS_DEFAULT;
  var LS_KEY = 'lightlet_items_v1'; // 旧 localStorage key
  var _ready = false;

  /* ═══════════════════════════════════════
    初始化
    1. 打开 IndexedDB
    2. 迁移旧 localStorage 数据
    3. 每日滚动（pending 带入今天 + 过期检查）
  ═══════════════════════════════════════ */
  function init() {
    return DB.open()
      .then(migrateFromLS)
      .then(dailyRollover)
      .then(function () {
        _ready = true;
      });
  }

  function isReady() {
    return _ready;
  }

  /* ─── localStorage → IndexedDB 迁移 ─── */
  function migrateFromLS() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var oldItems = JSON.parse(raw);
      if (!oldItems || oldItems.length === 0) {
        localStorage.removeItem(LS_KEY);
        return;
      }

      // 转换旧格式 → 新格式
      var now = Date.now();
      var today = U.todayStr();
      var lights = oldItems.map(function (item) {
        var created = item.created || now;
        var status = item.done ? 'done' : 'pending';
        return {
          id: item.id || U.UUID(),
          text: item.text || '',
          createdAt: created,
          completedAt: item.done ? (item.created || now) : null,
          date: item.done ? today : today, // 旧数据全部归到今天
          status: status
        };
      });

      return DB.putAll(lights).then(function () {
        localStorage.removeItem(LS_KEY);
        console.log('[微光集] 已从 localStorage 迁移 ' + lights.length + ' 条数据');
      });
    } catch (e) {
      console.warn('[微光集] localStorage 迁移失败，跳过', e);
      localStorage.removeItem(LS_KEY); // 清除损坏数据
    }
  }

  /* ─── 每日滚动 ─── */
  function dailyRollover() {
    return DB.getByStatus('pending').then(function (items) {
      if (!items || items.length === 0) return;

      var today = U.todayStr();
      var updates = [];
      var now = Date.now();

      items.forEach(function (item) {
        var changed = false;

        // 过期检查：基于 createdAt + EXPIRY_DAYS
        if (U.isExpired(item.createdAt, EXPIRY_DAYS)) {
          item.status = 'expired';
          changed = true;
        }

        // 未过期但 date 不是今天 → 自动带入
        if (item.status === 'pending' && item.date !== today) {
          item.date = today;
          changed = true;
        }

        if (changed) updates.push(DB.put(item));
      });

      if (updates.length > 0) {
        return Promise.all(updates).then(function () {
          var expiredCount = items.filter(function (i) { return i.status === 'expired'; }).length;
          if (expiredCount > 0) {
            console.log('[微光集] ' + expiredCount + ' 项已沉入遗忘之海');
          }
        });
      }
    });
  }

  /* ═══════════════════════════════════════
    CRUD — 核心操作
  ═══════════════════════════════════════ */

  /** 新建一个待完成事项 */
  function add(text) {
    var light = {
      id: U.UUID(),
      text: text,
      createdAt: Date.now(),
      completedAt: null,
      date: U.todayStr(),
      status: 'pending'
    };
    return DB.put(light).then(function () { return light; });
  }

  /** 标记完成 */
  function complete(id) {
    return DB.get(id).then(function (light) {
      if (!light) throw new Error('Light not found: ' + id);
      light.status = 'done';
      light.completedAt = Date.now();
      light.date = U.todayStr(); // 完成日即为归属日
      return DB.put(light).then(function () { return light; });
    });
  }

  /** 取消完成（恢复为 pending） */
  function uncomplete(id) {
    return DB.get(id).then(function (light) {
      if (!light) throw new Error('Light not found: ' + id);
      if (light.status !== 'done') return light;
      light.status = 'pending';
      light.completedAt = null;
      return DB.put(light).then(function () { return light; });
    });
  }

  /** 彻底删除 */
  function removeLight(id) {
    return DB.remove(id);
  }

  /* ═══════════════════════════════════════
    查询 — 按天 / 按状态 / 范围
  ═══════════════════════════════════════ */

  /** 今日活跃事项（pending + 今日完成） */
  function getToday() {
    return DB.getByDate(U.todayStr());
  }

  /** 某天的全部事项（只读视图） */
  function getDay(date) {
    return DB.getByDate(date);
  }

  /** 日期范围内全部事项 */
  function getDayRange(startDate, endDate) {
    return DB.getByDateRange(startDate, endDate);
  }

  /** 遗忘之海 — 所有 expired 事项 */
  function getExpired() {
    return DB.getByStatus('expired');
  }

  /** 某天统计 */
  function getStats(date) {
    return DB.getByDate(date).then(function (items) {
      var done = items.filter(function (i) { return i.status === 'done'; }).length;
      return { total: items.length, done: done, date: date || U.todayStr() };
    });
  }

  /** 获取所有 pending 事项（跨天） */
  function getPending() {
    return DB.getByStatus('pending');
  }

  /** 获取所有事项 */
  function getAll() {
    return DB.getAll();
  }

  /* ═══════════════════════════════════════
    设置
  ═══════════════════════════════════════ */
  function setExpiryDays(days) {
    EXPIRY_DAYS = days;
  }

  function getExpiryDays() {
    return EXPIRY_DAYS;
  }

  /* ─── 导出 ─── */
  return {
    init: init,
    isReady: isReady,
    add: add,
    complete: complete,
    uncomplete: uncomplete,
    remove: removeLight,
    getToday: getToday,
    getDay: getDay,
    getDayRange: getDayRange,
    getExpired: getExpired,
    getStats: getStats,
    getPending: getPending,
    getAll: getAll,
    setExpiryDays: setExpiryDays,
    getExpiryDays: getExpiryDays,
    // 别名，方便视图层
    deleteLight: removeLight
  };
})();
