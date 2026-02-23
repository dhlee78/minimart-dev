// Wishlist page script (uses same LS keys and product list as app.js, duplicated minimally)
const LS = { wishlist:"minimart_wishlist" };
const products = window.__MINIMART_PRODUCTS__ || null;

// Fallback: If app.js not loaded, we can't access products. We'll fetch via embedded list below.
const PRODUCTS = products || [
  { id:"p-4001", name:"로켓 데일리 티셔츠", price:19900 },
  { id:"p-4002", name:"새벽배송 간편 샐러드 세트", price:12900 },
  { id:"p-4003", name:"미니멀 후드 집업", price:39900 },
  { id:"p-4004", name:"슬림 데님 팬츠", price:45900 },
  { id:"p-4005", name:"러닝 스니커즈", price:79000 },
  { id:"p-4006", name:"무지 양말 6팩", price:9900 },
  { id:"p-4007", name:"데스크 정리 트레이", price:14900 },
  { id:"p-4008", name:"샌들 슬라이드", price:23900 },
  { id:"p-4009", name:"로켓 미니 크로스백", price:34900 },
  { id:"p-4010", name:"긴 상품명 테스트용 — UI 줄바꿈/오버플로/툴팁 확인 12345", price:12900 },
  { id:"p-4011", name:"특수문자/이모지 테스트 😄 [!@#$%]", price:15900 },
  { id:"p-4012", name:"새벽배송 우유 2L", price:6800 },
  { id:"p-4013", name:"캠핑 랜턴", price:59000 },
  { id:"p-4014", name:"봄 자켓", price:89000 },
  { id:"p-4015", name:"로켓 USB-C 케이블 2m", price:8900 },
];

function getWishlist(){ try { return JSON.parse(localStorage.getItem(LS.wishlist)||"[]"); } catch { return []; } }
function setWishlist(arr){ localStorage.setItem(LS.wishlist, JSON.stringify(arr)); }
function money(n){ return n.toLocaleString("ko-KR")+"원"; }
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
document.addEventListener("DOMContentLoaded", ()=>{
  const mount = document.querySelector("[data-wishlist]");
  const ids = getWishlist();
  const list = ids.map(id=>PRODUCTS.find(p=>p.id===id)).filter(Boolean);
  if(list.length===0){
    mount.innerHTML = `<div style="padding:14px;color:#6b7280">찜한 상품이 없습니다.</div>`;
    return;
  }
  mount.innerHTML = `
    <table class="table">
      <thead><tr><th>상품</th><th>가격</th><th></th></tr></thead>
      <tbody>
        ${list.map(p=>`
          <tr>
            <td style="font-weight:950"><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name||p.id)}</a></td>
            <td style="font-weight:950">${p.price?money(p.price):"-"}</td>
            <td><button class="btn" data-rm="${escapeHtml(p.id)}" type="button">삭제</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  mount.querySelectorAll("[data-rm]").forEach(b=>b.addEventListener("click", ()=>{
    const id=b.getAttribute("data-rm");
    const next = getWishlist().filter(x=>x!==id);
    setWishlist(next);
    location.reload();
  }));
});