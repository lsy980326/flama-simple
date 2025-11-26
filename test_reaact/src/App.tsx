import React from "react";
import {
  LiveCollabCanvas,
  RealTimeDrawingManager,
  DocumentViewer,
  AnnotationService,
  DocumentAdapterRegistry,
  TxtAdapter,
  DocxAdapter,
  HwpAdapter,
  MeAdapter,
  DocumentModel,
  WEBTOON_WIDTH_OPTIONS,
  type DocumentParser,
  type DocumentRange,
  type DocumentViewerAction,
} from "../../live-collaboration-tool/client/src/lib";

const WS_ENDPOINT = "ws://127.0.0.1:5001";

function useTestUser(label: string) {
  return React.useMemo(
    () => ({
      id: `${label}-${Math.random().toString(36).slice(2, 9)}`,
      name: label,
      color: "#FF6B6B",
      isOnline: true,
    }),
    [label]
  );
}

function Section({
  title,
  description,
  children,
}: React.PropsWithChildren<{
  title: string;
  description?: string;
}>) {
  return (
    <section
      style={{
        marginBottom: 32,
        padding: 20,
        border: "1px solid #ddd",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {description && <p style={{ color: "#555" }}>{description}</p>}
      {children}
    </section>
  );
}

function DocumentViewerExample() {
  const [documentModel, setDocumentModel] =
    React.useState<DocumentModel | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeTool, setActiveTool] = React.useState<
    "highlight" | "underline" | "note"
  >("highlight");
  const [rootElement, setRootElement] = React.useState<HTMLElement | null>(
    null
  );
  const [selectedRange, setSelectedRange] = React.useState<{
    blockId: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [selectedText, setSelectedText] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // AnnotationService 인스턴스 생성 (컴포넌트 생명주기 동안 유지)
  const annotationServiceRef = React.useRef<AnnotationService | null>(null);
  if (!annotationServiceRef.current) {
    annotationServiceRef.current = new AnnotationService({
      onError: (error) => console.warn("AnnotationService error", error),
    });
  }
  const annotationService = annotationServiceRef.current;

  // DocumentAdapterRegistry 생성 및 어댑터 등록
  const adapterRegistryRef = React.useRef<DocumentAdapterRegistry | null>(null);
  if (!adapterRegistryRef.current) {
    const registry = new DocumentAdapterRegistry();
    registry.register({ adapter: new TxtAdapter(), priority: 100 });
    registry.register({ adapter: new DocxAdapter(), priority: 80 });
    registry.register({ adapter: new MeAdapter(), priority: 75 });
    // HWP 어댑터 활성화 (API 필요: http://localhost:5000)
    registry.register({ adapter: new HwpAdapter(), priority: 60 });
    adapterRegistryRef.current = registry;
  }
  const adapterRegistry = adapterRegistryRef.current;

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

      const parser = adapterRegistry.findParser(descriptor) as
        | DocumentParser
        | undefined;
      if (!parser) {
        setErrorMessage(
          `지원하지 않는 파일 형식입니다: .${extension} (현재 지원: .txt, .docx, .me, .md, .hwp)`
        );
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const model = await parser.parse({
          buffer,
          descriptor,
        });

        // 문서 모델에 메타데이터 추가
        const newModel: DocumentModel = {
          ...model,
          id: `doc-${Date.now()}`,
          metadata: {
            ...model.metadata,
            title: file.name,
            author: model.metadata?.author ?? "사용자",
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
        };

        setDocumentModel(newModel);
        setErrorMessage(null);
        // 어노테이션 초기화
        annotationService.deserialize({
          annotations: [],
          notes: [],
          version: 1,
        });
      } catch (error) {
        console.error(error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "파일 파싱 중 오류가 발생했습니다."
        );
      }
    },
    [adapterRegistry, annotationService]
  );

  const handlePickFile = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 텍스트 선택 처리
  React.useEffect(() => {
    if (!rootElement || !documentModel) return;

    const updateSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

      const range = selection.getRangeAt(0);
      if (!rootElement.contains(range.commonAncestorContainer)) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

      // 블록 요소 찾기
      const findBlockElement = (node: Node): HTMLElement | null => {
        let current: Node | null = node;
        while (current) {
          if (current instanceof HTMLElement && current.dataset.blockId) {
            return current;
          }
          current = current.parentNode;
        }
        return null;
      };

      const startBlock = findBlockElement(range.startContainer);
      const endBlock = findBlockElement(range.endContainer);

      if (!startBlock || !endBlock || startBlock !== endBlock) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

      const blockId = startBlock.dataset.blockId;
      if (!blockId) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

      try {
        // 블록의 텍스트 내용 가져오기
        const blockContent =
          startBlock.querySelector<HTMLElement>(
            ".document-viewer__block-content"
          ) || startBlock;
        const blockText = blockContent.textContent || "";

        // 간단한 오프셋 계산
        const rangeForStart = document.createRange();
        rangeForStart.selectNodeContents(blockContent);
        rangeForStart.setEnd(range.startContainer, range.startOffset);
        const startOffset = rangeForStart.toString().length;

        const rangeForEnd = document.createRange();
        rangeForEnd.selectNodeContents(blockContent);
        rangeForEnd.setEnd(range.endContainer, range.endOffset);
        const endOffset = rangeForEnd.toString().length;

        if (startOffset === endOffset) {
          setSelectedRange(null);
          setSelectedText("");
          return;
        }

        const text = blockText.slice(startOffset, endOffset);
        setSelectedRange({
          blockId,
          startOffset: Math.max(0, Math.min(startOffset, blockText.length)),
          endOffset: Math.max(
            startOffset,
            Math.min(endOffset, blockText.length)
          ),
        });
        setSelectedText(text);
      } catch (error) {
        console.warn("선택 영역 계산 실패:", error);
        setSelectedRange(null);
        setSelectedText("");
      }
    };

    document.addEventListener("selectionchange", updateSelection);
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
    };
  }, [rootElement, documentModel]);

  React.useEffect(() => {
    setSelectedRange(null);
    setSelectedText("");
  }, [documentModel]);

  const clearSelection = React.useCallback(() => {
    setSelectedRange(null);
    setSelectedText("");
    const selection = window.getSelection();
    selection?.removeAllRanges();
  }, []);

  const handleApplySelection = React.useCallback(() => {
    if (!selectedRange) return;

    const range: DocumentRange = {
      blockId: selectedRange.blockId,
      startOffset: selectedRange.startOffset,
      endOffset: selectedRange.endOffset,
    };

    if (activeTool === "highlight") {
      annotationService.createHighlight(range, {
        style: { color: "rgba(250, 204, 21, 0.6)", label: "사용자 지정" },
        author: { id: "user-1", name: "사용자" },
      });
    } else if (activeTool === "underline") {
      annotationService.createUnderline(range, {
        style: {
          underlineColor: "#2563eb",
          underlineThickness: 2,
          underlineStyle: "solid",
          label: "사용자 지정",
        },
        author: { id: "user-1", name: "사용자" },
      });
    } else {
      // note
      const annotation = annotationService.createHighlight(range, {
        style: { color: "rgba(14, 165, 233, 0.25)", label: "메모" },
        author: { id: "user-1", name: "사용자" },
      });
      const content = window
        .prompt("메모 내용을 입력하세요", selectedText)
        ?.trim();
      if (content) {
        annotationService.addNote(annotation.id, {
          content,
          author: { id: "user-1", name: "사용자" },
        });
      } else {
        annotationService.removeAnnotation(annotation.id);
      }
    }

    clearSelection();
  }, [
    activeTool,
    annotationService,
    selectedRange,
    selectedText,
    clearSelection,
  ]);

  // 키보드 단축키: Ctrl+1 (형광펜), Ctrl+2 (밑줄)
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 입력 필드에 포커스가 있을 때는 단축키 무시
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ctrl+1: 형광펜 도구로 전환 후 선택 적용
      if ((event.ctrlKey || event.metaKey) && event.key === "1") {
        event.preventDefault();
        setActiveTool("highlight");
        if (selectedRange && selectedText) {
          setTimeout(() => handleApplySelection(), 0);
        }
        return;
      }

      // Ctrl+2: 밑줄 도구로 전환 후 선택 적용
      if ((event.ctrlKey || event.metaKey) && event.key === "2") {
        event.preventDefault();
        setActiveTool("underline");
        if (selectedRange && selectedText) {
          setTimeout(() => handleApplySelection(), 0);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedRange, selectedText, handleApplySelection]);

  // DocumentViewer actions
  const actions = React.useMemo<DocumentViewerAction[]>(() => {
    return [
      {
        id: "highlight",
        label: "형광펜",
        active: activeTool === "highlight",
        onClick: () => setActiveTool("highlight"),
      },
      {
        id: "underline",
        label: "밑줄",
        active: activeTool === "underline",
        onClick: () => setActiveTool("underline"),
      },
      {
        id: "note",
        label: "메모",
        active: activeTool === "note",
        onClick: () => setActiveTool("note"),
      },
    ];
  }, [activeTool]);

  if (!documentModel) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <p style={{ marginBottom: 16, color: "#666" }}>
          문서 파일을 업로드하여 시작하세요.
        </p>
        <button
          onClick={handlePickFile}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            cursor: "pointer",
            background: "#2F80ED",
            color: "white",
            border: "none",
            borderRadius: 6,
          }}
        >
          파일 선택 (.txt, .docx, .me, .md, .hwp)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.docx,.me,.md,.hwp"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {errorMessage && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#fee",
              color: "#c33",
              borderRadius: 4,
            }}
          >
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          onClick={handlePickFile}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            background: "#2F80ED",
            color: "white",
            border: "none",
            borderRadius: 4,
          }}
        >
          다른 파일 불러오기
        </button>
        <span style={{ color: "#666", fontSize: 14 }}>
          현재 문서: {documentModel.metadata?.title ?? "제목 없음"}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.docx,.me,.md,.hwp"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
      {errorMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "#fee",
            color: "#c33",
            borderRadius: 4,
          }}
        >
          {errorMessage}
        </div>
      )}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 4,
          overflow: "hidden",
          background: "white",
        }}
      >
        <DocumentViewer
          document={documentModel}
          annotationService={annotationService}
          actions={actions}
          style={{ height: 600 }}
          searchEnabled={true}
          onRootRef={setRootElement}
        />
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        💡 텍스트를 드래그하여 선택한 후 Ctrl+1 (형광펜), Ctrl+2 (밑줄)로
        어노테이션을 추가하거나 툴바 버튼을 사용할 수 있습니다.
      </div>
    </div>
  );
}

export default function App() {
  const basicUser = useTestUser("basic-user");
  const lightweightUser = useTestUser("lightweight-user");
  const popupUser = useTestUser("popup-user");
  const [isPopupOpen, setPopupOpen] = React.useState(false);
  const [customManager, setCustomManager] =
    React.useState<RealTimeDrawingManager | null>(null);
  const [customBrush, setCustomBrush] = React.useState(6);
  const [customColor, setCustomColor] = React.useState("#2F80ED");
  const [customScale, setCustomScale] = React.useState(1);
  const [customHasBackground, setCustomHasBackground] = React.useState(false);
  const [customHasOverlay, setCustomHasOverlay] = React.useState(false);
  const [customTransform, setCustomTransform] = React.useState(false);
  const [customTransformHotkey, setCustomTransformHotkey] =
    React.useState(false);
  const [customCanvasWidth, setCustomCanvasWidth] = React.useState<number>(690);
  const customFileInputRef = React.useRef<HTMLInputElement>(null);
  const customOverlayInputRef = React.useRef<HTMLInputElement>(null);
  const customHasTransformTarget = React.useMemo(
    () => customHasBackground || customHasOverlay,
    [customHasBackground, customHasOverlay]
  );
  const effectiveCustomTransform = React.useMemo(
    () =>
      (customTransform || customTransformHotkey) && customHasTransformTarget,
    [customTransform, customTransformHotkey, customHasTransformTarget]
  );

  React.useEffect(() => {
    if (!customManager) return;

    customManager.setOnBackgroundScaleChange((scale) => {
      setCustomScale(Number(scale.toFixed(2)));
      setCustomHasBackground(customManager.hasBackgroundImage());
    });

    setCustomHasBackground(customManager.hasBackgroundImage());
    setCustomScale(Number(customManager.getBackgroundScale().toFixed(2)));
    setCustomTransform(customManager.isTransformModeEnabled());

    return () => {
      customManager.setOnBackgroundScaleChange(undefined);
    };
  }, [customManager]);

  React.useEffect(() => {
    if (!customManager) return;

    const handleObjectsChange = (objects: any[]) => {
      const hasImages = Array.isArray(objects)
        ? objects.some((obj) => obj?.type === "image")
        : false;
      setCustomHasOverlay(hasImages);
    };

    customManager.setOnObjectsChange(handleObjectsChange);

    return () => {
      customManager.setOnObjectsChange(undefined);
    };
  }, [customManager]);

  React.useEffect(() => {
    if (!customManager) return;
    customManager.setBrushSize(customBrush);
  }, [customBrush, customManager]);

  React.useEffect(() => {
    if (!customManager) return;
    customManager.setBrushColor(customColor);
  }, [customColor, customManager]);

  React.useEffect(() => {
    if (!customManager) return;
    customManager.setTransformMode(effectiveCustomTransform);
  }, [customManager, effectiveCustomTransform]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "t" || event.key === "T") && event.altKey) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        if (!customHasTransformTarget) {
          return;
        }
        event.preventDefault();
        setCustomTransform((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [customHasTransformTarget]);

  React.useEffect(() => {
    if (!customManager) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCustomTransformHotkey(true);
        customManager.setTransformHotkey(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCustomTransformHotkey(false);
        customManager.setTransformHotkey(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [customManager]);

  React.useEffect(() => {
    if (!customHasTransformTarget) {
      setCustomTransformHotkey(false);
    }
  }, [customHasTransformTarget]);

  const handleCustomScaleChange = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    setCustomScale(rounded);
    customManager?.setBackgroundScale(rounded);
  };

  const handleCustomImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !customManager) return;

    try {
      await customManager.loadBackgroundImage(file);
      setCustomHasBackground(true);
      setCustomScale(Number(customManager.getBackgroundScale().toFixed(2)));
    } catch (error) {
      console.error("이미지 업로드 실패:", error);
      alert("이미지를 불러오지 못했습니다.");
    } finally {
      event.target.value = "";
    }
  };

  const handleCustomOverlayUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || !customManager) {
      event.target.value = "";
      return;
    }

    const validFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (validFiles.length === 0) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }

    try {
      for (const file of validFiles) {
        await customManager.addImageFromFile(file);
      }
      setCustomHasOverlay(true);
    } catch (error) {
      console.error("오버레이 이미지 추가 실패:", error);
      alert("오버레이 이미지를 추가하는 중 오류가 발생했습니다.");
    } finally {
      event.target.value = "";
    }
  };

  const handleCustomRemoveBackground = () => {
    if (!customManager) return;
    try {
      customManager.removeBackgroundImage();
      setCustomHasBackground(false);
      setCustomScale(1);
      if (!customHasOverlay) {
        setCustomTransform(false);
        setCustomTransformHotkey(false);
      }
    } catch (error) {
      console.error("배경 이미지 제거 실패:", error);
    }
  };

  const toggleCustomTransform = () => {
    if (!customManager) return;
    setCustomTransform((prev) => !prev);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h2>LiveCollab 라이브러리 사용 예제</h2>
      <p style={{ color: "#444" }}>
        아래 예제들은 `LiveCollabCanvas` 컴포넌트와 `DocumentViewer` 컴포넌트를
        다양한 방법으로 사용하는 모습을 보여줍니다.
      </p>
      {/* 
      <Section
        title="1. 기본 도구 패널"
        description="가장 단순한 형태로 캔버스를 렌더링합니다. 같은 roomId를 사용하면 여러 브라우저에서 실시간으로 동기화됩니다."
      >
        <LiveCollabCanvas
          serverUrl={WS_ENDPOINT}
          roomId="demo-room-basic"
          user={basicUser}
          width={900}
          height={520}
          showToolbar
        />
      </Section>

      <Section
        title="2. 최소 구성"
        description="툴바 없이 순수한 캔버스만 렌더링하고 싶을 때 사용할 수 있는 설정입니다. UI는 직접 구성하면 됩니다."
      >
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div>
            <LiveCollabCanvas
              serverUrl={WS_ENDPOINT}
              roomId="demo-room-minimal"
              user={lightweightUser}
              width={700}
              height={420}
              showToolbar={false}
            />
          </div>
        </div>
      </Section>

      <Section
        title="3. 팝업/모달 안에서 사용"
        description="다른 페이지 흐름을 유지하면서 별도의 팝업 창에서 협업 캔버스를 띄울 수 있습니다."
      >
        <button
          style={{ padding: "8px 16px", cursor: "pointer" }}
          onClick={() => setPopupOpen(true)}
        >
          팝업 열기
        </button>

        {isPopupOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999,
            }}
          >
            <div
              style={{
                background: "white",
                padding: 16,
                borderRadius: 10,
                width: "85%",
                maxWidth: 960,
                boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h4 style={{ margin: 0 }}>실시간 드로잉 팝업</h4>
                <button
                  style={{
                    padding: "4px 10px",
                    border: "none",
                    background: "#333",
                    color: "white",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                  onClick={() => setPopupOpen(false)}
                >
                  닫기
                </button>
              </div>
              <LiveCollabCanvas
                serverUrl={WS_ENDPOINT}
                roomId="demo-room-modal"
                user={popupUser}
                width={840}
                height={480}
                showToolbar
              />
            </div>
          </div>
        )}
      </Section> */}

      <Section
        title="4. 커스텀 UI 연동"
        description="툴바 없이 직접 버튼과 슬라이더를 만들고 `RealTimeDrawingManager` API를 호출하는 예제입니다."
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>브러시 크기</span>
            <input
              type="range"
              min={1}
              max={30}
              value={customBrush}
              onChange={(e) => setCustomBrush(parseInt(e.target.value, 10))}
              style={{ flex: 1 }}
              disabled={!customManager}
            />
            <span>{customBrush}px</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>색상</span>
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              disabled={!customManager}
            />
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => customManager?.clearCanvas()}
              disabled={!customManager}
            >
              캔버스 지우기
            </button>
            <button
              onClick={toggleCustomTransform}
              disabled={!customManager || !customHasTransformTarget}
            >
              Transform {effectiveCustomTransform ? "끄기" : "켜기"}
            </button>
            <button
              onClick={() => customManager?.resetBackgroundImageTransform()}
              disabled={
                !customManager ||
                !customHasBackground ||
                !effectiveCustomTransform
              }
            >
              이미지 초기화
            </button>
            <button
              onClick={handleCustomRemoveBackground}
              disabled={!customHasBackground}
            >
              이미지 제거
            </button>
            <button
              onClick={() => customFileInputRef.current?.click()}
              disabled={!customManager}
            >
              이미지 불러오기
            </button>
            <input
              ref={customFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleCustomImageUpload}
            />
            <button
              onClick={() => customOverlayInputRef.current?.click()}
              disabled={!customManager}
            >
              오버레이 이미지 추가
            </button>
            <input
              ref={customOverlayInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleCustomOverlayUpload}
            />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>이미지 배율</span>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.05}
              value={customScale}
              onChange={(e) =>
                handleCustomScaleChange(parseFloat(e.target.value))
              }
              disabled={
                !customManager ||
                !customHasBackground ||
                !effectiveCustomTransform
              }
              style={{ flex: 1 }}
            />
            <span>{customScale.toFixed(2)}x</span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>캔버스 가로 크기</span>
            <select
              value={customCanvasWidth}
              onChange={(e) => {
                const newWidth = Number(e.target.value);
                setCustomCanvasWidth(newWidth);
                if (customManager) {
                  customManager.setCanvasWidth(newWidth, 690);
                }
              }}
              disabled={!customManager}
              style={{ flex: 1, padding: "4px" }}
            >
              {WEBTOON_WIDTH_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 12, color: "#666" }}>
            💡 Alt+T로 토글하거나 Ctrl을 누른 채 이미지를 클릭/드래그하면
            Transform 모드가 활성화됩니다.
          </div>
        </div>

        <LiveCollabCanvas
          serverUrl={WS_ENDPOINT}
          roomId="demo-room-custom-ui"
          user={lightweightUser}
          width={900}
          height={520}
          canvasWidth={customCanvasWidth}
          defaultCanvasWidth={690}
          showToolbar={false}
          onReady={({ manager }) => {
            setCustomManager(manager);
            setCustomHasBackground(manager.hasBackgroundImage());
            setCustomScale(Number(manager.getBackgroundScale().toFixed(2)));
            manager.setBrushSize(customBrush);
            manager.setBrushColor(customColor);
            // 초기 캔버스 크기 설정
            manager.setCanvasWidth(customCanvasWidth, 690);
          }}
        />
      </Section>

      <Section
        title="5. 문서 뷰어 기본 사용"
        description="`DocumentViewer` 컴포넌트와 `AnnotationService`를 사용하여 문서를 불러오고 하이라이트/메모 기능을 사용하는 예제입니다."
      >
        <DocumentViewerExample />
      </Section>
    </div>
  );
}
