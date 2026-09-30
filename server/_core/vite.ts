import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // 빌드 산출물(파일 이름에 해시)은 영구 캐시
  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "365d", fallthrough: false }));
  // 원작 이미지(선수 사진·맵·아이템·로고)는 한 달 캐시 → 화면마다 서버에 다시 묻지 않음. 없는 파일은 바로 404
  app.use("/legacy", express.static(path.join(distPath, "legacy"), { maxAge: "30d", fallthrough: false }));
  app.use(express.static(distPath, {
    maxAge: "1d",
    // 화면(html)·서비스 워커·매니페스트는 배포 뒤 바로 바뀌어야 하므로 캐시하지 않음
    setHeaders: (res, file) => {
      if (/\.(html|webmanifest)$|sw\.js$/.test(file)) res.setHeader("Cache-Control", "no-cache");
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
