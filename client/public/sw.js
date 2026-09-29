// 홈 화면 설치(PWA)용 최소 서비스 워커.
// 배포 직후 오래된 화면이 남지 않도록 캐시는 하지 않고 항상 네트워크로 요청한다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
