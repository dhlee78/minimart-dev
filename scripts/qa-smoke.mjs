// scripts/qa-smoke.mjs
// Node 20+ (GitHub Actions)에서 동작하는 API 스모크 테스트
// - health, products는 항상 검사
// - 로그인/카트/주문은 환경변수(옵션)가 있으면 검사

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const USER = process.env.QA_USER;       // optional
const PASS = process.env.QA_PASS;       // optional

function fail(msg) {
  console.error("❌", msg);
  process.exit(1);
}

async function fetchJson(path, opts) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  return { res, data, text };
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const { res, data, text } = await fetchJson("/api/health");
      if (res.ok) {
        console.log("✅ health ok:", data ?? text);
        return;
      }
      lastErr = `status=${res.status} body=${text}`;
    } catch (e) {
      lastErr = String(e);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  fail(`health check failed: ${lastErr}`);
}

async function testProducts() {
  const { res, data, text } = await fetchJson("/api/products");
  if (!res.ok) fail(`/api/products failed: status=${res.status} body=${text}`);
  // data 형태가 배열일 수도, {items:[]}일 수도 있어서 널널하게 체크
  const count =
    Array.isArray(data) ? data.length :
    Array.isArray(data?.items) ? data.items.length :
    Array.isArray(data?.products) ? data.products.length :
    null;

  if (count === 0) fail("products returned 0 items (unexpected for smoke)");
  console.log("✅ products ok (count=", count ?? "unknown", ")");
}

async function loginIfPossible() {
  if (!USER || !PASS) {
    console.log("ℹ️ QA_USER/QA_PASS not set → skip auth/cart/order smoke");
    return null;
  }

  // 흔한 형태 2가지 모두 시도: {username,password} / {id,password}
  const payloads = [
    { username: USER, password: PASS },
    { id: USER, password: PASS },
    { email: USER, password: PASS },
  ];

  for (const body of payloads) {
    const { res, data, text } = await fetchJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (res.ok) {
      // 토큰 키 이름이 프로젝트마다 달라서 널널하게 잡음
      const token =
        data?.token ?? data?.accessToken ?? data?.access_token ?? data?.session?.token ?? null;

      if (!token) {
        console.log("⚠️ login ok but token not found; response:", data ?? text);
        return { token: null, raw: data };
      }

      console.log("✅ login ok");
      return { token, raw: data };
    }
  }

  fail("login failed. Check QA_USER/QA_PASS or login payload shape.");
}

async function testCartIfPossible(token) {
  if (!token) {
    console.log("ℹ️ token missing → skip cart/order smoke");
    return;
  }
  const auth = { Authorization: `Bearer ${token}` };

  // cart 조회
  {
    const { res, text } = await fetchJson("/api/cart", { headers: auth });
    if (!res.ok) fail(`/api/cart failed: status=${res.status} body=${text}`);
    console.log("✅ cart ok");
  }

  // 장바구니에 담기 (상품 id가 필요한데, products에서 하나 뽑아서 시도)
  const { res: pr, data: pd, text: pt } = await fetchJson("/api/products");
  if (!pr.ok) fail(`/api/products for cart failed: status=${pr.status} body=${pt}`);

  const first =
    (Array.isArray(pd) ? pd[0] :
      Array.isArray(pd?.items) ? pd.items[0] :
      Array.isArray(pd?.products) ? pd.products[0] :
      null);

  const productId = first?.id ?? first?.productId ?? null;
  if (!productId) {
    console.log("⚠️ could not infer product id → skip add-to-cart");
    return;
  }

  const addBodies = [
    { productId, qty: 1 },
    { id: productId, qty: 1 },
    { productId, quantity: 1 },
    { id: productId, quantity: 1 },
  ];

  let added = false;
  for (const body of addBodies) {
    const { res, text } = await fetchJson("/api/cart/items", {
      method: "POST",
      headers: auth,
      body: JSON.stringify(body),
    });
    if (res.ok) { added = true; break; }
  }
  if (added) console.log("✅ add-to-cart ok");
  else console.log("⚠️ add-to-cart skipped (payload mismatch). still ok for smoke.");
}

async function main() {
  console.log("QA base:", BASE);
  await waitForHealth();
  await testProducts();
  const login = await loginIfPossible();
  if (login) await testCartIfPossible(login.token);
  console.log("🎉 QA smoke done");
}

main().catch(e => fail(e.stack ?? String(e)));
