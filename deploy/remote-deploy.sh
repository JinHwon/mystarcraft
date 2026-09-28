#!/bin/bash
# ========================================
#  GitHub Actions 가 SSH 로 오라클 서버에서 실행하는 배포 스크립트
#  - 최초: 저장소 clone → .env 자동 생성(랜덤 비밀번호) → server-setup.sh
#  - 이후: server-deploy.sh (git pull → 빌드 → pm2 재시작)
#  입력 환경 변수: BRANCH (기본 main), DOMAIN (기본 mystarcraft.duckdns.org)
# ========================================
set -euo pipefail

REPO_URL="https://github.com/JinHwon/mystarcraft.git"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-mystarcraft.duckdns.org}"
APP_DIR="$HOME/mystarcraft"

# apt 설치 중 대화형 질문(서비스 재시작 등)으로 멈추지 않도록
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
# 단계별 시각 출력
exec > >(while IFS= read -r line; do printf '[%s] %s\n' "$(date +%H:%M:%S)" "$line"; done) 2>&1

echo "▶ 서버: $(hostname) / 사용자: $(whoami) / 브랜치: $BRANCH / 도메인: $DOMAIN"
echo "▶ 메모리: $(free -m | awk '/Mem:/{print $2"MB 중 "$7"MB 사용 가능"}'), 스왑: $(free -m | awk '/Swap:/{print $2"MB"}'), CPU: $(nproc)코어, $(uname -m)"

# 메모리가 작은 서버(1GB 등)에서 빌드가 멈추지 않도록 스왑 2GB 추가 (없을 때만)
if [ "$(free -m | awk '/Swap:/{print $2}')" -lt 1024 ] && [ ! -f /swapfile ]; then
  echo "▶ 스왑 2GB 생성"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

command -v git >/dev/null || { sudo -E apt-get update -y && sudo -E apt-get install -y git; }
command -v openssl >/dev/null || sudo -E apt-get install -y openssl

if [ ! -d "$APP_DIR/.git" ]; then
  echo "▶ 저장소 clone"
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [ ! -f .env ]; then
  echo "▶ .env 생성 (비밀번호는 서버에서 랜덤 생성, 외부로 출력하지 않음)"
  MYSQL_PW="$(openssl rand -hex 16)"
  cp .env.example .env
  sed -i \
    -e "s#^DOMAIN=.*#DOMAIN=${DOMAIN}#" \
    -e "s#^JWT_SECRET=.*#JWT_SECRET=$(openssl rand -hex 32)#" \
    -e "s#^MYSQL_PASSWORD=.*#MYSQL_PASSWORD=${MYSQL_PW}#" \
    -e "s#^MYSQL_ROOT_PASSWORD=.*#MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)#" \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=mysql://mystarcraft:${MYSQL_PW}@127.0.0.1:3307/mystarcraft#" \
    .env
  chmod 600 .env
fi

# 오라클 Ubuntu 이미지는 iptables 로 80/443 을 막아두는 경우가 있어 허용 규칙 추가 (이미 있으면 건너뜀)
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    echo "▶ iptables: $port 포트 허용"
  fi
done
command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save >/dev/null 2>&1 || true

if command -v pm2 >/dev/null && pm2 describe mystarcraft >/dev/null 2>&1; then
  echo "▶ 업데이트 배포"
  bash deploy/server-deploy.sh "$BRANCH"
  # 최초 설치 때 인증서 발급에 실패했으면 다시 시도
  if ! sudo test -d "/etc/letsencrypt/live/${DOMAIN}"; then
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect \
      || echo "⚠ certbot 실패: ${DOMAIN} 이 이 서버 IP 를 가리키는지 확인하세요"
  fi
else
  echo "▶ 최초 설치"
  bash deploy/server-setup.sh
fi

echo "▶ 서버 공인 IP: $(curl -fsS https://api.ipify.org || echo 확인불가)"
echo "▶ ${DOMAIN} DNS: $(getent hosts "$DOMAIN" | awk '{print $1}' || echo 확인불가)"
