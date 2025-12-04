import { YjsDrawingManager, DrawingOperation, CanvasObject, BackgroundState } from "./YjsDrawingManager";
import { Canvas2DViewer } from "../canvas/Canvas2DViewer";
import { User } from "../types";

/**
 * Canvas 2D 기반 뷰어 매니저
 * 
 * Y.js 데이터를 받아서 Canvas 2D로 렌더링하는 경량 뷰어입니다.
 * 실시간 동기화는 Y.js를 통해 처리하며, 렌더링만 Canvas 2D로 수행합니다.
 */
export class CanvasViewerManager {
  private yjsManager: YjsDrawingManager;
  private viewer: Canvas2DViewer;
  private container: HTMLElement;
  private width: number;
  private height: number;
  private canvasWidth: number;
  private isInitialized: boolean = false;
  private allOperations: DrawingOperation[] = [];
  private allObjects: CanvasObject[] = [];
  private backgroundState: BackgroundState | null = null;
  private onCanvasSizeChange?: (size: { width: number; height: number }) => void;
  private isInitialLoadComplete: boolean = false; // 초기 로드 완료 플래그

  constructor(
    container: HTMLElement,
    user: User,
    serverUrl: string,
    roomId: string,
    width: number = 800,
    height: number = 600,
    canvasWidth: number = 690
  ) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.canvasWidth = canvasWidth;

    // Y.js 매니저 초기화 (읽기 전용)
    this.yjsManager = new YjsDrawingManager(user, serverUrl, roomId);

    // Canvas 2D 뷰어 초기화
    this.viewer = new Canvas2DViewer(container, width, height, canvasWidth);
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Y.js 이벤트 리스너 설정
    this.yjsManager.setOnDrawingUpdate((operations) => {
      // 초기 로드가 완료되지 않았으면 무시 (초기 로드에서 처리)
      if (!this.isInitialLoadComplete) {
        return;
      }

      // clear 작업 처리: 마지막 clear 이후의 작업만 사용
      let processedOperations = operations;
      let lastClearIndex = -1;
      for (let i = operations.length - 1; i >= 0; i--) {
        if (operations[i].type === "clear") {
          lastClearIndex = i;
          break;
        }
      }
      if (lastClearIndex >= 0) {
        // clear 작업이 있으면 clear 이후의 작업만 사용하고, 모든 데이터 초기화
        processedOperations = operations.slice(lastClearIndex + 1);
        this.allOperations = [];
        this.allObjects = [];
        this.viewer.clearAll();
      }

      // clear 타입 작업이 있는지 확인 (처리할 작업 중)
      const hasClear = processedOperations.some((op) => op.type === "clear");
      if (hasClear) {
        // 처리할 작업 중에 clear가 있으면 (이상한 경우지만) 무시
        return;
      }
      
      // 중복 제거: 이미 있는 작업은 제외
      const newOperations = processedOperations.filter(
        (op) => !this.allOperations.some((existing) => existing.id === op.id)
      );
      if (newOperations.length > 0) {
        this.allOperations.push(...newOperations);
        this.viewer.renderDrawing(newOperations);
        this.updateCanvasSize();
      }
    });

    this.yjsManager.setOnObjectsUpdate((objects) => {
      // 초기 로드가 완료되지 않았으면 무시 (초기 로드에서 처리)
      if (!this.isInitialLoadComplete) {
        return;
      }
      this.allObjects = objects;
      this.viewer.renderObjects(objects);
      this.updateCanvasSize();
    });

    this.yjsManager.setOnBackgroundStateUpdate((state) => {
      // 초기 로드가 완료되지 않았으면 무시 (초기 로드에서 처리)
      if (!this.isInitialLoadComplete) {
        return;
      }
      
      // 배경 상태가 변경되었을 때만 업데이트
      const hasChanged = 
        (!this.backgroundState && state) ||
        (this.backgroundState && !state) ||
        (this.backgroundState?.dataUrl !== state?.dataUrl);
      
      if (hasChanged) {
        this.backgroundState = state;
        this.viewer.setBackground(state).then(() => {
          // 배경 이미지 로드 후 크기 업데이트
          if (state && state.dataUrl) {
            // 배경 이미지가 있으면 canvasWidth에 맞춰 크기 조정
            this.setCanvasWidth(this.canvasWidth);
          } else {
            // 배경 이미지가 없으면 내용에 맞춰 크기 조정
            this.updateCanvasSize();
          }
        });
      }
    });

    // Y.js 동기화 대기 (IndexedDB에서 데이터를 불러올 수 있도록)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 초기 데이터 로드
    const allOperations = this.yjsManager.getAllDrawingOperations();
    const allObjects = this.yjsManager.getAllObjects();
    const backgroundState = this.yjsManager.getBackgroundState();

    // clear 작업이 있는지 확인 (역순으로 마지막 clear 찾기)
    let lastClearIndex = -1;
    for (let i = allOperations.length - 1; i >= 0; i--) {
      if (allOperations[i].type === "clear") {
        lastClearIndex = i;
        break;
      }
    }
    if (lastClearIndex >= 0) {
      // clear 작업이 있으면 clear 이후의 작업만 사용
      this.allOperations = allOperations.slice(lastClearIndex + 1);
    } else {
      this.allOperations = allOperations;
    }
    this.allObjects = allObjects;

    // 초기 렌더링 (순서 중요: 배경 -> 그리기 -> 객체)
    this.backgroundState = backgroundState;
    if (backgroundState && backgroundState.dataUrl) {
      await this.viewer.setBackground(backgroundState);
    }
    
    // 초기 그리기 데이터 렌더링 (clear 작업 이후의 데이터만)
    if (this.allOperations.length > 0) {
      this.viewer.renderDrawing(this.allOperations);
    }
    if (this.allObjects.length > 0) {
      this.viewer.renderObjects(this.allObjects);
    }

    // 초기 캔버스 크기 계산
    this.updateCanvasSize();

    // 초기 로드 완료 플래그 설정 (이제부터 Y.js 업데이트 이벤트 처리)
    this.isInitialLoadComplete = true;

    this.isInitialized = true;
  }

  /**
   * 캔버스 크기 업데이트 (배경 이미지 기준)
   * 가로 크기는 canvasWidth로 고정하고, 세로는 배경 이미지 비율에 맞춰 조정
   */
  private updateCanvasSize(): void {
    let newWidth = this.canvasWidth;
    let newHeight = this.height;

    // 배경 이미지가 있으면 비율에 맞춰 세로 크기 계산
    if (this.backgroundState && this.backgroundState.dataUrl) {
      const bgInfo = this.viewer.getBackgroundInfo();
      if (bgInfo) {
        // 690px 기준으로 스케일링한 높이 계산
        const targetWidth = 690;
        const scale = targetWidth / bgInfo.width;
        const baseContentHeight = bgInfo.height * scale;
        
        // canvasWidth에 맞춰 다시 스케일링
        const displayScale = this.canvasWidth / 690;
        newHeight = baseContentHeight * displayScale;
      }
    } else {
      // 배경 이미지가 없으면 기본 높이 사용
      newHeight = Math.max(this.height, 300);
    }

    // 가로는 canvasWidth로 고정, 세로는 배경 이미지 비율에 맞춰 조정
    if (newWidth !== this.width || newHeight !== this.height) {
      this.width = newWidth;
      this.height = newHeight;
      this.viewer.resize(newWidth, newHeight, this.canvasWidth);
      this.onCanvasSizeChange?.({ width: newWidth, height: newHeight });
    }
  }

  /**
   * 캔버스 가로 크기 설정 (배경 이미지가 있으면 비율에 맞춰 세로도 조정)
   */
  setCanvasWidth(canvasWidth: number): void {
    this.canvasWidth = canvasWidth;
    
    if (this.backgroundState && this.backgroundState.dataUrl) {
      // 배경 이미지가 있으면 비율에 맞춰 세로 크기 계산
      const bgInfo = this.viewer.getBackgroundInfo();
      if (bgInfo) {
        // 실제 이미지 크기 사용
        const aspectRatio = bgInfo.height / bgInfo.width;
        const newHeight = canvasWidth * aspectRatio;
        this.width = canvasWidth;
        this.height = newHeight;
        this.viewer.resize(canvasWidth, newHeight, canvasWidth);
        this.onCanvasSizeChange?.({ width: canvasWidth, height: newHeight });
      } else {
        // 원본 크기 정보가 없으면 현재 높이 유지
        this.width = canvasWidth;
        this.viewer.resize(canvasWidth, this.height, canvasWidth);
        this.onCanvasSizeChange?.({ width: canvasWidth, height: this.height });
      }
    } else {
      // 배경 이미지가 없으면 가로만 변경하고 세로는 내용에 맞춰 조정
      this.width = canvasWidth;
      this.updateCanvasSize();
    }
  }

  /**
   * 캔버스 크기 변경 콜백 설정
   */
  setOnCanvasSizeChange(callback: (size: { width: number; height: number }) => void): void {
    this.onCanvasSizeChange = callback;
  }

  /**
   * 크기 조정
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.viewer.resize(width, height, this.canvasWidth);
    // resize 내부에서 이미 redrawAll() 호출됨
  }

  /**
   * 정리
   */
  destroy(): void {
    this.yjsManager.disconnect();
    this.viewer.destroy();
    this.isInitialized = false;
  }

  /**
   * Y.js 매니저 반환 (필요시)
   */
  getYjsManager(): YjsDrawingManager {
    return this.yjsManager;
  }

  /**
   * 뷰어 반환
   */
  getViewer(): Canvas2DViewer {
    return this.viewer;
  }

  /**
   * 현재 캔버스 크기 반환
   */
  getCanvasSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

