import * as PIXI from "pixi.js";
import { DrawingData } from "../types";

type TransformHandleKey = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export class CanvasManager {
  private app: PIXI.Application | null = null;
  private graphics!: PIXI.Graphics;
  private cursorLayer!: PIXI.Container;
  private backgroundLayer!: PIXI.Container;
  private backgroundSprite: PIXI.Sprite | null = null;
  private backgroundOriginalSize: { width: number; height: number } | null = null;
  private backgroundScale: number = 1;
  private backgroundDataUrl: string | null = null;
  private isBackgroundDragging: boolean = false;
  private backgroundDragData:
    | {
        pointerStartX: number;
        pointerStartY: number;
        spriteStartX: number;
        spriteStartY: number;
      }
    | null = null;
  private isBackgroundInteractionEnabled: boolean = false;
  private transformLayer!: PIXI.Container;
  private transformOverlay: PIXI.Graphics | null = null;
  private transformHandles: Map<TransformHandleKey, PIXI.Graphics> = new Map();
  private isTransformMode: boolean = false;
  private isTransformHotkey: boolean = false;
  private activeHandle: TransformHandleKey | null = null;
  private handleDragData:
    | {
        handle: TransformHandleKey;
        pointerStartX: number;
        pointerStartY: number;
        spriteStartScale: number;
        startDiagonal: number;
      }
    | null = null;
  private userIdToCursor: Map<string, PIXI.Graphics> = new Map();
  private isDrawing: boolean = false;
  private lastPoint: { x: number; y: number } | null = null;
  private remoteUserIdToLastPoint: Map<string, { x: number; y: number }> =
    new Map();
  private brushSize: number = 5;
  private brushColor: number = 0x000000;
  private currentTool: "brush" | "eraser" | "text" | "rectangle" | "circle" | "line" = "brush";
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
    if (!this.backgroundSprite || !this.isTransformMode) return;
    event.stopPropagation();

    const global = event.global;
    this.isBackgroundDragging = true;
    this.backgroundDragData = {
      pointerStartX: global.x,
      pointerStartY: global.y,
      spriteStartX: this.backgroundSprite.x,
      spriteStartY: this.backgroundSprite.y,
    };

    this.backgroundSprite.cursor = "grabbing";
  };

  private handleBackgroundPointerMove = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    if (
      !this.backgroundSprite ||
      !this.isTransformMode ||
      !this.isBackgroundDragging ||
      !this.backgroundDragData
    )
      return;

    event.stopPropagation();
    const global = event.global;
    const dx = global.x - this.backgroundDragData.pointerStartX;
    const dy = global.y - this.backgroundDragData.pointerStartY;

    this.backgroundSprite.position.set(
      this.backgroundDragData.spriteStartX + dx,
      this.backgroundDragData.spriteStartY + dy
    );
    this.updateTransformOverlay();
    this.emitBackgroundTransformChange();
  };

  private handleBackgroundPointerUp = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    if (!this.backgroundSprite || !this.isTransformMode) return;

    event.stopPropagation();
    this.stopBackgroundDrag();
    this.updateTransformOverlay();
    this.emitBackgroundTransformChange();
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
    if (
      !this.isTransformMode ||
      !this.backgroundSprite ||
      !this.handleDragData ||
      !this.backgroundOriginalSize
    ) {
      return;
    }

    event.stopPropagation();

    const sprite = this.backgroundSprite;
    const dx = event.global.x - sprite.x;
    const dy = event.global.y - sprite.y;
    const currentDiagonal = Math.max(Math.hypot(dx, dy), 0.001);

    const scaleRatio = currentDiagonal / this.handleDragData.startDiagonal;
    const newScale = Math.min(
      Math.max(this.handleDragData.spriteStartScale * scaleRatio, 0.1),
      5
    );

    sprite.scale.set(newScale);
    this.backgroundScale = newScale;
    this.updateTransformOverlay();
    this.onBackgroundScaleChange?.(this.backgroundScale);
    this.emitBackgroundTransformChange();
  };

  private handleTransformPointerUp = (
    event: PIXI.FederatedPointerEvent
  ): void => {
    if (!this.isTransformMode) return;
    event.stopPropagation();
    this.cancelHandleDrag();
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
    this.app.stage.addChild(this.backgroundLayer);

    // 그래픽 객체 생성
    this.graphics = new PIXI.Graphics();
    this.app.stage.addChild(this.graphics);

    // 객체 레이어 (텍스트/도형)
    this.objectsLayer = new PIXI.Container();
    this.app.stage.addChild(this.objectsLayer);

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
    if (!this.graphics || this.isBackgroundDragging || this.isTransformMode)
      return;

    this.isDrawing = true;
    const point = event.global;
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

    const point = event.global;

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

    const point = event.global;

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
      const fontSize = this.brushSize * 4;
      const colorHex = "#" + this.brushColor.toString(16).padStart(6, "0");
      
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

  setTool(tool: "brush" | "eraser" | "text" | "rectangle" | "circle" | "line"): void {
    this.currentTool = tool;
  }

  getTool(): "brush" | "eraser" | "text" | "rectangle" | "circle" | "line" {
    return this.currentTool;
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
  resize(width: number, height: number): void {
    if (this.app && this.app.renderer) {
      this.app.renderer.resize(width, height);
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

  addTextObject(id: string, x: number, y: number, text: string, fontSize: number, color: string): void {
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
      container.eventMode = "static";
      container.cursor = "move";
      
      this.objectsLayer.addChild(container);
      this.canvasObjects.set(id, container);
      
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
      container.eventMode = "static";
      container.cursor = "move";
      
      this.objectsLayer.addChild(container);
      this.canvasObjects.set(id, container);
      
      this.attachObjectInteraction(container, id);
    } catch (error) {
      console.error("도형 객체 추가 실패:", error);
    }
  }

  private attachObjectInteraction(container: PIXI.Container, objectId: string): void {
    let dragData: { startX: number; startY: number; objX: number; objY: number } | null = null;

    container.on("pointerdown", (event: PIXI.FederatedPointerEvent) => {
      if (!this.isTransformMode && !this.isTransformHotkey) return;
      event.stopPropagation();
      
      this.selectObject(objectId);
      const global = event.global;
      dragData = {
        startX: global.x,
        startY: global.y,
        objX: container.x,
        objY: container.y,
      };
    });

    container.on("pointermove", (event: PIXI.FederatedPointerEvent) => {
      if (!dragData || (!this.isTransformMode && !this.isTransformHotkey)) return;
      event.stopPropagation();
      
      const global = event.global;
      const dx = global.x - dragData.startX;
      const dy = global.y - dragData.startY;
      container.position.set(dragData.objX + dx, dragData.objY + dy);
      this.updateObjectSelectionBox();
    });

    container.on("pointerup", (event: PIXI.FederatedPointerEvent) => {
      if (!dragData) return;
      event.stopPropagation();
      
      dragData = null;
      this.onObjectMoved?.(objectId, container.x, container.y);
    });

    container.on("pointerupoutside", (event: PIXI.FederatedPointerEvent) => {
      dragData = null;
    });
  }

  private selectObject(id: string): void {
    this.selectedObjectId = id;
    this.updateObjectSelectionBox();
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
    this.updateObjectSelectionBox();
  }

  removeObject(id: string): void {
    const obj = this.canvasObjects.get(id);
    if (obj && this.objectsLayer) {
      this.objectsLayer.removeChild(obj);
      obj.destroy();
      this.canvasObjects.delete(id);
      if (this.selectedObjectId === id) {
        this.clearObjectSelection();
      }
    }
  }

  clearAllObjects(): void {
    this.canvasObjects.forEach((obj) => {
      this.objectsLayer?.removeChild(obj);
      obj.destroy();
    });
    this.canvasObjects.clear();
    this.clearObjectSelection();
  }

  getObjectIds(): string[] {
    return Array.from(this.canvasObjects.keys());
  }

  updateObjectPosition(id: string, x: number, y: number): void {
    const obj = this.canvasObjects.get(id);
    if (obj) {
      obj.position.set(x, y);
      if (this.selectedObjectId === id) {
        this.updateObjectSelectionBox();
      }
    }
  }

  setOnBackgroundScaleChange(
    callback?: (scale: number) => void
  ): void {
    this.onBackgroundScaleChange = callback;
  }

  setOnBackgroundTransformChange(
    callback?: (state: { x: number; y: number; scale: number }) => void
  ): void {
    this.onBackgroundTransformChange = callback;
  }

  // 이미지 로드 및 배경으로 설정
  async loadImageFromFile(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("이미지 데이터를 읽을 수 없습니다."));
        }
      };
      reader.onerror = () => reject(new Error("이미지를 읽는 중 오류가 발생했습니다."));
      reader.readAsDataURL(file);
    });

    await this.loadImageFromDataUrl(dataUrl);
    return dataUrl;
  }

  async loadImageFromDataUrl(dataUrl: string): Promise<void> {
    if (!this.backgroundLayer) {
      console.error("배경 레이어가 초기화되지 않았습니다.");
      return;
    }

    try {
      const image = new Image();

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("이미지 로드 실패"));
        image.src = dataUrl;
      });

      const texture = PIXI.Texture.from(image);

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

      // Image에서 Texture 생성
      const texture = PIXI.Texture.from(image);

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
    if (!this.backgroundLayer || !this.app) {
      return;
    }

    // 이전 이미지 제거
    if (this.backgroundSprite) {
      this.detachBackgroundInteraction(this.backgroundSprite);
      this.backgroundLayer.removeChild(this.backgroundSprite);
      this.backgroundSprite.destroy();
      this.stopBackgroundDrag();
    }

    this.backgroundSprite = new PIXI.Sprite(texture);
    this.backgroundSprite.anchor.set(0.5);
    this.backgroundSprite.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2
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
    this.backgroundScale = fitScale;
    this.backgroundSprite.scale.set(this.backgroundScale);
    this.onBackgroundScaleChange?.(this.backgroundScale);

    if (this.isTransformMode) {
      this.attachBackgroundInteraction(this.backgroundSprite);
    } else {
      this.detachBackgroundInteraction(this.backgroundSprite);
    }
    this.backgroundLayer.addChild(this.backgroundSprite);
    this.updateTransformOverlay();
    this.emitBackgroundTransformChange();
  }

  private calculateFitScaleForSize(width: number, height: number): number {
    if (!this.app) {
      return 1;
    }

    const scaleX = this.app.screen.width / width;
    const scaleY = this.app.screen.height / height;

    return Math.min(scaleX, scaleY);
  }

  private startHandleDrag(
    handle: TransformHandleKey,
    event: PIXI.FederatedPointerEvent
  ): void {
    if (
      !this.isTransformMode ||
      !this.app ||
      !this.app.stage ||
      !this.backgroundSprite ||
      !this.backgroundOriginalSize
    ) {
      return;
    }

    event.stopPropagation();

    const sprite = this.backgroundSprite;
    const dx = event.global.x - sprite.x;
    const dy = event.global.y - sprite.y;
    const startDiagonal = Math.max(Math.hypot(dx, dy), 0.001);

    this.activeHandle = handle;
    this.handleDragData = {
      handle,
      pointerStartX: event.global.x,
      pointerStartY: event.global.y,
      spriteStartScale: sprite.scale.x,
      startDiagonal,
    };

    this.app.stage.on("pointermove", this.handleTransformPointerMove);
    this.app.stage.on("pointerup", this.handleTransformPointerUp);
    this.app.stage.on("pointerupoutside", this.handleTransformPointerUp);
  }

  private ensureTransformOverlay(): void {
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
        this.transformLayer.addChild(handle);
        this.transformHandles.set(key, handle);
      });
    }
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
    if (
      !this.isTransformMode ||
      !this.transformLayer ||
      !this.backgroundSprite
    ) {
      if (this.transformOverlay) {
        this.transformOverlay.visible = false;
        this.transformOverlay.clear();
      }
      this.transformLayer.visible = false;
      this.transformLayer.eventMode = "none";
      this.transformHandles.forEach((handle) => {
        handle.visible = false;
        handle.eventMode = "none";
      });
      return;
    }

    this.ensureTransformOverlay();

    this.transformLayer.visible = true;
    this.transformLayer.eventMode = "static";

    const sprite = this.backgroundSprite;
    const width = sprite.width;
    const height = sprite.height;
    const left = sprite.x - width / 2;
    const top = sprite.y - height / 2;

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

    if (!this.backgroundSprite) {
      this.transformLayer.visible = false;
      this.transformLayer.eventMode = "none";
      return;
    }

    if (enabled) {
      this.attachBackgroundInteraction(this.backgroundSprite);
    } else {
      this.stopBackgroundDrag();
      this.cancelHandleDrag();
      this.detachBackgroundInteraction(this.backgroundSprite);
    }

    this.updateTransformOverlay();
  }

  isTransformModeEnabled(): boolean {
    return this.isTransformMode;
  }

  setTransformHotkey(enabled: boolean): void {
    this.isTransformHotkey = enabled;
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
  } | null {
    if (!this.backgroundSprite) {
      return null;
    }

    return {
      dataUrl: this.backgroundDataUrl,
      x: this.backgroundSprite.x,
      y: this.backgroundSprite.y,
      scale: this.backgroundSprite.scale.x,
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
    this.backgroundSprite.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2
    );
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
