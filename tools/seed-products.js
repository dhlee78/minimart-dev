import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "..", "db.json");

const cats = ["apparel","shoes","goods","rocket","dawn"];
const ships = ["rocket","dawn","normal"];

function readDB(){ return JSON.parse(fs.readFileSync(DB_PATH,"utf-8")); }
function writeDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2),"utf-8"); }

const count = parseInt(process.argv[2] || "50", 10);
const db = readDB();

for(let i=0;i<count;i++){
  const id = "p-" + Math.floor(5000 + Math.random()*4000);
  const cat = cats[Math.floor(Math.random()*cats.length)];
  const ship = ships[Math.floor(Math.random()*ships.length)];
  const price = Math.floor(5000 + Math.random()*145000);
  const stock = Math.floor(Math.random()*40);
  const discount = Math.random()<0.35 ? Math.floor(5+Math.random()*25) : 0;
  db.products.push({
    id,
    cat,
    ship,
    name: `샘플 상품 ${i+1} (${cat})`,
    price,
    stock,
    rating: Math.round((3.5 + Math.random()*1.4)*10)/10,
    reviews: Math.floor(Math.random()*5000),
    discount,
    coupon: Math.random()<0.5
  });
}
writeDB(db);
console.log(`✅ seeded products: +${count} (total ${db.products.length})`);