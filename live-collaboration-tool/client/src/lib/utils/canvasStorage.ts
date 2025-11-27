/**
 * 캔버스 상태를 IndexedDB에 저장하고 불러오는 유틸리티
 * TTL(Time To Live) 지원: 3시간 후 자동 만료
 */

const DB_NAME = "CanvasStateStorage";
const STORE_NAME = "canvasStates";
const DB_VERSION = 1;
const TTL_HOURS = 3; // 3시간
const TTL_MS = TTL_HOURS * 60 * 60 * 1000;

interface CanvasStateRecord {
  roomId: string;
  state: string; // JSON 문자열
  timestamp: number; // 저장 시각
  expiresAt: number; // 만료 시각 (timestamp + TTL_MS)
}

/**
 * IndexedDB 데이터베이스 열기
 */
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB를 지원하지 않는 환경입니다.");
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "roomId" });
        // 만료 시각 인덱스 생성 (자동 정리용)
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB 연결에 실패했습니다."));
    };
  });
}

/**
 * 만료된 데이터 정리
 */
async function cleanupExpiredData(): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("expiresAt");
    const now = Date.now();
    
    const range = IDBKeyRange.upperBound(now);
    const request = index.openCursor(range);
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.warn("만료된 데이터 정리 실패:", error);
  }
}

/**
 * 캔버스 상태를 IndexedDB에 저장
 */
export async function saveCanvasStateToIndexedDB(
  roomId: string,
  state: string
): Promise<void> {
  try {
    await cleanupExpiredData();
    
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    const timestamp = Date.now();
    const record: CanvasStateRecord = {
      roomId,
      state,
      timestamp,
      expiresAt: timestamp + TTL_MS,
    };
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("캔버스 상태 저장 실패:", error);
    throw error;
  }
}

/**
 * IndexedDB에서 캔버스 상태 불러오기
 * 3시간이 지났으면 null 반환
 */
export async function loadCanvasStateFromIndexedDB(
  roomId: string
): Promise<string | null> {
  try {
    await cleanupExpiredData();
    
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    
    const record = await new Promise<CanvasStateRecord | null>((resolve, reject) => {
      const request = store.get(roomId);
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
    
    if (!record) {
      return null; // 저장된 상태가 없음
    }
    
    // 만료 확인
    const now = Date.now();
    if (now > record.expiresAt) {
      // 만료되었으면 삭제하고 null 반환
      await deleteCanvasStateFromIndexedDB(roomId);
      return null;
    }
    
    return record.state;
  } catch (error) {
    console.error("캔버스 상태 불러오기 실패:", error);
    return null;
  }
}

/**
 * IndexedDB에서 캔버스 상태 삭제
 */
export async function deleteCanvasStateFromIndexedDB(roomId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(roomId);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("캔버스 상태 삭제 실패:", error);
  }
}

/**
 * 모든 만료된 데이터 정리 (주기적으로 호출 가능)
 */
export async function cleanupAllExpiredData(): Promise<void> {
  await cleanupExpiredData();
}

