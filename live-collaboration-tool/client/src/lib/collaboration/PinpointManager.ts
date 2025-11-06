import { Pinpoint } from '../types';

export class PinpointManager {
  private pinpoints: Map<string, Pinpoint> = new Map();
  private container: HTMLElement;
  private onPinpointClick?: (pinpoint: Pinpoint) => void;
  private onPinpointAdd?: (pinpoint: Pinpoint) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupContainer();
  }

  private setupContainer(): void {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
  }

  // 핀포인트 추가
  addPinpoint(x: number, y: number, comment: string, userId: string): Pinpoint {
    const pinpoint: Pinpoint = {
      id: this.generateId(),
      x,
      y,
      comment,
      userId,
      createdAt: new Date(),
      isResolved: false
    };

    this.pinpoints.set(pinpoint.id, pinpoint);
    this.renderPinpoint(pinpoint);
    this.onPinpointAdd?.(pinpoint);

    return pinpoint;
  }

  // 핀포인트 업데이트
  updatePinpoint(pinpoint: Pinpoint): void {
    this.pinpoints.set(pinpoint.id, pinpoint);
    this.renderPinpoint(pinpoint);
  }

  // 핀포인트 제거
  removePinpoint(id: string): void {
    const element = document.getElementById(`pinpoint-${id}`);
    if (element) {
      element.remove();
    }
    this.pinpoints.delete(id);
  }

  // 핀포인트 렌더링
  private renderPinpoint(pinpoint: Pinpoint): void {
    const existingElement = document.getElementById(`pinpoint-${pinpoint.id}`);
    if (existingElement) {
      existingElement.remove();
    }

    const pinElement = document.createElement('div');
    pinElement.id = `pinpoint-${pinpoint.id}`;
    pinElement.className = 'pinpoint';
    pinElement.style.position = 'absolute';
    pinElement.style.left = `${pinpoint.x}px`;
    pinElement.style.top = `${pinpoint.y}px`;
    pinElement.style.width = '20px';
    pinElement.style.height = '20px';
    pinElement.style.borderRadius = '50%';
    pinElement.style.backgroundColor = this.getUserColor(pinpoint.userId);
    pinElement.style.border = '2px solid white';
    pinElement.style.cursor = 'pointer';
    pinElement.style.zIndex = '1000';
    pinElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

    // 클릭 이벤트
    pinElement.addEventListener('click', () => {
      this.onPinpointClick?.(pinpoint);
    });

    // 툴팁
    pinElement.title = pinpoint.comment;

    this.container.appendChild(pinElement);
  }

  // 사용자 색상 가져오기
  private getUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  // ID 생성
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // 모든 핀포인트 가져오기
  getAllPinpoints(): Pinpoint[] {
    return Array.from(this.pinpoints.values());
  }

  // 해결된 핀포인트만 가져오기
  getResolvedPinpoints(): Pinpoint[] {
    return Array.from(this.pinpoints.values()).filter(p => p.isResolved);
  }

  // 진행 중인 핀포인트만 가져오기
  getActivePinpoints(): Pinpoint[] {
    return Array.from(this.pinpoints.values()).filter(p => !p.isResolved);
  }

  // 핀포인트 해결 표시
  markAsResolved(id: string): void {
    const pinpoint = this.pinpoints.get(id);
    if (pinpoint) {
      pinpoint.isResolved = true;
      this.updatePinpoint(pinpoint);
    }
  }

  // 콜백 설정
  setOnPinpointClick(callback: (pinpoint: Pinpoint) => void): void {
    this.onPinpointClick = callback;
  }

  setOnPinpointAdd(callback: (pinpoint: Pinpoint) => void): void {
    this.onPinpointAdd = callback;
  }
}
