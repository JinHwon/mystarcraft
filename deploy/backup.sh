#!/bin/bash
# ========================================
#  DB 백업: mysqldump → gzip, 7일 보관 (매일 새벽 cron 으로 실행, 배포 때 자동 등록)
#  디스크가 90% 이상이면 건너뜀 (백업이 디스크를 더 채워 서비스가 멈추는 것을 막음)
#  복원: gunzip -c 백업파일.sql.gz | sudo docker exec -i mystarcraft-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" mystarcraft'
# ========================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
mkdir -p "$BACKUP_DIR"

usage="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [ "$usage" -ge 90 ]; then
  echo "$(date -u +%F\ %T) 디스크 ${usage}% — 백업을 건너뜁니다"
  exit 1
fi

out="$BACKUP_DIR/mystarcraft-$(date -u +%Y%m%d-%H%M).sql.gz"
sudo docker exec mystarcraft-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --no-tablespaces --default-character-set=utf8mb4 "${MYSQL_DATABASE:-mystarcraft}"' | gzip -c > "$out.tmp"
if [ -s "$out.tmp" ]; then
  mv "$out.tmp" "$out"
  echo "$(date -u +%F\ %T) 백업 완료: $out ($(du -h "$out" | cut -f1))"
else
  rm -f "$out.tmp"
  echo "$(date -u +%F\ %T) 백업 실패 (빈 파일)"
  exit 1
fi
find "$BACKUP_DIR" -name 'mystarcraft-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
