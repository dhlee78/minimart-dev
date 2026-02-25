
const p=new URLSearchParams(location.search).get('id');
let qty=1, stock=10;

function loginGuard(){
 if(!localStorage.getItem('token')){
  location.href='login.html?redirect=product.html&id='+p;
  return false;
 }
 return true;
}

fetch('/products').then(r=>r.json()).then(list=>{
 const prod=list.find(x=>String(x.id)===String(p));
 if(!prod)return;
 stock=prod.stock||10;
 document.getElementById('pd-name').textContent=prod.name;
 document.getElementById('pd-price').textContent=prod.price.toLocaleString();
 document.getElementById('pd-main').src=prod.image;
});

document.getElementById('q-plus').onclick=()=>{
 qty=Math.min(stock,qty+1);
 document.getElementById('q-input').value=qty;
};
document.getElementById('q-minus').onclick=()=>{
 qty=Math.max(1,qty-1);
 document.getElementById('q-input').value=qty;
};

document.getElementById('wish').onclick=()=>{
 if(!loginGuard())return;
 alert('찜 토글');
};

document.getElementById('addcart').onclick=()=>{
 if(!loginGuard())return;
 alert('장바구니 담기');
};


/* service-grade guards */
let adding=false;
window.addEventListener('storage',()=>location.reload());

function safeJSON(key,def){
 try{return JSON.parse(localStorage.getItem(key))||def}catch(e){return def}
}

document.getElementById('addcart').onclick=async()=>{
 if(adding)return;
 if(!loginGuard())return;
 adding=true;
 setTimeout(()=>adding=false,500);
 alert('장바구니 담기 완료');
};
