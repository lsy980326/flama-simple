# flama-simple

이 레포는 `live-collaboration-tool`(라이브러리/서버)과 `test_reaact`(테스트 앱)로 구성된 모노레포입니다.

핵심 목표는 **로컬에서 빠르게 "서버+테스트앱"을 띄우고**, 필요한 기능(특히 **SketchUp(.skp) → GLB 변환/뷰어**)을 반복 개발하는 것입니다.

### 프로젝트 구조

- **`live-collaboration-tool/`**: 라이브러리(`client`) + 서버(`server`)
- **`test_reaact/`**: Vite 기반 테스트 앱(라이브러리를 소스 경로로 사용)

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

## SketchUp(.skp) 변환 (SketchUp 앱 없이 / headless)

변환 경로: **SketchUp C SDK CLI** → `.obj` + 텍스처 → **Assimp** → `.glb`

### 파이프라인

- `.skp` 업로드 → C SDK CLI로 `.obj` + `.mtl` + 텍스처 생성 → Assimp로 `.glb` 생성  
- 결과: `/api/sketchup/models/<fileId>/model.glb`

### 1) 변환기 빌드 (macOS)

`SketchUpAPI.framework`는 프로젝트에 번들되어 있어 별도 SDK 폴더 없이 빌드할 수 있습니다. **cmake**가 필요합니다.

```bash
cd live-collaboration-tool/tools/sketchup-csdk-converter
rm -rf build && mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .
```

빌드 후 `build/sketchup-csdk-converter` 실행 파일이 생성됩니다.  
macOS에서 `library load disallowed by system policy`가 나오면, 번들된 프레임워크와 바이너리에 ad-hoc 서명을 적용합니다:

```bash
codesign --force --deep --sign - ../frameworks/SketchUpAPI.framework
codesign --force --sign - sketchup-csdk-converter
```

### 2) 서버 `.env` 설정

`live-collaboration-tool/server/.env`를 `env.example`을 복사해 만든 뒤, 아래만 실제 환경에 맞게 넣습니다.

- **SKETCHUP_CSDK_BIN**: 빌드된 변환기 **절대 경로** (예: `/Users/you/project/live-collaboration-tool/tools/sketchup-csdk-converter/build/sketchup-csdk-converter`)
- **SKETCHUP_CONVERTER=sdk**, **ASSIMP_PATH=assimp**, **REDIS_URL=redis://localhost:6379** 등은 예시대로 두면 됩니다.

`DYLD_FRAMEWORK_PATH`는 사용하지 않습니다 (바이너리에 rpath가 들어 있음).

### 3) 동작 확인

서버 로그에서 `converter=sdk ext=.skp ...`가 보이면 변환기가 호출된 것이고, 성공 시 `GLB 검증: images=..., materials_with_texture=...`가 출력됩니다.

---

## 트러블슈팅 (자주 발생)

### 텍스처가 일부 안 보임

- SketchUp 모델에서 **back material만 있는 면**이 있을 수 있습니다.
- exporter가 back texture/UV를 처리하지 않으면 누락될 수 있습니다.

### 벽/천장이 각도에 따라 사라짐

- 얇은 "단면" 모델에서 **backface culling** 이슈가 흔합니다.
- 뷰어에서 `DoubleSide` 강제로 완화할 수 있습니다.

### 처음 로드 시 위에서 바라봄

- SketchUp은 **Z-up**, Three.js는 **Y-up**입니다.
- 뷰어에서 Z-up → Y-up 회전을 적용해야 정면 프레이밍이 자연스럽습니다.
