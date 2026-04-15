export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = (provider: string = "manus") => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(JSON.stringify({ redirectUri, provider }));

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  url.searchParams.set("provider", provider);
  return url.toString();
};

// OAuth 제공자별 로그인 URL
export const getOAuthLoginUrl = (provider: "manus" | "google" | "github" | "microsoft") => {
  return getLoginUrl(provider);
};

// 지원하는 OAuth 제공자 목록
export const OAUTH_PROVIDERS = [
  { id: "manus", name: "Manus", icon: "🚀", color: "#4A9EFF" },
  { id: "google", name: "Google", icon: "🔍", color: "#EA4335" },
  { id: "github", name: "GitHub", icon: "🐙", color: "#333333" },
  { id: "microsoft", name: "Microsoft", icon: "⊞", color: "#00A4EF" },
] as const;
