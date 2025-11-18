// 문서 뷰어 모듈을 위한 공통 타입 정의

export type DocumentBlockType =
  | "paragraph"
  | "heading"
  | "list"
  | "table"
  | "image"
  | "custom";

export type TextDecoration =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "highlight";

export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  decorations?: TextDecoration[];
}

export interface TextRun {
  id: string;
  text: string;
  style?: TextStyle;
  metadata?: Record<string, unknown>;
}

export interface DocumentBlockBase {
  id: string;
  type: DocumentBlockType;
  metadata?: Record<string, unknown>;
}

export interface DocumentParagraphBlock extends DocumentBlockBase {
  type: "paragraph" | "heading" | "list";
  runs: TextRun[];
  listLevel?: number;
  listType?: "ordered" | "unordered";
}

export interface DocumentTableCell {
  id: string;
  blocks: DocumentBlock[];
  colspan?: number;
  rowspan?: number;
}

export interface DocumentTableRow {
  id: string;
  cells: DocumentTableCell[];
}

export interface DocumentTableBlock extends DocumentBlockBase {
  type: "table";
  rows: DocumentTableRow[];
}

export interface DocumentImageResource {
  id: string;
  mimeType: string;
  data: ArrayBuffer;
  width?: number;
  height?: number;
  altText?: string;
}

export interface DocumentImageBlock extends DocumentBlockBase {
  type: "image";
  resourceId: string;
  width?: number;
  height?: number;
  caption?: TextRun[];
}

export interface DocumentCustomBlock extends DocumentBlockBase {
  type: "custom";
  data: Record<string, unknown>;
}

export type DocumentBlock =
  | DocumentParagraphBlock
  | DocumentTableBlock
  | DocumentImageBlock
  | DocumentCustomBlock;

export interface DocumentMetadata {
  title?: string;
  description?: string;
  author?: string;
  createdAt?: Date;
  modifiedAt?: Date;
  language?: string;
  pageSize?: {
    width: number;
    height: number;
    unit: "pt" | "mm" | "cm" | "inch";
  };
  custom?: Record<string, unknown>;
}

export interface DocumentResourceMap {
  images?: Record<string, DocumentImageResource>;
  embeds?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

export interface DocumentModel {
  id: string;
  blocks: DocumentBlock[];
  resources?: DocumentResourceMap;
  metadata?: DocumentMetadata;
  raw?: unknown;
  pageBreaks?: number[]; // 페이지 브레이크 인덱스 배열 (각 페이지 브레이크 이후의 첫 번째 블록 인덱스)
}

export interface RenderSurface {
  container: HTMLElement;
  viewport?: HTMLElement;
}

export interface RenderHandle {
  update(range: DocumentRange, diff: Partial<DocumentModel>): void;
  queryLayout(range: DocumentRange): DocumentLayoutInfo[];
  mapPointToRange(point: DOMPoint): DocumentRange | null;
  observeLayoutChange(
    range: DocumentRange,
    callback: (info: DocumentLayoutInfo) => void
  ): () => void;
  dispose(): void;
}

export interface DocumentRange {
  blockId: string;
  startOffset?: number;
  endOffset?: number;
}

export interface DocumentLayoutInfo {
  range: DocumentRange;
  boundingRects: DOMRect[];
}

export interface DocumentParser {
  id: string;
  label: string;
  supportedExtensions: string[];
  supportedMimes?: string[];
  canHandle(input: ParserInputDescriptor): boolean;
  parse(input: ParserInput): Promise<DocumentModel>;
}

export interface DocumentRenderer {
  id: string;
  label: string;
  canRender(model: DocumentModel): boolean;
  render(
    model: DocumentModel,
    surface: RenderSurface,
    options?: RenderOptions
  ): Promise<RenderHandle>;
}

export interface ParserInputDescriptor {
  extension?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ParserInput {
  buffer: ArrayBuffer;
  descriptor: ParserInputDescriptor;
}

export interface RenderOptions {
  theme?: "light" | "dark" | "system";
  zoom?: number;
  readOnly?: boolean;
  experimental?: Record<string, unknown>;
}

export interface DocumentAdapter extends DocumentParser, DocumentRenderer {}

export interface DocumentAdapterRegistration {
  adapter: DocumentAdapter;
  priority?: number;
}

export interface DocumentBundleMetadata {
  id: string;
  name?: string;
  description?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  modifiedBy?: string;
  version?: string;
  extra?: Record<string, unknown>;
}

export interface DocumentAsset {
  id: string;
  type: "binary" | "image" | "font" | "custom";
  mimeType: string;
  data: ArrayBuffer;
  size?: number;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentBundle {
  document: DocumentModel;
  annotations?: unknown;
  assets?: DocumentAsset[];
  metadata?: DocumentBundleMetadata;
  version: number;
}

export interface DocumentBundleExportOptions {
  includeAnnotations?: boolean;
  includeAssets?: boolean;
  flattenResources?: boolean;
  customMetadata?: Record<string, unknown>;
}

export interface DocumentBundleImportResult {
  bundle: DocumentBundle;
  warnings?: string[];
}

export interface DocumentStorageProviderCapabilities {
  supportsBinary?: boolean;
  supportsIncrementalSave?: boolean;
  supportsListing?: boolean;
  supportsVersioning?: boolean;
  supportsCollaboration?: boolean;
  maxBundleSizeBytes?: number;
}

export interface DocumentStorageContext {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  extra?: Record<string, unknown>;
}

export interface DocumentStorageProvider {
  id: string;
  label: string;
  capabilities: DocumentStorageProviderCapabilities;
  canHandle(target: DocumentStorageTarget): boolean;
  save(
    target: DocumentStorageTarget,
    bundle: DocumentBundle,
    options?: DocumentBundleExportOptions,
    context?: DocumentStorageContext
  ): Promise<DocumentStorageResult>;
  load(
    target: DocumentStorageTarget,
    options?: DocumentStorageLoadOptions,
    context?: DocumentStorageContext
  ): Promise<DocumentBundleImportResult>;
  list?(
    options?: DocumentStorageListOptions,
    context?: DocumentStorageContext
  ): Promise<DocumentStorageListResult>;
  delete?(
    target: DocumentStorageTarget,
    context?: DocumentStorageContext
  ): Promise<void>;
}

export interface DocumentStorageTarget {
  uri: string;
  provider?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentStorageLoadOptions {
  withAnnotations?: boolean;
  withAssets?: boolean;
  revision?: string;
  extra?: Record<string, unknown>;
}

export interface DocumentStorageListOptions {
  limit?: number;
  cursor?: string;
  query?: Record<string, unknown>;
}

export interface DocumentStorageEntry {
  target: DocumentStorageTarget;
  metadata?: DocumentBundleMetadata;
  lastOpenedAt?: number;
  revision?: string;
  sizeBytes?: number;
}

export interface DocumentStorageListResult {
  entries: DocumentStorageEntry[];
  nextCursor?: string;
}

export interface DocumentStorageResult {
  target: DocumentStorageTarget;
  metadata?: DocumentBundleMetadata;
  revision?: string;
}

export class DocumentAdapterRegistry {
  private adapters: DocumentAdapterRegistration[] = [];

  register(registration: DocumentAdapterRegistration): void {
    this.adapters.push(registration);
    this.adapters.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  unregister(adapterId: string): void {
    this.adapters = this.adapters.filter(
      ({ adapter }) => adapter.id !== adapterId
    );
  }

  findParser(descriptor: ParserInputDescriptor): DocumentParser | undefined {
    return this.adapters.find(({ adapter }) => adapter.canHandle(descriptor))
      ?.adapter;
  }

  findRenderer(model: DocumentModel): DocumentRenderer | undefined {
    return this.adapters.find(({ adapter }) => adapter.canRender(model))
      ?.adapter;
  }

  listAdapters(): DocumentAdapter[] {
    return this.adapters.map(({ adapter }) => adapter);
  }
}
