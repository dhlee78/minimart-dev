(()=> {
  const $ = (s)=>document.querySelector(s);
  const fmtWon = (n)=> (Number(n)||0).toLocaleString("ko-KR")+"원";
  const toast = (m)=> (typeof window.toast==="function"?window.toast(m):alert(m));

  const skel = $("#orders-skeleton");
  const err = $("#orders-error");
  const retry = $("#orders-retry");
  const mount = document.querySelector("[data-orders]");
  const empty = $("#orders-empty");

  let page=1;
  const perPage=10;
  let totalPages=1;
  let items=[];
  let loading=false;

  function showSkeleton(){ if(skel) skel.style.display="block"; if(err) err.style.display="none"; }
  function hideSkeleton(){ if(skel) skel.style.display="none"; }
  function showError(){ if(err) err.style.display="block"; }
  function minDelay(start,ms){ const d=Date.now()-start; const r=Math.max(0,ms-d); return r?new Promise(res=>setTimeout(res,r)):Promise.resolve(); }

  async function apiJson(url, opts, meta){
    const data = await window.apiFetchJson(url, opts, meta); new Error("HTTP "+res.status);
    if(res.status===204) return null;
    return await res.json();
  }

  function badge(status){
    const map = {
      PAID: {t:"결제완료", c:"#2563EB"},
      SHIPPING: {t:"배송중", c:"#6366F1"},
      DELIVERED: {t:"배송완료", c:"#16A34A"},
    };
    const v = map[status] || {t:String(status||""), c:"#4B5563"};
    return `<span style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:${v.c}1A;color:${v.c}">${v.t}</span>`;
  }

  function formatDT(iso){
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return "—";
    const pad=(n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function render(){
    if(!mount) return;

    if(items.length===0){
      mount.innerHTML = `
        <div style="text-align:center;padding:80px 16px">
          <div style="font-size:18px;font-weight:900;margin-bottom:8px">주문 내역이 없습니다.</div>
          <a class="btn primary" href="index.html#products" style="height:40px;display:inline-flex;align-items:center;justify-content:center">상품 보러가기</a>
        </div>
      `;
      return;
    }

    mount.innerHTML = `
      <div style="margin-bottom:16px;font-size:20px;font-weight:900">주문내역</div>
      <div>
        ${items.map(o=>orderCard(o)).join("")}
      </div>
      ${page < totalPages ? `<button type="button" class="btn" data-more style="height:40px;width:100%;border:1px solid #E5E7EB;background:#fff;border-radius:8px;font-weight:800">더보기</button>` : ``}
    `;
  }

  function orderCard(o){
    const first = (o.items||[])[0];
    const extra = (o.items||[]).length>1 ? ` 외 ${(o.items||[]).length-1}개` : "";
    return `
    <div class="card" data-order="${escapeAttr(o.orderId)}" style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;background:#fff;margin-bottom:16px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
        <div>
          <div style="font-size:14px;font-weight:800">주문번호 ${escapeHtml(o.orderId)}</div>
          <div style="font-size:13px;color:#6B7280;margin-top:4px">${formatDT(o.createdAt)}</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          ${badge(o.status)}
          <button type="button" class="link-danger" data-del="${escapeAttr(o.orderId)}" style="font-size:13px">삭제</button>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:12px">
        <div style="font-size:13px;color:#4B5563">${first ? escapeHtml(first.name)+extra : ""}</div>
        <div style="font-weight:950">${fmtWon(o.finalPrice)}</div>
      </div>

      <div data-detail style="max-height:0;overflow:hidden;transition:max-height 200ms ease">
        <div style="margin-top:16px;border-top:1px solid #E5E7EB;padding-top:16px">
          ${(o.items||[]).map(it=>`
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px">
              <img src="${escapeAttr(it.image||"")}" alt="" style="width:64px;height:64px;border-radius:8px;object-fit:cover;background:#F5F6F8" onerror="this.src='https://via.placeholder.com/128?text=No+Image'">
              <div style="flex:1">
                <div style="font-size:14px;font-weight:700">${escapeHtml(it.name||"")}</div>
                ${it.option?`<div style="font-size:13px;color:#4B5563">${escapeHtml(it.option)}</div>`:""}
                <div style="font-size:13px;color:#4B5563">수량 ${it.quantity}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:13px;color:#4B5563">단가 ${fmtWon(it.price)}</div>
                <div style="font-size:14px;font-weight:800">소계 ${fmtWon((it.price||0)*(it.quantity||0))}</div>
              </div>
            </div>
          `).join("")}

          <div style="border-top:1px solid #E5E7EB;padding-top:12px;margin-top:12px">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#4B5563"><div>상품금액</div><div>${fmtWon(o.totalPrice)}</div></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#4B5563;margin-top:6px"><div>배송비</div><div>${fmtWon(o.shippingFee)}</div></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#4B5563;margin-top:6px"><div>할인</div><div>${fmtWon(o.discount)}</div></div>
            <div style="display:flex;justify-content:space-between;margin-top:8px">
              <div style="font-size:13px;color:#4B5563">총 결제금액</div>
              <div style="font-size:18px;font-weight:950">${fmtWon(o.finalPrice)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function escapeHtml(s){ return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }
  function escapeAttr(s){ return escapeHtml(s).replace(/'/g,"&#39;"); }

  async function load(reset=false){
    if(loading) return;
    loading=true;
    const start = Date.now();
    if(reset){
      page=1; items=[]; totalPages=1;
      showSkeleton();
    }
    try{
      const data = await apiJson(`/orders?page=${page}&perPage=${perPage}`, {method:"GET"}, {redirect:"orders"});
      totalPages = data.totalPages || 1;
      const newItems = data.items || [];
      // 최신이 상단: 서버 already returns newest first; but safe sort desc
      newItems.sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      items = reset ? newItems : items.concat(newItems);
      await minDelay(start, 300);
      hideSkeleton();
      render();
      window.scrollTo({top:0, behavior:"smooth"});
    }catch(e){
      await minDelay(start,300);
      hideSkeleton();
      showError();
    }finally{
      loading=false;
    }
  }

  document.addEventListener("click",(e)=>{
    const t=e.target;
    if(!t) return;
    if(t.matches("[data-more]")){
      page = Math.min(totalPages, page+1);
      load(false);
      return;
    }
    if(t.matches("[data-del]")){
      e.stopPropagation();
      const id = t.getAttribute("data-del");
      (async()=>{
        try{
          await apiJson("/orders/"+encodeURIComponent(id), {method:"DELETE"}, {redirect:"orders"});
          items = items.filter(o=>o.orderId!==id);
          toast("주문 내역을 삭제했습니다.");
          render();
        }catch(e){
          toast("저장할 수 없습니다.");
        }
      })();
      return;
    }
    const card = t.closest("[data-order]");
    if(card){
      const detail = card.querySelector("[data-detail]");
      if(!detail) return;
      const isOpen = detail.style.maxHeight && detail.style.maxHeight !== "0px";
      if(isOpen){
        detail.style.maxHeight = "0px";
      }else{
        detail.style.maxHeight = detail.scrollHeight + "px";
      }
    }
  });

  if(retry) retry.addEventListener("click", ()=> load(true));

  load(true);
})();
