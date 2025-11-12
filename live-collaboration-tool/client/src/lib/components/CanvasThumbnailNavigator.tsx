import React, { useEffect, useRef, useState, useCallback } from "react";
import { RealTimeDrawingManager } from "../collaboration/RealTimeDrawingManager";

interface CanvasThumbnailNavigatorProps {
  manager: RealTimeDrawingManager | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  width?: number;
  height?: number;
}

/**
 * 캔버스 미리보기 네비게이션 컴포넌트
 * 전체 캔버스 구조를 작은 미리보기로 보여주고, 클릭하면 해당 위치로 스크롤 이동
 */
export const CanvasThumbnailNavigator: React.FC<CanvasThumbnailNavigatorProps> = ({
  manager: propManager,
  containerRef: propContainerRef,
  width = 400, // 더 크게 설정하여 전체 내용이 보이도록
  height = 600,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbnailImageRef = useRef<HTMLImageElement | null>(null);
  const [isVisible, setIsVisible] = useState(false); // 초기에는 숨김
  
  // isVisible 변경 감지 로그
  useEffect(() => {
    console.log("🟡 [미리보기] isVisible 상태 변경:", isVisible);
  }, [isVisible]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [activeManager, setActiveManager] = useState<RealTimeDrawingManager | null>(propManager);
  const [activeContainerRef, setActiveContainerRef] = useState<React.RefObject<HTMLDivElement | null>>(propContainerRef);
  const [hasGeneratedThumbnail, setHasGeneratedThumbnail] = useState(false); // 썸네일 생성 여부 추적

  // 썸네일을 한 번만 생성하는 함수
  const generateThumbnailOnce = useCallback((managerToUse: RealTimeDrawingManager) => {
    const canvasManager = managerToUse.getCanvasManager();
    if (!canvasManager) return;

    const size = canvasManager.getCanvasSize();
    setCanvasSize(size);

    // 실제 캔버스 이미지 추출 (원본 크기에 가깝게 고품질 썸네일 생성)
    // 캔버스 전체가 포함되도록 충분히 큰 크기로 설정
    const maxThumbnailWidth = width * 3;
    // 원본 비율을 유지하면서 높이 계산 (캔버스 전체가 포함되도록)
    const maxThumbnailHeight = size.height * (maxThumbnailWidth / size.width);
    const dataUrl = canvasManager.getThumbnailDataUrl(maxThumbnailWidth, maxThumbnailHeight);
    if (dataUrl) {
      setThumbnailDataUrl(dataUrl);
      setHasGeneratedThumbnail(true);
    }
  }, [width]);

  // 전역 이벤트 리스너: 캔버스 활성화 시 미리보기 생성
  useEffect(() => {
    const handleCanvasActivated = (e: CustomEvent) => {
      console.log("🟡 [미리보기] canvas-activated 이벤트 수신");
      const newManager = e.detail.manager;
      const newContainer = e.detail.container;
      
      // manager가 변경되었는지 확인
      const managerChanged = activeManager !== newManager;
      console.log("🟡 [미리보기] manager 변경 여부:", managerChanged);
      
      setActiveManager(newManager);
      setActiveContainerRef({ current: newContainer });
      
      // 캔버스 클릭 시 미리보기 표시
      console.log("🟡 [미리보기] setIsVisible(true) 호출");
      setIsVisible(true);
      
      // manager가 변경되었거나 썸네일이 없으면 생성
      if (managerChanged || !hasGeneratedThumbnail) {
        setHasGeneratedThumbnail(false); // 리셋하여 새로 생성
        if (newManager) {
          generateThumbnailOnce(newManager);
        }
      }
    };

    window.addEventListener('canvas-activated', handleCanvasActivated as EventListener);
    
    // 초기값 설정
    if (propManager) {
      setActiveManager(propManager);
      setActiveContainerRef(propContainerRef);
    }

    return () => {
      window.removeEventListener('canvas-activated', handleCanvasActivated as EventListener);
    };
  }, [propManager, propContainerRef, hasGeneratedThumbnail, generateThumbnailOnce, activeManager]);

  const manager = activeManager || propManager;
  const containerRef = activeContainerRef || propContainerRef;

  // 캔버스 크기 변경 감지 및 미리보기 업데이트 (manager 선언 이후)
  // 성능을 위해 interval 제거하고, 객체 변경 이벤트로 대체
  // useEffect(() => {
  //   if (!manager || !isVisible || !hasGeneratedThumbnail) return;
  //   // interval 제거 - 성능 문제로 인해 비활성화
  // }, [manager, isVisible, hasGeneratedThumbnail, canvasSize, generateThumbnailOnce]);

  // 썸네일 이미지는 한 번만 생성 (캔버스 클릭 시 generateThumbnailOnce에서 처리)
  // 주기적 업데이트 제거로 성능 개선

  // 미리보기 캔버스 그리기 (뷰포트 영역 표시)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef?.current;
    if (!canvas || !container || !thumbnailDataUrl || !isVisible) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 썸네일 이미지 로드
    const img = new Image();
    img.onload = () => {
      if (!canvas || !container) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 원본 이미지 비율에 맞춰 캔버스 크기 계산 (긴 이미지도 전체가 보이도록)
      const imgAspect = img.width / img.height;
      const targetWidth = width;
      const targetHeight = width / imgAspect; // 원본 비율 유지
      
      // 캔버스 크기 조정
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // 캔버스 초기화
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // 썸네일 이미지 그리기 (고품질 스케일링, 전체 이미지 표시)
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // 스케일 계산: 미리보기 캔버스에 그려진 크기와 원본 캔버스 크기의 비율
      // 이것이 가장 직접적이고 정확한 방법입니다
      // targetWidth, targetHeight는 미리보기 캔버스에 실제로 그려진 크기
      // canvasSize.width, canvasSize.height는 원본 PIXI 캔버스 크기
      const finalScaleX = targetWidth / canvasSize.width;
      const finalScaleY = targetHeight / canvasSize.height;

      // 뷰포트 영역 계산: 스크롤 위치를 미리보기 좌표로 변환
      // 스크롤 컨테이너의 scrollLeft/scrollTop은 PIXI 캔버스의 절대 좌표와 일치
      // 따라서 스크롤 위치 * 스케일 = 미리보기 좌표
      const viewportX = container.scrollLeft * finalScaleX;
      const viewportY = container.scrollTop * finalScaleY;
      const viewportWidth = container.clientWidth * finalScaleX;
      const viewportHeight = container.clientHeight * finalScaleY;
      
      // 뷰포트가 썸네일 영역을 벗어나지 않도록 제한
      const clampedViewportX = Math.max(0, Math.min(viewportX, targetWidth - Math.min(viewportWidth, targetWidth)));
      const clampedViewportY = Math.max(0, Math.min(viewportY, targetHeight - Math.min(viewportHeight, targetHeight)));
      const clampedViewportWidth = Math.min(viewportWidth, targetWidth - clampedViewportX);
      const clampedViewportHeight = Math.min(viewportHeight, targetHeight - clampedViewportY);

      // 뷰포트 영역 표시 (더 두껍고 명확하게)
      ctx.strokeStyle = "#2196F3";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(clampedViewportX, clampedViewportY, clampedViewportWidth, clampedViewportHeight);
      ctx.setLineDash([]);
      
      // 뷰포트 영역 배경 반투명 처리
      ctx.fillStyle = "rgba(33, 150, 243, 0.1)";
      ctx.fillRect(clampedViewportX, clampedViewportY, clampedViewportWidth, clampedViewportHeight);
      
      // 디버깅: 좌표 정보 표시
      ctx.fillStyle = "#FF0000";
      ctx.font = "10px monospace";
      ctx.textBaseline = "top";
      const debugText = [
        `Scroll: (${Math.round(container.scrollLeft)}, ${Math.round(container.scrollTop)})`,
        `Canvas: ${canvasSize.width}x${canvasSize.height}`,
        `Display: ${targetWidth.toFixed(0)}x${targetHeight.toFixed(0)}`,
        `Scale: ${finalScaleX.toFixed(4)}`,
        `Viewport: (${Math.round(clampedViewportX)}, ${Math.round(clampedViewportY)})`,
        `Size: ${Math.round(clampedViewportWidth)}x${Math.round(clampedViewportHeight)}`,
      ];
      debugText.forEach((text, i) => {
        ctx.fillText(text, clampedViewportX + 5, clampedViewportY + 5 + i * 12);
      });
    };
    img.src = thumbnailDataUrl;
    thumbnailImageRef.current = img;
  }, [thumbnailDataUrl, canvasSize, width, height, containerRef, isVisible]);

  // 스크롤 위치 업데이트 시 뷰포트 표시만 업데이트 (성능 최적화)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !thumbnailDataUrl || !isVisible) return;

    let scrollTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      // 쓰로틀링: 스크롤 이벤트를 200ms마다 한 번만 처리
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
      const canvas = canvasRef.current;
      const img = thumbnailImageRef.current;
      if (!canvas || !img || !container) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 이미지가 이미 그려져 있으므로, 뷰포트 표시만 업데이트
      // 전체를 다시 그리지 않고, 뷰포트 영역만 다시 그리기
      const imgAspect = img.width / img.height;
      const targetWidth = width;
      const targetHeight = width / imgAspect;
      
      // 이전 뷰포트 영역 지우기 (전체를 다시 그리는 대신, 이전 뷰포트 영역만 복원)
      // 성능을 위해 이미지 영역만 다시 그리기
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      
      // 이미지 영역만 다시 그리기 (뷰포트 표시를 위해)
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // 스케일 계산: 미리보기 캔버스에 그려진 크기와 원본 캔버스 크기의 비율
      // 이것이 가장 직접적이고 정확한 방법입니다
      const finalScaleX = targetWidth / canvasSize.width;
      const finalScaleY = targetHeight / canvasSize.height;

      // 뷰포트 영역 계산 (스크롤 위치 기준)
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      const clientWidth = container.clientWidth;
      const clientHeight = container.clientHeight;
      
      // 스크롤 위치를 미리보기 좌표로 변환
      const viewportX = scrollLeft * finalScaleX;
      const viewportY = scrollTop * finalScaleY;
      const viewportWidth = clientWidth * finalScaleX;
      const viewportHeight = clientHeight * finalScaleY;
      
      // 뷰포트가 썸네일 영역을 벗어나지 않도록 제한
      const clampedViewportX = Math.max(0, Math.min(viewportX, targetWidth - Math.min(viewportWidth, targetWidth)));
      const clampedViewportY = Math.max(0, Math.min(viewportY, targetHeight - Math.min(viewportHeight, targetHeight)));
      const clampedViewportWidth = Math.min(viewportWidth, targetWidth - clampedViewportX);
      const clampedViewportHeight = Math.min(viewportHeight, targetHeight - clampedViewportY);

      // 뷰포트 영역 표시 (더 두껍고 명확하게)
      ctx.strokeStyle = "#2196F3";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(clampedViewportX, clampedViewportY, clampedViewportWidth, clampedViewportHeight);
      ctx.setLineDash([]);
      
      // 뷰포트 영역 배경 반투명 처리
      ctx.fillStyle = "rgba(33, 150, 243, 0.1)";
      ctx.fillRect(clampedViewportX, clampedViewportY, clampedViewportWidth, clampedViewportHeight);
      
      // 디버깅: 좌표 정보 표시
      ctx.fillStyle = "#FF0000";
      ctx.font = "10px monospace";
      ctx.textBaseline = "top";
      const debugText = [
        `Scroll: (${Math.round(scrollLeft)}, ${Math.round(scrollTop)})`,
        `Canvas: ${canvasSize.width}x${canvasSize.height}`,
        `Img: ${img.width}x${img.height}`,
        `Display: ${targetWidth.toFixed(0)}x${targetHeight.toFixed(0)}`,
        `Scale: ${finalScaleX.toFixed(4)}`,
        `Calc: ${Math.round(scrollLeft)} * ${finalScaleX.toFixed(4)} = ${(scrollLeft * finalScaleX).toFixed(1)}`,
        `Viewport: (${Math.round(clampedViewportX)}, ${Math.round(clampedViewportY)})`,
        `Size: ${Math.round(clampedViewportWidth)}x${Math.round(clampedViewportHeight)}`,
      ];
      debugText.forEach((text, i) => {
        ctx.fillText(text, clampedViewportX + 5, clampedViewportY + 5 + i * 12);
      });
      
      ctx.restore();
      }, 200); // 100ms -> 200ms로 변경하여 성능 개선
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [thumbnailDataUrl, canvasSize, width, height, containerRef, isVisible]);

  // 미리보기 클릭 시 해당 위치로 스크롤 이동
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = thumbnailImageRef.current;
    if (!canvas || !container || !img || canvasSize.width === 0 || canvasSize.height === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 이미지가 실제로 그려진 영역 계산 (비율 유지)
    const imgAspect = img.width / img.height;
    const targetWidth = width;
    const targetHeight = width / imgAspect;

    // 클릭한 위치가 이미지 영역 내인지 확인
    if (x < 0 || x > targetWidth || y < 0 || y > targetHeight) {
      return; // 이미지 영역 밖 클릭은 무시
    }

    // 스케일 계산 (실제 그려진 이미지 영역 기준)
    // targetWidth, targetHeight는 미리보기 캔버스에 실제로 그려진 크기
    const scaleX = targetWidth / canvasSize.width;
    const scaleY = targetHeight / canvasSize.height;
    // 비율이 다를 수 있으므로 각각 계산
    const actualX = x / scaleX;
    const actualY = y / scaleY;

    // 스크롤 이동 (뷰포트 중앙에 위치하도록)
    const scrollX = actualX - container.clientWidth / 2;
    const scrollY = actualY - container.clientHeight / 2;

    container.scrollTo({
      left: Math.max(0, scrollX),
      top: Math.max(0, scrollY),
      behavior: "smooth",
    });
  };

  // manager가 없으면 아무것도 렌더링하지 않음
  if (!manager) {
    return null;
  }

  // 미리보기가 닫혀있으면 열기 버튼만 표시
  if (!isVisible) {
    console.log("🟡 [미리보기] 렌더링: 닫힌 상태, 열기 버튼만 표시");
    return (
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 10000,
        }}
        onClick={(e) => {
          // 열기 버튼 영역 클릭 시에도 이벤트 전파 방지
          e.stopPropagation();
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            console.log("🟡 [미리보기] 열기 버튼 클릭");
            e.preventDefault();
            e.stopPropagation();
            setIsVisible(true);
          }}
          style={{
            padding: "8px 12px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
          title="미리보기 열기"
        >
          📋
        </button>
      </div>
    );
  }
  
  console.log("🟡 [미리보기] 렌더링: 열린 상태, 미리보기 패널 표시");

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        width: width + 20,
        padding: 10,
        backgroundColor: "white",
        border: "1px solid #ccc",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        zIndex: 10000,
        maxHeight: "calc(100vh - 40px)",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => {
        // 미리보기 영역 클릭 시 이벤트 전파 방지 (캔버스 클릭 이벤트와 충돌 방지)
        e.stopPropagation();
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: "bold" }}>
          캔버스 미리보기
        </div>
        <button
          type="button"
          onClick={(e) => {
            console.log("🟡 [미리보기] 닫기 버튼 onClick 이벤트 발생");
            e.preventDefault();
            e.stopPropagation();
            if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
              e.nativeEvent.stopImmediatePropagation();
            }
            console.log("🟡 [미리보기] 현재 isVisible:", isVisible);
            console.log("🟡 [미리보기] setIsVisible(false) 호출");
            setIsVisible(false);
            setHasGeneratedThumbnail(false); // 닫을 때 썸네일 리셋
            setThumbnailDataUrl(null); // 썸네일 데이터도 제거
            console.log("🟡 [미리보기] 닫기 완료");
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
              e.nativeEvent.stopImmediatePropagation();
            }
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
              e.nativeEvent.stopImmediatePropagation();
            }
          }}
          style={{
            padding: "2px 6px",
            backgroundColor: "transparent",
            color: "#666",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            pointerEvents: "auto",
            zIndex: 10001,
          }}
          title="미리보기 닫기"
        >
          ×
        </button>
      </div>
      <div
        style={{
          overflow: "auto",
          maxHeight: "calc(100vh - 100px)",
          flex: 1,
        }}
      >
        {thumbnailDataUrl ? (
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onClick={handleClick}
            style={{
              cursor: "pointer",
              border: "1px solid #ddd",
              borderRadius: 4,
              display: "block",
              width: width,
              height: "auto",
              maxWidth: width,
            }}
          />
        ) : (
          <div
            style={{
              width: width,
              minHeight: height,
              border: "1px solid #ddd",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f5f5f5",
              color: "#999",
              fontSize: 12,
            }}
          >
            로딩 중...
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: "#666", marginTop: 8 }}>
        클릭하여 해당 위치로 이동
      </div>
    </div>
  );
};
