/**
 * File Storage - 使用 IndexedDB 存储 FileSystemDirectoryHandle
 * 解决 File System Access API 的权限持久化问题
 */

const DB_NAME = 'GPT2ObsidianDB';
const DB_VERSION = 1;
const STORE_NAME = 'directoryHandles';

// 打开数据库
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// 保存目录 handle
async function saveDirectoryHandle(key, handle) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(handle, key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// 获取目录 handle
async function getDirectoryHandle(key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// 检查 handle 是否有效
async function verifyDirectoryHandle(handle) {
  if (!handle) return false;

  try {
    // 尝试请求权限
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      return true;
    }

    // 请求权限
    const newPermission = await handle.requestPermission({ mode: 'readwrite' });
    return newPermission === 'granted';
  } catch (error) {
    console.error('[FileStorage] Verify handle error:', error);
    return false;
  }
}

// 删除目录 handle
async function deleteDirectoryHandle(key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
