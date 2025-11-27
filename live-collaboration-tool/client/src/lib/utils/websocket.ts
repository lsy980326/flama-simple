/**
 * WebSocket 엔드포인트 자동 감지 유틸리티
 *
 * 현재 접속한 호스트 주소를 자동으로 사용하여 WebSocket 엔드포인트를 생성합니다.
 * - 폰에서 접근 시: http://192.168.0.4:5173 -> ws://192.168.0.4:5001
 * - PC에서 접근 시: http://localhost:5173 -> ws://localhost:5001
 */

/**
 * WebSocket 엔드포인트를 자동으로 생성합니다.
 *
 * @param port WebSocket 서버 포트 (기본값: 5001)
 * @param wsHost 환경 변수로 지정된 WebSocket 호스트 (선택사항)
 * @returns WebSocket 엔드포인트 URL
 */
export function getWSEndpoint(port: number = 5001, wsHost?: string): string {
  if (typeof window === "undefined") {
    return `ws://127.0.0.1:${port}`;
  }

  // 환경 변수로 지정된 WebSocket 호스트가 있으면 사용
  let host = wsHost;
  if (!host) {
    // import.meta가 있는지 체크 (Vite 환경)
    try {
      const envHost = (import.meta as any)?.env?.VITE_WS_HOST;
      if (envHost) {
        host = envHost;
      }
    } catch {
      // import.meta가 없는 환경 (Node.js 등)
    }
  }
  if (!host) {
    host = window.location.hostname;
  }
  return `ws://${host}:${port}`;
}
