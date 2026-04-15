import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function parseState(stateStr: string): { redirectUri: string; provider: string } {
  try {
    const decoded = Buffer.from(stateStr, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return {
      redirectUri: parsed.redirectUri || '/',
      provider: parsed.provider || 'manus',
    };
  } catch (e) {
    // 기존 형식 호환성 유지
    return {
      redirectUri: Buffer.from(stateStr, 'base64').toString('utf-8'),
      provider: 'manus',
    };
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const provider = getQueryParam(req, "provider") || "manus";

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const stateData = parseState(state);
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // 제공자별 로그인 방식 결정
      const loginMethod = provider || userInfo.loginMethod || userInfo.platform || "manus";

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: loginMethod,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // 원래 리다이렉트 URI로 이동
      const redirectUri = stateData.redirectUri || "/";
      res.redirect(302, redirectUri);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
