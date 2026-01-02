import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", // 외부 접근 허용
    port: 5173,
    fs: {
      // 라이브러리 소스(상위 폴더) 접근 허용
      allow: [".."],
    },
  },
  resolve: {
    // 라이브러리의 node_modules도 resolve하도록 설정
    dedupe: ["react", "react-dom"],
    // IMPORTANT: `src/lib` 내부에 .js/.ts가 공존하는데, Vite 기본 해석에서 .js가 먼저 잡히면
    // 우리가 수정한 TS 소스가 반영되지 않습니다. 테스트앱에서는 TS를 우선하도록 확장자 우선순위를 명시합니다.
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
    alias: {
      // 라이브러리 경로 alias (선택사항)
      "@live-collab": path.resolve(
        __dirname,
        "../live-collaboration-tool/client/src/lib"
      ),
      // 라이브러리(src/lib)를 소스로 직접 import할 때, 의존성은 라이브러리의 node_modules에 존재합니다.
      // Vite optimizeDeps가 이를 못 찾는 케이스가 있어, 핵심 의존성은 명시적으로 라이브러리 node_modules로 alias 합니다.
      "pdfjs-dist": path.resolve(
        __dirname,
        "../live-collaboration-tool/client/node_modules/pdfjs-dist"
      ),
      "react-pdf": path.resolve(
        __dirname,
        "../live-collaboration-tool/client/node_modules/react-pdf"
      ),
      mammoth: path.resolve(
        __dirname,
        "../live-collaboration-tool/client/node_modules/mammoth"
      ),
      marked: path.resolve(
        __dirname,
        "../live-collaboration-tool/client/node_modules/marked"
      ),
      jszip: path.resolve(
        __dirname,
        "../live-collaboration-tool/client/node_modules/jszip"
      ),
    },
    // pnpm workspace에서 의존성을 찾을 수 있도록 경로 추가
    preserveSymlinks: false,
  },
  optimizeDeps: {
    // 명시적으로 의존성 포함 (라이브러리에서 사용하는 패키지들)
    include: [
      "react",
      "react-dom",
      "pdfjs-dist",
      "react-pdf",
      "mammoth",
      "marked",
      "jszip",
    ],
    // 라이브러리 소스를 스캔하여 의존성을 자동으로 찾도록 함
    entries: [
      // 현재 프로젝트의 엔트리
      "./src/**/*.{ts,tsx}",
      // 라이브러리 소스도 스캔
      "../live-collaboration-tool/client/src/lib/**/*.{ts,tsx}",
    ],
  },
});
