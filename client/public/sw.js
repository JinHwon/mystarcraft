// 홈 화면 설치(PWA)용 최소 서비스 워커.
// 요청은 가로채지 않는다 (빈 fetch 핸들러는 모든 요청을 느리게 하므로 두지 않음). 캐시는 서버의 Cache-Control 에 맡긴다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
