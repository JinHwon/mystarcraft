---
inclusion: auto
---

# 질문과 답변 기록

모든 질문과 답변을 정리하여 기록한다. 이후 답변 시 참고 자료로 활용한다.

---

## Q1. 스티어링 및 체크리스트 설정 요청

**질문 요약:**
- 매 질문/답변 완료 시 체크리스트에 데이터를 append 해줄 것
- 한국어 응답 스티어링을 추가하고 항상 한국어로 응답할 것
- 모든 질문과 답변을 정리해서 steering으로 추가할 것
- 체크리스트는 1개로만 관리할 것
- 매번 질문에 대해 체크리스트를 참고하여 답변할 것

**답변 요약:**
- `.kiro/steering/korean-response.md` — 한국어 응답 규칙 스티어링 생성
- `.kiro/steering/qa-checklist.md` — 질문/답변 체크리스트 생성 (단일 파일 관리)
- `.kiro/steering/qa-log.md` — 질문과 답변 기록 스티어링 생성

---

## Q2. Checkpoint 참고 규칙 추가 요청

**질문 요약:**
- 작업한 내역들이 checkpoint로 저장되어 있으니 항상 참고해달라는 요청

**답변 요약:**
- `korean-response.md` 스티어링에 checkpoint 참고 규칙 추가
- 앞으로 답변 시 대화 히스토리의 checkpoint 내역을 항상 참고하여 맥락 유지

---

## Q3. Git checkpoint 참고 요청

**질문 요약:**
- 연결된 Git에 저장된 checkpoint도 항상 참고해달라는 요청

**답변 요약:**
- Git 커밋 히스토리 확인 (v1.0 ~ v15.0, 총 30개 커밋)
- `korean-response.md`에 Git checkpoint 참고 규칙 추가
- 현재 최신: v15.0 (게임 결과 및 프로필 시스템 개선)

---

## Q4. 게임 진행 중 버그 3건 수정 요청

**질문 요약:**
1. 플레이어1에 대한 해설이 없고, 플레이어1 내용도 플레이어2로 해설됨
2. 플레이어2 종족이 게임 진행 중 무조건 프로토스로 인식됨
3. 패배 시 능력치가 무조건 -5씩 감소 (랜덤이어야 함)

**답변 요약:**
- **버그1 수정**: `dynamicGameEngine.ts`에서 `progressGame`의 `winner`를 `1/2` 대신 실제 player ID로 설정. `gameSimulation.ts`에서 `initializeGameState`에 능력치 전달 추가.
- **버그2 수정**: `dynamicGameEngine.ts`의 `generatePlayerAction`에서 종족별 빌드 전략 매핑 함수 `getRaceBuildStrategies` 추가. 테란→barracks_first/cc_first, 프로토스→gateway_first, 저그→hatch_first.
- **버그3 수정**: `statDynamicSystem.ts`의 `calculateStatChanges`에서 패배 시 고정 -5를 랜덤 -1~-8로 변경. 승리 보너스도 고정 +10에서 랜덤 +8~+12로 변경.
- 모든 47개 테스트 통과 확인.
