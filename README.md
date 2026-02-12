# flama-simple

이 레포는 `live-collaboration-tool`(라이브러리/서버)과 `test_reaact`(테스트 앱)로 구성된 모노레포입니다.

핵심 목표는 **로컬에서 빠르게 “서버+테스트앱”을 띄우고**, 필요한 기능(특히 **SketchUp(.skp) → GLB 변환/뷰어**)을 반복 개발하는 것입니다.

### 프로젝트 구조

- **`live-collaboration-tool/`**: 라이브러리(`client`) + 서버(`server`)
- **`test_reaact/`**: Vite 기반 테스트 앱(라이브러리를 소스 경로로 사용)

---

## 맥도날드 워크플로우 (개발 루프)

- **1) 환경 준비**: Redis + Assimp + (선택) SketchUp C SDK
- **2) 실행**: 루트에서 `pnpm run dev`
- **3) 확인**: 테스트 앱에서 업로드/변환/뷰어 렌더링 확인
- **4) 수정**: 변환기/서버/뷰어 코드 수정
- **5) 재시도**: 서버/앱 재시작 → 동일 파일로 재변환/검증

---

## 빠른 시작 (로컬 개발)

### 필수 의존성

- **Node/pnpm**: 레포 루트에서 `pnpm install`
- **Redis**
- **Assimp CLI** (`assimp` 커맨드가 PATH에 있어야 함)

macOS 기준 예시:

```bash
brew install redis assimp
brew services start redis
```

### 실행

```bash
pnpm install
pnpm run dev
```

- **Server**: `http://localhost:5002` (macOS에서 5000 충돌 케이스 대응)
- **Test app**: `http://localhost:5173`

---

## SketchUp(.skp) 변환 워크플로우 (SketchUp 앱 없이 / SDK headless)

현재 구현은 **A안(중간 포맷 → Assimp → GLB)** 입니다.

### 변환 파이프라인

- `.skp` 업로드
- **SketchUp C SDK headless CLI**로 `.obj + .mtl + 텍스처(png)` 생성
- **Assimp**로 `.glb` 생성
- 결과: `/api/sketchup/models/<fileId>/model.glb`

### 1) SketchUp C SDK 준비

SDK를 `live-collaboration-tool/SDK_Mac_2026-1-184/` 같은 경로에 둡니다.

> SDK는 라이선스/배포 제약이 있어, 레포에 “공식 바이너리”를 포함하는 방식이 아니라 **로컬에 다운로드 후 사용**하는 방식입니다.

### 2) 변환기 빌드 (macOS / clang++)

```bash
SDK="/path/to/SDK_Mac_2026-1-184"
cd live-collaboration-tool/tools/sketchup-csdk-converter

clang++ -std=c++17 -O2 -isysroot "$(xcrun --show-sdk-path)" \
  -I"$SDK/SketchUpAPI.framework/Headers" \
  -F"$SDK" \
  src/main.cpp -framework SketchUpAPI \
  -o build/sketchup-csdk-converter
```

### 3) (중요) macOS 시스템 정책(Gatekeeper) 대응

다운로드된 SDK 프레임워크가 `library load disallowed by system policy`로 차단될 수 있습니다.
이 경우 아래처럼 **ad-hoc codesign**을 적용합니다:

```bash
SDK="/path/to/SDK_Mac_2026-1-184"
codesign --force --deep --sign - "$SDK/SketchUpAPI.framework"
codesign --force --sign - live-collaboration-tool/tools/sketchup-csdk-converter/build/sketchup-csdk-converter
```

### 4) 서버 `.env` 설정 (붙여넣기 템플릿)

`live-collaboration-tool/server/.env`에 아래를 기준으로 설정합니다.

```env
SKETCHUP_ENABLED=true
SKETCHUP_OUTPUT_DIR=./uploads/converted
ASSIMP_PATH=assimp

SKETCHUP_CONVERTER=sdk
SKETCHUP_CSDK_BIN=/absolute/path/to/live-collaboration-tool/tools/sketchup-csdk-converter/build/sketchup-csdk-converter
SKETCHUP_CSDK_DYLD_FRAMEWORK_PATH=/absolute/path/to/SDK_Mac_2026-1-184
SKETCHUP_CSDK_FORMAT=obj
SKETCHUP_CSDK_ARGS_JSON='["{input}","{output}","{format}"]'

REDIS_URL=redis://localhost:6379
```

### 5) 동작 확인 포인트

서버 로그에 아래가 찍히면 SDK 경로로 변환 중입니다:

- `converter=sdk ext=.skp ...`

그리고 변환 성공 시:

- `GLB 검증: images=..., materials_with_texture=...`

---

## 트러블슈팅 (자주 발생)

### 텍스처가 일부 안 보임

- SketchUp 모델에서 **back material만 있는 면**이 있을 수 있습니다.
- exporter가 back texture/UV를 처리하지 않으면 누락될 수 있습니다.

### 벽/천장이 각도에 따라 사라짐

- 얇은 “단면” 모델에서 **backface culling** 이슈가 흔합니다.
- 뷰어에서 `DoubleSide` 강제로 완화할 수 있습니다.

### 처음 로드 시 위에서 바라봄

- SketchUp은 **Z-up**, Three.js는 **Y-up**입니다.
- 뷰어에서 Z-up → Y-up 회전을 적용해야 정면 프레이밍이 자연스럽습니다.

