import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "..", "db.json");

function readDB(){ return JSON.parse(fs.readFileSync(DB_PATH,"utf-8")); }
function writeDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2),"utf-8"); }

const db = readDB();
const count = parseInt(process.argv[2] || "10", 10);

function orderNo(){ return "MM-" + Math.floor(100000 + Math.random()*900000); }
function nowIso(){ return new Date().toISOString(); }
const statuses = ["결제완료","상품준비중","배송중","배송완료","취소완료","환불완료"];

for(let i=0;i<count;i++){
  const o = {
    id: crypto.randomUUID(),
    orderNo: orderNo(),
    at: nowIso(),
    status: statuses[Math.floor(Math.random()*statuses.length)],
    customer: { name:"샘플", phone:"010-0000-0000" },
    address: { zip:"00000", line1:"서울시 강남구", line2:"어딘가 123" },
    payment: { method:"카드", card:"****-****-****-1234" },
    pointsUsed: Math.random()<0.4 ? Math.floor(Math.random()*5000) : 0,
    couponCode: Math.random()<0.4 ? "WELCOME10" : null,
    subtotal: 0,
    shipFee: 3000,
    discountTotal: 0,
    total: 0,
    lines: []
  };
  const linesN = 1 + Math.floor(Math.random()*4);
  for(let j=0;j<linesN;j++){
    const p = db.products[Math.floor(Math.random()*db.products.length)];
    const qty = 1 + Math.floor(Math.random()*2);
    const unit = Math.round(p.price*(100-(p.discount||0))/100);
    o.subtotal += unit*qty;
    o.lines.push({ productId:p.id, name:p.name, qty, unit, ship:p.ship, opt:null });
  }
  if(o.subtotal>=50000) o.shipFee = 0;
  o.total = o.subtotal + o.shipFee - o.discountTotal;
  db.ordersById[o.id] = o;
}
writeDB(db);
console.log(`✅ seeded orders: +${count}`);