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

---

## Q5. 버그 1, 2 재수정 요청 (이전 수정이 반영 안 됨)

**질문 요약:**
1. 여전히 플레이어1 해설이 누락되고, 플레이어1 행동도 플레이어2로 표기됨
2. 플레이어2 종족이 분명 테란인데 게임 진행 중 프로토스로 인식됨
3. 능력치 랜덤 변동은 확인됨 (해결 완료)

**답변 요약 (근본 원인 재분석):**
- **버그1 근본 원인**: 프론트엔드 해설 분류 로직에서 양쪽 이름이 모두 포함된 해설을 "중립"으로 분류. 또한 게임 종료 해설에서 `gameState.winner === 1` 비교가 player ID와 불일치.
  - **수정**: `Practice.tsx`에서 해설의 첫 번째 등장 이름을 기준으로 주체 판단하도록 로직 개선. `dynamicGameEngine.ts`에서 게임 종료 해설의 winner 비교를 `gameState.player1.id`로 수정.
- **버그2 근본 원인**: `db.ts`의 `findOpponentByDifficulty` 함수에서 상대의 실제 종족을 **랜덤으로 덮어씌우고** 있었음. 이 때문에 상대 종족이 매번 랜덤으로 바뀌어 프로토스로 나올 확률이 1/3.
  - **수정**: `findOpponentByDifficulty`에서 랜덤 종족 덮어씌우기 코드 제거, 상대의 실제 DB 종족을 그대로 반환하도록 수정.
- 모든 47개 테스트 통과 확인.

---

## Q6. 연습게임 후 미배분 포인트가 다시 생기는 버그

**질문 요약:**
- 포인트를 전부 능력치에 배분했는데, 연습게임 후 미배분 포인트가 다시 나타남

**답변 요약:**
- **근본 원인**: `routers.ts`의 `playGame`에서 게임 결과 능력치 변동 시 `allocateStat(playerId, key, value, currentPoints)` 호출. 4번째 파라미터에 **능력치 현재 값**(예: 500)을 전달했는데, `allocateStat` 내부에서 `statPoints = currentStatPoints - actualPoints`로 업데이트하여 `500 - 10 = 490`처럼 미배분 포인트가 대량 생성됨.
- **수정**: `db.ts`에 `applyGameStatChange` 함수 신규 추가 (미배분 포인트 차감 없이 능력치만 직접 변경). `routers.ts`의 `playGame`에서 `allocateStat` 대신 `applyGameStatChange` 사용.

---

## Q7. 게임 진행 중 병력/자원 시각적 변화 + 전투 시스템 개선

**질문 요약:**
- 병력/자원이 매 턴마다 변화하면서 시각적으로 보여야 함
- 멀티 확장 → 자원 증가율 상승, 견제 → 자원 감소
- 전투 시 양쪽 병력 감소, 병력 적은 쪽이 더 큰 피해
- 능력치 높으면 불리한 전투도 이길 수 있음
- 70% 유리 → 우위, 80% 이상 → 게임 종료
- 증가 수치 줄이기

**답변 요약:**
- **백엔드 (`dynamicGameEngine.ts` v16.0 전면 재작성)**:
  - `turnCommentaries`: 매 턴 해설 초기화 (누적 → 턴별)
  - `resolveEngagement`: 전투 시 양쪽 병력/자원 감소, 병력 적은 쪽 더 큰 피해 (패자 30~50%, 승자 15~25%), 능력치 보정으로 불리한 전투도 승리 가능
  - 자원 증가: 기본 10~15/턴 * 멀티 수 (±20% 랜덤 변동)
  - 병력 증가: 2.5/생산기지 (±15% 랜덤 변동)
  - 종료 조건: 80% 이상 유리 시 게임 종료
  - 초기 생산기지 1개로 시작 (기존 0개)
- **프론트엔드 (`Practice.tsx`)**:
  - `currentTurnIndex` 상태 추가, 턴 단위로 진행하며 매 턴 병력/자원 변화 표시
  - 해설은 각 턴의 `commentaries`를 누적하여 표시
- **`gameSimulation.ts`**: `GameTurn.allCommentaries` → `commentaries`로 변경
