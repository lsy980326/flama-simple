# Live Collaboration Tool

실시간 협업 도구 - WebRTC, Socket.IO, Y.js 기반의 라이브러리 형태 협업 플랫폼

## 🚀 주요 기능

- **실시간 공유 그림 그리기**: PixiJS 기반 고성능 캔버스 렌더링
- **핀포인트 피드백**: 이미지에 핀을 찍어 협업 피드백 제공
- **실시간 영상/음성 통화**: WebRTC P2P 통신
- **실시간 채팅**: Socket.IO 기반 채팅 시스템
- **데이터 동기화**: Y.js CRDT를 통한 충돌 없는 실시간 동기화
- **사용자 상태 관리**: 실시간 사용자 Awareness

## 🏗️ 기술 스택

### 프론트엔드

- **React.js + TypeScript**: 협업 UI 컴포넌트 개발, 라이브러리화
- **PixiJS**: 고성능 WebGL 기반 캔버스 렌더링
- **Socket.IO Client**: 실시간 통신
- **Y.js**: CRDT 데이터 동기화

### 백엔드

- **Node.js + Express.js**: 시그널링 서버, API 서버
- **Socket.IO**: 시그널링, 채팅, 사용자 상태 관리
- **TypeScript**: 타입 안전성

### 인프라

- **STUN/TURN 서버**: NAT 환경에서의 안정적인 P2P 연결
- **WebRTC**: P2P 영상/음성 통화, 데이터 채널

## 📁 프로젝트 구조

```
live-collaboration-tool/
├── client/                    # 프론트엔드 React 프로젝트
│   ├── src/
│   │   ├── lib/              # 라이브러리 코드
│   │   │   ├── collaboration/ # 협업 관련 모듈
│   │   │   ├── canvas/        # 캔버스 관리
│   │   │   ├── webrtc/        # WebRTC 관리
│   │   │   ├── types.ts       # 타입 정의
│   │   │   ├── utils.ts       # 유틸리티 함수
│   │   │   └── index.ts       # 메인 엔트리 포인트
│   │   └── ...
│   ├── package.json
│   └── ...
└── server/                    # 백엔드 Express 프로젝트
    ├── src/
    │   └── index.ts          # 서버 메인 파일
    ├── package.json
    └── tsconfig.json
```

## 🛠️ 설치 및 실행

### 1. 의존성 설치

```bash
# PNPM 설치 (전역)
npm install -g pnpm

# 클라이언트 의존성 설치
cd client
pnpm install

# 서버 의존성 설치
cd ../server
pnpm install
```

### 2. 환경 설정

서버 디렉토리에 `.env` 파일을 생성하고 다음 내용을 추가:

```env
PORT=5000
CLIENT_URL=http://localhost:3000
STUN_SERVER=stun:stun.l.google.com:19302
```

### 3. 실행

```bash
# 서버 실행 (개발 모드)
cd server
pnpm run dev

# 클라이언트 실행 (새 터미널)
cd client
pnpm start
```

## 📚 라이브러리 사용법

### 기본 사용법

```typescript
import {
  CollaborationManager,
  CanvasManager,
  WebRTCManager,
  PinpointManager,
  ChatManager,
} from "./lib";

// 협업 매니저 초기화
const collaborationManager = new CollaborationManager({
  serverUrl: "http://localhost:5000",
  roomId: "room-123",
  userId: "user-123",
  userName: "사용자명",
  userColor: "#FF6B6B",
});

// 캔버스 매니저 초기화
const canvasManager = new CanvasManager(
  document.getElementById("canvas-container")!,
  800,
  600
);

// WebRTC 매니저 초기화
const webrtcManager = new WebRTCManager({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

// 핀포인트 매니저 초기화
const pinpointManager = new PinpointManager(
  document.getElementById("image-container")!
);

// 채팅 매니저 초기화
const chatManager = new ChatManager(document.getElementById("chat-container")!);

// 연결 시작
await collaborationManager.connect();
await webrtcManager.initializeMedia();
```

### 빠른 테스트: 외부에서 간단히 쓰기

이 레포에는 최소 사용 예제가 포함되어 있습니다.

1. 예제 파일: `client/src/examples/MinimalUsage.tsx`

```tsx
import React from "react";
import { LiveCollabCanvas } from "../lib";

export default function MinimalUsage() {
  return (
    <LiveCollabCanvas
      serverUrl="ws://localhost:5001"
      roomId="demo-room"
      user={{ id: "demo-user", name: "Demo", color: "#4ECDC4", isOnline: true }}
      width={800}
      height={500}
      showToolbar
    />
  );
}
```

2. 원하는 페이지에서 `MinimalUsage`를 import하여 렌더하거나, 다른 프로젝트에서는 `LiveCollabCanvas`를 동일한 방식으로 사용하면 됩니다. 서버의 Y.js WebSocket(`ws://localhost:5001`)이 실행 중이어야 실시간 동기화가 동작합니다.

## 🔧 주요 컴포넌트

### CollaborationManager

- Socket.IO 연결 관리
- 방 참가/떠나기
- 실시간 데이터 동기화

### CanvasManager

- PixiJS 기반 캔버스 관리
- 그리기 도구 및 브러시 설정
- 실시간 그리기 동기화

### WebRTCManager

- P2P 연결 관리
- 미디어 스트림 처리
- 데이터 채널 통신

### PinpointManager

- 핀포인트 생성/관리
- 피드백 시스템
- 시각적 표시

### ChatManager

- 실시간 채팅
- 메시지 관리
- UI 렌더링

## 🎯 라이브러리화 목표

이 프로젝트는 어디서든 쉽게 가져다 쓸 수 있는 라이브러리 형태로 개발됩니다:

- **모듈화된 구조**: 필요한 기능만 선택적으로 사용 가능
- **타입 안전성**: TypeScript로 완전한 타입 지원
- **플러그인 방식**: 각 기능을 독립적으로 사용 가능
- **설정 가능**: 다양한 옵션으로 커스터마이징 가능

## 📝 라이선스

MIT License

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
