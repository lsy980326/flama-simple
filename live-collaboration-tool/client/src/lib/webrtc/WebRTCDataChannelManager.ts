import { WebRTCConfig, User } from "../types";

export interface WebRTCDataChannelMessage {
  type: "drawing" | "awareness" | "chat" | "file";
  data: any;
  userId: string;
  timestamp: number;
}

export interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
  isConnected: boolean;
}

export class WebRTCDataChannelManager {
  private config: WebRTCConfig;
  private currentUser: User;
  private peerConnections: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private onDataChannelMessage?: (message: WebRTCDataChannelMessage) => void;
  private onPeerConnected?: (peerId: string) => void;
  private onPeerDisconnected?: (peerId: string) => void;
  private onLocalStream?: (stream: MediaStream) => void;
  private onRemoteStream?: (peerId: string, stream: MediaStream) => void;

  constructor(config: WebRTCConfig, user: User) {
    this.config = config;
    this.currentUser = user;
  }

  // 미디어 스트림 초기화
  async initializeMedia(): Promise<void> {
    try {
      // 미디어 권한이 이미 사용 중이거나 거부된 경우를 위한 처리
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        this.onLocalStream?.(this.localStream);
      } catch (mediaError: any) {
        // NotReadableError나 다른 미디어 오류는 경고만 출력
        if (
          mediaError.name === "NotReadableError" ||
          mediaError.name === "NotAllowedError" ||
          mediaError.name === "NotFoundError"
        ) {
          console.warn(
            "미디어 스트림 초기화 실패 (계속 진행):",
            mediaError.name,
            mediaError.message
          );
          // 미디어는 선택사항이므로 오류를 무시하고 계속 진행
          return;
        }
        // 다른 오류는 던짐
        throw mediaError;
      }
    } catch (error) {
      // 알 수 없는 오류도 경고만 출력하고 계속 진행
      console.warn("미디어 스트림 초기화 실패 (계속 진행):", error);
      // 오류를 던지지 않고 무시 (미디어는 선택사항)
    }
  }

  // 피어 연결 생성
  async createPeerConnection(peerId: string): Promise<RTCPeerConnection> {
    const connection = new RTCPeerConnection({
      iceServers: this.config.iceServers,
    });

    // ICE 후보 이벤트
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(peerId, event.candidate);
      }
    };

    // 연결 상태 변경
    connection.onconnectionstatechange = () => {
      console.log(`피어 ${peerId} 연결 상태:`, connection.connectionState);

      if (connection.connectionState === "connected") {
        this.onPeerConnected?.(peerId);
      } else if (
        connection.connectionState === "disconnected" ||
        connection.connectionState === "failed"
      ) {
        this.onPeerDisconnected?.(peerId);
      }
    };

    // 원격 스트림 수신
    connection.ontrack = (event) => {
      const stream = event.streams[0];
      this.onRemoteStream?.(peerId, stream);
    };

    // 데이터 채널 생성
    const dataChannel = connection.createDataChannel("collaboration", {
      ordered: true,
      maxRetransmits: 3,
    });

    this.setupDataChannel(dataChannel, peerId);

    // 로컬 스트림 추가
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        connection.addTrack(track, this.localStream!);
      });
    }

    // 피어 연결 저장
    this.peerConnections.set(peerId, {
      peerId,
      connection,
      dataChannel,
      isConnected: false,
    });

    return connection;
  }

  // 데이터 채널 설정
  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    dataChannel.onopen = () => {
      console.log(`데이터 채널 열림: ${peerId}`);
      const peer = this.peerConnections.get(peerId);
      if (peer) {
        peer.isConnected = true;
      }
    };

    dataChannel.onclose = () => {
      console.log(`데이터 채널 닫힘: ${peerId}`);
      const peer = this.peerConnections.get(peerId);
      if (peer) {
        peer.isConnected = false;
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        const message: WebRTCDataChannelMessage = JSON.parse(event.data);
        this.onDataChannelMessage?.(message);
      } catch (error) {
        console.error("데이터 채널 메시지 파싱 오류:", error);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`데이터 채널 오류 (${peerId}):`, error);
    };
  }

  // Offer 생성
  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const peer = this.peerConnections.get(peerId);
    if (!peer) {
      throw new Error(`피어 연결을 찾을 수 없습니다: ${peerId}`);
    }

    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    return offer;
  }

  // Answer 생성
  async createAnswer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    const peer = this.peerConnections.get(peerId);
    if (!peer) {
      throw new Error(`피어 연결을 찾을 수 없습니다: ${peerId}`);
    }

    await peer.connection.setRemoteDescription(offer);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setRemoteDescription(answer);
    return answer;
  }

  // Answer 처리
  async handleAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const peer = this.peerConnections.get(peerId);
    if (!peer) {
      throw new Error(`피어 연결을 찾을 수 없습니다: ${peerId}`);
    }

    await peer.connection.setRemoteDescription(answer);
  }

  // ICE 후보 처리
  async handleIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const peer = this.peerConnections.get(peerId);
    if (!peer) {
      throw new Error(`피어 연결을 찾을 수 없습니다: ${peerId}`);
    }

    await peer.connection.addIceCandidate(candidate);
  }

  // 데이터 채널을 통한 메시지 전송
  sendMessage(peerId: string, type: string, data: any): void {
    const peer = this.peerConnections.get(peerId);
    if (!peer || !peer.isConnected) {
      console.warn(`피어 ${peerId}에 메시지를 전송할 수 없습니다.`);
      return;
    }

    const message: WebRTCDataChannelMessage = {
      type: type as any,
      data,
      userId: this.currentUser.id,
      timestamp: Date.now(),
    };

    peer.dataChannel.send(JSON.stringify(message));
  }

  // 모든 연결된 피어에게 브로드캐스트
  broadcastMessage(type: string, data: any): void {
    this.peerConnections.forEach((peer, peerId) => {
      if (peer.isConnected) {
        this.sendMessage(peerId, type, data);
      }
    });
  }

  // 그리기 데이터 전송
  sendDrawingData(peerId: string, drawingData: any): void {
    this.sendMessage(peerId, "drawing", drawingData);
  }

  // Awareness 데이터 전송
  sendAwarenessData(peerId: string, awarenessData: any): void {
    this.sendMessage(peerId, "awareness", awarenessData);
  }

  // 채팅 메시지 전송
  sendChatMessage(peerId: string, message: string): void {
    this.sendMessage(peerId, "chat", { message });
  }

  // 파일 전송
  sendFile(peerId: string, file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.sendMessage(peerId, "file", {
        name: file.name,
        type: file.type,
        size: file.size,
        data: reader.result,
      });
    };
    reader.readAsArrayBuffer(file);
  }

  // 피어 연결 제거
  removePeer(peerId: string): void {
    const peer = this.peerConnections.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peerConnections.delete(peerId);
    }
  }

  // 모든 연결 해제
  disconnect(): void {
    this.peerConnections.forEach((peer) => {
      peer.connection.close();
    });
    this.peerConnections.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  // 연결된 피어 목록 가져오기
  getConnectedPeers(): string[] {
    return Array.from(this.peerConnections.keys()).filter((peerId) => {
      const peer = this.peerConnections.get(peerId);
      return peer?.isConnected || false;
    });
  }

  // 연결 상태 확인
  isConnected(peerId: string): boolean {
    const peer = this.peerConnections.get(peerId);
    return peer?.isConnected || false;
  }

  // 콜백 설정
  setOnDataChannelMessage(
    callback: (message: WebRTCDataChannelMessage) => void
  ): void {
    this.onDataChannelMessage = callback;
  }

  setOnPeerConnected(callback: (peerId: string) => void): void {
    this.onPeerConnected = callback;
  }

  setOnPeerDisconnected(callback: (peerId: string) => void): void {
    this.onPeerDisconnected = callback;
  }

  setOnLocalStream(callback: (stream: MediaStream) => void): void {
    this.onLocalStream = callback;
  }

  setOnRemoteStream(
    callback: (peerId: string, stream: MediaStream) => void
  ): void {
    this.onRemoteStream = callback;
  }

  setOnIceCandidate(
    callback: (peerId: string, candidate: RTCIceCandidate) => void
  ): void {
    this.onIceCandidate = callback;
  }

  private onIceCandidate?: (peerId: string, candidate: RTCIceCandidate) => void;
}
