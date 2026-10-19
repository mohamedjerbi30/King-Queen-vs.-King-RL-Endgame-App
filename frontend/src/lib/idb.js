// Minimal IndexedDB wrapper. Q-tables are a few MB each, too big for
// localStorage, so agents trained in the browser are kept here.
const DB_NAME = "kqk";
const VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("agents")) db.createObjectStore("agents", { keyPath: "id" }); // metadata
        if (!db.objectStoreNames.contains("qtables")) db.createObjectStore("qtables"); // id -> {keys, values, visits}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idb = {
  getAll: (store) => run(store, "readonly", (s) => s.getAll()),
  get: (store, key) => run(store, "readonly", (s) => s.get(key)),
  put: (store, value, key) => run(store, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  delete: (store, key) => run(store, "readwrite", (s) => s.delete(key)),
  clear: (store) => run(store, "readwrite", (s) => s.clear()),
};
