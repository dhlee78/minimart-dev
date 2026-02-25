
window.handleCartDuplicate=(item)=>{
 if(!item) return;
 item.quantity+=1;
 if(window.toast) toast('이미 담긴 상품입니다. 수량이 증가했습니다.');
};
