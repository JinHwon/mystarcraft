import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

// 자체 로그인 (아이디/비밀번호)
// Manus OAuth 없이 오라클 서버 등에 단독 배포할 때 사용한다.
// 로컬 계정의 openId는 "local_<아이디>" 형식으로 users 테이블에 저장된다.

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 100;
const KEY_LEN = 64;

export const LOCAL_OPENID_PREFIX = "local_";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validate(body: any): { username: string; password: string } | string {
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!USERNAME_RE.test(username)) return "아이디는 영문/숫자/밑줄 3~20자여야 합니다";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자여야 합니다`;
  }
  return { username, password };
}

// 간단한 시도 횟수 제한 (15분 창)
// Vercel 경유 시 req.ip가 Vercel 엣지 IP일 수 있으므로 로그인은 IP+아이디 단위로 제한한다.
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();
function tooManyAttempts(key: string, limit: number): boolean {
  const now = Date.now();
  if (attempts.size > 10000) {
    attempts.forEach((v, k) => { if (v.resetAt < now) attempts.delete(k); });
  }
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

async function issueSession(req: Request, res: Response, openId: string, name: string) {
  const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

export function registerLocalAuthRoutes(app: Express) {
  app.post("/api/auth/local/register", async (req: Request, res: Response) => {
    if (tooManyAttempts(`register|${req.ip}`, 30)) {
      res.status(429).json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요" });
      return;
    }
    const input = validate(req.body);
    if (typeof input === "string") {
      res.status(400).json({ error: input });
      return;
    }
    try {
      const openId = `${LOCAL_OPENID_PREFIX}${input.username.toLowerCase()}`;
      const created = await db.createLocalUser(openId, input.username, await hashPassword(input.password));
      if (!created) {
        res.status(409).json({ error: "이미 사용 중인 아이디입니다" });
        return;
      }
      await issueSession(req, res, openId, input.username);
      res.json({ success: true });
    } catch (error) {
      console.error("[LocalAuth] register failed", error);
      res.status(500).json({ error: "회원가입에 실패했습니다" });
    }
  });

  app.post("/api/auth/local/login", async (req: Request, res: Response) => {
    const rawUsername = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    if (tooManyAttempts(`login|${req.ip}|${rawUsername}`, 10)) {
      res.status(429).json({ error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요" });
      return;
    }
    const input = validate(req.body);
    if (typeof input === "string") {
      res.status(400).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다" });
      return;
    }
    try {
      const openId = `${LOCAL_OPENID_PREFIX}${input.username.toLowerCase()}`;
      const passwordHash = await db.getLocalPasswordHash(openId);
      const user = passwordHash ? await db.getUserByOpenId(openId) : null;
      if (!passwordHash || !user || !(await verifyPassword(input.password, passwordHash))) {
        res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다" });
        return;
      }
      await issueSession(req, res, openId, user.name ?? input.username);
      res.json({ success: true });
    } catch (error) {
      console.error("[LocalAuth] login failed", error);
      res.status(500).json({ error: "로그인에 실패했습니다" });
    }
  });
}
