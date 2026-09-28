# 마이스타크래프트 배포 가이드 (오라클 백엔드 + Vercel 프론트엔드)

Demo_Trading 과 같은 구조로 배포합니다.

```
브라우저 ──▶ Vercel (프론트엔드, 정적 파일)
                │  /api/*  rewrite (vercel.json)
                ▼
          오라클 서버 nginx (HTTPS, 백엔드 도메인)
                │  proxy_pass 127.0.0.1:3100
                ▼
          Node 백엔드 (pm2: mystarcraft) ──▶ MySQL 8 (docker, 127.0.0.1:3307)
```

- 브라우저 입장에서는 API 가 Vercel 도메인과 같은 출처(`/api/...`)라서 로그인 쿠키가 그대로 동작합니다.
- Demo_Trading 백엔드(3000 포트)와 겹치지 않게 **3100 포트**, 별도 nginx server 블록, 별도 MySQL 컨테이너를 사용합니다.
- Manus 밖에서는 Manus OAuth 를 쓸 수 없으므로 **아이디/비밀번호 로그인(`/login`)** 과 **로컬 디스크 사진 저장**을 기본으로 사용합니다.

---

## 0. 준비물

| 항목 | 설명 |
|---|---|
| 백엔드 도메인 | 오라클 서버 공인 IP 를 가리키는 도메인 (예: DuckDNS 에서 `mystarcraft.duckdns.org` 새로 생성). Demo_Trading 의 `motrade.duckdns.org` 와는 **다른 도메인**이어야 합니다. |
| 오라클 방화벽 | 보안 목록(Security List)에서 80, 443 인바운드 허용 (Demo_Trading 용으로 이미 열려 있으면 그대로 사용) |
| Vercel 계정 | GitHub `JinHwon/mystarcraft` 저장소 연결 |

## 1. 오라클 서버 — 최초 1회

```bash
ssh -i <키파일> ubuntu@<서버IP>

git clone https://github.com/JinHwon/mystarcraft.git ~/mystarcraft
cd ~/mystarcraft
cp .env.example .env
nano .env
```

`.env` 필수 값:

```bash
PORT=3100
DOMAIN=mystarcraft.duckdns.org            # 1단계에서 만든 백엔드 도메인
JWT_SECRET=<openssl rand -hex 32 결과>
OWNER_OPEN_ID=local_admin                 # 'admin' 아이디로 가입하면 관리자
MYSQL_PASSWORD=<임의 비밀번호>
MYSQL_ROOT_PASSWORD=<임의 비밀번호>
DATABASE_URL=mysql://mystarcraft:<MYSQL_PASSWORD>@127.0.0.1:3307/mystarcraft
```

> 비밀번호에는 `$`, 공백, 따옴표를 쓰지 마세요 (스크립트가 .env 를 셸로 읽습니다).

설치 실행:

```bash
bash deploy/server-setup.sh
```

스크립트가 하는 일: Node 22 / pnpm / pm2 / Docker / nginx / certbot 확인·설치 → MySQL 컨테이너 기동 → `pnpm db:sync` 로 테이블 생성 → 빌드 → pm2 로 `mystarcraft` 실행 → nginx server 블록 추가 → Let's Encrypt 인증서 발급.

확인:

```bash
curl https://<백엔드 도메인>/api/health     # {"ok":true}
pm2 logs mystarcraft
```

> 백엔드 도메인으로 직접 접속해도 게임이 열립니다 (백엔드가 빌드된 프론트엔드도 함께 서빙).

## 2. Vercel — 프론트엔드

1. `vercel.json` 의 `YOUR-BACKEND-DOMAIN` 을 실제 백엔드 도메인으로 바꾸고 커밋/푸시
2. Vercel → **Add New Project** → `JinHwon/mystarcraft` 선택
3. 설정은 `vercel.json` 이 지정하므로 그대로 둡니다
   - Install: `pnpm install --frozen-lockfile`
   - Build: `pnpm build:client`
   - Output: `dist/public`
4. 환경 변수는 필요 없습니다 (`VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` 를 비워두면 `/login` 사용)
5. Deploy → `https://<프로젝트>.vercel.app` 접속 → **지금 시작하기** → 회원가입

## 3. 업데이트 배포 (이후 매번)

```bash
# 로컬: main 에 푸시하면 Vercel 은 자동 재배포
git push origin main

# 오라클 서버
ssh ubuntu@<서버IP>
cd ~/mystarcraft && bash deploy/server-deploy.sh
```

`server-deploy.sh` : git pull → pnpm install → `pnpm db:sync` (스키마 변경 반영, 데이터 손실 변경은 확인 요청) → 빌드 → `pm2 restart mystarcraft` → 헬스체크.

## 참고

- **DB 백업**: `sudo docker exec mystarcraft-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" mystarcraft' > backup.sql`
- **사진 파일**: `uploads/` (또는 `UPLOAD_DIR`) 에 저장되며 `/api/uploads/...` 로 서빙됩니다. 백업 대상에 포함하세요.
- **Manus 데이터**: 새 서버는 빈 DB 로 시작합니다. Manus 에 있던 기존 선수 데이터를 옮기려면 Manus DB 덤프가 필요하고, 기존 Manus 로그인 계정은 아이디/비밀번호 계정과 연결 작업이 추가로 필요합니다.
- **로컬 개발**: `cd deploy && docker compose --env-file ../.env up -d` 로 MySQL 을 띄운 뒤 `pnpm db:sync && pnpm dev`.
