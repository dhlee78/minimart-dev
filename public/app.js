// MiniMart v5 (풀 옵션 QA 목업)
// - URL query로 상태 유지
// - 찜(위시리스트) + 최근 본 상품
// - 쿠폰/할인 UI + 옵션 선택 모달(의류/신발)
// - 접근성: 포커스 트랩, ESC 닫기
// NOTE: No real brand assets/logos/copy.

const LS = {
  cart:"minimart_cart",
  auth:"minimart_auth",
  orders:"minimart_orders",
  recents:"minimart_recent_searches",
  view:"minimart_view",
  filters:"minimart_filters",
  wishlist:"minimart_wishlist",
  recentlyViewed:"minimart_recently_viewed",
};

/* ===== Missing helpers (FIX) ===== */

// 배송 라벨 (필터/표시용)
function shipLabel(p){
  const s = p?.ship || "normal";
  if(s === "rocket") return "로켓배송";
  if(s === "dawn") return "새벽배송";
  return "일반배송";
}

// 카드 뱃지 정보
function badgeInfo(p){
  if(!p) return {text:"", cls:""};
  if(p.stock === 0) return {text:"품절", cls:"soldout"};
  if(typeof p.stock === "number" && p.stock > 0 && p.stock <= 3) return {text:"재고부족", cls:"low"};
  if(p.ship === "rocket") return {text:"로켓", cls:"rocket"};
  return {text:"", cls:""};
}

// 최근 본 상품(LocalStorage)
function getViewed(){
  try{
    const v = JSON.parse(localStorage.getItem(LS.recentlyViewed) || "[]");
    return Array.isArray(v) ? v : [];
  }catch(_){ return []; }
}
function setViewed(ids){
  try{ localStorage.setItem(LS.recentlyViewed, JSON.stringify(ids || [])); }catch(_){}
}
function pushViewed(id){
  if(!id) return;
  const ids = getViewed().filter(x => x !== id);
  ids.unshift(id);
  setViewed(ids.slice(0, 12)); // 최근본 최대 12개 유지
}

// 찜(LocalStorage) — 렌더/토글 안정성
function getWishlist(){
  try{
    const v = JSON.parse(localStorage.getItem(LS.wishlist) || "[]");
    return Array.isArray(v) ? v : [];
  }catch(_){ return []; }
}
function setWishlist(ids){
  try{ localStorage.setItem(LS.wishlist, JSON.stringify(ids || [])); }catch(_){}
}
function isWished(id){
  return getWishlist().includes(id);
}
function toggleWish(id){
  const w = getWishlist();
  const idx = w.indexOf(id);
  let on = false;
  if(idx >= 0){
    w.splice(idx, 1);
    on = false;
  }else{
    w.unshift(id);
    on = true;
  }
  setWishlist(w.slice(0, 200));
  return on;
}

/* ================================== */





// Toast helper (required by many flows)
let __toastTimer = null;
function toast(message){
  try{
    if(!message) return;
    let el = document.querySelector(".toast");
    if(!el){
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = String(message);
    el.classList.add("show");
    clearTimeout(__toastTimer);
    __toastTimer = setTimeout(()=>{ el.classList.remove("show"); }, 2400);
  }catch(_){}
}

const API = {
  base: "", // same-origin
  timeoutMs: 8000,
  maxRetries: 2,
};

function getToken(){
  try{
    const a = JSON.parse(localStorage.getItem(LS.auth)||"null");
    // older flows store only {email,...}; treat that as authed for UI
    return (a && (a.token || a.email)) ? (a.token || a.email) : null;
  }catch(_){ return null; }
}

function setAuth(auth){
  localStorage.setItem(LS.auth, JSON.stringify(auth));
}

function clearAuth(){
  localStorage.removeItem(LS.auth);
}

async function apiFetch(path, { method="GET", body=null, headers={}, retry=API.maxRetries } = {}){
  const url = API.base + path;
  const reqId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now()+"-"+Math.random().toString(16).slice(2));
  const h = { "Accept":"application/json", ...headers, "X-Request-Id": reqId };
  const token = getToken();
  if(token) h["Authorization"] = `Bearer ${token}`;
  if(body && !(body instanceof FormData)){
    h["Content-Type"] = "application/json";
  }

  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), API.timeoutMs);

  try{
    const res = await fetch(url, {
      method,
      headers: h,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : null,
      signal: ctrl.signal,
      credentials: "same-origin",
    });
    clearTimeout(t);

    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json().catch(()=>null) : await res.text().catch(()=>null);

    if(res.status === 401){
      // token invalid/expired
      clearAuth();
      const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
      syncAuthUI();
  toast("로그인이 필요합니다.");
      setTimeout(()=>location.href=`login.html?next=${next}`, 500);
      throw new Error("UNAUTHORIZED");
    }
    if(!res.ok){
      const msg = (data && data.message) ? data.message : `요청 실패 (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }catch(err){
    clearTimeout(t);
    const isNet = (err.name==="AbortError") || (err.message==="Failed to fetch");
    if(isNet && retry>0){
      await new Promise(r=>setTimeout(r, 350));
      return apiFetch(path, { method, body, headers, retry: retry-1 });
    }
    throw err;
  }
}

async function apiLogin(email,password){
  return apiFetch("/api/auth/login", { method:"POST", body:{ email, password } });
}
async function apiLogout(){
  try{ await apiFetch("/api/auth/logout", { method:"POST" }); }catch(_){}
  clearAuth();
}
async function apiGetProducts(){
  // Fetch enough items for client-side pagination (server defaults to 12)
  const res = await apiFetch("/api/products?page=1&perPage=60");
  return res.items || [];
}
async function apiGetProduct(id){
  return apiFetch(`/api/products/${encodeURIComponent(id)}`);
}
async function apiGetCart(){
  const res = await apiFetch("/api/cart");
  return res.items || [];
}
async function apiAddCartItem(productId, qty=1, opt=null){
  return apiFetch("/api/cart/items", { method:"POST", body:{ productId, qty, opt } });
}
async function apiUpdateCartItem(lineId, qty){
  return apiFetch(`/api/cart/items/${encodeURIComponent(lineId)}`, { method:"PATCH", body:{ qty } });
}
async function apiDeleteCartItem(lineId){
  return apiFetch(`/api/cart/items/${encodeURIComponent(lineId)}`, { method:"DELETE" });
}
async function apiCheckout(payload){
  return apiFetch("/api/orders/checkout", { method:"POST", body: payload });
}
async function apiGetOrders(){
  const res = await apiFetch("/api/orders");
  return res.items || [];
}

const categories = [
  { id:"all", name:"전체" },
  { id:"rocket", name:"로켓배송" },
  { id:"dawn", name:"새벽배송" },
  { id:"apparel", name:"의류" },
  { id:"shoes", name:"신발" },
  { id:"goods", name:"잡화" },
  { id:"qa", name:"QA 테스트" },
];

const optionsByCat = {
  apparel: { sizes:["S","M","L","XL"], colors:["Black","Navy","Gray","White"] },
  shoes:   { sizes:["240","250","260","270","280"], colors:["Black","White","Beige"] },
};

const mockProducts = [
  { id:"p-4001", cat:"rocket", name:"로켓 데일리 티셔츠", price:19900, stock:10, ship:"rocket", rating:4.7, reviews:1240, discount:10, coupon:true },
  { id:"p-4002", cat:"dawn", name:"새벽배송 간편 샐러드 세트", price:12900, stock:14, ship:"dawn", rating:4.6, reviews:880, discount:0, coupon:false },
  { id:"p-4003", cat:"apparel", name:"미니멀 후드 집업", price:39900, stock:1, ship:"rocket", rating:4.5, reviews:312, discount:15, coupon:true },
  { id:"p-4004", cat:"apparel", name:"슬림 데님 팬츠", price:45900, stock:0, ship:"rocket", rating:4.2, reviews:98, discount:0, coupon:false },
  { id:"p-4005", cat:"shoes", name:"러닝 스니커즈", price:79000, stock:23, ship:"rocket", rating:4.6, reviews:802, discount:5, coupon:true },
  { id:"p-4006", cat:"goods", name:"무지 양말 6팩", price:9900, stock:99, ship:"rocket", rating:4.8, reviews:5400, discount:0, coupon:true },
  { id:"p-4007", cat:"goods", name:"데스크 정리 트레이", price:14900, stock:16, ship:"normal", rating:4.3, reviews:640, discount:0, coupon:false },
  { id:"p-4008", cat:"shoes", name:"샌들 슬라이드", price:23900, stock:8, ship:"normal", rating:4.0, reviews:140, discount:0, coupon:false },
  { id:"p-4009", cat:"rocket", name:"로켓 미니 크로스백", price:34900, stock:2, ship:"rocket", rating:4.4, reviews:210, discount:20, coupon:true },
  { id:"p-4010", cat:"qa", name:"긴 상품명 테스트용 — UI 줄바꿈/오버플로/툴팁 확인 12345", price:12900, stock:7, ship:"normal", rating:4.1, reviews:12, discount:0, coupon:false },
  { id:"p-4011", cat:"qa", name:"특수문자/이모지 테스트 😄 [!@#$%]", price:15900, stock:4, ship:"rocket", rating:3.9, reviews:5, discount:0, coupon:false },
  { id:"p-4012", cat:"dawn", name:"새벽배송 우유 2L", price:6800, stock:25, ship:"dawn", rating:4.7, reviews:7200, discount:0, coupon:true },
  { id:"p-4013", cat:"goods", name:"캠핑 랜턴", price:59000, stock:6, ship:"rocket", rating:4.5, reviews:560, discount:0, coupon:false },
  { id:"p-4014", cat:"apparel", name:"봄 자켓", price:89000, stock:3, ship:"normal", rating:4.2, reviews:240, discount:8, coupon:true },
  { id:"p-4015", cat:"rocket", name:"로켓 USB-C 케이블 2m", price:8900, stock:50, ship:"rocket", rating:4.8, reviews:11000, discount:0, coupon:true },
  { id:"p-5001", cat:"rocket", name:"로켓 고속 충전기", price:23900, stock:80, ship:"rocket", rating:4.8, reviews:560, views:120, discount:5, coupon:false },
  { id:"p-5002", cat:"dawn", name:"새벽배송 계란 30구", price:39900, stock:3, ship:"dawn", rating:4.1, reviews:560, views:0, discount:20, coupon:false },
  { id:"p-5003", cat:"apparel", name:"롱 스커트", price:21900, stock:80, ship:"normal", rating:4.7, reviews:34, views:560, discount:8, coupon:true },
  { id:"p-5004", cat:"shoes", name:"하이탑 스니커즈", price:16900, stock:3, ship:"normal", rating:4.7, reviews:5, views:10, discount:5, coupon:false },
  { id:"p-5005", cat:"goods", name:"핸드타월 5장", price:12900, stock:30, ship:"normal", rating:4.7, reviews:560, views:120, discount:0, coupon:true },
  { id:"p-5006", cat:"qa", name:"QA 더미상품 D", price:10900, stock:0, ship:"normal", rating:3.8, reviews:120, views:0, discount:12, coupon:false },
  { id:"p-5007", cat:"rocket", name:"로켓 프리미엄 주방세제", price:30900, stock:7, ship:"rocket", rating:4.1, reviews:34, views:240, discount:8, coupon:false },
  { id:"p-5008", cat:"rocket", name:"로켓 데스크 패드", price:9900, stock:50, ship:"rocket", rating:4.4, reviews:5600, views:240, discount:5, coupon:true },
  { id:"p-5009", cat:"rocket", name:"로켓 고속 충전기", price:51900, stock:5, ship:"rocket", rating:4.4, reviews:1200, views:240, discount:12, coupon:false },
  { id:"p-5010", cat:"apparel", name:"데님 팬츠", price:52900, stock:15, ship:"normal", rating:3.7, reviews:5, views:0, discount:15, coupon:false },
  { id:"p-5011", cat:"shoes", name:"로퍼 클래식", price:15900, stock:10, ship:"normal", rating:4.6, reviews:80, views:10, discount:5, coupon:false },
  { id:"p-5012", cat:"qa", name:"QA 더미상품 D", price:13900, stock:15, ship:"normal", rating:3.7, reviews:240, views:560, discount:10, coupon:false },
  { id:"p-5013", cat:"rocket", name:"로켓 무선 마우스", price:40900, stock:7, ship:"rocket", rating:4.4, reviews:12, views:120, discount:20, coupon:false },
  { id:"p-5014", cat:"qa", name:"QA 더미상품 F", price:29900, stock:3, ship:"normal", rating:4.4, reviews:11000, views:60, discount:5, coupon:false },
  { id:"p-5015", cat:"apparel", name:"베이직 맨투맨", price:10900, stock:30, ship:"normal", rating:4.2, reviews:560, views:240, discount:5, coupon:false },
  { id:"p-5016", cat:"rocket", name:"로켓 프리미엄 주방세제", price:12900, stock:80, ship:"rocket", rating:4.2, reviews:120, views:0, discount:15, coupon:false },
  { id:"p-5017", cat:"apparel", name:"경량 패딩", price:15900, stock:30, ship:"normal", rating:4.8, reviews:120, views:10, discount:12, coupon:false },
  { id:"p-5018", cat:"rocket", name:"로켓 스테인리스 텀블러", price:23900, stock:7, ship:"rocket", rating:4.7, reviews:12, views:10, discount:15, coupon:true },
  { id:"p-5019", cat:"shoes", name:"로퍼 클래식", price:7900, stock:7, ship:"normal", rating:3.9, reviews:5600, views:120, discount:5, coupon:false },
  { id:"p-5020", cat:"shoes", name:"하이탑 스니커즈", price:19900, stock:10, ship:"normal", rating:4.1, reviews:34, views:10, discount:8, coupon:true },
  { id:"p-5021", cat:"shoes", name:"윈터 부츠 방한", price:27900, stock:7, ship:"normal", rating:4.1, reviews:12, views:60, discount:12, coupon:false },
  { id:"p-5022", cat:"goods", name:"휴대용 거울", price:53900, stock:0, ship:"normal", rating:3.9, reviews:34, views:120, discount:15, coupon:false },
  { id:"p-5023", cat:"dawn", name:"새벽배송 닭가슴살 10팩", price:8900, stock:15, ship:"dawn", rating:4.7, reviews:1200, views:60, discount:10, coupon:false },
  { id:"p-5024", cat:"dawn", name:"새벽배송 샐러드 믹스", price:40900, stock:5, ship:"dawn", rating:4.6, reviews:34, views:0, discount:15, coupon:true },
  { id:"p-5025", cat:"apparel", name:"데님 팬츠", price:14900, stock:30, ship:"normal", rating:4.3, reviews:1200, views:25, discount:10, coupon:true },
  { id:"p-5026", cat:"dawn", name:"새벽배송 바나나 1kg", price:42900, stock:10, ship:"dawn", rating:4.5, reviews:12, views:240, discount:15, coupon:false },
  { id:"p-5027", cat:"goods", name:"데일리 에코백", price:52900, stock:0, ship:"normal", rating:3.9, reviews:80, views:10, discount:0, coupon:false },
  { id:"p-5028", cat:"shoes", name:"로퍼 클래식", price:16900, stock:50, ship:"normal", rating:3.9, reviews:240, views:240, discount:8, coupon:false },
  { id:"p-5029", cat:"qa", name:"QA 더미상품 A", price:11900, stock:15, ship:"normal", rating:4.4, reviews:1200, views:10, discount:10, coupon:false },
  { id:"p-5030", cat:"qa", name:"QA 더미상품 F", price:12900, stock:5, ship:"normal", rating:4.8, reviews:560, views:25, discount:8, coupon:true },
  { id:"p-5031", cat:"qa", name:"QA 더미상품 B", price:33900, stock:0, ship:"normal", rating:4.8, reviews:5600, views:10, discount:12, coupon:true },
  { id:"p-5032", cat:"shoes", name:"하이탑 스니커즈", price:26900, stock:0, ship:"normal", rating:3.9, reviews:120, views:120, discount:8, coupon:true },
  { id:"p-5033", cat:"goods", name:"데일리 에코백", price:53900, stock:30, ship:"normal", rating:4.3, reviews:12, views:10, discount:20, coupon:false },
  { id:"p-5034", cat:"dawn", name:"새벽배송 닭가슴살 10팩", price:30900, stock:3, ship:"dawn", rating:4.4, reviews:34, views:60, discount:12, coupon:false },
  { id:"p-5035", cat:"dawn", name:"새벽배송 그릭요거트", price:14900, stock:15, ship:"dawn", rating:4.2, reviews:11000, views:240, discount:8, coupon:true },
  { id:"p-5036", cat:"shoes", name:"러닝화 경량 모델", price:31900, stock:5, ship:"normal", rating:4.9, reviews:240, views:0, discount:12, coupon:false },
  { id:"p-5037", cat:"rocket", name:"로켓 고속 충전기", price:27900, stock:80, ship:"rocket", rating:4.1, reviews:560, views:60, discount:12, coupon:true },
  { id:"p-5038", cat:"dawn", name:"새벽배송 아보카도 2입", price:27900, stock:80, ship:"dawn", rating:4.9, reviews:12, views:60, discount:20, coupon:false },
  { id:"p-5039", cat:"goods", name:"미니 파우치", price:13900, stock:10, ship:"normal", rating:4.5, reviews:1200, views:120, discount:15, coupon:false },
  { id:"p-5040", cat:"goods", name:"휴대용 거울", price:29900, stock:50, ship:"normal", rating:3.7, reviews:120, views:560, discount:20, coupon:false },
  { id:"p-5041", cat:"dawn", name:"새벽배송 샐러드 믹스", price:33900, stock:0, ship:"dawn", rating:4.2, reviews:5, views:25, discount:15, coupon:false },
  { id:"p-5042", cat:"rocket", name:"로켓 데스크 패드", price:51900, stock:30, ship:"rocket", rating:4.0, reviews:240, views:240, discount:8, coupon:false },
  { id:"p-5043", cat:"shoes", name:"하이탑 스니커즈", price:5900, stock:10, ship:"normal", rating:4.2, reviews:5, views:10, discount:0, coupon:false },
  { id:"p-5044", cat:"rocket", name:"로켓 고속 충전기", price:42900, stock:7, ship:"rocket", rating:4.4, reviews:120, views:240, discount:12, coupon:false },
  { id:"p-5045", cat:"dawn", name:"새벽배송 닭가슴살 10팩", price:18900, stock:30, ship:"dawn", rating:4.1, reviews:80, views:60, discount:0, coupon:false },
];

let products = mockProducts; // replaced by API on load


let state = {
  cat:"all",
  sort:"reco",
  page:1,
  perPage: 12,
  view: "grid", // grid|list
  q: "",
  filters: {
    priceMin: "",
    priceMax: "",
    ratingMin: "0",
    freeShip: false,
    inStockOnly: false,
    shipType: "all", // all|rocket|dawn|normal
  }
};

function money(n){ return n.toLocaleString("ko-KR")+"원"; }

/* price helpers */
function discountedPrice(p){
  if(!p) return 0;
  // prefer explicit final/sale price fields if API provides them
  const direct = [p.finalPrice, p.salePrice, p.discountedPrice, p.payPrice, p.priceFinal]
    .find(v => typeof v === "number" && !isNaN(v));
  if(typeof direct === "number") return Math.max(0, Math.round(direct));

  const base = (typeof p.price === "number" ? p.price : (parseInt(p.price||"0",10) || 0));
  // discount can be percent (0~100) or decimal (0~1) or absolute amount
  const d = p.discount;
  let out = base;

  if(typeof d === "number" && !isNaN(d) && d > 0){
    if(d > 0 && d <= 1){
      out = base * (1 - d);
    }else if(d > 1 && d < 100){
      out = base * (1 - d/100);
    }else if(d >= 100){
      out = Math.max(0, base - d);
    }
  }
  return Math.max(0, Math.round(out));
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

/* URL state */
function readUrlState(){
  const p = new URLSearchParams(location.search);
  if(p.has("cat")) state.cat = p.get("cat") || "all";
  if(p.has("sort")) state.sort = p.get("sort") || "reco";
  if(p.has("page")) state.page = parseInt(p.get("page")||"1", 10) || 1;
  if(p.has("view")) state.view = p.get("view")==="list" ? "list" : "grid";
  if(p.has("q")) state.q = p.get("q") || "";
  // filters
  if(p.has("min")) state.filters.priceMin = p.get("min") || "";
  if(p.has("max")) state.filters.priceMax = p.get("max") || "";
  if(p.has("rate")) state.filters.ratingMin = p.get("rate") || "0";
  if(p.has("ship")) state.filters.shipType = p.get("ship") || "all";
  if(p.has("free")) state.filters.freeShip = p.get("free")==="1";
  if(p.has("stock")) state.filters.inStockOnly = p.get("stock")==="1";
}
function writeUrlState(replace=true){
  const p = new URLSearchParams();
  if(state.cat!=="all") p.set("cat", state.cat);
  if(state.sort!=="reco") p.set("sort", state.sort);
  if(state.page!==1) p.set("page", String(state.page));
  if(state.view!=="grid") p.set("view", state.view);
  if(state.q.trim()) p.set("q", state.q.trim());
  if(state.filters.priceMin) p.set("min", state.filters.priceMin);
  if(state.filters.priceMax) p.set("max", state.filters.priceMax);
  if(state.filters.ratingMin!=="0") p.set("rate", state.filters.ratingMin);
  if(state.filters.shipType!=="all") p.set("ship", state.filters.shipType);
  if(state.filters.freeShip) p.set("free","1");
  if(state.filters.inStockOnly) p.set("stock","1");
  const url = location.pathname + (p.toString()?("?"+p.toString()):"");
  if(replace) history.replaceState({}, "", url);
  else history.pushState({}, "", url);
}

/* persistence */
function saveState(){
  localStorage.setItem(LS.view, JSON.stringify({ view: state.view }));
  localStorage.setItem(LS.filters, JSON.stringify(state.filters));
}
function loadState(){
  try{
    const v = JSON.parse(localStorage.getItem(LS.view)||"{}");
    if(v.view) state.view = v.view;
  }catch{}
  try{
    const f = JSON.parse(localStorage.getItem(LS.filters)||"{}");
    state.filters = { ...state.filters, ...f };
  }catch{}
}

/* cart */

let cartCache = null; // { items:[{id, qty, opt, lineId, product}], mapKeyToLineId:{} }

function cartKey(pid, opt){
  return JSON.stringify({ id: pid, opt: normalizeOpt(opt) });
}

function isAuthed(){
  try{
    const a = JSON.parse(localStorage.getItem(LS.auth)||"null");
    return !!(a && (a.token || a.email));
  }catch(_){
    return false;
  }
}


function syncAuthUI(){
  const authed = isAuthed();
  // Login link(s)
  document.querySelectorAll('a.action[href="login.html"]').forEach(el => {
    el.style.display = authed ? "none" : "";
  });
  // Logout button(s)
  document.querySelectorAll('[data-logout]').forEach(el => {
    el.style.display = authed ? "" : "none";
  });
}



// Guest cart (localStorage) helpers
function getGuestCart(){ try { return JSON.parse(localStorage.getItem(LS.cart)||"[]"); } catch { return []; } }
function setGuestCart(items){ localStorage.setItem(LS.cart, JSON.stringify(items)); }

function getCart(){
  if(isAuthed()){
    return (cartCache && cartCache.items) ? cartCache.items : [];
  }
  return getGuestCart();
}

function setCart(items){
  if(isAuthed()){
    // ignore direct set; server is source of truth
    cartCache = cartCache || { items:[], map:{} };
    cartCache.items = items;
    updateCartBadge();
  syncAuthUI();
  // Auth UI: show either Login or Logout (not both)
  const authed = isAuthed();
  document.querySelectorAll('a.action[href="login.html"]').forEach(el => el.style.display = authed ? "none" : "");
  document.querySelectorAll("[data-logout]").forEach(el => el.style.display = authed ? "" : "none");

    return;
  }
  setGuestCart(items);
  updateCartBadge();
}

function cartCount(){
  return getCart().reduce((a,c)=>a+(c.qty||0),0);
}

async function refreshCart(){
  if(!isAuthed()){
    cartCache = null;
    updateCartBadge();
    return getGuestCart();
  }
  const lines = await apiGetCart();
  const items = lines.map(l=>({
    id: l.productId,
    qty: l.qty,
    opt: l.opt || null,
    lineId: l.lineId,
    product: l.product || null
  }));
  const map = {};
  items.forEach(it=>{ map[cartKey(it.id, it.opt)] = it.lineId; });
  cartCache = { items, map };
  updateCartBadge();
  return items;
}

function updateCartBadge(){
  const el = document.querySelector("[data-cart-badge]");
  if(!el) return;
  const c = cartCount();
  el.textContent = c>99 ? "99+" : String(c);
  el.style.display = c>0 ? "inline-flex" : "none";
}

function addToCart(pid, qty=1, opt=null){
  const p=products.find(x=>x.id===pid);
  if(!p) return { ok:false, msg:"상품을 찾을 수 없습니다." };
  if(p.stock===0) return { ok:false, msg:"품절 상품입니다." };

  if(!isAuthed()){
    const cart=getGuestCart();
    const key = cartKey(pid, opt);
    const found=cart.find(x=>cartKey(x.id, x.opt)===key);
    const next=(found?.qty||0)+qty;
    if(next>p.stock) return { ok:false, msg:`재고가 부족합니다. (최대 ${p.stock}개)` };
    if(found) found.qty=next; else cart.push({ id:pid, qty, opt: normalizeOpt(opt) });
    setGuestCart(cart);
    updateCartBadge();
    return { ok:true, msg:"장바구니에 담았습니다." };
  }

  // authed: server cart
  apiAddCartItem(pid, qty, normalizeOpt(opt))
    .then(()=>refreshCart())
    .then(()=>toast("장바구니에 담았습니다."))
    .catch((e)=>toast(e.message||"장바구니 추가 실패"));
  return { ok:true, msg:"처리 중..." };
}

function removeFromCart(pid, optKey=null){
  if(!isAuthed()){
    const cart=getGuestCart().filter(x=>{
      if(x.id!==pid) return true;
      if(optKey==null) return false;
      return cartKey(x.id, x.opt)!==optKey;
    });
    setGuestCart(cart);
    updateCartBadge();
    return;
  }
  const key = optKey || cartKey(pid, null);
  const lineId = cartCache && cartCache.map ? cartCache.map[key] : null;
  if(!lineId){ toast("항목을 찾을 수 없습니다."); return; }
  apiDeleteCartItem(lineId)
    .then(()=>refreshCart())
    .catch((e)=>toast(e.message||"삭제 실패"));
}

function updateQty(pid, optKey, qty){
  const p=products.find(x=>x.id===pid);
  if(!p) return { ok:false, msg:"상품을 찾을 수 없습니다." };
  qty = Math.max(1, qty);
  if(qty>p.stock) return { ok:false, msg:`재고가 부족합니다. (최대 ${p.stock}개)` };

  if(!isAuthed()){
    const cart=getGuestCart();
    const found=cart.find(x=>cartKey(x.id, x.opt)===optKey);
    if(!found) return { ok:false, msg:"장바구니 항목을 찾지 못했습니다." };
    found.qty=qty;
    setGuestCart(cart);
    updateCartBadge();
    return { ok:true, msg:"수량을 변경했습니다." };
  }

  const lineId = cartCache && cartCache.map ? cartCache.map[optKey] : null;
  if(!lineId) return { ok:false, msg:"항목을 찾지 못했습니다." };
  apiUpdateCartItem(lineId, qty)
    .then(()=>refreshCart())
    .catch((e)=>toast(e.message||"수량 변경 실패"));
  return { ok:true, msg:"처리 중..." };
}


function login(email,pw){
  const okEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if(!okEmail) return { ok:false, msg:"이메일 형식을 확인해주세요." };
  if((pw||"").length<8) return { ok:false, msg:"비밀번호는 8자 이상이어야 합니다." };
  setAuth({ email, token: "local-"+Math.random().toString(16).slice(2), at: Date.now() });
  return { ok:true, msg:"로그인 되었습니다." };
}
function logout(){
  localStorage.removeItem(LS.auth);
  toast("로그아웃 되었습니다.");
  setTimeout(()=>location.href="index.html", 600);
}

/* options modal + add to cart */
function normalizeOpt(opt){
  if(!opt) return null;
  const o = { ...(opt||{}) };
  if(!o.size) delete o.size;
  if(!o.color) delete o.color;
  return Object.keys(o).length ? o : null;
}
function addToCart(pid, qty=1, opt=null){
  const p=products.find(x=>x.id===pid);
  if(!p) return { ok:false, msg:"상품을 찾을 수 없습니다." };
  if(p.stock===0) return { ok:false, msg:"품절 상품입니다." };
  const cart=getCart();
  // include options in identity
  const key = JSON.stringify({ id:pid, opt: normalizeOpt(opt) });
  const found=cart.find(x=>JSON.stringify({id:x.id,opt:normalizeOpt(x.opt)})===key);
  const next=(found?.qty||0)+qty;
  if(next>p.stock) return { ok:false, msg:`재고가 부족합니다. (최대 ${p.stock}개)` };
  if(found) found.qty=next; else cart.push({ id:pid, qty, opt: normalizeOpt(opt) });
  setCart(cart);
  return { ok:true, msg:"장바구니에 담았습니다." };
}
function removeFromCart(pid, optKey=null){
  const cart=getCart().filter(x=>{
    if(x.id!==pid) return true;
    if(optKey==null) return false;
    return JSON.stringify({id:x.id,opt:normalizeOpt(x.opt)})!==optKey;
  });
  setCart(cart);
}
function updateQty(pid, optKey, qty){
  const p=products.find(x=>x.id===pid);
  if(!p) return { ok:false, msg:"상품을 찾을 수 없습니다." };
  qty = Math.max(1, qty);
  if(qty>p.stock) return { ok:false, msg:`재고가 부족합니다. (최대 ${p.stock}개)` };
  const cart=getCart();
  const it=cart.find(x=> JSON.stringify({id:x.id,opt:normalizeOpt(x.opt)})===optKey );
  if(!it) return { ok:false, msg:"장바구니에 상품이 없습니다." };
  it.qty=qty; setCart(cart);
  return { ok:true, msg:"수량이 변경되었습니다." };
}
function shippingFee(subtotal){ return subtotal>=50000?0:3000; }
function totals(){
  const lines=getCart().map(it=>{
    const p=products.find(x=>x.id===it.id);
    const price = p ? discountedPrice(p) : 0;
    return { ...it, product:p, unit:price, line:p?price*it.qty:0 };
  }).filter(x=>x.product);
  const subtotal=lines.reduce((a,c)=>a+c.line,0);
  const ship=shippingFee(subtotal);
  return { lines, subtotal, ship, total: subtotal+ship };
}

/* Search recents + autocomplete */
function getRecents(){ try { return JSON.parse(localStorage.getItem(LS.recents)||"[]"); } catch { return []; } }
function setRecents(arr){ localStorage.setItem(LS.recents, JSON.stringify(arr.slice(0,10))); }
function pushRecent(q){
  const t=q.trim(); if(!t) return;
  const arr=getRecents().filter(x=>x!==t);
  arr.unshift(t); setRecents(arr);
}
function clearRecents(){ setRecents([]); }

/* Focus trap helpers */
function trapFocus(container){
  const focusables = () => Array.from(container.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
  const onKey = (e) => {
    if(e.key !== "Tab") return;
    const items = focusables();
    if(items.length===0) return;
    const first = items[0];
    const last = items[items.length-1];
    if(e.shiftKey && document.activeElement === first){
      e.preventDefault(); last.focus();
    }else if(!e.shiftKey && document.activeElement === last){
      e.preventDefault(); first.focus();
    }
  };
  container.addEventListener("keydown", onKey);
  return () => container.removeEventListener("keydown", onKey);
}

/* Autocomplete */
function setupAutocomplete(){
  const input=document.querySelector("[data-search]");
  const box=document.querySelector("[data-autocomplete]");
  if(!input||!box) return;

  input.value = state.q || "";
  let activeIndex=-1;

  const suggestions = () => {
    const q=input.value.trim().toLowerCase();
    const rec = getRecents();
    const fromProducts = q.length
      ? products.filter(p=>p.name.toLowerCase().includes(q)).slice(0,8).map(p=>p.name)
      : [];
    const base = q.length ? fromProducts : rec;
    const uniq = [...new Set(base)].slice(0,8);
    return { q, items: uniq, isRecents: !q.length };
  };

  const render = () => {
    const { q, items, isRecents } = suggestions();
    if(items.length===0){
      box.classList.remove("show");
      return;
    }
    activeIndex = -1;
    box.innerHTML = `
      <div class="auto-head">
        <div class="t">${isRecents ? "최근 검색어" : "추천 검색어"}</div>
        ${isRecents ? `<button type="button" data-clear-recents>전체삭제</button>` : `<span style="color:#9ca3af;font-size:12px">Enter로 검색</span>`}
      </div>
      ${items.map((it, idx)=>`
        <div class="auto-item" role="option" aria-selected="false" data-auto-item="${idx}">
          <div class="l"><span style="opacity:.8">${isRecents ? "🕘" : "🔎"}</span> <span>${escapeHtml(it)}</span></div>
          <div class="k">${q.length? "": "click"}</div>
        </div>
      `).join("")}
    `;
    box.classList.add("show");
    box.querySelectorAll("[data-auto-item]").forEach(el=>el.addEventListener("click", ()=>{
      const idx=parseInt(el.getAttribute("data-auto-item"),10);
      const items2 = suggestions().items;
      const val = items2[idx];
      input.value = val;
      box.classList.remove("show");
      pushRecent(val);
      state.q = val;
      state.page = 1;
      writeUrlState(true);
      applyFilters();
    }));
    box.querySelector("[data-clear-recents]")?.addEventListener("click", ()=>{
      clearRecents();
      box.classList.remove("show");
    });
  };

  input.addEventListener("focus", render);
  input.addEventListener("input", ()=>{
    state.q = input.value;
    state.page=1;
    writeUrlState(true);
    render();
    applyFilters();
  });
  document.addEventListener("click", (e)=>{
    if(!box.contains(e.target) && e.target !== input) box.classList.remove("show");
  });

  input.addEventListener("keydown", (e)=>{
    const items = Array.from(box.querySelectorAll(".auto-item"));
    if(!box.classList.contains("show") || items.length===0) return;
    if(e.key==="ArrowDown"){
      e.preventDefault();
      activeIndex = Math.min(items.length-1, activeIndex+1);
      items.forEach((it,i)=>it.classList.toggle("active", i===activeIndex));
      items[activeIndex]?.scrollIntoView({ block:"nearest" });
    }else if(e.key==="ArrowUp"){
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex-1);
      items.forEach((it,i)=>it.classList.toggle("active", i===activeIndex));
      items[activeIndex]?.scrollIntoView({ block:"nearest" });
    }else if(e.key==="Enter"){
      const q2=input.value.trim();
      pushRecent(q2);
      state.q = q2;
      box.classList.remove("show");
      state.page=1;
      writeUrlState(true);
      applyFilters();
    }else if(e.key==="Escape"){
      box.classList.remove("show");
    }
  });
}

/* Mega menu (with focus trap + ESC) */
function setupMegaMenu(){
  const openBtn = document.querySelector("[data-open-menu]");
  const overlay = document.querySelector("[data-overlay]");
  const dialog = overlay?.querySelector("[data-dialog]");
  if(!openBtn||!overlay||!dialog) return;

  const left = overlay.querySelector("[data-mm-left]");
  const right = overlay.querySelector("[data-mm-right]");

  let untrap = null;
  let lastFocus = null;

  const close = () => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
    untrap?.(); untrap=null;
    lastFocus?.focus?.();
  };

  const buildRight = (catId) => {
    const c = categories.find(x=>x.id===catId) || categories[0];
    const picks = products.filter(p => (catId==="all" ? true : p.cat===catId)).slice(0,6);
    right.innerHTML = `
      <div style="font-weight:950;font-size:16px">${escapeHtml(c.name)} 추천</div>
      <div style="margin-top:6px;color:#6b7280;font-size:12px">카테고리를 선택하면 추천 아이템이 바뀝니다.</div>
      <div class="mm-grid" style="margin-top:12px">
        ${picks.map(p=>`
          <div class="mm-card">
            <div class="t">${escapeHtml(p.name)}</div>
            <div class="d">${escapeHtml(shipLabel(p))} · ${money(discountedPrice(p))} · 재고 ${p.stock}</div>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn blue" style="padding:8px 10px;border-radius:12px" href="product.html?id=${encodeURIComponent(p.id)}">상세</a>
              <button class="btn" style="padding:8px 10px;border-radius:12px" data-mm-add="${escapeHtml(p.id)}" ${p.stock===0?"disabled":""}>담기</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="mm-actions">
        <button class="btn" data-close-menu type="button">닫기</button>
        <button class="btn primary" data-go-cat type="button">이 카테고리 보기</button>
      </div>
    `;
    right.querySelectorAll("[data-mm-add]").forEach(b=>b.addEventListener("click", ()=>{
      const pid=b.getAttribute("data-mm-add");
      openOptionModal(pid);
    }));
    right.querySelector("[data-close-menu]").addEventListener("click", close);
    right.querySelector("[data-go-cat]").addEventListener("click", ()=>{
      state.cat = catId;
      state.page=1;
      writeUrlState(true);
      close();
      renderSidebar();
      applyFilters();
      document.querySelector("#products")?.scrollIntoView({ behavior:"smooth" });
    });
  };

  const buildLeft = () => {
    const counts = Object.fromEntries(categories.map(c => [c.id, 0]));
    products.forEach(p => { counts["all"] += 1; counts[p.cat] = (counts[p.cat]||0)+1; });
    left.innerHTML = `
      <div class="mm-head">전체 카테고리</div>
      ${categories.map(c=>`
        <div class="mm-item ${c.id===state.cat ? "active":""}" data-mm-cat="${c.id}" role="button" tabindex="0">
          <div style="font-weight:900">${escapeHtml(c.name)}</div>
          <div style="color:#6b7280;font-size:12px">${counts[c.id]||0}</div>
        </div>
      `).join("")}
    `;
    const act = (el)=>{
      left.querySelectorAll(".mm-item").forEach(x=>x.classList.remove("active"));
      el.classList.add("active");
      buildRight(el.getAttribute("data-mm-cat"));
    };
    left.querySelectorAll("[data-mm-cat]").forEach(el=>{
      el.addEventListener("mouseenter", ()=> act(el));
      el.addEventListener("click", ()=> act(el));
      el.addEventListener("keydown", (e)=>{ if(e.key==="Enter") act(el); });
    });
  };

  openBtn.addEventListener("click", ()=>{
    lastFocus = document.activeElement;
    buildLeft();
    buildRight(state.cat);
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
    untrap?.(); untrap = trapFocus(dialog);
    // focus first element
    setTimeout(()=> dialog.querySelector("button, [tabindex]")?.focus(), 0);
  });

  overlay.addEventListener("click", (e)=>{
    if(e.target === overlay) close();
  });
  dialog.addEventListener("keydown", (e)=>{
    if(e.key==="Escape") close();
  });
}

/* Carousel */
function setupCarousel(){
  const root = document.querySelector("[data-carousel]");
  if(!root) return;
  const slides = Array.from(root.querySelectorAll("[data-slide]"));
  const dots = root.querySelector("[data-dots]");
  let idx = 0;
  const show = (i) => {
    idx = (i + slides.length) % slides.length;
    slides.forEach((s, k)=>s.classList.toggle("show", k===idx));
    Array.from(dots.querySelectorAll("[data-dot]")).forEach((d,k)=>d.classList.toggle("active", k===idx));
  };
  dots.innerHTML = slides.map((_,i)=>`<button class="dot" data-dot="${i}" aria-label="slide ${i+1}"></button>`).join("");
  dots.querySelectorAll("[data-dot]").forEach(b=>b.addEventListener("click", ()=> show(parseInt(b.getAttribute("data-dot"),10)) ));
  show(0);
  setInterval(()=>{ if(!document.hidden) show(idx+1); }, 4500);
}

/* Sidebar + filters */
function renderSidebar(){
  const mount = document.querySelector("[data-sidebar]");
  if(!mount) return;
  const counts = Object.fromEntries(categories.map(c => [c.id, 0]));
  products.forEach(p => { counts["all"] += 1; counts[p.cat] = (counts[p.cat]||0)+1; });
  mount.innerHTML = categories.map(c=>`
    <div class="side-item ${c.id===state.cat ? "active":""}" data-cat="${c.id}">
      <div style="font-weight:900">${escapeHtml(c.name)}</div>
      <div class="count">${counts[c.id]||0}</div>
    </div>
  `).join("");
  mount.querySelectorAll("[data-cat]").forEach(el=>el.addEventListener("click", ()=>{
    state.cat = el.getAttribute("data-cat");
    state.page = 1;
    writeUrlState(true);
    renderSidebar();
    applyFilters();
  }));
}

function setupFiltersUI(){
  const root = document.querySelector("[data-filters]");
  if(!root) return;

  // seed inputs
  root.querySelector("[data-f-price-min]").value = state.filters.priceMin;
  root.querySelector("[data-f-price-max]").value = state.filters.priceMax;
  root.querySelector("[data-f-rating]").value = state.filters.ratingMin;
  root.querySelector("[data-f-ship]").value = state.filters.shipType;
  root.querySelector("[data-f-free]").checked = !!state.filters.freeShip;
  root.querySelector("[data-f-stock]").checked = !!state.filters.inStockOnly;

  const apply = () => {
    state.filters.priceMin = root.querySelector("[data-f-price-min]").value;
    state.filters.priceMax = root.querySelector("[data-f-price-max]").value;
    state.filters.ratingMin = root.querySelector("[data-f-rating]").value;
    state.filters.shipType = root.querySelector("[data-f-ship]").value;
    state.filters.freeShip = root.querySelector("[data-f-free]").checked;
    state.filters.inStockOnly = root.querySelector("[data-f-stock]").checked;
    state.page = 1;
    saveState();
    writeUrlState(true);
    applyFilters();
  };

  root.querySelectorAll("input,select").forEach(el=> el.addEventListener("input", apply));
  root.querySelector("[data-f-reset]").addEventListener("click", ()=>{
    state.filters = { priceMin:"", priceMax:"", ratingMin:"0", freeShip:false, inStockOnly:false, shipType:"all" };
    saveState();
    writeUrlState(true);
    setupFiltersUI();
    applyFilters();
  });
}

/* View toggle */
function setupViewToggle(){
  const g = document.querySelector("[data-view-grid]");
  const l = document.querySelector("[data-view-list]");
  if(!g||!l) return;
  const sync = () => {
    g.classList.toggle("active", state.view==="grid");
    l.classList.toggle("active", state.view==="list");
  };
  g.addEventListener("click", ()=>{ state.view="grid"; state.page=1; saveState(); writeUrlState(true); applyFilters(); sync(); });
  l.addEventListener("click", ()=>{ state.view="list"; state.page=1; saveState(); writeUrlState(true); applyFilters(); sync(); });
  sync();
}

/* Skeleton */
function renderSkeleton(mount, view){
  if(view==="list"){
    mount.className="list";
    mount.innerHTML = Array.from({length:6}).map(()=>`
      <div class="card">
        <div class="thumb skeleton"></div>
        <div class="body">
          <div class="skeleton" style="height:14px;border-radius:10px"></div>
          <div class="skeleton" style="height:14px;margin-top:8px;width:70%;border-radius:10px"></div>
          <div class="skeleton" style="height:14px;margin-top:10px;width:45%;border-radius:10px"></div>
        </div>
      </div>
    `).join("");
  }else{
    mount.className="grid";
    mount.innerHTML = Array.from({length:10}).map(()=>`
      <div class="card">
        <div class="thumb skeleton"></div>
        <div class="body">
          <div class="skeleton" style="height:14px;border-radius:10px"></div>
          <div class="skeleton" style="height:14px;margin-top:8px;width:72%;border-radius:10px"></div>
          <div class="skeleton" style="height:14px;margin-top:10px;width:48%;border-radius:10px"></div>
        </div>
      </div>
    `).join("");
  }
}

/* Option modal (accessibility + focus trap) */
let modalUntrap = null;
let modalLastFocus = null;

function openOptionModal(pid, qty=1){
  const p = products.find(x=>x.id===pid);
  if(!p) return;
  const overlay = document.querySelector("[data-modal-overlay]");
  const dialog = document.querySelector("[data-modal-dialog]");
  if(!overlay||!dialog) return;

  modalLastFocus = document.activeElement;

  const needOpt = ["apparel","shoes"].includes(p.cat);
  const opt = optionsByCat[p.cat];

  dialog.innerHTML = `
    <div class="modal-head">
      <div>옵션 선택</div>
      <button class="btn" data-modal-close type="button" aria-label="close">닫기</button>
    </div>
    <div class="modal-body">
      <div style="font-weight:950">${escapeHtml(p.name)}</div>
      <div class="notice">${escapeHtml(shipLabel(p))} · 재고 ${p.stock} · ${money(discountedPrice(p))}</div>

      ${needOpt ? `
      <div class="kv">
        <div class="k">사이즈</div>
        <div><select data-opt-size aria-label="size">${opt.sizes.map(s=>`<option value="${s}">${s}</option>`).join("")}</select></div>
      </div>
      <div class="kv">
        <div class="k">색상</div>
        <div><select data-opt-color aria-label="color">${opt.colors.map(c=>`<option value="${c}">${c}</option>`).join("")}</select></div>
      </div>` : `
      <div class="notice">이 상품은 옵션이 없습니다.</div>
      `}

      <div class="kv">
        <div class="k">수량</div>
        <div><input data-opt-qty type="number" min="1" value="${qty}" aria-label="qty"/></div>
      </div>

      ${p.coupon ? `<div class="notice"><span style="color:var(--success);font-weight:900">쿠폰 적용 가능</span> (UI 표시용)</div>` : ``}
    </div>
    <div class="modal-foot">
      <button class="btn" data-modal-close type="button">취소</button>
      <button class="btn blue" data-modal-add type="button">${p.stock===0 ? "품절" : "장바구니 담기"}</button>
    </div>
  `;

  const close = () => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
    modalUntrap?.(); modalUntrap=null;
    modalLastFocus?.focus?.();
  };

  dialog.querySelectorAll("[data-modal-close]").forEach(b=>b.addEventListener("click", close));
  dialog.addEventListener("keydown", (e)=>{ if(e.key==="Escape") close(); });

  dialog.querySelector("[data-modal-add]").addEventListener("click", ()=>{
    if(p.stock===0){ toast("품절 상품입니다."); return; }
    const qtyEl = dialog.querySelector("[data-opt-qty]");
    const n = parseInt(qtyEl.value||"1", 10);
    const qty2 = isNaN(n) ? 1 : n;
    const optData = needOpt ? {
      size: dialog.querySelector("[data-opt-size]").value,
      color: dialog.querySelector("[data-opt-color]").value,
    } : null;

    const res = addToCart(pid, qty2, optData);
    toast(res.msg);
    if(res.ok) close();
  });

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
  modalUntrap?.(); modalUntrap = trapFocus(dialog);
  setTimeout(()=> dialog.querySelector("button,select,input")?.focus(), 0);
}

function setupGlobalModals(){
  const overlay = document.querySelector("[data-modal-overlay]");
  const dialog = document.querySelector("[data-modal-dialog]");
  if(!overlay||!dialog) return;
  overlay.addEventListener("click", (e)=>{
    if(e.target===overlay){
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden","true");
      document.body.style.overflow="";
      modalUntrap?.(); modalUntrap=null;
      modalLastFocus?.focus?.();
    }
  });
}

/* Recently viewed render */
function renderRecentlyViewed(){
  const mount = document.querySelector("[data-recently-viewed]");
  if(!mount) return;
  const ids = getViewed();
  const list = ids.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  if(list.length===0){
    mount.innerHTML = `<div style="padding:12px;color:#6b7280">최근 본 상품이 없습니다. 상품 상세 페이지를 열어보세요.</div>`;
    return;
  }
  mount.innerHTML = `
    <div class="strip-head">
      <div class="t">최근 본 상품</div>
      <button type="button" data-clear-viewed>지우기</button>
    </div>
    <div class="strip-items">
      ${list.map(p=>`
        <div class="strip-card">
          <div class="n">${escapeHtml(p.name)}</div>
          <div class="m">${escapeHtml(shipLabel(p))} · ${money(discountedPrice(p))}</div>
          <div class="a">
            <a class="btn blue" style="padding:8px 10px" href="product.html?id=${encodeURIComponent(p.id)}">상세</a>
            <button class="btn" style="padding:8px 10px" data-rv-add="${escapeHtml(p.id)}">담기</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  mount.querySelector("[data-clear-viewed]").addEventListener("click", ()=>{
    setViewed([]); renderRecentlyViewed();
  });
  mount.querySelectorAll("[data-rv-add]").forEach(b=>b.addEventListener("click", ()=> openOptionModal(b.getAttribute("data-rv-add")) ));
}

/* Products render + pagination */
function applyFilters(){
  const mount = document.querySelector("[data-products]");
  if(!mount) return;

  const q = (state.q || "").trim().toLowerCase();
  let list = [...products];

  if(state.cat !== "all") list = list.filter(p => p.cat === state.cat);
  if(q.length) list = list.filter(p => p.name.toLowerCase().includes(q));

  // filters
  const pm = parseInt(state.filters.priceMin || "0", 10);
  const px = parseInt(state.filters.priceMax || "0", 10);
  if(!isNaN(pm) && pm>0) list = list.filter(p => discountedPrice(p) >= pm);
  if(!isNaN(px) && px>0) list = list.filter(p => discountedPrice(p) <= px);
  const rm = parseFloat(state.filters.ratingMin || "0");
  if(!isNaN(rm) && rm>0) list = list.filter(p => p.rating >= rm);
  if(state.filters.freeShip) list = list.filter(p => discountedPrice(p) >= 50000);
  if(state.filters.inStockOnly) list = list.filter(p => p.stock > 0);
  if(state.filters.shipType !== "all") list = list.filter(p => p.ship === state.filters.shipType);

  // sort
  switch(state.sort){
    case "price-asc": list.sort((a,b)=>discountedPrice(a)-discountedPrice(b)); break;
    case "price-desc": list.sort((a,b)=>discountedPrice(b)-discountedPrice(a)); break;
    case "rating": list.sort((a,b)=>b.rating-a.rating); break;
    case "reviews": list.sort((a,b)=>b.reviews-a.reviews); break;
    default: break;
  }

  // stat
  const stat = document.querySelector("[data-stat]");
  if(stat){
    const parts=[];
    if(state.cat!=="all") parts.push(categories.find(c=>c.id===state.cat)?.name);
    if(q.length) parts.push(`"${q}"`);
    const filterOn = [
      state.filters.priceMin||state.filters.priceMax,
      state.filters.ratingMin!=="0",
      state.filters.freeShip,
      state.filters.inStockOnly,
      state.filters.shipType!=="all"
    ].some(Boolean);
    stat.textContent = `${parts.length?parts.join(" · ")+" · ":""}${list.length}개${filterOn?" · 필터 적용":""}`;
  }

  // pagination
  const totalPages = Math.max(1, Math.ceil(list.length / state.perPage));
  state.page = clamp(state.page, 1, totalPages);
  const start = (state.page-1)*state.perPage;
  const pageList = list.slice(start, start + state.perPage);

  // view class
  mount.className = state.view === "list" ? "list" : "grid";

  if(list.length===0){
    mount.innerHTML = `
      <div class="card" style="padding:18px;text-align:center;grid-column:1/-1">
        <div style="font-weight:950;font-size:18px">검색 결과가 없습니다</div>
        <div style="margin-top:6px;color:#6b7280">다른 키워드/카테고리/필터를 바꿔보세요.</div>
        <button class="btn blue" style="margin-top:12px" type="button" data-clear>초기화</button>
      </div>`;
    mount.querySelector("[data-clear]").addEventListener("click", ()=>{
      state.cat="all"; state.sort="reco"; state.page=1; state.view="grid"; state.q="";
      state.filters = { priceMin:"", priceMax:"", ratingMin:"0", freeShip:false, inStockOnly:false, shipType:"all" };
      saveState();
      writeUrlState(true);
      const s=document.querySelector("[data-search]"); if(s) s.value="";
      document.querySelector("[data-sort]").value="reco";
      renderSidebar();
      setupFiltersUI();
      applyFilters();
    });
    renderPager(1,1);
    return;
  }

  mount.innerHTML = pageList.map(p => {
    const b=badgeInfo(p);
    const wished = isWished(p.id);
    const rating=`⭐ ${p.rating.toFixed(1)} (${p.reviews.toLocaleString("ko-KR")})`;
    const disabled=p.stock===0?"disabled":"";
    const dp = discountedPrice(p);
    const hasDisc = dp !== p.price;
    const optNeeded = ["apparel","shoes"].includes(p.cat);
    return `
      <div class="card" aria-label="product card">
        <button class="wish ${wished?"active":""}" type="button" aria-label="wishlist" data-wish="${escapeHtml(p.id)}">${wished?"♥":"♡"}</button>
        ${b.text?`<span class="badge ${b.cls}">${escapeHtml(b.text)}</span>`:""}
        ${p.coupon?`<span class="badge coupon">쿠폰</span>`:""}
        <div class="thumb">IMG</div>
        <div class="body">
          <div class="name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
          <div class="delivery">${escapeHtml(shipLabel(p))}</div>
          <div class="rating">${rating}</div>
          <div class="meta">
            <div class="price">
              ${hasDisc?`<span class="orig">${money(p.price)}</span>`:""}
              ${money(dp)}
            </div>
            <a class="smallbtn blue" href="product.html?id=${encodeURIComponent(p.id)}">상세</a>
          </div>
          <div class="quick">
            <button class="smallbtn orange" data-add="${escapeHtml(p.id)}" ${disabled}>${optNeeded?"옵션/담기":"담기"}</button>
            ${p.coupon?`<button class="smallbtn green" data-coupon="${escapeHtml(p.id)}" type="button">쿠폰받기</button>`:`<span class="pill">재고 ${p.stock}</span>`}
          </div>
        </div>
      </div>
    `;
  }).join("");

  mount.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", ()=>{
    const pid=b.getAttribute("data-add");
    openOptionModal(pid);
  }));
  mount.querySelectorAll("[data-coupon]").forEach(b => b.addEventListener("click", ()=>{
    toast("쿠폰이 적용되었습니다(목업).");
  }));
  mount.querySelectorAll("[data-wish]").forEach(b => b.addEventListener("click", ()=>{
    const pid=b.getAttribute("data-wish");
    const on = toggleWish(pid);
    b.classList.toggle("active", on);
    b.textContent = on ? "♥" : "♡";
    toast(on ? "찜에 추가" : "찜에서 제거");
  }));

  renderPager(state.page, totalPages);
}

function renderPager(page, totalPages){
  const pager = document.querySelector("[data-pager]");
  if(!pager) return;
  const btn = (label, p, disabled=false, active=false) =>
    `<button class="pagebtn ${active?"active":""}" ${disabled?"disabled":""} data-page="${p}">${label}</button>`;

  const windowSize = 7;
  const half = Math.floor(windowSize/2);
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  let html = "";
  html += btn("이전", Math.max(1, page-1), page===1);
  if(start > 1) html += btn("1", 1, false, page===1) + (start>2 ? `<span style="color:#9ca3af">…</span>` : "");
  for(let p=start;p<=end;p++) html += btn(String(p), p, false, p===page);
  if(end < totalPages) html += (end<totalPages-1 ? `<span style="color:#9ca3af">…</span>` : "") + btn(String(totalPages), totalPages, false, page===totalPages);
  html += btn("다음", Math.min(totalPages, page+1), page===totalPages);

  pager.innerHTML = html;
  pager.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click", ()=>{
    const p=parseInt(b.getAttribute("data-page"),10);
    state.page = p;
    writeUrlState(true);
    applyFilters();
    document.querySelector("#products")?.scrollIntoView({ behavior:"smooth" });
  }));
}

/* Init */
document.addEventListener("DOMContentLoaded", ()=>{
  // base persistence then URL overrides (URL wins)
  loadState();
  readUrlState();
  updateCartBadge();
  if(isAuthed()) refreshCart().catch(()=>{});

  document.querySelectorAll("[data-logout]").forEach(b=>b.addEventListener("click", logout));

  // Ctrl+K focus
  document.addEventListener("keydown", (e)=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){
      const s=document.querySelector("[data-search]");
      if(s){ e.preventDefault(); s.focus(); }
    }
  });

  setupMegaMenu();
  setupCarousel();
  setupAutocomplete();
  setupGlobalModals();
  // fetch latest products for all pages (stock/price)
  apiGetProducts().then((items)=>{ products = items; }).catch(()=>{});

  // Index only
  const mount=document.querySelector("[data-products]");
  if(mount){
    renderSidebar();
    setupFiltersUI();
    setupViewToggle();

    const sort=document.querySelector("[data-sort]");
    sort.value = state.sort;
    sort.addEventListener("change", (e)=>{ state.sort=e.target.value; state.page=1; writeUrlState(true); applyFilters(); });

    // render recent viewed
    renderRecentlyViewed();

    // initial skeleton then render
    renderSkeleton(mount, state.view);
    apiGetProducts().then((items)=>{ products = items; writeUrlState(true); applyFilters(); }).catch((e)=>{ toast(e.message||"상품을 불러오지 못했습니다."); products = mockProducts; writeUrlState(true); applyFilters(); });
  }

  // Product detail
  const pd=document.querySelector("[data-product-detail]");
  if(pd){
    const id=new URLSearchParams(location.search).get("id");
    const p=products.find(x=>x.id===id)||products[0];
    pushViewed(p.id);
    document.querySelector("[data-pname]").textContent=p.name;
    document.querySelector("[data-pprice]").textContent=money(discountedPrice(p));
    document.querySelector("[data-porig]").textContent = discountedPrice(p)!==p.price ? money(p.price) : "";
    document.querySelector("[data-pstock]").textContent=String(p.stock);
    document.querySelector("[data-pcat]").textContent=categories.find(c=>c.id===p.cat)?.name||"기타";
    document.querySelector("[data-ptag]").textContent=shipLabel(p);
    document.querySelector("[data-pcoupon]").style.display = p.coupon ? "inline-flex" : "none";
    const qty=document.querySelector("[data-qty]");
    qty.value="1"; qty.min="1"; qty.max=String(Math.max(1,p.stock));
    const btn=document.querySelector("[data-add-cart]");
    btn.disabled=p.stock===0;
    if(p.stock===0) btn.textContent="품절";
    btn.addEventListener("click", ()=>{
      const n=parseInt(qty.value||"1",10);
      openOptionModal(p.id, isNaN(n)?1:n);
    });
    document.querySelector("[data-wish-one]").addEventListener("click", ()=>{
      const on = toggleWish(p.id);
      toast(on ? "찜에 추가" : "찜에서 제거");
      document.querySelector("[data-wish-one]").textContent = on ? "♥ 찜됨" : "♡ 찜";
    });
    document.querySelector("[data-wish-one]").textContent = isWished(p.id) ? "♥ 찜됨" : "♡ 찜";
  }

  // Cart
  const cartMount=document.querySelector("[data-cart]");
  if(cartMount){
    const render=()=>{
      const t=totals();
      if(t.lines.length===0){
        cartMount.innerHTML=`
          <div style="text-align:center;padding:18px">
            <div style="font-weight:950;font-size:18px">장바구니가 비어있어요</div>
            <div style="margin-top:6px;color:#6b7280">상품을 담아보세요.</div>
            <a class="btn blue" style="margin-top:12px" href="index.html">쇼핑 계속하기</a>
          </div>`;
        document.querySelector("[data-subtotal]").textContent=money(0);
        document.querySelector("[data-ship]").textContent=money(0);
        document.querySelector("[data-total]").textContent=money(0);
        return;
      }
      cartMount.innerHTML=`
        <table class="table">
          <thead><tr><th>상품</th><th>단가</th><th>수량</th><th>합계</th><th></th></tr></thead>
          <tbody>
            ${t.lines.map(line=>{
              const opt = line.opt ? Object.entries(line.opt).map(([k,v])=>`${k}:${v}`).join(" / ") : "";
              const key = JSON.stringify({id:line.id,opt:normalizeOpt(line.opt)});
              return `
                <tr>
                  <td style="font-weight:950">${escapeHtml(line.product.name)}
                    <div style="color:#6b7280;font-size:12px">${escapeHtml(shipLabel(line.product))}${opt?` · 옵션(${escapeHtml(opt)})`:""} · 재고 ${line.product.stock}</div>
                  </td>
                  <td>${money(line.unit)}</td>
                  <td>
                    <span class="qty">
                      <button data-dec="${escapeHtml(key)}">-</button>
                      <span data-q="${escapeHtml(key)}" style="min-width:22px;display:inline-block;text-align:center">${line.qty}</span>
                      <button data-inc="${escapeHtml(key)}">+</button>
                    </span>
                  </td>
                  <td style="font-weight:950">${money(line.line)}</td>
                  <td><button class="btn" data-rm="${escapeHtml(key)}" type="button">삭제</button></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
      document.querySelector("[data-subtotal]").textContent=money(t.subtotal);
      document.querySelector("[data-ship]").textContent=money(t.ship);
      document.querySelector("[data-total]").textContent=money(t.total);

      cartMount.querySelectorAll("[data-rm]").forEach(b=>b.addEventListener("click", ()=>{
        const key=b.getAttribute("data-rm");
        const obj=JSON.parse(key);
        removeFromCart(obj.id, key);
        toast("삭제했습니다.");
        render();
      }));
      cartMount.querySelectorAll("[data-inc]").forEach(b=>b.addEventListener("click", ()=>{
        const key=b.getAttribute("data-inc");
        const obj=JSON.parse(key);
        const cur=parseInt(cartMount.querySelector(`[data-q="${CSS.escape(key)}"]`).textContent,10);
        const res=updateQty(obj.id, key, cur+1); toast(res.msg); render();
      }));
      cartMount.querySelectorAll("[data-dec]").forEach(b=>b.addEventListener("click", ()=>{
        const key=b.getAttribute("data-dec");
        const obj=JSON.parse(key);
        const cur=parseInt(cartMount.querySelector(`[data-q="${CSS.escape(key)}"]`).textContent,10);
        const res=updateQty(obj.id, key, cur-1); toast(res.msg); render();
      }));
    };
    render();

    document.querySelector("[data-checkout]").addEventListener("click", ()=>{
      if(getCart().length===0){ toast("장바구니가 비어있습니다."); return; }
      if(!isAuthed()){ toast("주문을 위해 로그인해주세요."); setTimeout(()=>location.href="login.html?next=checkout.html", 650); return; }
      location.href="checkout.html";
    });
  }

  // Login
  const lf=document.querySelector("[data-login-form]");
  if(lf){
    const next=new URLSearchParams(location.search).get("next")||"index.html";
    lf.addEventListener("submit",(e)=>{
      e.preventDefault();
      const email=document.querySelector("[data-email]").value;
      const pw=document.querySelector("[data-pw]").value;
      const btn = lf.querySelector("button[type=\"submit\"]") || lf.querySelector("button");
      if(btn){ btn.disabled = true; btn.dataset._txt = btn.textContent; btn.textContent = "로그인 중..."; }
      apiLogin(email,pw)
        .then((r)=>{ setAuth({ token:r.token, user:r.user }); toast("로그인 성공"); setTimeout(()=>location.href=next, 400); })
        .catch((e)=>{ toast(e.message||"로그인 실패"); })
        .finally(()=>{ if(btn){ btn.disabled=false; if(btn.dataset._txt){ btn.textContent=btn.dataset._txt; } } });
    });
  }

  // Checkout
  const cp=document.querySelector("[data-checkout-page]");
  if(cp){
    requireAuth();
    // load cart from API
    refreshCart().then(()=>{
      const t=totals(); // totals() uses getCart() + products
      const mount2=document.querySelector("[data-checkout-lines]");
      mount2.innerHTML = t.lines.map(line=>`
        <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed #edf2f7">
          <div style="font-weight:900">${escapeHtml(line.product?.name||"")} <span style="color:#6b7280;font-size:12px">x${line.qty}</span></div>
          <div style="font-weight:950">${money(line.line)}</div>
        </div>
      `).join("") + `
        <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed #edf2f7">
          <div style="color:#6b7280">배송비</div><div style="font-weight:950">${money(t.ship)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0">
          <div style="font-weight:950">총 결제금액</div><div style="font-weight:950">${money(t.total)}</div>
        </div>
      `;

      const payBtn=document.querySelector("[data-pay]");
      payBtn.addEventListener("click", async ()=>{
        if(payBtn.dataset.loading==="1") return;
        try{
          await refreshCart();
          if(getCart().length===0){ toast("장바구니가 비어있습니다."); return; }

          // collect form
          const address = {
            recipient: (document.querySelector("[data-addr-recipient]")?.value||"").trim(),
            phone: (document.querySelector("[data-addr-phone]")?.value||"").trim(),
            zip: (document.querySelector("[data-addr-zip]")?.value||"").trim(),
            line1: (document.querySelector("[data-addr-line1]")?.value||"").trim(),
            line2: (document.querySelector("[data-addr-line2]")?.value||"").trim(),
          };
          const payment = {
            method: document.querySelector("[data-pay-method]")?.value || "card",
            card: { last4: (document.querySelector("[data-card-last4]")?.value||"").trim() || "0000" }
          };
          const couponCode = (document.querySelector("[data-coupon]")?.value||"").trim() || null;
          const pointsUse = parseInt((document.querySelector("[data-points]")?.value||"0").trim(),10) || 0;
          const memo = (document.querySelector("[data-memo]")?.value||"").trim() || "";

          payBtn.dataset.loading="1";
          const old=payBtn.textContent;
          payBtn.textContent="결제 진행 중...";

          const r = await apiCheckout({ address, payment, couponCode, pointsUse, memo });
          toast("결제 완료");
          // cart cleared on server
          await refreshCart();
          setTimeout(()=>location.href=`order-complete.html?id=${encodeURIComponent(r.order.id)}&o=${encodeURIComponent(r.order.orderNo)}`, 450);
          payBtn.textContent=old;
          payBtn.dataset.loading="0";
        }catch(e){
          payBtn.dataset.loading="0";
          payBtn.textContent="결제하기";
          toast(e.message || "결제 실패");
        }
      }, { once:true });
    }).catch((e)=>toast(e.message||"장바구니를 불러오지 못했습니다."));
  }

  // Order complete

  const oc=document.querySelector("[data-complete]");
  if(oc){
    const sp=new URLSearchParams(location.search);
    const o=sp.get("o");
    const id=sp.get("id");
    document.querySelector("[data-orderno]").textContent=o||"-";
    if(id){
      apiFetch(`/api/orders/${encodeURIComponent(id)}`).then((r)=>{
        const ord=r.order;
        const el=document.querySelector("[data-order-detail]");
        if(el && ord){
          el.innerHTML = `
            <div style="margin-top:10px;color:#111827;font-weight:900">결제금액: ${money(ord.total)}</div>
            <div style="margin-top:6px;color:#6b7280;font-size:13px">상태: ${escapeHtml(ord.status)}</div>
            <div style="margin-top:6px;color:#6b7280;font-size:13px">적립 포인트: ${ord.pointsEarned||0}</div>
          `;
        }
      }).catch(()=>{});
    }
  }

  // Orders
  const om=document.querySelector("[data-orders]");
  if(om){
    requireAuth();
    apiGetOrders().then((list)=>{
      if(!Array.isArray(list) || list.length===0){
        om.innerHTML=`<div class="card" style="padding:18px;text-align:center">
          <div style="font-weight:950;font-size:18px">주문내역이 없습니다</div>
          <div style="margin-top:6px;color:#6b7280">첫 주문을 만들어보세요.</div>
          <a class="btn blue" style="margin-top:12px" href="index.html">쇼핑 계속하기</a>
        </div>`;
        return;
      }
      om.innerHTML = list.map(o=>`
        <div class="card" style="padding:14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
            <div style="font-weight:950">${escapeHtml(o.orderNo)}</div>
            <div style="color:#6b7280;font-size:12px">${new Date(o.at).toLocaleString()}</div>
          </div>
          <div style="margin-top:6px;color:#111827;font-weight:950">${money(o.total)}</div>
          <div style="margin-top:4px;color:#6b7280;font-size:13px">상태: ${escapeHtml(o.status)}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <a class="btn" href="order-complete.html?id=${encodeURIComponent(o.id)}&o=${encodeURIComponent(o.orderNo)}">상세</a>
          </div>
        </div>
      `).join("");
    }).catch((e)=>{
      toast(e.message||"주문내역을 불러오지 못했습니다.");
      om.innerHTML = `<div class="card" style="padding:18px">주문내역을 불러오지 못했습니다.</div>`;
    });
  }

  // bottom nav active
  const page=document.body.getAttribute("data-page");
  document.querySelectorAll(".bnav a").forEach(a=>a.classList.toggle("active", a.getAttribute("data-page")===page));
});