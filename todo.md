# 마이스타크래프트 TODO

## DB 스키마
- [x] players 테이블 (선수 정보: userId, name, race, photoUrl, level, exp, statPoints, fatigue)
- [x] player_stats 테이블 (능력치 8개: sense, control, attack, harass, strategy, supply, defense, scout)
- [x] items 테이블 (아이템 목록: name, description, price, statBoosts, fatigueRecover)
- [x] player_items 테이블 (선수-아이템 관계: playerId, itemId, equipped)
- [x] DB 마이그레이션 실행

## 백엔드 API
- [x] player.create (선수 생성)
- [x] player.get (선수 조회)
- [x] player.updatePhoto (사진 업로드)
- [x] player.allocateStat (능력치 포인트 배분)
- [x] player.addExp (경험치 획득 및 레벨업)
- [x] shop.listItems (아이템 목록)
- [x] shop.buyItem (아이템 구매)
- [x] shop.equipItem (아이템 착용/해제)
- [x] shop.getPlayerItems (선수 보유 아이템)
- [x] 피로도 관련 함수 (recoverFatigueIfNeeded, addFatigueCost, updateFatigue)

## 프론트엔드 UI
- [x] 전역 스타일 (다크 테마, 스타크래프트 세계관 색상)
- [x] GameLayout (사이드바 네비게이션)
- [x] 로그인 유도 랜딩 페이지
- [x] 선수 생성 페이지 (사진 업로드, 이름, 종족 선택)
- [x] 선수 프로필 페이지 (사진, 이름, 종족, 등급, 레벨)
- [x] 능력치 바 시각화 컴포넌트
- [x] 능력치 레이더 차트 (8각형 다각형 시각화)
- [x] 레벨업 포인트 배분 UI
- [x] 등급 표시 컴포넌트 (F~SSS)
- [x] 피로도 바 및 패널티 표시
- [x] 아이템 상점 페이지
- [x] 아이템 착용/해제 UI
- [x] 미생성 시 선수 생성 페이지 자동 이동

## 능력치 시스템
- [x] 기본값 500, 최대 1200
- [x] 레벨업 시 포인트 20 지급
- [x] 능력치별 배분 가능
- [x] 등급 시스템 (F~SSS, 4000점 기준, 600점 간격)
- [x] 아이템 착용 시 능력치 실시간 반영

## 피로도 시스템
- [x] 최대 100, 최소 0
- [x] 매일 자정 회복 (100으로 회복)
- [x] 능력치 패널티 (90~100: 0%, 80~89: 5%, 70~79: 10% ... 0~9: 50%)
- [x] 아이템으로 피로도 회복 (피로도 음료 20, 초단 에너지 드링크 40, 능력중심 중처 60)
- [x] 프로필 페이지에 피로도 시각화

## 테스트
- [x] 게임 로직 테스트 (등급, 능력치 계산) - 25개 통과
- [x] 플레이어 라우터 테스트 - 8개 통과
- [x] 피로도 시스템 테스트 - 9개 통과
- [x] auth.logout 테스트 - 1개 통과
- [x] 전체 43개 테스트 통과

## 다음 단계 (구현 예정)
- [ ] 선수 간 대전 시스템 (1:1 경기, 능력치 기반 승패)
- [ ] 리더보드 페이지 (전체 선수 랭킹)
- [ ] 선수 프로필 편집 (이름, 사진 수정)
- [ ] 경기 결과에 따른 자동 능력치 변화
- [ ] 이벤트 시스템 (피로도 회복 이벤트)


## 관리자 시스템 (신규)
- [x] users 테이블 role 필드 확인 (admin/user)
- [x] 관리자 페이지 라우터 (사용자 목록, 수정, 삭제)
- [x] 사용자 정보 수정 API (돈, 레벨, 능력치, 피로도 초기화)
- [x] 관리자 페이지 UI 구현
- [x] 관리자 권한 확인 미들웨어

## 이벤트 시스템 (신규)
- [x] events 테이블 생성 (type, startTime, endTime, isActive)
- [x] 이벤트 생성/수정/삭제 API
- [x] 이벤트 목록 조회 API
- [x] 이벤트 페이지 UI 구현
- [x] 활성 이벤트 프로필 페이지에 표시

## 버그 수정
- [x] 레이더 차트 레이블 표시 수정 (능력치명 정상 표시, 배경 추가)
