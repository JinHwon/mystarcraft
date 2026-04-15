import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, X } from 'lucide-react';

const VERSION_KEY = 'app_version';
const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

export function UpdateNotification() {
  const [showNotification, setShowNotification] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    const storedVersion = localStorage.getItem(VERSION_KEY);
    
    // 저장된 버전이 없거나 현재 버전과 다르면 알림 표시
    if (storedVersion && storedVersion !== CURRENT_VERSION) {
      setShowNotification(true);
    }
    
    // 현재 버전을 저장
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
  }, []);

  const handleClearCache = async () => {
    setIsClearing(true);
    
    try {
      // Service Worker 캐시 삭제
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }
      
      // LocalStorage 및 SessionStorage 선택적 삭제
      // (게임 진행 상태 등 중요한 데이터는 보존)
      const keysToDelete = [
        'app_version',
        // 캐시된 UI 상태 등 필요시 추가
      ];
      
      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // 페이지 새로고침
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('캐시 삭제 중 오류:', error);
      setIsClearing(false);
    }
  };

  if (!showNotification) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">새로운 버전이 출시되었습니다!</p>
            <p className="text-sm text-blue-100">
              최신 기능을 사용하려면 캐시를 삭제하고 페이지를 새로고침해주세요.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={handleClearCache}
            disabled={isClearing}
            className="bg-white text-blue-600 hover:bg-blue-50"
            size="sm"
          >
            {isClearing ? '처리 중...' : '캐시 삭제 & 새로고침'}
          </Button>
          <button
            onClick={() => setShowNotification(false)}
            className="p-1 hover:bg-blue-700 rounded transition-colors"
            aria-label="알림 닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
