import { User } from "../types";

export interface CursorPosition {
  x: number;
  y: number;
  timestamp: number;
}

export interface SelectionArea {
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}

export interface UserAwareness {
  user: User;
  cursor: CursorPosition | null;
  selection: SelectionArea | null;
  isDrawing: boolean;
  isTyping: boolean;
  lastSeen: number;
  color: string;
}

export class AwarenessManager {
  private currentUser: User;
  private awarenessStates: Map<string, UserAwareness> = new Map();
  private cursorUpdateInterval: number | null = null;
  private onAwarenessChange?: (states: Map<string, UserAwareness>) => void;
  private onUserJoin?: (user: User) => void;
  private onUserLeave?: (userId: string) => void;

  constructor(user: User) {
    this.currentUser = user;
    this.setupCursorTracking();
  }

  // 커서 추적 설정
  private setupCursorTracking(): void {
    let lastCursorUpdate = 0;
    const cursorUpdateThrottle = 100; // 100ms마다 업데이트

    const updateCursor = (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastCursorUpdate < cursorUpdateThrottle) {
        return;
      }

      this.updateCurrentUserCursor({
        x: event.clientX,
        y: event.clientY,
        timestamp: now,
      });

      lastCursorUpdate = now;
    };

    // 마우스 이동 이벤트 리스너
    document.addEventListener("mousemove", updateCursor);

    // 마우스가 문서를 벗어날 때 커서 숨기기
    document.addEventListener("mouseleave", () => {
      this.updateCurrentUserCursor(null);
    });

    // 마우스가 문서로 돌아올 때 커서 다시 표시
    document.addEventListener("mouseenter", updateCursor);
  }

  // 현재 사용자 커서 업데이트
  updateCurrentUserCursor(cursor: CursorPosition | null): void {
    const currentState =
      this.awarenessStates.get(this.currentUser.id) ||
      this.createDefaultState();
    currentState.cursor = cursor;
    currentState.lastSeen = Date.now();

    this.awarenessStates.set(this.currentUser.id, currentState);
    this.notifyAwarenessChange();
  }

  // 현재 사용자 선택 영역 업데이트
  updateCurrentUserSelection(selection: SelectionArea | null): void {
    const currentState =
      this.awarenessStates.get(this.currentUser.id) ||
      this.createDefaultState();
    currentState.selection = selection;
    currentState.lastSeen = Date.now();

    this.awarenessStates.set(this.currentUser.id, currentState);
    this.notifyAwarenessChange();
  }

  // 현재 사용자 그리기 상태 업데이트
  updateCurrentUserDrawing(isDrawing: boolean): void {
    const currentState =
      this.awarenessStates.get(this.currentUser.id) ||
      this.createDefaultState();
    currentState.isDrawing = isDrawing;
    currentState.lastSeen = Date.now();

    this.awarenessStates.set(this.currentUser.id, currentState);
    this.notifyAwarenessChange();
  }

  // 현재 사용자 타이핑 상태 업데이트
  updateCurrentUserTyping(isTyping: boolean): void {
    const currentState =
      this.awarenessStates.get(this.currentUser.id) ||
      this.createDefaultState();
    currentState.isTyping = isTyping;
    currentState.lastSeen = Date.now();

    this.awarenessStates.set(this.currentUser.id, currentState);
    this.notifyAwarenessChange();
  }

  // 다른 사용자 Awareness 상태 업데이트
  updateUserAwareness(userId: string, awareness: Partial<UserAwareness>): void {
    const existingState = this.awarenessStates.get(userId);

    if (!existingState) {
      // 새 사용자 추가
      const newState: UserAwareness = {
        user: awareness.user!,
        cursor: awareness.cursor || null,
        selection: awareness.selection || null,
        isDrawing: awareness.isDrawing || false,
        isTyping: awareness.isTyping || false,
        lastSeen: Date.now(),
        color: awareness.color || this.generateUserColor(userId),
      };

      this.awarenessStates.set(userId, newState);
      this.onUserJoin?.(newState.user);
    } else {
      // 기존 사용자 상태 업데이트
      Object.assign(existingState, awareness);
      existingState.lastSeen = Date.now();
      this.awarenessStates.set(userId, existingState);
    }

    this.notifyAwarenessChange();
  }

  // 사용자 제거
  removeUser(userId: string): void {
    const state = this.awarenessStates.get(userId);
    if (state) {
      this.awarenessStates.delete(userId);
      this.onUserLeave?.(userId);
      this.notifyAwarenessChange();
    }
  }

  // 모든 사용자 Awareness 상태 가져오기
  getAllAwarenessStates(): Map<string, UserAwareness> {
    return new Map(this.awarenessStates);
  }

  // 특정 사용자 Awareness 상태 가져오기
  getUserAwareness(userId: string): UserAwareness | null {
    return this.awarenessStates.get(userId) || null;
  }

  // 현재 사용자 상태 가져오기
  getCurrentUserAwareness(): UserAwareness | null {
    return this.awarenessStates.get(this.currentUser.id) || null;
  }

  // 활성 사용자 목록 가져오기 (최근 30초 내 활동)
  getActiveUsers(): UserAwareness[] {
    const now = Date.now();
    const activeThreshold = 30000; // 30초

    return Array.from(this.awarenessStates.values()).filter(
      (state) =>
        now - state.lastSeen < activeThreshold &&
        state.user.id !== this.currentUser.id
    );
  }

  // 사용자 색상 생성
  private generateUserColor(userId: string): string {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E9",
      "#F8BBD9",
      "#A8E6CF",
      "#FFD93D",
      "#6BCF7F",
      "#4D96FF",
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  }

  // 기본 상태 생성
  private createDefaultState(): UserAwareness {
    return {
      user: this.currentUser,
      cursor: null,
      selection: null,
      isDrawing: false,
      isTyping: false,
      lastSeen: Date.now(),
      color: this.generateUserColor(this.currentUser.id),
    };
  }

  // Awareness 변경 알림
  private notifyAwarenessChange(): void {
    this.onAwarenessChange?.(this.getAllAwarenessStates());
  }

  // 비활성 사용자 정리 (5분 이상 비활성)
  cleanupInactiveUsers(): void {
    const now = Date.now();
    const inactiveThreshold = 300000; // 5분

    this.awarenessStates.forEach((state, userId) => {
      if (
        now - state.lastSeen > inactiveThreshold &&
        userId !== this.currentUser.id
      ) {
        this.removeUser(userId);
      }
    });
  }

  // 정기적인 정리 작업 시작
  startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupInactiveUsers();
    }, 60000); // 1분마다 실행
  }

  // 정리
  destroy(): void {
    this.awarenessStates.clear();
    if (this.cursorUpdateInterval) {
      clearInterval(this.cursorUpdateInterval);
    }
  }

  // 콜백 설정
  setOnAwarenessChange(
    callback: (states: Map<string, UserAwareness>) => void
  ): void {
    this.onAwarenessChange = callback;
  }

  setOnUserJoin(callback: (user: User) => void): void {
    this.onUserJoin = callback;
  }

  setOnUserLeave(callback: (userId: string) => void): void {
    this.onUserLeave = callback;
  }
}
