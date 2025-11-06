import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // 라이브러리 소스(상위 폴더) 접근 허용
      allow: [".."],
    },
  },
});
