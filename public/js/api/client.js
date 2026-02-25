
// api/client.js

import { safeGet, safeSet, safeRemove } from '../core/storage.js';
import { showToast } from '../core/toast.js';

const API_BASE = '';

function getAuth() {
  return safeGet('auth');
}

function setAuth(data) {
  safeSet('auth', data);
}

function clearAuth() {
  safeRemove('auth');
}

async function refreshToken() {
  const auth = getAuth();
  if (!auth?.refreshToken) return false;

  try {
    const res = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken })
    });

    if (!res.ok) return false;

    const data = await res.json();
    setAuth({ ...auth, accessToken: data.accessToken });
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch(url, options = {}, retry = true) {
  const auth = getAuth();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (auth?.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`;
  }

  const response = await fetch(API_BASE + url, {
    ...options,
    headers
  });

  if (response.ok) {
    return response.json();
  }

  let errorData = null;
  try {
    errorData = await response.json();
  } catch {}

  // Global Error Format handling
  const status = response.status;
  const code = errorData?.code;

  if (status === 401 && code === 'AUTH_TOKEN_EXPIRED' && retry) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return apiFetch(url, options, false);
    } else {
      clearAuth();
      window.location.href = 'login.html';
      return;
    }
  }

  if (status === 401 && code === 'AUTH_REFRESH_EXPIRED') {
    clearAuth();
    window.location.href = 'login.html';
    return;
  }

  if (status === 409) {
    showToast(errorData?.message || '상태 충돌 발생');
  }

  if (status === 422) {
    showToast(errorData?.message || '요청을 처리할 수 없습니다.');
  }

  throw errorData || { status };
}
