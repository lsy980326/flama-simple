import * as PIXI from "pixi.js";
import { DrawingData, CanvasObject } from "../types";

type TransformHandleKey = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export class CanvasManager {
  private app: PIXI.Application | null = null;
  private graphics!: PIXI.Graphics;
  private cursorLayer!: PIXI.Container;
  private backgroundLayer!: PIXI.Container;
  private backgroundSprite: PIXI.Sprite | null = null;
  private backgroundOriginalSize: { width: number; height: number } | null =
    null;
  private backgroundScale: number = 1;
  private backgroundDataUrl: string | null = null;
  private isBackgroundDragging: boolean = false;
  private backgroundDragData: {
    pointerStartX: number;
    pointerStartY: number;
    spriteStartX: number;
    spriteStartY: number;
  } | null = null;
  private isBackgroundInteractionEnabled: boolean = false;
  private transformLayer: PIXI.Container | null = null;
  private transformOverlay: PIXI.Graphics | null = null;
  private transformHandles: Map<TransformHandleKey, PIXI.Graphics> = new Map();
  private isTransformMode: boolean = false;
  private isTransformHotkey: boolean = false;
  private activeHandle: TransformHandleKey | null = null;
  private handleDragData:
    | {
        targetType: "background";
        handle: TransformHandleKey;
        pointerStartX: number;
        pointerStartY: number;
        spriteStartScale: number;
        startDiagonal: number;
      }
    | {
        targetType: "object";
        handle: TransformHandleKey;
        objectId: string;
        container: PIXI.Container;
        centerX: number;
        centerY: number;
        startDiagonal: number;
        startScale: number;
      }
    | null = null;
  private canvasObjectMetadata: Map<
    string,
    {
      type: "text" | "shape" | "image";
      baseWidth?: number;
      baseHeight?: number;
      scale?: number;
    }
  > = new Map();
  private transformObjectId: string | null = null;
  private onObjectTransformed?: (
    id: string,
    updates: Partial<CanvasObject>
  ) => void;
  private userIdToCursor: Map<string, PIXI.Graphics> = new Map();
  private isDrawing: boolean = false;
  private lastPoint: { x: number; y: number } | null = null;
  private remoteUserIdToLastPoint: Map<string, { x: number; y: number }> =
    new Map();
  private brushSize: number = 5;
  private brushColor: number = 0x000000;
  private adjustSizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentTool:
    | "brush"
    | "eraser"
    | "text"
    | "rectangle"
    | "circle"
    | "line" = "brush";
  private shapeStartPoint: { x: number; y: number } | null = null;
  private tempShapeGraphics: PIXI.Graphics | null = null;
  private objectsLayer!: PIXI.Container;
  private canvasObjects: Map<string, PIXI.Container> = new Map();
  private selectedObjectId: string | null = null;
  private selectedObjectGraphics: PIXI.Graphics | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void>;

  // 그리기 이벤트 콜백
  private onDrawStart?: (x: number, y: number) => void;
  private onDrawContinue?: (x: number, y: number) => void;
  private onDrawEnd?: () => void;
  private onShapeComplete?: (shape: {
    tool: string;
    x: number;
    y: number;
    x2: number;
    y2: number;
  }) => void;
  private onTextInput?: (x: number, y: number, text: string) => void;
  private onObjectMoved?: (id: string, x: number, y: number) => void;
  private onBackgroundScaleChange?: (scale: number) => void;
  private onBackgroundTransformChange?: (state: {
    x: number;
    y: number;
    scale: number;
  }) => void;

  private handleBackgroundPointerDown = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    // 배경 이미지는 항상 고정이므로 드래그 불가
    // if (!this.backgroundSprite || !this.isTransformMode) return;
    // event.stopPropagation();
    // ... (배경 이미지 드래그 기능 비활성화)
  };

  private handleBackgroundPointerMove = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    // 배경 이미지는 항상 고정이므로 드래그 불가
    // if (
    //   !this.backgroundSprite ||
    //   !this.isTransformMode ||
    //   !this.isBackgroundDragging ||
    //   !this.backgroundDragData
    // )
    //   return;
    // ... (배경 이미지 드래그 기능 비활성화)
  };

  private handleBackgroundPointerUp = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    // 배경 이미지는 항상 고정이므로 드래그 불가
    // if (!this.backgroundSprite || !this.isTransformMode) return;
    // ... (배경 이미지 드래그 기능 비활성화)
  };

  private emitBackgroundTransformChange(): void {
    if (!this.backgroundSprite) {
      return;
    }

    this.onBackgroundTransformChange?.({
      x: this.backgroundSprite.x,
      y: this.backgroundSprite.y,
      scale: this.backgroundSprite.scale.x,
    });
  }

  private handleTransformPointerMove = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    if (!this.handleDragData) {
      return;
    }

    const dragData = this.handleDragData;

    if (dragData.targetType === "background") {
      // 배경 이미지는 고정이므로 크기 조절 불가
      return;
    }

    // 오버레이 이미지 크기 조절
    if (dragData.targetType === "object") {
      if (!(this.isTransformMode || this.isTransformHotkey)) {
        return;
      }

      event.stopPropagation();

      // 컨테이너의 현재 중심점 계산 (bounds 기준)
      const currentBounds = dragData.container.getBounds(true);
      const currentCenterX = currentBounds.x + currentBounds.width / 2;
      const currentCenterY = currentBounds.y + currentBounds.height / 2;

      // 마우스 위치에서 중심점까지의 거리 계산
      const dx = event.global.x - dragData.centerX;
      const dy = event.global.y - dragData.centerY;
      const currentDiagonal = Math.max(Math.hypot(dx, dy), 0.001);

      // 스케일 비율 계산
      const scaleRatio = currentDiagonal / dragData.startDiagonal;
      const newScale = Math.max(dragData.startScale * scaleRatio, 0.05);

      // 컨테이너 스케일 적용
      dragData.container.scale.set(newScale);
      
      // 메타데이터 업데이트
      const meta = this.canvasObjectMetadata.get(dragData.objectId);
      if (meta) {
        meta.scale = newScale;
      }
      
      // 선택 박스 및 Transform 오버레이 업데이트
      this.updateObjectSelectionBox();
      this.updateTransformOverlay();
    }
  };

  private handleTransformPointerUp = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    event.stopPropagation();
    const dragData = this.handleDragData;
    this.cancelHandleDrag();
    if (dragData?.targetType === "object") {
      this.onObjectTransformed?.(dragData.objectId, {
        scale: dragData.container.scale.x,
      });
    }
    this.updateTransformOverlay();
  };

  constructor(
    container: HTMLElement,
    width: number = 800,
    height: number = 600
  ) {
    // PIXI 애플리케이션 생성
    this.app = new PIXI.Application();

    // 초기화 Promise 생성
    this.initPromise = this.app
      .init({
        width,
        height,
        backgroundColor: 0xffffff,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      .then(() => {
        if (!this.app) {
          throw new Error("PIXI Application이 생성되지 않았습니다.");
        }

        // 렌더러가 초기화되었는지 확인
        if (!this.app.renderer) {
          throw new Error("PIXI 렌더러가 초기화되지 않았습니다.");
        }

        if (this.app.canvas && container) {
          container.appendChild(this.app.canvas);
          this.setupCanvas();
          this.isInitialized = true;
        } else {
          throw new Error("Canvas 또는 컨테이너를 찾을 수 없습니다.");
        }
      })
      .catch((error) => {
        console.error("PIXI Application 초기화 실패:", error);
        this.app = null;
        this.isInitialized = false;
        throw error;
      });
  }

  // 초기화 완료 대기
  async waitForInitialization(): Promise<void> {
    await this.initPromise;
  }

  // 초기화 상태 확인
  isReady(): boolean {
    return (
      this.isInitialized && this.app !== null && this.graphics !== undefined
    );
  }

  private setupCanvas(): void {
    if (!this.app || !this.app.stage) {
      console.error("PIXI Application이 초기화되지 않았습니다.");
      return;
    }

    // 배경 레이어 추가 (가장 아래)
    this.backgroundLayer = new PIXI.Container();
    // 배경 레이어는 항상 (0, 0)에 위치
    this.backgroundLayer.position.set(0, 0);
    this.app.stage.addChild(this.backgroundLayer);

    // 객체 레이어 (텍스트/도형/이미지) - 평소에는 그리기 레이어 아래에 위치
    this.objectsLayer = new PIXI.Container();
    this.app.stage.addChild(this.objectsLayer);

    // 그래픽 객체 생성 (그리기 레이어) - 평소에는 오버레이 이미지 위에 위치
    this.graphics = new PIXI.Graphics();
    this.app.stage.addChild(this.graphics);

    // 원격 커서용 레이어
    this.cursorLayer = new PIXI.Container();
    this.app.stage.addChild(this.cursorLayer);

    // 변형 표시 레이어 (가장 위쪽)
    this.transformLayer = new PIXI.Container();
    this.transformLayer.visible = false;
    this.transformLayer.eventMode = "none";
    this.app.stage.addChild(this.transformLayer);

    // 이벤트 리스너 설정
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.app || !this.app.stage) return;

    // 마우스 이벤트
    this.app.stage.interactive = true;
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on("pointerdown", this.onPointerDown.bind(this));
    this.app.stage.on("pointermove", this.onPointerMove.bind(this));
    this.app.stage.on("pointerup", this.onPointerUp.bind(this));
    this.app.stage.on("pointerupoutside", this.onPointerUp.bind(this));

    // 터치 이벤트
    this.app.stage.on("touchstart", this.onPointerDown.bind(this));
    this.app.stage.on("touchmove", this.onPointerMove.bind(this));
    this.app.stage.on("touchend", this.onPointerUp.bind(this));
  }

  private onPointerDown(event: PIXI.FederatedPointerEvent): void {
    if (!this.graphics || this.isBackgroundDragging) return;
    
    // Transform 모드일 때는 그림 그리기 안 함
    if (this.isTransformMode && !this.isTransformHotkey) {
      // Transform 모드에서 빈 공간 클릭 시 선택 해제
      // event.target이 stage나 graphics면 빈 공간 클릭으로 간주
      const target = event.target;
      const isCanvasObject = target && 
        Array.from(this.canvasObjects.values()).some(obj => 
          obj === target || obj.children.includes(target as any)
        );
      if (!isCanvasObject) {
        this.clearObjectSelection();
      }
      return;
    }

    this.isDrawing = true;
    // graphics의 로컬 좌표로 직접 변환 (배경 이미지 transform과 무관하게 정확한 좌표)
    // getLocalPosition을 사용하여 캔버스 크기 변경 시에도 정확한 좌표 변환
    // HTML canvas 요소의 실제 크기와 PIXI screen 크기의 차이를 고려
    const point = this.getCanvasLocalPosition(event);
    this.lastPoint = { x: point.x, y: point.y };

    if (this.currentTool === "text") {
      // 텍스트 입력 모드
      this.handleTextInput(point.x, point.y);
      this.isDrawing = false;
      return;
    }

    if (
      this.currentTool === "rectangle" ||
      this.currentTool === "circle" ||
      this.currentTool === "line"
    ) {
      // 도형 그리기 시작
      this.shapeStartPoint = { x: point.x, y: point.y };
      this.startTempShape();
      this.onDrawStart?.(point.x, point.y);
      return;
    }

    // 브러시/지우개
    this.startDrawing(point.x, point.y);
    this.onDrawStart?.(point.x, point.y);
  }

  private onPointerMove(event: PIXI.FederatedPointerEvent): void {
    if (this.isTransformMode) return;
    if (this.isBackgroundDragging) return;
    if (!this.isDrawing || !this.lastPoint || !this.graphics) return;

    // graphics의 로컬 좌표로 직접 변환 (배경 이미지 transform과 무관하게 정확한 좌표)
    // getLocalPosition을 사용하여 캔버스 크기 변경 시에도 정확한 좌표 변환
    // HTML canvas 요소의 실제 크기와 PIXI screen 크기의 차이를 고려
    const point = this.getCanvasLocalPosition(event);

    // 도형 그리기 중이면 임시 도형 업데이트
    if (
      this.shapeStartPoint &&
      (this.currentTool === "rectangle" ||
        this.currentTool === "circle" ||
        this.currentTool === "line")
    ) {
      this.updateTempShape(point.x, point.y);
      return;
    }

    // 브러시/지우개
    if (this.currentTool === "eraser") {
      this.eraseAt(point.x, point.y);
    } else {
      this.drawLine(this.lastPoint.x, this.lastPoint.y, point.x, point.y);
    }
    this.lastPoint = { x: point.x, y: point.y };

    // 콜백 호출
    this.onDrawContinue?.(point.x, point.y);
  }

  private onPointerUp(event: PIXI.FederatedPointerEvent): void {
    if (this.isTransformMode) return;
    if (this.isBackgroundDragging) return;

    if (!this.graphics) return;

    // graphics의 로컬 좌표로 직접 변환 (배경 이미지 transform과 무관하게 정확한 좌표)
    // getLocalPosition을 사용하여 캔버스 크기 변경 시에도 정확한 좌표 변환
    // HTML canvas 요소의 실제 크기와 PIXI screen 크기의 차이를 고려
    const point = this.getCanvasLocalPosition(event);

    // 도형 완성
    if (
      this.shapeStartPoint &&
      (this.currentTool === "rectangle" ||
        this.currentTool === "circle" ||
        this.currentTool === "line")
    ) {
      this.finalizeTempShape(point.x, point.y);
      this.onShapeComplete?.({
        tool: this.currentTool,
        x: this.shapeStartPoint.x,
        y: this.shapeStartPoint.y,
        x2: point.x,
        y2: point.y,
      });
      this.shapeStartPoint = null;
    }

    this.isDrawing = false;
    this.lastPoint = null;

    // 콜백 호출
    this.onDrawEnd?.();
  }

  /**
   * HTML canvas 요소의 실제 크기와 PIXI screen 크기의 차이를 고려하여
   * 정확한 로컬 좌표를 반환합니다.
   * 캔버스가 컨테이너를 넘어가는 경우에도 정확한 좌표 변환을 보장합니다.
   */
  private getCanvasLocalPosition(event: PIXI.FederatedPointerEvent): {
    x: number;
    y: number;
  } {
    if (!this.app || !this.app.canvas || !this.graphics) {
      // 폴백: 기본 getLocalPosition 사용
      return event.getLocalPosition(this.graphics);
    }

    // PIXI의 getLocalPosition을 직접 사용
    // 이 메서드는 autoDensity와 resolution을 자동으로 고려하여 정확한 좌표를 반환합니다
    // graphics는 stage의 직접 자식이고 위치가 (0, 0)이므로
    // getLocalPosition이 자동으로 올바른 변환을 수행합니다
    try {
      return event.getLocalPosition(this.graphics);
    } catch (error) {
      // 폴백: 수동 변환
      const globalPos = event.global;
      return this.graphics.toLocal(globalPos);
    }
  }

  private startDrawing(x: number, y: number): void {
    if (!this.graphics) return;

    try {
      if (this.currentTool === "eraser") {
        this.eraseAt(x, y);
      } else {
        this.graphics.circle(x, y, this.brushSize / 2);
        this.graphics.fill(this.brushColor);
      }
    } catch (error) {
      console.error("그리기 시작 중 오류:", error);
    }
  }

  private eraseAt(x: number, y: number): void {
    if (!this.graphics) return;

    try {
      // 흰색으로 덮어쓰기 (배경색과 동일)
      this.graphics.circle(x, y, this.brushSize / 2);
      this.graphics.fill(0xffffff);
    } catch (error) {
      console.error("지우개 사용 중 오류:", error);
    }
  }

  private handleTextInput(x: number, y: number): void {
    const text = prompt("입력할 텍스트를 입력하세요:");
    if (!text || !this.app) return;

    try {
      this.onTextInput?.(x, y, text);
    } catch (error) {
      console.error("텍스트 입력 중 오류:", error);
    }
  }

  private startTempShape(): void {
    if (!this.app || !this.tempShapeGraphics) {
      this.tempShapeGraphics = new PIXI.Graphics();
      this.app?.stage.addChild(this.tempShapeGraphics);
    }
  }

  private updateTempShape(x2: number, y2: number): void {
    if (!this.tempShapeGraphics || !this.shapeStartPoint) return;

    const { x, y } = this.shapeStartPoint;
    this.tempShapeGraphics.clear();
    this.tempShapeGraphics.setStrokeStyle({
      width: this.brushSize,
      color: this.brushColor,
    });

    try {
      switch (this.currentTool) {
        case "rectangle":
          this.tempShapeGraphics.rect(x, y, x2 - x, y2 - y);
          this.tempShapeGraphics.stroke();
          break;
        case "circle":
          const radius = Math.hypot(x2 - x, y2 - y);
          this.tempShapeGraphics.circle(x, y, radius);
          this.tempShapeGraphics.stroke();
          break;
        case "line":
          this.tempShapeGraphics.moveTo(x, y);
          this.tempShapeGraphics.lineTo(x2, y2);
          this.tempShapeGraphics.stroke();
          break;
      }
    } catch (error) {
      console.error("임시 도형 업데이트 중 오류:", error);
    }
  }

  private finalizeTempShape(x2: number, y2: number): void {
    if (!this.shapeStartPoint) return;

    try {
      // 임시 도형만 제거 (실제 도형은 addShapeObject에서 Container로 추가됨)
      if (this.tempShapeGraphics) {
        this.tempShapeGraphics.clear();
        this.app?.stage.removeChild(this.tempShapeGraphics);
        this.tempShapeGraphics.destroy();
        this.tempShapeGraphics = null;
      }
    } catch (error) {
      console.error("도형 완성 중 오류:", error);
    }
  }

  private drawLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): void {
    if (!this.graphics) return;

    try {
      this.graphics.setStrokeStyle({
        width: this.brushSize,
        color: this.brushColor,
      });
      this.graphics.moveTo(fromX, fromY);
      this.graphics.lineTo(toX, toY);
      this.graphics.stroke();
    } catch (error) {
      console.error("선 그리기 중 오류:", error);
    }
  }

  // 브러시 설정
  setBrushSize(size: number): void {
    this.brushSize = size;
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  setBrushColor(color: number): void {
    this.brushColor = color;
  }

  getBrushColor(): number {
    return this.brushColor;
  }

  setTool(
    tool: "brush" | "eraser" | "text" | "rectangle" | "circle" | "line"
  ): void {
    this.currentTool = tool;
  }

  getTool(): "brush" | "eraser" | "text" | "rectangle" | "circle" | "line" {
    return this.currentTool;
  }

  getCanvasSize(): { width: number; height: number } {
    if (this.app) {
      return {
        width: this.app.screen.width,
        height: this.app.screen.height,
      };
    }
    return { width: 0, height: 0 };
  }

  getSelectedObjectId(): string | null {
    return this.selectedObjectId;
  }

  // 모든 오브젝트의 bounds를 확인하고 필요한 경우 캔버스 크기 조절
  adjustCanvasSizeForObjects(): void {
    if (!this.app || !this.objectsLayer) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasObjects = false;

    // 배경 이미지 bounds 확인 (anchor가 0, 0이므로 왼쪽 상단 모서리 기준)
    if (this.backgroundSprite) {
      // 스프라이트의 실제 크기와 위치를 고려 (anchor 0, 0이므로 왼쪽 상단 모서리 기준)
      const spriteX = this.backgroundSprite.x;
      const spriteY = this.backgroundSprite.y;
      const spriteWidth = this.backgroundSprite.width;
      const spriteHeight = this.backgroundSprite.height;
      // 실제 bounds 계산 (왼쪽 상단 모서리 기준)
      const bgMinX = spriteX;
      const bgMinY = spriteY;
      const bgMaxX = spriteX + spriteWidth;
      const bgMaxY = spriteY + spriteHeight;
      minX = Math.min(minX, bgMinX);
      minY = Math.min(minY, bgMinY);
      maxX = Math.max(maxX, bgMaxX);
      maxY = Math.max(maxY, bgMaxY);
      hasObjects = true;
    }

    // 모든 오브젝트 bounds 확인 (container의 position이 중심점)
    this.canvasObjects.forEach((obj) => {
      const bounds = obj.getBounds(true); // true = world space
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
      hasObjects = true;
    });

    // 오브젝트가 없으면 크기 조절하지 않음
    if (!hasObjects) return;

    // 최소 크기는 현재 캔버스 크기
    minX = Math.min(minX, 0);
    minY = Math.min(minY, 0);
    maxX = Math.max(maxX, this.app.screen.width);
    maxY = Math.max(maxY, this.app.screen.height);

    // 패딩 추가 (20px)
    const padding = 20;
    const newWidth = Math.max(this.app.screen.width, maxX - minX + padding * 2);
    const newHeight = Math.max(
      this.app.screen.height,
      maxY - minY + padding * 2
    );

    // 캔버스 크기가 변경이 필요한 경우에만 조절
    // resize는 오브젝트의 절대 좌표를 유지하므로 위치가 변하지 않습니다.
    if (
      newWidth > this.app.screen.width ||
      newHeight > this.app.screen.height
    ) {
      this.resize(newWidth, newHeight);
    }
  }

  // WebGL 최대 텍스처 크기 (대부분의 GPU는 4096 또는 8192)
  private getMaxTextureSize(): number {
    if (!this.app || !this.app.renderer) {
      return 4096; // 기본값
    }
    // PIXI의 WebGL 렌더러에서 최대 텍스처 크기 가져오기
    const gl = (this.app.renderer as any).gl;
    if (gl) {
      return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    }
    return 4096;
  }

  // 이미지 리사이즈 (WebGL 제한 내로)
  private async resizeImageIfNeeded(
    img: HTMLImageElement,
    maxSize: number
  ): Promise<HTMLImageElement> {
    const width = img.naturalWidth;
    const height = img.naturalHeight;

    // 크기가 제한 내이면 원본 반환
    if (width <= maxSize && height <= maxSize) {
      return img;
    }

    // 비율 유지하며 리사이즈
    let newWidth = width;
    let newHeight = height;

    if (width > maxSize) {
      newWidth = maxSize;
      newHeight = (height * maxSize) / width;
    }

    if (newHeight > maxSize) {
      newHeight = maxSize;
      newWidth = (width * maxSize) / height;
    }

    // Canvas를 사용하여 리사이즈
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(newWidth);
    canvas.height = Math.floor(newHeight);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn(
        "Canvas context를 가져올 수 없습니다. 원본 이미지를 사용합니다."
      );
      return img;
    }

    // 고품질 리사이즈
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Canvas를 이미지로 변환
    return new Promise<HTMLImageElement>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.warn("이미지 리사이즈 실패. 원본 이미지를 사용합니다.");
            resolve(img);
            return;
          }

          const resizedImg = new Image();
          resizedImg.crossOrigin = "anonymous";
          const objectUrl = URL.createObjectURL(blob);
          resizedImg.onload = () => {
            console.log(
              `이미지 리사이즈: ${width}x${height} -> ${canvas.width}x${canvas.height}`
            );
            // 이미지 로드 후 URL 정리 (메모리 관리)
            URL.revokeObjectURL(objectUrl);
            resolve(resizedImg);
          };
          resizedImg.onerror = () => {
            console.warn(
              "리사이즈된 이미지 로드 실패. 원본 이미지를 사용합니다."
            );
            URL.revokeObjectURL(objectUrl);
            resolve(img);
          };
          resizedImg.src = objectUrl;
        },
        "image/png",
        0.95
      );
    });
  }

  private async createTextureFromDataUrl(
    dataUrl: string,
    imageElement?: HTMLImageElement
  ): Promise<PIXI.Texture> {
    const maxTextureSize = this.getMaxTextureSize();

    if (imageElement) {
      // 이미지 크기 확인 및 리사이즈
      if (
        imageElement.naturalWidth > maxTextureSize ||
        imageElement.naturalHeight > maxTextureSize
      ) {
        const resizedImg = await this.resizeImageIfNeeded(
          imageElement,
          maxTextureSize
        );
        return PIXI.Texture.from(resizedImg);
      }
      return PIXI.Texture.from(imageElement);
    }

    return new Promise<PIXI.Texture>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = async () => {
        try {
          // 이미지 크기 확인 및 리사이즈
          if (
            img.naturalWidth > maxTextureSize ||
            img.naturalHeight > maxTextureSize
          ) {
            const resizedImg = await this.resizeImageIfNeeded(
              img,
              maxTextureSize
            );
            resolve(PIXI.Texture.from(resizedImg));
          } else {
            resolve(PIXI.Texture.from(img));
          }
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = (error) => reject(error);
      img.src = dataUrl;
    });
  }

  // 캔버스 지우기
  clear(): void {
    if (this.graphics) {
      this.graphics.clear();
    }
    this.clearAllObjects();
  }

  // 그리기 데이터 적용 (다른 사용자의 그리기)
  applyDrawingData(data: DrawingData): void {
    if (!this.app || !this.app.renderer || !this.graphics) {
      console.warn("Canvas가 아직 초기화되지 않았습니다.");
      return;
    }

    switch (data.type) {
      case "draw":
        if (data.x !== undefined && data.y !== undefined) {
          try {
            const color =
              typeof data.color === "string"
                ? parseInt(data.color.replace("#", ""), 16)
                : data.color || this.brushColor;
            // 점만 찍히는 문제를 방지하기 위해 작은 원으로 표시
            this.graphics.circle(
              data.x,
              data.y,
              (data.brushSize || this.brushSize) / 2
            );
            this.graphics.fill(color);
          } catch (error) {
            console.error("그리기 데이터 적용 중 오류:", error);
          }
        }
        break;
      case "clear":
        this.clear();
        break;
    }
  }

  // 원격 사용자의 그리기 데이터를 선으로 연결하여 적용
  applyRemoteDrawingData(userId: string, data: DrawingData): void {
    if (!this.app || !this.app.renderer || !this.graphics) return;

    switch (data.type) {
      case "draw": {
        const color =
          typeof data.color === "string"
            ? parseInt(data.color.replace("#", ""), 16)
            : data.color || this.brushColor;

        const prev = this.remoteUserIdToLastPoint.get(userId);
        if (prev) {
          // 떨어진 점들은 선으로 잇지 않도록 거리 임계값 적용
          const dx = data.x - prev.x;
          const dy = data.y - prev.y;
          const distance = Math.hypot(dx, dy);
          const size = data.brushSize || this.brushSize;
          const connectThreshold = Math.max(10, size * 3);

          if (distance <= connectThreshold) {
            try {
              this.graphics.setStrokeStyle({
                width: data.brushSize || this.brushSize,
                color,
              });
              this.graphics.moveTo(prev.x, prev.y);
              this.graphics.lineTo(data.x, data.y);
              this.graphics.stroke();
            } catch (error) {
              console.error("원격 선 연결 중 오류:", error);
            }
          } else {
            // 거리가 멀면 새로운 스트로크 시작(점)
            try {
              this.graphics.circle(
                data.x,
                data.y,
                (data.brushSize || this.brushSize) / 2
              );
              this.graphics.fill(color);
            } catch {}
          }
        } else {
          // 첫 포인트는 점으로 시작
          try {
            this.graphics.circle(
              data.x,
              data.y,
              (data.brushSize || this.brushSize) / 2
            );
            this.graphics.fill(color);
          } catch {}
        }

        this.remoteUserIdToLastPoint.set(userId, { x: data.x, y: data.y });
        break;
      }
      case "clear":
        this.clear();
        this.remoteUserIdToLastPoint.clear();
        break;
    }
  }

  // 원격 커서 업데이트
  updateRemoteCursor(
    userId: string,
    x: number,
    y: number,
    color: number
  ): void {
    if (!this.cursorLayer) return;

    let g = this.userIdToCursor.get(userId);
    if (!g) {
      g = new PIXI.Graphics();
      this.userIdToCursor.set(userId, g);
      this.cursorLayer.addChild(g);
    }

    try {
      g.clear();
      g.circle(x, y, 6);
      g.fill(color);
      // 테두리로 가시성 향상
      g.setStrokeStyle({ width: 2, color: 0x000000 });
      g.stroke();
    } catch (e) {
      // 무시
    }
  }

  // 원격 커서 숨기기
  hideRemoteCursor(userId: string): void {
    const g = this.userIdToCursor.get(userId);
    if (g && this.cursorLayer) {
      try {
        this.cursorLayer.removeChild(g);
      } catch {}
    }
    this.userIdToCursor.delete(userId);
  }

  // 원격 사용자의 경로(연결 기준점) 초기화
  resetRemotePath(userId: string): void {
    this.remoteUserIdToLastPoint.delete(userId);
  }

  // 캔버스 크기 조정
  // PIXI renderer.resize()를 호출하면 자동으로:
  // - app.renderer.width/height 업데이트
  // - app.screen.width/height 업데이트
  // - app.canvas (DOM 요소) 크기 자동 조절
  resize(width: number, height: number): void {
    if (this.app && this.app.renderer) {
      const beforeSize = {
        width: this.app.screen.width,
        height: this.app.screen.height,
      };
      
      
      // PIXI renderer와 screen 크기 모두 자동 업데이트됨
      // app.renderer.resize()는 내부적으로 app.screen 크기도 업데이트하고
      // app.canvas DOM 요소의 크기도 자동으로 조절함
      this.app.renderer.resize(width, height);
      
      // hitArea 업데이트 (캔버스 크기 변경 시 좌표 변환 정확도 유지)
      if (this.app.stage) {
        this.app.stage.hitArea = this.app.screen;
      }

      // resize 후 배경 이미지가 (0, 0)에 위치하도록 보장
      if (this.backgroundSprite && this.backgroundLayer) {
        this.backgroundLayer.position.set(0, 0);
        this.backgroundSprite.position.set(0, 0);
        this.backgroundSprite.anchor.set(0, 0);
      }

      // 실제로 업데이트되었는지 확인
      const afterSize = {
        width: this.app.screen.width,
        height: this.app.screen.height,
        canvasWidth: this.app.canvas?.width,
        canvasHeight: this.app.canvas?.height,
      };

      // adjustCanvasSizeForObjects는 resize를 호출할 수 있으므로 여기서 호출하면 무한 루프 발생
      // 따라서 resize에서는 크기만 조정하고, adjustCanvasSizeForObjects는 객체 추가 시에만 호출
    } else {
    }
  }

  // 리소스 정리
  destroy(): void {
    const app = this.app;
    if (!app) return;

    // 참조를 먼저 null로 설정하여 중복 호출 방지
    this.app = null as any;

    try {
      // ticker 먼저 중지 (렌더링 중지)
      try {
        if (app.ticker && app.ticker.started) {
          app.ticker.stop();
        }
      } catch (tickerError) {
        // 무시
      }

      // canvas를 DOM에서 제거
      try {
        if ("canvas" in app && app.canvas) {
          const canvas = app.canvas as HTMLCanvasElement;
          if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
          }
        }
      } catch (removeError) {
        // 무시
      }

      // 렌더러 정리
      try {
        if (app.renderer && typeof app.renderer.destroy === "function") {
          app.renderer.destroy();
        }
      } catch (rendererError) {
        // 무시
      }

      // 앱 정리 (이것이 renderer도 정리함)
      try {
        if (typeof app.destroy === "function") {
          app.destroy(true);
        }
      } catch (destroyError) {
        // 무시
      }
    } catch (error) {
      // 모든 오류 무시 - 이미 정리 중임
    }
  }

  // 그리기 데이터 가져오기 (저장용)
  getDrawingData(): any {
    if (!this.app) return null;

    // 실제 구현에서는 더 복잡한 데이터 구조를 사용할 수 있습니다
    return {
      graphics: this.graphics,
      width: this.app.screen.width,
      height: this.app.screen.height,
    };
  }

  // 그리기 이벤트 콜백 설정
  setOnDrawStart(callback: (x: number, y: number) => void): void {
    this.onDrawStart = callback;
  }

  setOnDrawContinue(callback: (x: number, y: number) => void): void {
    this.onDrawContinue = callback;
  }

  setOnDrawEnd(callback: () => void): void {
    this.onDrawEnd = callback;
  }

  setOnShapeComplete(
    callback: (shape: {
      tool: string;
      x: number;
      y: number;
      x2: number;
      y2: number;
    }) => void
  ): void {
    this.onShapeComplete = callback;
  }

  setOnTextInput(callback: (x: number, y: number, text: string) => void): void {
    this.onTextInput = callback;
  }

  setOnObjectMoved(callback: (id: string, x: number, y: number) => void): void {
    this.onObjectMoved = callback;
  }

  setOnObjectTransformed(
    callback: (id: string, updates: Partial<CanvasObject>) => void
  ): void {
    this.onObjectTransformed = callback;
  }

  addTextObject(
    id: string,
    x: number,
    y: number,
    text: string,
    fontSize: number,
    color: string
  ): void {
    if (!this.objectsLayer) return;

    try {
      const colorNum = parseInt(color.replace("#", ""), 16);
      const container = new PIXI.Container();
      const textObj = new PIXI.Text({
        text,
        style: {
          fontSize,
          fill: colorNum,
        },
      });
      textObj.position.set(0, 0);
      container.addChild(textObj);
      container.position.set(x, y);
      // eventMode는 attachObjectInteraction에서 설정됨

      this.objectsLayer.addChild(container);
      this.canvasObjects.set(id, container);
      this.canvasObjectMetadata.set(id, { type: "text" });

      this.attachObjectInteraction(container, id);
    } catch (error) {
      console.error("텍스트 객체 추가 실패:", error);
    }
  }

  addShapeObject(
    id: string,
    tool: "rectangle" | "circle" | "line",
    x: number,
    y: number,
    x2: number,
    y2: number,
    brushSize: number,
    color: string
  ): void {
    if (!this.objectsLayer) return;

    try {
      const colorNum = parseInt(color.replace("#", ""), 16);
      const container = new PIXI.Container();
      const graphics = new PIXI.Graphics();

      graphics.setStrokeStyle({ width: brushSize, color: colorNum });

      switch (tool) {
        case "rectangle":
          graphics.rect(0, 0, x2 - x, y2 - y);
          graphics.stroke();
          break;
        case "circle":
          const radius = Math.hypot(x2 - x, y2 - y);
          graphics.circle(0, 0, radius);
          graphics.stroke();
          break;
        case "line":
          graphics.moveTo(0, 0);
          graphics.lineTo(x2 - x, y2 - y);
          graphics.stroke();
          break;
      }

      container.addChild(graphics);
      container.position.set(x, y);
      // eventMode는 attachObjectInteraction에서 설정됨

      this.objectsLayer.addChild(container);
      this.canvasObjects.set(id, container);
      this.canvasObjectMetadata.set(id, { type: "shape" });

      this.attachObjectInteraction(container, id);
    } catch (error) {
      console.error("도형 객체 추가 실패:", error);
    }
  }

  async addImageObject(
    id: string,
    dataUrl: string,
    x: number,
    y: number,
    width?: number,
    height?: number,
    scale: number = 1,
    imageElement?: HTMLImageElement
  ): Promise<void> {
    if (!this.objectsLayer) return;

    try {
      const texture = await this.createTextureFromDataUrl(
        dataUrl,
        imageElement
      );

      // 텍스처 필터링 설정 (고품질)
      if (texture.baseTexture) {
        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      }

      const container = new PIXI.Container();
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(0, 0);

      // baseWidth와 baseHeight 계산 (메타데이터용)
      const baseWidth = width ?? texture.width;
      const baseHeight = height ?? texture.height;

      // 스케일이 제공되면 스케일 사용 (원본 품질 유지), 아니면 width/height 사용
      if (scale !== 1) {
        // 스케일 사용: 원본 이미지 품질 유지
        container.scale.set(scale);
      } else {
        // width/height 사용: 명시적 크기 설정
        const targetWidth = width ?? texture.width;
        const targetHeight = height ?? texture.height;

        // 스프라이트 크기 설정 (비율 유지)
        if (targetWidth && targetHeight) {
          sprite.width = targetWidth;
          sprite.height = targetHeight;
        } else if (targetWidth) {
          sprite.width = targetWidth;
          sprite.height = (texture.height / texture.width) * targetWidth;
        } else if (targetHeight) {
          sprite.height = targetHeight;
          sprite.width = (texture.width / texture.height) * targetHeight;
        }
      }

      container.addChild(sprite);
      container.position.set(x, y);
      // eventMode는 attachObjectInteraction에서 설정됨

      this.objectsLayer.addChild(container);
      this.canvasObjects.set(id, container);
      this.canvasObjectMetadata.set(id, {
        type: "image",
        baseWidth,
        baseHeight,
        scale,
      });

      this.attachObjectInteraction(container, id);

      // 렌더링을 위해 다음 프레임까지 대기
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // 오브젝트 추가 후 캔버스 크기 조절 (기존 오브젝트 위치 보존)
      // adjustCanvasSizeForObjects는 기존 오브젝트의 절대 좌표를 유지하므로
      // 위치가 변하지 않습니다.
      this.adjustCanvasSizeForObjects();
    } catch (error) {
      console.error("이미지 객체 추가 실패:", error);
      throw error;
    }
  }

  private attachObjectInteraction(
    container: PIXI.Container,
    objectId: string
  ): void {
    let dragData: {
      startX: number;
      startY: number;
      objX: number;
      objY: number;
    } | null = null;

    const handlePointerDown = (event: PIXI.FederatedPointerEvent) => {
      // Transform 모드가 아닐 때는 이벤트를 통과시킴 (그리기 허용)
      if (!this.isTransformMode && !this.isTransformHotkey) {
        return; // 이벤트를 통과시키기 위해 stopPropagation을 호출하지 않음
      }
      event.stopPropagation();

      // 오버레이 이미지를 선택하고 Transform 대상으로 설정
      this.selectObject(objectId);
      
      // Transform 오버레이 업데이트 (핸들 표시)
      this.updateTransformOverlay();
      
      const global = event.global;
      dragData = {
        startX: global.x,
        startY: global.y,
        objX: container.x,
        objY: container.y,
      };
    };

    const handlePointerMove = (event: PIXI.FederatedPointerEvent) => {
      if (!dragData || (!this.isTransformMode && !this.isTransformHotkey)) {
        return; // 이벤트를 통과시킴
      }
      event.stopPropagation();

      const global = event.global;
      const dx = global.x - dragData.startX;
      const dy = global.y - dragData.startY;
      container.position.set(dragData.objX + dx, dragData.objY + dy);
      this.updateObjectSelectionBox();
      this.updateTransformOverlay();
    };

    const handlePointerUp = (event: PIXI.FederatedPointerEvent) => {
      if (!dragData) {
        return; // 이벤트를 통과시킴
      }
      event.stopPropagation();

      dragData = null;
      this.onObjectMoved?.(objectId, container.x, container.y);
    };

    const handlePointerUpOutside = (event: PIXI.FederatedPointerEvent) => {
      dragData = null;
    };

    // 이벤트 핸들러를 컨테이너에 저장하여 나중에 제거/재등록할 수 있도록 함
    (container as any).__objectInteractionHandlers = {
      pointerdown: handlePointerDown,
      pointermove: handlePointerMove,
      pointerup: handlePointerUp,
      pointerupoutside: handlePointerUpOutside,
    };

    container.on("pointerdown", handlePointerDown);
    container.on("pointermove", handlePointerMove);
    container.on("pointerup", handlePointerUp);
    container.on("pointerupoutside", handlePointerUpOutside);

    // 현재 Transform 모드 상태에 따라 eventMode 설정
    this.updateObjectEventMode(container);
  }

  /**
   * Transform 모드 상태에 따라 단일 객체의 eventMode를 업데이트합니다.
   * Transform 모드가 아닐 때는 이벤트가 통과되도록 eventMode를 "none"으로 설정합니다.
   */
  private updateObjectEventMode(container: PIXI.Container): void {
    const handlers = (container as any).__objectInteractionHandlers;
    
    if (this.isTransformMode || this.isTransformHotkey) {
      // Transform 모드일 때는 이벤트를 받을 수 있도록 설정
      container.eventMode = "static";
      container.cursor = "move";
      
      // 컨테이너의 모든 자식 요소(스프라이트 등)도 이벤트를 받을 수 있도록 설정
      container.children.forEach((child) => {
        // eventMode 속성이 있는 모든 자식 요소에 대해 설정
        if ('eventMode' in child && typeof (child as any).eventMode !== 'undefined') {
          (child as any).eventMode = "static";
        }
      });
      
      // 핸들러 재등록 (이미 등록되어 있어도 안전)
      if (handlers) {
        container.on("pointerdown", handlers.pointerdown);
        container.on("pointermove", handlers.pointermove);
        container.on("pointerup", handlers.pointerup);
        container.on("pointerupoutside", handlers.pointerupoutside);
      }
    } else {
      // Transform 모드가 아닐 때는 이벤트가 통과되도록 설정
      // "none" 모드는 이벤트를 받지 않아서 stage까지 전파됩니다
      container.eventMode = "none";
      container.cursor = "default";
      container.hitArea = null;
      
      // 컨테이너의 모든 자식 요소(스프라이트 등)도 이벤트를 받지 않도록 설정
      // 이렇게 하면 이미지 위에서도 그리기가 가능합니다
      container.children.forEach((child) => {
        // eventMode 속성이 있는 모든 자식 요소에 대해 설정
        if ('eventMode' in child && typeof (child as any).eventMode !== 'undefined') {
          (child as any).eventMode = "none";
        }
        // hitArea 속성이 있는 경우 null로 설정
        if ('hitArea' in child && typeof (child as any).hitArea !== 'undefined') {
          (child as any).hitArea = null;
        }
      });
    }
  }

  /**
   * Transform 모드 상태에 따라 모든 객체의 eventMode를 업데이트합니다.
   * Transform 모드가 아닐 때는 오버레이 이미지 위에 그림을 그릴 수 있도록 합니다.
   */
  private updateObjectsEventMode(): void {
    this.canvasObjects.forEach((container) => {
      this.updateObjectEventMode(container);
    });
  }

  private selectObject(id: string): void {
    this.selectedObjectId = id;
    const meta = this.canvasObjectMetadata.get(id);
    if (meta?.type === "image") {
      this.transformObjectId = id;
    } else {
      this.transformObjectId = null;
    }
    this.updateObjectSelectionBox();
    this.updateTransformOverlay();
  }

  private updateObjectSelectionBox(): void {
    if (!this.selectedObjectId || !this.objectsLayer) {
      if (this.selectedObjectGraphics) {
        this.selectedObjectGraphics.clear();
        this.selectedObjectGraphics.visible = false;
      }
      return;
    }

    const obj = this.canvasObjects.get(this.selectedObjectId);
    if (!obj) return;

    if (!this.selectedObjectGraphics) {
      this.selectedObjectGraphics = new PIXI.Graphics();
      this.objectsLayer.addChild(this.selectedObjectGraphics);
    }

    const bounds = obj.getBounds();
    this.selectedObjectGraphics.clear();
    this.selectedObjectGraphics.lineStyle(2, 0x00aaff, 1);
    this.selectedObjectGraphics.rect(
      bounds.x - 4,
      bounds.y - 4,
      bounds.width + 8,
      bounds.height + 8
    );
    this.selectedObjectGraphics.visible = true;
  }

  clearObjectSelection(): void {
    this.selectedObjectId = null;
    this.transformObjectId = null;
    this.updateObjectSelectionBox();
    this.updateTransformOverlay();
  }

  removeObject(id: string): void {
    const obj = this.canvasObjects.get(id);
    if (obj && this.objectsLayer) {
      this.objectsLayer.removeChild(obj);
      obj.destroy();
      this.canvasObjects.delete(id);
      this.canvasObjectMetadata.delete(id);
      if (this.selectedObjectId === id) {
        this.clearObjectSelection();
      }
      if (this.transformObjectId === id) {
        this.transformObjectId = null;
        this.updateTransformOverlay();
      }
    }
  }

  clearAllObjects(): void {
    this.canvasObjects.forEach((obj) => {
      this.objectsLayer?.removeChild(obj);
      obj.destroy();
    });
    this.canvasObjects.clear();
    this.canvasObjectMetadata.clear();
    this.clearObjectSelection();
    this.transformObjectId = null;
    this.updateTransformOverlay();
  }

  getObjectIds(): string[] {
    return Array.from(this.canvasObjects.keys());
  }

  /**
   * 모든 객체의 bounds 정보를 반환합니다 (미리보기 네비게이션용)
   */
  getAllObjectsBounds(): Array<{
    id: string;
    type: "text" | "shape" | "image" | "background";
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const bounds: Array<{
      id: string;
      type: "text" | "shape" | "image" | "background";
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    // 배경 이미지 bounds (실제 그려진 영역 사용)
    if (this.backgroundSprite && this.backgroundOriginalSize) {
      // 실제 그려진 영역을 정확히 가져오기 위해 getBounds(true) 사용
      const bgBounds = this.backgroundSprite.getBounds(true);
      bounds.push({
        id: "background",
        type: "background",
        x: Math.max(0, bgBounds.x), // 음수 좌표 방지
        y: Math.max(0, bgBounds.y), // 음수 좌표 방지
        width: bgBounds.width,
        height: bgBounds.height,
      });
      
      // 배경 이미지 bounds 계산
    }

    // 모든 객체 bounds
    this.canvasObjects.forEach((obj, id) => {
      const objBounds = obj.getBounds(true);
      const metadata = this.canvasObjectMetadata.get(id);
      bounds.push({
        id,
        type: metadata?.type || "image",
        x: objBounds.x,
        y: objBounds.y,
        width: objBounds.width,
        height: objBounds.height,
      });
    });

    return bounds;
  }

  /**
   * 캔버스의 썸네일 이미지를 생성합니다 (미리보기 네비게이션용)
   * WebGL 제한을 피하기 위해 원본 캔버스를 직접 사용하고 타일링 방식으로 처리
   */
  getThumbnailDataUrl(
    maxWidth: number = 200,
    maxHeight: number = 300
  ): string | null {
    if (!this.app || !this.app.renderer || !this.app.stage) {
      console.warn("썸네일 생성: PIXI 앱이 초기화되지 않음");
      return null;
    }

    try {
      // 실제 내용 범위 계산
      const allBounds = this.getAllObjectsBounds();
      
      let contentMinX: number;
      let contentMinY: number;
      let contentWidth: number;
      let contentHeight: number;
      
      if (allBounds.length === 0) {
        // 내용이 없으면 기본 크기 사용
        const canvasWidth = this.app.screen.width;
        const canvasHeight = this.app.screen.height;
        if (canvasWidth === 0 || canvasHeight === 0) {
          console.warn("썸네일 생성: 캔버스 크기가 0");
          return null;
        }
        contentMinX = 0;
        contentMinY = 0;
        contentWidth = canvasWidth;
        contentHeight = canvasHeight;
        
      } else {
        // 실제 렌더링된 픽셀을 확인하여 여백 제거
        // 먼저 렌더링 강제 업데이트
        this.app.renderer.render(this.app.stage);
        const canvas = this.app.canvas as HTMLCanvasElement;
        
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          // 캔버스의 픽셀 데이터를 읽어서 실제로 그려진 영역 찾기
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext("2d");
          
          if (tempCtx) {
            // 원본 캔버스를 임시 캔버스에 복사
            tempCtx.drawImage(canvas, 0, 0);
            const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // 투명하지 않은 픽셀의 최소/최대 좌표 찾기
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            
            for (let y = 0; y < canvas.height; y++) {
              for (let x = 0; x < canvas.width; x++) {
                const index = (y * canvas.width + x) * 4;
                const alpha = data[index + 3]; // Alpha 채널
                
                // 투명하지 않은 픽셀 (alpha > 0)
                if (alpha > 0) {
                  minX = Math.min(minX, x);
                  minY = Math.min(minY, y);
                  maxX = Math.max(maxX, x);
                  maxY = Math.max(maxY, y);
                }
              }
            }
            
            // 실제 내용 범위
            if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
              contentMinX = Math.max(0, minX);
              contentMinY = Math.max(0, minY);
              contentWidth = maxX - contentMinX + 1; // +1은 마지막 픽셀 포함
              contentHeight = maxY - contentMinY + 1;
              
            } else {
              // 픽셀 분석 실패 시 bounds 기반 계산으로 폴백
              let boundsMinX = Infinity;
              let boundsMinY = Infinity;
              let boundsMaxX = -Infinity;
              let boundsMaxY = -Infinity;
              
              allBounds.forEach(bound => {
                boundsMinX = Math.min(boundsMinX, bound.x);
                boundsMinY = Math.min(boundsMinY, bound.y);
                boundsMaxX = Math.max(boundsMaxX, bound.x + bound.width);
                boundsMaxY = Math.max(boundsMaxY, bound.y + bound.height);
              });
              
              contentMinX = Math.max(0, boundsMinX);
              contentMinY = Math.max(0, boundsMinY);
              contentWidth = Math.min(boundsMaxX, this.app.screen.width) - contentMinX;
              contentHeight = Math.min(boundsMaxY, this.app.screen.height) - contentMinY;
              
            }
          } else {
            // 2D 컨텍스트를 가져올 수 없으면 bounds 기반 계산
            let boundsMinX = Infinity;
            let boundsMinY = Infinity;
            let boundsMaxX = -Infinity;
            let boundsMaxY = -Infinity;
            
            allBounds.forEach(bound => {
              boundsMinX = Math.min(boundsMinX, bound.x);
              boundsMinY = Math.min(boundsMinY, bound.y);
              boundsMaxX = Math.max(boundsMaxX, bound.x + bound.width);
              boundsMaxY = Math.max(boundsMaxY, bound.y + bound.height);
            });
            
            contentMinX = Math.max(0, boundsMinX);
            contentMinY = Math.max(0, boundsMinY);
            contentWidth = Math.min(boundsMaxX, this.app.screen.width) - contentMinX;
            contentHeight = Math.min(boundsMaxY, this.app.screen.height) - contentMinY;
          }
        } else {
          // 캔버스가 없으면 bounds 기반 계산
          let boundsMinX = Infinity;
          let boundsMinY = Infinity;
          let boundsMaxX = -Infinity;
          let boundsMaxY = -Infinity;
          
          allBounds.forEach(bound => {
            boundsMinX = Math.min(boundsMinX, bound.x);
            boundsMinY = Math.min(boundsMinY, bound.y);
            boundsMaxX = Math.max(boundsMaxX, bound.x + bound.width);
            boundsMaxY = Math.max(boundsMaxY, bound.y + bound.height);
          });
          
          contentMinX = Math.max(0, boundsMinX);
          contentMinY = Math.max(0, boundsMinY);
          contentWidth = Math.min(boundsMaxX, this.app.screen.width) - contentMinX;
          contentHeight = Math.min(boundsMaxY, this.app.screen.height) - contentMinY;
        }
      }

      if (contentWidth === 0 || contentHeight === 0) {
        console.warn("썸네일 생성: 내용 범위가 0");
        return null;
      }

      // WebGL 최대 텍스처 크기 확인
      const maxTextureSize = this.getMaxTextureSize();

      // 스케일 계산 (캔버스 전체의 비율 유지하면서 최대 크기 내에 맞춤)
      const scaleX = maxWidth / contentWidth;
      const scaleY = maxHeight / contentHeight;
      const scale = Math.min(scaleX, scaleY);

      // 썸네일 크기 (캔버스 전체를 포함하도록 정확히 계산)
      const thumbnailWidth = Math.ceil(contentWidth * scale);
      const thumbnailHeight = Math.ceil(contentHeight * scale);

      // 렌더링 강제 업데이트 (모든 내용이 렌더링되도록)
      this.app.renderer.render(this.app.stage);

      // 원본 캔버스 직접 사용 (WebGL 제한 회피)
      const canvas = this.app.canvas as HTMLCanvasElement;
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        console.warn("썸네일 생성: 원본 캔버스가 유효하지 않음");
        return null;
      }

      // 캔버스가 WebGL 제한보다 크면 타일링 방식으로 처리
      if (contentWidth > maxTextureSize || contentHeight > maxTextureSize) {
        return this.createThumbnailByTiling(
          canvas,
          contentWidth,
          contentHeight,
          thumbnailWidth,
          thumbnailHeight,
          maxTextureSize,
          contentMinX,
          contentMinY
        );
      }

      // 일반적인 경우: 직접 스케일링
      const thumbnailCanvas = document.createElement("canvas");
      thumbnailCanvas.width = thumbnailWidth;
      thumbnailCanvas.height = thumbnailHeight;
      const ctx = thumbnailCanvas.getContext("2d");
      if (!ctx) {
        console.warn("썸네일 생성: 2D 컨텍스트를 가져올 수 없음");
        return null;
      }

      // 고품질 스케일링
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // 전체 캔버스를 썸네일로 변환 (좌표 변환을 간단하게 하기 위해)
      // 전체 캔버스 크기로 썸네일 크기 재계산
      const fullCanvasWidth = this.app.screen.width;
      const fullCanvasHeight = this.app.screen.height;
      const fullScaleX = maxWidth / fullCanvasWidth;
      const fullScaleY = maxHeight / fullCanvasHeight;
      const fullScale = Math.min(fullScaleX, fullScaleY);
      const fullThumbnailWidth = Math.ceil(fullCanvasWidth * fullScale);
      const fullThumbnailHeight = Math.ceil(fullCanvasHeight * fullScale);
      
      // 썸네일 캔버스 크기 조정
      thumbnailCanvas.width = fullThumbnailWidth;
      thumbnailCanvas.height = fullThumbnailHeight;
      
      // 전체 캔버스를 썸네일로 그리기
      ctx.drawImage(
        canvas,
        0,
        0,
        fullCanvasWidth,
        fullCanvasHeight, // 소스 영역 (전체 캔버스)
        0,
        0,
        fullThumbnailWidth,
        fullThumbnailHeight // 타겟 영역
      );

      const dataUrl = thumbnailCanvas.toDataURL("image/png");
      
      // dataUrl이 유효한지 확인
      if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) {
        // dataUrl이 유효하지 않음, renderer.extract 사용
        // WebGL 캔버스는 직접 toDataURL이 작동하지 않을 수 있으므로 renderer.extract 사용
        try {
          const extractedCanvas = this.app.renderer.extract.canvas(this.app.stage);
          if (extractedCanvas && extractedCanvas.width > 0 && extractedCanvas.height > 0) {
            const htmlCanvas = extractedCanvas as unknown as HTMLCanvasElement;
            // 전체 캔버스를 썸네일로 변환
            const fullDataUrl = htmlCanvas.toDataURL("image/png");
            if (fullDataUrl && fullDataUrl !== "data:," && fullDataUrl.length > 100) {
              return fullDataUrl;
            }
          }
        } catch (error) {
          console.error("🟢 [썸네일 생성] renderer.extract 실패:", error);
        }
        return null;
      }
      
      
      return dataUrl;
    } catch (error) {
      console.error("썸네일 생성 실패:", error);
      return null;
    }
  }

  /**
   * 큰 캔버스를 타일링 방식으로 썸네일 생성 (WebGL 제한 회피)
   */
  private createThumbnailByTiling(
    sourceCanvas: HTMLCanvasElement,
    sourceWidth: number,
    sourceHeight: number,
    thumbnailWidth: number,
    thumbnailHeight: number,
    maxTextureSize: number,
    offsetX: number = 0,
    offsetY: number = 0
  ): string | null {
    try {
      const thumbnailCanvas = document.createElement("canvas");
      thumbnailCanvas.width = thumbnailWidth;
      thumbnailCanvas.height = thumbnailHeight;
      const ctx = thumbnailCanvas.getContext("2d");
      if (!ctx) {
        return null;
      }

      // 고품질 스케일링
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // 타일 크기 계산 (WebGL 제한 내)
      const tileSize = Math.min(maxTextureSize, 4096);
      const scaleX = thumbnailWidth / sourceWidth;
      const scaleY = thumbnailHeight / sourceHeight;

      // 타일 단위로 그리기
      for (let y = 0; y < sourceHeight; y += tileSize) {
        for (let x = 0; x < sourceWidth; x += tileSize) {
          const tileWidth = Math.min(tileSize, sourceWidth - x);
          const tileHeight = Math.min(tileSize, sourceHeight - y);

          const tileCanvas = document.createElement("canvas");
          tileCanvas.width = tileWidth;
          tileCanvas.height = tileHeight;
          const tileCtx = tileCanvas.getContext("2d");
          if (!tileCtx) continue;

          // 타일 영역 복사 (offset을 고려하여 실제 내용 영역만)
          tileCtx.drawImage(
            sourceCanvas,
            offsetX + x,
            offsetY + y,
            tileWidth,
            tileHeight,
            0,
            0,
            tileWidth,
            tileHeight
          );

          // 썸네일 캔버스에 스케일링하여 그리기 (정확한 좌표 계산)
          const destX = Math.floor(x * scaleX);
          const destY = Math.floor(y * scaleY);
          const destWidth = Math.ceil(tileWidth * scaleX);
          const destHeight = Math.ceil(tileHeight * scaleY);
          ctx.drawImage(
            tileCanvas,
            0,
            0,
            tileWidth,
            tileHeight, // 소스 영역 (전체 타일)
            destX,
            destY,
            destWidth,
            destHeight // 타겟 영역
          );
        }
      }

      const dataUrl = thumbnailCanvas.toDataURL("image/png");
      
      // dataUrl이 유효한지 확인
      if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) {
        // 타일링 dataUrl이 유효하지 않음
        return null;
      }
      
      return dataUrl;
    } catch (error) {
      console.error("타일링 썸네일 생성 실패:", error);
      return null;
    }
  }

  updateObjectPosition(id: string, x: number, y: number): void {
    const obj = this.canvasObjects.get(id);
    if (obj) {
      obj.position.set(x, y);
      if (this.selectedObjectId === id) {
        this.updateObjectSelectionBox();
        this.updateTransformOverlay();
      }
      // 오브젝트 위치 변경 후 캔버스 크기 조절
      this.adjustCanvasSizeForObjects();
    }
  }

  updateImageObjectScale(id: string, scale: number): void {
    const container = this.canvasObjects.get(id);
    if (!container) return;
    container.scale.set(scale);
    const meta = this.canvasObjectMetadata.get(id);
    if (meta) {
      meta.scale = scale;
    }
    if (this.selectedObjectId === id) {
      this.updateObjectSelectionBox();
      this.updateTransformOverlay();
    }
  }

  setOnBackgroundScaleChange(callback?: (scale: number) => void): void {
    this.onBackgroundScaleChange = callback;
  }

  setOnBackgroundTransformChange(
    callback?: (state: { x: number; y: number; scale: number }) => void
  ): void {
    this.onBackgroundTransformChange = callback;
  }

  // 이미지 로드 및 배경으로 설정
  async loadImageFromFile(file: File, maxWidth?: number): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("이미지 데이터를 읽을 수 없습니다."));
        }
      };
      reader.onerror = () =>
        reject(new Error("이미지를 읽는 중 오류가 발생했습니다."));
      reader.readAsDataURL(file);
    });

    await this.loadImageFromDataUrl(dataUrl, maxWidth);
    return dataUrl;
  }

  async loadImageFromDataUrl(
    dataUrl: string,
    maxWidth?: number
  ): Promise<void> {
    if (!this.backgroundLayer) {
      console.error("배경 레이어가 초기화되지 않았습니다.");
      return;
    }

    try {
      // 이미지 정보 먼저 확인
      let texture = await this.createTextureFromDataUrl(dataUrl);

      // 가로 크기 제한 적용
      if (maxWidth && texture && texture.width > maxWidth) {
        // 이미지를 리사이즈하기 위해 Image 객체로 다시 로드
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("이미지 로드 실패"));
          img.src = dataUrl;
        });

        const aspectRatio = img.height / img.width;
        const newWidth = maxWidth;
        const newHeight = maxWidth * aspectRatio;

        // Canvas를 사용하여 이미지 리사이즈 (고품질)
        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext("2d", {
          willReadFrequently: false,
          alpha: true,
          desynchronized: false,
        });
        if (ctx) {
          // 고품질 이미지 스무딩 설정
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          texture = PIXI.Texture.from(canvas);
          // PIXI 텍스처 필터링 설정
          if (texture.baseTexture) {
            texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
          }
        }
      }

      if (!texture) {
        throw new Error("이미지 텍스처 로드 실패");
      }

      this.applyBackgroundTexture(texture, dataUrl);
    } catch (error) {
      console.error("이미지 로드 실패:", error);
      throw error;
    }
  }

  // 이미지 URL로 로드
  async loadImageFromUrl(url: string): Promise<void> {
    if (!this.backgroundLayer) {
      console.error("배경 레이어가 초기화되지 않았습니다.");
      return;
    }

    try {
      // HTML Image를 사용하여 URL 로드
      const image = new Image();
      image.crossOrigin = "anonymous"; // CORS 허용

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = (err) => reject(new Error("이미지 로드 실패"));
        image.src = url;
      });

      // createTextureFromDataUrl을 사용하여 WebGL 제한 처리
      // URL을 dataUrl로 변환 (또는 imageElement를 직접 전달)
      const texture = await this.createTextureFromDataUrl(url, image);

      if (!texture) {
        throw new Error("이미지 텍스처 로드 실패");
      }

      this.applyBackgroundTexture(texture, url);
    } catch (error) {
      console.error("이미지 로드 실패:", error);
      throw error;
    }
  }

  private applyBackgroundTexture(
    texture: PIXI.Texture,
    dataUrl?: string
  ): void {
    console.log("🔵 [배경이미지] applyBackgroundTexture 시작");
    console.log(
      "🔵 [배경이미지] 원본 크기:",
      texture.width,
      "x",
      texture.height
    );

    if (!this.backgroundLayer || !this.app) {
      console.error("❌ [배경이미지] backgroundLayer 또는 app이 없음");
      return;
    }

    console.log(
      "🔵 [배경이미지] 현재 캔버스 크기:",
      this.app.screen.width,
      "x",
      this.app.screen.height
    );

    // 이전 이미지 제거
    if (this.backgroundSprite) {
      this.detachBackgroundInteraction(this.backgroundSprite);
      this.backgroundLayer.removeChild(this.backgroundSprite);
      this.backgroundSprite.destroy();
      this.stopBackgroundDrag();
    }

    // 텍스처 필터링 설정 (고품질)
    if (texture.baseTexture) {
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    }

    this.backgroundSprite = new PIXI.Sprite(texture);
    // 배경 이미지는 왼쪽 상단 모서리(0, 0)에서 시작 (항상 고정)
    this.backgroundSprite.anchor.set(0, 0);
    this.backgroundSprite.position.set(0, 0);
    console.log(
      "🔵 [배경이미지] 스프라이트 생성, anchor: (0, 0), position: (0, 0)"
    );

    this.backgroundOriginalSize = {
      width: texture.width,
      height: texture.height,
    };

    this.backgroundDataUrl = dataUrl ?? this.backgroundDataUrl;

    const fitScale = this.calculateFitScaleForSize(
      texture.width,
      texture.height
    );
    console.log("🔵 [배경이미지] 계산된 스케일:", fitScale);

    this.backgroundScale = fitScale;
    this.backgroundSprite.scale.set(this.backgroundScale);
    console.log(
      "🔵 [배경이미지] 스프라이트 스케일 적용:",
      this.backgroundScale
    );
    console.log(
      "🔵 [배경이미지] 스케일된 크기:",
      texture.width * this.backgroundScale,
      "x",
      texture.height * this.backgroundScale
    );

    this.onBackgroundScaleChange?.(this.backgroundScale);

    // 배경 이미지는 항상 고정이므로 상호작용 비활성화
    this.detachBackgroundInteraction(this.backgroundSprite);
    this.backgroundLayer.addChild(this.backgroundSprite);
    this.updateTransformOverlay();

    // 배경 이미지를 가로폭에 맞춰 스케일링했으므로,
    // 세로 방향으로 잘리지 않도록 캔버스 높이를 이미지 높이에 맞게 확장합니다.
    const scaledHeight = texture.height * this.backgroundScale;
    const scaledWidth = texture.width * this.backgroundScale;
    console.log(
      "🔵 [배경이미지] 스케일된 크기:",
      scaledWidth,
      "x",
      scaledHeight
    );
    console.log(
      "🔵 [배경이미지] 현재 캔버스 크기:",
      this.app.screen.width,
      "x",
      this.app.screen.height
    );

    // 배경 이미지가 캔버스 크기를 넘어가지 않도록 확인
    if (scaledWidth > this.app.screen.width) {
      console.warn(
        "⚠️ [배경이미지] 스케일된 가로 크기가 캔버스보다 큼:",
        scaledWidth,
        ">",
        this.app.screen.width
      );
      // 가로 크기에 맞춰 스케일 재조정
      const correctedScale = this.app.screen.width / texture.width;
      console.log("🔵 [배경이미지] 스케일 재조정:", correctedScale);
      this.backgroundScale = correctedScale;
      this.backgroundSprite.scale.set(this.backgroundScale);
      const newScaledHeight = texture.height * this.backgroundScale;
      const newScaledWidth = texture.width * this.backgroundScale;
      console.log(
        "🔵 [배경이미지] 재조정된 크기:",
        newScaledWidth,
        "x",
        newScaledHeight
      );

      // 캔버스 높이를 재조정된 이미지 높이에 맞춤
      if (newScaledHeight > this.app.screen.height) {
        console.log(
          "🔵 [배경이미지] 캔버스 높이 확장:",
          this.app.screen.width,
          "x",
          newScaledHeight
        );
        this.resize(this.app.screen.width, newScaledHeight);
      } else {
        console.log(
          "🔵 [배경이미지] 캔버스 높이 유지 (이미지가 작음):",
          this.app.screen.width,
          "x",
          this.app.screen.height
        );
        this.resize(
          this.app.screen.width,
          Math.max(this.app.screen.height, newScaledHeight)
        );
      }
    } else {
      // 가로 크기가 캔버스보다 작거나 같으면 정상 처리
      console.log("🔵 [배경이미지] 가로 크기 정상, 캔버스 높이 조정");
      if (scaledHeight > this.app.screen.height) {
        // 가로 크기는 그대로 유지하고, 세로만 확장
        console.log(
          "🔵 [배경이미지] 캔버스 높이 확장:",
          this.app.screen.width,
          "x",
          scaledHeight
        );
        this.resize(this.app.screen.width, scaledHeight);
      } else {
        // 이미지가 작아도 최소한 이미지 높이만큼은 확보
        console.log(
          "🔵 [배경이미지] 캔버스 높이 유지:",
          this.app.screen.width,
          "x",
          Math.max(this.app.screen.height, scaledHeight)
        );
        this.resize(
          this.app.screen.width,
          Math.max(this.app.screen.height, scaledHeight)
        );
      }
    }

    // 배경 이미지가 정확히 (0, 0)에 위치하는지 확인 및 강제 설정
    if (this.backgroundSprite) {
      this.backgroundSprite.position.set(0, 0);
      this.backgroundSprite.anchor.set(0, 0);

      // 실제 world position 확인
      const worldPos = this.backgroundSprite.getGlobalPosition();
      const bounds = this.backgroundSprite.getBounds();

      console.log("🔵 [배경이미지] 최종 위치 확인:");
      console.log(
        "  - local position:",
        this.backgroundSprite.position.x,
        this.backgroundSprite.position.y
      );
      console.log("  - world position:", worldPos.x, worldPos.y);
      console.log(
        "  - anchor:",
        this.backgroundSprite.anchor.x,
        this.backgroundSprite.anchor.y
      );
      console.log(
        "  - scale:",
        this.backgroundSprite.scale.x,
        this.backgroundSprite.scale.y
      );
      console.log(
        "  - 크기:",
        this.backgroundSprite.width,
        "x",
        this.backgroundSprite.height
      );
      console.log(
        "  - bounds:",
        bounds.x,
        bounds.y,
        bounds.width,
        "x",
        bounds.height
      );

      // Stage 정보 확인
      if (this.app && this.app.stage) {
        const stageWorldPos = this.app.stage.getGlobalPosition();
        console.log("🔵 [배경이미지] Stage 정보:");
        console.log(
          "  - stage position:",
          this.app.stage.position.x,
          this.app.stage.position.y
        );
        console.log(
          "  - stage world position:",
          stageWorldPos.x,
          stageWorldPos.y
        );
        console.log(
          "  - stage pivot:",
          this.app.stage.pivot.x,
          this.app.stage.pivot.y
        );
        console.log(
          "  - screen size:",
          this.app.screen.width,
          "x",
          this.app.screen.height
        );
        console.log(
          "  - renderer size:",
          this.app.renderer.width,
          "x",
          this.app.renderer.height
        );
      }

      // BackgroundLayer 정보 확인
      if (this.backgroundLayer) {
        const layerWorldPos = this.backgroundLayer.getGlobalPosition();
        const layerBounds = this.backgroundLayer.getBounds();
        console.log("🔵 [배경이미지] BackgroundLayer 정보:");
        console.log(
          "  - layer position:",
          this.backgroundLayer.position.x,
          this.backgroundLayer.position.y
        );
        console.log(
          "  - layer world position:",
          layerWorldPos.x,
          layerWorldPos.y
        );
        console.log(
          "  - layer bounds:",
          layerBounds.x,
          layerBounds.y,
          layerBounds.width,
          "x",
          layerBounds.height
        );
      }

      // 배경 이미지가 정확히 (0, 0)에 위치하도록 강제 설정
      // resize 후에도 위치가 변경되지 않도록 보장
      this.backgroundLayer.position.set(0, 0);
      this.backgroundSprite.position.set(0, 0);
      this.backgroundSprite.anchor.set(0, 0);

      // 최종 확인
      const finalWorldPos = this.backgroundSprite.getGlobalPosition();
      const finalBounds = this.backgroundSprite.getBounds();
      console.log("🔵 [배경이미지] 최종 강제 설정 후:");
      console.log(
        "  - backgroundLayer position:",
        this.backgroundLayer.position.x,
        this.backgroundLayer.position.y
      );
      console.log(
        "  - backgroundSprite position:",
        this.backgroundSprite.position.x,
        this.backgroundSprite.position.y
      );
      console.log(
        "  - backgroundSprite world position:",
        finalWorldPos.x,
        finalWorldPos.y
      );
      console.log(
        "  - backgroundSprite bounds:",
        finalBounds.x,
        finalBounds.y,
        finalBounds.width,
        "x",
        finalBounds.height
      );

      if (Math.abs(finalWorldPos.x) > 0.1 || Math.abs(finalWorldPos.y) > 0.1) {
        console.error(
          "❌ [배경이미지] World position이 여전히 (0, 0)이 아님! Stage나 다른 부모 요소의 위치를 확인해야 합니다."
        );
      }

      if (Math.abs(finalBounds.x) > 0.1 || Math.abs(finalBounds.y) > 0.1) {
        console.error(
          "❌ [배경이미지] Bounds가 (0, 0)에서 시작하지 않음! 이미지가 잘못된 위치에 렌더링됩니다."
        );
        // bounds가 (0, 0)이 아니면 backgroundLayer 위치를 조정
        this.backgroundLayer.position.set(-finalBounds.x, -finalBounds.y);
        console.log(
          "🔵 [배경이미지] BackgroundLayer 위치를 bounds에 맞춰 조정:",
          this.backgroundLayer.position.x,
          this.backgroundLayer.position.y
        );

        // 조정 후 다시 확인
        const adjustedBounds = this.backgroundSprite.getBounds();
        console.log(
          "🔵 [배경이미지] 조정 후 bounds:",
          adjustedBounds.x,
          adjustedBounds.y
        );
      }
    }

    // 배경 이미지 적용 완료 이벤트 발생
    this.emitBackgroundTransformChange();
    console.log("✅ [배경이미지] applyBackgroundTexture 완료");
  }

  private calculateFitScaleForSize(width: number, height: number): number {
    if (!this.app) {
      return 1;
    }

    // 요구사항:
    // - 가로 크기에 맞춰 이미지를 축소/확대
    // - 세로 방향으로는 잘리지 않고, 필요하면 캔버스 자체 높이를 늘려서 전체 이미지가 보이도록 함
    //
    // 따라서 세로 기준 스케일은 사용하지 않고,
    // "현재 캔버스 가로 / 이미지 가로" 비율만 사용합니다.
    const scaleX = this.app.screen.width / width;

    return scaleX;
  }

  private startHandleDrag(
    handle: TransformHandleKey,
    event: PIXI.FederatedPointerEvent
  ): void {
    if (!this.app || !this.app.stage) {
      return;
    }

    const target = this.getTransformTarget();
    if (!target) {
      return;
    }

    if (
      target.type === "background" &&
      (!this.isTransformMode ||
        !this.backgroundSprite ||
        !this.backgroundOriginalSize)
    ) {
      return;
    }

    if (
      target.type === "object" &&
      !(this.isTransformMode || this.isTransformHotkey)
    ) {
      return;
    }

    event.stopPropagation();

    this.activeHandle = handle;

    if (target.type === "background") {
      const sprite = target.sprite;
      const dx = event.global.x - sprite.x;
      const dy = event.global.y - sprite.y;
      const startDiagonal = Math.max(Math.hypot(dx, dy), 0.001);

      this.handleDragData = {
        targetType: "background",
        handle,
        pointerStartX: event.global.x,
        pointerStartY: event.global.y,
        spriteStartScale: sprite.scale.x,
        startDiagonal,
      };
    } else {
      const bounds = target.bounds;
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const dx = event.global.x - centerX;
      const dy = event.global.y - centerY;
      const startDiagonal = Math.max(Math.hypot(dx, dy), 0.001);

      this.handleDragData = {
        targetType: "object",
        handle,
        objectId: target.objectId,
        container: target.container,
        centerX,
        centerY,
        startDiagonal,
        startScale: target.container.scale.x,
      };
    }

    this.app.stage.on("pointermove", this.handleTransformPointerMove);
    this.app.stage.on("pointerup", this.handleTransformPointerUp);
    this.app.stage.on("pointerupoutside", this.handleTransformPointerUp);
  }

  private ensureTransformOverlay(): void {
    if (!this.transformLayer) {
      return;
    }

    if (!this.transformOverlay) {
      this.transformOverlay = new PIXI.Graphics();
      this.transformLayer.addChild(this.transformOverlay);
    }

    if (this.transformHandles.size === 0) {
      const handleKeys: TransformHandleKey[] = [
        "topLeft",
        "topRight",
        "bottomLeft",
        "bottomRight",
      ];

      handleKeys.forEach((key) => {
        const handle = new PIXI.Graphics();
        handle.cursor = this.getCursorForHandle(key);
        handle.eventMode = "static";
        handle.on("pointerdown", (event) => this.startHandleDrag(key, event));
        this.transformLayer!.addChild(handle);
        this.transformHandles.set(key, handle);
      });
    }
  }

  private getTransformTarget():
    | {
        type: "background";
        sprite: PIXI.Sprite;
        bounds: PIXI.Rectangle;
      }
    | {
        type: "object";
        objectId: string;
        container: PIXI.Container;
        bounds: PIXI.Rectangle;
      }
    | null {
    // 배경 이미지는 항상 고정이므로 Transform 대상에서 제외
    // 오버레이 이미지만 Transform 가능
    if (
      (this.isTransformMode || this.isTransformHotkey) &&
      this.transformObjectId
    ) {
      const container = this.canvasObjects.get(this.transformObjectId);
      if (container) {
        const rawBounds = container.getBounds(true);
        const bounds = new PIXI.Rectangle(
          rawBounds.minX ?? rawBounds.x ?? 0,
          rawBounds.minY ?? rawBounds.y ?? 0,
          rawBounds.width,
          rawBounds.height
        );
        return {
          type: "object",
          objectId: this.transformObjectId,
          container,
          bounds,
        };
      }
    }

    // 배경 이미지는 더 이상 Transform 대상이 아님
    // if (this.isTransformMode && this.backgroundSprite) {
    //   const sprite = this.backgroundSprite;
    //   const bounds = new PIXI.Rectangle(
    //     sprite.x - sprite.width / 2,
    //     sprite.y - sprite.height / 2,
    //     sprite.width,
    //     sprite.height
    //   );
    //   return { type: "background", sprite, bounds };
    // }

    return null;
  }

  private getCursorForHandle(handle: TransformHandleKey): string {
    switch (handle) {
      case "topLeft":
      case "bottomRight":
        return "nwse-resize";
      case "topRight":
      case "bottomLeft":
        return "nesw-resize";
      default:
        return "grab";
    }
  }

  private updateTransformOverlay(): void {
    const layer = this.transformLayer;
    if (!layer) {
      if (this.transformOverlay) {
        this.transformOverlay.visible = false;
        this.transformOverlay.clear();
      }
      this.transformHandles.forEach((handle) => {
        handle.visible = false;
        handle.eventMode = "none";
      });
      return;
    }

    const target = this.getTransformTarget();
    if (!target) {
      if (this.transformOverlay) {
        this.transformOverlay.visible = false;
        this.transformOverlay.clear();
      }
      layer.visible = false;
      layer.eventMode = "none";
      this.transformHandles.forEach((handle) => {
        handle.visible = false;
        handle.eventMode = "none";
      });
      return;
    }

    this.ensureTransformOverlay();

    layer.visible = true;
    layer.eventMode = "static";

    const bounds = target.bounds;
    const left = bounds.x;
    const top = bounds.y;
    const width = bounds.width;
    const height = bounds.height;

    const overlay = this.transformOverlay!;
    overlay.clear();
    overlay.lineStyle(1, 0x00aaff, 1);
    overlay.moveTo(left, top);
    overlay.lineTo(left + width, top);
    overlay.lineTo(left + width, top + height);
    overlay.lineTo(left, top + height);
    overlay.closePath();
    overlay.visible = true;

    const handleSize = 12;
    const positions: Record<TransformHandleKey, { x: number; y: number }> = {
      topLeft: { x: left, y: top },
      topRight: { x: left + width, y: top },
      bottomLeft: { x: left, y: top + height },
      bottomRight: { x: left + width, y: top + height },
    };

    (Object.keys(positions) as TransformHandleKey[]).forEach((key) => {
      const handle = this.transformHandles.get(key);
      if (!handle) {
        return;
      }

      const pos = positions[key];
      handle.clear();
      handle.lineStyle(1, 0x00aaff, 1);
      handle.beginFill(0xffffff, 0.9);
      handle.drawRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
      handle.endFill();
      handle.position.set(pos.x, pos.y);
      handle.cursor = this.getCursorForHandle(key);
      handle.visible = true;
      handle.eventMode = "static";
    });
  }

  setTransformMode(enabled: boolean): void {
    if (this.isTransformMode === enabled) {
      this.updateTransformOverlay();
      return;
    }

    this.isTransformMode = enabled;

    // 배경 이미지는 항상 고정이므로 상호작용 비활성화
    // if (this.backgroundSprite) {
    //   if (enabled) {
    //     this.attachBackgroundInteraction(this.backgroundSprite);
    //   } else {
    //     this.stopBackgroundDrag();
    //     this.cancelHandleDrag();
    //     this.detachBackgroundInteraction(this.backgroundSprite);
    //   }
    // } else if (!enabled) {
    //   this.cancelHandleDrag();
    // }

    // 배경 이미지 상호작용 항상 비활성화 (고정 유지)
    if (this.backgroundSprite) {
      this.stopBackgroundDrag();
      this.detachBackgroundInteraction(this.backgroundSprite);
    }

    if (!enabled) {
      this.cancelHandleDrag();
    }

    // Transform 모드 상태에 따라 모든 객체의 이벤트 모드 업데이트
    this.updateObjectsEventMode();
    // 레이어 순서 업데이트 (Transform 모드일 때 오버레이 이미지를 위로 올림)
    this.updateLayerOrder();

    this.updateTransformOverlay();
  }

  isTransformModeEnabled(): boolean {
    return this.isTransformMode;
  }

  setTransformHotkey(enabled: boolean): void {
    this.isTransformHotkey = enabled;
    if (!enabled && !this.isTransformMode) {
      this.cancelHandleDrag();
    }
    // Transform 모드 상태에 따라 모든 객체의 이벤트 모드 업데이트
    this.updateObjectsEventMode();
    // 레이어 순서 업데이트 (Ctrl 키 누르면 오버레이 이미지를 위로 올림)
    this.updateLayerOrder();
    this.updateTransformOverlay();
  }

  /**
   * Transform 모드에 따라 레이어 순서를 동적으로 변경합니다.
   * 평소에는 오버레이 이미지가 그리기 레이어 아래에 있어서 그림을 그릴 수 있고,
   * Transform 모드일 때는 오버레이 이미지가 위에 있어서 드래그할 수 있습니다.
   */
  private updateLayerOrder(): void {
    if (!this.app || !this.app.stage || !this.objectsLayer || !this.graphics) {
      return;
    }

    const stage = this.app.stage;
    const objectsIndex = stage.getChildIndex(this.objectsLayer);
    const graphicsIndex = stage.getChildIndex(this.graphics);

    // Transform 모드일 때는 objectsLayer를 graphics 위로
    // Transform 모드가 아닐 때는 objectsLayer를 graphics 아래로
    if (this.isTransformMode || this.isTransformHotkey) {
      // objectsLayer가 graphics 아래에 있으면 위로 올림
      if (objectsIndex < graphicsIndex) {
        // graphics 뒤로 objectsLayer를 이동 (더 높은 인덱스 = 위에 표시)
        stage.setChildIndex(this.objectsLayer, graphicsIndex);
      }
    } else {
      // objectsLayer가 graphics 위에 있으면 아래로 내림
      if (objectsIndex > graphicsIndex) {
        // graphics 앞으로 objectsLayer를 이동 (더 낮은 인덱스 = 아래에 표시)
        stage.setChildIndex(this.objectsLayer, graphicsIndex);
      }
    }
  }

  private attachBackgroundInteraction(sprite: PIXI.Sprite): void {
    if (this.isBackgroundInteractionEnabled) return;

    sprite.eventMode = "static";
    sprite.cursor = "grab";

    sprite.on("pointerdown", this.handleBackgroundPointerDown);
    sprite.on("pointermove", this.handleBackgroundPointerMove);
    sprite.on("pointerup", this.handleBackgroundPointerUp);
    sprite.on("pointerupoutside", this.handleBackgroundPointerUp);

    this.isBackgroundInteractionEnabled = true;
  }

  private detachBackgroundInteraction(sprite: PIXI.Sprite): void {
    if (!this.isBackgroundInteractionEnabled) {
      sprite.eventMode = "none";
      sprite.cursor = "default";
      return;
    }

    sprite.off("pointerdown", this.handleBackgroundPointerDown);
    sprite.off("pointermove", this.handleBackgroundPointerMove);
    sprite.off("pointerup", this.handleBackgroundPointerUp);
    sprite.off("pointerupoutside", this.handleBackgroundPointerUp);
    sprite.eventMode = "none";
    sprite.cursor = "default";

    this.isBackgroundInteractionEnabled = false;
  }

  private stopBackgroundDrag(): void {
    this.isBackgroundDragging = false;
    this.backgroundDragData = null;
    if (this.backgroundSprite) {
      this.backgroundSprite.cursor = "grab";
    }
  }

  private cancelHandleDrag(): void {
    if (!this.app || !this.app.stage) return;

    this.app.stage.off("pointermove", this.handleTransformPointerMove);
    this.app.stage.off("pointerup", this.handleTransformPointerUp);
    this.app.stage.off("pointerupoutside", this.handleTransformPointerUp);

    this.activeHandle = null;
    this.handleDragData = null;
  }

  setBackgroundScale(scale: number): void {
    if (!this.backgroundSprite) return;
    const clamped = Math.min(Math.max(scale, 0.1), 5);
    this.backgroundScale = clamped;
    this.backgroundSprite.scale.set(this.backgroundScale);
    this.updateTransformOverlay();
    this.onBackgroundScaleChange?.(this.backgroundScale);
    this.emitBackgroundTransformChange();
  }

  getBackgroundScale(): number {
    return this.backgroundScale;
  }

  setBackgroundPosition(x: number, y: number): void {
    if (!this.backgroundSprite) return;
    this.backgroundSprite.position.set(x, y);
    this.updateTransformOverlay();
    this.emitBackgroundTransformChange();
  }

  setBackgroundTransform(
    transform: { x: number; y: number; scale: number },
    options: { notify?: boolean } = { notify: true }
  ): void {
    if (!this.backgroundSprite) return;

    const { x, y, scale } = transform;
    this.backgroundScale = Math.min(Math.max(scale, 0.1), 5);
    this.backgroundSprite.position.set(x, y);
    this.backgroundSprite.scale.set(this.backgroundScale);
    this.updateTransformOverlay();
    if (options.notify) {
      this.onBackgroundScaleChange?.(this.backgroundScale);
      this.emitBackgroundTransformChange();
    }
  }

  getBackgroundState(): {
    dataUrl: string | null;
    x: number;
    y: number;
    scale: number;
    originalSize: { width: number; height: number } | null;
  } | null {
    if (!this.backgroundSprite) {
      return null;
    }

    return {
      dataUrl: this.backgroundDataUrl,
      x: this.backgroundSprite.x,
      y: this.backgroundSprite.y,
      scale: this.backgroundSprite.scale.x,
      originalSize: this.backgroundOriginalSize,
    };
  }

  resetBackgroundTransform(): void {
    if (!this.backgroundSprite || !this.app || !this.backgroundOriginalSize) {
      return;
    }

    const fitScale = this.calculateFitScaleForSize(
      this.backgroundOriginalSize.width,
      this.backgroundOriginalSize.height
    );

    this.backgroundScale = fitScale;
    this.backgroundSprite.scale.set(this.backgroundScale);
    // 배경 이미지는 항상 (0, 0)에서 시작
    this.backgroundSprite.position.set(0, 0);
    this.stopBackgroundDrag();
    this.updateTransformOverlay();
    this.onBackgroundScaleChange?.(this.backgroundScale);
    this.emitBackgroundTransformChange();
  }

  hasBackgroundImage(): boolean {
    return this.backgroundSprite !== null;
  }

  // 배경 이미지 제거
  removeBackgroundImage(): void {
    if (this.backgroundSprite && this.backgroundLayer) {
      this.detachBackgroundInteraction(this.backgroundSprite);
      this.backgroundLayer.removeChild(this.backgroundSprite);
      this.backgroundSprite.destroy();
      this.backgroundSprite = null;
      this.backgroundOriginalSize = null;
      this.backgroundScale = 1;
      this.backgroundDataUrl = null;
      this.stopBackgroundDrag();
      this.cancelHandleDrag();
    }
    this.setTransformMode(false);
    if (this.transformLayer) {
      this.transformLayer.visible = false;
    }
    this.onBackgroundScaleChange?.(this.backgroundScale);
    this.emitBackgroundTransformChange();
  }
}
