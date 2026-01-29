# 스케치업 뷰어 모듈 개발 진행 상황

## 📊 전체 진행률

- [x] 1단계: 서버 측 변환 파이프라인 (100%)
- [x] 2단계: 클라이언트 기본 구조 (100%)
- [x] 3단계: 3D 뷰어 구현 (100%)
- [ ] 4단계: 피드백 시스템 (0%)
- [ ] 5단계: 협업 통합 (0%)
- [ ] 6단계: 통합 및 테스트 (0%)

---

## ✅ 완료된 작업

### 1단계: 서버 측 변환 파이프라인 (완료)

#### 1.1 Bull 큐 설정 ✅
**파일**: `server/src/sketchup/conversion/queue.ts`

**기능**:
- Redis 기반 작업 큐 설정
- 변환 작업의 비동기 처리
- 작업 상태 추적 (pending, processing, completed, failed)
- 자동 재시도 (최대 3회, 지수 백오프)

**주요 코드**:
- `conversionQueue`: Bull 큐 인스턴스
- `ConversionJobData`: 작업 데이터 타입 정의
- 이벤트 리스너: completed, failed, progress

---

#### 1.2 변환 Worker ✅
**파일**: `server/src/sketchup/conversion/assimp-worker.ts`

**기능**:
- .skp 파일을 .glb로 변환 (로컬 최적 경로)
- SketchUp(Ruby) + Assimp CLI를 통한 변환
- Draco 압축을 통한 GLB 파일 최적화
- 변환 진행률 추적 (10% → 30% → 70% → 100%)
- 에러 처리 및 임시 파일 정리

**주요 처리 과정**:
1. 입력 파일 검증
2. (skp) SketchUp(Ruby)로 .skp → .dae export
3. Assimp로 .dae → .glb 변환
4. gltf-pipeline으로 Draco 압축
5. 변환된 파일 저장
6. 임시 파일 정리

**설정**:
- `ASSIMP_PATH`: Assimp 실행 파일 경로
- `OUTPUT_DIR`: 변환된 파일 저장 경로
- 동시 처리 수: 4개 (Assimp는 가벼워서 가능)

**추가 설정(로컬 변환)**:
- `SKETCHUP_APP_PATH`: SketchUp 실행 파일 경로 (Ruby 변환 사용 시)

---

#### 1.3 파일 업로드 API ✅
**파일**: `server/src/sketchup/upload.ts`

**기능**:
- .skp/.glb 파일 업로드 처리
- Multer를 통한 파일 수신 (최대 100MB)
- (skp) 변환 작업 큐에 등록
- (glb) 저장 작업 큐에 등록 (개발/테스트용)
- 변환 상태 조회 API

**API 엔드포인트**:
- `POST /api/sketchup/upload`: 파일 업로드
  - 요청: multipart/form-data (file)
  - 응답: `{ fileId, conversionId, status, message }`

- `GET /api/sketchup/conversion/:conversionId`: 변환 상태 조회
  - 응답: `{ conversionId, status, progress?, glbUrl?, error? }`

**주요 처리**:
1. 파일을 임시 저장소에 저장
2. UUID로 고유 ID 생성 (fileId, conversionId)
3. Bull 큐에 변환 작업 추가
4. jobId를 conversionId로 설정하여 나중에 조회 가능

---

#### 1.4 모듈 초기화 시스템 ✅
**파일**: `server/src/sketchup/index.ts`

**기능**:
- 스케치업 모듈의 단일 진입점
- 선택적 활성화/비활성화
- Express 앱에 라우트 자동 등록
- Worker 지연 초기화

**주요 함수**:
- `initializeSketchupModule(app, config)`: 모듈 초기화
- `isSketchupModuleEnabled()`: 모듈 활성화 여부 확인

**모듈화 특징**:
- ✅ 환경 변수로 비활성화 가능 (`SKETCHUP_ENABLED=false`)
- ✅ 코드에서 한 줄만 주석 처리하면 제거 가능
- ✅ 완전히 독립적인 구조
- ✅ Worker는 모듈 활성화 시에만 초기화

**설정 옵션**:
```typescript
{
  enabled?: boolean;        // 모듈 활성화 여부
  outputDir?: string;       // 변환 파일 저장 경로
  maxFileSize?: number;     // 최대 파일 크기 (바이트)
}
```

---

#### 1.5 서버 통합 ✅
**파일**: `server/src/index.ts`

**변경 사항**:
- 스케치업 모듈 초기화 코드 추가
- 정적 파일 서빙 추가 (`/api/sketchup/models`)
- 기능 목록에 SketchUp Converter 추가 (조건부)

**통합 방식**:
```typescript
import { initializeSketchupModule } from "./sketchup/index.js";
const sketchupModule = initializeSketchupModule(app, {
  enabled: process.env.SKETCHUP_ENABLED !== 'false',
  outputDir: process.env.SKETCHUP_OUTPUT_DIR,
  maxFileSize: parseInt(process.env.SKETCHUP_MAX_FILE_SIZE || '104857600', 10),
});
```

---

#### 1.6 패키지 의존성 추가 ✅
**파일**: `server/package.json`

**추가된 의존성**:
- `bull`: ^4.12.0 - 작업 큐 관리
- `ioredis`: ^5.3.2 - Redis 클라이언트
- `uuid`: ^9.0.1 - 고유 ID 생성
- `gltf-pipeline`: ^3.1.0 - GLB 파일 최적화
- `@types/uuid`: ^9.0.7 - TypeScript 타입 정의

---

## 🔄 현재 작업 중

없음 (다음 단계 대기 중)

#### 2.1 타입 정의 및 디렉토리 생성 ✅
**파일**: `client/src/lib/sketchup/types.ts`

**기능**:
- Vector3D, CameraState, SketchupPinpoint 타입 정의
- SketchupModel, SketchupUploadResponse, ConversionStatusResponse 타입 정의
- SketchupViewerConfig, SketchupFeedbackConfig 타입 정의

**주요 타입**:
- `Vector3D`: 3D 공간 좌표 (x, y, z)
- `CameraState`: 카메라 위치, 타겟, 업 벡터 등
- `SketchupPinpoint`: 3D 피드백 정보 (위치, 법선, 댓글, 카메라 상태)
- `SketchupModel`: 모델 정보 (URL, 변환 상태 등)

**기존 타입 확장**:
- `types.ts`에 `Pinpoint2D`, `Pinpoint3D` 타입 추가
- `Pinpoint` 타입을 `Pinpoint2D | Pinpoint3D`로 확장
- 기존 `Pinpoint`는 호환성을 위해 유지 (deprecated)

---

#### 2.2 SketchupUploader 구현 ✅
**파일**: `client/src/lib/sketchup/SketchupUploader.ts`

**기능**:
- .skp 파일 업로드
- 변환 상태 조회 (폴링)
- 진행률 콜백 지원
- 타임아웃 처리
- 에러 처리

**주요 메서드**:
- `uploadFile(file: File)`: 파일 업로드 및 변환 작업 등록
- `getConversionStatus(conversionId)`: 변환 상태 조회
- `waitForConversion(conversionId, onProgress, timeout)`: 완료까지 대기 (폴링)
- `setPollingInterval(interval)`: 폴링 간격 설정
- `setServerUrl(serverUrl)`: 서버 URL 변경

**특징**:
- 파일 확장자 검증 (.skp만 허용)
- 자동 폴링 (기본 2초 간격)
- 타임아웃 지원 (기본 5분)
- 진행률 콜백으로 UI 업데이트 가능

---

#### 2.3 라이브러리 Export 추가 ✅
**파일**: `client/src/lib/index.ts`

**추가된 Export**:
- `SketchupUploader`: 파일 업로드 클래스
- `sketchup/types`: 모든 스케치업 관련 타입

**사용 예시**:
```typescript
import { SketchupUploader, SketchupPinpoint } from '@live-collaboration-tool/client';
```

---

## 📋 다음 단계

### 2단계: 클라이언트 기본 구조

#### 2.1 타입 정의 및 디렉토리 생성
**예상 파일**:
- `client/src/lib/sketchup/types.ts`
- `client/src/lib/sketchup/` 디렉토리 구조

**작업 내용**:
- Vector3D, CameraState, SketchupPinpoint 타입 정의
- SketchupModel, SketchupUploadResponse 타입 정의
- 기존 Pinpoint 타입 확장 (2D/3D 통합)

---

#### 2.2 SketchupUploader 구현
**예상 파일**: `client/src/lib/sketchup/SketchupUploader.ts`

**기능**:
- .skp 파일 업로드
- 변환 상태 폴링
- 진행률 콜백
- 에러 처리

**주요 메서드**:
- `uploadFile(file: File)`: 파일 업로드
- `getConversionStatus(conversionId)`: 상태 조회
- `waitForConversion(conversionId, onProgress)`: 완료까지 대기

---

### 3단계: 3D 뷰어 구현 (완료 ✅)

#### 3.1 SketchupViewer 컴포넌트 ✅
**파일**: `client/src/lib/components/SketchupViewer.tsx`

**기능**:
- ✅ react-three-fiber 기반 3D 뷰어
- ✅ useGLTF로 GLB 모델 로드
- ✅ OrbitControls로 카메라 제어
- ✅ 카메라 상태 추적 및 복원
- ✅ Raycasting을 통한 모델 클릭 처리
- ✅ Normal 벡터 계산
- ✅ 에러 처리 및 로딩 상태 관리

**주요 컴포넌트**:
- `SketchupViewer`: 메인 뷰어 컴포넌트
- `Model`: GLB 모델 로드 컴포넌트
- `InteractiveModel`: Raycasting 및 클릭 처리
- `CameraTracker`: 카메라 상태 추적 및 복원

**Props**:
- `glbUrl`: 변환된 GLB 파일 URL
- `onCameraChange`: 카메라 상태 변경 콜백
- `onModelClick`: 모델 클릭 이벤트 (3D 좌표 및 Normal 벡터)
- `width`, `height`: 뷰어 크기
- `backgroundColor`: 배경색
- `enableGrid`, `enableAxes`: 그리드/축 표시 여부
- `initialCamera`: 카메라 초기 위치
- `cameraState`: 카메라 상태 복원 (외부에서 설정)
- `loadingComponent`, `errorComponent`: 커스텀 로딩/에러 컴포넌트

**사용 예시**:
```typescript
import { SketchupViewer } from '@live-collaboration-tool/client';

<SketchupViewer
  glbUrl="/path/to/model.glb"
  onModelClick={(position, normal) => {
    console.log('클릭 위치:', position);
    console.log('법선 벡터:', normal);
  }}
  onCameraChange={(state) => {
    console.log('카메라 상태:', state);
  }}
  width={800}
  height={600}
/>
```

**패키지 추가**:
- `@react-three/fiber`: ^8.15.0
- `@react-three/drei`: ^9.88.0
- `three`: ^0.160.0
- `@types/three`: ^0.160.0

---

#### 3.2 Raycasting 구현 ✅
**구현 위치**: `InteractiveModel` 컴포넌트 내부

**기능**:
- ✅ 마우스 클릭 위치를 3D 좌표로 변환
- ✅ Normal 벡터 계산 (월드 좌표계 변환 포함)
- ✅ 모델과의 교차점 검사
- ✅ Canvas 클릭 이벤트 처리

**처리 과정**:
1. Canvas 클릭 이벤트 감지
2. 마우스 좌표를 정규화 (-1 ~ 1)
3. Raycaster를 사용하여 카메라에서 레이 발사
4. 모델과의 교차점 검사
5. 교차점의 3D 좌표 및 Normal 벡터 계산
6. `onModelClick` 콜백 호출

---

### 4단계: 피드백 시스템

#### 4.1 피드백 입력 폼
**기능**:
- 3D 좌표 기반 피드백 생성
- 카메라 상태 저장
- 텍스트 입력

---

#### 4.2 피드백 마커 렌더링
**기능**:
- Html 오버레이로 마커 표시
- 3D 공간 좌표에 마커 배치
- 마커 클릭 이벤트

---

### 5단계: 협업 통합

#### 5.1 SketchupFeedbackManager
**기능**:
- 피드백 관리
- Y.js 동기화
- CollaborationManager 연동

---

#### 5.2 카메라 상태 복원
**기능**:
- 피드백 생성 시점의 카메라 상태 저장
- 마커 클릭 시 카메라 상태 복원

---

## 🛠️ 필요한 설정

### 서버 측

1. **패키지 설치**:
```bash
cd live-collaboration-tool/server
npm install
```

2. **Redis 설치 및 실행**:
```bash
# macOS
brew install redis
brew services start redis

# 또는 Docker
docker run -d -p 6379:6379 redis:latest
```

3. **Assimp 설치**:
```bash
# macOS
brew install assimp

# Ubuntu/Debian
sudo apt-get install assimp-utils
```

4. **환경 변수 설정** (`.env`):
```bash
REDIS_URL=redis://localhost:6379
ASSIMP_PATH=/usr/bin/assimp
SKETCHUP_OUTPUT_DIR=./uploads/converted
SKETCHUP_ENABLED=true
SKETCHUP_MAX_FILE_SIZE=104857600  # 100MB
```

### 클라이언트 측

1. **패키지 설치** ✅ (3단계 완료):
```bash
cd live-collaboration-tool/client
npm install @react-three/fiber @react-three/drei three
npm install --save-dev @types/three
```

2. **타입 정의 완료** ✅
   - `lib/sketchup/types.ts` 생성 완료
   - 기존 `types.ts`에 Pinpoint 확장 완료

3. **SketchupUploader 완료** ✅
   - 파일 업로드 기능 구현 완료
   - 변환 상태 폴링 기능 구현 완료

4. **SketchupViewer 컴포넌트 완료** ✅
   - react-three-fiber 기반 3D 뷰어 구현
   - GLB 모델 로딩 및 렌더링
   - OrbitControls 통합
   - Raycasting 및 클릭 처리
   - 카메라 상태 추적 및 복원

---

## 📝 참고 사항

### 모듈 제거 방법

스케치업 모듈을 사용하지 않으려면:

1. **환경 변수** (가장 쉬움):
   ```bash
   SKETCHUP_ENABLED=false
   ```

2. **코드에서 제거**:
   `server/src/index.ts`에서 다음 3줄 주석 처리:
   ```typescript
   // import { initializeSketchupModule } from "./sketchup/index.js";
   // const sketchupModule = initializeSketchupModule(app, {...});
   ```

3. **디렉토리 삭제**:
   ```bash
   rm -rf server/src/sketchup
   ```

### 모듈 구조

```
server/src/sketchup/
├── index.ts              # 모듈 초기화 진입점
├── upload.ts             # 파일 업로드 및 상태 조회 API
├── conversion/
│   ├── queue.ts         # Bull 큐 설정
│   └── assimp-worker.ts # Assimp 변환 Worker
└── README.md            # 모듈 문서
```

---

## 🎯 다음 작업

**4단계: 피드백 시스템** 시작 예정

1. 피드백 입력 폼 컴포넌트 구현
2. 피드백 마커 렌더링 (Html 오버레이)
3. 피드백 데이터 저장 및 조회 API
4. 피드백 클릭 시 카메라 상태 복원

---

## 📚 관련 문서

- [전체 설계안](./sketchup-viewer-design.md)
- [모듈 README](../server/src/sketchup/README.md)
- [테스트 가이드](./sketchup-testing.md) 🆕

---

**마지막 업데이트**: 2024년 (3단계 완료)
