import { WebRTCConfig } from '../types';

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private config: WebRTCConfig;

  constructor(config: WebRTCConfig) {
    this.config = config;
  }

  // 미디어 스트림 초기화
  async initializeMedia(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      this.onLocalStream?.(this.localStream);
    } catch (error) {
      console.error('미디어 스트림 초기화 실패:', error);
      throw error;
    }
  }

  // 피어 연결 생성
  createPeerConnection(): RTCPeerConnection {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers
    });

    // ICE 후보 이벤트
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(event.candidate);
      }
    };

    // 원격 스트림 수신
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.onRemoteStream?.(this.remoteStream);
    };

    // 데이터 채널 생성
    this.dataChannel = this.peerConnection.createDataChannel('collaboration', {
      ordered: true
    });

    this.dataChannel.onopen = () => {
      console.log('데이터 채널 열림');
      this.onDataChannelOpen?.();
    };

    this.dataChannel.onmessage = (event) => {
      this.onDataChannelMessage?.(event.data);
    };

    return this.peerConnection;
  }

  // Offer 생성 및 전송
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('피어 연결이 초기화되지 않았습니다.');
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    return offer;
  }

  // Answer 생성 및 전송
  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('피어 연결이 초기화되지 않았습니다.');
    }

    await this.peerConnection.setRemoteDescription(offer);
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    return answer;
  }

  // Answer 처리
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('피어 연결이 초기화되지 않았습니다.');
    }

    await this.peerConnection.setRemoteDescription(answer);
  }

  // ICE 후보 처리
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('피어 연결이 초기화되지 않았습니다.');
    }

    await this.peerConnection.addIceCandidate(candidate);
  }

  // 데이터 채널을 통한 메시지 전송
  sendData(data: any): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  // 연결 종료
  close(): void {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
  }

  // 콜백 함수들
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onDataChannelOpen?: () => void;
  onDataChannelMessage?: (data: string) => void;
}
