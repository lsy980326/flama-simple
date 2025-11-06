import React from "react";
import { RealTimeDrawingManager } from "../collaboration/RealTimeDrawingManager";
import { User, WebRTCConfig } from "../types";

export interface LiveCollabCanvasProps {
  serverUrl: string; // Y.js websocket 서버 (예: ws://localhost:5001)
  roomId: string;
  user: User;
  width?: number;
  height?: number;
  webrtcConfig?: WebRTCConfig;
  showToolbar?: boolean;
  onReady?: (api: { manager: RealTimeDrawingManager }) => void;
  onError?: (error: unknown) => void;
}

export const LiveCollabCanvas: React.FC<LiveCollabCanvasProps> = ({
  serverUrl,
  roomId,
  user,
  width = 800,
  height = 600,
  webrtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  },
  showToolbar = true,
  onReady,
  onError,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [manager, setManager] = React.useState<RealTimeDrawingManager | null>(
    null
  );
  const [brushSize, setBrushSize] = React.useState(5);
  const [color, setColor] = React.useState("#000000");
  const [hasImage, setHasImage] = React.useState(false);
  const [currentTool, setCurrentTool] = React.useState<
    "brush" | "eraser" | "text" | "rectangle" | "circle" | "line"
  >("brush");
  const [isTransformManual, setIsTransformManual] = React.useState(false);
  const [isTransformHotkey, setIsTransformHotkey] = React.useState(false);
  const effectiveTransformMode = React.useMemo(
    () => (isTransformManual || isTransformHotkey) && hasImage,
    [isTransformManual, isTransformHotkey, hasImage]
  );
  const loadFileInputRef = React.useRef<HTMLInputElement>(null);
  // 최신 콜백/설정 참조
  const readyRef = React.useRef(onReady);
  const errorRef = React.useRef(onError);
  const webrtcRef = React.useRef<WebRTCConfig | undefined>(webrtcConfig);
  React.useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);
  React.useEffect(() => {
    errorRef.current = onError;
  }, [onError]);
  React.useEffect(() => {
    webrtcRef.current = webrtcConfig;
  }, [webrtcConfig]);

  // 1) 매니저 초기화
  React.useEffect(() => {
    let isMounted = true;
    let localManager: RealTimeDrawingManager | null = null;

    if (!containerRef.current) return;

    const timeout = setTimeout(() => {
      if (!containerRef.current || !isMounted) return;
      try {
        localManager = new RealTimeDrawingManager(
          {
            serverUrl,
            roomId,
            user,
            webrtcConfig: webrtcRef.current || { iceServers: [] },
          },
          containerRef.current
        );

        localManager
          .initialize()
          .then(() => {
            if (!isMounted || !localManager) return;
            setManager(localManager);
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
        localManager?.disconnect();
      } catch {}
    };
  }, [serverUrl, roomId, user.id]);

  // 2) 브러시 설정 동기화
  React.useEffect(() => {
    if (!manager) return;
    manager.setBrushSize(brushSize);
    manager.setBrushColor(color);
  }, [manager, brushSize, color]);

  // 3) Transform 모드 동기화
  React.useEffect(() => {
    if (!manager) return;
    manager.setTransformMode(effectiveTransformMode);
  }, [manager, effectiveTransformMode]);

  // 4) Alt+T 단축키 핸들러
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "t" || event.key === "T") && event.altKey) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        if (!hasImage) {
          return;
        }
        event.preventDefault();
        setIsTransformManual((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasImage]);

  // 5) Ctrl 키 누른 채 유지로 임시 Transform 활성화
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsTransformHotkey(true);
        if (
          manager &&
          typeof (manager as any).setTransformHotkey === "function"
        ) {
          (manager as any).setTransformHotkey(true);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsTransformHotkey(false);
        if (
          manager &&
          typeof (manager as any).setTransformHotkey === "function"
        ) {
          (manager as any).setTransformHotkey(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [manager]);

  React.useEffect(() => {
    if (!hasImage) {
      setIsTransformHotkey(false);
    }
  }, [hasImage]);

  const handleSize = (v: number) => {
    setBrushSize(v);
    manager?.setBrushSize(v);
  };
  const handleColor = (v: string) => {
    setColor(v);
    manager?.setBrushColor(v);
  };

  const handleToolChange = (
    tool: "brush" | "eraser" | "text" | "rectangle" | "circle" | "line"
  ) => {
    setCurrentTool(tool);
    if (manager && typeof (manager as any).setTool === "function") {
      (manager as any).setTool(tool);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !manager) return;

    // 이미지 파일만 허용
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    try {
      // CanvasManager의 loadImageFromFile 메서드 호출
      if (typeof (manager as any).loadBackgroundImage === "function") {
        await (manager as any).loadBackgroundImage(file);
        setHasImage(true);
      } else {
        const canvasManager = manager.getCanvasManager();
        if (
          canvasManager &&
          typeof canvasManager.loadImageFromFile === "function"
        ) {
          await canvasManager.loadImageFromFile(file);
          setHasImage(true);
        } else {
          console.error("CanvasManager를 찾을 수 없습니다.");
        }
      }
    } catch (error) {
      console.error("이미지 로드 실패:", error);
      alert("이미지 로드에 실패했습니다.");
    }
  };

  const handleRemoveImage = () => {
    if (!manager) return;

    try {
      if (typeof (manager as any).removeBackgroundImage === "function") {
        (manager as any).removeBackgroundImage();
        setHasImage(false);
        setIsTransformManual(false);
        setIsTransformHotkey(false);
      } else {
        const canvasManager = manager.getCanvasManager();
        if (
          canvasManager &&
          typeof canvasManager.removeBackgroundImage === "function"
        ) {
          canvasManager.removeBackgroundImage();
          setHasImage(false);
          setIsTransformManual(false);
          setIsTransformHotkey(false);
        }
      }
    } catch (error) {
      console.error("이미지 제거 실패:", error);
    }
  };

  const handleSaveCanvas = () => {
    if (!manager) return;
    try {
      if (typeof (manager as any).downloadCanvasState === "function") {
        const filename = `canvas-${Date.now()}.json`;
        (manager as any).downloadCanvasState(filename);
      }
    } catch (error) {
      console.error("캔버스 저장 실패:", error);
      alert("캔버스 저장에 실패했습니다.");
    }
  };

  const handleLoadCanvas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !manager) return;

    try {
      const text = await file.text();
      if (typeof (manager as any).importCanvasState === "function") {
        await (manager as any).importCanvasState(text);
        setHasImage(
          typeof (manager as any).hasBackgroundImage === "function"
            ? (manager as any).hasBackgroundImage()
            : false
        );
      }
    } catch (error) {
      console.error("캔버스 불러오기 실패:", error);
      alert("캔버스 불러오기에 실패했습니다.");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 16 }}>
      {showToolbar && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12 }}>도구 선택</label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 4,
            }}
          >
            <button
              onClick={() => handleToolChange("brush")}
              style={{
                padding: "6px",
                background: currentTool === "brush" ? "#4E6FF2" : "#eee",
                color: currentTool === "brush" ? "white" : "black",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ✏️ 브러시
            </button>
            <button
              onClick={() => handleToolChange("eraser")}
              style={{
                padding: "6px",
                background: currentTool === "eraser" ? "#4E6FF2" : "#eee",
                color: currentTool === "eraser" ? "white" : "black",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              🧹 지우개
            </button>
            <button
              onClick={() => handleToolChange("text")}
              style={{
                padding: "6px",
                background: currentTool === "text" ? "#4E6FF2" : "#eee",
                color: currentTool === "text" ? "white" : "black",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              📝 텍스트
            </button>
            <button
              onClick={() => handleToolChange("rectangle")}
              style={{
                padding: "6px",
                background: currentTool === "rectangle" ? "#4E6FF2" : "#eee",
                color: currentTool === "rectangle" ? "white" : "black",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ▭ 사각형
            </button>
            <button
              onClick={() => handleToolChange("circle")}
              style={{
                padding: "6px",
                background: currentTool === "circle" ? "#4E6FF2" : "#eee",
                color: currentTool === "circle" ? "white" : "black",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ⭕ 원
            </button>
            <button
              onClick={() => handleToolChange("line")}
              style={{
                padding: "6px",
                background: currentTool === "line" ? "#4E6FF2" : "#eee",
                color: currentTool === "line" ? "white" : "black",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ━ 선
            </button>
          </div>
          <label style={{ fontSize: 12 }}>브러시 크기</label>
          <input
            type="range"
            min={1}
            max={30}
            value={brushSize}
            onChange={(e) => handleSize(parseInt(e.target.value))}
          />
          <label style={{ fontSize: 12 }}>색상</label>
          <input
            type="color"
            value={color}
            onChange={(e) => handleColor(e.target.value)}
          />
          <button onClick={() => manager?.clearCanvas()}>캔버스 지우기</button>
          <div style={{ borderTop: "1px solid #ccc", paddingTop: 12 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />
            <button onClick={() => fileInputRef.current?.click()}>
              이미지 불러오기
            </button>
            {hasImage && (
              <button onClick={handleRemoveImage} style={{ marginTop: 8 }}>
                이미지 제거
              </button>
            )}
          </div>
          <div style={{ borderTop: "1px solid #ccc", paddingTop: 12 }}>
            <label style={{ fontSize: 12, marginBottom: 6 }}>
              캔버스 저장/불러오기
            </label>
            <button onClick={handleSaveCanvas} disabled={!manager}>
              저장하기
            </button>
            <input
              ref={loadFileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={handleLoadCanvas}
            />
            <button
              onClick={() => loadFileInputRef.current?.click()}
              disabled={!manager}
              style={{ marginTop: 8 }}
            >
              불러오기
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          width,
          height,
          border: "2px solid #333",
          backgroundColor: "#fff",
          cursor: "crosshair",
        }}
      />
    </div>
  );
};

export default LiveCollabCanvas;
