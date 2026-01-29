# 스케치업 모듈

스케치업 파일(.skp) 업로드 및 GLB 변환 기능을 제공하는 독립 모듈입니다.

## 모듈화 설계

이 모듈은 **완전히 독립적**으로 설계되어 있어 쉽게 제거하거나 별도 패키지로 분리할 수 있습니다.

### 모듈 구조

```
sketchup/
├── index.ts              # 모듈 초기화 진입점
├── upload.ts             # 파일 업로드 및 상태 조회 API
├── conversion/
│   ├── queue.ts         # Bull 큐 설정
│   └── assimp-worker.ts # Assimp 변환 Worker
└── README.md            # 이 파일
```

### 모듈 비활성화 방법

#### 방법 1: 환경 변수 사용 (권장)

```bash
# .env 파일에 추가
SKETCHUP_ENABLED=false
```

#### 방법 2: 코드에서 제거

`server/src/index.ts`에서 다음 부분을 주석 처리:

```typescript
// 스케치업 모듈 초기화 (선택적)
// import { initializeSketchupModule } from "./sketchup/index.js";
// const sketchupModule = initializeSketchupModule(app, {...});
```

#### 방법 3: 전체 디렉토리 삭제

```bash
rm -rf server/src/sketchup
```

그리고 `index.ts`에서 import 제거

### 모듈 분리 방법

별도 패키지로 분리하려면:

1. `sketchup/` 디렉토리를 별도 프로젝트로 복사
2. `package.json` 생성
3. 의존성:
   - `bull`, `ioredis`, `uuid`, `gltf-pipeline`
   - `express`, `multer`
4. `index.ts`의 `initializeSketchupModule` 함수를 export

### 의존성

이 모듈이 사용하는 외부 의존성:
- **Bull**: 작업 큐 관리
- **ioredis**: Redis 연결
- **uuid**: 고유 ID 생성
- **gltf-pipeline**: GLB 최적화
- **multer**: 파일 업로드 처리

### 환경 변수

- `SKETCHUP_ENABLED`: 모듈 활성화 여부 (기본값: true)
- `SKETCHUP_OUTPUT_DIR`: 변환된 파일 저장 경로
- `SKETCHUP_MAX_FILE_SIZE`: 최대 파일 크기 (바이트)
- `ASSIMP_PATH`: Assimp 실행 파일 경로
- `SKETCHUP_APP_PATH`: (선택) SketchUp 실행 파일 경로 (Ruby 변환 사용 시)
- `SKETCHUP_STORE_URL`: (선택) 원격 저장 모드 - 변환된 GLB를 업로드할 “메인 서버” 주소 (예: `http://localhost:5002`)
- `SKETCHUP_INTERNAL_KEY`: (선택) 원격 저장 모드 - 메인 서버 내부 업로드 인증 키
- `REDIS_URL`: Redis 연결 URL

### API 엔드포인트

모듈이 활성화되면 다음 엔드포인트가 자동으로 등록됩니다:

- `POST /api/sketchup/upload` - 파일 업로드
- `GET /api/sketchup/conversion/:conversionId` - 변환 상태 조회
- `GET /api/sketchup/models/:filename` - 변환된 GLB 파일 제공

## 변환 방식 (중요)

### 왜 Assimp만으로는 .skp가 안 되나요?

Assimp는 `.skp`(SketchUp) **import를 지원하지 않습니다**.  
따라서 `.skp → .glb`를 하려면 중간 변환기가 필요합니다.

### 현재 구현된 “가장 빠른” 로컬 변환 파이프라인

- **`.skp` 업로드** → (변환 큐) → **SketchUp(Ruby)로 `.dae` export** → **Assimp로 `.dae → .glb` export** → `/api/sketchup/models/*.glb` 제공
- **`.glb` 업로드** → (저장 큐) → `/api/sketchup/models/*.glb` 제공

### SketchUp(Ruby) 변환 설정

- 로컬 머신(특히 macOS)에서 SketchUp이 설치되어 있어야 동작합니다.
- 기본 경로 후보: `/Applications/SketchUp 2024/SketchUp.app/Contents/MacOS/SketchUp`
- 다른 버전/경로라면 `.env`에 다음을 설정하세요:

```bash
SKETCHUP_APP_PATH="/Applications/SketchUp 2025/SketchUp.app/Contents/MacOS/SketchUp"
```

## 서버(Linux) 환경 권장 구성: “원격 변환 워커”

SketchUp은 보통 **Linux에 설치/실행이 어렵기 때문에**, 변환만 별도 머신에서 실행하는 방식을 권장합니다.

### 1) 메인 서버(리눅스) — API/서빙만

- 메인 서버는 `/api/sketchup/upload`, `/api/sketchup/conversion/*`, `/api/sketchup/models/*`만 운영합니다.
- 내부 업로드 엔드포인트가 추가되어 있습니다:
  - `PUT /api/sketchup/internal/models/:fileId`
  - 헤더: `x-sketchup-internal-key: <SKETCHUP_INTERNAL_KEY>`
  - 바디: `application/octet-stream` (GLB 바이너리)

### 2) 변환 워커(맥/윈도우 + SketchUp 설치) — 큐 작업만 처리

워커 머신은 Redis(큐)와 메인 서버에 접근 가능해야 합니다.

```bash
# 워커 머신 (.env 예시)
SKETCHUP_STORE_URL="http://<main-server-host>:5002"
SKETCHUP_INTERNAL_KEY="<같은키>"

# SketchUp 설치된 경로 (macOS 예시)
SKETCHUP_APP_PATH="/Applications/SketchUp 2025/SketchUp.app/Contents/MacOS/SketchUp"

# 큐(레디스) 접속
REDIS_HOST="<redis-host>"
REDIS_PORT="6379"

# 실행
pnpm --filter @live-collaboration-tool/server run dev:worker
```

### Worker 초기화

Worker는 `assimp-worker.ts`를 import하는 순간 자동으로 초기화됩니다.
비활성화하려면 `index.ts`에서 해당 import를 주석 처리하세요.
