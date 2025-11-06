import { io, Socket } from 'socket.io-client';
import { CollaborationConfig, User, Room, Pinpoint, ChatMessage } from '../types';

export class CollaborationManager {
  private socket: Socket | null = null;
  private config: CollaborationConfig;
  private currentRoom: Room | null = null;
  private users: Map<string, User> = new Map();

  constructor(config: CollaborationConfig) {
    this.config = config;
  }

  // 연결 초기화
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.config.serverUrl, {
        auth: {
          userId: this.config.userId,
          userName: this.config.userName,
          userColor: this.config.userColor
        }
      });

      this.socket.on('connect', () => {
        console.log('서버에 연결되었습니다:', this.socket?.id);
        this.joinRoom(this.config.roomId);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('연결 오류:', error);
        reject(error);
      });

      this.setupEventListeners();
    });
  }

  // 방 참가
  joinRoom(roomId: string): void {
    if (this.socket) {
      this.socket.emit('join-room', roomId);
    }
  }

  // 방 떠나기
  leaveRoom(roomId: string): void {
    if (this.socket) {
      this.socket.emit('leave-room', roomId);
    }
  }

  // 연결 해제
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // 이벤트 리스너 설정
  private setupEventListeners(): void {
    if (!this.socket) return;

    // 사용자 참가
    this.socket.on('user-joined', (userId: string) => {
      console.log('새 사용자 참가:', userId);
      this.onUserJoined?.(userId);
    });

    // 사용자 떠남
    this.socket.on('user-left', (userId: string) => {
      console.log('사용자 떠남:', userId);
      this.onUserLeft?.(userId);
    });

    // 채팅 메시지
    this.socket.on('chat-message', (message: ChatMessage) => {
      this.onChatMessage?.(message);
    });

    // 핀포인트 데이터
    this.socket.on('pinpoint-data', (pinpoint: Pinpoint) => {
      this.onPinpointUpdate?.(pinpoint);
    });

    // 그림 그리기 데이터
    this.socket.on('drawing-data', (data: any) => {
      this.onDrawingData?.(data);
    });
  }

  // 채팅 메시지 전송
  sendChatMessage(message: string): void {
    if (this.socket) {
      this.socket.emit('chat-message', {
        roomId: this.config.roomId,
        message,
        userId: this.config.userId,
        userName: this.config.userName,
        timestamp: new Date()
      });
    }
  }

  // 핀포인트 전송
  sendPinpoint(pinpoint: Omit<Pinpoint, 'id' | 'createdAt'>): void {
    if (this.socket) {
      this.socket.emit('pinpoint-data', {
        ...pinpoint,
        id: this.generateId(),
        createdAt: new Date(),
        roomId: this.config.roomId
      });
    }
  }

  // 그림 그리기 데이터 전송
  sendDrawingData(data: any): void {
    if (this.socket) {
      this.socket.emit('drawing-data', {
        ...data,
        roomId: this.config.roomId,
        userId: this.config.userId
      });
    }
  }

  // ID 생성
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // 콜백 함수들
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onPinpointUpdate?: (pinpoint: Pinpoint) => void;
  onDrawingData?: (data: any) => void;
}
