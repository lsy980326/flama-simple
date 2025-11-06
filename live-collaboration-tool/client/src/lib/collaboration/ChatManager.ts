import { ChatMessage } from '../types';

export class ChatManager {
  private messages: ChatMessage[] = [];
  private container: HTMLElement;
  private onNewMessage?: (message: ChatMessage) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupContainer();
  }

  private setupContainer(): void {
    this.container.innerHTML = `
      <div class="chat-container">
        <div class="chat-messages"></div>
        <div class="chat-input-container">
          <input type="text" class="chat-input" placeholder="메시지를 입력하세요...">
          <button class="chat-send-btn">전송</button>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const input = this.container.querySelector('.chat-input') as HTMLInputElement;
    const sendBtn = this.container.querySelector('.chat-send-btn') as HTMLButtonElement;

    const sendMessage = () => {
      const message = input.value.trim();
      if (message) {
        this.sendMessage(message);
        input.value = '';
      }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }

  // 메시지 전송
  sendMessage(message: string, userId: string = 'current-user', userName: string = '나'): void {
    const chatMessage: ChatMessage = {
      id: this.generateId(),
      userId,
      userName,
      message,
      timestamp: new Date()
    };

    this.addMessage(chatMessage);
    this.onNewMessage?.(chatMessage);
  }

  // 메시지 추가
  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.renderMessage(message);
  }

  // 메시지 렌더링
  private renderMessage(message: ChatMessage): void {
    const messagesContainer = this.container.querySelector('.chat-messages') as HTMLElement;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `
      <div class="message-header">
        <span class="user-name">${message.userName}</span>
        <span class="timestamp">${this.formatTime(message.timestamp)}</span>
      </div>
      <div class="message-content">${message.message}</div>
    `;

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // 시간 포맷팅
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ID 생성
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // 모든 메시지 가져오기
  getAllMessages(): ChatMessage[] {
    return [...this.messages];
  }

  // 메시지 초기화
  clearMessages(): void {
    this.messages = [];
    const messagesContainer = this.container.querySelector('.chat-messages') as HTMLElement;
    messagesContainer.innerHTML = '';
  }

  // 콜백 설정
  setOnNewMessage(callback: (message: ChatMessage) => void): void {
    this.onNewMessage = callback;
  }
}
