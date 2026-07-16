/**
 * 微光集 — IndexedDB 存储层
 * 封装数据库打开、CRUD、按索引查询
 */
window.LightletDB = (function () {
  const DB_NAME = 'lightlet';
  const DB_VERSION = 1;
  const STORE_NAME = 'lights';

  let _db = null;

  /* ─── 打开数据库 ─── */
  function open() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);

      var req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      req.onsuccess = function (e) {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = function (e) {
        reject(e.target.error);
      };
    });
  }

  /* ─── 通用事务辅助 ─── */
  function store(mode) {
    if (!_db) throw new Error('DB not opened');
    var tx = _db.transaction(STORE_NAME, mode);
    return { store: tx.objectStore(STORE_NAME), tx: tx };
  }

  function promisify(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  /* ─── CRUD ─── */
  function put(light) {
    var s = store('readwrite');
    return promisify(s.store.put(light));
  }

  function get(id) {
    var s = store('readonly');
    return promisify(s.store.get(id));
  }

  function remove(id) {
    var s = store('readwrite');
    return promisify(s.store.delete(id));
  }

  function getAll() {
    var s = store('readonly');
    return promisify(s.store.getAll());
  }

  /* ─── 按索引查询 ─── */
  function getByIndex(indexName, value) {
    var s = store('readonly');
    return promisify(s.store.index(indexName).getAll(value));
  }

  function getByDate(date) {
    return getByIndex('date', date);
  }

  function getByStatus(status) {
    return getByIndex('status', status);
  }

  /* ─── 日期范围查询 ─── */
  function getByDateRange(startDate, endDate) {
    var s = store('readonly');
    var range = IDBKeyRange.bound(startDate, endDate);
    return promisify(s.store.index('date').getAll(range));
  }

  /* ─── 批量操作 ─── */
  function putAll(lights) {
    var s = store('readwrite');
    var promises = lights.map(function (light) {
      return promisify(s.store.put(light));
    });
    return Promise.all(promises);
  }

  function count() {
    var s = store('readonly');
    return promisify(s.store.count());
  }

  /* ─── memory store check for migration ─── */
  function getRawStore() {
    return store('readwrite').store;
  }

  return {
    open: open,
    put: put,
    get: get,
    remove: remove,
    getAll: getAll,
    putAll: putAll,
    count: count,
    getByIndex: getByIndex,
    getByDate: getByDate,
    getByStatus: getByStatus,
    getByDateRange: getByDateRange,
    STORE_NAME: STORE_NAME
  };
})();
