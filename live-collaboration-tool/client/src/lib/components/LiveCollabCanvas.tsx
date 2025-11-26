import React from "react";
import { RealTimeDrawingManager } from "../collaboration/RealTimeDrawingManager";
import { User, WebRTCConfig } from "../types";
import { CanvasThumbnailNavigator } from "./CanvasThumbnailNavigator";
import { WEBTOON_WIDTH_OPTIONS } from "./WebtoonViewer";

// 디버깅용 뷰포트 좌표 오버레이 컴포넌트
const ViewportDebugOverlay: React.FC<{
  containerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ containerRef }) => {
  const [scrollInfo, setScrollInfo] = React.useState({
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 0,
    clientHeight: 0,
    scrollWidth: 0,
    scrollHeight: 0,
  });

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScrollInfo = () => {
      setScrollInfo({
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        scrollWidth: container.scrollWidth,
        scrollHeight: container.scrollHeight,
      });
    };

    updateScrollInfo();
    container.addEventListener("scroll", updateScrollInfo, { passive: true });
    window.addEventListener("resize", updateScrollInfo);

    return () => {
      container.removeEventListener("scroll", updateScrollInfo);
      window.removeEventListener("resize", updateScrollInfo);
    };
  }, [containerRef]);

  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();

  return (
    <div
      style={{
        position: "fixed",
        top: containerRect.top + 10,
        left: containerRect.left + 10,
        padding: "8px",
        backgroundColor: "rgba(255, 0, 0, 0.8)",
        color: "white",
        fontSize: "11px",
        fontFamily: "monospace",
        zIndex: 10001,
        pointerEvents: "none",
        borderRadius: "4px",
        whiteSpace: "pre",
        lineHeight: "1.4",
        maxWidth: "300px",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>캔버스 뷰포트:</div>
      <div>Scroll: ({Math.round(scrollInfo.scrollLeft)}, {Math.round(scrollInfo.scrollTop)})</div>
      <div>Viewport: {scrollInfo.clientWidth}x{scrollInfo.clientHeight}</div>
      <div>Content: {scrollInfo.scrollWidth}x{scrollInfo.scrollHeight}</div>
      <div>Top-Left: ({Math.round(scrollInfo.scrollLeft)}, {Math.round(scrollInfo.scrollTop)})</div>
      <div>Bottom-Right: ({Math.round(scrollInfo.scrollLeft + scrollInfo.clientWidth)}, {Math.round(scrollInfo.scrollTop + scrollInfo.clientHeight)})</div>
    </div>
  );
};

export interface LiveCollabCanvasProps {
  serverUrl: string; // Y.js websocket 서버 (예: ws://localhost:5001)
  roomId: string;
  user: User;
  width?: number; // 초기 캔버스 가로 크기 (픽셀)
  height?: number; // 초기 캔버스 세로 크기 (픽셀)
  canvasWidth?: number; // 캔버스 가로 크기 (690, 720, 740, 기본값: 690)
  defaultCanvasWidth?: number; // 사용되지 않음 (하위 호환성을 위해 유지)
  webrtcConfig?: WebRTCConfig;
  showToolbar?: boolean;
  showThumbnail?: boolean; // 미리보기 네비게이션 표시 여부
  thumbnailContainerRef?: React.RefObject<HTMLDivElement | null>; // 스크롤 가능한 컨테이너 ref
  onReady?: (api: { manager: RealTimeDrawingManager }) => void;
  onError?: (error: unknown) => void;
}

export const LiveCollabCanvas: React.FC<LiveCollabCanvasProps> = ({
  serverUrl,
  roomId,
  user,
  width = 800,
  height = 600,
  canvasWidth = 690,
  defaultCanvasWidth = 690, // 사용되지 않음 (하위 호환성을 위해 유지)
  webrtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  },
  showToolbar = true,
  showThumbnail = true,
  thumbnailContainerRef,
  onReady,
  onError,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const internalThumbnailContainer = React.useRef<HTMLDivElement>(null);
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
  const [currentCanvasWidth, setCurrentCanvasWidth] = React.useState<number>(canvasWidth);
  const [canvasSize, setCanvasSize] = React.useState({ width: width, height: height });
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
            // 스크롤 컨테이너 ref를 manager에 설정 (오버레이 이미지 추가 시 뷰포트 위치 계산용)
            // internalThumbnailContainer는 아직 마운트되지 않았을 수 있으므로 나중에 별도로 설정
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

  // 캔버스 가로 크기 조절
  React.useEffect(() => {
    if (!manager) return;
    manager.setCanvasWidth(currentCanvasWidth, 690); // 기본값 690 사용
    
    // 캔버스 크기 업데이트 (비동기로 처리하여 resize 완료 후 크기 가져오기)
    setTimeout(() => {
      const canvasManager = manager.getCanvasManager();
      if (canvasManager) {
        const size = canvasManager.getCanvasSize();
        setCanvasSize(size);
      }
    }, 0);
  }, [manager, currentCanvasWidth]);

  // 스크롤 컨테이너 ref 업데이트 (컨테이너가 변경될 수 있음)
  // thumbnailContainer는 나중에 정의되므로, 여기서는 thumbnailContainerRef를 직접 사용
  React.useEffect(() => {
    if (!manager) return;
    const scrollContainer = thumbnailContainerRef?.current || internalThumbnailContainer.current;
    if (scrollContainer) {
      const scrollContainerRef = { current: scrollContainer } as React.RefObject<HTMLDivElement>;
      manager.setScrollContainer(scrollContainerRef);
      console.log("🟡 [LiveCollabCanvas] 스크롤 컨테이너 설정 완료");
    } else {
      console.warn("🟡 [LiveCollabCanvas] 스크롤 컨테이너를 찾을 수 없음");
    }
  }, [manager, thumbnailContainerRef, internalThumbnailContainer]);

  // 배경 이미지 변경 시 캔버스 크기 업데이트
  React.useEffect(() => {
    if (!manager) return;
    
    const updateCanvasSize = () => {
      const canvasManager = manager.getCanvasManager();
      if (canvasManager) {
        const size = canvasManager.getCanvasSize();
        console.log("🟡 [LiveCollabCanvas] 캔버스 크기 업데이트:", size);
        setCanvasSize(size);
      }
    };
    
    // 배경 이미지 로드/제거 후 크기 업데이트
    setTimeout(updateCanvasSize, 100);
  }, [manager, hasBackground, currentCanvasWidth]);

  // 배경 이미지 상태 동기화 (외부에서 removeBackgroundImage 호출 시 감지)
  React.useEffect(() => {
    if (!manager) return;
    
    const checkBackgroundChange = () => {
      const currentHasBackground = manager.hasBackgroundImage();
      if (currentHasBackground !== hasBackground) {
        console.log("🟡 [LiveCollabCanvas] 배경 이미지 상태 변경 감지:", {
          이전: hasBackground,
          현재: currentHasBackground,
        });
        setHasBackground(currentHasBackground);
        
        // 배경 이미지가 제거되었을 때 캔버스 크기 업데이트
        if (!currentHasBackground) {
          setTimeout(() => {
            const canvasManager = manager.getCanvasManager();
            if (canvasManager) {
              const size = canvasManager.getCanvasSize();
              console.log("🟡 [LiveCollabCanvas] 배경 제거 후 캔버스 크기:", size);
              setCanvasSize(size);
            }
          }, 150);
        }
      }
    };
    
    // 주기적으로 배경 이미지 상태 확인 (배경 이미지가 외부에서 제거될 수 있음)
    const interval = setInterval(checkBackgroundChange, 300);
    
    return () => clearInterval(interval);
  }, [manager, hasBackground]);

  // canvasWidth prop 변경 시 내부 state 업데이트
  React.useEffect(() => {
    setCurrentCanvasWidth(canvasWidth);
  }, [canvasWidth]);

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

  // 6) Delete/Backspace 키로 선택된 객체 삭제
  React.useEffect(() => {
    if (!manager) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Delete 키로 선택된 이미지 삭제
      if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }

        const removed = manager.removeSelectedObject();
        if (removed) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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
      // 가로 크기 제한 없음 (기본 동작)
      await manager.loadBackgroundImage(file);
      setHasBackground(true);
      const applied = manager.getBackgroundScale();
      setBackgroundScale(Number(applied.toFixed(2)));
      
      // 배경 이미지 로드 후 현재 캔버스 가로 크기에 맞춰 조절
      manager.setCanvasWidth(currentCanvasWidth, 690); // 기본값 690 사용
      
      // 캔버스 크기 업데이트
      setTimeout(() => {
        const canvasManager = manager.getCanvasManager();
        if (canvasManager) {
          const size = canvasManager.getCanvasSize();
          setCanvasSize(size);
        }
      }, 100);
      
      // 배경 이미지가 (0, 0)에서 시작하도록 스크롤을 (0, 0)으로 리셋
      // 실제 스크롤 컨테이너를 찾아서 리셋
      console.log("🔵 [LiveCollabCanvas] 배경 이미지 로드 후 스크롤 리셋 시작");
      const resetScroll = () => {
        // thumbnailContainer가 실제 스크롤 컨테이너인 경우
        const scrollContainer = thumbnailContainer?.current || internalThumbnailContainer.current;
        if (scrollContainer) {
          console.log("🔵 [LiveCollabCanvas] thumbnailContainer 찾음, 현재 scrollTop:", scrollContainer.scrollTop, "scrollHeight:", scrollContainer.scrollHeight, "clientHeight:", scrollContainer.clientHeight);
          scrollContainer.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          scrollContainer.scrollTop = 0;
          scrollContainer.scrollLeft = 0;
          console.log("🔵 [LiveCollabCanvas] thumbnailContainer 스크롤 리셋 완료, scrollTop:", scrollContainer.scrollTop);
        } else {
          console.log("🔵 [LiveCollabCanvas] thumbnailContainer 없음, 부모 요소 확인");
        }
        
        // containerRef도 확인
        if (containerRef.current) {
          console.log("🔵 [LiveCollabCanvas] containerRef 찾음, 현재 scrollTop:", containerRef.current.scrollTop);
          containerRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          containerRef.current.scrollTop = 0;
          containerRef.current.scrollLeft = 0;
          console.log("🔵 [LiveCollabCanvas] containerRef 스크롤 리셋 완료, scrollTop:", containerRef.current.scrollTop);
        }
        
        // 부모 요소들도 확인 (실제 스크롤 컨테이너가 부모일 수 있음)
        let parent = containerRef.current?.parentElement;
        let found = false;
        let depth = 0;
        while (parent && depth < 10) {
          const style = window.getComputedStyle(parent);
          if (style.overflow === 'auto' || style.overflow === 'scroll' || 
              style.overflowY === 'auto' || style.overflowY === 'scroll' ||
              parent.scrollHeight > parent.clientHeight) {
            console.log(`🔵 [LiveCollabCanvas] 부모 스크롤 컨테이너 (depth ${depth}) 찾음, 현재 scrollTop:`, parent.scrollTop, "scrollHeight:", parent.scrollHeight, "clientHeight:", parent.clientHeight);
            parent.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            parent.scrollTop = 0;
            parent.scrollLeft = 0;
            console.log(`🔵 [LiveCollabCanvas] 부모 스크롤 (depth ${depth}) 리셋 완료, scrollTop:`, parent.scrollTop);
            found = true;
            // break 제거 - 모든 스크롤 컨테이너 리셋
          }
          parent = parent.parentElement;
          depth++;
        }
        
        if (!found && !scrollContainer) {
          console.warn("⚠️ [LiveCollabCanvas] 스크롤 컨테이너를 찾을 수 없음");
        }
      };
      
      // 즉시 리셋
      resetScroll();
      
      // 캔버스 크기 조정이 완료된 후에도 다시 한 번 리셋 (안전장치)
      setTimeout(() => {
        console.log("🔵 [LiveCollabCanvas] 100ms 후 스크롤 리셋 재시도");
        resetScroll();
      }, 100);
      
      setTimeout(() => {
        console.log("🔵 [LiveCollabCanvas] 300ms 후 스크롤 리셋 재시도");
        resetScroll();
      }, 300);
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
      // 현재 뷰포트 중앙 계산 (PIXI 캔버스의 절대 좌표)
      // internalThumbnailContainer가 실제 스크롤 컨테이너
      const scrollContainer = thumbnailContainer?.current || internalThumbnailContainer.current;
      let viewportX: number | undefined;
      let viewportY: number | undefined;
      
      if (scrollContainer) {
        // 스크롤 위치는 PIXI 캔버스의 절대 좌표와 직접 일치
        // 스크롤 위치 + 뷰포트 중앙 = PIXI 캔버스의 절대 좌표
        viewportX = scrollContainer.scrollLeft + scrollContainer.clientWidth / 2;
        viewportY = scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
        
        console.log("🔵 [오버레이] 스크롤 컨테이너:", {
          scrollLeft: scrollContainer.scrollLeft,
          scrollTop: scrollContainer.scrollTop,
          clientWidth: scrollContainer.clientWidth,
          clientHeight: scrollContainer.clientHeight,
          scrollWidth: scrollContainer.scrollWidth,
          scrollHeight: scrollContainer.scrollHeight,
          viewportX,
          viewportY,
        });
      } else {
        console.warn("🔵 [오버레이] 스크롤 컨테이너를 찾을 수 없음");
      }

      // 가로 크기 제한 없음 (기본 동작)
      for (const file of validFiles) {
        await manager.addImageFromFile(file, viewportX, viewportY);
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
      // 배경 이미지 제거 전에 현재 가로 크기 저장
      const canvasManager = manager.getCanvasManager();
      const currentSize = canvasManager.getCanvasSize();
      const currentWidth = currentSize.width;
      
      manager.removeBackgroundImage();
      setHasBackground(false);
      setBackgroundScale(1);
      
      // 배경 이미지 제거 후 명시적으로 기본 높이로 리셋
      // 배경 이미지가 없을 때는 기본 높이(600)를 사용
      const defaultHeight = 600;
      canvasManager.resize(currentWidth, defaultHeight);
      
      // 캔버스 크기 업데이트
      setTimeout(() => {
        const size = canvasManager.getCanvasSize();
        setCanvasSize(size);
      }, 100);
      
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
      
      // 캔버스 크기 업데이트 및 렌더링 완료 대기
      const canvasManager = manager.getCanvasManager();
      if (canvasManager) {
        // 캔버스가 준비될 때까지 대기
        await canvasManager.waitForInitialization();
        
        // 렌더링 강제 업데이트
        const app = (canvasManager as any).app;
        if (app && app.renderer && app.stage) {
          app.renderer.render(app.stage);
        }
        
        // 캔버스 크기 업데이트
        const size = canvasManager.getCanvasSize();
        setCanvasSize(size);
        
        // 큰 캔버스의 경우 추가 렌더링 대기
        if (size.height > 10000) {
          // 매우 큰 캔버스의 경우 추가 대기 시간
          await new Promise(resolve => setTimeout(resolve, 1000));
          const app = (canvasManager as any).app;
          if (app && app.renderer && app.stage) {
            app.renderer.render(app.stage);
          }
        }
      }
      
      // 미리보기 업데이트를 위해 canvas-activated 이벤트 발생
      // 렌더링이 완전히 완료된 후 썸네일 생성
      if (showThumbnail && manager) {
        const container = thumbnailContainer?.current || internalThumbnailContainer.current;
        if (container) {
          // 렌더링 완료를 보장하기 위해 충분한 지연 (큰 캔버스의 경우 더 긴 대기)
          const canvasManager = manager.getCanvasManager();
          const size = canvasManager ? canvasManager.getCanvasSize() : { height: 0 };
          const delay = size.height > 10000 ? 1500 : 500;
          
          setTimeout(() => {
            (window as any).__activeCanvasManager = manager;
            (window as any).__activeCanvasContainer = container;
            window.dispatchEvent(new CustomEvent('canvas-activated', { 
              detail: { manager, container } 
            }));
          }, delay);
        }
      }
    } catch (error) {
      console.error("캔버스 불러오기 실패:", error);
      alert("캔버스 불러오기에 실패했습니다.");
    } finally {
      e.target.value = "";
    }
  };

  // 미리보기용 컨테이너 ref (외부에서 제공되지 않으면 내부 ref 사용)
  const thumbnailContainer = thumbnailContainerRef || internalThumbnailContainer;

  return (
    <>
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
            <label style={{ fontSize: 12, marginBottom: 6 }}>캔버스 가로 크기</label>
            <select
              value={currentCanvasWidth}
              onChange={(e) => {
                const newWidth = Number(e.target.value);
                setCurrentCanvasWidth(newWidth);
              }}
              style={{ width: "100%", padding: "4px", fontSize: 12 }}
            >
              {WEBTOON_WIDTH_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
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
        ref={internalThumbnailContainer}
        style={{
          width: canvasSize.width,
          height: "auto",
          maxHeight: "calc(100vh - 200px)",
          border: "2px solid #333",
          backgroundColor: "#000000",
          cursor: "crosshair",
          overflow: "auto",
          margin: "0 auto",
          position: "relative",
        }}
        onClick={() => {
          // 캔버스 클릭 시 전역 상태에 이 manager 설정 및 미리보기 생성
          if (manager && showThumbnail) {
            const container = thumbnailContainer?.current || internalThumbnailContainer.current;
            (window as any).__activeCanvasManager = manager;
            (window as any).__activeCanvasContainer = container;
            // 미리보기 생성 이벤트 발생
            window.dispatchEvent(new CustomEvent('canvas-activated', { 
              detail: { manager, container } 
            }));
          }
        }}
      >
        <div
          ref={containerRef}
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
            backgroundColor: "#fff",
            cursor: "crosshair",
          }}
        />
        {showThumbnail && manager && (
          <>
            {/* 디버깅: 캔버스 뷰포트 좌표 표시 */}
            {thumbnailContainer && thumbnailContainer.current && (
              <ViewportDebugOverlay containerRef={thumbnailContainer} />
            )}
            <CanvasThumbnailNavigator
              manager={manager}
              containerRef={thumbnailContainer}
            />
          </>
        )}
      </div>
    </div>
    </>
  );
};

export default LiveCollabCanvas;
