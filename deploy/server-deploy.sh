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

echo -e "\n${BLUE}[2/5]${NC} 의존성 설치 중..."
pnpm install --frozen-lockfile
echo -e "${GREEN}✓ 완료${NC}"

echo -e "\n${BLUE}[3/5]${NC} DB 스키마 반영 중..."
# 데이터 손실이 생기는 변경이면 drizzle-kit 이 확인을 요청합니다 (자동 승인하지 않음)
pnpm db:sync
echo -e "${GREEN}✓ 완료${NC}"

echo -e "\n${BLUE}[4/5]${NC} 빌드 중..."
pnpm build
echo -e "${GREEN}✓ 완료${NC}"

echo -e "\n${BLUE}[5/5]${NC} 백엔드 재시작 중..."
pm2 restart mystarcraft --update-env
sleep 3
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
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
