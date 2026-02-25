
// core/toast.js
let currentToast = null;

export function showToast(message) {
  if (currentToast) {
    currentToast.remove();
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.padding = '12px 16px';
  toast.style.background = '#111827';
  toast.style.color = '#fff';
  toast.style.borderRadius = '8px';
  toast.style.fontSize = '14px';
  toast.style.zIndex = '9999';

  document.body.appendChild(toast);
  currentToast = toast;

  setTimeout(() => {
    toast.remove();
    currentToast = null;
  }, 2400);
}
