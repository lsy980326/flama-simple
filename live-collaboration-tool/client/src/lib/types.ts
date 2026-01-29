// 타입 정의
export interface User {
  id: string;
  name: string;
  color: string;
  isOnline: boolean;
}

export interface Room {
  id: string;
  name: string;
  users: User[];
  createdAt: Date;
}

/**
 * 2D 핀포인트 (기존)
 */
export interface Pinpoint2D {
  id: string;
  type: '2d';
  x: number;
  y: number;
  comment: string;
  userId: string;
  createdAt: Date;
  isResolved: boolean;
}

/**
 * 3D 핀포인트 (스케치업용)
 */
export interface Pinpoint3D {
  id: string;
  type: '3d';
  position: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  comment: string;
  userId: string;
  createdAt: Date;
  isResolved: boolean;
  viewState?: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
    fov?: number;
    near?: number;
    far?: number;
  };
}

/**
 * 통합 핀포인트 타입 (2D 또는 3D)
 */
export type Pinpoint = Pinpoint2D | Pinpoint3D;

/**
 * @deprecated 기존 Pinpoint 인터페이스는 Pinpoint2D로 대체됨
 * 호환성을 위해 유지하지만, 새 코드는 Pinpoint2D 또는 Pinpoint 타입 사용 권장
 * 
 * 참고: 이 인터페이스는 type alias와 충돌하므로 제거 예정
 * 기존 코드 호환을 위해 임시로 유지
 */
export interface LegacyPinpoint {
  id: string;
  x: number;
  y: number;
  comment: string;
  userId: string;
  createdAt: Date;
  isResolved: boolean;
}

export type DrawingTool = "brush" | "eraser" | "text" | "rectangle" | "circle" | "line";

export interface DrawingData {
  type: "draw" | "erase" | "clear" | "shape" | "text";
  tool?: DrawingTool;
  x: number;
  y: number;
  x2?: number; // 도형 끝점
  y2?: number;
  width?: number; // 도형 크기
  height?: number;
  radius?: number; // 원 반지름
  text?: string; // 텍스트 내용
  fontSize?: number;
  pressure?: number;
  color?: string;
  brushSize?: number;
  timestamp?: number; // 타임스탬프 (점과 선 구분용)
  strokeId?: string; // 획(stroke) ID - 같은 획인지 구분
  strokeState?: "start" | "move" | "end"; // 획의 상태: 시작/이동/종료
  middlePoints?: Array<{ x: number; y: number }>; // 부드러운 곡선 처리를 위한 미들포인트
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

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
}

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

export interface CollaborationConfig {
  serverUrl: string;
  roomId: string;
  userId: string;
  userName: string;
  userColor: string;
  webrtcConfig?: WebRTCConfig;
}
