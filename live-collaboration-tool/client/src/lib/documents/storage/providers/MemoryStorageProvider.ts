import {
  DocumentBundle,
  DocumentBundleExportOptions,
  DocumentBundleImportResult,
  DocumentStorageContext,
  DocumentStorageListOptions,
  DocumentStorageListResult,
  DocumentStorageProvider,
  DocumentStorageProviderCapabilities,
  DocumentStorageResult,
  DocumentStorageTarget,
} from "../../types";

interface MemoryRecord {
  bundle: DocumentBundle;
  revision: string;
  updatedAt: number;
}

const defaultCapabilities: DocumentStorageProviderCapabilities = {
  supportsBinary: true,
  supportsIncrementalSave: false,
  supportsListing: true,
  supportsVersioning: true,
  supportsCollaboration: false,
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export class MemoryStorageProvider implements DocumentStorageProvider {
  readonly id = "memory";
  readonly label = "In-memory Storage";
  readonly capabilities = defaultCapabilities;

  private readonly store = new Map<string, MemoryRecord>();

  canHandle(target: DocumentStorageTarget): boolean {
    if (target.provider) {
      return target.provider === this.id;
    }
    return target.uri.startsWith("memory://");
  }

  async save(
    target: DocumentStorageTarget,
    bundle: DocumentBundle,
    _options?: DocumentBundleExportOptions,
    _context?: DocumentStorageContext
  ): Promise<DocumentStorageResult> {
    const revision = Date.now().toString();
    this.store.set(target.uri, {
      bundle: clone(bundle),
      revision,
      updatedAt: Date.now(),
    });
    return {
      target,
      metadata: bundle.metadata,
      revision,
    };
  }

  async load(
    target: DocumentStorageTarget,
    _options?: never,
    _context?: DocumentStorageContext
  ): Promise<DocumentBundleImportResult> {
    const record = this.store.get(target.uri);
    if (!record) {
      throw new Error(`메모리 저장소에서 ${target.uri} 항목을 찾을 수 없습니다.`);
    }
    return {
      bundle: clone(record.bundle),
    };
  }

  async list(
    _options?: DocumentStorageListOptions,
    _context?: DocumentStorageContext
  ): Promise<DocumentStorageListResult> {
    const entries = Array.from(this.store.entries()).map(([uri, record]) => ({
      target: {
        uri,
        provider: this.id,
      },
      metadata: record.bundle.metadata,
      revision: record.revision,
      sizeBytes: undefined,
      lastOpenedAt: record.updatedAt,
    }));
    return { entries };
  }

  async delete(
    target: DocumentStorageTarget,
    _context?: DocumentStorageContext
  ): Promise<void> {
    this.store.delete(target.uri);
  }
}

