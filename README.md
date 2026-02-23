MiniMarket API+UI v2 (FULL)
==========================

✅ 추가된 기능
- 주문서(Checkout): 주소/결제수단/쿠폰/포인트/메모 입력
- 쿠폰 API: /api/coupons (활성 쿠폰)
- 포인트: checkout에서 사용 + 결제금액 1% 적립
- 관리자 API: /api/admin/*
  - 주문 상태 변경, 취소(재고 복원), 환불(배송완료만)
  - 상품 재고/가격/할인 수정
  - 감사로그(audit) 조회
- OpenAPI(Swagger): openapi.json
- Postman 컬렉션: postman_collection.json
- Seed 스크립트:
  - npm run seed:products -- 200
  - npm run seed:orders -- 30

실행
1) npm install
2) npm run dev
3) http://localhost:3000

계정
- user: test@example.com / password123
- admin: admin@example.com / admin123

QA 포인트(추천)
- 401: 토큰 없음/세션 만료
- 400: 주소 누락, 쿠폰/포인트 검증 실패
- 409: 품절/재고부족, 상태 전이 불가, 환불 조건 불충족