import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "./localAuth";
import { LOCAL_UPLOAD_DIR } from "../storage";
import { repairUninitializedPlayerStats, promoteConfiguredAdmins, seedMapsIfEmpty } from "../db";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  // 응답 압축 (커리어 세이브 JSON 이 커서 모바일에서 체감 속도에 큰 차이)
  app.use(compression());
  // Trust first proxy so req.protocol / x-forwarded-proto work behind reverse proxies
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // 아이디/비밀번호 로그인 (Manus 외 단독 배포용)
  registerLocalAuthRoutes(app);
  // 로컬 디스크에 저장된 업로드 파일 (BUILT_IN_FORGE_API 미설정 시)
  app.use(
    "/api/uploads",
    express.static(LOCAL_UPLOAD_DIR, {
      fallthrough: false,
      setHeaders: res => res.setHeader("X-Content-Type-Options", "nosniff"),
    })
  );
  // 헬스체크 (배포 스크립트/모니터링용)
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  // 운영 환경에서는 nginx가 고정 포트로 프록시하므로 포트를 바꾸지 않는다
  const port = process.env.NODE_ENV === "production"
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // 0으로 생성됐던 선수 능력치를 기본값 500 기준으로 보정
  repairUninitializedPlayerStats()
    .then(count => { if (count > 0) console.log(`[Stats] 초기화 누락 선수 능력치 ${count}건 보정`); })
    .catch(error => console.error("[Stats] 능력치 보정 실패", error));

  // 실제 프로 리그 맵 목록 동기화 (추가/수치 갱신)
  seedMapsIfEmpty().catch(error => console.error("[Maps] 맵 동기화 실패", error));

  // ADMIN_USERNAMES 에 지정된 계정을 관리자로 승격
  promoteConfiguredAdmins()
    .then(count => { if (count > 0) console.log(`[Admin] 관리자 권한 부여 ${count}건`); })
    .catch(error => console.error("[Admin] 관리자 권한 부여 실패", error));
}

startServer().catch(console.error);
