import React from "react";
import {
  BasicCanvasExample,
  MinimalCanvasExample,
  DocumentViewerExample,
  MultipleCanvasExample,
  IntegratedExample,
  CanvasViewerExample,
  SketchupExample,
} from "./examples";

/**
 * 예제 선택기
 *
 * 각 예제는 독립적으로 동작하며, 커스텀 로직 없이
 * 단순히 라이브러리를 import해서 사용하는 방법을 보여줍니다.
 */
export default function App() {
  const [selectedExample, setSelectedExample] = React.useState<string>("basic");
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const examples = [
    { id: "basic", label: "1. 기본 캔버스", component: <BasicCanvasExample /> },
    {
      id: "viewer",
      label: "2. 캔버스 뷰어 (읽기 전용)",
      component: <CanvasViewerExample />,
    },
    {
      id: "minimal",
      label: "3. 최소 구성 캔버스",
      component: <MinimalCanvasExample />,
    },
    {
      id: "document",
      label: "4. 문서 뷰어",
      component: <DocumentViewerExample />,
    },
    {
      id: "multiple",
      label: "5. 여러 캔버스",
      component: <MultipleCanvasExample />,
    },
    {
      id: "integrated",
      label: "6. 통합 예제",
      component: <IntegratedExample />,
    },
    {
      id: "sketchup",
      label: "7. 스케치업 뷰어",
      component: <SketchupExample />,
    },
  ];

  const currentExample = examples.find((ex) => ex.id === selectedExample);

  return (
    <div style={{ 
      padding: isMobile ? 0 : 24, 
      maxWidth: isMobile ? '100%' : 1400, 
      margin: "0 auto" 
    }}>
      {!isMobile && (
        <>
          <h1 style={{ marginBottom: 8 }}>LiveCollab 라이브러리 예제 모음</h1>
          <p style={{ color: "#666", marginBottom: 24 }}>
            아래 예제들은 모두 커스텀 로직 없이 단순히 import해서 사용하는 방법을
            보여줍니다. 각 예제는 독립적으로 동작하며, 라이브러리의 기본 기능만
            사용합니다.
          </p>
        </>
      )}

      {/* 예제 선택 탭 */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: isMobile ? 0 : 24,
          flexWrap: "wrap",
          borderBottom: isMobile ? "none" : "2px solid #e0e0e0",
          paddingBottom: isMobile ? 0 : 16,
          padding: isMobile ? 8 : 0,
        }}
      >
        {examples.map((example) => (
          <button
            key={example.id}
            onClick={() => setSelectedExample(example.id)}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              cursor: "pointer",
              background:
                selectedExample === example.id ? "#2F80ED" : "#f5f5f5",
              color: selectedExample === example.id ? "white" : "#333",
              border: "none",
              borderRadius: 6,
              fontWeight: selectedExample === example.id ? "bold" : "normal",
              transition: "all 0.2s",
            }}
          >
            {example.label}
          </button>
        ))}
      </div>

      {/* 선택된 예제 표시 */}
      <div
        style={{
          border: isMobile ? "none" : "1px solid #ddd",
          borderRadius: isMobile ? 0 : 8,
          padding: isMobile ? 0 : 20,
          background: isMobile ? "transparent" : "white",
        }}
      >
        {currentExample?.component}
      </div>

      {/* 예제 설명 */}
      {!isMobile && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: "#f9f9f9",
            borderRadius: 8,
          }}
        >
        <h3 style={{ marginTop: 0 }}>💡 사용 방법</h3>
        <p style={{ marginBottom: 8 }}>
          각 예제는 <code>src/examples/</code> 디렉토리에 있으며, 다음과 같이
          사용할 수 있습니다:
        </p>
        <pre
          style={{
            background: "#2d2d2d",
            color: "#f8f8f2",
            padding: 16,
            borderRadius: 4,
            overflow: "auto",
            fontSize: 13,
          }}
        >
          {`import { BasicCanvasExample } from "./examples";

function App() {
  return <BasicCanvasExample />;
}`}
        </pre>
          <p
            style={{
              marginTop: 16,
              marginBottom: 0,
              fontSize: 14,
              color: "#666",
            }}
          >
            각 예제 파일을 열어보면 단순히 라이브러리 컴포넌트를 import하고
            props만 전달하는 것을 확인할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
