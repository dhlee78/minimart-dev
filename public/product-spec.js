
const params=new URLSearchParams(location.search);
const id=params.get('id');
const skeleton=document.getElementById('product-skeleton');
const err=document.getElementById('product-error');

let ime=false;
document.addEventListener('compositionstart',()=>ime=true);
document.addEventListener('compositionend',()=>ime=false);

fetch('/products').then(r=>r.json()).then(list=>{
 setTimeout(()=>{
  const p=list.find(x=>String(x.id)===String(id));
  skeleton?.remove();
  if(!p){err.style.display='block';return;}
  try{
   const key='recentlyViewed';
   const arr=JSON.parse(localStorage.getItem(key)||'[]').filter(x=>x.id!==p.id);
   arr.unshift({id:p.id,name:p.name,price:p.price,image:p.image,shipping:p.shipping});
   localStorage.setItem(key,JSON.stringify(arr.slice(0,12)));
  }catch(e){}
 },300);
});
