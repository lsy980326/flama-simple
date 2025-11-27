import React from "react";
import { CanvasViewerManager } from "../collaboration/CanvasViewerManager";
import { User } from "../types";

export interface CanvasViewerProps {
  serverUrl: string;
  roomId: string;
  user: User;
  width?: number;
  height?: number;
  canvasWidth?: number; // 캔버스 가로 크기 (690, 720, 740, 기본값: 690)
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
 * @example
 * ```tsx
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
  width = 800,
  height = 600,
  canvasWidth = 690,
  showThumbnail = false,
  onReady,
  onError,
  style,
  className,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const managerRef = React.useRef<CanvasViewerManager | null>(null);
  const readyRef = React.useRef(onReady);
  const errorRef = React.useRef(onError);
  const [canvasSize, setCanvasSize] = React.useState({ width, height });

  React.useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  React.useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

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
          width,
          height,
          canvasWidth
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
  }, [serverUrl, roomId, user, width, height, canvasWidth]);

  // 크기 변경 처리
  React.useEffect(() => {
    if (managerRef.current) {
      managerRef.current.setCanvasWidth(canvasWidth);
    }
  }, [canvasWidth]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: `${canvasWidth}px`,
        height: "600px",
        maxHeight: "calc(100vh - 200px)",
        overflow: "auto",
        border: "1px solid #ddd",
        borderRadius: 4,
        margin: "0 auto",
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
        }}
      />
    </div>
  );
};

