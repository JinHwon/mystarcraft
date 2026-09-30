import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerLocalAuthRoutes } from "./localAuth";
import { promoteConfiguredAdmins } from "../db";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { assertServerEnv } from "./env";
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
  assertServerEnv();

  const app = express();
  // 응답 압축 (커리어 세이브 JSON 이 커서 모바일에서 체감 속도에 큰 차이)
  app.use(compression());
  // Trust first proxy so req.protocol / x-forwarded-proto work behind reverse proxies
  app.set("trust proxy", 1);
  const server = createServer(app);
  // 요청 본문은 로그인·커리어 명령 같은 작은 JSON 뿐
  app.use(express.json({ limit: "1mb" }));
  // 아이디/비밀번호 로그인
  registerLocalAuthRoutes(app);
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

  // ADMIN_USERNAMES 에 지정된 계정을 관리자로 승격
  promoteConfiguredAdmins()
    .then(count => { if (count > 0) console.log(`[Admin] 관리자 권한 부여 ${count}건`); })
    .catch(error => console.error("[Admin] 관리자 권한 부여 실패", error));
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
