import React from "react";
import { DocumentModel, DocumentBlock } from "../lib/documents/types";
import { WebtoonViewer, WEBTOON_WIDTH_OPTIONS } from "../lib/components/WebtoonViewer";
import { TxtAdapter } from "../lib/documents/adapters/TxtAdapter";
import { DocumentAdapterRegistry } from "../lib/documents/types";

// 데모용 문서 생성
const createDemoDocument = (): DocumentModel => {
  const blocks: DocumentBlock[] = [];
  
  // 제목
  blocks.push({
    id: "block-title",
    type: "heading" as const,
    runs: [
      {
        id: "run-title",
        text: "웹툰 뷰어 데모",
        style: {
          fontSize: 28,
          decorations: ["bold"],
        },
      },
    ],
  });

  // 여러 개의 문단 생성
  const paragraphs = [
    "이것은 웹툰 뷰어 데모입니다. 세로로 무한 스크롤이 지원되며, 가로 크기를 조절할 수 있습니다.",
    "네이버 웹툰 기준으로 가로 크기는 690px, 720px, 740px, 1380px, 1440px, 1480px 중에서 선택할 수 있습니다.",
    "세로 길이는 자유롭게 설정되며, 콘텐츠에 따라 자동으로 조절됩니다.",
    "이 뷰어는 웹툰과 웹소설을 위한 특화 기능을 제공합니다.",
    "각 블록은 독립적으로 렌더링되며, 스크롤에 따라 동적으로 로드됩니다.",
    "모바일 환경에서도 최적화된 레이아웃을 제공합니다.",
    "다크 모드와 라이트 모드를 지원하며, 사용자 설정에 따라 변경할 수 있습니다.",
    "읽기 진행률을 표시하고, 북마크 기능을 제공합니다.",
    "자동 스크롤 기능을 통해 편리하게 읽을 수 있습니다.",
    "이 모든 기능들이 웹툰 뷰어에 통합되어 있습니다.",
  ];

  paragraphs.forEach((text, index) => {
    blocks.push({
      id: `block-${index + 1}`,
      type: "paragraph" as const,
      runs: [
        {
          id: `run-${index + 1}`,
          text: text,
        },
      ],
    });
  });

  return {
    id: "webtoon-demo",
    metadata: {
      title: "웹툰 뷰어 데모",
      description: "웹툰 전용 뷰어 기능 시연",
      author: "데모",
      createdAt: new Date(),
      modifiedAt: new Date(),
    },
    blocks,
  };
};

export default function WebtoonViewerDemo(): React.ReactElement {
  const [document, setDocument] = React.useState<DocumentModel>(createDemoDocument());
  const [selectedWidth, setSelectedWidth] = React.useState<number>(720);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const adapterRegistryRef = React.useRef<DocumentAdapterRegistry | null>(null);

  if (!adapterRegistryRef.current) {
    const registry = new DocumentAdapterRegistry();
    registry.register({ adapter: new TxtAdapter(), priority: 100 });
    adapterRegistryRef.current = registry;
  }
  const adapterRegistry = adapterRegistryRef.current!;

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const descriptor = {
        extension,
        mimeType: file.type || undefined,
        metadata: { name: file.name },
      };

      const parser = adapterRegistry.findParser(descriptor);
      if (!parser) {
        alert(`지원하지 않는 파일 형식입니다: .${extension}`);
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const model = await parser.parse({
          buffer,
          descriptor,
        });
        setDocument({
          ...model,
          id: `webtoon-${Date.now()}`,
          metadata: {
            ...model.metadata,
            title: file.name,
            author: model.metadata?.author ?? "익명",
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
        });
      } catch (error) {
        console.error("파일 파싱 오류:", error);
        alert("파일을 불러오는 중 오류가 발생했습니다.");
      }
    },
    [adapterRegistry]
  );

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <div
        style={{
          position: "fixed",
          top: "16px",
          left: "16px",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            padding: "12px 16px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#333" }}>
            웹툰 뷰어 데모
          </h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "6px 12px",
              fontSize: "14px",
              border: "1px solid #cccccc",
              borderRadius: "4px",
              background: "#ffffff",
              color: "#333333",
              cursor: "pointer",
            }}
          >
            텍스트 파일 열기
          </button>
          <button
            onClick={() => setDocument(createDemoDocument())}
            style={{
              marginTop: "8px",
              padding: "6px 12px",
              fontSize: "14px",
              border: "1px solid #cccccc",
              borderRadius: "4px",
              background: "#ffffff",
              color: "#333333",
              cursor: "pointer",
              width: "100%",
            }}
          >
            데모 문서 로드
          </button>
        </div>
        <div
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            padding: "12px 16px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
            지원 가로 크기:
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
            }}
          >
            {WEBTOON_WIDTH_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setSelectedWidth(w)}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  border: `1px solid ${selectedWidth === w ? "#2563eb" : "#cccccc"}`,
                  borderRadius: "4px",
                  background: selectedWidth === w ? "#2563eb" : "#ffffff",
                  color: selectedWidth === w ? "#ffffff" : "#333333",
                  cursor: "pointer",
                }}
              >
                {w}px
              </button>
            ))}
          </div>
        </div>
      </div>
      <WebtoonViewer
        document={document}
        width={selectedWidth}
        showWidthSelector={true}
        onWidthChange={setSelectedWidth}
      />
    </div>
  );
}

