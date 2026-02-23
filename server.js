import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
// ✅ server.js에 “로그인 + 허용 이메일(화이트리스트)”를 붙이는 샘플 코드
// 사용 라이브러리: passport, passport-google-oauth20, express-session
//
// 1) 먼저 설치:
//    npm install passport passport-google-oauth20 express-session
//
// 2) server.js에서 app 생성(예: const app = express();) 이후,
//    app.use(express.json()) 같은 설정들 근처에 아래를 붙이세요.
//
// 3) app.use(express.static(...)) 보다 "위"에 두면 정적 페이지도 로그인 걸립니다.
//    (프로젝트 구조에 따라 위치가 다를 수 있어요.)

const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

// 1) 세션 설정 (로그인 상태 유지)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
  })
);

// 2) passport 초기화
app.use(passport.initialize());
app.use(passport.session());

// 3) 세션에 사용자 저장/복원
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 4) 허용 이메일 목록 검사 함수
function isAllowedEmail(email) {
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes((email || "").toLowerCase());
}

// 5) Google 로그인 전략
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile?.emails?.[0]?.value;

      // 이메일이 허용 목록에 없으면 로그인 실패 처리
      if (!isAllowedEmail(email)) {
        return done(null, false);
      }

      // 허용되면 사용자 정보 저장
      return done(null, { email });
    }
  )
);

// 6) 로그인 시작
app.get("/auth/google", passport.authenticate("google", { scope: ["email"] }));

// 7) 로그인 콜백
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/not-allowed" }),
  (req, res) => res.redirect("/")
);

// 8) 허용 안 된 경우
app.get("/not-allowed", (req, res) => {
  res.status(403).send("접근 불가: 허용된 Google 계정이 아닙니다.");
});

// 9) 로그인 강제 미들웨어
function requireLogin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.redirect("/auth/google");
}

// ✅ 전체 사이트 보호(가장 쉬움)
app.use(requireLogin);

// (선택) 로그아웃
app.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

// Request ID for tracing (helps QA + debugging)
app.use((req,res,next)=>{
  const rid = req.get("X-Request-Id") || crypto.randomUUID();
  req.requestId = rid;
  res.setHeader("X-Request-Id", rid);
  next();
});

const DB_PATH = path.join(__dirname, "db.json");

function readDB(){
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}
function writeDB(db){
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}
function log(db, type, meta={}){
  db.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type, meta });
  db.audit = db.audit.slice(0, 200); // keep last 200
}
function discountedPrice(p){
  const d = parseInt(p.discount || 0, 10);
  if(!d) return p.price;
  return Math.round(p.price * (100 - d) / 100);
}
function shippingFee(subtotal){ return subtotal >= 50000 ? 0 : 3000; }

function authToken(req){
  const h = req.headers["authorization"] || "";
  if(typeof h === "string" && h.toLowerCase().startsWith("bearer ")){
    return h.slice(7).trim();
  }
  const t = req.headers["x-auth-token"];
  if(typeof t === "string" && t.trim()) return t.trim();
  return null;
}

function requireAuth(req,res,next){
  const token = authToken(req);
  if(!token) return res.status(401).json({ ok:false, error:"UNAUTHORIZED", message:"로그인이 필요합니다." });
  const db = readDB();
  const sess = db.sessions.find(s => s.token === token);
  if(!sess) return res.status(401).json({ ok:false, error:"INVALID_SESSION", message:"세션이 만료되었거나 유효하지 않습니다." });
  req.token = token;
  req.session = sess;
  req.db = db;
  next();
}

function requireAdmin(req,res,next){
  const token = authToken(req);
  if(!token) return res.status(401).json({ ok:false, error:"UNAUTHORIZED", message:"로그인이 필요합니다." });
  const db = readDB();
  const sess = db.sessions.find(s => s.token === token);
  if(!sess) return res.status(401).json({ ok:false, error:"INVALID_SESSION", message:"세션이 만료되었거나 유효하지 않습니다." });
  const user = db.users.find(u => u.id === sess.userId);
  if(!user || user.role !== "admin") return res.status(403).json({ ok:false, error:"FORBIDDEN", message:"관리자 권한이 필요합니다." });
  req.token = token;
  req.session = sess;
  req.user = user;
  req.db = db;
  next();
}

app.get("/api/health",(req,res)=>res.json({ ok:true, ts: Date.now(), version: 2 }));

/* ---- Products ---- */
app.get("/api/products",(req,res)=>{
  const db = readDB();
  let list = [...db.products];

  const { cat, q, ship, min, max, rate, inStock, sort, page, perPage } = req.query;

  if(typeof cat === "string" && cat !== "all") list = list.filter(p => p.cat === cat);
  if(typeof ship === "string" && ship !== "all") list = list.filter(p => p.ship === ship);
  if(typeof q === "string" && q.trim()){
    const t = q.trim().toLowerCase();
    list = list.filter(p => (p.name || "").toLowerCase().includes(t));
  }

  const nMin = parseInt(typeof min === "string" ? min : "0", 10);
  const nMax = parseInt(typeof max === "string" ? max : "0", 10);
  if(!Number.isNaN(nMin) && nMin > 0) list = list.filter(p => discountedPrice(p) >= nMin);
  if(!Number.isNaN(nMax) && nMax > 0) list = list.filter(p => discountedPrice(p) <= nMax);

  const nRate = parseFloat(typeof rate === "string" ? rate : "0");
  if(!Number.isNaN(nRate) && nRate > 0) list = list.filter(p => p.rating >= nRate);

  if(typeof inStock === "string" && (inStock === "1" || inStock.toLowerCase() === "true")){
    list = list.filter(p => p.stock > 0);
  }

  switch(sort){
    case "price-asc": list.sort((a,b)=> discountedPrice(a)-discountedPrice(b)); break;
    case "price-desc": list.sort((a,b)=> discountedPrice(b)-discountedPrice(a)); break;
    case "rating": list.sort((a,b)=> (b.rating||0)-(a.rating||0)); break;
    case "reviews": list.sort((a,b)=> (b.reviews||0)-(a.reviews||0)); break;
    default: break;
  }

  const p = Math.max(1, parseInt(typeof page === "string" ? page : "1", 10) || 1);
  const pp = Math.min(60, Math.max(1, parseInt(typeof perPage === "string" ? perPage : "12", 10) || 12));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pp));
  const pageClamped = Math.min(totalPages, p);

  const items = list.slice((pageClamped-1)*pp, (pageClamped-1)*pp + pp).map(x => ({
    ...x,
    finalPrice: discountedPrice(x),
  }));

  res.json({ ok:true, total, totalPages, page: pageClamped, perPage: pp, items });
});

app.get("/api/products/:id",(req,res)=>{
  const db = readDB();
  const p = db.products.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"상품을 찾을 수 없습니다." });
  res.json({ ok:true, item: { ...p, finalPrice: discountedPrice(p) } });
});

/* ---- Coupons ---- */
app.get("/api/coupons",(req,res)=>{
  const db = readDB();
  const list = (db.coupons||[]).filter(c=>c.active);
  res.json({ ok:true, items:list });
});

/* ---- Auth ---- */
app.post("/api/auth/login",(req,res)=>{
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ ok:false, error:"BAD_REQUEST", message:"email/password가 필요합니다." });
  const db = readDB();
  const user = db.users.find(u => u.email === email && u.password === password);
  if(!user) return res.status(401).json({ ok:false, error:"INVALID_CREDENTIALS", message:"이메일 또는 비밀번호가 올바르지 않습니다." });

  const token = crypto.randomUUID();
  db.sessions.push({ token, userId: user.id, at: new Date().toISOString() });
  db.carts[token] = db.carts[token] || [];
  db.orders[token] = db.orders[token] || [];
  log(db, "LOGIN", { userId: user.id });
  writeDB(db);
  res.json({ ok:true, token, user: { id:user.id, email:user.email, name:user.name, role:user.role||"user", points: user.points||0 } });
});

app.post("/api/auth/logout", requireAuth, (req,res)=>{
  const db = req.db;
  db.sessions = db.sessions.filter(s => s.token !== req.token);
  log(db, "LOGOUT", { userId: req.session.userId });
  writeDB(db);
  res.json({ ok:true });
});

/* ---- Cart ---- */
app.get("/api/cart", requireAuth, (req,res)=>{
  const db = req.db;
  const cart = db.carts[req.token] || [];
  const items = cart.map(line=>{
    const p = db.products.find(x=>x.id===line.productId);
    return {
      ...line,
      product: p ? { id:p.id, name:p.name, ship:p.ship, price:p.price, finalPrice: discountedPrice(p), stock:p.stock } : null
    };
  });
  res.json({ ok:true, items });
});

app.post("/api/cart/items", requireAuth, (req,res)=>{
  const { productId, qty, opt } = req.body || {};
  const q = Math.max(1, parseInt(qty || 1, 10) || 1);

  const db = req.db;
  const p = db.products.find(x => x.id === productId);
  if(!p) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"상품을 찾을 수 없습니다." });
  if(p.stock === 0) return res.status(409).json({ ok:false, error:"OUT_OF_STOCK", message:"품절 상품입니다." });

  const normOpt = opt && (opt.size || opt.color) ? { size: opt.size || undefined, color: opt.color || undefined } : null;
  const key = JSON.stringify({ productId, opt: normOpt });

  const cart = db.carts[req.token] || [];
  const found = cart.find(x => JSON.stringify({ productId:x.productId, opt:x.opt || null }) === key);
  const next = (found?.qty || 0) + q;
  if(next > p.stock) return res.status(409).json({ ok:false, error:"INSUFFICIENT_STOCK", message:`재고가 부족합니다. (최대 ${p.stock}개)` });

  if(found){
    found.qty = next;
  }else{
    cart.push({ lineId: crypto.randomUUID(), productId, qty: q, opt: normOpt });
  }
  db.carts[req.token] = cart;
  log(db, "CART_ADD", { userId:req.session.userId, productId, qty:q });
  writeDB(db);
  res.json({ ok:true });
});

app.patch("/api/cart/items/:lineId", requireAuth, (req,res)=>{
  const { qty } = req.body || {};
  const q = Math.max(1, parseInt(qty || 1, 10) || 1);

  const db = req.db;
  const cart = db.carts[req.token] || [];
  const line = cart.find(x => x.lineId === req.params.lineId);
  if(!line) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"장바구니 라인을 찾을 수 없습니다." });

  const p = db.products.find(x => x.id === line.productId);
  if(!p) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"상품을 찾을 수 없습니다." });
  if(q > p.stock) return res.status(409).json({ ok:false, error:"INSUFFICIENT_STOCK", message:`재고가 부족합니다. (최대 ${p.stock}개)` });

  line.qty = q;
  log(db, "CART_QTY", { userId:req.session.userId, lineId: req.params.lineId, qty:q });
  writeDB(db);
  res.json({ ok:true });
});

app.delete("/api/cart/items/:lineId", requireAuth, (req,res)=>{
  const db = req.db;
  const cart = db.carts[req.token] || [];
  db.carts[req.token] = cart.filter(x => x.lineId !== req.params.lineId);
  log(db, "CART_REMOVE", { userId:req.session.userId, lineId:req.params.lineId });
  writeDB(db);
  res.json({ ok:true });
});

/* ---- Checkout / Orders ----
   현실적인 필드: address, payment, coupon, points
   status flow: 결제완료 -> 상품준비중 -> 배송중 -> 배송완료
   cancel/refund endpoints (admin)
*/
function validateAddress(a){
  if(!a) return "address가 필요합니다.";
  if(!a.zip || !a.line1) return "address.zip/line1이 필요합니다.";
  return null;
}
function calcCouponDiscount(db, couponCode, subtotal){
  if(!couponCode) return { ok:true, discount:0, reason:null };
  const c = (db.coupons||[]).find(x=>x.code===couponCode);
  if(!c) return { ok:false, discount:0, reason:"INVALID_COUPON" };
  if(!c.active) return { ok:false, discount:0, reason:"COUPON_INACTIVE" };
  if(subtotal < (c.minSubtotal||0)) return { ok:false, discount:0, reason:"COUPON_MIN_NOT_MET" };
  let d = 0;
  if(c.type==="PERCENT"){
    d = Math.floor(subtotal * (c.value/100));
  }else{
    d = c.value || 0;
  }
  const maxD = c.maxDiscount ?? d;
  d = Math.min(d, maxD);
  return { ok:true, discount:d, reason:null, coupon:c };
}

app.post("/api/orders/checkout", requireAuth, (req,res)=>{
  const { address, payment, couponCode, pointsUse, memo } = req.body || {};
  const addrErr = validateAddress(address);
  if(addrErr) return res.status(400).json({ ok:false, error:"BAD_REQUEST", message: addrErr });

  if(!payment || !payment.method) return res.status(400).json({ ok:false, error:"BAD_REQUEST", message:"payment.method가 필요합니다." });

  const db = req.db;
  const user = db.users.find(u=>u.id===req.session.userId);
  const cart = db.carts[req.token] || [];
  if(cart.length === 0) return res.status(400).json({ ok:false, error:"EMPTY_CART", message:"장바구니가 비어있습니다." });

  let subtotal = 0;
  const lines = [];

  for(const line of cart){
    const p = db.products.find(x=>x.id===line.productId);
    if(!p) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"상품을 찾을 수 없습니다." });
    if(p.stock === 0) return res.status(409).json({ ok:false, error:"OUT_OF_STOCK", message:`품절: ${p.name}` });
    if(line.qty > p.stock) return res.status(409).json({ ok:false, error:"INSUFFICIENT_STOCK", message:`재고 부족: ${p.name} (최대 ${p.stock}개)` });

    const unit = discountedPrice(p);
    subtotal += unit * line.qty;
    lines.push({ ...line, name:p.name, unit, ship:p.ship });
  }

  const shipFee = shippingFee(subtotal);
  // coupon discount (applies to subtotal only for demo)
  const c = calcCouponDiscount(db, couponCode, subtotal);
  if(!c.ok) return res.status(400).json({ ok:false, error:c.reason, message:"쿠폰을 적용할 수 없습니다." });

  const wantPoints = Math.max(0, parseInt(pointsUse||0,10) || 0);
  const userPoints = user?.points || 0;
  if(wantPoints > userPoints) return res.status(400).json({ ok:false, error:"POINTS_EXCEED", message:`보유 포인트(${userPoints})를 초과했습니다.` });

  const discountTotal = c.discount + wantPoints;
  const total = Math.max(0, subtotal + shipFee - discountTotal);

  // deduct stock
  for(const line of cart){
    const p = db.products.find(x=>x.id===line.productId);
    p.stock = Math.max(0, (p.stock||0) - line.qty);
  }
  // deduct points, and earn points (1% of total)
  if(user) user.points = Math.max(0, userPoints - wantPoints);
  const earned = Math.floor(total * 0.01);
  if(user) user.points += earned;

  const id = crypto.randomUUID();
  const orderNo = "MM-" + Math.floor(100000 + Math.random()*900000);
  const order = {
    id,
    orderNo,
    at: new Date().toISOString(),
    status: "결제완료",
    customer: { id: user?.id, name: user?.name || "게스트" },
    address,
    payment: { method: payment.method, card: payment.card || null, vbank: payment.vbank || null },
    memo: memo || "",
    couponCode: couponCode || null,
    pointsUsed: wantPoints,
    pointsEarned: earned,
    subtotal,
    shipFee,
    discountTotal,
    total,
    lines
  };

  db.orders[req.token] = db.orders[req.token] || [];
  db.orders[req.token].unshift(order);
  db.ordersById[id] = order;

  db.carts[req.token] = [];
  log(db, "CHECKOUT", { userId:req.session.userId, orderId:id, total, couponCode: couponCode||null, pointsUsed: wantPoints });

  writeDB(db);
  res.json({ ok:true, order });
});

app.get("/api/orders", requireAuth, (req,res)=>{
  const db = req.db;
  res.json({ ok:true, items: db.orders[req.token] || [] });
});

app.get("/api/orders/:id", requireAuth, (req,res)=>{
  const db = req.db;
  const o = db.ordersById[req.params.id];
  if(!o) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"주문을 찾을 수 없습니다." });
  // allow only owner token (simple check)
  const mine = (db.orders[req.token]||[]).some(x=>x.id===o.id);
  if(!mine) return res.status(403).json({ ok:false, error:"FORBIDDEN", message:"해당 주문에 접근할 수 없습니다." });
  res.json({ ok:true, item:o });
});

/* ---- Admin ---- */
const statusFlow = ["결제완료","상품준비중","배송중","배송완료"];
const terminal = ["취소완료","환불완료"];

function canTransition(from, to){
  if(terminal.includes(from)) return false;
  if(terminal.includes(to)) return true; // allow admin to set terminal states
  const i = statusFlow.indexOf(from);
  const j = statusFlow.indexOf(to);
  return i !== -1 && j !== -1 && j >= i; // allow forward or same
}

app.get("/api/admin/overview", requireAdmin, (req,res)=>{
  const db = req.db;
  const orders = Object.values(db.ordersById||{});
  const byStatus = {};
  for(const o of orders) byStatus[o.status] = (byStatus[o.status]||0)+1;
  const lowStock = (db.products||[]).filter(p=>p.stock>0 && p.stock<=3).slice(0,20);
  res.json({ ok:true, stats:{ products: db.products.length, orders: orders.length, users: db.users.length }, byStatus, lowStock });
});

app.get("/api/admin/products", requireAdmin, (req,res)=>{
  const db = req.db;
  res.json({ ok:true, items: db.products });
});

app.patch("/api/admin/products/:id", requireAdmin, (req,res)=>{
  const db = req.db;
  const p = db.products.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"상품을 찾을 수 없습니다." });
  const { price, stock, discount, ship, name } = req.body || {};
  if(price !== undefined) p.price = Math.max(0, parseInt(price,10) || 0);
  if(stock !== undefined) p.stock = Math.max(0, parseInt(stock,10) || 0);
  if(discount !== undefined) p.discount = Math.max(0, Math.min(90, parseInt(discount,10) || 0));
  if(ship !== undefined) p.ship = ship;
  if(name !== undefined) p.name = String(name);
  log(db,"ADMIN_PRODUCT_PATCH",{ admin:req.user.id, productId:p.id });
  writeDB(db);
  res.json({ ok:true, item:p });
});

app.get("/api/admin/orders", requireAdmin, (req,res)=>{
  const db = req.db;
  const list = Object.values(db.ordersById||{}).sort((a,b)=> (b.at||"").localeCompare(a.at||""));
  res.json({ ok:true, items:list });
});

app.patch("/api/admin/orders/:id/status", requireAdmin, (req,res)=>{
  const db = req.db;
  const o = db.ordersById[req.params.id];
  if(!o) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"주문을 찾을 수 없습니다." });
  const { status } = req.body || {};
  if(!status) return res.status(400).json({ ok:false, error:"BAD_REQUEST", message:"status가 필요합니다." });
  if(!canTransition(o.status, status)) return res.status(409).json({ ok:false, error:"INVALID_TRANSITION", message:`상태 변경 불가: ${o.status} -> ${status}` });
  o.status = status;
  log(db,"ADMIN_STATUS",{ admin:req.user.id, orderId:o.id, status });
  writeDB(db);
  res.json({ ok:true, item:o });
});

app.post("/api/admin/orders/:id/cancel", requireAdmin, (req,res)=>{
  const db = req.db;
  const o = db.ordersById[req.params.id];
  if(!o) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"주문을 찾을 수 없습니다." });
  if(terminal.includes(o.status)) return res.status(409).json({ ok:false, error:"ALREADY_TERMINAL", message:"이미 종료된 주문입니다." });
  // restore stock (simple)
  for(const line of o.lines){
    const p = db.products.find(x=>x.id===line.productId);
    if(p) p.stock += line.qty;
  }
  o.status = "취소완료";
  log(db,"ADMIN_CANCEL",{ admin:req.user.id, orderId:o.id });
  writeDB(db);
  res.json({ ok:true, item:o });
});

app.post("/api/admin/orders/:id/refund", requireAdmin, (req,res)=>{
  const db = req.db;
  const o = db.ordersById[req.params.id];
  if(!o) return res.status(404).json({ ok:false, error:"NOT_FOUND", message:"주문을 찾을 수 없습니다." });
  if(o.status !== "배송완료") return res.status(409).json({ ok:false, error:"REFUND_NOT_ALLOWED", message:"배송완료 상태에서만 환불 처리 가능합니다." });
  o.status = "환불완료";
  log(db,"ADMIN_REFUND",{ admin:req.user.id, orderId:o.id });
  writeDB(db);
  res.json({ ok:true, item:o });
});

app.get("/api/admin/audit", requireAdmin, (req,res)=>{
  const db = req.db;
  res.json({ ok:true, items: db.audit || [] });
});

/* ---- Debug ---- */
app.post("/api/debug/reset",(req,res)=>{
  const db = readDB();
  db.sessions = [];
  db.carts = {};
  db.orders = {};
  db.ordersById = {};
  db.audit = [];
  writeDB(db);
  res.json({ ok:true, message:"세션/장바구니/주문/감사로그 초기화 (상품/쿠폰/유저는 유지)" });
});

/* ---- Serve UI ---- */
app.use("/", express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`MiniMarket v2 running on http://localhost:${PORT}`));