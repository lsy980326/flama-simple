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
  const backgroundFileInputRef = React.useRef<HTMLInputElement>(null);
  const overlayFileInputRef = React.useRef<HTMLInputElement>(null);
  const loadFileInputRef = React.useRef<HTMLInputElement>(null);
  const [manager, setManager] = React.useState<RealTimeDrawingManager | null>(
    null
  );
  const [brushSize, setBrushSize] = React.useState(5);
  const [color, setColor] = React.useState("#000000");
  const [hasBackground, setHasBackground] = React.useState(false);
  const [hasOverlay, setHasOverlay] = React.useState(false);
  const [backgroundScale, setBackgroundScale] = React.useState(1);
  const [currentTool, setCurrentTool] = React.useState<
    "brush" | "eraser" | "text" | "rectangle" | "circle" | "line"
  >("brush");
  const [isTransformManual, setIsTransformManual] = React.useState(false);
  const [isTransformHotkey, setIsTransformHotkey] = React.useState(false);
  const hasTransformTarget = React.useMemo(
    () => hasBackground || hasOverlay,
    [hasBackground, hasOverlay]
  );
  const effectiveTransformMode = React.useMemo(
    () => (isTransformManual || isTransformHotkey) && hasTransformTarget,
    [isTransformManual, isTransformHotkey, hasTransformTarget]
  );
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
  }, [serverUrl, roomId, user]);

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

  React.useEffect(() => {
    if (!manager) return;

    const handleScaleChange = (scale: number) => {
      setBackgroundScale(Number(scale.toFixed(2)));
      setHasBackground(manager.hasBackgroundImage());
    };

    manager.setOnBackgroundScaleChange(handleScaleChange);
    setHasBackground(manager.hasBackgroundImage());
    if (manager.hasBackgroundImage()) {
      setBackgroundScale(Number(manager.getBackgroundScale().toFixed(2)));
    } else {
      setBackgroundScale(1);
    }

    return () => {
      manager.setOnBackgroundScaleChange(undefined);
    };
  }, [manager]);

  React.useEffect(() => {
    if (!manager) return;

    const handleObjectsChange = (objects: any[]) => {
      const hasImages = Array.isArray(objects)
        ? objects.some((obj) => obj?.type === "image")
        : false;
      setHasOverlay(hasImages);
      setHasBackground(manager.hasBackgroundImage());
    };

    manager.setOnObjectsChange(handleObjectsChange);

    return () => {
      manager.setOnObjectsChange(undefined);
    };
  }, [manager]);

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
        if (!hasTransformTarget) {
          return;
        }
        event.preventDefault();
        setIsTransformManual((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasTransformTarget]);

  // 5) Ctrl 키 누른 채 유지로 임시 Transform 활성화
  React.useEffect(() => {
    if (!manager) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsTransformHotkey(true);
        manager.setTransformHotkey(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsTransformHotkey(false);
        manager.setTransformHotkey(false);
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
    if (!hasTransformTarget) {
      setIsTransformHotkey(false);
    }
  }, [hasTransformTarget]);

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
    if (manager) {
      manager.setTool(tool);
    }
  };

  const handleBackgroundUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !manager) {
      e.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      e.target.value = "";
      return;
    }

    try {
      await manager.loadBackgroundImage(file);
      setHasBackground(true);
      const applied = manager.getBackgroundScale();
      setBackgroundScale(Number(applied.toFixed(2)));
    } catch (error) {
      console.error("배경 이미지 로딩 실패:", error);
      alert("배경 이미지를 불러오는 중 오류가 발생했습니다.");
    } finally {
      e.target.value = "";
    }
  };

  const handleOverlayUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || !manager) {
      e.target.value = "";
      return;
    }

    const validFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (validFiles.length === 0) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      e.target.value = "";
      return;
    }

    try {
      for (const file of validFiles) {
        await manager.addImageFromFile(file);
      }
      setHasOverlay(true);
    } catch (error) {
      console.error("오버레이 이미지 추가 실패:", error);
      alert("오버레이 이미지를 추가하는 중 오류가 발생했습니다.");
    } finally {
      e.target.value = "";
    }
  };

  const handleBackgroundScaleChange = (value: number) => {
    if (!manager || !effectiveTransformMode || !hasBackground) return;
    manager.setBackgroundScale(value);
    const applied = manager.getBackgroundScale();
    setBackgroundScale(Number(applied.toFixed(2)));
  };

  const handleResetBackgroundTransform = () => {
    if (!manager || !effectiveTransformMode || !hasBackground) return;
    manager.resetBackgroundImageTransform();
    const applied = manager.getBackgroundScale();
    setBackgroundScale(Number(applied.toFixed(2)));
  };

  const handleRemoveImage = () => {
    if (!manager) return;

    try {
      manager.removeBackgroundImage();
      setHasBackground(false);
      setBackgroundScale(1);
      if (!hasOverlay) {
        setIsTransformManual(false);
        setIsTransformHotkey(false);
      }
    } catch (error) {
      console.error("이미지 제거 실패:", error);
    }
  };

  const handleSaveCanvas = () => {
    if (!manager) return;
    try {
      const filename = `canvas-${Date.now()}.json`;
      manager.downloadCanvasState(filename);
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
      await manager.importCanvasState(text);
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const hasBg = manager.hasBackgroundImage();
      const hasOverlayObjects = Array.isArray(parsed?.objects)
        ? parsed.objects.some((obj: any) => obj?.type === "image")
        : false;
      setHasBackground(hasBg);
      setHasOverlay(hasOverlayObjects);
      setBackgroundScale(
        hasBg ? Number(manager.getBackgroundScale().toFixed(2)) : 1
      );
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
              ref={backgroundFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleBackgroundUpload}
            />
            <button onClick={() => backgroundFileInputRef.current?.click()}>
              배경 이미지 불러오기
            </button>
            {hasBackground && (
              <button onClick={handleRemoveImage} style={{ marginTop: 8 }}>
                배경 이미지 제거
              </button>
            )}
          </div>
          <div style={{ borderTop: "1px solid #ccc", paddingTop: 12 }}>
            <input
              ref={overlayFileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleOverlayUpload}
            />
            <button onClick={() => overlayFileInputRef.current?.click()}>
              오버레이 이미지 추가
            </button>
            {hasOverlay && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#444" }}>
                Ctrl 키를 누른 채 이미지를 드래그하면 이동할 수 있습니다.
              </div>
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
          <div
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <span>
              Transform 모드: {effectiveTransformMode ? "ON" : "OFF"} (Alt+T
              토글 / Ctrl 누른 채 유지)
            </span>
            <button
              onClick={() => setIsTransformManual((prev) => !prev)}
              disabled={!hasTransformTarget}
            >
              {effectiveTransformMode
                ? "Transform 모드 종료"
                : "Transform 모드 진입"}
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <label>
              배경 확대/축소: {backgroundScale.toFixed(2)}x
            </label>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.01}
              value={backgroundScale}
              onChange={(e) =>
                handleBackgroundScaleChange(parseFloat(e.target.value))
              }
              disabled={!hasBackground}
            />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={handleResetBackgroundTransform}
              disabled={!hasBackground || !effectiveTransformMode}
            >
              배경 초기화
            </button>
            <button
              onClick={handleRemoveImage}
              disabled={!hasBackground}
            >
              배경 제거
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
