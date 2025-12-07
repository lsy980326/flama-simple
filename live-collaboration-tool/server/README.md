# @live-collaboration-tool/server

실시간 협업 도구 서버 - Socket.IO, Y.js WebSocket, WebRTC 시그널링 서버

## 📦 설치

```bash
npm install @live-collaboration-tool/server
# 또는
pnpm add @live-collaboration-tool/server
# 또는
yarn add @live-collaboration-tool/server
```

## 🚀 빠른 시작

### 기본 사용법

```bash
# 환경 변수 설정 (선택사항)
export PORT=5000
export YJS_WS_PORT=5001
export CLIENT_URL=http://localhost:3000

# 서버 실행
npm start
```

또는 환경 변수 파일(`.env`) 사용:

```env
PORT=5000
YJS_WS_PORT=5001
CLIENT_URL=http://localhost:3000
NODE_ENV=production
```

### 개발 모드

```bash
npm run dev
```

## ⚙️ 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `5000` | HTTP 서버 및 Socket.IO 포트 |
| `YJS_WS_PORT` | `5001` | Y.js WebSocket 서버 포트 |
| `CLIENT_URL` | `http://localhost:3000` | CORS 허용 클라이언트 URL |
| `NODE_ENV` | `development` | 실행 환경 |

## 🔌 API 엔드포인트

### 기본 엔드포인트

- `GET /` - 서버 정보
- `GET /health` - 헬스 체크

### HWP 파일 파싱

- `POST /api/hwp/parse` - HWP 파일을 HTML로 변환

**요청:**
```bash
curl -X POST http://localhost:5000/api/hwp/parse \
  -F "file=@document.hwp"
```

**응답:**
```json
{
  "success": true,
  "html": "<html>...</html>",
  "text": "추출된 텍스트",
  "textLines": ["줄1", "줄2", ...],
  "pageBreaks": [0, 10, 20],
  "hml": "<HWPML>...</HWPML>",
  "metadata": {...}
}
```

## 🔌 WebSocket 연결

### Socket.IO (포트: 5000)

클라이언트에서 Socket.IO로 연결:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('연결됨:', socket.id);
  
  // 방 참가
  socket.emit('join-room', 'room-123');
});

// 이벤트 리스너
socket.on('user-joined', (userId) => {
  console.log('사용자 참가:', userId);
});

socket.on('user-left', (userId) => {
  console.log('사용자 나감:', userId);
});
```

**지원 이벤트:**
- `join-room` - 방 참가
- `leave-room` - 방 떠나기
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice-candidate` - WebRTC ICE candidate
- `chat-message` - 채팅 메시지
- `drawing-data` - 그림 그리기 데이터
- `pinpoint-data` - 핀포인트 데이터

### Y.js WebSocket (포트: 5001)

Y.js 클라이언트에서 연결:

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const doc = new Y.Doc();
const provider = new WebsocketProvider(
  'ws://localhost:5001',
  'room-123',
  doc
);

provider.on('status', (event) => {
  console.log('연결 상태:', event.status);
});
```

## 🛠️ 기능

### 1. Socket.IO 서버
- 실시간 채팅
- WebRTC 시그널링
- 방 관리
- 사용자 상태 관리

### 2. Y.js WebSocket 서버
- CRDT 기반 실시간 동기화
- 문서 협업
- 그림 그리기 동기화

### 3. HWP 파일 파싱
- HWP 파일을 HTML로 변환
- 텍스트 추출
- 페이지 브레이크 정보 추출

### 4. 그레이스풀 셧다운
- SIGTERM/SIGINT 신호 처리
- 활성 연결 종료 대기
- 안전한 서버 종료

## 🔒 보안

### CORS 설정

기본적으로 `http://localhost:3000`만 허용됩니다. 프로덕션 환경에서는 `CLIENT_URL` 환경 변수를 설정하세요.

### 파일 업로드 제한

- 최대 파일 크기: 50MB
- 허용 파일 형식: HWP 파일만

## 📊 모니터링

### 헬스 체크

```bash
curl http://localhost:5000/health
```

**응답:**
```json
{
  "status": "healthy",
  "uptime": 1234.56,
  "connections": 5,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🐛 트러블슈팅

### 포트가 이미 사용 중입니다

```bash
# 포트 사용 중인 프로세스 확인
lsof -i :5000
# 또는
netstat -ano | findstr :5000

# 프로세스 종료 후 다시 실행
```

### WebSocket 연결 실패

1. 방화벽 설정 확인
2. 프록시 설정 확인
3. CORS 설정 확인

### HWP 파일 파싱 실패

1. 파일이 올바른 HWP 형식인지 확인
2. 파일 크기가 50MB 이하인지 확인
3. 서버 로그 확인

## 🔄 그레이스풀 셧다운

서버는 다음 신호를 받으면 그레이스풀하게 종료됩니다:

- `SIGTERM` - 일반적인 종료 신호
- `SIGINT` - Ctrl+C

종료 과정:
1. 새로운 연결 거부
2. 활성 연결 종료 대기 (최대 5초)
3. 모든 리소스 정리
4. 프로세스 종료

## 📝 라이선스

MIT License

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

