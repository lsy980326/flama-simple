import { DrawingOperation, CanvasObject, BackgroundState } from "../collaboration/YjsDrawingManager";

/**
 * Canvas 2D 기반 경량 뷰어
 * 
 * PIXI.js 대신 Canvas 2D API를 사용하여 읽기 전용 뷰어를 제공합니다.
 * 실시간 동기화는 Y.js를 통해 처리하며, 렌더링만 Canvas 2D로 수행합니다.
 */
export class Canvas2DViewer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private canvasWidth: number;
  private scale: number = 1;
  private backgroundImage: HTMLImageElement | null = null;
  private backgroundState: BackgroundState | null = null;
  private allOperations: DrawingOperation[] = [];
  private allObjects: CanvasObject[] = [];

  /**
   * 배경 이미지 정보 반환
   */
  getBackgroundInfo(): { width: number; height: number; scale: number } | null {
    if (this.backgroundImage && this.backgroundState) {
      const scale = this.backgroundState.scale || 1;
      return {
        width: this.backgroundImage.width,
        height: this.backgroundImage.height,
        scale,
      };
    }
    return null;
  }

  constructor(container: HTMLElement, width: number, height: number, canvasWidth: number = 690) {
    this.width = width;
    this.height = height;
    this.canvasWidth = canvasWidth;

    // Canvas 생성
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", {
      alpha: true,
      desynchronized: false,
    })!;

    if (!this.ctx) {
      throw new Error("Canvas 2D context를 생성할 수 없습니다.");
    }

    // 해상도 최적화 (모바일 성능 고려)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
    this.scale = dpr;

    // 컨테이너에 추가
    container.appendChild(this.canvas);
  }

  /**
   * 캔버스 크기 조정
   */
  resize(width: number, height: number, canvasWidth?: number): void {
    this.width = width;
    this.height = height;
    if (canvasWidth !== undefined) {
      this.canvasWidth = canvasWidth;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr / this.scale, dpr / this.scale);
    this.scale = dpr;
    this.redraw();
  }

  /**
   * 배경 이미지 설정
   */
  async setBackground(state: BackgroundState | null): Promise<void> {
    this.backgroundState = state;
    
    if (state && state.dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          this.backgroundImage = img;
          this.redraw();
          resolve();
        };
        img.onerror = reject;
        img.src = state.dataUrl!;
      });
    } else {
      this.backgroundImage = null;
      this.redraw();
    }
  }

  /**
   * 그리기 작업 렌더링
   */
  renderDrawing(operations: DrawingOperation[]): void {
    // 새로운 작업 추가
    this.allOperations.push(...operations);
    // 전체 다시 그리기
    this.redrawAll();
  }

  /**
   * 모든 그리기 작업 지우기 (배경 이미지는 유지)
   */
  clearAll(): void {
    this.allOperations = [];
    this.allObjects = [];
    // 배경 이미지만 다시 그리기
    this.redrawAll();
  }

  /**
   * 전체 다시 그리기 (배경 + 그리기 + 객체)
   */
  redrawAll(): void {
    // 배경 지우기
    this.ctx.clearRect(0, 0, this.canvas.width / this.scale, this.canvas.height / this.scale);

    // 배경 이미지 그리기
    if (this.backgroundImage && this.backgroundState && this.backgroundState.dataUrl) {
      try {
        // 배경 이미지를 canvasWidth에 맞춰 스케일링
        const originalWidth = this.backgroundImage.width;
        const originalHeight = this.backgroundImage.height;
        const targetWidth = this.canvasWidth;
        const scale = targetWidth / originalWidth;
        const x = this.backgroundState.x || 0;
        const y = this.backgroundState.y || 0;
        const width = originalWidth * scale;
        const height = originalHeight * scale;
        
        // 배경 이미지 그리기
        this.ctx.drawImage(this.backgroundImage, x, y, width, height);
      } catch (error) {
        console.warn("배경 이미지 그리기 실패:", error);
      }
    }

    // 그리기 작업 렌더링 (strokeId별로 그룹화)
    this.renderAllOperations();

    // 객체 렌더링
    this.renderAllObjects();
  }

  /**
   * 모든 그리기 작업 렌더링 (strokeId별로 그룹화)
   */
  private renderAllOperations(): void {
    // strokeId별로 그룹화
    const strokes = new Map<string, DrawingOperation[]>();
    const standaloneOps: DrawingOperation[] = [];

    for (const op of this.allOperations) {
      if (op.type === "clear") {
        // clear 타입은 이미 CanvasViewerManager에서 처리되므로 여기서는 무시
        // (clearAll()이 호출되어 allOperations가 비워짐)
        continue;
      }

      if (op.strokeId) {
        if (!strokes.has(op.strokeId)) {
          strokes.set(op.strokeId, []);
        }
        strokes.get(op.strokeId)!.push(op);
      } else {
        standaloneOps.push(op);
      }
    }

    // stroke별로 렌더링
    strokes.forEach((ops) => {
      this.renderStroke(ops);
    });

    // 독립적인 작업 렌더링
    for (const op of standaloneOps) {
      this.renderOperation(op);
    }
  }

  /**
   * stroke 렌더링 (하나의 획을 연속된 선으로)
   */
  private renderStroke(operations: DrawingOperation[]): void {
    if (operations.length === 0) return;

    // 첫 번째 작업에서 스타일 가져오기
    const firstOp = operations[0];
    if (firstOp.type === "draw" && firstOp.brushSize && firstOp.color) {
      this.ctx.strokeStyle = firstOp.color;
      this.ctx.lineWidth = firstOp.brushSize;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.globalCompositeOperation = "source-over";

      this.ctx.beginPath();
      let hasStarted = false;

      for (const op of operations.sort((a, b) => a.timestamp - b.timestamp)) {
        if (op.strokeState === "start" || !hasStarted) {
          this.ctx.moveTo(op.x, op.y);
          hasStarted = true;
        } else {
          this.ctx.lineTo(op.x, op.y);
        }

        // 미들포인트 처리
        if (op.middlePoints && op.middlePoints.length > 0) {
          for (const point of op.middlePoints) {
            this.ctx.lineTo(point.x, point.y);
          }
        }
      }

      this.ctx.stroke();
    } else if (firstOp.type === "erase" && firstOp.brushSize) {
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.strokeStyle = "rgba(0,0,0,1)";
      this.ctx.lineWidth = firstOp.brushSize;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      this.ctx.beginPath();
      let hasStarted = false;

      for (const op of operations.sort((a, b) => a.timestamp - b.timestamp)) {
        if (op.strokeState === "start" || !hasStarted) {
          this.ctx.moveTo(op.x, op.y);
          hasStarted = true;
        } else {
          this.ctx.lineTo(op.x, op.y);
        }
      }

      this.ctx.stroke();
      this.ctx.globalCompositeOperation = "source-over";
    }
  }

  /**
   * 모든 객체 렌더링
   */
  private renderAllObjects(): void {
    for (const obj of this.allObjects) {
      if (obj.type === "image" && obj.dataUrl) {
        this.renderImageObject(obj);
      } else if (obj.type === "text") {
        this.renderTextObject(obj);
      } else if (obj.type === "shape") {
        this.renderShapeObject(obj);
      }
    }
  }

  /**
   * 단일 작업 렌더링
   */
  private renderOperation(op: DrawingOperation): void {
    if (op.type === "clear") {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.redraw();
      return;
    }

    if (op.type === "draw" && op.brushSize && op.color) {
      this.ctx.strokeStyle = op.color;
      this.ctx.lineWidth = op.brushSize;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      if (op.strokeState === "start" || !op.strokeState) {
        this.ctx.beginPath();
        this.ctx.moveTo(op.x, op.y);
      } else if (op.strokeState === "move") {
        this.ctx.lineTo(op.x, op.y);
        this.ctx.stroke();
      } else if (op.strokeState === "end") {
        this.ctx.lineTo(op.x, op.y);
        this.ctx.stroke();
        this.ctx.closePath();
      }

      // 미들포인트 처리
      if (op.middlePoints && op.middlePoints.length > 0) {
        for (const point of op.middlePoints) {
          this.ctx.lineTo(point.x, point.y);
        }
        this.ctx.stroke();
      }
    } else if (op.type === "erase" && op.brushSize) {
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.strokeStyle = "rgba(0,0,0,1)";
      this.ctx.lineWidth = op.brushSize;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      if (op.strokeState === "start" || !op.strokeState) {
        this.ctx.beginPath();
        this.ctx.moveTo(op.x, op.y);
      } else {
        this.ctx.lineTo(op.x, op.y);
        this.ctx.stroke();
      }
      this.ctx.globalCompositeOperation = "source-over";
    } else if (op.type === "shape") {
      this.renderShape(op);
    } else if (op.type === "text" && op.text) {
      this.renderText(op);
    }
  }

  /**
   * 도형 렌더링
   */
  private renderShape(op: DrawingOperation): void {
    if (!op.tool || !op.x2 || !op.y2 || !op.color || !op.brushSize) return;

    this.ctx.strokeStyle = op.color;
    this.ctx.lineWidth = op.brushSize;
    this.ctx.beginPath();

    if (op.tool === "rectangle") {
      const x = Math.min(op.x, op.x2);
      const y = Math.min(op.y, op.y2);
      const w = Math.abs(op.x2 - op.x);
      const h = Math.abs(op.y2 - op.y);
      this.ctx.rect(x, y, w, h);
    } else if (op.tool === "circle") {
      const centerX = (op.x + op.x2) / 2;
      const centerY = (op.y + op.y2) / 2;
      const radius = Math.sqrt(
        Math.pow(op.x2 - op.x, 2) + Math.pow(op.y2 - op.y, 2)
      ) / 2;
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    } else if (op.tool === "line") {
      this.ctx.moveTo(op.x, op.y);
      this.ctx.lineTo(op.x2, op.y2);
    }

    this.ctx.stroke();
  }

  /**
   * 텍스트 렌더링
   */
  private renderText(op: DrawingOperation): void {
    if (!op.text || !op.color || !op.fontSize) return;

    this.ctx.fillStyle = op.color;
    this.ctx.font = `${op.fontSize}px sans-serif`;
    this.ctx.fillText(op.text, op.x, op.y);
  }

  /**
   * 객체 렌더링
   */
  renderObjects(objects: CanvasObject[]): void {
    this.allObjects = objects;
    this.redrawAll();
  }

  /**
   * 이미지 객체 렌더링
   */
  private renderImageObject(obj: CanvasObject): void {
    if (!obj.dataUrl) return;

    const img = new Image();
    img.onload = () => {
      const scale = obj.scale || 1;
      const width = (obj.width || img.width) * scale;
      const height = (obj.height || img.height) * scale;
      const x = obj.x - width / 2;
      const y = obj.y - height / 2;

      this.ctx.drawImage(img, x, y, width, height);
    };
    img.src = obj.dataUrl;
  }

  /**
   * 텍스트 객체 렌더링
   */
  private renderTextObject(obj: CanvasObject): void {
    if (!obj.text || !obj.color) return;

    this.ctx.fillStyle = obj.color;
    this.ctx.font = `${obj.fontSize || 16}px sans-serif`;
    this.ctx.fillText(obj.text, obj.x, obj.y);
  }

  /**
   * 도형 객체 렌더링
   */
  private renderShapeObject(obj: CanvasObject): void {
    if (!obj.tool || !obj.color || !obj.brushSize) return;

    this.ctx.strokeStyle = obj.color;
    this.ctx.lineWidth = obj.brushSize;
    this.ctx.beginPath();

    if (obj.tool === "rectangle" && obj.width && obj.height) {
      this.ctx.rect(obj.x - obj.width / 2, obj.y - obj.height / 2, obj.width, obj.height);
    } else if (obj.tool === "circle") {
      // 원의 경우 width와 height를 사용하거나, x2와 y2를 사용하여 반지름 계산
      let radius: number;
      if (obj.width && obj.height) {
        radius = Math.max(obj.width, obj.height) / 2;
      } else if (obj.x2 && obj.y2) {
        // x2, y2를 사용하여 반지름 계산
        radius = Math.sqrt(
          Math.pow(obj.x2 - obj.x, 2) + Math.pow(obj.y2 - obj.y, 2)
        ) / 2;
      } else {
        return; // 반지름을 계산할 수 없으면 렌더링하지 않음
      }
      this.ctx.arc(obj.x, obj.y, radius, 0, Math.PI * 2);
    } else if (obj.tool === "line" && obj.x2 && obj.y2) {
      this.ctx.moveTo(obj.x, obj.y);
      this.ctx.lineTo(obj.x2, obj.y2);
    }

    this.ctx.stroke();
  }

  /**
   * 전체 다시 그리기 (간단한 버전 - 배경만)
   */
  redraw(): void {
    this.redrawAll();
  }

  /**
   * 캔버스 요소 반환
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * 정리
   */
  destroy(): void {
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}

