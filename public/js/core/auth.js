
// core/auth.js
import { safeGet, safeRemove } from './storage.js';

export function isLoggedIn() {
  const auth = safeGet('auth');
  return auth && auth.isLoggedIn === true;
}

export function logout() {
  safeRemove('auth');
  window.location.reload();
}

export function requireLogin(redirect) {
  if (!isLoggedIn()) {
    window.location.href = `login.html?redirect=${redirect}`;
    return false;
  }
  return true;
}
