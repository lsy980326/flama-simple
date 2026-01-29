# 스케치업 모듈 테스트 가이드

## 현재 테스트 가능한 항목

### ✅ 테스트 가능

1. **서버 API 엔드포인트**
   - 파일 업로드 API
   - 변환 상태 조회 API
   - 서버 헬스 체크

2. **SketchupUploader 클래스**
   - 파일 업로드 메서드
   - 상태 조회 메서드
   - 폴링 로직

### ❌ 아직 테스트 불가능

1. **실제 파일 변환**
   - Assimp 설치 필요
   - Redis 실행 필요
   - 실제 .skp 파일 필요

2. **3D 뷰어**
   - react-three-fiber 미구현
   - GLB 모델 렌더링 불가

3. **피드백 시스템**
   - Raycasting 미구현
   - 피드백 UI 미구현

---

## 🧪 테스트 방법

### 1. 서버 시작 확인

#### 1.1 기본 설정 확인

```bash
cd live-collaboration-tool/server

# 패키지 설치 (아직 안 했다면)
npm install

# 서버 실행
npm run dev
```

**예상 출력**:
```
🚀 서버가 포트 5000에서 실행 중입니다.
📡 Socket.IO 서버 준비 완료
🔗 Y.js WebSocket 서버가 포트 5001에서 실행 중입니다.
💚 헬스 체크: http://localhost:5000/health
📦 스케치업 모듈 초기화 중...
✅ 스케치업 모듈 초기화 완료
```

#### 1.2 서버 정보 확인

```bash
curl http://localhost:5000/
```

**예상 응답**:
```json
{
  "message": "Live Collaboration Tool Server",
  "version": "0.1.0",
  "status": "running",
  "features": [
    "Socket.IO",
    "Y.js WebSocket",
    "WebRTC Signaling",
    "HWP Parser",
    "SketchUp Converter"
  ]
}
```

#### 1.3 헬스 체크

```bash
curl http://localhost:5000/health
```

**예상 응답**:
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "connections": 0,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 2. 스케치업 API 테스트

#### 2.1 파일 업로드 API 테스트

**주의**: 실제 변환을 위해서는 Redis와 Assimp가 필요합니다.

```bash
# .skp 파일 업로드
curl -X POST http://localhost:5000/api/sketchup/upload \
  -F "file=@test.skp"
```

**예상 응답** (성공 시):
```json
{
  "fileId": "uuid-here",
  "conversionId": "uuid-here",
  "status": "pending",
  "message": "파일 업로드 완료. 변환 작업이 큐에 등록되었습니다."
}
```

**예상 응답** (실패 시 - Redis 없음):
```json
{
  "error": "파일 업로드 실패",
  "message": "Redis 연결 오류..."
}
```

#### 2.2 변환 상태 조회 API 테스트

```bash
# conversionId는 업로드 응답에서 받은 값
curl http://localhost:5000/api/sketchup/conversion/{conversionId}
```

**예상 응답** (pending):
```json
{
  "conversionId": "uuid-here",
  "status": "pending",
  "progress": 0
}
```

**예상 응답** (processing):
```json
{
  "conversionId": "uuid-here",
  "status": "processing",
  "progress": 50
}
```

**예상 응답** (completed):
```json
{
  "conversionId": "uuid-here",
  "status": "completed",
  "progress": 100,
  "glbUrl": "/api/sketchup/models/uuid-here.glb"
}
```

---

### 3. 클라이언트 코드 테스트

#### 3.1 SketchupUploader 단위 테스트

**테스트 파일 생성**: `client/src/lib/sketchup/__tests__/SketchupUploader.test.ts`

```typescript
import { SketchupUploader } from '../SketchupUploader';

describe('SketchupUploader', () => {
  const uploader = new SketchupUploader('http://localhost:5000');

  test('서버 URL 설정', () => {
    uploader.setServerUrl('http://localhost:5000');
    // 정상 동작 확인
  });

  test('폴링 간격 설정', () => {
    uploader.setPollingInterval(1000);
    // 정상 동작 확인
  });

  // 실제 파일 업로드는 통합 테스트에서
});
```

#### 3.2 간단한 통합 테스트 (Node.js 환경)

```typescript
// test-uploader.js
import { SketchupUploader } from './lib/sketchup/SketchupUploader.js';
import fs from 'fs';

async function test() {
  const uploader = new SketchupUploader('http://localhost:5000');
  
  // 파일 읽기 (실제 .skp 파일 필요)
  const fileBuffer = fs.readFileSync('test.skp');
  const file = new File([fileBuffer], 'test.skp', { type: 'application/octet-stream' });
  
  try {
    // 업로드
    const { conversionId } = await uploader.uploadFile(file);
    console.log('업로드 성공:', conversionId);
    
    // 상태 조회
    const status = await uploader.getConversionStatus(conversionId);
    console.log('상태:', status);
    
    // 완료까지 대기
    const glbUrl = await uploader.waitForConversion(
      conversionId,
      (progress) => console.log('진행률:', progress + '%')
    );
    console.log('변환 완료:', glbUrl);
  } catch (error) {
    console.error('에러:', error);
  }
}

test();
```

---

### 4. 실제 변환 테스트 (전체 플로우)

#### 4.1 사전 요구사항

1. **Redis 실행**:
```bash
# macOS
brew services start redis

# 또는 Docker
docker run -d -p 6379:6379 redis:latest

# 확인
redis-cli ping  # 응답: PONG
```

2. **Assimp 설치**:
```bash
# macOS
brew install assimp

# 확인
assimp version
```

3. **환경 변수 설정** (`.env`):
```bash
REDIS_URL=redis://localhost:6379
ASSIMP_PATH=/usr/bin/assimp  # 또는 which assimp로 경로 확인
SKETCHUP_OUTPUT_DIR=./uploads/converted
SKETCHUP_ENABLED=true
```

#### 4.2 전체 플로우 테스트

```bash
# 1. 서버 실행
cd live-collaboration-tool/server
npm run dev

# 2. 다른 터미널에서 파일 업로드
curl -X POST http://localhost:5000/api/sketchup/upload \
  -F "file=@test.skp" \
  | jq

# 3. conversionId 복사 후 상태 조회
curl http://localhost:5000/api/sketchup/conversion/{conversionId} | jq

# 4. 완료되면 GLB 파일 다운로드
curl http://localhost:5000/api/sketchup/models/{filename}.glb -o output.glb
```

---

### 5. 브라우저에서 테스트 (간단한 HTML)

**테스트 파일**: `test-upload.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>스케치업 업로드 테스트</title>
</head>
<body>
  <h1>스케치업 파일 업로드 테스트</h1>
  <input type="file" id="fileInput" accept=".skp" />
  <button onclick="uploadFile()">업로드</button>
  <div id="status"></div>
  <div id="progress"></div>

  <script type="module">
    // SketchupUploader import (빌드된 라이브러리 사용)
    // 또는 직접 구현
    class SimpleUploader {
      constructor(serverUrl) {
        this.serverUrl = serverUrl;
      }

      async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.serverUrl}/api/sketchup/upload`, {
          method: 'POST',
          body: formData,
        });

        return response.json();
      }

      async getStatus(conversionId) {
        const response = await fetch(
          `${this.serverUrl}/api/sketchup/conversion/${conversionId}`
        );
        return response.json();
      }
    }

    const uploader = new SimpleUploader('http://localhost:5000');

    window.uploadFile = async () => {
      const fileInput = document.getElementById('fileInput');
      const file = fileInput.files[0];
      
      if (!file) {
        alert('파일을 선택하세요');
        return;
      }

      const statusDiv = document.getElementById('status');
      const progressDiv = document.getElementById('progress');

      try {
        statusDiv.textContent = '업로드 중...';
        const { conversionId } = await uploader.uploadFile(file);
        statusDiv.textContent = `업로드 완료! Conversion ID: ${conversionId}`;

        // 상태 폴링
        const poll = async () => {
          const status = await uploader.getStatus(conversionId);
          progressDiv.textContent = `상태: ${status.status}, 진행률: ${status.progress || 0}%`;

          if (status.status === 'completed') {
            statusDiv.textContent = `변환 완료! GLB URL: ${status.glbUrl}`;
          } else if (status.status === 'failed') {
            statusDiv.textContent = `변환 실패: ${status.error}`;
          } else {
            setTimeout(poll, 2000);
          }
        };

        poll();
      } catch (error) {
        statusDiv.textContent = `에러: ${error.message}`;
      }
    };
  </script>
</body>
</html>
```

---

## 🐛 예상되는 문제

### 1. Redis 연결 실패

**증상**: 업로드 시 Redis 연결 오류

**해결**:
```bash
# Redis 실행 확인
redis-cli ping

# 실행 안 되어 있으면
brew services start redis
# 또는
docker run -d -p 6379:6379 redis:latest
```

### 2. Assimp 명령어를 찾을 수 없음

**증상**: 변환 시 "assimp: command not found"

**해결**:
```bash
# Assimp 설치 확인
which assimp

# 설치 안 되어 있으면
brew install assimp

# 환경 변수 설정
export ASSIMP_PATH=$(which assimp)
```

### 3. 변환 실패

**증상**: .skp 파일을 .glb로 변환 실패

**원인**:
- Assimp가 .skp를 직접 지원하지 않을 수 있음
- 파일이 손상되었거나 호환되지 않는 버전

**해결**:
- 중간 포맷(.dae, .fbx)으로 먼저 변환 후 GLB로 변환
- 또는 SketchUp SDK 사용 고려

---

## 📝 테스트 체크리스트

### 기본 테스트
- [ ] 서버가 정상적으로 시작되는가?
- [ ] `/` 엔드포인트에서 SketchUp Converter가 features에 포함되는가?
- [ ] `/health` 엔드포인트가 정상 응답하는가?

### API 테스트 (Redis 없이)
- [ ] 파일 업로드 API가 에러를 적절히 반환하는가?
- [ ] 잘못된 파일 형식 업로드 시 에러가 발생하는가?

### API 테스트 (Redis 있음)
- [ ] 파일 업로드가 성공하는가?
- [ ] conversionId가 반환되는가?
- [ ] 상태 조회가 정상 동작하는가?

### 변환 테스트 (Assimp 있음)
- [ ] .skp 파일이 큐에 등록되는가?
- [ ] Worker가 작업을 처리하는가?
- [ ] 변환 상태가 업데이트되는가?
- [ ] GLB 파일이 생성되는가?

### 클라이언트 테스트
- [ ] SketchupUploader 클래스가 인스턴스화되는가?
- [ ] uploadFile 메서드가 정상 동작하는가?
- [ ] getConversionStatus 메서드가 정상 동작하는가?
- [ ] waitForConversion 폴링이 정상 동작하는가?

---

## 🎯 다음 단계

실제 변환을 테스트하려면:
1. Redis 설치 및 실행
2. Assimp 설치
3. 실제 .skp 파일 준비
4. 서버 실행 및 파일 업로드

3D 뷰어를 테스트하려면:
1. 3단계 작업 완료 (react-three-fiber 구현)
2. 변환된 GLB 파일 로드
3. 브라우저에서 렌더링 확인
