import {
  DocumentAdapter,
  DocumentAdapterRegistry,
  DocumentModel,
  ParserInput,
  RenderHandle,
  RenderSurface,
} from "../documents/types";
import { TxtAdapter } from "../documents/adapters/TxtAdapter";
import { DocxAdapter } from "../documents/adapters/DocxAdapter";
import { MeAdapter } from "../documents/adapters/MeAdapter";
import { HwpAdapter } from "../documents/adapters/HwpAdapter";

/**
 * PDF는 워커/번들 의존성 이슈가 잦아 레지스트리에는 lazy adapter로만 등록합니다.
 * 실제 업로드/렌더링 시점에만 `PdfAdapter.ts`를 동적 import 합니다.
 */
class PdfLazyAdapter implements DocumentAdapter {
  readonly id = "pdf";
  readonly label = "PDF Document Adapter (lazy)";
  readonly supportedExtensions = ["pdf"];
  readonly supportedMimes = ["application/pdf"];

  private impl: DocumentAdapter | null = null;

  canHandle(descriptor: { extension?: string; mimeType?: string }): boolean {
    const extension = descriptor.extension?.toLowerCase();
    const mimeType = descriptor.mimeType?.toLowerCase();
    if (extension && this.supportedExtensions.includes(extension)) return true;
    if (mimeType && this.supportedMimes.includes(mimeType)) return true;
    return false;
  }

  canRender(_model: DocumentModel): boolean {
    return true;
  }

  private async getImpl(): Promise<DocumentAdapter> {
    if (this.impl) return this.impl;
    const mod = await import("../documents/adapters/PdfAdapter");
    this.impl = new mod.PdfAdapter();
    return this.impl;
  }

  async parse(input: ParserInput): Promise<DocumentModel> {
    const impl = await this.getImpl();
    return await impl.parse(input);
  }

  async render(model: DocumentModel, surface: RenderSurface): Promise<RenderHandle> {
    const impl = await this.getImpl();
    return await impl.render(model, surface);
  }
}

/**
 * 기본 어댑터 레지스트리를 생성하고 등록합니다.
 * 
 * 지원하는 파일 형식:
 * - .txt (우선순위: 100)
 * - .docx (우선순위: 80)
 * - .me, .md (우선순위: 75)
 * - .pdf (우선순위: 70)
 * - .hwp (우선순위: 60, API 필요: http://localhost:5000)
 * 
 * @returns 설정된 DocumentAdapterRegistry 인스턴스
 */
export function createDefaultAdapterRegistry(): DocumentAdapterRegistry {
  const registry = new DocumentAdapterRegistry();
  registry.register({ adapter: new TxtAdapter(), priority: 100 });
  registry.register({ adapter: new DocxAdapter(), priority: 80 });
  registry.register({ adapter: new MeAdapter(), priority: 75 });
  registry.register({ adapter: new PdfLazyAdapter(), priority: 70 });
  registry.register({ adapter: new HwpAdapter(), priority: 60 });
  return registry;
}

