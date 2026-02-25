# MiniMarket Fullstack (API + Frontend)

## Run
1) Install server deps
   cd server
   npm install
2) Start
   npm start
3) Open
   http://localhost:4000

The server serves the frontend from /public and exposes API routes at the same origin,
so existing frontend fetch('/products') etc works without CORS changes.

## API Coverage
Implements MiniMarket API Specification v1.0:
- Auth: POST /auth/login, POST /auth/refresh, POST /auth/logout, GET /me
- Products: GET /products, GET /products/:id
- Search: GET /products/autocomplete, GET/POST/DELETE /search/recent
- Cart: GET/POST/PATCH /cart, POST /cart/validate
- Checkout: POST /checkout/quote
- Orders: POST /orders, GET /orders?page&perPage
- Wishlist: GET/POST/DELETE /wishlist
