# Live Collaboration Tool

실시간 협업 도구 라이브러리 - WebRTC, Socket.IO, Y.js 기반의 React 컴포넌트 및 서버

## 📦 설치

### 클라이언트 라이브러리

```bash
npm install @live-collaboration-tool/client
```

### 서버 패키지

```bash
npm install @live-collaboration-tool/server
```

### 필수 Peer Dependencies

클라이언트 라이브러리는 다음 패키지들이 필요합니다:

```bash
npm install react react-dom
```

**지원 버전:**
- React: ^18.0.0 || ^19.0.0
- React DOM: ^18.0.0 || ^19.0.0

## 🚀 빠른 시작

### 1단계: 서버 실행

라이브러리를 사용하기 전에 **서버를 먼저 실행**해야 합니다.

```bash
# 서버 설치
npm install @live-collaboration-tool/server

# 서버 실행
cd node_modules/@live-collaboration-tool/server
npm run build
npm start
```

또는 환경 변수와 함께:

```bash
PORT=5000 YJS_WS_PORT=5001 CLIENT_URL=http://localhost:3000 npm start
```

**서버 포트:**
- **HTTP/Socket.IO**: `http://localhost:5000`
- **Y.js WebSocket**: `ws://localhost:5001`

### 2단계: 클라이언트 설치 및 사용

```bash
# 클라이언트 라이브러리 설치
npm install @live-collaboration-tool/client
```

```tsx
import React from 'react';
import { LiveCollabCanvas } from '@live-collaboration-tool/client';

function App() {
  return (
    <LiveCollabCanvas
      serverUrl="ws://localhost:5001"
      roomId="my-room"
      user={{
        id: "user-123",
        name: "사용자",
        color: "#4ECDC4",
        isOnline: true
      }}
      width={800}
      height={600}
      showToolbar
    />
  );
}

export default App;
```

## 🎯 주요 기능

- **실시간 공유 그림 그리기**: PixiJS 기반 고성능 캔버스 렌더링
- **실시간 영상/음성 통화**: WebRTC P2P 통신
- **실시간 채팅**: Socket.IO 기반 채팅 시스템
- **데이터 동기화**: Y.js CRDT를 통한 충돌 없는 실시간 동기화
- **사용자 상태 관리**: 실시간 사용자 Awareness
- **문서 뷰어**: 다양한 문서 형식 지원 (DOCX, HWP, TXT, 이미지 등)

## 📚 주요 컴포넌트 및 API

### React 컴포넌트

#### `LiveCollabCanvas`

실시간 협업 캔버스 컴포넌트

```tsx
<LiveCollabCanvas
  serverUrl="ws://localhost:5001"
  roomId="room-id"
  user={user}
  width={800}
  height={600}
  showToolbar={true}
  onError={(error) => console.error(error)}
/>
```

#### `DocumentViewer`

문서 뷰어 컴포넌트

```tsx
import { DocumentViewer } from '@live-collaboration-tool/client';

<DocumentViewer
  document={document}
  onAction={(action) => console.log(action)}
/>
```

#### `WebtoonViewer`

웹툰 뷰어 컴포넌트

```tsx
import { WebtoonViewer } from '@live-collaboration-tool/client';

<WebtoonViewer
  images={imageUrls}
  width="medium"
/>
```

### 매니저 클래스

#### `CollaborationManager`

Socket.IO 기반 협업 관리

```typescript
import { CollaborationManager } from '@live-collaboration-tool/client';

const manager = new CollaborationManager({
  serverUrl: "http://localhost:5000",
  roomId: "room-123",
  userId: "user-123",
  userName: "사용자",
  userColor: "#FF6B6B",
});

await manager.connect();
manager.on('userJoined', (user) => console.log('User joined:', user));
```

#### `CanvasManager`

PixiJS 기반 캔버스 관리

```typescript
import { CanvasManager } from '@live-collaboration-tool/client';

const canvasManager = new CanvasManager(
  document.getElementById("canvas-container")!,
  800,
  600
);

canvasManager.setBrushSize(10);
canvasManager.setBrushColor("#FF0000");
canvasManager.clear();
```

#### `WebRTCManager`

WebRTC P2P 통신 관리

```typescript
import { WebRTCManager } from '@live-collaboration-tool/client';

const webrtcManager = new WebRTCManager({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

await webrtcManager.initializeMedia();
const stream = webrtcManager.getLocalStream();
```

### 문서 어댑터

```typescript
import {
  TxtAdapter,
  DocxAdapter,
  HwpAdapter,
  ImageAdapter,
  MeAdapter,
} from '@live-collaboration-tool/client';

// 텍스트 파일 어댑터
const txtAdapter = new TxtAdapter();
const document = await txtAdapter.load(file);

// DOCX 파일 어댑터
const docxAdapter = new DocxAdapter();
const document = await docxAdapter.load(file);
```

### 스토리지 프로바이더

```typescript
import {
  MemoryStorageProvider,
  IndexedDBStorageProvider,
} from '@live-collaboration-tool/client';

// 메모리 스토리지
const memoryStorage = new MemoryStorageProvider();

// IndexedDB 스토리지
const indexedDBStorage = new IndexedDBStorageProvider('my-db');
```

## 🏗️ 프로젝트 구조

```
live-collaboration-tool/
├── client/                    # 클라이언트 라이브러리
│   ├── src/
│   │   ├── lib/              # 라이브러리 코드
│   │   │   ├── collaboration/ # 협업 관련 모듈
│   │   │   ├── canvas/        # 캔버스 관리
│   │   │   ├── webrtc/        # WebRTC 관리
│   │   │   ├── components/     # React 컴포넌트
│   │   │   ├── documents/      # 문서 처리
│   │   │   ├── annotations/   # 어노테이션
│   │   │   └── index.ts       # 메인 엔트리 포인트
│   │   └── examples/          # 사용 예제
│   ├── dist/                  # 빌드된 라이브러리 파일
│   └── package.json
└── server/                    # 서버 패키지
    ├── src/
    │   └── index.ts          # 서버 메인 파일
    ├── dist/                 # 빌드된 서버 파일
    └── package.json
```

## 🛠️ 기술 스택

### 클라이언트

- **React.js + TypeScript**: 협업 UI 컴포넌트 개발
- **PixiJS**: 고성능 WebGL 기반 캔버스 렌더링
- **Socket.IO Client**: 실시간 통신
- **Y.js**: CRDT 데이터 동기화
- **Rollup**: 라이브러리 빌드

### 서버

- **Node.js + Express.js**: HTTP 서버, API 서버
- **Socket.IO**: 실시간 통신, 채팅, 사용자 상태 관리
- **Y.js WebSocket Server**: CRDT 동기화 서버
- **WebSocket (ws)**: Y.js 프로토콜 지원
- **TypeScript**: 타입 안전성

### 인프라

- **STUN/TURN 서버**: NAT 환경에서의 안정적인 P2P 연결
- **WebRTC**: P2P 영상/음성 통신, 데이터 채널

## 📖 타입 정의

라이브러리는 완전한 TypeScript 타입 정의를 제공합니다:

```typescript
import type {
  User,
  Room,
  Pinpoint,
  DrawingTool,
  DrawingData,
  CanvasObject,
  WebRTCConfig,
} from '@live-collaboration-tool/client';
```

## 🔧 커스터마이징

### 문서 어댑터 등록

```typescript
import { createDefaultAdapterRegistry } from '@live-collaboration-tool/client';

const registry = createDefaultAdapterRegistry();
// 커스텀 어댑터 추가
registry.register('custom', customAdapter);
```

### 스토리지 프로바이더 커스터마이징

```typescript
import { StorageProvider } from '@live-collaboration-tool/client';

class CustomStorageProvider implements StorageProvider {
  // 구현...
}
```

## 📝 예제

더 많은 사용 예제는 `client/src/examples/` 디렉토리를 참조하세요:

- `MinimalUsage.tsx`: 최소 사용 예제
- `DocumentViewerDemo.tsx`: 문서 뷰어 예제
- `WebtoonViewerDemo.tsx`: 웹툰 뷰어 예제

## ⚠️ 주의사항

1. **서버 필요**: 이 라이브러리는 백엔드 서버가 필요합니다. 서버는 `@live-collaboration-tool/server` 패키지로 제공됩니다.
2. **서버 실행**: 라이브러리를 사용하기 전에 서버를 먼저 실행해야 합니다.
3. **WebSocket 연결**: 실시간 동기화를 위해 Y.js WebSocket 서버(`ws://localhost:5001`)가 실행 중이어야 합니다.
4. **Socket.IO 연결**: 채팅 및 시그널링을 위해 Socket.IO 서버(`http://localhost:5000`)가 실행 중이어야 합니다.
5. **브라우저 호환성**: 최신 브라우저(Chrome, Firefox, Safari, Edge)를 지원합니다.

## 📚 패키지 구조

이 프로젝트는 두 개의 패키지로 구성됩니다:

### 클라이언트 패키지 (`@live-collaboration-tool/client`)

- React 컴포넌트 및 유틸리티
- 캔버스 관리, 협업 기능
- 문서 뷰어, 어노테이션

**문서:**
- [클라이언트 README](./client/README.md) - 클라이브러리 사용법
- [아키텍처 문서](./client/docs/collab-architecture.md)
- [렌더링 파이프라인](./client/docs/rendering-pipeline.md)
- [저장 파이프라인](./client/docs/storage-pipeline.md)
- [문서 어댑터](./client/docs/document-adapters.md)

### 서버 패키지 (`@live-collaboration-tool/server`)

- Socket.IO 서버
- Y.js WebSocket 서버
- WebRTC 시그널링
- HWP 파일 파싱
- 그레이스풀 셧다운 지원

**문서:**
- [서버 README](./server/README.md) - 서버 설치 및 실행 방법

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

MIT License

## 💬 지원

문제가 발생하거나 질문이 있으시면 이슈를 등록해주세요.
