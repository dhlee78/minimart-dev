(()=> {
  const $ = (s)=>document.querySelector(s);
  const toast = (m)=> (window.toast?window.toast(m):alert(m));
  const fmt = (n)=> (Number(n)||0).toLocaleString("ko-KR")+"원";

  const mount = document.querySelector("[data-wishlist]");
  if(!mount) return;

  const WKEY="wishlist"; // anon fallback

  function isLoggedIn(){
    try{
      const a=JSON.parse(localStorage.getItem("auth")||"null");
      const t=JSON.parse(localStorage.getItem("tokens")||"null");
      return !!(a&&a.isLoggedIn&&t&&t.accessToken);
    }catch(e){ return false; }
  }

  async function apiJson(url, opts, meta){
    return await window.apiFetchJson(url, opts, meta);
  }

  function loadLocal(){ try{ return JSON.parse(localStorage.getItem(WKEY)||"[]"); }catch(e){ return []; } }
  function saveLocal(v){ localStorage.setItem(WKEY, JSON.stringify(v)); }

  // UI state
  let sort="recent";
  let items=[]; // unified shape: { productId, addedAt, product|null }
  let loading=true;

  function render(){
    if(loading){
      mount.innerHTML = skeleton();
      return;
    }

    const real = items.filter(x=>x.product);
    const count = items.length;

    // Toolbar hidden when empty
    const toolbar = count===0 ? "" : `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin:10px 0 16px">
        <div class="pill" style="font-size:13px;font-weight:800;background:#F5F6F8;border-radius:999px;padding:6px 12px">${count}개</div>
        <div style="display:flex;gap:10px;align-items:center">
          <button type="button" class="link-danger" data-clear style="font-size:13px;font-weight:800">전체삭제</button>
          <select data-sort style="height:36px;border:1px solid #E5E7EB;border-radius:8px;padding:0 10px;font-weight:700">
            <option value="recent">최근 추가순</option>
            <option value="price-asc">가격 낮은순</option>
            <option value="price-desc">가격 높은순</option>
          </select>
        </div>
      </div>
    `;

    if(count===0){
      mount.innerHTML = `
        <div style="font-size:20px;font-weight:900;margin-bottom:16px">찜</div>
        <div style="text-align:center;padding:80px 16px">
          <div style="font-size:18px;font-weight:900;margin-bottom:8px">찜한 상품이 없습니다.</div>
          <div style="font-size:14px;color:#4B5563;margin-bottom:14px">마음에 드는 상품을 찜해보세요.</div>
          <a class="btn primary" href="index.html#products" style="height:40px;display:inline-flex;align-items:center;justify-content:center">상품 보러가기</a>
        </div>
      `;
      return;
    }

    // apply sort
    const sorted = items.slice();
    if(sort==="recent"){
      sorted.sort((a,b)=> new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }else if(sort==="price-asc"){
      sorted.sort((a,b)=> ((a.product?.price)||0) - ((b.product?.price)||0));
    }else if(sort==="price-desc"){
      sorted.sort((a,b)=> ((b.product?.price)||0) - ((a.product?.price)||0));
    }

    mount.innerHTML = `
      <div style="font-size:20px;font-weight:900;margin-bottom:4px">찜</div>
      ${toolbar}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px" class="wl-grid">
        ${sorted.map(renderCard).join("")}
      </div>
    `;

    const sel = mount.querySelector("[data-sort]");
    if(sel) sel.value = sort;

    // responsive tweak
    const style = document.createElement("style");
    style.textContent = `
      @media (max-width:1200px){ .wl-grid{ grid-template-columns:repeat(3,1fr) !important; } }
      @media (max-width:768px){ .wl-grid{ grid-template-columns:repeat(2,1fr) !important; } }
    `;
    mount.appendChild(style);
  }

  function skeleton(){
    return `
      <div style="font-size:20px;font-weight:900;margin-bottom:16px">찜</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
        ${Array.from({length:8}).map(()=>`<div style="height:260px;background:#F5F6F8;border-radius:12px"></div>`).join("")}
      </div>
    `;
  }

  function couponPill(){
    return `<span title="쿠폰은 상세에서 받기" style="font-size:12px;font-weight:800;color:#2563EB;background:rgba(37,99,235,0.08);border-radius:999px;padding:4px 10px">쿠폰</span>`;
  }

  function shipPill(sh){
    const map={
      rocket:{bg:"rgba(37,99,235,0.08)", c:"#2563EB", t:"로켓"},
      dawn:{bg:"rgba(99,102,241,0.10)", c:"#6366F1", t:"새벽"},
      normal:{bg:"rgba(75,85,99,0.10)", c:"#4B5563", t:"일반"},
    };
    const v=map[sh]||map.normal;
    return `<span style="font-size:12px;font-weight:800;padding:3px 8px;border-radius:999px;background:${v.bg};color:${v.c}">${v.t}</span>`;
  }

  function renderCard(w){
    if(!w.product){
      return `
        <div style="border:1px solid #E5E7EB;border-radius:12px;padding:12px;background:#fff">
          <div style="font-size:14px;font-weight:800;color:#4B5563">삭제된 상품</div>
          <div style="font-size:13px;color:#9CA3AF;margin-top:6px">상품 정보를 찾을 수 없습니다.</div>
          <button type="button" class="btn" data-remove="${escapeAttr(w.productId)}" style="margin-top:12px;height:36px;border:1px solid #E5E7EB;background:#fff">목록에서 제거</button>
        </div>
      `;
    }
    const p=w.product;
    const priceHtml = (p.originalPrice && p.originalPrice>p.price)
      ? `<div style="display:flex;gap:8px;align-items:baseline"><div style="font-size:16px;font-weight:950">${fmt(p.price)}</div><div style="font-size:12px;color:#9CA3AF;text-decoration:line-through">${fmt(p.originalPrice)}</div></div>`
      : `<div style="font-size:16px;font-weight:950">${fmt(p.price)}</div>`;

    return `
      <div style="border:1px solid #E5E7EB;border-radius:12px;padding:12px;background:#fff;position:relative">
        <button type="button" data-unlike="${escapeAttr(w.productId)}" aria-label="remove" style="position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;background:transparent;font-size:18px;color:#DC2626;cursor:pointer">♥</button>
        <img src="${escapeAttr(p.image||"")}" alt="" style="width:100%;aspect-ratio:1/1;border-radius:10px;object-fit:cover;background:#F5F6F8" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
        <div title="${escapeAttr(p.name||"")}" style="margin-top:10px;font-size:14px;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(p.name||"")}</div>

        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
          ${shipPill(p.shipping)}
          ${p.coupon?couponPill():""}
          <span style="font-size:12px;color:#4B5563">⭐ ${p.rating ?? "—"} (${p.reviewCount||0})</span>
        </div>

        <div style="margin-top:8px">${priceHtml}</div>

        <div style="display:flex;gap:10px;margin-top:12px">
          <a class="link" href="product.html?id=${encodeURIComponent(w.productId)}" style="font-size:13px;font-weight:800;color:#2563EB">상세</a>
          <button type="button" class="btn primary" data-add="${escapeAttr(w.productId)}" style="flex:1;height:40px">담기</button>
        </div>
      </div>
    `;
  }

  function escapeHtml(s){ return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }
  function escapeAttr(s){ return escapeHtml(s).replace(/'/g,"&#39;"); }

  async function load(){
    loading=true;
    render();
    const start=Date.now();
    try{
      if(isLoggedIn()){
        const data = await apiJson("/wishlist",{method:"GET"},{redirect:"wishlist"});
        items = (data.items||[]).map(x=>({
          productId: String(x.productId),
          addedAt: x.addedAt,
          product: x.product ? x.product : null
        }));
      }else{
        // anonymous: join with products list (best effort)
        const wl = loadLocal();
        const data = await fetch("/products?perPage=100&page=1&sort=reco");
        const p = data.ok ? await data.json() : {items:[]};
        const map = new Map((p.items||[]).map(it=>[String(it.id), it]));
        items = wl.map(x=>({productId:String(x.id||x.productId), addedAt:x.addedAt, product: map.get(String(x.id||x.productId))||null}));
      }
      // minimum skeleton 300ms
      const d=Date.now()-start; const r=Math.max(0,300-d); if(r) await new Promise(res=>setTimeout(res,r));
      loading=false;
      render();
    }catch(e){
      // fallback error UI
      const d=Date.now()-start; const r=Math.max(0,300-d); if(r) await new Promise(res=>setTimeout(res,r));
      loading=false;
      mount.innerHTML = `
        <div style="text-align:center;padding:80px 16px">
          <div style="font-size:18px;font-weight:900;margin-bottom:12px">찜 목록을 불러오지 못했습니다.</div>
          <button type="button" class="btn primary" data-retry style="height:40px">다시 시도</button>
        </div>
      `;
    }
  }

  async function unlike(productId){
    const prev = items.slice();
    items = items.filter(x=>x.productId!==String(productId));
    render();
    try{
      if(isLoggedIn()){
        await apiJson("/wishlist/"+encodeURIComponent(productId),{method:"DELETE"},{redirect:"wishlist"});
      }else{
        const wl = loadLocal().filter(x=>String(x.id||x.productId)!==String(productId));
        saveLocal(wl);
      }
      toast("찜에서 제거");
    }catch(e){
      items = prev;
      render();
      toast("저장할 수 없습니다.");
    }
  }

  async function clearAll(){
    if(items.length===0){ toast("찜 목록이 비어 있습니다."); return; }
    const prev = items.slice();
    items = [];
    render();
    try{
      if(isLoggedIn()){
        await apiJson("/wishlist",{method:"DELETE"},{redirect:"wishlist"});
      }else{
        saveLocal([]);
      }
      toast("찜 목록을 비웠습니다.");
    }catch(e){
      items = prev;
      render();
      toast("저장할 수 없습니다.");
    }
  }

  // add to cart (debounced 500ms per product)
  const addLock = new Map();
  async function addToCart(productId){
    if(addLock.get(productId)) return;
    addLock.set(productId,true);
    setTimeout(()=>addLock.delete(productId), 500);

    const entry = items.find(x=>x.productId===String(productId));
    const p = entry?.product;
    if(p && (p.stock||0)===0){ toast("품절된 상품입니다."); return; }

    if(!isLoggedIn()){
      // store intent per login spec
      try{
        localStorage.setItem("postLoginIntent", JSON.stringify({type:"addToCart", productId:String(productId), option:"", quantity:1}));
      }catch(e){}
      location.href = "login.html?redirect=wishlist";
      return;
    }

    try{
      const detail = await apiJson("/products/"+encodeURIComponent(productId),{method:"GET"},{redirect:"wishlist"});
      const opts = Array.isArray(detail.options)?detail.options:[];
      if(opts.length>0){
        // open option select modal
        const picked = await pickOption(detail);
        if(!picked) return;
        if((picked.stock||0)===0){ toast("품절된 상품입니다."); return; }
        await apiJson("/cart",{method:"POST",body:JSON.stringify({productId:String(productId), optionId:picked.optionId, quantity:1})},{redirect:"wishlist"});
      }else{
        if((detail.stock||0)===0){ toast("품절된 상품입니다."); return; }
        await apiJson("/cart",{method:"POST",body:JSON.stringify({productId:String(productId), optionId:null, quantity:1})},{redirect:"wishlist"});
      }
      toast("장바구니에 담았습니다.");
      window.updateCartBadgeFromAPI && window.updateCartBadgeFromAPI();
    }catch(e){
      toast("저장할 수 없습니다.");
    }
  }

  function pickOption(detail){
    return new Promise((resolve)=>{
      const overlay = document.querySelector("[data-modal-overlay]");
      const dialog = document.querySelector("[data-modal-dialog]");
      if(!overlay||!dialog) return resolve(null);

      overlay.setAttribute("aria-hidden","false");
      overlay.style.display="flex";

      const opts = detail.options || [];
      dialog.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-weight:900;font-size:18px">옵션 선택</div>
          <button type="button" data-close style="border:0;background:transparent;font-size:18px;font-weight:900">×</button>
        </div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:10px">${escapeHtml(detail.name||"")}</div>
        <select data-sel style="width:100%;height:40px;border:1px solid #E5E7EB;border-radius:8px;padding:0 12px">
          ${opts.map(o=>`<option value="${escapeAttr(o.optionId)}">${escapeHtml(o.label)} (재고 ${o.stock})</option>`).join("")}
        </select>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button type="button" class="btn" data-close style="flex:1;height:40px">취소</button>
          <button type="button" class="btn primary" data-ok style="flex:1;height:40px">담기</button>
        </div>
      `;

      const close=(v)=>{
        overlay.setAttribute("aria-hidden","true");
        overlay.style.display="none";
        dialog.innerHTML="";
        resolve(v||null);
      };

      dialog.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click", ()=>close(null)));
      overlay.addEventListener("click",(ev)=>{ if(ev.target===overlay) close(null); }, {once:true});
      dialog.querySelector("[data-ok]").addEventListener("click", ()=>{
        const id = dialog.querySelector("[data-sel]").value;
        const opt = opts.find(o=>String(o.optionId)===String(id));
        close(opt||null);
      });
    });
  }

  document.addEventListener("click",(e)=>{
    const t=e.target;
    if(!t) return;
    if(t.matches("[data-retry]")){ load(); return; }
    if(t.matches("[data-sort]")) return;
    if(t.matches("[data-clear]")){ clearAll(); window.scrollTo({top:0,behavior:"smooth"}); return; }
    if(t.matches("[data-unlike]")){ unlike(t.getAttribute("data-unlike")); return; }
    if(t.matches("[data-remove]")){ unlike(t.getAttribute("data-remove")); return; }
    if(t.matches("[data-add]")){ addToCart(t.getAttribute("data-add")); return; }
  });

  document.addEventListener("change",(e)=>{
    const t=e.target;
    if(t && t.matches("[data-sort]")){
      sort = t.value;
      render();
      window.scrollTo({top:0, behavior:"smooth"});
    }
  });

  load();
})();
