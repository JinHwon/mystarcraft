#!/bin/bash
# ========================================
#  마이스타크래프트 오라클 서버 최초 설치 스크립트
#  (Ubuntu, Demo_Trading 과 같은 서버에 함께 올리는 것을 기준으로 작성)
#
#  사용법 (서버에서):
#    git clone https://github.com/JinHwon/mystarcraft.git ~/mystarcraft
#    cd ~/mystarcraft
#    cp .env.example .env && nano .env      # DOMAIN, JWT_SECRET, MYSQL_* , DATABASE_URL 입력
#    bash deploy/server-setup.sh
# ========================================
set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "\n${BLUE}[$1]${NC} $2"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
die()  { echo -e "${RED}❌ $1${NC}"; exit 1; }

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

[ -f .env ] || die ".env 파일이 없습니다. cp .env.example .env 후 값을 채워주세요."
set -a; . ./.env; set +a
for v in DOMAIN JWT_SECRET MYSQL_PASSWORD MYSQL_ROOT_PASSWORD DATABASE_URL; do
  [ -n "${!v:-}" ] || die ".env 의 $v 값이 비어 있습니다."
done
PORT="${PORT:-3100}"

step 1/8 "필수 패키지 확인 (Node.js 22, pnpm, pm2, Docker, nginx, certbot)"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
command -v pnpm >/dev/null || sudo npm install -g pnpm@10
command -v pm2  >/dev/null || sudo npm install -g pm2
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
command -v nginx   >/dev/null || sudo apt-get install -y nginx
command -v certbot >/dev/null || sudo apt-get install -y certbot python3-certbot-nginx
ok "node $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v)"

step 2/8 "MySQL 컨테이너 시작"
sudo docker compose -f deploy/docker-compose.yml --env-file .env up -d
echo -n "MySQL 준비 대기"
for i in $(seq 1 60); do
  if sudo docker exec mystarcraft-mysql mysqladmin ping -h 127.0.0.1 --silent 2>/dev/null; then break; fi
  echo -n "."; sleep 2
done
echo; ok "MySQL 실행 중 (127.0.0.1:${MYSQL_PORT:-3307})"

step 3/8 "의존성 설치"
pnpm install --frozen-lockfile
ok "완료"

step 4/8 "DB 테이블 생성 (drizzle-kit push)"
pnpm db:sync
ok "완료"

step 5/8 "빌드"
pnpm build
mkdir -p "${UPLOAD_DIR:-uploads}"
ok "완료"

step 6/8 "PM2 로 백엔드 실행"
if pm2 describe mystarcraft >/dev/null 2>&1; then
  pm2 restart mystarcraft --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save
# 서버 재부팅 시 pm2 자동 시작 (이미 등록돼 있으면 그대로)
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null || true
sleep 3
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || die "헬스체크 실패 - pm2 logs mystarcraft 로 확인하세요"
ok "http://127.0.0.1:${PORT} 에서 실행 중"

step 7/8 "nginx 설정"
sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__PORT__/${PORT}/g" deploy/nginx/mystarcraft.conf \
  | sudo tee /etc/nginx/sites-available/mystarcraft >/dev/null
sudo ln -sf /etc/nginx/sites-available/mystarcraft /etc/nginx/sites-enabled/mystarcraft
sudo nginx -t
sudo systemctl reload nginx
ok "nginx 적용"

step 8/8 "HTTPS 인증서 (Let's Encrypt)"
if sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  ok "https://${DOMAIN} 적용"
else
  echo -e "${RED}⚠ certbot 실패: 도메인이 이 서버 IP를 가리키는지, 80/443 포트가 열려 있는지 확인 후 다시 실행하세요:${NC}"
  echo "  sudo certbot --nginx -d ${DOMAIN}"
fi

echo
echo "========================================"
echo -e "${GREEN}✅ 백엔드 설치 완료${NC}"
echo "  헬스체크: https://${DOMAIN}/api/health"
echo "  로그:     pm2 logs mystarcraft"
echo "  다음 단계: vercel.json 의 백엔드 도메인을 ${DOMAIN} 로 맞추고 Vercel 에 프론트엔드 배포"
echo "========================================"
