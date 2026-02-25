console.log("BOOT FILE:", __filename, "DIR:", __dirname, "CWD:", process.cwd());

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

// ===== products.json load (Render-safe) =====
// - Seed data is kept in repo at: src/data/products.json
// - Runtime writes go to /tmp on Render (ephemeral but writable)
const SEED_PRODUCTS_PATH = path.resolve(process.cwd(), "src", "data", "products.json");
const IS_RENDER = !!(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const PRODUCTS_PATH = IS_RENDER ? path.join("/tmp", "products.json") : SEED_PRODUCTS_PATH;

let products = [];

try {
  const loadPath = fs.existsSync(PRODUCTS_PATH) ? PRODUCTS_PATH : SEED_PRODUCTS_PATH;
  products = JSON.parse(fs.readFileSync(loadPath, "utf-8"));

  // If we're in Render and /tmp file doesn't exist yet, copy seed -> runtime
  if (loadPath !== PRODUCTS_PATH) {
    fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
  }
} catch (e) {
  console.warn("[WARN] products load failed -> []", e?.message);
  products = [];
}
// ===== END SAFE init =====

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

  const s = sort || "reco";
  if(s === "price-asc") items.sort((a,b)=>(a.price||0)-(b.price||0));
  else if(s === "price-desc") items.sort((a,b)=>(b.price||0)-(a.price||0));
  else if(s === "rating") items.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if(s === "reviews") items.sort((a,b)=>(b.reviewCount||0)-(a.reviewCount||0));
  else items.sort((a,b)=> (b.reviewCount||0) - (a.reviewCount||0));

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
function pickPublicDir(){
  const candidates = [
    path.resolve(process.cwd(), "public"),
    path.join(__dirname, "public"),
    path.join(__dirname, "..", "public"),
  ];
  for(const p of candidates){
    try {
      if(fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) return p;
    } catch(e){}
  }
  return candidates[0];
}
const PUBLIC_DIR = pickPublicDir();
app.use(express.static(PUBLIC_DIR));
app.get("/", (req,res)=> res.sendFile(path.join(PUBLIC_DIR, "index.html")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log("MiniMarket API+Web running on", PORT));