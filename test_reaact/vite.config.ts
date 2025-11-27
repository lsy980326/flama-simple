import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
});
