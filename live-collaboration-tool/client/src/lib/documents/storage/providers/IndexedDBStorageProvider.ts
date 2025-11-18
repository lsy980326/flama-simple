import {
  DocumentBundle,
  DocumentBundleExportOptions,
  DocumentBundleImportResult,
  DocumentBundleMetadata,
  DocumentStorageContext,
  DocumentStorageListOptions,
  DocumentStorageListResult,
  DocumentStorageProvider,
  DocumentStorageProviderCapabilities,
  DocumentStorageResult,
  DocumentStorageTarget,
} from "../../types";

const DB_NAME = "DocumentViewerStorage";
const STORE_NAME = "bundles";
const DB_VERSION = 1;

interface IndexedBundleRecord {
  uri: string;
  bundle: DocumentBundle;
  metadata?: DocumentBundleMetadata;
  revision: string;
  updatedAt: number;
}

const capabilities: DocumentStorageProviderCapabilities = {
  supportsBinary: true,
  supportsIncrementalSave: false,
  supportsListing: true,
  supportsVersioning: true,
  supportsCollaboration: false,
};

const cloneBundle = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB를 지원하지 않는 환경입니다.");
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "uri" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB 연결에 실패했습니다."));
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => void
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result: T | undefined;
    try {
      result = fn(store) as T;
    } catch (error) {
      transaction.abort();
      db.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(result as T);
    };
    transaction.onerror = () => {
      const error =
        transaction.error ?? new Error("IndexedDB 트랜잭션이 실패했습니다.");
      db.close();
      reject(error);
    };
  });
}

async function putRecord(record: IndexedBundleRecord): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    store.put(record);
  });
}

async function getRecord(uri: string): Promise<IndexedBundleRecord | undefined> {
  return withStore<Promise<IndexedBundleRecord | undefined>>(
    "readonly",
    (store) =>
      new Promise((resolve, reject) => {
        const request = store.get(uri);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB 조회 실패"));
      })
  );
}

async function deleteRecord(uri: string): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    store.delete(uri);
  });
}

async function getAllRecords(): Promise<IndexedBundleRecord[]> {
  return withStore<Promise<IndexedBundleRecord[]>>("readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB 조회 실패"));
    });
  });
}

export class IndexedDBStorageProvider implements DocumentStorageProvider {
  readonly id = "indexeddb";
  readonly label = "IndexedDB Storage";
  readonly capabilities = capabilities;

  canHandle(target: DocumentStorageTarget): boolean {
    if (target.provider) {
      return target.provider === this.id;
    }
    return (
      target.uri.startsWith("indexeddb://") || target.uri.startsWith("idb://")
    );
  }

  async save(
    target: DocumentStorageTarget,
    bundle: DocumentBundle,
    _options?: DocumentBundleExportOptions,
    _context?: DocumentStorageContext
  ): Promise<DocumentStorageResult> {
    const record: IndexedBundleRecord = {
      uri: target.uri,
      bundle: cloneBundle(bundle),
      metadata: bundle.metadata,
      revision: Date.now().toString(),
      updatedAt: Date.now(),
    };
    await putRecord(record);
    return {
      target,
      metadata: bundle.metadata,
      revision: record.revision,
    };
  }

  async load(
    target: DocumentStorageTarget,
    _options?: never,
    _context?: DocumentStorageContext
  ): Promise<DocumentBundleImportResult> {
    const record = await getRecord(target.uri);
    if (!record) {
      throw new Error(`IndexedDB에서 ${target.uri} 항목을 찾을 수 없습니다.`);
    }
    return {
      bundle: cloneBundle(record.bundle),
    };
  }

  async list(
    _options?: DocumentStorageListOptions,
    _context?: DocumentStorageContext
  ): Promise<DocumentStorageListResult> {
    const records = await getAllRecords();
    return {
      entries: records.map((record) => ({
        target: {
          uri: record.uri,
          provider: this.id,
        },
        metadata: record.metadata,
        revision: record.revision,
        lastOpenedAt: record.updatedAt,
      })),
    };
  }

  async delete(
    target: DocumentStorageTarget,
    _context?: DocumentStorageContext
  ): Promise<void> {
    await deleteRecord(target.uri);
  }
}

