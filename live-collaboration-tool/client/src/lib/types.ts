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

export interface Pinpoint {
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
