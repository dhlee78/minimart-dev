
// core/storage.js
export function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function safeGet(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}
