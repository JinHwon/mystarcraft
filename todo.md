# 마이스타크래프트 TODO

## DB 스키마
- [x] players 테이블 (선수 정보: userId, name, race, photoUrl, level, exp, statPoints)
- [x] player_stats 테이블 (능력치 8개: sense, control, attack, harass, strategy, supply, defense, scout)
- [x] items 테이블 (아이템 목록: name, description, price, statBoosts)
- [x] player_items 테이블 (선수-아이템 관계: playerId, itemId, equipped)
- [x] DB 마이그레이션 실행

## 백엔드 API
- [x] player.create (선수 생성)
- [x] player.get (선수 조회)
- [x] player.updatePhoto (사진 업로드)
- [x] player.allocateStat (능력치 포인트 배분)
- [x] shop.listItems (아이템 목록)
- [x] shop.buyItem (아이템 구매)
- [x] shop.equipItem (아이템 착용/해제)
- [x] shop.getPlayerItems (선수 보유 아이템)

## 프론트엔드 UI
- [x] 전역 스타일 (다크 테마, 스타크래프트 세계관 색상)
- [x] DashboardLayout (사이드바 네비게이션)
- [x] 로그인 유도 랜딩 페이지
- [x] 선수 생성 페이지 (사진 업로드, 이름, 종족 선택)
- [x] 선수 프로필 페이지 (사진, 이름, 종족, 등급, 레벨)
- [x] 능력치 바 시각화 컴포넌트
- [x] 레벨업 포인트 배분 UI
- [x] 등급 표시 컴포넌트 (F~SSS)
- [x] 아이템 상점 페이지
- [x] 아이템 착용/해제 UI
- [x] 미생성 시 선수 생성 페이지 자동 이동

## 테스트
- [x] stat 계산 및 등급 산정 로직 테스트 (26개 통과)
- [x] auth.logout 테스트
