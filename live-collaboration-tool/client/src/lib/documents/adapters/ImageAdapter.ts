import {
  DocumentAdapter,
  DocumentModel,
  ParserInput,
  ParserInputDescriptor,
  RenderHandle,
  RenderSurface,
  DocumentRange,
  DocumentLayoutInfo,
  DocumentImageResource,
  DocumentImageBlock,
} from "../types";

// 이미지 파일을 DocumentModel로 변환하는 어댑터
export class ImageAdapter implements DocumentAdapter {
  readonly id = "image";
  readonly label = "이미지 Adapter";
  readonly supportedExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
  readonly supportedMimes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ];

  canHandle(descriptor: ParserInputDescriptor): boolean {
    const extension = descriptor.extension?.toLowerCase();
    const mimeType = descriptor.mimeType?.toLowerCase();
    
    if (extension && this.supportedExtensions.includes(extension)) {
      return true;
    }
    if (mimeType && this.supportedMimes.includes(mimeType)) {
      return true;
    }
    return false;
  }

  async parse(input: ParserInput): Promise<DocumentModel> {
    const { buffer, descriptor } = input;
    const rawName = descriptor.metadata?.name;
    const name = typeof rawName === "string" ? rawName : "이미지";

    // 이미지를 리소스로 저장
    const resourceId = `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // MIME 타입 결정
    const extension = descriptor.extension?.toLowerCase() || "";
    let mimeType = descriptor.mimeType || "image/jpeg";
    if (!mimeType || mimeType === "application/octet-stream") {
      // 확장자로 MIME 타입 추정
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        bmp: "image/bmp",
      };
      mimeType = mimeMap[extension] || "image/jpeg";
    }

    // 이미지 크기 확인
    const imageResource: DocumentImageResource = {
      id: resourceId,
      mimeType,
      data: buffer,
    };

    // 이미지 블록 생성
    const imageBlock: DocumentImageBlock = {
      id: "image-block-0",
      type: "image",
      resourceId,
    };

    return {
      id: `image-${Date.now()}`,
      metadata: {
        title: name,
        description: "이미지 파일",
        createdAt: new Date(),
        modifiedAt: new Date(),
      },
      blocks: [imageBlock],
      resources: {
        images: {
          [resourceId]: imageResource,
        },
      },
    };
  }

  canRender(_model: DocumentModel): boolean {
    return true;
  }

  async render(
    model: DocumentModel,
    surface: RenderSurface
  ): Promise<RenderHandle> {
    // 기본 렌더링 (WebtoonViewer에서 처리)
    return new class implements RenderHandle {
      update(): void {}
      queryLayout(_range: DocumentRange): DocumentLayoutInfo[] {
        return [];
      }
      mapPointToRange(_point: DOMPoint): DocumentRange | null {
        return null;
      }
      observeLayoutChange(
        _range: DocumentRange,
        _callback: (info: DocumentLayoutInfo) => void
      ): () => void {
        return () => undefined;
      }
      dispose(): void {}
    }();
  }
}

