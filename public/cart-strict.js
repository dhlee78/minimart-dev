
const key='cartItems';
let selected=new Set();
let coupon=false;
let throttle=false;

function safe(){
 try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(e){return []}
}

function save(v){
 try{localStorage.setItem(key,JSON.stringify(v));return true;}
 catch(e){alert('저장할 수 없습니다.');return false;}
}

function badgeUpdate(){
 const list=safe();
 const total=list.reduce((a,b)=>a+b.quantity,0);
 const badge=document.querySelector('[data-cart-badge]');
 if(badge) badge.textContent=total;
}

function render(){
 const list=safe();
 const wrap=document.querySelector('[data-cart]');
 if(!list.length){
  wrap.innerHTML='<div style="padding:60px;text-align:center"><h2>장바구니가 비었습니다</h2><a href="index.html#products">상품 보러가기</a></div>';
  return;
 }

 wrap.innerHTML=list.map((i,idx)=>{
  const sold=i.stock===0;
  return `
  <div style="padding:16px;border:1px solid #E5E7EB;border-radius:12px;margin-bottom:12px;background:#fff">
    <input type="checkbox" data-sel="${idx}" ${sold?'disabled':''}>
    ${sold?'<span style="color:#DC2626;font-weight:700;margin-left:8px">품절</span>':''}
    <div>${i.name}</div>
    <div>${i.price}원</div>
    <input type="number" data-q="${idx}" value="${i.quantity}" min="1" max="${i.stock}" ${sold?'disabled':''}>
    <button data-del="${idx}">삭제</button>
  </div>`;
 }).join('');

 calc();
 badgeUpdate();
}

function calc(){
 const list=safe();
 let subtotal=0;
 list.forEach((i,idx)=>{
  if(selected.has(idx) && i.stock>0){
    subtotal+=i.price*i.quantity;
  }
 });
 const ship = subtotal>=50000||subtotal===0?0:3000;
 const disc = coupon?Math.floor(subtotal*0.1):0;
 document.querySelector('[data-subtotal]').textContent=subtotal+'원';
 document.querySelector('[data-ship]').textContent=ship+'원';
 document.querySelector('[data-total]').textContent=(subtotal+ship-disc)+'원';
}

document.addEventListener('change',e=>{
 if(e.target.dataset.sel){
  const i=+e.target.dataset.sel;
  if(e.target.checked) selected.add(i);
  else selected.delete(i);
  calc();
 }
 if(e.target.dataset.q){
  if(throttle)return;
  throttle=true;
  setTimeout(()=>throttle=false,200);

  const list=safe();
  const i=+e.target.dataset.q;
  const val=Math.max(1,Math.min(list[i].stock,+e.target.value));
  if(+e.target.value>list[i].stock){
    alert('최대 구매 수량을 초과했습니다.');
  }
  list[i].quantity=val;
  if(save(list)) render();
 }
});

document.addEventListener('click',e=>{
 if(e.target.dataset.del){
  const list=safe();
  list.splice(+e.target.dataset.del,1);
  save(list);
  render();
 }
});

render();
