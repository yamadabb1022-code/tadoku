// 利用者が取り込んだ教材（本文を含むため大きくなりやすい）を IndexedDB に保存する
const DB_NAME = 'tadoku';
const STORE = 'books';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB を利用できません')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const getAllBooks = () => tx('readonly', (s) => s.getAll()).catch((e) => { console.warn(e); return []; });
export const putBook = (book) => tx('readwrite', (s) => s.put(book));
export const deleteBook = (id) => tx('readwrite', (s) => s.delete(id));
export const clearBooks = () => tx('readwrite', (s) => s.clear());
