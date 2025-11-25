import React, { useEffect, useRef, useState, useCallback } from "react";
import { RealTimeDrawingManager } from "../collaboration/RealTimeDrawingManager";
import { CanvasCoordinateConverter } from "../utils/canvasCoordinateConverter";

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
  width = 600, // 가로 크기 확대 (400 → 600)
  height = 800, // 세로 크기 확대 (600 → 800)
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbnailImageRef = useRef<HTMLImageElement | null>(null);
  const [isVisible, setIsVisible] = useState(false); // 초기에는 숨김
  
  // isVisible 상태 추적 (디버깅용 로그 제거)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [activeManager, setActiveManager] = useState<RealTimeDrawingManager | null>(propManager);
  const [activeContainerRef, setActiveContainerRef] = useState<React.RefObject<HTMLDivElement | null>>(propContainerRef);
  const [hasGeneratedThumbnail, setHasGeneratedThumbnail] = useState(false); // 썸네일 생성 여부 추적
  const isManuallyClosedRef = useRef(false); // 수동으로 닫았는지 추적
  const [thumbnailDisplaySize, setThumbnailDisplaySize] = useState({ width: 0, height: 0 }); // 실제 미리보기에 그려진 크기
  const coordinateConverterRef = useRef<CanvasCoordinateConverter | null>(null);
  const contentOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // 실제 내용 범위의 오프셋
  const fixedDisplaySizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 }); // 고정된 디스플레이 크기 (변경되지 않음)

  // 캔버스 크기나 미리보기 크기 변경 시 컨버터 업데이트
  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0 && thumbnailDisplaySize.width > 0 && thumbnailDisplaySize.height > 0) {
      if (coordinateConverterRef.current) {
        coordinateConverterRef.current.updateCanvasSize(canvasSize);
        coordinateConverterRef.current.updateThumbnailSize(thumbnailDisplaySize);
      } else {
        coordinateConverterRef.current = new CanvasCoordinateConverter(
          canvasSize,
          thumbnailDisplaySize
        );
      }
    }
  }, [canvasSize, thumbnailDisplaySize]);

  // 썸네일을 한 번만 생성하는 함수
  const generateThumbnailOnce = useCallback((managerToUse: RealTimeDrawingManager) => {
    const canvasManager = managerToUse.getCanvasManager();
    if (!canvasManager) return;

    const size = canvasManager.getCanvasSize();
    setCanvasSize(size);

    // 실제 내용 범위 계산하여 오프셋 설정
    const allBounds = canvasManager.getAllObjectsBounds();
    if (allBounds.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      
      allBounds.forEach(bound => {
        minX = Math.min(minX, bound.x);
        minY = Math.min(minY, bound.y);
      });
      
      // 실제 내용 범위의 오프셋 (최소 좌표)
      contentOffsetRef.current = { 
        x: Math.max(0, minX), 
        y: Math.max(0, minY) 
      };
      
    } else {
      // 내용이 없으면 오프셋은 (0, 0)
      contentOffsetRef.current = { x: 0, y: 0 };
    }
    

    // 실제 캔버스 이미지 추출 (고해상도 썸네일 생성)
    // devicePixelRatio를 고려하여 더 높은 해상도로 생성
    const dpr = window.devicePixelRatio || 1;
    const maxThumbnailWidth = width * 10 * dpr; // 고해상도로 생성 (4x → 10x)
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
      // 수동으로 닫은 경우에는 다시 열지 않음
      if (isManuallyClosedRef.current) {
        return;
      }
      
      const newManager = e.detail.manager;
      const newContainer = e.detail.container;
      
      // manager가 변경되었는지 확인
      const managerChanged = activeManager !== newManager;
      
      setActiveManager(newManager);
      setActiveContainerRef({ current: newContainer });
      
      // 캔버스 클릭 시 미리보기 표시
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

  // propManager가 있고 썸네일이 없으면 자동으로 생성
  useEffect(() => {
    if (propManager && !hasGeneratedThumbnail && !isManuallyClosedRef.current) {
      generateThumbnailOnce(propManager);
      setIsVisible(true);
    }
  }, [propManager, hasGeneratedThumbnail, generateThumbnailOnce]);

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
    img.onerror = () => {
      // 이미지 로드 실패 시 조용히 처리
    };
    img.onload = () => {
      if (!canvas || !container) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 컨테이너 크기 (스크롤 가능하도록 충분한 공간 확보)
      const maxWidth = width;
      const containerHeight = container?.clientHeight || height || 800;
      const maxHeight = Math.max(containerHeight, height);
      
      // 이미지 비율 유지하면서 표시 크기 계산
      const imgAspect = img.width / img.height;
      
      let displayWidth: number;
      let displayHeight: number;
      
      // 가로를 기준으로 세로 계산 (가로를 꽉 채움)
      displayWidth = maxWidth;
      displayHeight = maxWidth / imgAspect;
      
      // 세로가 너무 길면 스크롤 가능하도록 원본 비율 유지
      
      // 고해상도 렌더링을 위한 devicePixelRatio 고려
      const dpr = window.devicePixelRatio || 1;
      
      // 실제 캔버스 크기는 디스플레이 크기 × DPR × 2 (더 높은 해상도)
      const canvasWidth = displayWidth * dpr * 2;
      const canvasHeight = displayHeight * dpr * 2;
      
      
      // 실제 미리보기에 그려진 크기 저장 (디스플레이 크기)
      // 한 번 설정되면 변경되지 않도록 함
      if (thumbnailDisplaySize.width === 0 || thumbnailDisplaySize.height === 0) {
        setThumbnailDisplaySize({ width: displayWidth, height: displayHeight });
        fixedDisplaySizeRef.current = { width: displayWidth, height: displayHeight };
      }
      
      // 캔버스 크기 조정 (고해상도) - 이미 설정되어 있으면 변경하지 않음
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }
      
      // CSS 크기는 디스플레이 크기로 설정 (이미지 비율에 맞춤) - 이미 설정되어 있으면 변경하지 않음
      if (canvas.style.width !== `${displayWidth}px` || canvas.style.height !== `${displayHeight}px`) {
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
      }

      // 고해상도 렌더링을 위한 스케일 적용 (DPR × 2)
      // 스케일은 매번 리셋하고 다시 적용
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 리셋
      ctx.scale(dpr * 2, dpr * 2);
      
      // 캔버스 초기화 (디스플레이 크기만큼)
      ctx.clearRect(0, 0, displayWidth, displayHeight);
      // 배경색 제거 (투명하게)
      // ctx.fillStyle = "#f0f0f0";
      // ctx.fillRect(0, 0, displayWidth, displayHeight);

      // 썸네일 이미지를 비율 유지하면서 디스플레이 크기에 맞춰 그리기 (고해상도)
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img, 
        0, 0, img.width, img.height, 
        0, 0, displayWidth, displayHeight
      );
      

      // CanvasCoordinateConverter를 사용하여 정확한 좌표 변환
      // 중요: 썸네일 이미지의 실제 크기(img.width, img.height)를 기준으로 변환해야 함
      // 썸네일 이미지가 캔버스를 캡처했으므로, 이미지 크기와 캔버스 크기의 비율을 사용
      if (canvasSize.width > 0 && canvasSize.height > 0 && img.width > 0 && img.height > 0) {
        // 컨버터는 디스플레이 크기를 기준으로 생성 (이미지 비율에 맞춘 크기)
        const converter = new CanvasCoordinateConverter(
          { width: canvasSize.width, height: canvasSize.height },
          { width: displayWidth, height: displayHeight }
        );
        coordinateConverterRef.current = converter;
        

        // 뷰포트 영역 계산: 스크롤 위치를 미리보기 좌표로 변환
        const viewportThumbnail = converter.scrollToThumbnail(
          container.scrollLeft,
          container.scrollTop
        );
        const viewportSize = converter.viewportToThumbnailSize(
          container.clientWidth,
          container.clientHeight
        );
        
        const viewportX = viewportThumbnail.x;
        const viewportY = viewportThumbnail.y;
        const viewportWidth = viewportSize.width;
        const viewportHeight = viewportSize.height;
        
        // 디버깅: 변환된 뷰포트 좌표
        });
      
      // 뷰포트가 썸네일 영역을 벗어나지 않도록 제한 (디스플레이 크기 기준)
      const clampedViewportX = Math.max(0, Math.min(viewportX, displayWidth - Math.min(viewportWidth, displayWidth)));
      const clampedViewportY = Math.max(0, Math.min(viewportY, displayHeight - Math.min(viewportHeight, displayHeight)));
      const clampedViewportWidth = Math.min(viewportWidth, displayWidth - clampedViewportX);
      const clampedViewportHeight = Math.min(viewportHeight, displayHeight - clampedViewportY);

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
        const scale = converter.getScale();
        const debugText = [
          `Scroll: (${Math.round(container.scrollLeft)}, ${Math.round(container.scrollTop)})`,
          `Canvas: ${canvasSize.width}x${canvasSize.height}`,
          `Img: ${img.width}x${img.height}`,
          `Display: ${displayWidth.toFixed(0)}x${displayHeight.toFixed(0)}`,
          `Scale: ${scale.scaleX.toFixed(4)}x${scale.scaleY.toFixed(4)}`,
          `Viewport: (${Math.round(clampedViewportX)}, ${Math.round(clampedViewportY)})`,
          `Size: ${Math.round(clampedViewportWidth)}x${Math.round(clampedViewportHeight)}`,
        ];
        debugText.forEach((text, i) => {
          ctx.fillText(text, clampedViewportX + 5, clampedViewportY + 5 + i * 12);
        });
      }
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
      // 고정된 디스플레이 크기 사용 (절대 변경되지 않음)
      const { width: displayWidth, height: displayHeight } = fixedDisplaySizeRef.current;
      
      if (displayWidth === 0 || displayHeight === 0) return;
      
      // 뷰포트 오버레이만 업데이트
      // 이미지 크기나 캔버스 크기를 절대 변경하지 않음
      ctx.save();
      
      // 고해상도 렌더링을 위한 devicePixelRatio 고려
      const dpr = window.devicePixelRatio || 1;
      // 기존 스케일을 유지하고 뷰포트만 그리기
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 리셋
      ctx.scale(dpr * 2, dpr * 2);
      
      // 이미지 크기가 변경되지 않도록 고정된 크기 사용
      const fixedDisplayWidth = displayWidth;
      const fixedDisplayHeight = displayHeight;
      
      // 이전 뷰포트 영역을 지우기 위해 이미지를 다시 그리기 (크기는 절대 변경하지 않음)
      // 하지만 이미지 자체는 이미 그려져 있으므로, 뷰포트 오버레이만 업데이트
      // 이전 뷰포트를 지우고 새 뷰포트를 그리기 위해 이미지를 다시 그려야 함
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, fixedDisplayWidth, fixedDisplayHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // 이미지 크기는 절대 변경하지 않고 고정된 크기 사용
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, fixedDisplayWidth, fixedDisplayHeight);

      // CanvasCoordinateConverter를 사용하여 정확한 좌표 변환
      const converter = coordinateConverterRef.current;
      if (!converter || canvasSize.width === 0 || canvasSize.height === 0) {
        ctx.restore();
        return;
      }

      // 뷰포트 영역 계산 (스크롤 위치 기준)
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      const clientWidth = container.clientWidth;
      const clientHeight = container.clientHeight;
      
      // 스크롤 위치를 미리보기 좌표로 변환
      const viewportThumbnail = converter.scrollToThumbnail(scrollLeft, scrollTop);
      const viewportSize = converter.viewportToThumbnailSize(clientWidth, clientHeight);
      
      const viewportX = viewportThumbnail.x;
      const viewportY = viewportThumbnail.y;
      const viewportWidth = viewportSize.width;
      const viewportHeight = viewportSize.height;
      
      // 뷰포트가 썸네일 영역을 벗어나지 않도록 제한 (고정된 디스플레이 크기 기준)
      const clampedViewportX = Math.max(0, Math.min(viewportX, fixedDisplayWidth - Math.min(viewportWidth, fixedDisplayWidth)));
      const clampedViewportY = Math.max(0, Math.min(viewportY, fixedDisplayHeight - Math.min(viewportHeight, fixedDisplayHeight)));
      const clampedViewportWidth = Math.min(viewportWidth, fixedDisplayWidth - clampedViewportX);
      const clampedViewportHeight = Math.min(viewportHeight, fixedDisplayHeight - clampedViewportY);

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
      const scale = converter.getScale();
        const debugText = [
          `Scroll: (${Math.round(scrollLeft)}, ${Math.round(scrollTop)})`,
          `Canvas: ${canvasSize.width}x${canvasSize.height}`,
          `Img: ${img.width}x${img.height}`,
          `Display: ${displayWidth.toFixed(0)}x${displayHeight.toFixed(0)}`,
          `Scale: ${scale.scaleX.toFixed(4)}x${scale.scaleY.toFixed(4)}`,
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
  }, [thumbnailDataUrl, canvasSize, width, height, containerRef, isVisible, thumbnailDisplaySize]);

  // 미리보기 클릭 시 해당 위치로 스크롤 이동
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const converter = coordinateConverterRef.current;
    if (!canvas || !container || !converter || canvasSize.width === 0 || canvasSize.height === 0) return;

    // 클릭 좌표 계산 (CSS 크기 기준, DPR 고려 불필요)
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 실제 미리보기에 그려진 크기 사용 (디스플레이 크기)
    const { width: displayWidth, height: displayHeight } = thumbnailDisplaySize;

    // 클릭한 위치가 디스플레이 영역 내인지 확인
    if (displayWidth === 0 || displayHeight === 0) {
      return;
    }
    
    if (x < 0 || x > displayWidth || y < 0 || y > displayHeight) {
      return; // 디스플레이 영역 밖 클릭은 무시
    }

    // CanvasCoordinateConverter를 사용하여 정확한 좌표 변환
    // 썸네일이 실제 내용 범위만 포함하므로, contentOffset을 사용하지 않고 직접 변환
    // 썸네일 좌표를 캔버스 좌표로 변환 (썸네일은 전체 캔버스를 나타냄)
    const canvasCoord = converter.thumbnailToCanvas({ x, y });
    
    // 클릭한 위치가 뷰포트 중앙에 오도록 스크롤 위치 계산
    const scrollLeft = Math.max(0, Math.min(canvasCoord.x - container.clientWidth / 2, canvasSize.width - container.clientWidth));
    const scrollTop = Math.max(0, Math.min(canvasCoord.y - container.clientHeight / 2, canvasSize.height - container.clientHeight));
    
    const scrollPosition = { scrollLeft, scrollTop };

    // 스크롤 이동 (최소/최대값 제한)
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const finalScrollLeft = Math.max(0, Math.min(scrollPosition.scrollLeft, maxScrollLeft));
    const finalScrollTop = Math.max(0, Math.min(scrollPosition.scrollTop, maxScrollTop));

    // 즉시 스크롤 (smooth 스크롤이 문제를 일으킬 수 있음)
    container.scrollLeft = finalScrollLeft;
    container.scrollTop = finalScrollTop;
  };

  // manager가 없으면 아무것도 렌더링하지 않음
  if (!manager) {
    return null;
  }

  // 미리보기가 닫혀있으면 열기 버튼만 표시
  if (!isVisible) {
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
            e.preventDefault();
            e.stopPropagation();
            
            // 열기 버튼을 클릭하면 수동으로 닫은 플래그 해제
            isManuallyClosedRef.current = false;
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
  

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        width: width + 40, // 패딩 포함하여 가로 크기 확대
        padding: 20,
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
            e.preventDefault();
            e.stopPropagation();
            if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
              e.nativeEvent.stopImmediatePropagation();
            }
            
            // 수동으로 닫았다는 플래그 설정
            isManuallyClosedRef.current = true;
            setIsVisible(false);
            setHasGeneratedThumbnail(false); // 닫을 때 썸네일 리셋
            setThumbnailDataUrl(null); // 썸네일 데이터도 제거
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
          maxHeight: "calc(100vh - 120px)",
          flex: 1,
          position: "relative",
          width: "100%",
          minHeight: 400,
        }}
      >
        {thumbnailDataUrl ? (
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            style={{
              cursor: "pointer",
              border: "1px solid #ddd",
              borderRadius: 4,
              display: "block",
              width: thumbnailDisplaySize.width > 0 ? `${thumbnailDisplaySize.width}px` : `${width}px`,
              height: thumbnailDisplaySize.height > 0 ? `${thumbnailDisplaySize.height}px` : "auto",
              maxWidth: "100%",
              imageRendering: "auto",
              minWidth: `${width}px`,
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
