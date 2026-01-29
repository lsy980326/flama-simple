import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { User } from "../types";

export interface DrawingOperation {
  id: string;
  type: "draw" | "erase" | "clear" | "shape" | "text";
  tool?: "brush" | "eraser" | "text" | "rectangle" | "circle" | "line";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  fontSize?: number;
  pressure?: number;
  color?: string;
  brushSize?: number;
  userId: string;
  timestamp: number;
  strokeId?: string; // 획(stroke) ID
  strokeState?: "start" | "move" | "end"; // 획의 상태
  middlePoints?: Array<{ x: number; y: number }>; // 미들포인트
}

export interface BackgroundState {
  dataUrl: string | null;
  x: number;
  y: number;
  scale: number;
}

export interface AwarenessState {
  user: User;
  cursor: { x: number; y: number } | null;
  selection: { x: number; y: number; width: number; height: number } | null;
  isDrawing: boolean;
}

export interface CanvasObject {
  id: string;
  type: "text" | "shape" | "image";
  tool?: "rectangle" | "circle" | "line";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  brushSize?: number;
  dataUrl?: string;
  width?: number;
  height?: number;
  scale?: number;
  userId: string;
  timestamp: number;
}

export class YjsDrawingManager {
  private doc: Y.Doc;
  private drawingMap: Y.Map<DrawingOperation>;
  private backgroundState: Y.Map<any>;
  private objectsMap: Y.Map<CanvasObject>;
  private awareness: any;
  private wsProvider: WebsocketProvider | null = null;
  private indexeddbProvider: IndexeddbPersistence | null = null;
  private currentUser: User;
  // React 언마운트/화면 전환 등 "의도된 종료"에서 불필요한 경고 로그를 줄이기 위한 플래그
  private manuallyClosed: boolean = false;
  private currentBrushSize: number = 5;
  private currentColor: string = "#000000";
  private currentStrokeId: string | null = null; // 현재 획 ID
  private onDrawingUpdate?: (operations: DrawingOperation[]) => void;
  private onAwarenessUpdate?: (states: Map<string, AwarenessState>) => void;
  private onObjectsUpdate?: (objects: CanvasObject[]) => void;

  constructor(
    user: User,
    serverUrl: string = "ws://localhost:5001",
    roomId: string = "drawing-room"
  ) {
    this.currentUser = user;
    this.doc = new Y.Doc();
    this.drawingMap = this.doc.getMap("drawings");
    this.backgroundState = this.doc.getMap("backgroundState");
    this.objectsMap = this.doc.getMap("objects");

    // WebSocket 프로바이더 설정
    // y-websocket은 serverUrl/roomId 형식의 URL을 사용합니다
    try {
      this.wsProvider = new WebsocketProvider(serverUrl, roomId, this.doc, {
        connect: true,
        params: {},
        resyncInterval: 5000,
        maxBackoffTime: 5000,
      });

      // WebSocket 연결 오류 처리
      this.wsProvider.on("status", (event: { status: string }) => {
        if (event.status === "disconnected") {
          // 컴포넌트 언마운트 등 의도된 종료는 경고로 찍지 않음
          if (!this.manuallyClosed) {
          console.warn("Y.js WebSocket 연결 끊김");
          } else {
            console.debug("Y.js WebSocket 연결 종료(의도됨)");
          }
        } else if (event.status === "connected") {
          console.log("Y.js WebSocket 연결됨");
        } else if (event.status === "connecting") {
          console.log("Y.js WebSocket 연결 시도 중...");
        }
      });

      // WebSocket 동기화 이벤트 처리
      this.wsProvider.on("sync", (isSynced: boolean) => {
        if (isSynced) {
          console.log("Y.js 동기화 완료");
          // 동기화 완료 시 기존 모든 작업 전송
          const existingOperations = this.getAllOperations();
          if (existingOperations.length > 0) {
            this.onDrawingUpdate?.(existingOperations);
          }
        }
      });

      // WebSocket 에러 핸들링
      try {
        // WebSocket이 생성될 때까지 기다렸다가 핸들러 설정
        const setupErrorHandlers = () => {
          if (this.wsProvider?.ws) {
            this.wsProvider.ws.onerror = (error: Event) => {
              // Y.js 내부 오류는 이미 처리되므로 여기서는 조용히 처리
              console.debug("Y.js WebSocket 오류 (이미 처리됨):", error);
            };

            this.wsProvider.ws.onclose = (event: CloseEvent) => {
              // 1000/1001: 정상 종료, 1005: 브라우저가 close reason 없이 닫는 케이스가 있어 경고 제외
              if (!this.manuallyClosed && event.code !== 1000 && event.code !== 1001 && event.code !== 1005) {
                // 정상 종료 코드가 아니면 경고
                console.warn(
                  `Y.js WebSocket 연결 종료 (코드: ${event.code}, 이유: ${
                    event.reason || "알 수 없음"
                  })`
                );
              }
            };

            // 메시지 수신 시 오류 처리 (y-websocket 내부에서 처리하므로 조용히 무시)
            const ws = this.wsProvider.ws;
            if (ws) {
              // y-websocket이 자체적으로 오류를 처리하므로 추가 핸들러는 필요 없음
              // 단, 연결 상태만 모니터링
            }
          }
        };

        // 즉시 시도
        setupErrorHandlers();

        // WebSocket이 나중에 생성될 수 있으므로 약간의 지연 후 재시도
        setTimeout(setupErrorHandlers, 100);
        setTimeout(setupErrorHandlers, 500);
      } catch (wsError) {
        // WebSocket 객체가 아직 생성되지 않았을 수 있음 - 정상적일 수 있음
        console.debug(
          "WebSocket 오류 핸들러 설정 실패 (정상일 수 있음):",
          wsError
        );
      }

      // Y.js 문서 업데이트 오류 처리 - try-catch로 감싸기
      this.doc.on("update", (update: Uint8Array, origin: any) => {
        try {
          // 업데이트가 성공적으로 적용되었음을 의미
          // 오류가 발생했다면 여기서 잡을 수 없음 (y-websocket 내부에서 발생)
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          if (
            errorMsg.includes("Unexpected end of array") ||
            errorMsg.includes("Integer out of Range")
          ) {
            console.warn("Y.js 업데이트 처리 오류 (무시):", errorMsg);
          } else {
            console.error("Y.js 업데이트 오류:", error);
          }
        }
      });

      // IndexedDB 프로바이더 설정 (오프라인 지원)
      try {
        this.indexeddbProvider = new IndexeddbPersistence(roomId, this.doc);
      } catch (idbError) {
        console.warn("IndexedDB 초기화 실패 (계속 진행):", idbError);
        this.indexeddbProvider = null;
      }

      // Awareness 설정
      this.awareness = this.wsProvider.awareness;
      this.setupAwareness();
      this.setupEventListeners();
    } catch (error) {
      console.error("Y.js 초기화 오류:", error);
      // 오류가 발생해도 부분적으로 계속 진행 가능하도록
      throw error;
    }
  }

  private setupAwareness(): void {
    // 현재 사용자 정보 설정
    this.awareness.setLocalStateField("user", this.currentUser);

    // 기본 상태 설정
    this.updateAwareness({
      cursor: null,
      selection: null,
      isDrawing: false,
    });
  }

  private setupEventListeners(): void {
    // 그리기 데이터 변경 감지
    this.drawingMap.observe((event) => {
      const operations: DrawingOperation[] = [];

      event.changes.keys.forEach((change, key) => {
        if (change.action === "add" || change.action === "update") {
          const operation = this.drawingMap.get(key);
          if (operation) {
            operations.push(operation);
          }
        }
      });

      if (operations.length > 0) {
        this.onDrawingUpdate?.(operations);
      }
    });

    // Awareness 변경 감지
    this.awareness.on("change", () => {
      const states = new Map<string, AwarenessState>();

      this.awareness.getStates().forEach((state: any, clientId: string) => {
        if (state.user && clientId !== this.awareness.clientID) {
          states.set(clientId, state);
        }
      });

      this.onAwarenessUpdate?.(states);
    });

    this.backgroundState.observe(() => {
      this.onBackgroundStateUpdate?.(this.getBackgroundState());
    });

    this.objectsMap.observe((event, transaction) => {
      // 자신의 변경은 무시 (로컬에서 이미 렌더링했으므로)
      if (transaction.local) {
        return;
      }

      // 원격 변경만 처리
      this.onObjectsUpdate?.(this.getAllObjects());
    });
  }

  // 그리기 작업 추가 (public으로 노출하여 외부에서 직접 호출 가능)
  addDrawingOperation(
    operation: Omit<DrawingOperation, "id" | "timestamp">
  ): void {
    const id = this.generateId();
    const fullOperation: DrawingOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
    };

    this.drawingMap.set(id, fullOperation);
  }

  // 그리기 시작
  startDrawing(
    x: number,
    y: number,
    brushSize: number = 5,
    color: string = "#000000"
  ): void {
    this.currentBrushSize = brushSize;
    this.currentColor = color;
    // 새로운 획 ID 생성
    this.currentStrokeId = this.generateId();
    
    this.addDrawingOperation({
      type: "draw",
      x,
      y,
      brushSize: brushSize,
      color: color,
      userId: this.currentUser.id,
      strokeId: this.currentStrokeId,
      strokeState: "start",
    });

    this.updateAwareness({
      isDrawing: true,
      cursor: { x, y },
    });
  }

  // 그리기 계속
  continueDrawing(x: number, y: number, middlePoints?: Array<{ x: number; y: number }>): void {
    // strokeId가 없으면 새로 생성 (예외 상황 대응)
    if (!this.currentStrokeId) {
      this.currentStrokeId = this.generateId();
    }
    
    this.addDrawingOperation({
      type: "draw",
      x,
      y,
      brushSize: this.currentBrushSize,
      color: this.currentColor,
      userId: this.currentUser.id,
      strokeId: this.currentStrokeId,
      strokeState: "move",
      middlePoints: middlePoints,
    });

    this.updateAwareness({
      cursor: { x, y },
    });
  }

  // 현재 strokeId 가져오기
  getCurrentStrokeId(): string | null {
    return this.currentStrokeId;
  }

  // 그리기 종료
  endDrawing(): void {
    // strokeId 초기화
    this.currentStrokeId = null;
    
    this.updateAwareness({
      isDrawing: false,
      cursor: null,
    });
  }

  // 지우기
  erase(x: number, y: number, brushSize: number = 10): void {
    this.addDrawingOperation({
      type: "erase",
      x,
      y,
      brushSize,
      userId: this.currentUser.id,
    });
  }

  // 캔버스 지우기
  clearCanvas(): void {
    this.addDrawingOperation({
      type: "clear",
      x: 0,
      y: 0,
      userId: this.currentUser.id,
    });
  }

  // 커서 위치 업데이트
  updateCursor(x: number, y: number): void {
    this.updateAwareness({
      cursor: { x, y },
    });
  }

  // 현재 브러시 설정을 업데이트 (외부에서 호출)
  setBrushSize(size: number): void {
    this.currentBrushSize = size;
  }

  setBrushColor(color: string): void {
    this.currentColor = color;
  }

  // 선택 영역 업데이트
  updateSelection(x: number, y: number, width: number, height: number): void {
    this.updateAwareness({
      selection: { x, y, width, height },
    });
  }

  // Awareness 상태 업데이트
  private updateAwareness(updates: Partial<AwarenessState>): void {
    const currentState = this.awareness.getLocalState() || {};
    this.awareness.setLocalStateField("user", this.currentUser);

    Object.assign(currentState, updates);
    this.awareness.setLocalState(currentState);
  }

  // 모든 그리기 작업 가져오기
  getAllOperations(): DrawingOperation[] {
    const operations: DrawingOperation[] = [];
    this.drawingMap.forEach((operation) => {
      operations.push(operation);
    });
    return operations.sort((a, b) => a.timestamp - b.timestamp);
  }

  // getAllDrawingOperations는 getAllOperations의 별칭 (일관성을 위해)
  getAllDrawingOperations(): DrawingOperation[] {
    return this.getAllOperations();
  }

  addObject(obj: Omit<CanvasObject, "id" | "timestamp" | "userId">): string {
    const id = this.generateId();
    const fullObject: CanvasObject = {
      ...obj,
      id,
      userId: this.currentUser.id,
      timestamp: Date.now(),
    };
    this.objectsMap.set(id, fullObject);
    return id;
  }

  updateObject(id: string, updates: Partial<CanvasObject>): void {
    const obj = this.objectsMap.get(id);
    if (obj) {
      this.objectsMap.set(id, { ...obj, ...updates });
    }
  }

  removeObject(id: string): void {
    this.objectsMap.delete(id);
  }

  getAllObjects(): CanvasObject[] {
    const objects: CanvasObject[] = [];
    this.objectsMap.forEach((obj) => {
      objects.push(obj);
    });
    return objects.sort((a, b) => a.timestamp - b.timestamp);
  }

  getBackgroundState(): BackgroundState | null {
    if (this.backgroundState.size === 0) {
      return null;
    }

    const dataUrl = this.backgroundState.get("dataUrl") ?? null;
    const x = this.backgroundState.get("x");
    const y = this.backgroundState.get("y");
    const scale = this.backgroundState.get("scale");

    if (typeof x !== "number" || typeof y !== "number" || typeof scale !== "number") {
      return null;
    }

    return {
      dataUrl: typeof dataUrl === "string" ? dataUrl : null,
      x,
      y,
      scale,
    };
  }

  setBackgroundState(state: BackgroundState | null): void {
    if (state === null) {
      this.backgroundState.clear();
      return;
    }

    const normalizedDataUrl = state.dataUrl ?? null;
    if (this.backgroundState.get("dataUrl") !== normalizedDataUrl) {
      this.backgroundState.set("dataUrl", normalizedDataUrl);
    }
    if (this.backgroundState.get("x") !== state.x) {
      this.backgroundState.set("x", state.x);
    }
    if (this.backgroundState.get("y") !== state.y) {
      this.backgroundState.set("y", state.y);
    }
    if (this.backgroundState.get("scale") !== state.scale) {
      this.backgroundState.set("scale", state.scale);
    }
  }

  // 특정 사용자의 작업만 가져오기
  getOperationsByUser(userId: string): DrawingOperation[] {
    return this.getAllOperations().filter((op) => op.userId === userId);
  }

  // 특정 시간 이후의 작업 가져오기
  getOperationsAfter(timestamp: number): DrawingOperation[] {
    return this.getAllOperations().filter((op) => op.timestamp > timestamp);
  }

  // 연결 상태 확인
  isConnected(): boolean {
    try {
      return (
        (this.wsProvider?.wsconnected || false) &&
        (this.wsProvider?.ws?.readyState === WebSocket.OPEN || false)
      );
    } catch (error) {
      return false;
    }
  }

  // 연결 해제
  disconnect(): void {
    try {
      this.manuallyClosed = true;
      // WebSocket 연결 해제
      if (this.wsProvider) {
        try {
          this.wsProvider.destroy();
        } catch (wsError) {
          // 무시
        }
        this.wsProvider = null;
      }

      // IndexedDB 프로바이더 해제
      if (this.indexeddbProvider) {
        try {
          this.indexeddbProvider.destroy();
        } catch (idbError) {
          // 무시
        }
        this.indexeddbProvider = null;
      }

      // Y.js 문서 해제
      if (this.doc) {
        try {
          this.doc.destroy();
        } catch (docError) {
          // 무시
        }
      }
    } catch (error) {
      // 모든 오류 무시
    }
  }

  // ID 생성
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  // 문서 상태 직렬화 (저장용)
  exportState(): string {
    const drawings = this.getAllOperations();
    const background = this.getBackgroundState();
    const objects = this.getAllObjects();
    
    return JSON.stringify({
      version: "1.0",
      timestamp: Date.now(),
      drawings,
      background,
      objects,
    });
  }

  // 문서 상태 복원 (불러오기)
  importState(serialized: string): void {
    try {
      const data = JSON.parse(serialized);
      
      if (data.version !== "1.0") {
        throw new Error("지원하지 않는 버전입니다.");
      }

      // 기존 데이터 지우기
      this.drawingMap.clear();
      this.backgroundState.clear();
      this.objectsMap.clear();

      // 그리기 데이터 복원
      if (Array.isArray(data.drawings)) {
        data.drawings.forEach((op: DrawingOperation) => {
          this.drawingMap.set(op.id, op);
        });
      }

      // 배경 이미지 상태 복원
      if (data.background) {
        this.setBackgroundState(data.background);
      }

      // 객체 데이터 복원
      if (Array.isArray(data.objects)) {
        data.objects.forEach((obj: CanvasObject) => {
          this.objectsMap.set(obj.id, obj);
        });
      }
    } catch (error) {
      console.error("상태 복원 실패:", error);
      throw error;
    }
  }

  // 콜백 설정
  setOnDrawingUpdate(callback: (operations: DrawingOperation[]) => void): void {
    this.onDrawingUpdate = callback;
  }

  setOnAwarenessUpdate(
    callback: (states: Map<string, AwarenessState>) => void
  ): void {
    this.onAwarenessUpdate = callback;
  }

  private onBackgroundStateUpdate?: (state: BackgroundState | null) => void;

  setOnBackgroundStateUpdate(
    callback: (state: BackgroundState | null) => void
  ): void {
    this.onBackgroundStateUpdate = callback;
    callback(this.getBackgroundState());
  }

  setOnObjectsUpdate(callback: (objects: CanvasObject[]) => void): void {
    this.onObjectsUpdate = callback;
    callback(this.getAllObjects());
  }
}
