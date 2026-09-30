/**
 * 로그인 세션: HS256 JWT 를 httpOnly 쿠키(COOKIE_NAME)에 담는다.
 * 계정은 users 테이블의 openId("local_<아이디>")로 찾는다.
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = { openId: string; name: string };

/** lastSignedIn 을 다시 기록하기까지의 간격 (요청마다 DB 에 쓰지 않도록) */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

const secretKey = () => new TextEncoder().encode(ENV.cookieSecret);

export async function createSessionToken(openId: string, name: string, expiresInMs = ONE_YEAR_MS): Promise<string> {
  const exp = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || openId.length === 0) return null;
    return { openId, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request): Promise<User> {
  const cookies = req.headers.cookie ? parseCookieHeader(req.headers.cookie) : {};
  const session = await verifySession(cookies[COOKIE_NAME]);
  if (!session) throw ForbiddenError("Invalid session cookie");

  const user = await db.getUserByOpenId(session.openId);
  if (!user) throw ForbiddenError("User not found");

  const last = user.lastSignedIn ? new Date(user.lastSignedIn).getTime() : 0;
  if (Date.now() - last > TOUCH_INTERVAL_MS) {
    // 실패해도 요청은 계속 처리
    db.touchLastSignedIn(user.id).catch(err => console.warn("[Auth] lastSignedIn 갱신 실패", err));
  }
  return user;
}
