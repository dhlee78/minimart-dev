(()=> {
  const $ = (s)=>document.querySelector(s);
  const fmt = (n)=> (Number(n)||0).toLocaleString("ko-KR")+"원";
  const toast = (m)=> (typeof window.toast==="function"?window.toast(m):alert(m));

  const mount = document.querySelector("[data-cart]");
  const skel = $("#cart-skeleton");
  const err = $("#cart-error");
  const retry = $("#cart-retry");
  const empty = $("#cartEmpty");

  const selAll = $("#cartSelectAll") || $("#selectAll");
  const delSel = $("#cartDeleteSelected") || $("#delSel");
  const delAll = $("#cartDeleteAll") || $("#delAll");

  const subtotalEl = document.querySelector("[data-subtotal]");
  const shipEl = document.querySelector("[data-ship]");
  const discEl = document.querySelector("[data-discount]");
  const totalEl = document.querySelector("[data-total]");
  const checkoutBtn = document.querySelector("[data-checkout]");

  let cartItems = [];
  let selected = new Set(); // session memory, reset on refresh
  let couponApplied = false;
  let loading = false;

  function showSkeleton(){ if(skel) skel.style.display="block"; if(err) err.style.display="none"; }
  function hideSkeleton(){ if(skel) skel.style.display="none"; }
  function showError(){ if(err) err.style.display="block"; }
  function setEmpty(isEmpty){ if(empty) empty.style.display=isEmpty?"block":"none"; }

  async function apiJson(url, opts, meta){
    return await window.apiFetchJson(url, opts, meta);
  }

  async function loadCart(){
    loading = true;
    showSkeleton();
    const start = Date.now();
    try{
      const data = await apiJson("/cart",{method:"GET"},{redirect:"cart"});
      cartItems = data.items || [];
      // validate (clamp) on entry
      const ids = cartItems.map(x=>x.cartItemId);
      if(ids.length){
        const v = await apiJson("/cart/validate",{method:"POST",body:JSON.stringify({cartItemIds:ids})},{redirect:"cart"});
        if((v.adjustments||[]).some(a=>a.type==="CLAMPED")){
          toast("최대 구매 수량을 초과했습니다.");
        }
      }
      // re-fetch after validate to get updated items
      const data2 = await apiJson("/cart",{method:"GET"},{redirect:"cart"});
      cartItems = data2.items || [];

      // 품절 처리: stock=0이면 선택 해제 + 토스트
      let removedSel=false;
      for(const it of cartItems){
        if((it.stock||0)===0 && selected.has(it.cartItemId)){ selected.delete(it.cartItemId); removedSel=true; }
      }
      if(removedSel) toast("품절 상품이 제외되었습니다.");

      await minDelay(start,300);
      hideSkeleton();
      render();
      window.updateCartBadgeFromAPI && window.updateCartBadgeFromAPI();
    }catch(e){
      await minDelay(start,300);
      hideSkeleton();
      showError();
    }finally{
      loading = false;
    }
  }

  function minDelay(start, ms){
    const d = Date.now()-start;
    const r = Math.max(0, ms-d);
    return r? new Promise(res=>setTimeout(res,r)) : Promise.resolve();
  }

  function isSoldOut(it){ return (it.stock||0)===0; }

  function render(){
    if(!mount) return;

    setEmpty(cartItems.length===0);
    if(cartItems.length===0){
      mount.innerHTML="";
      selAll && (selAll.checked=false);
      updateSummary();
      updateCheckoutState();
      return;
    }

    mount.innerHTML = cartItems.map(it=>{
      const disabled = isSoldOut(it) ? "disabled" : "";
      const checked = selected.has(it.cartItemId) ? "checked" : "";
      const opt = it.option ? `<div style="font-size:13px;color:#4B5563;margin-top:4px">${escapeHtml(it.option.label||"")}</div>` : "";
      const sold = isSoldOut(it) ? `<span class="pill" style="background:rgba(220,38,38,.08);color:#DC2626;margin-left:8px">품절</span>` : "";
      return `
      <div class="card" style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin-bottom:12px;background:#fff;display:grid;grid-template-columns:24px 84px 1fr 140px 140px 120px;gap:12px;align-items:center">
        <div><input type="checkbox" data-sel="${it.cartItemId}" style="width:16px;height:16px" ${checked} ${disabled}></div>
        <img src="${escapeAttr(it.image||"")}" alt="" style="width:84px;height:84px;border-radius:12px;object-fit:cover;background:#F5F6F8" onerror="this.src='https://via.placeholder.com/150?text=No+Image'">
        <div>
          <div style="font-weight:700">${escapeHtml(it.name||"")}${sold}</div>
          ${opt}
          ${it.option ? `<button type="button" class="link" data-changeopt="${it.cartItemId}" style="margin-top:6px">옵션 변경</button>` : ``}
        </div>
        <div>
          <div style="font-weight:800">${fmt(it.price)}</div>
          ${it.originalPrice && it.originalPrice>it.price ? `<div style="font-size:12px;color:#9CA3AF;text-decoration:line-through">${fmt(it.originalPrice)}</div>` : ``}
        </div>
        <div>
          <div style="display:flex;align-items:center;border:1px solid #E5E7EB;border-radius:8px;height:36px;overflow:hidden;opacity:${disabled?0.6:1}">
            <button type="button" data-dec="${it.cartItemId}" style="width:36px;height:36px;border:0;background:#fff" ${disabled}>-</button>
            <div style="flex:1;text-align:center;font-weight:700">${it.quantity}</div>
            <button type="button" data-inc="${it.cartItemId}" style="width:36px;height:36px;border:0;background:#fff" ${disabled}>+</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <div style="font-weight:800">${fmt((it.price||0)*(it.quantity||0))}</div>
          <button type="button" class="link-danger" data-del="${it.cartItemId}">삭제</button>
        </div>
      </div>
      `;
    }).join("");

    // select-all check state
    const selectable = cartItems.filter(it=>!isSoldOut(it));
    const allSelected = selectable.length>0 && selectable.every(it=>selected.has(it.cartItemId));
    if(selAll) selAll.checked = allSelected;

    updateSummary();
    updateCheckoutState();
  }

  function updateCheckoutState(){
    if(!checkoutBtn) return;
    const ok = selected.size>0;
    checkoutBtn.disabled = !ok;
    checkoutBtn.style.opacity = ok ? "1" : "0.5";
  }

  let summaryTimer=null;
  function updateSummary(){
    if(summaryTimer) clearTimeout(summaryTimer);
    summaryTimer=setTimeout(async ()=>{
      try{
        if(!subtotalEl||!shipEl||!discEl||!totalEl) return;
        const ids = Array.from(selected);
        if(ids.length===0){
          subtotalEl.textContent=fmt(0); shipEl.textContent=fmt(0); discEl.textContent=fmt(0); totalEl.textContent=fmt(0);
          return;
        }
        const q = await apiJson("/checkout/quote",{method:"POST",body:JSON.stringify({cartItemIds:ids,couponApplied})},{redirect:"cart"});
        subtotalEl.textContent=fmt(q.totalPrice);
        shipEl.textContent=fmt(q.shippingFee);
        discEl.textContent=fmt(q.discount);
        totalEl.textContent=fmt(q.finalPrice);
      }catch(e){
        // keep previous
      }
    }, 50);
  }

  // quantity throttle per item
  const qTimers = new Map();
  function setQty(cartItemId, nextQty){
    if(qTimers.get(cartItemId)) return;
    qTimers.set(cartItemId, true);
    setTimeout(()=>qTimers.delete(cartItemId), 200);

    (async ()=>{
      try{
        const it = cartItems.find(x=>x.cartItemId===cartItemId);
        if(!it) return;
try{
  await apiJson("/cart/"+encodeURIComponent(cartItemId),{method:"PATCH",body:JSON.stringify({quantity: nextQty})},{redirect:"cart"});
}catch(err){
  if(err?.code==="CART_STOCK_EXCEEDED"){
    // clamp to available stock and re-render
    toast(err.message || "요청 수량이 재고를 초과했습니다.");
    await loadCart();
    return;
  }
  if(err?.code==="CART_INVALID_QUANTITY"){
    toast(err.message || "수량이 올바르지 않습니다.");
    await loadCart();
    return;
  }
  throw err;
}

        // If clamped (server), show toast when exceeded
        if(nextQty > (res.stock||0) && (res.quantity||0)===(res.stock||0)){
          toast("최대 구매 수량을 초과했습니다.");
        }
        // refresh cart
        const data = await apiJson("/cart",{method:"GET"},{redirect:"cart"});
        cartItems = data.items||[];
        render();
        window.updateCartBadgeFromAPI && window.updateCartBadgeFromAPI();
      }catch(e){
        toast("저장할 수 없습니다.");
      }
    })();
  }

  // option change: delete + add new item
  async function changeOption(cartItemId){
    const it = cartItems.find(x=>x.cartItemId===cartItemId);
    if(!it) return;
    try{
      const p = await apiJson("/products/"+encodeURIComponent(it.productId),{method:"GET"},{redirect:"cart"});
      const opts = Array.isArray(p.options)?p.options:[];
      if(opts.length===0) return;

      const overlay = document.querySelector("[data-modal-overlay]");
      const dialog = document.querySelector("[data-modal-dialog]");
      if(!overlay||!dialog) return;

      overlay.setAttribute("aria-hidden","false");
      overlay.style.display="flex";

      dialog.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-weight:900;font-size:18px">옵션 변경</div>
          <button type="button" data-closeopt style="border:0;background:transparent;font-size:18px;font-weight:900">×</button>
        </div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:10px">${escapeHtml(p.name||"")}</div>
        <select data-optselect style="width:100%;height:40px;border:1px solid #E5E7EB;border-radius:8px;padding:0 12px">
          ${opts.map(o=>`<option value="${escapeAttr(o.optionId)}">${escapeHtml(o.label)} (재고 ${o.stock})</option>`).join("")}
        </select>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button type="button" class="btn" data-closeopt style="flex:1;height:40px">취소</button>
          <button type="button" class="btn primary" data-applyopt style="flex:1;height:40px">적용</button>
        </div>
      `;

      const close=()=>{
        overlay.setAttribute("aria-hidden","true");
        overlay.style.display="none";
        dialog.innerHTML="";
      };

      dialog.querySelectorAll("[data-closeopt]").forEach(b=>b.addEventListener("click", close));
      overlay.addEventListener("click",(ev)=>{ if(ev.target===overlay) close(); }, {once:true});

      dialog.querySelector("[data-applyopt]").addEventListener("click", async ()=>{
        const optId = dialog.querySelector("[data-optselect]").value;
        close();
        // delete old
        await apiJson("/cart/"+encodeURIComponent(cartItemId),{method:"DELETE"},{redirect:"cart"});
        // add new
        const opt = opts.find(o=>String(o.optionId)===String(optId));
        const max = opt ? (opt.stock||0) : 0;
        const qty = Math.max(1, Math.min(it.quantity||1, max||1));
        if(max===0){ toast("품절된 상품입니다."); return; }
        await apiJson("/cart",{method:"POST",body:JSON.stringify({productId: it.productId, optionId: optId, quantity: qty})},{redirect:"cart"});
        toast("장바구니에 담았습니다.");
        const data = await apiJson("/cart",{method:"GET"},{redirect:"cart"});
        cartItems=data.items||[];
        // selection reset of removed old id
        selected.delete(cartItemId);
        render();
        window.updateCartBadgeFromAPI && window.updateCartBadgeFromAPI();
      });
    }catch(e){
      toast("처리 중 문제가 발생했습니다.");
    }
  }

  // delete handlers
  async function deleteItems(ids){
    try{
      for(const id of ids){
        await apiJson("/cart/"+encodeURIComponent(id),{method:"DELETE"},{redirect:"cart"});
        selected.delete(id);
      }
      const data = await apiJson("/cart",{method:"GET"},{redirect:"cart"});
      cartItems=data.items||[];
      render();
      window.updateCartBadgeFromAPI && window.updateCartBadgeFromAPI();
      return true;
    }catch(e){
      toast("저장할 수 없습니다.");
      return false;
    }
  }

  // debounce add/order etc
  let orderLock=false;

  document.addEventListener("click",(e)=>{
    const t=e.target;
    if(!t) return;

    if(t.matches("[data-sel]")){
      const id=t.getAttribute("data-sel");
      if(t.checked) selected.add(id); else selected.delete(id);
      // smooth scroll to top on list change
      window.scrollTo({top:0, behavior:"smooth"});
      render();
      return;
    }
    if(t.matches("[data-del]")){
      deleteItems([t.getAttribute("data-del")]);
      return;
    }
    if(t.matches("[data-inc]")){
      const id=t.getAttribute("data-inc");
      const it=cartItems.find(x=>x.cartItemId===id);
      if(it) setQty(id, (it.quantity||1)+1);
      return;
    }
    if(t.matches("[data-dec]")){
      const id=t.getAttribute("data-dec");
      const it=cartItems.find(x=>x.cartItemId===id);
      if(it) setQty(id, Math.max(1,(it.quantity||1)-1));
      return;
    }
    if(t.matches("[data-changeopt]")){
      changeOption(t.getAttribute("data-changeopt"));
      return;
    }
    if(t===delAll){
      if(cartItems.length===0){ toast("장바구니를 비웠습니다."); return; }
      (async()=>{
        try{
          await apiJson("/cart",{method:"DELETE"},{redirect:"cart"});
          selected.clear();
          cartItems=[];
          toast("장바구니를 비웠습니다.");
          render();
          window.updateCartBadgeFromAPI && window.updateCartBadgeFromAPI();
        }catch(e){ toast("저장할 수 없습니다."); }
      })();
      return;
    }
    if(t===delSel){
      const ids = Array.from(selected);
      if(ids.length===0){ toast("선택된 상품이 없습니다."); return; }
      deleteItems(ids).then(ok=>{ if(ok) toast("선택한 상품을 삭제했습니다."); });
      return;
    }
    if(t===checkoutBtn){
      if(orderLock) return;
      const ids=Array.from(selected);
      if(ids.length===0){ toast("주문할 상품을 선택해주세요."); return; }
      orderLock=true; setTimeout(()=>orderLock=false, 500);
      (async()=>{
        try{
          const r = await apiJson("/orders",{method:"POST",body:JSON.stringify({cartItemIds:ids,couponApplied})},{redirect:"cart"});
          // success
          toast("주문이 완료되었습니다(목업).");
          selected.clear();
          window.updateCartBadgeFromAPI && window.updateCartBadgeFromAPI();
          location.href="orders.html";
        }catch(e){
          toast("처리 중 문제가 발생했습니다.");
        }
      })();
      return;
    }
  });

  if(selAll){
    selAll.addEventListener("change", ()=>{
      const selectable = cartItems.filter(it=>!isSoldOut(it));
      if(selAll.checked){
        selectable.forEach(it=>selected.add(it.cartItemId));
      }else{
        selectable.forEach(it=>selected.delete(it.cartItemId));
      }
      window.scrollTo({top:0, behavior:"smooth"});
      render();
    });
  }

  if(retry) retry.addEventListener("click", ()=>{ loadCart(); });

  function escapeHtml(s){ return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }
  function escapeAttr(s){ return escapeHtml(s).replace(/'/g,"&#39;"); }

  loadCart();
})();
