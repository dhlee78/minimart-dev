
// core/state.js
export const DEFAULT_STATE = {
  category: 'all',
  search: '',
  sort: 'reco',
  page: 1,
  min: '',
  max: '',
  rating: 0,
  shipping: 'all',
  freeShipping: false,
  inStock: false,
  view: 'grid'
};

let currentState = null;

export function clamp(value, min, max) {
  const num = Number(value);
  if (isNaN(num)) return min;
  return Math.min(Math.max(num, min), max);
}

export function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  const state = { ...DEFAULT_STATE };

  Object.keys(DEFAULT_STATE).forEach(key => {
    if (params.has(key)) {
      state[key] = params.get(key);
    }
  });

  state.page = clamp(state.page, 1, 9999);
  currentState = state;
  return state;
}

export function getState() {
  return currentState || parseQuery();
}

export function setState(nextState, { replace = false } = {}) {
  currentState = { ...currentState, ...nextState };
  const params = new URLSearchParams(currentState);
  const newUrl = '?' + params.toString();

  if (replace) {
    window.history.replaceState({}, '', newUrl);
  } else {
    window.history.pushState({}, '', newUrl);
  }

  window.dispatchEvent(new CustomEvent('statechange', { detail: currentState }));
}

window.addEventListener('popstate', () => {
  parseQuery();
  window.dispatchEvent(new CustomEvent('statechange', { detail: currentState }));
});
