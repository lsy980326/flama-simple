import React from "react";
import { CanvasViewerManager } from "../collaboration/CanvasViewerManager";
import { User } from "../types";

export interface CanvasViewerProps {
  serverUrl: string;
  roomId: string;
  user: User;
  width?: number; // 선택적: 지정하지 않으면 자동으로 컨테이너 크기 사용
  height?: number; // 선택적: 지정하지 않으면 자동으로 계산
  canvasWidth?: number; // 선택적: 지정하지 않으면 자동으로 컨테이너 너비 사용
  showThumbnail?: boolean; // 미리보기 네비게이션 표시 여부 (기본값: false)
  onReady?: (api: { manager: CanvasViewerManager }) => void;
  onError?: (error: unknown) => void;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Canvas 2D 기반 경량 뷰어 컴포넌트
 *
 * 읽기 전용 모드로 캔버스 내용을 보여줍니다.
 * 실시간 동기화는 Y.js를 통해 처리하며, 렌더링은 Canvas 2D로 수행합니다.
 *
 * 모바일과 데스크톱 환경에 자동으로 반응하며, 크기를 지정하지 않으면
 * 컨테이너 크기에 맞춰 자동으로 조정됩니다.
 *
 * @example
 * ```tsx
 * // 간단한 사용 (자동 크기 조정)
 * <CanvasViewer
 *   serverUrl="ws://localhost:5001"
 *   roomId="my-room"
 *   user={{ id: "user-1", name: "Viewer" }}
 * />
 *
 * // 크기 지정
 * <CanvasViewer
 *   serverUrl="ws://localhost:5001"
 *   roomId="my-room"
 *   user={{ id: "user-1", name: "Viewer" }}
 *   width={800}
 *   height={600}
 * />
 * ```
 */
export const CanvasViewer: React.FC<CanvasViewerProps> = ({
  serverUrl,
  roomId,
  user,
  width: propWidth,
  height: propHeight,
  canvasWidth: propCanvasWidth,
  showThumbnail = false,
  onReady,
  onError,
  style,
  className,
}) => {
  const outerContainerRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const managerRef = React.useRef<CanvasViewerManager | null>(null);
  const readyRef = React.useRef(onReady);
  const errorRef = React.useRef(onError);
  const [canvasSize, setCanvasSize] = React.useState({
    width: propWidth || 800,
    height: propHeight || 600,
  });
  const [calculatedSize, setCalculatedSize] = React.useState({
    width: propWidth || 800,
    height: propHeight || 600,
    canvasWidth: propCanvasWidth || 690,
  });

  React.useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  React.useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  // 실제 컨테이너 크기 측정 및 자동 계산
  const updateCalculatedSize = React.useCallback(() => {
    if (outerContainerRef.current) {
      const isMobile = window.innerWidth < 768;
      const rect = outerContainerRef.current.getBoundingClientRect();
      const availableWidth = rect.width || window.innerWidth;

      // width가 지정되지 않았으면 자동 계산
      const finalWidth = propWidth || availableWidth;
      const finalCanvasWidth = propCanvasWidth || finalWidth;
      const finalHeight =
        propHeight || (isMobile ? window.innerHeight - 100 : 600);

      setCalculatedSize({
        width: finalWidth,
        height: finalHeight,
        canvasWidth: finalCanvasWidth,
      });
    }
  }, [propWidth, propHeight, propCanvasWidth]);

  // 초기 크기 계산
  React.useEffect(() => {
    updateCalculatedSize();
  }, [updateCalculatedSize]);

  // 리사이즈 감지
  React.useEffect(() => {
    if (!propWidth || !propCanvasWidth) {
      // width나 canvasWidth가 지정되지 않았으면 리사이즈 감지
      window.addEventListener("resize", updateCalculatedSize);
      return () => window.removeEventListener("resize", updateCalculatedSize);
    }
  }, [propWidth, propCanvasWidth, updateCalculatedSize]);

  // 매니저 초기화
  React.useEffect(() => {
    let isMounted = true;
    let localManager: CanvasViewerManager | null = null;

    if (!containerRef.current) return;

    const timeout = setTimeout(() => {
      if (!containerRef.current || !isMounted) return;

      try {
        localManager = new CanvasViewerManager(
          containerRef.current,
          user,
          serverUrl,
          roomId,
          calculatedSize.width,
          calculatedSize.height,
          calculatedSize.canvasWidth
        );

        // 캔버스 크기 변경 콜백 설정
        localManager.setOnCanvasSizeChange((size) => {
          if (isMounted) {
            setCanvasSize(size);
          }
        });

        localManager
          .initialize()
          .then(() => {
            if (!isMounted || !localManager) return;
            managerRef.current = localManager;
            // 초기 크기 설정
            const initialSize = localManager.getCanvasSize();
            setCanvasSize(initialSize);
            readyRef.current?.({ manager: localManager });
          })
          .catch((e) => {
            errorRef.current?.(e);
          });
      } catch (e) {
        errorRef.current?.(e);
      }
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      try {
        localManager?.destroy();
      } catch {}
    };
  }, [serverUrl, roomId, user, calculatedSize]);

  // 크기 변경 처리
  React.useEffect(() => {
    if (managerRef.current) {
      managerRef.current.setCanvasWidth(calculatedSize.canvasWidth);
    }
  }, [calculatedSize.canvasWidth]);

  // 모바일 환경 감지
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div
      ref={outerContainerRef}
      style={{
        width: "100%",
        maxWidth: isMobile ? "100%" : `${calculatedSize.canvasWidth}px`,
        height: isMobile ? "auto" : "600px",
        maxHeight: isMobile ? "none" : "calc(100vh - 200px)",
        overflow: isMobile ? "visible" : "auto",
        border: isMobile ? "none" : "1px solid #ddd",
        borderRadius: isMobile ? 0 : 4,
        margin: isMobile ? 0 : "0 auto",
        padding: 0,
        ...style,
      }}
      className={className}
    >
      <div
        ref={containerRef}
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          position: "relative",
          backgroundColor: "#fff",
          margin: 0,
          padding: 0,
          overflow: "visible",
          // 모바일에서는 터치 스크롤을 위한 추가 설정
          touchAction: isMobile ? "pan-y pinch-zoom" : "auto",
        }}
      />
    </div>
  );
};
