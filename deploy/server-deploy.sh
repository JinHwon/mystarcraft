#!/bin/bash
# ========================================
#  마이스타크래프트 오라클 서버 업데이트 배포 스크립트
#  (Demo_Trading 의 server-deploy.sh 와 같은 흐름)
#
#  사용법 (서버에서): cd ~/mystarcraft && bash deploy/server-deploy.sh [브랜치]
# ========================================
set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
BRANCH="${1:-main}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
set -a; . ./.env; set +a
PORT="${PORT:-3100}"

echo "========================================"
echo "   마이스타크래프트 오라클 서버 배포 ($BRANCH)"
echo "========================================"

echo -e "\n${BLUE}[1/5]${NC} Git에서 최신 코드 가져오는 중..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo -e "${GREEN}✓ 완료${NC}"

# DB 컨테이너 설정(docker-compose.yml)이 바뀌었으면 반영 (바뀐 게 없으면 그대로 둠, 데이터 볼륨은 유지)
sudo docker compose -f deploy/docker-compose.yml --env-file .env up -d
for i in $(seq 1 60); do
  [ "$(sudo docker inspect -f '{{.State.Health.Status}}' mystarcraft-mysql 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
# 쌓인 바이너리 로그 정리 (로그를 끈 뒤에는 이미 있던 파일이 자동으로 지워지지 않음)
sudo docker exec mystarcraft-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "PURGE BINARY LOGS BEFORE NOW()"' >/dev/null 2>&1 || true

echo -e "\n${BLUE}[2/5]${NC} 의존성 설치 중..."
pnpm install --frozen-lockfile < /dev/null
echo -e "${GREEN}✓ 완료${NC}"

echo -e "\n${BLUE}[3/5]${NC} DB 스키마 반영 중..."
# 데이터 손실이 생기는 변경이면 drizzle-kit 이 확인을 요청합니다 (자동 승인하지 않음)
pnpm db:sync < /dev/null
echo -e "${GREEN}✓ 완료${NC}"

echo -e "\n${BLUE}[4/5]${NC} 빌드 중..."
if [ -n "${PREBUILT_DIST:-}" ] && [ -f "$PREBUILT_DIST" ]; then
  rm -rf dist && tar xzf "$PREBUILT_DIST" && echo "GitHub 에서 빌드된 결과 사용"
else
  pnpm build
fi
echo -e "${GREEN}✓ 완료${NC}"

echo -e "\n${BLUE}[5/5]${NC} 백엔드 재시작 중..."
pm2 restart mystarcraft --update-env
HEALTHY=""
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 2
done
if [ -n "$HEALTHY" ]; then
  echo -e "${GREEN}✓ 헬스체크 통과${NC}"
else
  echo -e "${RED}❌ 헬스체크 실패${NC}"
  pm2 logs mystarcraft --lines 30 --nostream
  exit 1
fi

echo
echo "========================================"
echo -e "${GREEN}✅ 배포 완료!${NC}"
echo "========================================"
pm2 logs mystarcraft --lines 10 --nostream
