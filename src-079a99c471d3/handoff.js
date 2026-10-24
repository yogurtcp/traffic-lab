// IndexedDB uses structured cloning, preserving Maps, Infinity and shared chart
// samples. Each window gets a separate handoff so concurrent runs never clash.
const DATABASE = "loop-lab-updates-v1";
let connection;
function database() {
  if (!globalThis.indexedDB)
    return Promise.reject(new Error("Session storage is unavailable."));
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("handoffs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close an older Loop Lab window to finish updating."));
  });
  return connection;
}
export function windowKey() {
  const key = `loop-lab-window-v1:${new URL("./", location.href).pathname}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}
async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handoffs", mode);
    const request = operation(tx.objectStore("handoffs"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Saving the session was interrupted."));
  });
}
export async function readHandoff() {
  if (!globalThis.indexedDB) return null;
  try {
    return await transaction("readonly", (store) => store.get(windowKey()));
  } catch {
    return null;
  }
}
export async function saveHandoff(value) {
  const id = windowKey();
  await transaction("readwrite", (store) => store.put(value, id));
}
export async function clearHandoff() {
  await transaction("readwrite", (store) => store.delete(windowKey()));
}
