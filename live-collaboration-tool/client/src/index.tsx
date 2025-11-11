import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import DocumentViewerDemo from "./examples/DocumentViewerDemo";
import WebtoonViewerDemo from "./examples/WebtoonViewerDemo";
import reportWebVitals from "./reportWebVitals";

// 전역 오류 핸들러 설정
window.addEventListener("error", (event) => {
  const errorMessage = event.message || String(event.error || "");
  const errorSource = event.filename || "";

  // Y.js 디코딩 관련 오류 또는 React Refresh 관련 오류는 무시
  if (
    errorMessage.includes("Unexpected end of array") ||
    errorMessage.includes("Integer out of Range") ||
    errorMessage.includes("react refresh") ||
    errorMessage.includes("react refresh runtime") ||
    errorSource.includes("decoding.js") ||
    errorSource.includes("yjs") ||
    errorSource.includes("lib0")
  ) {
    // 개발 모드에서만 경고 출력, 프로덕션에서는 완전히 무시
    if (process.env.NODE_ENV === "development") {
      console.debug(
        "Y.js/React Refresh 관련 오류 무시됨 (정상 동작 중):",
        errorMessage.substring(0, 50)
      );
    }
    event.preventDefault(); // 오류 전파 방지
    event.stopPropagation();
    return false;
  }

  // 다른 오류는 로깅만
  console.error("전역 오류 발생:", event.error || event.message);
});

// Promise rejection 핸들러
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const reasonMessage = reason?.message || String(reason || "");

  // Y.js 디코딩 관련 오류 또는 React Refresh 관련 오류는 무시
  if (
    reasonMessage.includes("Unexpected end of array") ||
    reasonMessage.includes("Integer out of Range") ||
    reasonMessage.includes("react refresh") ||
    reasonMessage.includes("decoding") ||
    reasonMessage.includes("yjs")
  ) {
    // 개발 모드에서만 경고 출력
    if (process.env.NODE_ENV === "development") {
      console.debug(
        "Y.js/React Refresh 관련 Promise rejection 무시됨:",
        reasonMessage.substring(0, 50)
      );
    }
    event.preventDefault();
    return;
  }

  console.error("처리되지 않은 Promise rejection:", event.reason);
});

const params = new URLSearchParams(window.location.search);
const viewParam = params.get("view");
let RootComponent = App;
if (viewParam === "doc") {
  RootComponent = DocumentViewerDemo;
} else if (viewParam === "webtoon") {
  RootComponent = WebtoonViewerDemo;
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
