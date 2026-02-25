
document.addEventListener('PRODUCT_OPTION_REQUIRED',()=>{
 const sel=document.querySelector('[data-option-select]');
 const err=document.querySelector('[data-option-error]');
 if(sel){ sel.style.border='1px solid #DC2626'; sel.focus(); }
 if(err){ err.textContent='옵션을 선택해주세요.'; err.style.display='block'; }
});
