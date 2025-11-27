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
  width = 340, // 기본 가로 크기
  height = 450, // 기본 세로 크기
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
  const [previewWidth, setPreviewWidth] = useState(width); // 사용자가 조절할 수 있는 미리보기 가로 크기
  const [previewHeight, setPreviewHeight] = useState(height); // 사용자가 조절할 수 있는 미리보기 세로 크기

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
  const generateThumbnailOnce = useCallback(async (managerToUse: RealTimeDrawingManager, retryCount = 0) => {
    const canvasManager = managerToUse.getCanvasManager();
    if (!canvasManager) {
      // 재시도: 캔버스 매니저가 아직 준비되지 않았을 수 있음
      if (retryCount < 3) {
        setTimeout(async () => {
          await generateThumbnailOnce(managerToUse, retryCount + 1);
        }, 200);
      }
      return;
    }

    // 캔버스가 준비될 때까지 대기
    if (!canvasManager.isReady()) {
      if (retryCount < 5) {
        try {
          await canvasManager.waitForInitialization();
          await generateThumbnailOnce(managerToUse, retryCount + 1);
        } catch {
          if (retryCount < 5) {
            setTimeout(async () => {
              await generateThumbnailOnce(managerToUse, retryCount + 1);
            }, 300);
          }
        }
      }
      return;
    }

    const size = canvasManager.getCanvasSize();
    if (size.width === 0 || size.height === 0) {
      // 캔버스 크기가 0이면 재시도
      if (retryCount < 3) {
        setTimeout(async () => {
          await generateThumbnailOnce(managerToUse, retryCount + 1);
        }, 200);
      }
      return;
    }
    
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
    // 썸네일은 고정 크기(340)로 생성하여 미리보기 창 크기와 무관하게 유지
    const dpr = window.devicePixelRatio || 1;
    const fixedThumbnailWidth = 340; // 썸네일 생성 시 고정 크기
    // 해상도 개선: 배율을 10배에서 20배로 증가 (타일링이 자동으로 처리)
    const maxThumbnailWidth = fixedThumbnailWidth * 20 * dpr; // 고해상도로 생성
    
    // 원본 비율을 유지하면서 높이 계산 (캔버스 전체가 포함되도록)
    // 타일링 방식이 자동으로 처리하므로 높이 제한을 완화하여 해상도 개선
    const calculatedHeight = size.height * (maxThumbnailWidth / size.width);
    // 타일링이 처리하므로 높이 제한을 크게 설정 (해상도 개선)
    const MAX_THUMBNAIL_HEIGHT = 8000; // 썸네일 최대 높이 제한 (타일링으로 처리)
    
    let finalThumbnailWidth = maxThumbnailWidth;
    let maxThumbnailHeight = calculatedHeight;
    
    // 높이가 제한을 초과하는 경우, 높이를 제한하고 너비를 비율에 맞춰 조정
    // 타일링 방식이 자동으로 처리하므로 높이만 제한
    if (calculatedHeight > MAX_THUMBNAIL_HEIGHT) {
      maxThumbnailHeight = MAX_THUMBNAIL_HEIGHT;
      // 너비는 원본 비율 유지하면서 조정
      finalThumbnailWidth = maxThumbnailHeight * (size.width / size.height);
    }
    
    // 렌더링 강제 업데이트 후 썸네일 생성
    try {
      // 큰 캔버스의 경우 렌더링 완료를 더 확실하게 보장
      const app = (canvasManager as any).app;
      if (app && app.renderer && app.stage) {
        // 렌더링 강제 업데이트
        app.renderer.render(app.stage);
        // 큰 캔버스의 경우 추가 대기 시간
        if (size.height > 10000) {
          await new Promise(resolve => setTimeout(resolve, 500));
          app.renderer.render(app.stage);
        }
      }
      
      const dataUrl = canvasManager.getThumbnailDataUrl(finalThumbnailWidth, maxThumbnailHeight);
      if (dataUrl && dataUrl !== "data:," && dataUrl.length > 100) {
        setThumbnailDataUrl(dataUrl);
        setHasGeneratedThumbnail(true);
      } else {
        // 썸네일 생성 실패 시 재시도 (큰 캔버스의 경우 더 많은 재시도)
        const maxRetries = size.height > 10000 ? 5 : 3;
        const retryDelay = size.height > 10000 ? 500 : 300;
        
        if (retryCount < maxRetries) {
          console.warn(`썸네일 생성 실패 (재시도 ${retryCount + 1}/${maxRetries}):`, {
            size: `${size.width}x${size.height}`,
            dataUrl: dataUrl ? `유효하지 않음 (길이: ${dataUrl.length})` : 'null'
          });
          setTimeout(async () => {
            await generateThumbnailOnce(managerToUse, retryCount + 1);
          }, retryDelay);
        } else {
          console.error("썸네일 생성 실패: 최대 재시도 횟수 초과", {
            size: `${size.width}x${size.height}`,
            thumbnailSize: `${finalThumbnailWidth}x${maxThumbnailHeight}`,
            dataUrl: dataUrl ? `유효하지 않음 (길이: ${dataUrl.length})` : 'null'
          });
        }
      }
    } catch (error) {
      console.error("썸네일 생성 중 오류:", error, {
        size: `${size.width}x${size.height}`,
        retryCount
      });
      // 오류 발생 시 재시도 (큰 캔버스의 경우 더 많은 재시도)
      const maxRetries = size.height > 10000 ? 5 : 3;
      const retryDelay = size.height > 10000 ? 500 : 300;
      
      if (retryCount < maxRetries) {
        setTimeout(async () => {
          await generateThumbnailOnce(managerToUse, retryCount + 1);
        }, retryDelay);
      } else {
        console.error("썸네일 생성 실패: 최대 재시도 횟수 초과 (오류)", error);
      }
    }
  }, []); // previewWidth 제거 - 썸네일은 고정 크기로 생성

  // 전역 이벤트 리스너: 캔버스 활성화 시 미리보기 생성
  useEffect(() => {
    const handleCanvasActivated = (e: CustomEvent) => {
      // 수동으로 닫은 경우에는 다시 열지 않음
      if (isManuallyClosedRef.current) {
        return;
      }
      
      const newManager = e.detail.manager;
      const newContainer = e.detail.container;
      
      // propManager와 일치하는 경우에만 처리 (같은 브라우저의 manager만)
      // propManager가 없으면 이 이벤트를 무시 (각 브라우저는 자신의 propManager를 가져야 함)
      if (!propManager || propManager !== newManager) {
        // 다른 브라우저의 이벤트는 조용히 무시 (로그 제거로 스팸 방지)
        return;
      }
      
      // manager가 변경되었는지 확인
      const managerChanged = activeManager !== newManager;
      
      setActiveManager(newManager);
      // activeContainerRef는 propManager와 일치하는 경우에만 업데이트
      // (실제로는 propContainerRef를 사용하므로 참고용)
      setActiveContainerRef({ current: newContainer });
      
      // 캔버스 클릭 시 미리보기 표시
      setIsVisible(true);
      
      // manager가 변경되었거나 썸네일이 없으면 생성
      if (managerChanged || !hasGeneratedThumbnail) {
        setHasGeneratedThumbnail(false); // 리셋하여 새로 생성
        if (newManager) {
          generateThumbnailOnce(newManager).catch(err => {
            console.error("썸네일 생성 실패:", err);
          });
        }
      }
    };

    // 캔버스 초기화 완료 시 미리보기 자동 표시
    const handleCanvasInitialized = (e: CustomEvent) => {
      // 수동으로 닫은 경우에는 다시 열지 않음
      if (isManuallyClosedRef.current) {
        return;
      }
      
      const newManager = e.detail.manager;
      const newContainer = e.detail.container;
      
      // propManager와 일치하는 경우에만 처리
      if (propManager && propManager === newManager) {
        setActiveManager(newManager);
        setActiveContainerRef({ current: newContainer });
        
        // 미리보기 자동 표시
        setIsVisible(true);
        
        // 썸네일 생성
        if (!hasGeneratedThumbnail) {
          setHasGeneratedThumbnail(false);
          generateThumbnailOnce(newManager).catch(err => {
            console.error("썸네일 생성 실패:", err);
          });
        }
      }
    };

    // 캔버스 내용 업데이트 시 썸네일 자동 갱신
    const handleCanvasContentUpdated = (e: CustomEvent) => {
      const updatedManager = e.detail.manager;
      const updatedContainer = e.detail.container;
      
      // propManager와 일치하는 경우에만 갱신 (같은 브라우저의 manager만)
      // propManager가 없으면 이 이벤트를 무시 (각 브라우저는 자신의 propManager를 가져야 함)
      if (!propManager || propManager !== updatedManager || isManuallyClosedRef.current) {
        return;
      }
      
      // 썸네일 갱신
      setHasGeneratedThumbnail(false);
      generateThumbnailOnce(updatedManager).catch(err => {
        console.error("썸네일 갱신 실패:", err);
      });
    };

    window.addEventListener('canvas-activated', handleCanvasActivated as EventListener);
    window.addEventListener('canvas-initialized', handleCanvasInitialized as EventListener);
    window.addEventListener('canvas-content-updated', handleCanvasContentUpdated as EventListener);
    
    // 초기값 설정
    if (propManager) {
      setActiveManager(propManager);
      setActiveContainerRef(propContainerRef);
    }

    return () => {
      window.removeEventListener('canvas-activated', handleCanvasActivated as EventListener);
      window.removeEventListener('canvas-initialized', handleCanvasInitialized as EventListener);
      window.removeEventListener('canvas-content-updated', handleCanvasContentUpdated as EventListener);
    };
  }, [propManager, propContainerRef, hasGeneratedThumbnail, generateThumbnailOnce, activeManager]);

  // propManager가 있고 썸네일이 없으면 자동으로 생성
  useEffect(() => {
    if (propManager && !hasGeneratedThumbnail && !isManuallyClosedRef.current) {
      generateThumbnailOnce(propManager).catch(err => {
        console.error("썸네일 생성 실패:", err);
      });
      setIsVisible(true);
    }
  }, [propManager, hasGeneratedThumbnail, generateThumbnailOnce]);

  const manager = activeManager || propManager;
  // propContainerRef를 우선 사용 (각 브라우저의 올바른 컨테이너)
  // activeContainerRef는 전역 이벤트로 설정되므로 다른 브라우저의 컨테이너일 수 있음
  const containerRef = propContainerRef || activeContainerRef;

  // 디버깅: propContainerRef 변경 감지 (필터링: "THUMBNAIL_INIT")
  useEffect(() => {
    console.log("[THUMBNAIL_INIT] propContainerRef 상태:", {
      hasPropManager: !!propManager,
      hasPropContainerRef: !!propContainerRef,
      propContainerRefCurrent: propContainerRef?.current ? '있음' : '없음',
      containerScrollable: propContainerRef?.current ? {
        scrollWidth: propContainerRef.current.scrollWidth,
        scrollHeight: propContainerRef.current.scrollHeight,
        clientWidth: propContainerRef.current.clientWidth,
        clientHeight: propContainerRef.current.clientHeight,
        overflow: window.getComputedStyle(propContainerRef.current).overflow,
      } : null,
    });
  }, [propContainerRef, propManager]); // propContainerRef 변경 시마다

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
      const maxWidth = previewWidth;
      const containerHeight = container?.clientHeight || previewHeight || 800;
      const maxHeight = Math.max(containerHeight, previewHeight);
      
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
      // 썸네일 이미지는 고정 크기(340)로 생성되었으므로, 표시 크기도 고정
      const fixedThumbnailDisplayWidth = 340; // 썸네일 고정 표시 크기
      const fixedThumbnailDisplayHeight = fixedThumbnailDisplayWidth / imgAspect;
      
      // 한 번 설정되면 변경되지 않도록 함
      if (thumbnailDisplaySize.width === 0 || thumbnailDisplaySize.height === 0) {
        setThumbnailDisplaySize({ width: fixedThumbnailDisplayWidth, height: fixedThumbnailDisplayHeight });
        fixedDisplaySizeRef.current = { width: fixedThumbnailDisplayWidth, height: fixedThumbnailDisplayHeight };
      }
      
      // 캔버스 크기 조정 (고해상도) - 썸네일 고정 크기 사용
      const fixedCanvasWidth = fixedThumbnailDisplayWidth * dpr * 2;
      const fixedCanvasHeight = fixedThumbnailDisplayHeight * dpr * 2;
      if (canvas.width !== fixedCanvasWidth || canvas.height !== fixedCanvasHeight) {
        canvas.width = fixedCanvasWidth;
        canvas.height = fixedCanvasHeight;
      }
      
      // CSS 크기는 썸네일 고정 크기로 설정
      if (canvas.style.width !== `${fixedThumbnailDisplayWidth}px` || canvas.style.height !== `${fixedThumbnailDisplayHeight}px`) {
        canvas.style.width = `${fixedThumbnailDisplayWidth}px`;
        canvas.style.height = `${fixedThumbnailDisplayHeight}px`;
      }

      // 고해상도 렌더링을 위한 스케일 적용 (DPR × 2)
      // 스케일은 매번 리셋하고 다시 적용
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 리셋
      ctx.scale(dpr * 2, dpr * 2);
      
      // 캔버스 초기화 (고정 썸네일 크기만큼)
      ctx.clearRect(0, 0, fixedThumbnailDisplayWidth, fixedThumbnailDisplayHeight);

      // 썸네일 이미지를 고정 크기에 맞춰 그리기 (고해상도)
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img, 
        0, 0, img.width, img.height, 
        0, 0, fixedThumbnailDisplayWidth, fixedThumbnailDisplayHeight
      );
      

      // CanvasCoordinateConverter를 사용하여 정확한 좌표 변환
      // 중요: 썸네일 이미지의 실제 크기(img.width, img.height)를 기준으로 변환해야 함
      // 썸네일 이미지가 캔버스를 캡처했으므로, 이미지 크기와 캔버스 크기의 비율을 사용
      if (canvasSize.width > 0 && canvasSize.height > 0 && img.width > 0 && img.height > 0) {
        // 컨버터는 고정 썸네일 크기를 기준으로 생성
        const converter = new CanvasCoordinateConverter(
          { width: canvasSize.width, height: canvasSize.height },
          { width: fixedThumbnailDisplayWidth, height: fixedThumbnailDisplayHeight }
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
        
        // 뷰포트가 썸네일 영역을 벗어나지 않도록 제한 (고정 썸네일 크기 기준)
        const clampedViewportX = Math.max(0, Math.min(viewportX, fixedThumbnailDisplayWidth - Math.min(viewportWidth, fixedThumbnailDisplayWidth)));
        const clampedViewportY = Math.max(0, Math.min(viewportY, fixedThumbnailDisplayHeight - Math.min(viewportHeight, fixedThumbnailDisplayHeight)));
        const clampedViewportWidth = Math.min(viewportWidth, fixedThumbnailDisplayWidth - clampedViewportX);
        const clampedViewportHeight = Math.min(viewportHeight, fixedThumbnailDisplayHeight - clampedViewportY);

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
          `Display: ${fixedThumbnailDisplayWidth.toFixed(0)}x${fixedThumbnailDisplayHeight.toFixed(0)}`,
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
  }, [thumbnailDataUrl, canvasSize, previewWidth, previewHeight, containerRef, isVisible]);

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
      // 고정된 썸네일 크기 사용 (340)
      const fixedThumbnailDisplayWidth = 340;
      const imgAspect = img.width / img.height;
      const fixedThumbnailDisplayHeight = fixedThumbnailDisplayWidth / imgAspect;
      
      if (imgAspect === 0 || isNaN(imgAspect) || !isFinite(imgAspect)) return;
      
      // 뷰포트 오버레이만 업데이트
      // 이미지 크기나 캔버스 크기를 절대 변경하지 않음
      ctx.save();
      
      // 고해상도 렌더링을 위한 devicePixelRatio 고려
      const dpr = window.devicePixelRatio || 1;
      // 기존 스케일을 유지하고 뷰포트만 그리기
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 리셋
      ctx.scale(dpr * 2, dpr * 2);
      
      // 이미지 크기가 변경되지 않도록 고정된 썸네일 크기 사용
      const fixedDisplayWidth = fixedThumbnailDisplayWidth;
      const fixedDisplayHeight = fixedThumbnailDisplayHeight;
      
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
          `Display: ${fixedDisplayWidth.toFixed(0)}x${fixedDisplayHeight.toFixed(0)}`,
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
  }, [thumbnailDataUrl, canvasSize, previewWidth, previewHeight, containerRef, isVisible, thumbnailDisplaySize]);

  // 미리보기 클릭 시 해당 위치로 스크롤 이동
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = canvasRef.current;
    // prop으로 전달받은 containerRef만 사용 (각 브라우저의 올바른 컨테이너)
    // activeContainerRef는 전역 이벤트로 설정되므로 다른 브라우저의 컨테이너일 수 있어 사용하지 않음
    const container = propContainerRef?.current;
    const converter = coordinateConverterRef.current;
    const currentManager = propManager;
    
    // 필터링 가능한 로그 태그: "THUMBNAIL_CLICK"
    if (!canvas || !container || !converter || !currentManager || canvasSize.width === 0 || canvasSize.height === 0) {
      console.warn("[THUMBNAIL_CLICK] ❌ 클릭 실패:", {
        hasCanvas: !!canvas,
        hasContainer: !!container,
        hasConverter: !!converter,
        hasManager: !!currentManager,
        canvasSize: `${canvasSize.width}x${canvasSize.height}`,
        propContainerRefNull: !propContainerRef,
        propContainerRefCurrentNull: !propContainerRef?.current,
        propManagerNull: !propManager,
      });
      return;
    }
    
    console.log("[THUMBNAIL_CLICK] ✅ 클릭 시작:", {
      containerScrollWidth: container.scrollWidth,
      containerScrollHeight: container.scrollHeight,
      containerClientWidth: container.clientWidth,
      containerClientHeight: container.clientHeight,
      containerScrollLeft: container.scrollLeft,
      containerScrollTop: container.scrollTop,
    });

    // 실제 미리보기에 그려진 크기 사용 (디스플레이 크기)
    const { width: displayWidth, height: displayHeight } = thumbnailDisplaySize;

    if (displayWidth === 0 || displayHeight === 0 || canvasSize.width === 0 || canvasSize.height === 0) {
      console.warn("[THUMBNAIL_CLICK] ⚠️ 크기 정보가 0 - 조기 반환");
      return;
    }

    // 간단하고 명확한 좌표 변환 방식
    // 1. 썸네일 내 클릭 좌표 구하기 (보이는 영역 기준)
    const rect = canvas.getBoundingClientRect();
    
    // 썸네일 캔버스의 부모 스크롤 컨테이너 찾기
    let thumbnailScrollContainer: HTMLElement | null = null;
    let parent: HTMLElement | null = canvas.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflow === 'auto' || style.overflow === 'scroll' || 
          style.overflowY === 'auto' || style.overflowY === 'scroll') {
        thumbnailScrollContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }
    
    // 클릭 좌표 계산: 보이는 영역 기준
    // rect는 캔버스의 실제 위치를 반환하지만, 스크롤된 상태에서는 음수일 수 있음
    // 클릭 좌표는 보이는 영역 기준으로만 계산
    let clickX = e.clientX - rect.left;
    let clickY = e.clientY - rect.top;
    
    // 클릭 좌표를 디스플레이 크기 기준으로 정규화
    // rect.width/height는 전체 캔버스 크기일 수 있으므로, 
    // 디스플레이 크기(보이는 영역) 기준으로 변환해야 함
    // 클릭한 위치를 디스플레이 크기 범위(0 ~ displayWidth/Height)로 정규화
    const normalizeX = (clickX / Math.max(rect.width, displayWidth)) * displayWidth;
    const normalizeY = (clickY / Math.max(rect.height, displayHeight)) * displayHeight;
    
    // 디스플레이 크기 내로 제한 (보이는 영역만 고려)
    clickX = Math.max(0, Math.min(normalizeX, displayWidth));
    clickY = Math.max(0, Math.min(normalizeY, displayHeight));
    
    // 2. 썸네일과 실제 컨테이너의 비율 계산
    // 썸네일 높이 대비 실제 컨테이너 높이의 비율
    const scrollRatioX = container.scrollWidth / displayWidth;
    const scrollRatioY = container.scrollHeight / displayHeight;
    
    // 3. 실제 캔버스에서의 목표 위치 계산 (비율 곱하기)
    const targetScrollX = clickX * scrollRatioX;
    const targetScrollY = clickY * scrollRatioY;
    
    // 4. 클릭한 지점이 화면 중앙에 오도록 보정
    // (목표 위치 - 뷰포트 크기의 절반)
    const centeredScrollX = targetScrollX - (container.clientWidth / 2);
    const centeredScrollY = targetScrollY - (container.clientHeight / 2);
    
    // 5. 스크롤 범위 체크 및 최종 값 계산
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const finalScrollLeft = Math.max(0, Math.min(centeredScrollX, maxScrollLeft));
    const finalScrollTop = Math.max(0, Math.min(centeredScrollY, maxScrollTop));
    
    console.log("[THUMBNAIL_CLICK] 클릭 좌표 계산:", {
      클릭좌표: `(${Math.round(clickX)}, ${Math.round(clickY)})`,
      디스플레이크기: `${displayWidth}x${displayHeight}`,
      컨테이너크기: `${container.scrollWidth}x${container.scrollHeight}`,
      비율: `(${scrollRatioX.toFixed(2)}, ${scrollRatioY.toFixed(2)})`,
      목표스크롤: `(${Math.round(targetScrollX)}, ${Math.round(targetScrollY)})`,
      중앙보정: `(${Math.round(centeredScrollX)}, ${Math.round(centeredScrollY)})`,
      최종스크롤: `(${Math.round(finalScrollLeft)}, ${Math.round(finalScrollTop)})`,
    });

    // 스크롤 실행 (smooth 스크롤 사용)
    container.scrollTo({
      left: finalScrollLeft,
      top: finalScrollTop,
      behavior: 'smooth' // 부드럽게 이동
    });
    
    // smooth 스크롤은 애니메이션으로 이동하므로 즉시 값이 변경되지 않음
    // 따라서 스크롤 검증 로직은 제거 (정상 동작하므로 불필요)
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
        width: previewWidth + 40, // 패딩 포함하여 가로 크기 확대
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
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {/* 크기 조절 버튼 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPreviewWidth(prev => Math.min(prev + 20, 500));
                setPreviewHeight(prev => {
                  const newWidth = Math.min(prev + 20, 500);
                  // 비율 유지 (기본 340:450 비율)
                  return Math.min(newWidth * (450 / 340), 500);
                });
                // 썸네일은 재생성하지 않음 - 표시 크기만 변경
              }}
              style={{
                padding: "2px 6px",
                backgroundColor: "#f0f0f0",
                color: "#666",
                border: "1px solid #ccc",
                borderRadius: 2,
                cursor: "pointer",
                fontSize: 10,
                lineHeight: 1,
              }}
              title="크기 확대"
            >
              +
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPreviewWidth(prev => Math.max(prev - 20, 200));
                setPreviewHeight(prev => {
                  const newWidth = Math.max(prev - 20, 200);
                  // 비율 유지 (기본 340:450 비율)
                  return Math.max(newWidth * (450 / 340), 200);
                });
                // 썸네일은 재생성하지 않음 - 표시 크기만 변경
              }}
              style={{
                padding: "2px 6px",
                backgroundColor: "#f0f0f0",
                color: "#666",
                border: "1px solid #ccc",
                borderRadius: 2,
                cursor: "pointer",
                fontSize: 10,
                lineHeight: 1,
              }}
              title="크기 축소"
            >
              −
            </button>
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
              width: thumbnailDisplaySize.width > 0 ? `${thumbnailDisplaySize.width}px` : "340px",
              height: thumbnailDisplaySize.height > 0 ? `${thumbnailDisplaySize.height}px` : "auto",
              maxWidth: "100%",
              imageRendering: "auto",
            }}
          />
        ) : (
          <div
            style={{
              width: previewWidth,
              minHeight: previewHeight,
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
