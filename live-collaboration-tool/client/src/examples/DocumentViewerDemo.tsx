import React from "react";
import {
  DocumentModel,
  DocumentRange,
  DocumentBlock,
  DocumentBundle,
  DocumentStorageTarget,
} from "../lib/documents/types";
import {
  AnnotationNote,
  SerializedAnnotationState,
} from "../lib/annotations/types";
import { AnnotationService } from "../lib/annotations/AnnotationService";
import {
  DocumentViewer,
  DocumentViewerAction,
  DocumentViewerRenderContext,
} from "../lib/components/DocumentViewer";
import { DocumentStorageManager } from "../lib/documents/storage";
import { MemoryStorageProvider } from "../lib/documents/storage/providers/MemoryStorageProvider";
import { IndexedDBStorageProvider } from "../lib/documents/storage/providers/IndexedDBStorageProvider";
import { TxtAdapter } from "../lib/documents/adapters/TxtAdapter";
import { DocxAdapter } from "../lib/documents/adapters/DocxAdapter";
import { HwpAdapter } from "../lib/documents/adapters/HwpAdapter";
import { MeAdapter } from "../lib/documents/adapters/MeAdapter";
import { DocumentAdapterRegistry } from "../lib/documents/types";
import { RealtimeClient } from "../lib/realtime/RealtimeClient";

const EMPTY_STATE: SerializedAnnotationState = {
  version: 1,
  annotations: [],
  notes: [],
};

const DEMO_AUTHOR = { id: "user-demo", name: "데모 사용자" };

// 메모 아이템 컴포넌트
const NoteItem: React.FC<{
  note: AnnotationNote;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
}> = ({ note, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(note.content);

  React.useEffect(() => {
    setEditContent(note.content);
  }, [note.content]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editContent.trim()) {
      onUpdate(note.id, editContent);
      setIsEditing(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContent(note.content);
    setIsEditing(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("메모를 삭제하시겠습니까?")) {
      onDelete(note.id);
    }
  };

  return (
    <li onClick={(e) => e.stopPropagation()}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <div style={{ flex: 1 }}>
          <strong>{note.author?.name ?? "익명"}</strong>
          {isEditing ? (
            <div style={{ marginTop: "8px" }}>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "60px",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  background: "var(--document-viewer-surface)",
                  color: "var(--document-viewer-text)",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={handleSave}
                  style={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: "none",
                    background: "rgba(59, 130, 246, 0.8)",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    background: "transparent",
                    color: "var(--document-viewer-text)",
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <span>{note.content}</span>
          )}
        </div>
        {!isEditing && (
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              type="button"
              onClick={handleEdit}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "none",
                background: "rgba(148, 163, 184, 0.2)",
                color: "var(--document-viewer-text)",
                cursor: "pointer",
              }}
              title="편집"
            >
              편집
            </button>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "none",
                background: "rgba(239, 68, 68, 0.2)",
                color: "var(--document-viewer-text)",
                cursor: "pointer",
              }}
              title="삭제"
            >
              삭제
            </button>
          </div>
        )}
      </div>
    </li>
  );
};

const demoDocument: DocumentModel = {
  id: "demo-document",
  metadata: {
    title: "문서 뷰어 데모",
    description: "어노테이션, 저장/불러오기, 텍스트 하이라이트 시연",
    author: "문서팀",
    createdAt: new Date("2024-12-11"),
    modifiedAt: new Date("2025-02-01"),
  },
  blocks: [
    {
      id: "block-1",
      type: "heading",
      runs: [
        {
          id: "run-1",
          text: "문서 뷰어 모듈 데모",
          style: {
            decorations: ["bold"],
            fontSize: 24,
          },
        },
      ],
    },
    {
      id: "block-2",
      type: "paragraph",
      runs: [
        {
          id: "run-2",
          text: "이 문서는 다양한 포맷을 공통 모델로 변환해 렌더링하고, ",
        },
        {
          id: "run-3",
          text: "하이라이트와 메모를 연동",
          style: { decorations: ["bold"] },
        },
        {
          id: "run-4",
          text: "하는 예시를 보여줍니다.",
        },
      ],
    },
    {
      id: "block-3",
      type: "paragraph",
      runs: [
        {
          id: "run-5",
          text: "사용자는 텍스트를 선택해 형광펜이나 밑줄을 추가하고, 관련된 메모를 작성할 수 있습니다.",
        },
      ],
    },
    {
      id: "block-4",
      type: "paragraph",
      runs: [
        {
          id: "run-6",
          text: "우측 패널에서 메모 목록을 확인할 수 있으며, 각 메모는 연결된 텍스트 위치 정보와 함께 저장됩니다.",
        },
      ],
    },
  ],
};

function toPlainText(block: DocumentBlock): string {
  if ("runs" in block) {
    return block.runs.map((run) => run.text).join("");
  }
  if (block.type === "image") {
    return block.caption?.map((run) => run.text).join("") ?? "";
  }
  return "";
}

function normalizeDocument(doc: DocumentModel): DocumentModel {
  if (!doc.metadata) {
    return doc;
  }
  return {
    ...doc,
    metadata: {
      ...doc.metadata,
      createdAt: doc.metadata.createdAt
        ? new Date(doc.metadata.createdAt)
        : undefined,
      modifiedAt: doc.metadata.modifiedAt
        ? new Date(doc.metadata.modifiedAt)
        : undefined,
    },
  };
}

function truncate(text: string, max = 40): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

export default function DocumentViewerDemo(): React.ReactElement {
  const annotationServiceRef = React.useRef<AnnotationService | null>(null);
  const storageManagerRef = React.useRef<DocumentStorageManager | null>(null);
  const adapterRegistryRef = React.useRef<DocumentAdapterRegistry | null>(null);
  const seededRef = React.useRef(false);
  const realtimeRef = React.useRef<RealtimeClient | null>(null);
  const currentClientIdRef = React.useRef<string | null>(null);
  const [presenceUsers, setPresenceUsers] = React.useState<
    {
      clientId: string;
      user: { id: string; name: string };
      lastSeen: number;
      cursor?: { blockId: string; offset: number } | null;
      selection?: { blockId: string; start: number; end: number } | null;
    }[]
  >([]);

  if (!annotationServiceRef.current) {
    annotationServiceRef.current = new AnnotationService({
      onError: (error) => console.warn("AnnotationService error", error),
    });
  }
  const annotationService = annotationServiceRef.current!;

  if (!storageManagerRef.current) {
    const manager = new DocumentStorageManager({ defaultProviderId: "memory" });
    manager.registerProvider(new MemoryStorageProvider());
    try {
      manager.registerProvider(new IndexedDBStorageProvider());
    } catch (error) {
      console.warn("IndexedDB provider 등록 실패:", error);
    }
    storageManagerRef.current = manager;
  }
  const storageManager = storageManagerRef.current!;

  if (!adapterRegistryRef.current) {
    const registry = new DocumentAdapterRegistry();
    registry.register({ adapter: new TxtAdapter(), priority: 100 });
    registry.register({ adapter: new DocxAdapter(), priority: 80 });
    registry.register({ adapter: new MeAdapter(), priority: 75 });
    // HWP 어댑터 활성화 (API 필요: http://localhost:5000)
    registry.register({ adapter: new HwpAdapter(), priority: 60 });
    adapterRegistryRef.current = registry;
  }
  const adapterRegistry = adapterRegistryRef.current!;

  const providers = React.useMemo(
    () => storageManager.listProviders(),
    [storageManager]
  );

  const [documentModel, setDocumentModel] =
    React.useState<DocumentModel>(demoDocument);
  const [activeTool, setActiveTool] = React.useState<
    "highlight" | "underline" | "note"
  >("highlight");
  const [rootElement, setRootElement] = React.useState<HTMLElement | null>(
    null
  );
  const [selectedRange, setSelectedRange] =
    React.useState<DocumentRange | null>(null);
  const [selectedText, setSelectedText] = React.useState("");
  const [bundleName, setBundleName] = React.useState("demo");
  const [providerId, setProviderId] = React.useState(
    () => providers[0]?.id ?? "memory"
  );
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const sidebarRef = React.useRef<HTMLElement | null>(null);
  const annotationCardRefs = React.useRef(new Map<string, HTMLElement>());

  // Realtime 연결 (콘솔에서 joined/presence/update 이벤트 확인용)
  React.useEffect(() => {
    // 서버 URL은 필요 시 환경변수/설정으로 치환
    const serverUrl = "ws://localhost:7071/ws";
    // presence 룸을 탭 간 동일하게 유지하기 위해 고정 roomId 사용
    const documentId = "demo-document";

    // 이전 연결 종료
    if (realtimeRef.current) {
      realtimeRef.current.disconnect();
      realtimeRef.current = null;
    }

    const client = new RealtimeClient({
      serverUrl,
      documentId,
      user: DEMO_AUTHOR,
      onOpen: () => {
        console.log("[realtime] connected");
      },
      onClose: () => {
        console.log("[realtime] disconnected");
      },
      onMessage: (msg) => {
        // 기본 로그 (joined, presence:update, annotation:*, note:*)
        console.log("[realtime] message:", msg);
        if (msg?.type === "joined" && msg.clientId) {
          currentClientIdRef.current = msg.clientId;
        }
        if (msg?.type === "presence:update" && Array.isArray(msg.users)) {
          setPresenceUsers(msg.users);
        }
        // 다른 사용자가 문서를 로드한 경우 자동으로 동일한 문서 로드
        if (msg?.type === "document:load" && msg.clientId && msg.clientId !== currentClientIdRef.current && msg.document) {
          try {
            // DocumentModel 복원
            const loadedDocument: DocumentModel = {
              ...msg.document,
              metadata: msg.document.metadata ? {
                ...msg.document.metadata,
                createdAt: msg.document.metadata.createdAt ? new Date(msg.document.metadata.createdAt) : undefined,
                modifiedAt: msg.document.metadata.modifiedAt ? new Date(msg.document.metadata.modifiedAt) : undefined,
              } : undefined,
            };
            annotationService.deserialize(EMPTY_STATE);
            setDocumentModel(loadedDocument);
            setStatusMessage(`${msg.document.metadata?.title || "문서"}가 다른 사용자에 의해 로드되었습니다.`);
            setErrorMessage(null);
          } catch (error) {
            console.error("문서 동기화 실패:", error);
            setStatusMessage(`${msg.document.metadata?.title || "문서"} 로드 중 오류가 발생했습니다.`);
          }
        }
        // 다른 사용자의 어노테이션/메모 이벤트 처리 (자신의 이벤트는 무시)
        if (msg?.clientId && msg.clientId !== currentClientIdRef.current) {
          if (msg?.type === "annotation:add" && msg.payload) {
            try {
              const payload = msg.payload;
              // 이미 존재하는 어노테이션인지 확인
              const existing = annotationService.listAnnotations().find(a => a.id === payload.id);
              if (existing) {
                return; // 이미 존재하면 무시
              }
              
              if (payload.type === "highlight") {
                annotationService.createHighlight(payload.range, {
                  id: payload.id,
                  style: payload.style,
                  author: payload.author,
                  createdAt: payload.createdAt,
                });
              } else if (payload.type === "underline") {
                annotationService.createUnderline(payload.range, {
                  id: payload.id,
                  style: payload.style,
                  author: payload.author,
                  createdAt: payload.createdAt,
                });
              }
            } catch (error) {
              console.error("어노테이션 추가 실패:", error);
            }
          } else if (msg?.type === "annotation:remove" && msg.payload?.id) {
            try {
              annotationService.removeAnnotation(msg.payload.id);
            } catch (error) {
              console.error("어노테이션 삭제 실패:", error);
            }
          } else if (msg?.type === "note:add" && msg.payload) {
            try {
              const payload = msg.payload;
              // 이미 존재하는 메모인지 확인
              const existing = annotationService.listNotes().find(n => n.id === payload.id);
              if (existing) {
                return; // 이미 존재하면 무시
              }
              
              annotationService.addNote(payload.annotationId, {
                id: payload.id,
                content: payload.content,
                author: payload.author,
                createdAt: payload.createdAt,
              });
            } catch (error) {
              console.error("메모 추가 실패:", error);
            }
          } else if (msg?.type === "note:update" && msg.payload) {
            try {
              const payload = msg.payload;
              annotationService.updateNote(payload.id, { content: payload.content });
            } catch (error) {
              console.error("메모 업데이트 실패:", error);
            }
          } else if (msg?.type === "note:remove" && msg.payload?.id) {
            try {
              annotationService.removeNote(msg.payload.id);
            } catch (error) {
              console.error("메모 삭제 실패:", error);
            }
          }
        }
      },
      onError: (err) => {
        console.warn("[realtime] error:", err);
      },
    });
    client.connect();
    realtimeRef.current = client;

    return () => {
      client.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (providers.some((provider) => provider.id === providerId)) {
      return;
    }
    if (providers[0]) {
      setProviderId(providers[0].id);
    }
  }, [providers, providerId]);

  const blockTextMap = React.useMemo(() => {
    const map = new Map<string, string>();
    documentModel.blocks.forEach((block) => {
      map.set(block.id, toPlainText(block));
    });
    return map;
  }, [documentModel.blocks]);

  React.useEffect(() => {
    if (documentModel.id !== "demo-document") {
      return;
    }
    if (seededRef.current || annotationService.listAnnotations().length > 0) {
      return;
    }
    seededRef.current = true;

    const highlightRange: DocumentRange = {
      blockId: "block-2",
      startOffset: 17,
      endOffset: 30,
    };
    const highlight = annotationService.createHighlight(highlightRange, {
      style: { color: "rgba(255, 224, 102, 0.7)", label: "핵심 설명" },
      author: { id: "user-1", name: "기획자" },
      notes: [
        {
          content: "문서 모델과 어노테이션이 연결되는 부분",
          author: { id: "user-1", name: "기획자" },
        },
      ],
    });

    annotationService.createUnderline(
      {
        blockId: "block-3",
        startOffset: 4,
        endOffset: 15,
      },
      {
        style: {
          underlineColor: "#38bdf8",
          underlineStyle: "dashed",
          underlineThickness: 2.5,
          label: "사용 흐름",
        },
        author: { id: "user-2", name: "디자이너" },
        notes: [
          {
            content: "사용자 행동 시나리오 강조",
            author: { id: "user-2", name: "디자이너" },
          },
        ],
      }
    );

    if (highlight) {
      annotationService.addNote(highlight.id, {
        content: "하이라이트 영역에 추가 의견 남깁니다.",
        author: { id: "user-3", name: "QA" },
      });
    }
  }, [annotationService, documentModel]);

  // 마우스 이동 시 커서 위치 업데이트 (throttled)
  React.useEffect(() => {
    if (!rootElement) {
      return;
    }

    let lastUpdate = 0;
    const throttleMs = 200; // 200ms마다 업데이트 (더 자주 업데이트)

    const updateCursorPosition = (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate < throttleMs) {
        return;
      }
      lastUpdate = now;

      const target = event.target as HTMLElement | null;
      if (!target) {
        // 타겟이 없으면 커서를 null로 설정
        realtimeRef.current?.send({
          type: "presence:ping",
          user: DEMO_AUTHOR,
          cursor: null,
        });
        return;
      }

      const blockElement = target.closest<HTMLElement>("[data-block-id]");
      if (!blockElement) {
        // 블록 요소가 없으면 커서를 null로 설정
        realtimeRef.current?.send({
          type: "presence:ping",
          user: DEMO_AUTHOR,
          cursor: null,
        });
        return;
      }

      const blockId = blockElement.dataset.blockId;
      if (!blockId) {
        return;
      }

      // 마우스 위치에서 가장 가까운 텍스트 오프셋 계산
      try {
        // document.caretRangeFromPoint 사용 (표준 API)
        const range = (window.document as any).caretRangeFromPoint?.(event.clientX, event.clientY);
        if (!range) return;

        const textNode = range.startContainer;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

        const offset = range.startOffset || 0;

        // 블록 내의 모든 텍스트 노드를 순회하여 오프셋 계산
        const walker = window.document.createTreeWalker(
          blockElement,
          NodeFilter.SHOW_TEXT,
          null
        );
        let totalOffset = 0;
        let found = false;
        
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (node === textNode) {
            totalOffset += offset;
            found = true;
            break;
          }
          totalOffset += node.length;
        }

        if (found) {
          const cursorData = { blockId, offset: totalOffset };
          realtimeRef.current?.send({
            type: "presence:ping",
            user: DEMO_AUTHOR,
            cursor: cursorData,
          });
        } else {
          // 텍스트 노드를 찾지 못한 경우에도 블록 시작 위치로 커서 전송
          const cursorData = { blockId, offset: 0 };
          realtimeRef.current?.send({
            type: "presence:ping",
            user: DEMO_AUTHOR,
            cursor: cursorData,
          });
        }
      } catch (e) {
        // caretRangeFromPoint가 지원되지 않는 경우 블록 시작 위치로 커서 전송
        const cursorData = { blockId, offset: 0 };
        realtimeRef.current?.send({
          type: "presence:ping",
          user: DEMO_AUTHOR,
          cursor: cursorData,
        });
      }
    };

    rootElement.addEventListener("mousemove", updateCursorPosition, { passive: true });
    return () => {
      rootElement.removeEventListener("mousemove", updateCursorPosition);
    };
  }, [rootElement]);

  React.useEffect(() => {
    if (!rootElement) {
      return;
    }
    const findBlockElement = (node: Node | null): HTMLElement | null => {
      let current: Node | null = node;
      while (current) {
        if (current instanceof HTMLElement && current.dataset.blockId) {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    };

    const updateSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectedRange(null);
        setSelectedText("");
        // presence ping (선택 해제)
        realtimeRef.current?.send({
          type: "presence:ping",
          user: DEMO_AUTHOR,
        });
        return;
      }

      const range = selection.getRangeAt(0).cloneRange();
      if (!rootElement.contains(range.commonAncestorContainer)) {
        setSelectedRange(null);
        setSelectedText("");
        return;
      }

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
        const blockElement = startBlock;
        
        // 블록의 실제 텍스트 내용 가져오기 (blockTextMap 사용)
        const blockText = blockTextMap.get(blockId) ?? "";
        
        // 블록 내의 모든 텍스트 노드를 순회하여 정확한 오프셋 계산
        // .document-viewer__block-content 내부의 텍스트 노드를 찾기
        const blockContent = blockElement.querySelector<HTMLElement>(
          ".document-viewer__block-content"
        ) || blockElement;
        
        const walker = window.document.createTreeWalker(
          blockContent,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        let startOffset = 0;
        let endOffset = 0;
        let currentOffset = 0;
        let startFound = false;
        let endFound = false;
        
        // 텍스트 노드 목록 수집
        const textNodes: Text[] = [];
        while (walker.nextNode()) {
          textNodes.push(walker.currentNode as Text);
        }
        
        // 각 텍스트 노드를 순회하며 오프셋 계산
        for (const node of textNodes) {
          const nodeLength = node.length;
          
          // 시작 노드 찾기
          if (!startFound) {
            if (node === range.startContainer) {
              // startContainer가 텍스트 노드인 경우
              startOffset = currentOffset + range.startOffset;
              startFound = true;
            } else if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
              // startContainer가 요소 노드인 경우
              // 해당 요소가 이 텍스트 노드를 포함하는지 확인
              if ((range.startContainer as Element).contains(node)) {
                // 요소 내부의 텍스트 노드들을 순회하여 range.startOffset 위치 찾기
                const innerWalker = window.document.createTreeWalker(
                  range.startContainer,
                  NodeFilter.SHOW_TEXT,
                  null
                );
                let innerOffset = 0;
                let foundInInner = false;
                
                while (innerWalker.nextNode()) {
                  const innerNode = innerWalker.currentNode as Text;
                  if (innerNode === node) {
                    // range.startOffset이 요소 노드의 자식 인덱스인 경우를 처리
                    // 요소의 자식 노드들을 순회하여 텍스트 오프셋으로 변환
                    const childNodes = Array.from(range.startContainer.childNodes);
                    let textOffsetBeforeStart = 0;
                    
                    // range.startOffset이 0이면 첫 번째 자식 노드의 시작이므로 텍스트 오프셋도 0
                    if (range.startOffset === 0) {
                      startOffset = currentOffset;
                    } else {
                      for (let i = 0; i < Math.min(range.startOffset, childNodes.length); i++) {
                        const child = childNodes[i];
                        if (child.nodeType === Node.TEXT_NODE) {
                          textOffsetBeforeStart += (child as Text).length;
                        } else {
                          const childWalker = window.document.createTreeWalker(
                            child,
                            NodeFilter.SHOW_TEXT,
                            null
                          );
                          while (childWalker.nextNode()) {
                            textOffsetBeforeStart += (childWalker.currentNode as Text).length;
                          }
                        }
                      }
                      startOffset = currentOffset + Math.max(0, textOffsetBeforeStart - innerOffset);
                    }
                    startFound = true;
                    foundInInner = true;
                    break;
                  }
                  innerOffset += innerNode.length;
                }
                
                if (!foundInInner) {
                  currentOffset += nodeLength;
                }
              } else {
                currentOffset += nodeLength;
              }
            } else {
              currentOffset += nodeLength;
            }
          }
          
          // 끝 노드 찾기
          if (!endFound) {
            if (node === range.endContainer) {
              // endContainer가 텍스트 노드인 경우
              endOffset = currentOffset + range.endOffset;
              endFound = true;
              break;
            } else if (range.endContainer.nodeType === Node.ELEMENT_NODE) {
              // endContainer가 요소 노드인 경우
              if ((range.endContainer as Element).contains(node)) {
                const innerWalker = window.document.createTreeWalker(
                  range.endContainer,
                  NodeFilter.SHOW_TEXT,
                  null
                );
                let innerOffset = 0;
                let foundInInner = false;
                
                while (innerWalker.nextNode()) {
                  const innerNode = innerWalker.currentNode as Text;
                  if (innerNode === node) {
                    const childNodes = Array.from(range.endContainer.childNodes);
                    let textOffsetBeforeEnd = 0;
                    
                    if (range.endOffset === 0) {
                      endOffset = currentOffset;
                    } else {
                      for (let i = 0; i < Math.min(range.endOffset, childNodes.length); i++) {
                        const child = childNodes[i];
                        if (child.nodeType === Node.TEXT_NODE) {
                          textOffsetBeforeEnd += (child as Text).length;
                        } else {
                          const childWalker = window.document.createTreeWalker(
                            child,
                            NodeFilter.SHOW_TEXT,
                            null
                          );
                          while (childWalker.nextNode()) {
                            textOffsetBeforeEnd += (childWalker.currentNode as Text).length;
                          }
                        }
                      }
                      endOffset = currentOffset + Math.max(0, textOffsetBeforeEnd - innerOffset);
                    }
                    endFound = true;
                    foundInInner = true;
                    break;
                  }
                  innerOffset += innerNode.length;
                }
                
                if (endFound) break;
                if (startFound && !foundInInner) {
                  currentOffset += nodeLength;
                }
              } else if (startFound) {
                currentOffset += nodeLength;
              }
            } else if (startFound) {
              currentOffset += nodeLength;
            }
          }
        }
        
        // fallback: Range를 사용한 계산 (텍스트 노드를 찾지 못한 경우)
        // range.startContainer나 range.endContainer가 요소 노드일 수 있음
        if (!startFound || !endFound) {
          // 블록의 시작부터 range의 시작까지의 텍스트 길이 계산
          const rangeForStart = range.cloneRange();
          rangeForStart.selectNodeContents(blockElement);
          rangeForStart.setEnd(range.startContainer, range.startOffset);
          
          // rangeForStart 내의 텍스트 노드들을 순회하여 정확한 길이 계산
          // toString()은 정확하지 않을 수 있으므로 텍스트 노드를 직접 순회
          if (!startFound) {
            const startWalker = window.document.createTreeWalker(
              blockElement,
              NodeFilter.SHOW_TEXT,
              null
            );
            let startTextLength = 0;
            let foundStartNode = false;
            
            while (startWalker.nextNode()) {
              const n = startWalker.currentNode as Text;
              
              // rangeForStart의 끝 지점과 비교
              const testRange = window.document.createRange();
              testRange.selectNodeContents(blockElement);
              testRange.setStart(n, 0);
              testRange.setEnd(n, n.length);
              
              const endPoint = rangeForStart.cloneRange();
              endPoint.collapse(false);
              
              const comparison = testRange.compareBoundaryPoints(Range.START_TO_START, endPoint);
              
              if (comparison < 0) {
                // n이 rangeForStart의 끝 지점 이전에 있음
                startTextLength += n.length;
              } else if (comparison === 0) {
                // n이 rangeForStart의 끝 지점과 같음
                if (n === range.startContainer) {
                  startTextLength += range.startOffset;
                } else {
                  // 요소 노드 내부의 텍스트 노드인 경우
                  // range.startOffset이 요소의 자식 인덱스일 수 있으므로
                  // 요소 내부의 텍스트 노드들을 순회하여 정확한 오프셋 계산
                  const parentElement = range.startContainer as Element;
                  const childNodes = Array.from(parentElement.childNodes);
                  let textOffsetInParent = 0;
                  
                  for (let i = 0; i < Math.min(range.startOffset, childNodes.length); i++) {
                    const child = childNodes[i];
                    if (child.nodeType === Node.TEXT_NODE) {
                      textOffsetInParent += (child as Text).length;
                    } else {
                      const childWalker = window.document.createTreeWalker(
                        child,
                        NodeFilter.SHOW_TEXT,
                        null
                      );
                      while (childWalker.nextNode()) {
                        textOffsetInParent += (childWalker.currentNode as Text).length;
                      }
                    }
                  }
                  
                  // n이 요소 내부의 몇 번째 텍스트 노드인지 찾기
                  const parentWalker = window.document.createTreeWalker(
                    parentElement,
                    NodeFilter.SHOW_TEXT,
                    null
                  );
                  let textOffsetInParent2 = 0;
                  while (parentWalker.nextNode()) {
                    const innerNode = parentWalker.currentNode as Text;
                    if (innerNode === n) {
                      startTextLength += Math.max(0, textOffsetInParent - textOffsetInParent2);
                      foundStartNode = true;
                      break;
                    }
                    textOffsetInParent2 += innerNode.length;
                  }
                  
                  if (!foundStartNode) {
                    startTextLength += n.length;
                  }
                }
                foundStartNode = true;
                break;
              } else {
                // n이 rangeForStart의 끝 지점 이후에 있음
                break;
              }
            }
            
            if (!foundStartNode) {
              // toString()을 fallback으로 사용
              startOffset = rangeForStart.toString().length;
            } else {
              startOffset = startTextLength;
            }
          }

          const rangeForEnd = range.cloneRange();
          rangeForEnd.selectNodeContents(blockElement);
          rangeForEnd.setEnd(range.endContainer, range.endOffset);
          
          if (!endFound) {
            const endWalker = window.document.createTreeWalker(
              blockElement,
              NodeFilter.SHOW_TEXT,
              null
            );
            let endTextLength = 0;
            let foundEndNode = false;
            
            while (endWalker.nextNode()) {
              const n = endWalker.currentNode as Text;
              
              const testRange = window.document.createRange();
              testRange.selectNodeContents(blockElement);
              testRange.setStart(n, 0);
              testRange.setEnd(n, n.length);
              
              const endPoint = rangeForEnd.cloneRange();
              endPoint.collapse(false);
              
              const comparison = testRange.compareBoundaryPoints(Range.START_TO_START, endPoint);
              
              if (comparison < 0) {
                endTextLength += n.length;
              } else if (comparison === 0) {
                if (n === range.endContainer) {
                  endTextLength += range.endOffset;
                } else {
                  const parentElement = range.endContainer as Element;
                  const childNodes = Array.from(parentElement.childNodes);
                  let textOffsetInParent = 0;
                  
                  for (let i = 0; i < Math.min(range.endOffset, childNodes.length); i++) {
                    const child = childNodes[i];
                    if (child.nodeType === Node.TEXT_NODE) {
                      textOffsetInParent += (child as Text).length;
                    } else {
                      const childWalker = window.document.createTreeWalker(
                        child,
                        NodeFilter.SHOW_TEXT,
                        null
                      );
                      while (childWalker.nextNode()) {
                        textOffsetInParent += (childWalker.currentNode as Text).length;
                      }
                    }
                  }
                  
                  const parentWalker = window.document.createTreeWalker(
                    parentElement,
                    NodeFilter.SHOW_TEXT,
                    null
                  );
                  let textOffsetInParent2 = 0;
                  while (parentWalker.nextNode()) {
                    const innerNode = parentWalker.currentNode as Text;
                    if (innerNode === n) {
                      endTextLength += Math.max(0, textOffsetInParent - textOffsetInParent2);
                      foundEndNode = true;
                      break;
                    }
                    textOffsetInParent2 += innerNode.length;
                  }
                  
                  if (!foundEndNode) {
                    endTextLength += n.length;
                  }
                }
                foundEndNode = true;
                break;
              } else {
                break;
              }
            }
            
            if (!foundEndNode) {
              endOffset = rangeForEnd.toString().length;
            } else {
              endOffset = endTextLength;
            }
          }
        }
        
        // 계산된 오프셋이 블록 텍스트 길이를 초과하지 않도록 보정
        startOffset = Math.max(0, Math.min(startOffset, blockText.length));
        endOffset = Math.max(startOffset, Math.min(endOffset, blockText.length));

        if (startOffset === endOffset) {
          setSelectedRange(null);
          setSelectedText("");
          realtimeRef.current?.send({
            type: "presence:ping",
            user: DEMO_AUTHOR,
          });
          return;
        }

        const text = blockTextMap.get(blockId) ?? "";
        setSelectedRange({
          blockId,
          startOffset,
          endOffset,
        });
        setSelectedText(text.slice(startOffset, endOffset));

        // presence ping (커서/선택 공유)
        realtimeRef.current?.send({
          type: "presence:ping",
          user: DEMO_AUTHOR,
          cursor: { blockId, offset: startOffset },
          selection: { blockId, start: startOffset, end: endOffset },
        });
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
  }, [rootElement, blockTextMap]);

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

  const handleApplySelection = React.useCallback(() => {
    if (!selectedRange) {
      return;
    }

    let annotationId: string | null = null;
    let annotation: any = null;
    
    if (activeTool === "highlight") {
      annotation = annotationService.createHighlight(selectedRange, {
        style: { color: "rgba(250, 204, 21, 0.6)", label: "사용자 지정" },
        author: DEMO_AUTHOR,
      });
      annotationId = annotation.id;
      
      // realtime으로 어노테이션 추가 이벤트 전송
      realtimeRef.current?.send({
        type: "annotation:add",
        payload: {
          id: annotation.id,
          range: annotation.range,
          type: annotation.type,
          style: annotation.style,
          author: annotation.author,
          createdAt: annotation.createdAt,
        },
      });
    } else if (activeTool === "underline") {
      annotation = annotationService.createUnderline(selectedRange, {
        style: {
          underlineColor: "#2563eb",
          underlineThickness: 2,
          underlineStyle: "solid",
          label: "사용자 지정",
        },
        author: DEMO_AUTHOR,
      });
      annotationId = annotation.id;
      
      // realtime으로 어노테이션 추가 이벤트 전송
      realtimeRef.current?.send({
        type: "annotation:add",
        payload: {
          id: annotation.id,
          range: annotation.range,
          type: annotation.type,
          style: annotation.style,
          author: annotation.author,
          createdAt: annotation.createdAt,
        },
      });
    } else {
      annotation = annotationService.createHighlight(selectedRange, {
        style: { color: "rgba(14, 165, 233, 0.25)", label: "메모" },
        author: DEMO_AUTHOR,
      });
      const content = window
        .prompt("메모 내용을 입력하세요", selectedText)
        ?.trim();
      if (content) {
        const note = annotationService.addNote(annotation.id, {
          content,
          author: DEMO_AUTHOR,
        });
        
        if (!note) {
          return;
        }
        
        // realtime으로 어노테이션 및 메모 추가 이벤트 전송
        realtimeRef.current?.send({
          type: "annotation:add",
          payload: {
            id: annotation.id,
            range: annotation.range,
            type: annotation.type,
            style: annotation.style,
            author: annotation.author,
            createdAt: annotation.createdAt,
          },
        });
        realtimeRef.current?.send({
          type: "note:add",
          payload: {
            id: note.id,
            annotationId: annotation.id,
            content: note.content,
            author: note.author,
            createdAt: note.createdAt,
          },
        });
      } else {
        annotationService.removeAnnotation(annotation.id);
      }
      annotationId = annotation.id;
    }

    if (annotationId) {
      setStatusMessage("선택 영역에 어노테이션이 추가되었습니다.");
      setErrorMessage(null);
    }
    clearSelection();
  }, [
    activeTool,
    annotationService,
    clearSelection,
    selectedRange,
    selectedText,
  ]);

  const renderToolbar = React.useCallback(
    (context: DocumentViewerRenderContext) => (
      <div className="document-viewer__toolbar">
        <div className="document-viewer__toolbar-actions">
          {context.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`document-viewer__toolbar-button${
                action.active ? " document-viewer__toolbar-button--active" : ""
              }`}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="document-viewer__toolbar-spacer" />
        {/* 검색 기능 */}
        <div
          className="document-viewer__search"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginRight: "16px",
          }}
        >
          <input
            type="text"
            placeholder="검색..."
            value={context.searchQuery}
            onChange={(e) => context.search(e.target.value)}
            style={{
              padding: "6px 12px",
              fontSize: "14px",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              borderRadius: "6px",
              background: "var(--document-viewer-surface)",
              color: "var(--document-viewer-text)",
              minWidth: "200px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                  context.goToPreviousSearch();
                } else {
                  context.goToNextSearch();
                }
              } else if (e.key === "Escape") {
                context.search("");
              }
            }}
          />
          {context.searchResults.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: "var(--document-viewer-text-muted)",
              }}
            >
              <span>
                {context.currentSearchIndex + 1} /{" "}
                {context.searchResults.length}
              </span>
              <button
                type="button"
                onClick={context.goToPreviousSearch}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: "4px",
                  background: "transparent",
                  color: "var(--document-viewer-text)",
                  cursor: "pointer",
                }}
                title="이전 결과 (Ctrl+Enter)"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={context.goToNextSearch}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: "4px",
                  background: "transparent",
                  color: "var(--document-viewer-text)",
                  cursor: "pointer",
                }}
                title="다음 결과 (Enter)"
              >
                ↓
              </button>
            </div>
          )}
        </div>
        <div className="document-viewer__toolbar-secondary">
          <button
            type="button"
            className="document-viewer__toolbar-button"
            onClick={handleApplySelection}
            disabled={!selectedRange}
          >
            선택 적용
          </button>
          <button
            type="button"
            className="document-viewer__toolbar-button"
            onClick={clearSelection}
            disabled={!selectedRange}
          >
            선택 해제
          </button>
          <span className="document-viewer__selection-preview">
            {selectedRange
              ? `선택: “${truncate(selectedText, 48)}” (${
                  selectedText.length
                }자)`
              : "선택된 텍스트 없음"}
          </span>
          <span className="document-viewer__toolbar-hint">
            단축키: Ctrl+1 (형광펜), Ctrl+2 (밑줄), Ctrl+S (저장)
          </span>
        </div>
      </div>
    ),
    [handleApplySelection, clearSelection, selectedRange, selectedText]
  );

  // 메모 검색 하이라이트 함수
  const highlightNote = React.useCallback(
    (content: string, query: string): React.ReactNode => {
      if (!query.trim()) {
        return content;
      }
      const regex = new RegExp(
        `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "gi"
      );
      const parts = content.split(regex);
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{ background: "rgba(250, 204, 21, 0.4)", padding: "0 2px" }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      );
    },
    []
  );

  const renderSidebar = React.useCallback(
    (context: DocumentViewerRenderContext) => {
      // 메모 검색 필터링
      let filteredAnnotations = context.snapshot.annotations;
      if (context.noteSearchQuery.trim()) {
        const query = context.noteSearchQuery.trim().toLowerCase();
        const notesByAnnotation = new Map<string, AnnotationNote[]>();
        context.snapshot.notes.forEach((note) => {
          const list = notesByAnnotation.get(note.annotationId) ?? [];
          list.push(note);
          notesByAnnotation.set(note.annotationId, list);
        });

        filteredAnnotations = context.snapshot.annotations.filter(
          (annotation) => {
            // 어노테이션의 excerpt 검색
            const excerpt = context.getExcerpt(annotation);
            if (excerpt.toLowerCase().includes(query)) {
              return true;
            }
            // 메모 내용 검색
            const notes = notesByAnnotation.get(annotation.id) ?? [];
            return notes.some((note) =>
              note.content.toLowerCase().includes(query)
            );
          }
        );
      }

      if (!filteredAnnotations.length && !context.snapshot.annotations.length) {
        return (
          <aside className="document-viewer__sidebar">
            <h2>메모 & 하이라이트</h2>
            {/* 메모 검색 입력 */}
            <div style={{ marginBottom: "16px", padding: "0 12px" }}>
              <input
                type="text"
                placeholder="메모 검색..."
                value={context.noteSearchQuery}
                onChange={(e) => context.setNoteSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "14px",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: "6px",
                  background: "var(--document-viewer-surface)",
                  color: "var(--document-viewer-text)",
                }}
              />
            </div>
            <p className="document-viewer__empty">
              아직 등록된 어노테이션이 없습니다.
            </p>
          </aside>
        );
      }

      if (!filteredAnnotations.length) {
        return (
          <aside className="document-viewer__sidebar">
            <h2>메모 & 하이라이트</h2>
            {/* 메모 검색 입력 */}
            <div style={{ marginBottom: "16px", padding: "0 12px" }}>
              <input
                type="text"
                placeholder="메모 검색..."
                value={context.noteSearchQuery}
                onChange={(e) => context.setNoteSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "14px",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: "6px",
                  background: "var(--document-viewer-surface)",
                  color: "var(--document-viewer-text)",
                }}
              />
            </div>
            <p className="document-viewer__empty">검색 결과가 없습니다.</p>
          </aside>
        );
      }

      const notesByAnnotation = new Map<string, AnnotationNote[]>();
      context.snapshot.notes.forEach((note) => {
        const list = notesByAnnotation.get(note.annotationId) ?? [];
        list.push(note);
        notesByAnnotation.set(note.annotationId, list);
      });

      const latestNote = context.snapshot.notes.at(-1);

      return (
        <aside
          ref={(element) => {
            sidebarRef.current = element;
          }}
          className="document-viewer__sidebar"
        >
          <h2>메모 & 하이라이트</h2>
          {/* 메모 검색 입력 */}
          <div style={{ marginBottom: "16px", padding: "0 12px" }}>
            <input
              type="text"
              placeholder="메모 검색..."
              value={context.noteSearchQuery}
              onChange={(e) => context.setNoteSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "6px",
                background: "var(--document-viewer-surface)",
                color: "var(--document-viewer-text)",
              }}
            />
          </div>
          <div className="document-viewer__note-card">
            <header className="document-viewer__note-header">
              <span className="document-viewer__note-badge">SUMMARY</span>
              <span>
                총 {context.snapshot.annotations.length}개의 어노테이션
              </span>
            </header>
            <p className="document-viewer__note-excerpt">
              최신 메모: {latestNote?.content ?? "등록된 메모가 아직 없습니다."}
            </p>
          </div>
          {filteredAnnotations.map((annotation, index) => {
            const notes = notesByAnnotation.get(annotation.id) ?? [];
            const excerpt = context.getExcerpt(annotation);
            const location = context.getAnnotationLocation(annotation.id);

            // excerpt를 최대 길이로 제한하고 "..." 추가
            // getExcerpt가 이미 블록의 텍스트를 추출하므로, excerpt가 비어있으면 기본 텍스트 사용
            let displayText = "";
            if (excerpt && excerpt.trim().length > 0) {
              displayText =
                excerpt.trim().length > 60
                  ? excerpt.trim().substring(0, 60) + "..."
                  : excerpt.trim();
            } else {
              // excerpt가 없으면 기본 텍스트
              displayText = annotation.type === "highlight" ? "형광펜" : "밑줄";
            }

            const handleHeaderClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              if (context.scrollToAnnotation) {
                context.scrollToAnnotation(annotation.id);
              }
            };

            return (
              <div
                key={annotation.id}
                ref={(element) => {
                  if (element) {
                    annotationCardRefs.current.set(annotation.id, element);
                  } else {
                    annotationCardRefs.current.delete(annotation.id);
                  }
                }}
                className="document-viewer__note-card"
              >
                <header className="document-viewer__note-header">
                  <div
                    className="document-viewer__note-title"
                    onClick={handleHeaderClick}
                    style={{ cursor: "pointer" }}
                    title="클릭하여 해당 위치로 이동"
                  >
                    {displayText}
                  </div>
                  <div className="document-viewer__note-location">
                    {typeof location.line === "number" && location.line > 0 ? (
                      <span className="document-viewer__note-location-text">
                        {typeof location.page === "number" && location.page >= 0
                          ? `페이지 ${location.page + 1} `
                          : ""}
                        {location.line}줄
                      </span>
                    ) : null}
                  </div>
                  <div className="document-viewer__note-actions">
                    {annotation.author?.name && (
                      <span>{annotation.author.name}</span>
                    )}
                    <button
                      type="button"
                      className="document-viewer__note-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("어노테이션을 삭제하시겠습니까?")) {
                          context.annotationService.removeAnnotation(annotation.id);
                          
                          // realtime으로 어노테이션 삭제 이벤트 전송
                          realtimeRef.current?.send({
                            type: "annotation:remove",
                            payload: {
                              id: annotation.id,
                            },
                          });
                        }
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </header>
                <ul className="document-viewer__notes-list">
                  {notes
                    .filter((note) => {
                      if (!context.noteSearchQuery.trim()) {
                        return true;
                      }
                      return note.content
                        .toLowerCase()
                        .includes(context.noteSearchQuery.trim().toLowerCase());
                    })
                    .map((note) => (
                      <li key={note.id} onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "8px",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <strong>{note.author?.name ?? "익명"}</strong>
                            <span>
                              {highlightNote(
                                note.content,
                                context.noteSearchQuery
                              )}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newContent = window.prompt(
                                  "메모를 수정하세요",
                                  note.content
                                );
                                if (newContent !== null && newContent.trim()) {
                                  const updatedContent = newContent.trim();
                                  context.updateNote(note.id, updatedContent);
                                  
                                  // realtime으로 메모 업데이트 이벤트 전송
                                  realtimeRef.current?.send({
                                    type: "note:update",
                                    payload: {
                                      id: note.id,
                                      content: updatedContent,
                                    },
                                  });
                                }
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                border: "none",
                                background: "rgba(148, 163, 184, 0.2)",
                                color: "var(--document-viewer-text)",
                                cursor: "pointer",
                              }}
                              title="편집"
                            >
                              편집
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm("메모를 삭제하시겠습니까?")
                                ) {
                                  context.removeNote(note.id);
                                  
                                  // realtime으로 메모 삭제 이벤트 전송
                                  realtimeRef.current?.send({
                                    type: "note:remove",
                                    payload: {
                                      id: note.id,
                                    },
                                  });
                                }
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                border: "none",
                                background: "rgba(239, 68, 68, 0.2)",
                                color: "var(--document-viewer-text)",
                                cursor: "pointer",
                              }}
                              title="삭제"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
                <div
                  className="document-viewer__note-form"
                  onClick={(e) => e.stopPropagation()}
                >
                  <textarea
                    className="document-viewer__note-input"
                    placeholder="메모를 입력하세요"
                    value={context.noteDrafts[annotation.id] ?? ""}
                    onChange={(event) =>
                      context.setNoteDraft(annotation.id, event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="document-viewer__note-submit"
                    onClick={() => {
                      const content = context.noteDrafts[annotation.id] ?? "";
                      if (content.trim()) {
                        const note = context.annotationService.addNote(annotation.id, {
                          content: content.trim(),
                          author: DEMO_AUTHOR,
                        });
                        
                        if (!note) {
                          return;
                        }
                        
                        // realtime으로 메모 추가 이벤트 전송
                        realtimeRef.current?.send({
                          type: "note:add",
                          payload: {
                            id: note.id,
                            annotationId: annotation.id,
                            content: note.content,
                            author: note.author,
                            createdAt: note.createdAt,
                          },
                        });
                        
                        context.setNoteDraft(annotation.id, "");
                      }
                    }}
                  >
                    메모 추가
                  </button>
                </div>
              </div>
            );
          })}
        </aside>
      );
    },
    [highlightNote]
  );

  const makeTarget = React.useCallback((): DocumentStorageTarget => {
    const name = bundleName.trim() || "document";
    return {
      uri: `${providerId}://${name}`,
      provider: providerId,
      name,
    };
  }, [bundleName, providerId]);

  const handleSave = React.useCallback(async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const target = makeTarget();
      const annotations = annotationService.serialize();
      const bundle: DocumentBundle = {
        document: documentModel,
        annotations,
        version: 1,
        metadata: {
          id: target.uri,
          name: bundleName.trim() || "document",
          updatedAt: Date.now(),
        },
      };
      await storageManager.save(target, bundle, {
        includeAnnotations: true,
      });
      setStatusMessage(`저장 완료: ${target.uri}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "저장에 실패했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    annotationService,
    bundleName,
    documentModel,
    makeTarget,
    storageManager,
  ]);

  const handleLoad = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const target = makeTarget();
      const result = await storageManager.load(target, {
        withAnnotations: true,
      });
      const annotations =
        (result.bundle.annotations as SerializedAnnotationState | undefined) ??
        EMPTY_STATE;
      annotationService.deserialize(annotations);
      setDocumentModel(normalizeDocument(result.bundle.document));
      setStatusMessage(`불러오기 완료: ${target.uri}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "불러오기에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, [annotationService, makeTarget, storageManager]);

  const handlePickFile = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
        setErrorMessage(
          `지원하지 않는 파일 형식입니다: .${extension} (현재 지원: .txt, .docx, .me, .md, .pdf, .hwp)`
        );
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        const model = await parser.parse({
          buffer,
          descriptor,
        });
        annotationService.deserialize(EMPTY_STATE);
        const newModel = {
          ...model,
          id: `txt-${Date.now()}`,
          metadata: {
            ...model.metadata,
            title: file.name,
            author: model.metadata?.author ?? DEMO_AUTHOR.name,
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
        };
        setDocumentModel(newModel);
        setStatusMessage(`${file.name} 불러오기 완료`);
        setErrorMessage(null);
        
        // 다른 사용자에게 문서 내용 브로드캐스트 (DocumentModel 직렬화)
        realtimeRef.current?.send({
          type: "document:load",
          documentId: "demo-document",
          document: JSON.parse(JSON.stringify(newModel)), // 깊은 복사 및 직렬화
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
    [annotationService, adapterRegistry]
  );

  // 어노테이션 클릭 시 사이드바로 스크롤
  const handleAnnotationClick = React.useCallback((annotationId: string) => {
    const cardElement = annotationCardRefs.current.get(annotationId);
    if (cardElement && sidebarRef.current) {
      cardElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      // 하이라이트 효과
      cardElement.style.outline = "2px solid rgba(59, 130, 246, 0.6)";
      cardElement.style.outlineOffset = "4px";
      cardElement.style.transition = "outline 0.3s ease";
      setTimeout(() => {
        cardElement.style.outline = "";
        cardElement.style.outlineOffset = "";
      }, 2000);
    }
  }, []);

  // 메모 카드 클릭 시 문서 영역으로 스크롤
  // 주의: DocumentViewer 내부에서 페이지네이션을 고려한 handleScrollToAnnotation이 구현되어 있으므로
  // 이 함수는 페이지네이션이 비활성화된 경우에만 사용됩니다.
  // 페이지네이션이 활성화된 경우 DocumentViewer의 내부 handleScrollToAnnotation이 자동으로 처리합니다.
  const handleScrollToAnnotation = React.useCallback(
    (annotationId: string) => {
      // DocumentViewer의 내부 handleScrollToAnnotation이 페이지네이션을 고려하여 처리하므로
      // 여기서는 별도 처리가 필요 없습니다. 다만, 페이지네이션이 비활성화된 경우를 대비한 fallback입니다.
      const annotation = annotationService
        .listAnnotations()
        .find((a) => a.id === annotationId);
      if (!annotation || !rootElement) {
        return;
      }

      const blockElement = rootElement.querySelector<HTMLElement>(
        `[data-block-id="${annotation.range.blockId}"]`
      );
      if (!blockElement) {
        return;
      }

      // 어노테이션이 있는 span 요소 찾기
      const annotationSpans = Array.from(
        blockElement.querySelectorAll<HTMLElement>("[data-annotation-id]")
      );
      const targetSpan = annotationSpans.find(
        (span) => span.dataset.annotationId === annotationId
      );

      if (targetSpan) {
        targetSpan.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        // 하이라이트 효과
        const originalBg = targetSpan.style.backgroundColor;
        targetSpan.style.backgroundColor = "rgba(59, 130, 246, 0.4)";
        targetSpan.style.transition = "background-color 0.5s ease";
        setTimeout(() => {
          targetSpan.style.backgroundColor = originalBg;
        }, 1500);
      } else {
        // span을 찾지 못하면 block으로 스크롤
        blockElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    [annotationService, rootElement]
  );

  // 키보드 단축키: Ctrl+1 (형광펜), Ctrl+2 (밑줄), Ctrl+S (저장)
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
        // Ctrl+S는 저장이므로 텍스트 영역에서도 허용
        if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          handleSave();
        }
        return;
      }

      // Ctrl+1: 형광펜 도구로 전환 후 선택 적용
      if ((event.ctrlKey || event.metaKey) && event.key === "1") {
        event.preventDefault();
        setActiveTool("highlight");
        if (selectedRange && selectedText) {
          setTimeout(() => handleApplySelection(), 0);
        } else {
          setStatusMessage("텍스트를 먼저 선택하세요 (Alt + 드래그)");
        }
        return;
      }

      // Ctrl+2: 밑줄 도구로 전환 후 선택 적용
      if ((event.ctrlKey || event.metaKey) && event.key === "2") {
        event.preventDefault();
        setActiveTool("underline");
        if (selectedRange && selectedText) {
          setTimeout(() => handleApplySelection(), 0);
        } else {
          setStatusMessage("텍스트를 먼저 선택하세요 (Alt + 드래그)");
        }
        return;
      }

      // Ctrl+S: 저장
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedRange, selectedText, handleApplySelection, handleSave]);

  const renderHeader = React.useCallback(
    (context: DocumentViewerRenderContext) => (
      <div className="document-viewer__header">
        <div>
          <h1 className="document-viewer__title">
            {context.document.metadata?.title ?? "제목 없는 문서"}
          </h1>
          {context.document.metadata?.description && (
            <p className="document-viewer__subtitle">
              {context.document.metadata.description}
            </p>
          )}
          {/* 접속자 표시 */}
          <div
            style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              접속자: {presenceUsers.length}명
            </span>
            {presenceUsers.map((u) => (
              <span
                key={u.clientId}
                style={{
                  fontSize: 12,
                  padding: "2px 6px",
                  borderRadius: 12,
                  background: "rgba(59, 130, 246, 0.15)",
                }}
                title={new Date(u.lastSeen).toLocaleString("ko-KR")}
              >
                {u.user?.name ?? "익명"}
              </span>
            ))}
          </div>
          <div className="document-viewer__metadata">
            {context.document.metadata?.author && (
              <span>작성자: {context.document.metadata.author}</span>
            )}
            {context.document.metadata?.modifiedAt && (
              <span>
                수정일:{" "}
                {new Date(context.document.metadata.modifiedAt).toLocaleString(
                  "ko-KR"
                )}
              </span>
            )}
            {context.document.metadata?.createdAt && (
              <span>
                생성일:{" "}
                {new Date(context.document.metadata.createdAt).toLocaleString(
                  "ko-KR"
                )}
              </span>
            )}
          </div>
        </div>
        <div className="document-viewer__header-controls">
          <div className="document-viewer__file-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.docx,.hwp,.me,.md,.markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/x-hwp,text/markdown,text/x-markdown"
              hidden
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="document-viewer__toolbar-button"
              onClick={handlePickFile}
            >
              문서 열기 (.txt, .docx, .me, .md, .hwp)
            </button>
          </div>
          <div className="document-viewer__storage-form">
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            <input
              value={bundleName}
              onChange={(event) => setBundleName(event.target.value)}
              placeholder="저장 이름"
            />
            <button
              type="button"
              className="document-viewer__toolbar-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              className="document-viewer__toolbar-button"
              onClick={handleLoad}
              disabled={isLoading}
            >
              {isLoading ? "불러오는 중..." : "불러오기"}
            </button>
          </div>
          {statusMessage && (
            <span className="document-viewer__status document-viewer__status--success">
              {statusMessage}
            </span>
          )}
          {errorMessage && (
            <span className="document-viewer__status document-viewer__status--error">
              {errorMessage}
            </span>
          )}
        </div>
      </div>
    ),
    [
      bundleName,
      errorMessage,
      handleFileChange,
      handleLoad,
      handlePickFile,
      handleSave,
      isLoading,
      isSaving,
      providers,
      providerId,
      statusMessage,
    ]
  );

  // 페이지네이션 설정
  const paginationConfig = React.useMemo(
    () => ({
      enabled: true, // 페이지네이션 활성화
      blocksPerPage: 15, // 한 페이지에 표시할 블록 수 (기본값: 15)
      useDocumentPageBreaks: true, // 문서의 페이지 브레이크 정보 사용 (HWP 등)
      showPageNumbers: true, // 페이지 번호 표시
      showNavigation: true, // 페이지 네비게이션 표시
    }),
    []
  );

  // 메모 추가 핸들러 (realtime 이벤트 전송)
  const handleAddNote = React.useCallback(
    (annotationId: string, content: string) => {
      const note = annotationService.addNote(annotationId, {
        content: content.trim(),
        author: DEMO_AUTHOR,
      });
      
      if (!note) {
        return;
      }
      
      // realtime으로 메모 추가 이벤트 전송
      realtimeRef.current?.send({
        type: "note:add",
        payload: {
          id: note.id,
          annotationId,
          content: note.content,
          author: note.author,
          createdAt: note.createdAt,
        },
      });
    },
    [annotationService]
  );

  return (
    <DocumentViewer
      document={documentModel}
      annotationService={annotationService}
      actions={actions}
      pagination={paginationConfig}
      presenceUsers={presenceUsers}
      currentClientId={currentClientIdRef.current}
      renderHeader={renderHeader}
      renderToolbar={renderToolbar}
      renderSidebar={renderSidebar}
      theme={{
        background: "#080c16",
        accent: "#2563eb",
        highlightColor: "rgba(250, 204, 21, 0.6)",
      }}
      onRootRef={setRootElement}
      onAnnotationClick={handleAnnotationClick}
      scrollToAnnotation={handleScrollToAnnotation}
      onAddNote={handleAddNote}
    />
  );
}
