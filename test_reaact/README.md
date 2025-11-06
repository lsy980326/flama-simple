# LiveCollab Test (Standalone)

이 폴더는 상위 `live-collaboration-tool` 라이브러리를 직접 소스 경로로 불러와 구동하는 최소 React(Vite+TS) 예제입니다.

## 실행

1. 의존성 설치

```bash
pnpm install
```

2. 개발 서버 실행

```bash
pnpm run dev
```

브라우저가 자동으로 열리며 `http://localhost:5173`에서 확인할 수 있습니다.

주의: 동기화를 위해 상위 레포의 서버가 떠 있어야 합니다.

- 서버 실행: 프로젝트 루트에서 `pnpm run dev` (또는 `live-collaboration-tool/server`에서 `pnpm dev`)
- Y.js WebSocket: `ws://localhost:5001`
