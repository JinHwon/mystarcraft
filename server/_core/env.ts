export const ENV = {
  /** 세션(JWT) 서명 키 */
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // 관리자로 지정할 로컬 로그인 아이디 목록 (쉼표 구분). 서버 시작/가입 시 admin 권한 부여
  adminUsernames: (process.env.ADMIN_USERNAMES ?? "").split(",").map(s => s.trim()).filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
};

/** 세션 서명 키 최소 길이 */
export const JWT_SECRET_MIN_LENGTH = 32;

/**
 * 서버 시작 전 필수 설정 확인.
 * 운영 환경에서 JWT_SECRET 이 없거나 짧으면 누구나 세션을 위조할 수 있으므로 시작하지 않는다.
 */
export function assertServerEnv() {
  if (ENV.cookieSecret.length < JWT_SECRET_MIN_LENGTH) {
    const msg = `JWT_SECRET 은 ${JWT_SECRET_MIN_LENGTH}자 이상이어야 합니다 (현재 ${ENV.cookieSecret.length}자)`;
    if (ENV.isProduction) throw new Error(msg);
    console.warn(`[Env] ${msg} — 개발 환경이라 계속 진행합니다`);
  }
  if (!ENV.databaseUrl) console.warn("[Env] DATABASE_URL 이 없어 DB 기능이 동작하지 않습니다");
}
