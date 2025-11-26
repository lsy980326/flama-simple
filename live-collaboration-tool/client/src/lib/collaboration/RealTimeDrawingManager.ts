import React from "react";
import {
  YjsDrawingManager,
  DrawingOperation,
  AwarenessState,
  BackgroundState,
  CanvasObject,
} from "./YjsDrawingManager";
import {
  WebRTCDataChannelManager,
  WebRTCDataChannelMessage,
} from "../webrtc/WebRTCDataChannelManager";
import { AwarenessManager, UserAwareness } from "./AwarenessManager";
import { CanvasManager } from "../canvas/CanvasManager";
import { User, WebRTCConfig } from "../types";

export interface RealTimeDrawingConfig {
  serverUrl: string;
  roomId: string;
  user: User;
  webrtcConfig: WebRTCConfig;
}

export class RealTimeDrawingManager {
  private yjsManager: YjsDrawingManager;
  private thumbnailUpdateTimer: ReturnType<typeof setTimeout> | null = null; // 썸네일 갱신 타이머
  private webrtcManager: WebRTCDataChannelManager;
  private awarenessManager: AwarenessManager;
  private canvasManager: CanvasManager;
  private config: RealTimeDrawingConfig;
  private isInitialized: boolean = false;
  private pendingOperations: DrawingOperation[] = [];
  private isApplyingRemoteBackground: boolean = false;
  private backgroundScaleListener?: (scale: number) => void;
  private pendingBackgroundState: BackgroundState | null = null;
  private backgroundUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private onObjectsChange?: (objects: CanvasObject[]) => void;
  private scrollContainerRef: React.RefObject<HTMLDivElement | null> | null = null;
  
  // 썸네일 자동 갱신을 위한 debounce 메서드
  private scheduleThumbnailUpdate(): void {
    // 기존 타이머 취소
    if (this.thumbnailUpdateTimer) {
      clearTimeout(this.thumbnailUpdateTimer);
    }
    
    // 2초 후 썸네일 갱신 이벤트 발생
    this.thumbnailUpdateTimer = setTimeout(() => {
      const scrollContainer = this.scrollContainerRef?.current;
      if (scrollContainer) {
        window.dispatchEvent(new CustomEvent('canvas-content-updated', { 
          detail: { manager: this, container: scrollContainer } 
        }));
      }
      this.thumbnailUpdateTimer = null;
    }, 2000); // 2초 대기
  }

  // 콜백 함수들
  private onDrawingUpdate?: (operations: DrawingOperation[]) => void;
  private onAwarenessUpdate?: (states: Map<string, UserAwareness>) => void;
  private onPeerConnected?: (peerId: string) => void;
  private onPeerDisconnected?: (peerId: string) => void;
  private onUserJoin?: (user: User) => void;
  private onUserLeave?: (userId: string) => void;

  constructor(config: RealTimeDrawingConfig, canvasContainer: HTMLElement) {
    this.config = config;

    // Y.js 매니저 초기화
    this.yjsManager = new YjsDrawingManager(
      config.user,
      config.serverUrl,
      config.roomId
    );

    // WebRTC 매니저 초기화
    this.webrtcManager = new WebRTCDataChannelManager(
      config.webrtcConfig,
      config.user
    );

    // Awareness 매니저 초기화
    this.awarenessManager = new AwarenessManager(config.user);

    // 캔버스 매니저 초기화
    this.canvasManager = new CanvasManager(canvasContainer);
    this.canvasManager.setOnBackgroundScaleChange((scale) => {
      this.handleCanvasBackgroundScaleChange(scale);
    });
    this.canvasManager.setOnBackgroundTransformChange((state) => {
      this.handleCanvasBackgroundTransformChange(state);
    });

    this.setupEventListeners();
  }

  // 초기화
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Canvas 초기화 완료 대기
      try {
        await this.canvasManager.waitForInitialization();
      } catch (canvasError) {
        console.error("Canvas 초기화 실패:", canvasError);
        // Canvas 초기화 실패는 치명적이므로 재시도
        throw canvasError;
      }

      // 미디어 스트림 초기화 (선택사항 - 권한이 거부되어도 계속 진행)
      // initializeMedia는 이제 오류를 던지지 않고 내부에서 처리합니다
      await this.webrtcManager.initializeMedia();

      // Awareness 정리 작업 시작
      this.awarenessManager.startCleanupInterval();

    // Canvas 이벤트를 Y.js와 연결
    this.canvasManager.setOnDrawStart((x, y) => {
      const brushSize = this.canvasManager.getBrushSize();
      const brushColorNum = this.canvasManager.getBrushColor();
      // 숫자 색상을 16진수 문자열로 변환 (#RRGGBB)
      const brushColor = "#" + brushColorNum.toString(16).padStart(6, "0");
      this.startDrawing(x, y, brushSize, brushColor);
    });

    this.canvasManager.setOnDrawContinue((x, y) => {
      this.continueDrawing(x, y);
    });

    this.canvasManager.setOnDrawEnd(() => {
      this.endDrawing();
      // 그리기 완료 후 썸네일 갱신 예약
      this.scheduleThumbnailUpdate();
    });

    this.canvasManager.setOnTextInput((x, y, text) => {
      const fontSize = this.canvasManager.getBrushSize() * 4;
      const color = "#" + this.canvasManager.getBrushColor().toString(16).padStart(6, "0");
      const id = this.yjsManager.addObject({
        type: "text",
        x,
        y,
        text,
        fontSize,
        color,
      });
      this.canvasManager.addTextObject(id, x, y, text, fontSize, color);
      // 텍스트 입력 완료 후 썸네일 갱신 예약
      this.scheduleThumbnailUpdate();
    });

    this.canvasManager.setOnShapeComplete((shape) => {
      const brushSize = this.canvasManager.getBrushSize();
      const color = "#" + this.canvasManager.getBrushColor().toString(16).padStart(6, "0");
      const id = this.yjsManager.addObject({
        type: "shape",
        tool: shape.tool as "rectangle" | "circle" | "line",
        x: shape.x,
        y: shape.y,
        x2: shape.x2,
        y2: shape.y2,
        brushSize,
        color,
      });
      this.canvasManager.addShapeObject(
        id,
        shape.tool as "rectangle" | "circle" | "line",
        shape.x,
        shape.y,
        shape.x2,
        shape.y2,
        brushSize,
        color
      );
      // 도형 완성 후 썸네일 갱신 예약
      this.scheduleThumbnailUpdate();
    });

    this.canvasManager.setOnObjectMoved((id, x, y) => {
      this.yjsManager.updateObject(id, { x, y });
      this.onObjectsChange?.(this.yjsManager.getAllObjects());
      // 객체 이동 완료 후 썸네일 갱신 예약
      this.scheduleThumbnailUpdate();
    });

    this.canvasManager.setOnObjectTransformed((id, updates) => {
      this.yjsManager.updateObject(id, updates);
      this.onObjectsChange?.(this.yjsManager.getAllObjects());
      // 객체 변환 완료 후 썸네일 갱신 예약
      this.scheduleThumbnailUpdate();
    });

      this.isInitialized = true;
      console.log("실시간 그림 그리기 매니저 초기화 완료");

      // 초기 동기화 중 큐에 쌓인 작업 적용
      if (this.pendingOperations.length > 0) {
        const ops = this.pendingOperations;
        this.pendingOperations = [];
        this.handleDrawingOperations(ops);
      }

      // 초기화 완료 후 렌더링 완료를 보장하기 위해 약간의 지연 후 이벤트 발생
      setTimeout(() => {
        // 캔버스 초기화 완료 이벤트 발생 (미리보기 자동 표시용)
        const scrollContainer = this.scrollContainerRef?.current;
        if (scrollContainer) {
          window.dispatchEvent(new CustomEvent('canvas-initialized', { 
            detail: { manager: this, container: scrollContainer } 
          }));
        }
      }, 300);
    } catch (error) {
      console.error("초기화 실패:", error);
      throw error;
    }
  }

  // 이벤트 리스너 설정
  private setupEventListeners(): void {
    // Y.js 이벤트
    this.yjsManager.setOnDrawingUpdate((operations) => {
      this.handleDrawingOperations(operations);
      this.onDrawingUpdate?.(operations);
    });

    this.yjsManager.setOnAwarenessUpdate((states) => {
      this.handleAwarenessStates(states);
    });

    // WebRTC 이벤트
    this.webrtcManager.setOnDataChannelMessage((message) => {
      this.handleDataChannelMessage(message);
    });

    this.webrtcManager.setOnPeerConnected((peerId) => {
      console.log(`피어 연결됨: ${peerId}`);
      this.onPeerConnected?.(peerId);
    });

    this.webrtcManager.setOnPeerDisconnected((peerId) => {
      console.log(`피어 연결 해제됨: ${peerId}`);
      this.onPeerDisconnected?.(peerId);
    });

    // Awareness 이벤트
    this.awarenessManager.setOnAwarenessChange((states) => {
      this.onAwarenessUpdate?.(states);
    });

    this.awarenessManager.setOnUserJoin((user) => {
      this.onUserJoin?.(user);
    });

    this.awarenessManager.setOnUserLeave((userId) => {
      this.onUserLeave?.(userId);
    });

    this.yjsManager.setOnBackgroundStateUpdate((state) => {
      void this.applySharedBackgroundState(state);
    });

    this.yjsManager.setOnObjectsUpdate((objects) => {
      void this.syncCanvasObjects(objects);
    });
  }

  // 그리기 작업 처리
  private handleDrawingOperations(operations: DrawingOperation[]): void {
    if (!this.canvasManager.isReady()) {
      // 캔버스 준비 전이면 큐에 저장 후 나중에 처리
      this.pendingOperations.push(...operations);
      return;
    }

    operations.forEach((operation) => {
      if (operation.userId !== this.config.user.id) {
        // 다른 사용자의 그리기 작업을 선으로 연결하여 적용
        this.canvasManager.applyRemoteDrawingData(operation.userId, {
          type: operation.type,
          x: operation.x,
          y: operation.y,
          pressure: operation.pressure,
          color: operation.color,
          brushSize: operation.brushSize,
        });
      }
    });
  }

  private handleCanvasBackgroundScaleChange(scale: number): void {
    if (!this.isApplyingRemoteBackground) {
      this.queueBackgroundStateSync();
    }

    this.backgroundScaleListener?.(scale);
  }

  private handleCanvasBackgroundTransformChange(state: {
    x: number;
    y: number;
    scale: number;
  }): void {
    if (!this.isApplyingRemoteBackground) {
      this.queueBackgroundStateSync();
    }
  }

  private clearBackgroundUpdateTimer(): void {
    if (this.backgroundUpdateTimer !== null) {
      clearTimeout(this.backgroundUpdateTimer);
      this.backgroundUpdateTimer = null;
    }
  }

  private queueBackgroundStateSync(immediate: boolean = false): void {
    if (this.isApplyingRemoteBackground) {
      return;
    }

    const state = this.canvasManager.getBackgroundState();

    if (!state) {
      this.clearBackgroundUpdateTimer();
      this.pendingBackgroundState = null;
      this.yjsManager.setBackgroundState(null);
      return;
    }

    this.pendingBackgroundState = state;

    if (immediate) {
      this.flushBackgroundStateQueue();
      return;
    }

    if (this.backgroundUpdateTimer !== null) {
      return;
    }

    this.backgroundUpdateTimer = setTimeout(() => {
      this.flushBackgroundStateQueue();
    }, 100);
  }

  private flushBackgroundStateQueue(): void {
    if (this.isApplyingRemoteBackground) {
      this.pendingBackgroundState = null;
      this.clearBackgroundUpdateTimer();
      return;
    }

    this.clearBackgroundUpdateTimer();

    if (this.pendingBackgroundState) {
      this.yjsManager.setBackgroundState(this.pendingBackgroundState);
      this.pendingBackgroundState = null;
    } else {
      const state = this.canvasManager.getBackgroundState();
      if (state) {
        this.yjsManager.setBackgroundState(state);
      }
    }
  }

  private async syncCanvasObjects(objects: CanvasObject[]): Promise<void> {
    if (!this.canvasManager.isReady()) {
      return;
    }

    const existingIds = this.canvasManager.getObjectIds();
    const newObjectIds = new Set(objects.map((obj) => obj.id));

    // 제거된 객체 삭제
    existingIds.forEach((id) => {
      if (!newObjectIds.has(id)) {
        this.canvasManager.removeObject(id);
      }
    });

    // 새로 추가되거나 업데이트된 객체만 처리
    for (const obj of objects) {
      const exists = existingIds.includes(obj.id);
      
      if (exists) {
        // 이미 있는 객체는 위치만 업데이트
        this.canvasManager.updateObjectPosition(obj.id, obj.x, obj.y);
        if (obj.type === "image" && typeof obj.scale === "number") {
          this.canvasManager.updateImageObjectScale(obj.id, obj.scale);
        }
      } else {
        // 원격 사용자가 추가한 새 객체만 렌더링
        if (obj.type === "text" && obj.text) {
          this.canvasManager.addTextObject(
            obj.id,
            obj.x,
            obj.y,
            obj.text,
            obj.fontSize || 20,
            obj.color ?? "#000000"
          );
        } else if (obj.type === "shape" && obj.tool && obj.x2 !== undefined && obj.y2 !== undefined) {
          this.canvasManager.addShapeObject(
            obj.id,
            obj.tool,
            obj.x,
            obj.y,
            obj.x2,
            obj.y2,
            obj.brushSize || 2,
            obj.color || "#000000"
          );
        } else if (obj.type === "image" && obj.dataUrl) {
          await this.canvasManager.addImageObject(
            obj.id,
            obj.dataUrl,
            obj.x,
            obj.y,
            obj.width,
            obj.height,
            obj.scale ?? 1
          );
        }
      }
    }

    this.onObjectsChange?.(objects);
  }

  private async applySharedBackgroundState(
    state: BackgroundState | null
  ): Promise<void> {
    this.isApplyingRemoteBackground = true;
    this.clearBackgroundUpdateTimer();
    this.pendingBackgroundState = null;

    try {
      if (!this.canvasManager.isReady()) {
        try {
          await this.canvasManager.waitForInitialization();
        } catch (error) {
          console.error("캔버스 초기화 전 배경 적용 실패:", error);
          return;
        }
      }

      if (!state || !state.dataUrl) {
        if (this.canvasManager.hasBackgroundImage()) {
          this.canvasManager.removeBackgroundImage();
        }
        return;
      }

      const current = this.canvasManager.getBackgroundState();
      const needsNewImage = !current || current.dataUrl !== state.dataUrl;

      if (needsNewImage) {
        await this.canvasManager.loadImageFromDataUrl(state.dataUrl);
      }

      // 배경 이미지는 항상 (0, 0) 위치로 고정 (저장된 x, y 값 무시)
      this.canvasManager.setBackgroundTransform(
        {
          x: 0,
          y: 0,
          scale: state.scale,
        },
        { notify: true }
      );
    } catch (error) {
      console.error("배경 상태 적용 실패:", error);
    } finally {
      this.isApplyingRemoteBackground = false;
    }
  }

  // Awareness 상태 처리
  private handleAwarenessStates(states: Map<string, AwarenessState>): void {
    states.forEach((state, clientId) => {
      this.awarenessManager.updateUserAwareness(clientId, {
        user: state.user,
        cursor: state.cursor
          ? {
              x: state.cursor.x,
              y: state.cursor.y,
              timestamp: Date.now(),
            }
          : null,
        selection: state.selection
          ? {
              x: state.selection.x,
              y: state.selection.y,
              width: state.selection.width,
              height: state.selection.height,
              timestamp: Date.now(),
            }
          : null,
        isDrawing: state.isDrawing,
        isTyping: false,
        color: state.user.color,
      });

      // 캔버스에 원격 커서 반영
      if (state.cursor) {
        const colorNum = parseInt(state.user.color.replace("#", ""), 16);
        this.canvasManager.updateRemoteCursor(
          clientId,
          state.cursor.x,
          state.cursor.y,
          colorNum
        );
      } else {
        this.canvasManager.hideRemoteCursor(clientId);
      }

      // 그리기가 끝난 경우 경로 연결 기준점 초기화
      if (!state.isDrawing) {
        this.canvasManager.resetRemotePath(clientId);
      }
    });
  }

  // 데이터 채널 메시지 처리
  private handleDataChannelMessage(message: WebRTCDataChannelMessage): void {
    switch (message.type) {
      case "drawing":
        // 그리기 데이터를 Y.js로 전파
        this.yjsManager.addDrawingOperation(message.data);
        break;
      case "awareness":
        // Awareness 데이터 처리
        this.awarenessManager.updateUserAwareness(message.userId, message.data);
        break;
      case "chat":
        // 채팅 메시지 처리 (추후 구현)
        console.log("채팅 메시지:", message.data);
        break;
      case "file":
        // 파일 전송 처리 (추후 구현)
        console.log("파일 수신:", message.data);
        break;
    }
  }

  // 그리기 시작
  startDrawing(
    x: number,
    y: number,
    brushSize: number = 5,
    color: string = "#000000"
  ): void {
    this.yjsManager.startDrawing(x, y, brushSize, color);
    this.awarenessManager.updateCurrentUserDrawing(true);

    // WebRTC로도 전송
    this.webrtcManager.broadcastMessage("drawing", {
      type: "draw",
      x,
      y,
      brushSize,
      color,
      userId: this.config.user.id,
    });
  }

  // 그리기 계속
  continueDrawing(x: number, y: number): void {
    this.yjsManager.continueDrawing(x, y);

    // WebRTC로도 전송
    this.webrtcManager.broadcastMessage("drawing", {
      type: "draw",
      x,
      y,
      brushSize: this.canvasManager.getBrushSize(),
      color:
        "#" + this.canvasManager.getBrushColor().toString(16).padStart(6, "0"),
      userId: this.config.user.id,
    });
  }

  // 그리기 종료
  endDrawing(): void {
    this.yjsManager.endDrawing();
    this.awarenessManager.updateCurrentUserDrawing(false);
  }

  // 지우기
  erase(x: number, y: number, brushSize: number = 10): void {
    this.yjsManager.erase(x, y, brushSize);

    // WebRTC로도 전송
    this.webrtcManager.broadcastMessage("drawing", {
      type: "erase",
      x,
      y,
      brushSize,
      userId: this.config.user.id,
    });
  }

  // 캔버스 지우기
  clearCanvas(): void {
    this.yjsManager.clearCanvas();
    this.canvasManager.clear();
    
    // 모든 객체도 삭제
    this.yjsManager.getAllObjects().forEach((obj) => {
      this.yjsManager.removeObject(obj.id);
    });
    this.onObjectsChange?.(this.yjsManager.getAllObjects());

    // WebRTC로도 전송
    this.webrtcManager.broadcastMessage("drawing", {
      type: "clear",
      x: 0,
      y: 0,
      userId: this.config.user.id,
    });
  }

  // 브러시 설정
  setBrushSize(size: number): void {
    this.canvasManager.setBrushSize(size);
    this.yjsManager.setBrushSize(size);
  }

  setBrushColor(color: string): void {
    this.canvasManager.setBrushColor(parseInt(color.replace("#", ""), 16));
    this.yjsManager.setBrushColor(color);
  }

  setTool(tool: "brush" | "eraser" | "text" | "rectangle" | "circle" | "line"): void {
    this.canvasManager.setTool(tool);
  }

  getTool(): "brush" | "eraser" | "text" | "rectangle" | "circle" | "line" {
    return this.canvasManager.getTool();
  }

  async loadBackgroundImage(file: File, maxWidth?: number): Promise<void> {
    await this.canvasManager.loadImageFromFile(file, maxWidth);
    this.queueBackgroundStateSync(true);
    // 배경 이미지 로드 완료 후 썸네일 갱신 예약
    this.scheduleThumbnailUpdate();
  }

  /**
   * 스크롤 컨테이너 ref를 설정합니다.
   * 이 ref는 오버레이 이미지 추가 시 현재 뷰포트 위치를 계산하는 데 사용됩니다.
   */
  setScrollContainer(ref: React.RefObject<HTMLDivElement | null> | null): void {
    this.scrollContainerRef = ref;
  }

  /**
   * 현재 뷰포트 중앙 좌표를 계산합니다.
   * 스크롤 컨테이너가 설정되어 있으면 스크롤 위치를 기준으로 계산하고,
   * 없으면 캔버스 중앙을 반환합니다.
   */
  private getCurrentViewportCenter(): { x: number; y: number } {
    const { width: canvasWidth, height: canvasHeight } =
      this.canvasManager.getCanvasSize();
    
    // 스크롤 컨테이너가 설정되어 있으면 현재 뷰포트 중앙 계산
    if (this.scrollContainerRef?.current) {
      const scrollContainer = this.scrollContainerRef.current;
      const viewportX = scrollContainer.scrollLeft + scrollContainer.clientWidth / 2;
      const viewportY = scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
      
      return { x: viewportX, y: viewportY };
    }
    
    // 스크롤 컨테이너가 없으면 캔버스 중앙 반환
    
    return { x: canvasWidth / 2, y: canvasHeight / 2 };
  }

  async addImageFromFile(file: File, viewportX?: number, viewportY?: number, maxWidth?: number): Promise<void> {
    if (!this.canvasManager.isReady()) {
      try {
        await this.canvasManager.waitForInitialization();
      } catch (error) {
        console.error("캔버스 초기화 전에 이미지 추가 실패:", error);
        throw error;
      }
    }

    const dataUrl = await this.readFileAsDataUrl(file);
    const { width: originalWidth, height: originalHeight, image } = await this.getImageInfo(dataUrl);
    
    // 가로 크기 제한 적용 (원본 이미지 유지, 스케일만 조절)
    // finalWidth, finalHeight는 사용하지 않지만 스케일 계산을 위해 유지
    
    // 뷰포트 좌표가 제공되면 사용, 없으면 현재 뷰포트 중앙 계산
    let centerX: number;
    let centerY: number;
    
    if (viewportX !== undefined && viewportY !== undefined) {
      // 명시적으로 뷰포트 좌표가 제공된 경우
      centerX = viewportX;
      centerY = viewportY;
    } else {
      // 뷰포트 좌표가 없으면 현재 뷰포트 중앙 자동 계산
      const viewportCenter = this.getCurrentViewportCenter();
      centerX = viewportCenter.x;
      centerY = viewportCenter.y;
    }

    const id = this.yjsManager.addObject({
      type: "image",
      x: centerX,
      y: centerY,
      dataUrl,
      width: originalWidth, // 원본 크기 저장
      height: originalHeight, // 원본 크기 저장
      scale: maxWidth && originalWidth > maxWidth ? maxWidth / originalWidth : 1, // 스케일 계산
    });

    // 이미지 객체 추가 (원본 크기 사용, 스케일로 크기 조절)
    await this.canvasManager.addImageObject(
      id,
      dataUrl,
      centerX,
      centerY,
      originalWidth, // 원본 크기
      originalHeight, // 원본 크기
      maxWidth && originalWidth > maxWidth ? maxWidth / originalWidth : 1, // 스케일
      image
    );
    
    // 렌더링 완료 후 콜백 호출
    this.onObjectsChange?.(this.yjsManager.getAllObjects());
    // 이미지 추가 완료 후 썸네일 갱신 예약
    this.scheduleThumbnailUpdate();
  }

  removeSelectedObject(): boolean {
    const selectedId = this.canvasManager.getSelectedObjectId();
    if (!selectedId) {
      return false;
    }

    // Y.js에서 객체 제거
    this.yjsManager.removeObject(selectedId);
    
    // CanvasManager에서 객체 제거
    this.canvasManager.removeObject(selectedId);
    
    this.onObjectsChange?.(this.yjsManager.getAllObjects());
    return true;
  }

  setBackgroundScale(scale: number): void {
    this.canvasManager.setBackgroundScale(scale);
  }

  setBackgroundPosition(x: number, y: number): void {
    this.canvasManager.setBackgroundPosition(x, y);
  }

  getBackgroundScale(): number {
    return this.canvasManager.getBackgroundScale();
  }

  /**
   * 캔버스 가로 크기를 조절합니다.
   * 배경 이미지가 있는 경우 비율에 맞춰 높이도 자동 조절하고, 배경 이미지를 0,0에 배치합니다.
   * 배경 이미지가 없는 경우 가로 크기만 조절하고 세로는 현재 크기를 유지합니다.
   * @param width 캔버스 가로 크기 (픽셀) 또는 "default" (기본값: 690)
   * @param defaultWidth 기본 가로 크기 (width가 "default"일 때 사용, 기본값: 690)
   */
  setCanvasWidth(width: number | "default", defaultWidth: number = 690): void {
    const targetWidth = width === "default" ? defaultWidth : width;
    const canvasManager = this.canvasManager;
    
    if (this.hasBackgroundImage()) {
      const bgState = canvasManager.getBackgroundState();
      if (bgState && bgState.originalSize) {
        // 배경 이미지의 세로 크기에 맞춰 캔버스 세로 크기 설정
        const aspectRatio = bgState.originalSize.height / bgState.originalSize.width;
        const newHeight = targetWidth * aspectRatio;
        
        // PIXI 캔버스 크기 조절 (스크린과 캔버스 모두 자동 업데이트)
        canvasManager.resize(targetWidth, newHeight);
        
        // 배경 이미지를 0,0에서 시작하도록 설정하고 전체 이미지가 보이도록 스케일 조정
        const originalWidth = bgState.originalSize.width;
        const scale = targetWidth / originalWidth;
        this.setBackgroundScale(scale);
        
        // 배경 이미지를 0,0 위치에 배치 (전체 이미지가 보이도록)
        canvasManager.setBackgroundPosition(0, 0);
      }
    } else {
      // 배경 이미지가 없으면 기본 높이로 설정하고 가로만 조절
      // 배경 이미지가 있을 때는 배경 이미지 세로 크기에 맞추고, 없을 때는 기본 높이 사용
      const defaultHeight = 600;
      canvasManager.resize(targetWidth, defaultHeight);
    }
  }

  resetBackgroundImageTransform(): void {
    this.canvasManager.resetBackgroundTransform();
    this.queueBackgroundStateSync(true);
  }

  removeBackgroundImage(): void {
    // 배경 이미지 제거 전에 현재 가로 크기 저장
    const currentSize = this.canvasManager.getCanvasSize();
    const currentWidth = currentSize.width;
    const currentHeight = currentSize.height;
    
    this.canvasManager.removeBackgroundImage();
    this.queueBackgroundStateSync(true);
    
    // 배경 이미지 제거 후 명시적으로 기본 높이로 리셋
    // 배경 이미지가 없을 때는 기본 높이(600)를 사용
    const defaultHeight = 600;
    this.canvasManager.resize(currentWidth, defaultHeight);
  }

  hasBackgroundImage(): boolean {
    return this.canvasManager.hasBackgroundImage();
  }

  setOnBackgroundScaleChange(
    callback?: (scale: number) => void
  ): void {
    this.backgroundScaleListener = callback;

    if (callback) {
      const state = this.canvasManager.getBackgroundState();
      if (state) {
        callback(state.scale);
      } else {
        callback(this.canvasManager.getBackgroundScale());
      }
    }
  }

  setTransformMode(enabled: boolean): void {
    this.canvasManager.setTransformMode(enabled);
  }

  isTransformModeEnabled(): boolean {
    return this.canvasManager.isTransformModeEnabled();
  }

  setTransformHotkey(enabled: boolean): void {
    this.canvasManager.setTransformHotkey(enabled);
  }

  setOnObjectsChange(callback?: (objects: CanvasObject[]) => void): void {
    this.onObjectsChange = callback;

    if (callback) {
      callback(this.yjsManager.getAllObjects());
    }
  }

  // 캔버스 상태 저장/불러오기
  exportCanvasState(): string {
    return this.yjsManager.exportState();
  }

  async importCanvasState(serialized: string): Promise<void> {
    try {
      this.yjsManager.importState(serialized);
      // 복원 후 캔버스 다시 그리기
      const operations = this.yjsManager.getAllOperations();
      if (operations.length > 0) {
        this.handleDrawingOperations(operations);
      }
      // 배경 상태도 적용
      const bgState = this.yjsManager.getBackgroundState();
      if (bgState) {
        await this.applySharedBackgroundState(bgState);
      }
      if (!this.canvasManager.isReady()) {
        try {
          await this.canvasManager.waitForInitialization();
        } catch (error) {
          console.error("캔버스 초기화 대기 중 오류:", error);
        }
      }
      const objects = this.yjsManager.getAllObjects();
      await this.syncCanvasObjects(objects);
      this.onObjectsChange?.(objects);
    } catch (error) {
      console.error("캔버스 상태 복원 실패:", error);
      throw error;
    }
  }

  downloadCanvasState(filename: string = "canvas-state.json"): void {
    const state = this.exportCanvasState();
    const blob = new Blob([state], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 피어 연결 관리
  async createPeerConnection(peerId: string): Promise<RTCPeerConnection> {
    return await this.webrtcManager.createPeerConnection(peerId);
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    return await this.webrtcManager.createOffer(peerId);
  }

  async createAnswer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    return await this.webrtcManager.createAnswer(peerId, offer);
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  private getImageInfo(dataUrl: string): Promise<{
    width: number;
    height: number;
    image: HTMLImageElement;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height, image: img });
      img.onerror = (error) => reject(error);
      img.src = dataUrl;
    });
  }

  async handleAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    await this.webrtcManager.handleAnswer(peerId, answer);
  }

  async handleIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    await this.webrtcManager.handleIceCandidate(peerId, candidate);
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this.yjsManager.isConnected();
  }

  getConnectedPeers(): string[] {
    return this.webrtcManager.getConnectedPeers();
  }

  // 사용자 정보 가져오기
  getActiveUsers(): UserAwareness[] {
    return this.awarenessManager.getActiveUsers();
  }

  getAllAwarenessStates(): Map<string, UserAwareness> {
    return this.awarenessManager.getAllAwarenessStates();
  }

  // 그리기 작업 가져오기
  getAllDrawingOperations(): DrawingOperation[] {
    return this.yjsManager.getAllOperations();
  }

  // 연결 해제
  disconnect(): void {
    this.clearBackgroundUpdateTimer();
    this.pendingBackgroundState = null;
    try {
      if (this.yjsManager) {
        this.yjsManager.disconnect();
      }
    } catch (error) {
      // 무시 - 이미 정리 중
    }

    try {
      if (this.webrtcManager) {
        this.webrtcManager.disconnect();
      }
    } catch (error) {
      // 무시 - 이미 정리 중
    }

    try {
      if (this.awarenessManager) {
        this.awarenessManager.destroy();
      }
    } catch (error) {
      // 무시 - 이미 정리 중
    }

    try {
      if (this.canvasManager) {
        this.canvasManager.destroy();
      }
    } catch (error) {
      // 무시 - 이미 정리 중
    }
  }

  // 콜백 설정
  setOnDrawingUpdate(callback: (operations: DrawingOperation[]) => void): void {
    this.onDrawingUpdate = callback;
  }

  setOnAwarenessUpdate(
    callback: (states: Map<string, UserAwareness>) => void
  ): void {
    this.onAwarenessUpdate = callback;
  }

  setOnPeerConnected(callback: (peerId: string) => void): void {
    this.onPeerConnected = callback;
  }

  setOnPeerDisconnected(callback: (peerId: string) => void): void {
    this.onPeerDisconnected = callback;
  }

  setOnUserJoin(callback: (user: User) => void): void {
    this.onUserJoin = callback;
  }

  setOnUserLeave(callback: (userId: string) => void): void {
    this.onUserLeave = callback;
  }

  // CanvasManager 접근을 위한 getter
  getCanvasManager(): CanvasManager {
    return this.canvasManager;
  }
}
