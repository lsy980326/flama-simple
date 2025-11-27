import React from "react";
import { DocumentViewer, DocumentViewerAction } from "./DocumentViewer";
import { AnnotationService } from "../annotations/AnnotationService";
import { DocumentAdapterRegistry, DocumentModel, DocumentRange, DocumentParser } from "../documents/types";
import { createDefaultAdapterRegistry } from "../utils/documentAdapters";

export interface DocumentViewerWithUploadProps {
  /**
   * 초기 문서 모델 (선택사항)
   * 제공되지 않으면 파일 업로드 UI가 표시됩니다.
   */
  initialDocument?: DocumentModel;
  
  /**
   * 어노테이션 서비스 인스턴스 (선택사항)
   * 제공되지 않으면 내부에서 생성됩니다.
   */
  annotationService?: AnnotationService;
  
  /**
   * 어댑터 레지스트리 (선택사항)
   * 제공되지 않으면 기본 어댑터 레지스트리가 사용됩니다.
   */
  adapterRegistry?: DocumentAdapterRegistry;
  
  /**
   * 사용자 정보 (어노테이션 작성자로 사용)
   */
  user?: { id: string; name: string };
  
  /**
   * 문서 뷰어 높이 (기본값: 600)
   */
  height?: number;
  
  /**
   * 검색 기능 활성화 여부 (기본값: true)
   */
  searchEnabled?: boolean;
  
  /**
   * 커스텀 액션 (선택사항)
   * 제공되지 않으면 기본 액션(형광펜, 밑줄, 메모)이 사용됩니다.
   */
  customActions?: DocumentViewerAction[];
  
  /**
   * 문서 변경 시 콜백
   */
  onDocumentChange?: (document: DocumentModel | null) => void;
  
  /**
   * 에러 발생 시 콜백
   */
  onError?: (error: Error) => void;
  
  /**
   * 스타일 커스터마이징
   */
  style?: React.CSSProperties;
  
  /**
   * 클래스명
   */
  className?: string;
}

/**
 * 파일 업로드 및 어노테이션 기능이 포함된 DocumentViewer 통합 컴포넌트
 * 
 * 이 컴포넌트는 다음 기능을 포함합니다:
 * - 파일 업로드 및 파싱
 * - 텍스트 선택 및 어노테이션 생성
 * - 키보드 단축키 지원 (Ctrl+1: 형광펜, Ctrl+2: 밑줄)
 * - 기본 어댑터 레지스트리 설정
 */
export const DocumentViewerWithUpload: React.FC<DocumentViewerWithUploadProps> = ({
  initialDocument,
  annotationService: propAnnotationService,
  adapterRegistry: propAdapterRegistry,
  user = { id: "user-1", name: "사용자" },
  height = 600,
  searchEnabled = true,
  customActions,
  onDocumentChange,
  onError,
  style,
  className,
}) => {
  const [documentModel, setDocumentModel] = React.useState<DocumentModel | null>(initialDocument || null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeTool, setActiveTool] = React.useState<"highlight" | "underline" | "note">("highlight");
  const [rootElement, setRootElement] = React.useState<HTMLElement | null>(null);
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
    annotationServiceRef.current = propAnnotationService || new AnnotationService({
      onError: (error) => {
        console.warn("AnnotationService error", error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      },
    });
  }
  const annotationService = annotationServiceRef.current;

  // DocumentAdapterRegistry 생성 및 어댑터 등록
  const adapterRegistryRef = React.useRef<DocumentAdapterRegistry | null>(null);
  if (!adapterRegistryRef.current) {
    adapterRegistryRef.current = propAdapterRegistry || createDefaultAdapterRegistry();
  }
  const adapterRegistry = adapterRegistryRef.current;

  // 문서 변경 시 콜백 호출
  React.useEffect(() => {
    onDocumentChange?.(documentModel);
  }, [documentModel, onDocumentChange]);

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

      const parser = adapterRegistry.findParser(descriptor) as DocumentParser | undefined;
      if (!parser) {
        const errorMsg = `지원하지 않는 파일 형식입니다: .${extension} (현재 지원: .txt, .docx, .me, .md, .hwp)`;
        setErrorMessage(errorMsg);
        onError?.(new Error(errorMsg));
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
            author: model.metadata?.author ?? user.name,
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
        const errorMsg = error instanceof Error
          ? error.message
          : "파일 파싱 중 오류가 발생했습니다.";
        setErrorMessage(errorMsg);
        onError?.(error instanceof Error ? error : new Error(errorMsg));
      }
    },
    [adapterRegistry, annotationService, user.name, onError]
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
        author: { id: user.id, name: user.name },
      });
    } else if (activeTool === "underline") {
      annotationService.createUnderline(range, {
        style: {
          underlineColor: "#2563eb",
          underlineThickness: 2,
          underlineStyle: "solid",
          label: "사용자 지정",
        },
        author: { id: user.id, name: user.name },
      });
    } else {
      // note
      const annotation = annotationService.createHighlight(range, {
        style: { color: "rgba(14, 165, 233, 0.25)", label: "메모" },
        author: { id: user.id, name: user.name },
      });
      const content = window
        .prompt("메모 내용을 입력하세요", selectedText)
        ?.trim();
      if (content) {
        annotationService.addNote(annotation.id, {
          content,
          author: { id: user.id, name: user.name },
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
    user,
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
    if (customActions) {
      return customActions;
    }
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
  }, [activeTool, customActions]);

  if (!documentModel) {
    return (
      <div style={{ padding: 20, textAlign: "center", ...style }} className={className}>
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
    <div style={style} className={className}>
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
          style={{ height }}
          searchEnabled={searchEnabled}
          onRootRef={setRootElement}
        />
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        💡 텍스트를 드래그하여 선택한 후 Ctrl+1 (형광펜), Ctrl+2 (밑줄)로
        어노테이션을 추가하거나 툴바 버튼을 사용할 수 있습니다.
      </div>
    </div>
  );
};

