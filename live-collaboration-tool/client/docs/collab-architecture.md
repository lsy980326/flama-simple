# Live Collaboration Tool - 아키텍처 개요

## 1. 전체 흐름

- `App.tsx`가 UI를 구성하고 `RealTimeDrawingManager`를 생성해 모든 실시간 기능을 제어합니다.
- `RealTimeDrawingManager`는 하위 모듈을 묶는 파사드로서 다음 요소들을 orchestrate 합니다.
  - Y.js를 이용한 상태 동기화 (`YjsDrawingManager`)
  - WebRTC 데이터 채널을 통한 P2P 전파 (`WebRTCDataChannelManager`)
  - 접속자 상태 관리 (`AwarenessManager`)
  - 캔버스 렌더링 및 로컬 인터랙션 (`CanvasManager`)
- 각 사용자의 브라우저에서 발생한 그리기/이미지 변환 이벤트는 Y.js 맵에 반영되고, 변경 사항이 다른 클라이언트로 전달되어 동일한 결과가 재현됩니다.

## 2. 주요 모듈 역할

### 2.1 CanvasManager (lib/canvas/CanvasManager.ts)

- PIXI를 사용해 로컬 캔버스를 초기화하고 브러시, 원격 커서, 배경 이미지를 렌더링합니다.
- Transform 모드를 지원하여 배경 이미지를 드래그하거나 코너 핸들로 스케일을 조절할 수 있습니다.
- 이미지 불러오기 시 파일을 Data URL로 읽고, 이미지 상태(위치/배율/데이터)를 조회·갱신·콜백으로 노출합니다.

### 2.2 YjsDrawingManager (lib/collaboration/YjsDrawingManager.ts)

- Y.js 문서 내 `drawings` 맵과 `backgroundState` 맵을 사용해 그리기 기록과 배경 이미지 상태를 공유 저장소로 관리합니다.
- WebSocket 서버 및 IndexedDB를 통해 실시간/오프라인 동기화를 처리합니다.
- 외부 콜백을 통해 그리기 연산 업데이트, 접속자 Awareness, 배경 이미지 상태 변경을 알립니다.

### 2.3 RealTimeDrawingManager (lib/collaboration/RealTimeDrawingManager.ts)

- 위 두 매니저와 WebRTC/Awareness를 묶어 단일 API로 제공합니다.
- 캔버스 배경 상태 변화를 감지하여 Y.js 맵에 주기적으로 반영하고, 원격에서 들어온 배경 상태를 다시 CanvasManager에 적용합니다.
- Transform 모드 제어, 배경 이미지 업로드/삭제, 브러시 설정 등의 고수준 메서드를 제공합니다.

### 2.4 App.tsx

- React 상태(UI)와 `RealTimeDrawingManager`를 연결합니다.
- Alt+T 단축키로 Transform 모드를 토글하고, Ctrl 키를 누르고 있는 동안 임시로 Transform 모드를 활성화합니다.
- 이미지 업로드/제거, 배율 슬라이더, 초기화 등 도구 패널을 제공합니다.

## 3. 협업 데이터 흐름

1. 사용자 A가 이미지를 업로드하면 `CanvasManager.loadImageFromFile`이 Data URL을 생성하여 로컬에 배경을 표시합니다.
2. `RealTimeDrawingManager`가 배경 상태를 Y.js `backgroundState` 맵에 기록합니다.
3. 사용자 B의 클라이언트는 `YjsDrawingManager` 관찰자를 통해 동일한 Data URL/위치/배율 정보를 받아 `CanvasManager`로 적용합니다.
4. Transform 모드에서 이동/스케일 변경 시 상태가 다시 브로드캐스트되어 모든 브라우저가 같은 배경을 유지합니다.
5. 그리기 데이터는 기존처럼 Y.js `drawings` 맵과 WebRTC 데이터 채널을 통해 빠르게 공유됩니다.

## 4. 사용 라이브러리 및 역할

- **React / TypeScript**: UI와 상태 관리, 정적 타입 체킹.
- **PIXI.js**: WebGL 기반 2D 렌더링 엔진, 캔버스와 Transform 오버레이 구현.
- **Y.js**: CRDT 기반 동기화 엔진. 브라우저 간 드로잉/배경 상태를 병합·전파.
- **y-websocket**: Y.js 업데이트를 중계하는 WebSocket 프로토콜 클라이언트.
- **y-indexeddb**: 오프라인/재접속 시 데이터 유지용 IndexedDB 퍼시스턴스 레이어.
- **WebRTC API**: `RTCPeerConnection`/DataChannel로 P2P 데이터 전송 지연을 줄임.
- **React Hooks** 등 표준 라이브러리: 핸들러 등록, 단축키, UI 상태 동기화.

### 서버 구성 요소

- **Y.js WebSocket 서버 (`ws://localhost:5001`)**

  - `y-websocket` 프로토콜을 구현하는 Node 기반 서버.
  - 클라이언트 간 문서 업데이트/awareness 메시지를 브로드캐스트하고 room을 관리.
  - 지속 저장 없이 미들맨 역할을 하며, IndexedDB와 조합해 오프라인 복구 지원.

- **(선택) WebRTC 시그널링 서버**
  - 프로젝트에는 기본 예제가 포함되어 있지 않지만, 실제 배포 시 피어 간 Offer/Answer/ICE 교환을 위한 시그널링 서버가 필요합니다.
  - 현재 샘플에서는 Y.js WebSocket 채널을 활용하거나 개발자가 별도 서버로 확장할 수 있도록 여지를 남겨두었습니다.

## 5. 라이브러리화 구조

- `client/src/lib/index.ts`가 모듈을 재export하여 외부 프로젝트에서 `import { RealTimeDrawingManager } from "./lib";` 형태로 사용할 수 있습니다.
- 각 매니저는 독립적인 책임을 가지고 있으며, `RealTimeDrawingManager`는 이들을 캡슐화한 Facade로 애플리케이션이 단일 진입점을 사용하도록 돕습니다.
- React 전용 코드(`App.tsx`, `LiveCollabCanvas.tsx`)와 라이브러리 코드(`lib/…`)를 분리해, 다른 프레임워크/환경에서도 라이브러리 부분만 재사용할 수 있게 구조화되어 있습니다.

## 6. 커스텀 UI 구성 가이드

`LiveCollabCanvas`는 빠르게 사용할 수 있는 기본 툴바를 제공하지만, 외부에서 완전히 새로운 UI를 붙이는 것도 간단합니다.

### 6.1 최소 설정

```tsx
<LiveCollabCanvas
  serverUrl="ws://localhost:5001"
  roomId="my-room"
  user={currentUser}
  width={900}
  height={520}
  showToolbar={false} // 기본 툴바 비활성화
  onReady={({ manager }) => {
    // manager는 RealTimeDrawingManager 인스턴스
    manager.setBrushSize(8);
    manager.setBrushColor("#ff6b6b");
  }}
/>
```

- `showToolbar={false}`로 내장 패널을 숨깁니다.
- `onReady`에서 전달받은 `manager`를 상태에 저장하면 외부 버튼/슬라이더에서 메서드를 호출할 수 있습니다.

### 6.2 외부 컨트롤러 만들기

주요 메서드

- `setBrushSize(size: number)` / `setBrushColor(color: string)`
- `clearCanvas()`
- `loadBackgroundImage(file: File)` / `removeBackgroundImage()`
- `resetBackgroundImageTransform()` / `setBackgroundScale(scale: number)`
- `setTransformMode(enabled: boolean)` / `isTransformModeEnabled()`
- `setOnBackgroundScaleChange(callback)` → 배경 스케일/이미지 존재 여부를 UI와 동기화할 때 유용

사용 예시

```tsx
const [manager, setManager] = useState<RealTimeDrawingManager | null>(null);
const [brush, setBrush] = useState(6);
const [color, setColor] = useState("#2F80ED");
const [scale, setScale] = useState(1);
const [hasImage, setHasImage] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
const [isTransform, setIsTransform] = useState(false);

useEffect(() => {
  if (!manager) return;
  manager.setOnBackgroundScaleChange((next) => {
    setScale(Number(next.toFixed(2)));
    setHasImage(manager.hasBackgroundImage());
  });
  setScale(Number(manager.getBackgroundScale().toFixed(2)));
  setHasImage(manager.hasBackgroundImage());
  setIsTransform(manager.isTransformModeEnabled());
  return () => manager.setOnBackgroundScaleChange(undefined);
}, [manager]);

return (
  <>
    <div>
      <input
        type="range"
        min={1}
        max={30}
        value={brush}
        onChange={(e) => {
          const size = parseInt(e.target.value, 10);
          setBrush(size);
          manager?.setBrushSize(size);
        }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => {
          setColor(e.target.value);
          manager?.setBrushColor(e.target.value);
        }}
      />
      <button onClick={() => manager?.clearCanvas()}>캔버스 지우기</button>
      <button
        onClick={() => {
          const next = !isTransform;
          manager?.setTransformMode(next);
          setIsTransform(next);
        }}
        disabled={!hasImage}
      >
        Transform {isTransform ? "끄기" : "켜기"}
      </button>
      <button
        onClick={() => manager?.removeBackgroundImage()}
        disabled={!hasImage}
      >
        이미지 제거
      </button>
      <button onClick={() => fileInputRef.current?.click()} disabled={!manager}>
        이미지 불러오기
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          await manager?.loadBackgroundImage(file);
        }}
      />
      <input
        type="range"
        min={0.1}
        max={5}
        step={0.05}
        value={scale}
        onChange={(e) =>
          manager?.setBackgroundScale(parseFloat(e.target.value))
        }
        disabled={!hasImage}
      />
    </div>

    <LiveCollabCanvas
      serverUrl="ws://localhost:5001"
      roomId="custom-ui-room"
      user={user}
      showToolbar={false}
      onReady={({ manager }) => {
        setManager(manager);
        setHasImage(manager.hasBackgroundImage());
        setScale(Number(manager.getBackgroundScale().toFixed(2)));
        manager.setOnBackgroundScaleChange((next) => {
          setScale(Number(next.toFixed(2)));
          setHasImage(manager.hasBackgroundImage());
        });
      }}
    />
  </>
);
```

- 커스텀 입력에서 `manager`의 메서드를 호출해 캔버스를 제어합니다.
- `setOnBackgroundScaleChange`를 이용하면 Transform 조작 시 슬라이더 값이 자동으로 최신 상태로 갱신됩니다.
- 이미지 업로드는 `<input type="file">`를 만들고 `loadBackgroundImage(file)`을 호출하면 됩니다.

이 방식으로 원하는 스타일의 툴바/버튼을 구성하거나, 기존 디자인 시스템과 쉽게 통합할 수 있습니다.

## 7. 저장 및 불러오기

라이브러리는 현재 캔버스 상태를 JSON으로 직렬화해 파일로 저장하고, 다시 불러와 복원할 수 있는 API를 제공합니다.

### 7.1 저장하기

```tsx
// 1. JSON 파일로 다운로드
manager.downloadCanvasState("my-drawing.json");

// 2. 직렬화된 문자열만 받기 (서버 전송용)
const stateJson = manager.exportCanvasState();
// 서버로 전송
await fetch("/api/save-canvas", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ roomId: "my-room", state: stateJson }),
});
```

### 7.2 불러오기

```tsx
// 1. 파일에서 불러오기
const handleFileLoad = async (file: File) => {
  const text = await file.text();
  await manager.importCanvasState(text);
};

// 2. 서버에서 불러오기
const response = await fetch("/api/load-canvas?roomId=my-room");
const { state } = await response.json();
await manager.importCanvasState(state);
```

### 7.3 저장 데이터 구조

```json
{
  "version": "1.0",
  "timestamp": 1699999999999,
  "drawings": [
    {
      "id": "abc123",
      "type": "draw",
      "x": 100,
      "y": 150,
      "color": "#FF6B6B",
      "brushSize": 5,
      "userId": "user-xyz",
      "timestamp": 1699999999999
    }
  ],
  "background": {
    "dataUrl": "data:image/png;base64,...",
    "x": 400,
    "y": 300,
    "scale": 1.2
  }
}
```

### 7.4 UI 컴포넌트

`LiveCollabCanvas`는 기본적으로 저장/불러오기 버튼을 툴바에 포함하고 있습니다. 커스텀 UI를 만들 때는 위 API를 직접 호출하면 됩니다.

## 8. 확장 포인트

- Transform 모드 상태·핸들 드로잉 로직은 `CanvasManager`에 집중되어 있으므로 회전, 비율 잠금 등 추가 편집 기능을 동일한 레이어에서 확장할 수 있습니다.
- `YjsDrawingManager`의 `backgroundState` 맵을 확장하면 여러 이미지 레이어나 추가 메타데이터를 공유하도록 확장 가능합니다.
- `RealTimeDrawingManager`에서 WebRTC 브로드캐스트 타입을 확장해 배경 변경을 직접 데이터 채널로 전송하도록 변경하는 것도 용이합니다.
- 서버 측 영구 저장이 필요하면 `exportCanvasState()` 결과를 DB/파일 시스템에 저장하고, 재접속 시 `importCanvasState()`로 복원하는 로직을 추가하세요.
