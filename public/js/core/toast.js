// core/toast.js
let timer = null;
export function showToast(message, { durationMs = 2400, fadeMs = 200 } = {}){
  if(!message) return;
  let el = document.querySelector(".toast");
  if(!el){
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = String(message);
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(()=>{
    el.classList.remove("show");
  }, durationMs);
}
