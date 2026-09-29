export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  // 관리자로 지정할 로컬 로그인 아이디 목록 (쉼표 구분). 서버 시작/가입 시 admin 권한 부여
  adminUsernames: (process.env.ADMIN_USERNAMES ?? "").split(",").map(s => s.trim()).filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
