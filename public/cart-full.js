
const key='cartItems';
let selected=new Set();
let coupon=false;

function safe(){try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(e){return []}}
function save(v){try{localStorage.setItem(key,JSON.stringify(v))}catch(e){alert('저장할 수 없습니다.')}}

function render(){
 const list=safe();
 const wrap=document.querySelector('[data-cart]');
 const empty=document.getElementById('cartEmpty');
 if(!list.length){wrap.innerHTML='';empty.style.display='block';return;}
 empty.style.display='none';

 wrap.innerHTML=list.map((i,idx)=>`
  <div class="row">
   <input type="checkbox" data-sel="${idx}" ${selected.has(idx)?'checked':''}>
   <img src="${i.image}" width="60">
   <div>${i.name}</div>
   <div>${i.price}</div>
   <input type="number" data-q="${idx}" value="${i.quantity}" min="1" max="${i.stock}">
   <button data-del="${idx}">삭제</button>
  </div>`).join('');

 calc();
}

function calc(){
 const list=safe();
 let subtotal=0;
 list.forEach((i,idx)=>{
  if(selected.has(idx)) subtotal+=i.price*i.quantity;
 });
 const ship = subtotal>=50000||subtotal===0?0:3000;
 const disc = coupon? Math.floor(subtotal*0.1):0;
 document.querySelector('[data-subtotal]').textContent=subtotal+'원';
 document.querySelector('[data-ship]').textContent=ship+'원';
 document.querySelector('[data-total]').textContent=(subtotal+ship-disc)+'원';
}

document.addEventListener('change',e=>{
 if(e.target.dataset.sel){
  const i=+e.target.dataset.sel;
  if(e.target.checked) selected.add(i); else selected.delete(i);
  calc();
 }
 if(e.target.dataset.q){
  const list=safe();
  const i=+e.target.dataset.q;
  list[i].quantity=Math.min(list[i].stock,Math.max(1,+e.target.value));
  save(list);
  render();
 }
});

document.addEventListener('click',e=>{
 if(e.target.dataset.del){
  const list=safe();
  list.splice(+e.target.dataset.del,1);
  save(list);
  render();
 }
 if(e.target.id==='delSel'){
  const list=safe().filter((_,idx)=>!selected.has(idx));
  save(list); selected.clear(); render();
 }
 if(e.target.id==='delAll'){
  save([]); selected.clear(); render();
 }
 if(e.target.id==='selectAll'){
  const list=safe();
  if(e.target.checked) list.forEach((_,i)=>selected.add(i));
  else selected.clear();
  render();
 }
});

render();
