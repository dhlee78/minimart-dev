// core/state.js
// URL query state parser/serializer for MiniMarket HOME (spec)

export const DEFAULT_STATE = {
  category: "all",
  search: "",
  sort: "reco",
  page: 1,
  min: "",
  max: "",
  rating: 0,
  shipping: "all",
  freeShipping: false,
  inStock: false,
  view: "grid",
};

export function clampNumber(v, min, max, fallback=min){
  const n = Number(v);
  if(Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseQuery(searchStr = window.location.search){
  const p = new URLSearchParams(searchStr);
  const s = { ...DEFAULT_STATE };

  if(p.has("category")) s.category = p.get("category") || "all";
  if(p.has("search")) s.search = p.get("search") || "";
  if(p.has("sort")) s.sort = p.get("sort") || "reco";
  if(p.has("page")) s.page = clampNumber(p.get("page"), 1, 9999, 1);
  if(p.has("min")) s.min = p.get("min") || "";
  if(p.has("max")) s.max = p.get("max") || "";
  if(p.has("rating")) s.rating = clampNumber(p.get("rating"), 0, 5, 0);
  if(p.has("shipping")) s.shipping = p.get("shipping") || "all";
  if(p.has("freeShipping")) s.freeShipping = (p.get("freeShipping")==="1" || p.get("freeShipping")==="true");
  if(p.has("inStock")) s.inStock = (p.get("inStock")==="1" || p.get("inStock")==="true");
  if(p.has("view")) s.view = (p.get("view")==="list" ? "list" : "grid");

  return s;
}

export function toQuery(state){
  const s = { ...DEFAULT_STATE, ...(state||{}) };
  const p = new URLSearchParams();
  if(s.category && s.category!=="all") p.set("category", s.category);
  if(s.search && String(s.search).trim()) p.set("search", String(s.search).trim());
  if(s.sort && s.sort!=="reco") p.set("sort", s.sort);
  if(s.page && Number(s.page)!==1) p.set("page", String(s.page));
  if(s.view && s.view!=="grid") p.set("view", s.view);
  if(s.min) p.set("min", String(s.min));
  if(s.max) p.set("max", String(s.max));
  if(Number(s.rating) && Number(s.rating)!==0) p.set("rating", String(s.rating));
  if(s.shipping && s.shipping!=="all") p.set("shipping", s.shipping);
  if(s.freeShipping) p.set("freeShipping", "1");
  if(s.inStock) p.set("inStock", "1");
  const qs = p.toString();
  return qs ? ("?"+qs) : "";
}
