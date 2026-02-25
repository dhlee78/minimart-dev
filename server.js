const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());


// ---- RequestId + Error helper (Global Error Format v1) ----
app.use((req,res,next)=>{
  req.requestId = req.headers["x-request-id"] || uuid();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

function sendError(req,res,status,code,message,details){
  const payload = {
    timestamp: new Date().toISOString(),
    status,
    code,
    message,
    ...(details ? { details } : {}),
    path: req.originalUrl || req.path || ""
  };
  // server log policy
  const userId = (req.user && req.user.id) ? req.user.id : null;
  const log = {
    level: "error",
    requestId: req.requestId,
    userId,
    errorCode: code,
    status,
    path: payload.path,
  };
  console.error(JSON.stringify(log));
  return res.status(status).json(payload);
}

function asyncHandler(fn){
  return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
}

// ---- Data store (in-memory for mock) ----
const PRODUCTS_PATH = path.join(__dirname, "data", "products.json");
let products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8"));
function persistProducts(){
  fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
}

// sessions
const refreshSessions = new Map(); // refreshToken -> { userId, email, exp }
const accessSessions = new Map();  // accessToken -> { userId, email, exp }

// per-user stores
const carts = new Map();     // userId -> [{...cartItem}]
const wishlists = new Map(); // userId -> [{productId, addedAt, updatedAt}]
const orders = new Map();    // userId -> [order]

// recent search (simple global, can be per-user later)
let recentSearch = [];

function nowISO(){ return new Date().toISOString(); }
function isEmail(v){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
function randToken(prefix){
  const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s="";
  for(let i=0;i<32;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return `${prefix}.${s}.${Date.now()}`; // "JWT string" mock
}
function authRequired(req,res,next){
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  if(!m) return sendError(req,res,401,"AUTH_TOKEN_EXPIRED","인증이 필요합니다.");
  const tok = m[1];
  const sess = accessSessions.get(tok);
  if(!sess) return sendError(req,res,401,"AUTH_TOKEN_EXPIRED","인증이 필요합니다.");
  if(Date.now() > sess.exp){
    accessSessions.delete(tok);
    return sendError(req,res,401,"AUTH_TOKEN_EXPIRED","토큰이 만료되었습니다.");
  }
  req.user = { id: sess.userId, email: sess.email };
  req.accessToken = tok;
  next();
}

// ---- 1. Auth API ----
app.post("/auth/login", (req,res)=>{
  const { email, password } = req.body || {};
  if(!email || !password || !isEmail(email) || String(password).length < 8){
    return sendError(req,res,400,"AUTH_INVALID_FORMAT","이메일/비밀번호 형식을 확인해주세요.");
  }
  if(String(email).toLowerCase() === "test@fail.com"){
    return sendError(req,res,401,"AUTH_INVALID_CREDENTIALS","이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  const user = { id: "mock-user", email: String(email).toLowerCase() };
  const accessToken = randToken("access");
  const refreshToken = randToken("refresh");
  accessSessions.set(accessToken, { userId: user.id, email: user.email, exp: Date.now() + 5*60*1000 }); // 5m
  refreshSessions.set(refreshToken, { userId: user.id, email: user.email, exp: Date.now() + 7*24*60*60*1000 }); // 7d
  return res.json({ accessToken, refreshToken, user });
});

app.post("/auth/refresh", (req,res)=>{
  const { refreshToken } = req.body || {};
  if(!refreshToken || typeof refreshToken !== "string"){
    return sendError(req,res,400,"AUTH_INVALID_FORMAT","refreshToken 형식을 확인해주세요.");
  }
  const sess = refreshSessions.get(refreshToken);
  if(!sess){
    return sendError(req,res,401,"AUTH_REFRESH_EXPIRED","refreshToken이 만료되었거나 유효하지 않습니다.");
  }
  if(Date.now() > sess.exp){
    refreshSessions.delete(refreshToken);
    return sendError(req,res,401,"AUTH_REFRESH_EXPIRED","refreshToken이 만료되었습니다.");
  }
  const accessToken = randToken("access");
  accessSessions.set(accessToken, { userId: sess.userId, email: sess.email, exp: Date.now() + 5*60*1000 });
  return res.json({ accessToken });
});

app.post("/auth/logout", authRequired, (req,res)=>{
  // invalidate access token (refresh invalidation optional)
  accessSessions.delete(req.accessToken);
  return res.status(204).end();
});

app.get("/me", authRequired, (req,res)=>{
  return res.json({ id: req.user.id, email: req.user.email });
});

// ---- 2. Products API ----
function clampNonNegative(n){ return Math.max(0, Number.isFinite(n)?n:0); }

app.get("/products", (req,res)=>{
  let {
    page=1, perPage=20, category, keyword, sort,
    minPrice, maxPrice, rating, shipping,
    freeShipping, inStock
  } = req.query;

  page = Math.max(1, parseInt(page,10) || 1);
  perPage = Math.max(1, Math.min(100, parseInt(perPage,10) || 20));

  let items = products.slice();

  if(category && category !== "all"){
    items = items.filter(p => String(p.category||"") === String(category));
  }
  if(keyword){
    const k = String(keyword).toLowerCase();
    items = items.filter(p => String(p.name).toLowerCase().includes(k));
  }
  if(shipping){
    items = items.filter(p => p.shipping === shipping);
  }
  if(minPrice != null && minPrice !== ""){
    const mn = parseInt(minPrice,10);
    if(Number.isFinite(mn)) items = items.filter(p => (p.price||0) >= mn);
  }
  if(maxPrice != null && maxPrice !== ""){
    const mx = parseInt(maxPrice,10);
    if(Number.isFinite(mx)) items = items.filter(p => (p.price||0) <= mx);
  }
  if(rating != null && rating !== ""){
    const r = parseFloat(rating);
    if(Number.isFinite(r)) items = items.filter(p => (p.rating||0) >= r);
  }
  if(String(freeShipping).toLowerCase() === "true"){
    items = items.filter(p => (p.price||0) >= 50000);
  }
  if(String(inStock).toLowerCase() === "true"){
    items = items.filter(p => (p.stock||0) > 0);
  }

  // sort
  const s = sort || "reco";
  if(s === "price-asc") items.sort((a,b)=>(a.price||0)-(b.price||0));
  else if(s === "price-desc") items.sort((a,b)=>(b.price||0)-(a.price||0));
  else if(s === "rating") items.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if(s === "reviews") items.sort((a,b)=>(b.reviewCount||0)-(a.reviewCount||0));
  else { // reco
    items.sort((a,b)=> (b.reviewCount||0) - (a.reviewCount||0));
  }

  // normalize stock<0 -> 0
  items = items.map(p => ({
    id: String(p.id),
    name: String(p.name),
    price: clampNonNegative(p.price),
    originalPrice: clampNonNegative(p.originalPrice),
    stock: clampNonNegative(p.stock),
    shipping: p.shipping,
    rating: p.rating ?? 0,
    reviewCount: p.reviewCount ?? 0,
    coupon: !!p.coupon,
    image: p.image
  }));

  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const start = (page-1)*perPage;
  const paged = items.slice(start, start+perPage);
  res.json({ items: paged, totalPages, page, totalCount });
});

app.get("/products/:id", (req,res)=>{
  const p = products.find(x => String(x.id) === String(req.params.id));
  if(!p) return sendError(req,res,404,"PRODUCT_NOT_FOUND","존재하지 않는 상품입니다.");
  const detail = {
    id: String(p.id),
    name: String(p.name),
    price: clampNonNegative(p.price),
    originalPrice: clampNonNegative(p.originalPrice),
    stock: clampNonNegative(p.stock),
    shipping: p.shipping,
    rating: p.rating ?? 0,
    reviewCount: p.reviewCount ?? 0,
    coupon: !!p.coupon,
    images: Array.isArray(p.images) ? p.images : [p.image].filter(Boolean),
    options: Array.isArray(p.options) ? p.options.map(o => ({
      optionId: String(o.optionId),
      label: String(o.label),
      stock: clampNonNegative(o.stock),
      priceDelta: Number(o.priceDelta)||0
    })) : [],
    description: String(p.description || "")
  };
  res.json(detail);
});

// ---- 3. Search API ----
app.get("/products/autocomplete", (req,res)=>{
  const keyword = String(req.query.keyword || "").trim();
  if(!keyword) return res.json({ suggestions: [] });
  if(keyword.length>50) return sendError(req,res,400,"SEARCH_INVALID_QUERY","검색어 형식을 확인해주세요.");
  const k = keyword.toLowerCase();
  const suggestions = products
    .map(p=>p.name)
    .filter(n => String(n).toLowerCase().includes(k))
    .slice(0, 10);
  res.json({ suggestions });
});

app.get("/search/recent", (req,res)=>{
  res.json({ items: recentSearch.slice(0, 10) });
});

app.post("/search/recent", (req,res)=>{
  const keyword = String((req.body||{}).keyword || "").trim();
  if(!keyword || keyword.length>50) return sendError(req,res,400,"SEARCH_INVALID_QUERY","검색어 형식을 확인해주세요.");
  // keep unique recent, most recent first
  recentSearch = [keyword, ...recentSearch.filter(x=>x!==keyword)].slice(0, 10);
  res.status(204).end();
});

app.delete("/search/recent", (req,res)=>{
  recentSearch = [];
  res.status(204).end();
});

// ---- helpers for cart/checkout ----
function getCart(userId){
  if(!carts.has(userId)) carts.set(userId, []);
  return carts.get(userId);
}
function findProduct(productId){
  return products.find(p => String(p.id) === String(productId));
}
function getOption(p, optionId){
  if(!optionId) return null;
  const opts = Array.isArray(p.options) ? p.options : [];
  return opts.find(o => String(o.optionId) === String(optionId)) || null;
}
function computeCartSummary(items, couponApplied=false){
  const totalPrice = items.reduce((a,it)=>a + (it.price*it.quantity), 0);
  const shippingFee = (items.length===0) ? 0 : (totalPrice >= 50000 ? 0 : 3000);
  const discount = couponApplied ? Math.floor(totalPrice * 0.10) : 0;
  const finalPrice = totalPrice + shippingFee - discount;
  return { totalPrice, shippingFee, discount, finalPrice };
}

// ---- 4. Cart API ----
app.get("/cart", authRequired, (req,res)=>{
  const items = getCart(req.user.id);
  res.json({ items, summary: computeCartSummary(items, false) });
});

app.post("/cart", authRequired, (req,res)=>{
  const { productId, optionId=null, quantity=1 } = req.body || {};
  if(!productId){
    return sendError(req,res,400,"CART_INVALID_QUANTITY","잘못된 요청입니다.");
  }
  const p = findProduct(productId);
  if(!p) return sendError(req,res,404,"PRODUCT_NOT_FOUND","존재하지 않는 상품입니다.");

  const q = parseInt(quantity,10);
  if(!Number.isFinite(q) || q < 1){
    return sendError(req,res,422,"CART_INVALID_QUANTITY","수량은 1 이상이어야 합니다.", { minQuantity: 1 });
  }

  const hasOptions = Array.isArray(p.options) && p.options.length>0;
  if(hasOptions && (optionId == null || optionId === "")){
    return sendError(req,res,422,"PRODUCT_OPTION_REQUIRED","옵션을 선택해주세요.", { productId: String(p.id) });
  }

  let stock = clampNonNegative(p.stock);
  let opt = null;
  if(hasOptions){
    opt = getOption(p, optionId);
    if(!opt) return sendError(req,res,404,"PRODUCT_OPTION_NOT_FOUND","존재하지 않는 옵션입니다.", { productId: String(p.id), optionId: String(optionId) });
    stock = clampNonNegative(opt.stock);
  }

  // Duplicate policy
  const cart = getCart(req.user.id);
  const dup = cart.find(it => it.productId===String(p.id) && ((it.option && opt) ? it.option.optionId===String(opt.optionId) : (!it.option && !opt)));
  if(dup){
    return sendError(req,res,409,"CART_ITEM_DUPLICATE","이미 장바구니에 담긴 상품입니다.", { cartItemId: dup.cartItemId });
  }

  if(q > stock){
    return sendError(req,res,409,"CART_STOCK_EXCEEDED","요청 수량이 재고를 초과했습니다.", { availableStock: stock, productId: String(p.id), optionId: opt ? String(opt.optionId) : null });
  }

  const cartItem = {
    cartItemId: uuid(),
    productId: String(p.id),
    name: String(p.name),
    price: clampNonNegative(p.price) + (opt ? (Number(opt.priceDelta)||0) : 0),
    originalPrice: clampNonNegative(p.originalPrice),
    image: p.image,
    shipping: p.shipping,
    stock: stock,
    quantity: q,
    option: opt ? { optionId: String(opt.optionId), label: String(opt.label) } : null
  };

  cart.push(cartItem);
  res.status(201).json(cartItem);
});

app.patch("/cart/:cartItemId", authRequired, (req,res)=>{
  const { quantity } = req.body || {};
  const cart = getCart(req.user.id);
  const it = cart.find(x=>x.cartItemId === req.params.cartItemId);
  if(!it) return sendError(req,res,404,"CART_ITEM_NOT_FOUND","장바구니 항목을 찾을 수 없습니다.", { cartItemId: req.params.cartItemId });

  const q = parseInt(quantity,10);
  if(!Number.isFinite(q) || q < 1){
    return sendError(req,res,422,"CART_INVALID_QUANTITY","수량은 1 이상이어야 합니다.", { minQuantity: 1 });
  }

  const p = findProduct(it.productId);
  if(!p){
    it.stock = 0; it.quantity = 0;
    return res.json(it);
  }

  const hasOptions = Array.isArray(p.options) && p.options.length>0;
  let latestStock = clampNonNegative(p.stock);
  let delta = 0;

  if(hasOptions && it.option && it.option.optionId){
    const opt = getOption(p, it.option.optionId);
    if(!opt) return sendError(req,res,422,"CART_OPTION_INVALID","옵션이 유효하지 않습니다.", { cartItemId: it.cartItemId });
    latestStock = clampNonNegative(opt.stock);
    delta = Number(opt.priceDelta)||0;
    it.option = { optionId:String(opt.optionId), label:String(opt.label) };
  }

  const prevPrice = it.price;
  it.price = clampNonNegative(p.price) + delta;
  it.originalPrice = clampNonNegative(p.originalPrice);
  it.stock = latestStock;

  let newQ = q;
  let priceChanged = (prevPrice !== it.price);

  if(newQ > latestStock){
    newQ = latestStock;
  }
  it.quantity = newQ;

  // if price changed, notify via header for clients; keep 200 with updated item
  if(priceChanged){
    res.setHeader("X-Price-Changed","1");
  }

  res.json(it);
});

// delete single cart item (extra endpoint for frontend)
app.delete("/cart/:cartItemId", authRequired, (req,res)=>{
  const cart = getCart(req.user.id);
  const next = cart.filter(it => it.cartItemId !== req.params.cartItemId);
  carts.set(req.user.id, next);
  res.status(204).end();
});

// clear cart (extra endpoint)
app.delete("/cart", authRequired, (req,res)=>{
  carts.set(req.user.id, []);
  res.status(204).end();
});

app.post("/cart/validate", authRequired, (req,res)=>{
  const { cartItemIds } = req.body || {};
  if(!Array.isArray(cartItemIds)) return sendError(req,res,400,"CART_INVALID_QUANTITY","잘못된 요청입니다.");

  const cart = getCart(req.user.id);
  const adjustments = [];

  for(const id of cartItemIds){
    const it = cart.find(x=>x.cartItemId === id);
    if(!it) continue;

    const p = findProduct(it.productId);
    if(!p){
      it.stock = 0; it.quantity = 0;
      adjustments.push({ cartItemId: it.cartItemId, type: "CLAMPED", newQuantity: 0 });
      continue;
    }

    const hasOptions = Array.isArray(p.options) && p.options.length>0;
    let latestStock = clampNonNegative(p.stock);
    let delta = 0;
    if(hasOptions && it.option && it.option.optionId){
      const opt = getOption(p, it.option.optionId);
      if(!opt) return sendError(req,res,422,"CART_OPTION_INVALID","옵션이 유효하지 않습니다.", { cartItemId: it.cartItemId });
      latestStock = clampNonNegative(opt.stock);
      delta = Number(opt.priceDelta)||0;
      it.option = { optionId:String(opt.optionId), label:String(opt.label) };
    }

    const prevPrice = it.price;
    it.price = clampNonNegative(p.price) + delta;
    it.originalPrice = clampNonNegative(p.originalPrice);
    it.stock = latestStock;

    if(prevPrice !== it.price){
      adjustments.push({ cartItemId: it.cartItemId, type: "PRICE_CHANGED", newPrice: it.price });
    }

    if(it.quantity > latestStock){
      it.quantity = latestStock;
      adjustments.push({ cartItemId: it.cartItemId, type: "CLAMPED", newQuantity: latestStock });
    }
  }

  res.json({ adjustments });
});

// ---- 5. Checkout API ----
app.post("/checkout/quote", authRequired, (req,res)=>{
  const { cartItemIds, couponApplied } = req.body || {};
  if(!Array.isArray(cartItemIds)) return sendError(req,res,400,"CHECKOUT_EMPTY_SELECTION","잘못된 요청입니다.");
  if(cartItemIds.length===0) return sendError(req,res,422,"CHECKOUT_EMPTY_SELECTION","선택 상품이 없습니다.");

  const cart = getCart(req.user.id);
  const items = cart.filter(it => cartItemIds.includes(it.cartItemId));
  if(items.length===0) return sendError(req,res,422,"CHECKOUT_EMPTY_SELECTION","선택 상품이 없습니다.");

  // validate against latest
  const stockIssues=[];
  const priceIssues=[];
  for(const it of items){
    const p = findProduct(it.productId);
    if(!p){ stockIssues.push({ cartItemId: it.cartItemId, availableStock: 0 }); continue; }
    const hasOptions = Array.isArray(p.options) && p.options.length>0;
    let latestStock = clampNonNegative(p.stock);
    let delta = 0;
    if(hasOptions && it.option && it.option.optionId){
      const opt = getOption(p, it.option.optionId);
      latestStock = clampNonNegative(opt ? opt.stock : 0);
      delta = Number(opt ? opt.priceDelta : 0)||0;
    }
    const latestPrice = clampNonNegative(p.price)+delta;
    if(latestPrice !== it.price) priceIssues.push({ cartItemId: it.cartItemId, newPrice: latestPrice });
    if(it.quantity > latestStock) stockIssues.push({ cartItemId: it.cartItemId, availableStock: latestStock });
  }

  if(stockIssues.length){
    return sendError(req,res,409,"CHECKOUT_STOCK_CHANGED","주문 직전 재고가 변경되었습니다.", { stockIssues });
  }
  if(priceIssues.length){
    return sendError(req,res,409,"CHECKOUT_PRICE_CHANGED","주문 직전 가격이 변경되었습니다.", { priceIssues });
  }

  const summary = computeCartSummary(items, !!couponApplied);
  res.json(summary);
});

// ---- 6. Orders API ----
function statusForServer(createdAt, currentStatus){
  // Server-managed mock: advance status based on elapsed time since createdAt
  const diff = (Date.now() - new Date(createdAt).getTime())/1000;
  if(diff < 10) return "PAID";
  if(diff < 20) return "SHIPPING";
  return "DELIVERED";
}

app.post("/orders", authRequired, (req,res)=>{
  const { cartItemIds, couponApplied } = req.body || {};
  if(!Array.isArray(cartItemIds)) return sendError(req,res,400,"ORDER_CREATION_FAILED","잘못된 요청입니다.");
  if(cartItemIds.length===0) return sendError(req,res,422,"ORDER_CREATION_FAILED","주문 생성에 실패했습니다.");

  const cart = getCart(req.user.id);
  const items = cart.filter(it => cartItemIds.includes(it.cartItemId));
  if(items.length===0) return sendError(req,res,422,"ORDER_CREATION_FAILED","주문 생성에 실패했습니다.");

  // validate + clamp (stock changes cause error for order creation)
  for(const it of items){
    const p = findProduct(it.productId);
    const hasOptions = p && Array.isArray(p.options) && p.options.length>0;
    let latestStock = p ? clampNonNegative(p.stock) : 0;
    let delta = 0;
    if(p && hasOptions && it.option && it.option.optionId){
      const opt = getOption(p, it.option.optionId);
      latestStock = clampNonNegative(opt ? opt.stock : 0);
      delta = Number(opt ? opt.priceDelta : 0) || 0;
      it.option = opt ? { optionId:String(opt.optionId), label:String(opt.label) } : it.option;
    }
    const latestPrice = p ? clampNonNegative(p.price)+delta : it.price;
    if(latestPrice !== it.price){
      return sendError(req,res,409,"CHECKOUT_PRICE_CHANGED","주문 직전 가격이 변경되었습니다.", { cartItemId: it.cartItemId, newPrice: latestPrice });
    }
    if(it.quantity > latestStock){
      return sendError(req,res,409,"ORDER_STOCK_INSUFFICIENT","주문 시 재고가 부족합니다.", { cartItemId: it.cartItemId, availableStock: latestStock });
    }
  }

  const summary = computeCartSummary(items, !!couponApplied);

  // stock deduction (mock)
  for(const it of items){
    const p = findProduct(it.productId);
    if(!p) continue;
    const hasOptions = Array.isArray(p.options) && p.options.length>0;
    if(hasOptions && it.option && it.option.optionId){
      const opt = getOption(p, it.option.optionId);
      if(opt) opt.stock = clampNonNegative(opt.stock) - it.quantity;
    }else{
      p.stock = clampNonNegative(p.stock) - it.quantity;
    }
  }
  persistProducts();

  const order = {
    orderId: uuid(),
    createdAt: nowISO(),
    status: "PAID",
    ...summary,
    items: items.map(it => ({
      id: it.productId,
      name: it.name,
      price: it.price,
      originalPrice: it.originalPrice,
      image: it.image,
      quantity: it.quantity,
      option: it.option ? it.option.label : "",
      shipping: it.shipping
    }))
  };

  if(!orders.has(req.user.id)) orders.set(req.user.id, []);
  orders.get(req.user.id).unshift(order);

  // remove from cart
  const remaining = cart.filter(it => !cartItemIds.includes(it.cartItemId));
  carts.set(req.user.id, remaining);

  res.status(201).json({ order });
});

app.get("/orders", authRequired, (req,res)=>{
  let { page=1, perPage=10 } = req.query;
  page = Math.max(1, parseInt(page,10) || 1);
  perPage = Math.max(1, Math.min(50, parseInt(perPage,10) || 10));

  const all = (orders.get(req.user.id) || []).slice();
  // server status managed
  for(const o of all){
    o.status = statusForServer(o.createdAt, o.status);
  }

  const totalPages = Math.max(1, Math.ceil(all.length / perPage));
  const start = (page-1)*perPage;
  const items = all.slice(start, start+perPage);
  res.json({ items, totalPages });
});

// delete order (extra mock cleanup)
app.delete("/orders/:orderId", authRequired, (req,res)=>{
  const list = orders.get(req.user.id) || [];
  const next = list.filter(o => o.orderId !== req.params.orderId);
  orders.set(req.user.id, next);
  res.status(204).end();
});

// ---- 7. Wishlist API ----
function getWishlist(userId){
  if(!wishlists.has(userId)) wishlists.set(userId, []);
  return wishlists.get(userId);
}

app.get("/wishlist", authRequired, (req,res)=>{
  const wl = getWishlist(req.user.id);
  const items = wl.map(w => {
    const p = findProduct(w.productId);
    const product = p ? {
      id: String(p.id),
      name: p.name,
      price: clampNonNegative(p.price),
      originalPrice: clampNonNegative(p.originalPrice),
      stock: clampNonNegative(p.stock),
      shipping: p.shipping,
      rating: p.rating ?? 0,
      reviewCount: p.reviewCount ?? 0,
      coupon: !!p.coupon,
      image: p.image
    } : null;
    return { productId: String(w.productId), addedAt: w.addedAt, product };
  });
  res.json({ items });
});

app.post("/wishlist", authRequired, (req,res)=>{
  const { productId } = req.body || {};
  if(!productId) return sendError(req,res,400,"WISHLIST_PRODUCT_NOT_FOUND","잘못된 요청입니다.");
  const p = findProduct(productId);
  if(!p) return sendError(req,res,404,"WISHLIST_PRODUCT_NOT_FOUND","상품이 삭제되었거나 존재하지 않습니다.", { productId: String(productId) });

  const wl = getWishlist(req.user.id);
  const i = wl.findIndex(x=>String(x.productId)===String(productId));
  if(i>=0){
    return sendError(req,res,409,"WISHLIST_DUPLICATE","이미 찜한 상품입니다.", { productId: String(productId) });
  }
  const now = nowISO();
  wl.unshift({ productId: String(productId), addedAt: now, updatedAt: now });
  res.status(204).end();
});

app.delete("/wishlist/:productId", authRequired, (req,res)=>{
  const wl = getWishlist(req.user.id);
  const before = wl.length;
  const next = wl.filter(x=>String(x.productId)!==String(req.params.productId));
  if(next.length === before){
    return sendError(req,res,404,"WISHLIST_ITEM_NOT_FOUND","찜 항목이 없습니다.", { productId: String(req.params.productId) });
  }
  wishlists.set(req.user.id, next);
  res.status(204).end();
});

// clear wishlist (extra endpoint)
app.delete("/wishlist", authRequired, (req,res)=>{
  wishlists.set(req.user.id, []);
  res.status(204).end();
});



// ---- Global error handler ----
app.use((err, req, res, next)=>{
  const code = err && err.code ? err.code : "SERVER_ERROR";
  const status = err && err.status ? err.status : 500;
  const msg = err && err.message ? err.message : "서버 오류가 발생했습니다.";
  const userId = (req.user && req.user.id) ? req.user.id : null;
  console.error(JSON.stringify({
    level:"error",
    requestId:req.requestId,
    userId,
    errorCode:code,
    stack: (err && err.stack) ? String(err.stack) : null
  }));
  if(res.headersSent) return next(err);
  return res.status(status).json({
    timestamp: new Date().toISOString(),
    status,
    code,
    message: msg,
    path: req.originalUrl || req.path || ""
  });
});

// ---- Static frontend (same-origin fetch works) ----
const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

// Fallback to index
app.get("/", (req,res)=> res.sendFile(path.join(PUBLIC_DIR, "index.html")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log("MiniMarket API+Web running on", PORT));
