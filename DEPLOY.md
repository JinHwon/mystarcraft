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
- 로그인은 **아이디/비밀번호(`/login`)** 하나뿐입니다 (Manus OAuth 코드는 제거됨).

---

## 0. 준비물

| 항목 | 설명 |
|---|---|
| 백엔드 도메인 | 오라클 서버 공인 IP 를 가리키는 도메인 (예: DuckDNS 에서 `mystarcraft.duckdns.org` 새로 생성). Demo_Trading 의 `motrade.duckdns.org` 와는 **다른 도메인**이어야 합니다. |
| 오라클 방화벽 | 보안 목록(Security List)에서 80, 443 인바운드 허용 (Demo_Trading 용으로 이미 열려 있으면 그대로 사용) |
| Vercel 계정 | GitHub `JinHwon/mystarcraft` 저장소 연결 |

## 자동 배포 (GitHub Actions) — 권장

`main` 에 푸시하면 `.github/workflows/deploy-oracle.yml` 이 SSH 로 서버에 접속해 `deploy/remote-deploy.sh` 를 실행합니다.
최초 실행 시 clone, `.env` 자동 생성(비밀번호 랜덤), 설치까지 모두 처리하고, 이후에는 업데이트 배포만 합니다.

GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret:

| 이름 | 값 |
|---|---|
| `ORACLE_HOST` | 오라클 서버 공인 IP |
| `ORACLE_SSH_KEY` | 서버 접속용 개인키 파일 내용 전체 (`-----BEGIN` ~ `-----END` 포함) |
| `ORACLE_USER` | (선택) 기본 `ubuntu` |

등록 후 Actions 탭 → **Deploy to Oracle** → Run workflow. 아래 1, 3 단계는 수동으로 할 때만 필요합니다.

## 1. 오라클 서버 — 최초 1회 (수동)

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
JWT_SECRET=<openssl rand -hex 32 결과>    # 32자 이상. 짧으면 운영 서버가 시작되지 않음
ADMIN_USERNAMES=<관리자 아이디>            # 쉼표로 여러 개. 이미 가입한 아이디를 적으세요
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

1. `vercel.json` 의 백엔드 도메인이 `mystarcraft.duckdns.org` 로 설정되어 있는지 확인 (도메인을 바꾸면 여기도 수정)
2. Vercel → **Add New Project** → `JinHwon/mystarcraft` 선택
3. 설정은 `vercel.json` 이 지정하므로 그대로 둡니다
   - Install: `pnpm install --frozen-lockfile`
   - Build: `pnpm build:client`
   - Output: `dist/public`
4. 환경 변수는 필요 없습니다
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
- **쓰는 테이블**: `users`, `local_credentials`, `events`, `careers` (커리어 세이브). 나머지 테이블은 없앤 육성 모드용이라 코드에서 쓰지 않지만, `db:sync` 가 지우지 않도록 스키마에 남겨 두었습니다 (`drizzle/schema.ts` 주석 참고).
- **예전 업로드 사진**: 육성 모드의 선수 사진(`uploads/`)은 더 이상 서빙하지 않습니다. 필요 없으면 서버에서 지워도 됩니다.
- **로컬 개발**: `cd deploy && docker compose --env-file ../.env up -d` 로 MySQL 을 띄운 뒤 `pnpm db:sync && pnpm dev`.
