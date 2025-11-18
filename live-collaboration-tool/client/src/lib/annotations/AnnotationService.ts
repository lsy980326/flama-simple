import {
  DocumentLayoutInfo,
  DocumentModel,
  DocumentRange,
  RenderHandle,
} from "../documents/types";
import {
  AnnotationEntry,
  AnnotationNote,
  AnnotationServiceOptions,
  AnnotationSnapshot,
  AnnotationSubscriber,
  AnnotationType,
  SerializedAnnotationState,
} from "./types";

const DEFAULT_VERSION = 1;

const defaultIdGenerator = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}`;
};

interface AnnotationLayoutObserver {
  unsubscribe: () => void;
}

export interface CreateAnnotationOptions {
  id?: string; // 지정된 ID 사용 (realtime 동기화용)
  style?: AnnotationEntry["style"];
  author?: AnnotationEntry["author"];
  meta?: AnnotationEntry["meta"];
  notes?: Array<Pick<AnnotationNote, "content" | "author" | "meta">>;
  createdAt?: number; // 지정된 생성 시간 사용 (realtime 동기화용)
}

export class AnnotationService {
  private readonly annotations = new Map<string, AnnotationEntry>();
  private readonly notes = new Map<string, AnnotationNote>();
  private readonly subscribers = new Set<AnnotationSubscriber>();
  private readonly layoutObservers = new Map<string, AnnotationLayoutObserver>();
  private readonly idGenerator: () => string;
  private renderHandle?: RenderHandle;
  private readonly onError?: (error: unknown) => void;

  constructor(options?: AnnotationServiceOptions) {
    this.idGenerator = options?.idGenerator ?? defaultIdGenerator;
    this.onError = options?.onError;
  }

  attach(handle: RenderHandle): void {
    this.detach();
    this.renderHandle = handle;
    this.annotations.forEach((annotation) => {
      this.updateLayout(annotation.id);
      this.registerLayoutObserver(annotation.id);
    });
    this.notify();
  }

  detach(): void {
    this.layoutObservers.forEach(({ unsubscribe }) => {
      try {
        unsubscribe();
      } catch (error) {
        this.reportError(error);
      }
    });
    this.layoutObservers.clear();
    this.renderHandle = undefined;
  }

  createAnnotation(
    type: AnnotationType,
    range: DocumentRange,
    options?: CreateAnnotationOptions
  ): AnnotationEntry {
    const timestamp = options?.createdAt ?? Date.now();
    const id = options?.id ?? this.generateId(type);

    // 이미 존재하는 어노테이션이면 기존 것 반환
    const existing = this.annotations.get(id);
    if (existing) {
      return existing;
    }

    const annotation: AnnotationEntry = {
      id,
      type,
      range,
      style: options?.style,
      author: options?.author,
      createdAt: timestamp,
      updatedAt: timestamp,
      notes: [],
      meta: options?.meta,
    };

    this.annotations.set(id, annotation);
    this.registerLayoutObserver(id);
    this.updateLayout(id);

    options?.notes?.forEach((note) => {
      this.addNote(id, note);
    });

    this.notify();
    return annotation;
  }

  createHighlight(
    range: DocumentRange,
    options?: CreateAnnotationOptions
  ): AnnotationEntry {
    return this.createAnnotation("highlight", range, options);
  }

  createUnderline(
    range: DocumentRange,
    options?: CreateAnnotationOptions
  ): AnnotationEntry {
    return this.createAnnotation("underline", range, options);
  }

  updateAnnotationRange(id: string, range: DocumentRange): void {
    const annotation = this.annotations.get(id);
    if (!annotation) {
      return;
    }
    annotation.range = range;
    annotation.updatedAt = Date.now();
    this.updateLayout(id);
    this.notify();
  }

  updateAnnotationStyle(
    id: string,
    style: AnnotationEntry["style"]
  ): void {
    const annotation = this.annotations.get(id);
    if (!annotation) {
      return;
    }
    annotation.style = style;
    annotation.updatedAt = Date.now();
    this.notify();
  }

  removeAnnotation(id: string): void {
    const annotation = this.annotations.get(id);
    if (!annotation) {
      return;
    }

    annotation.notes.forEach((noteId) => {
      this.notes.delete(noteId);
    });

    this.annotations.delete(id);
    this.unregisterLayoutObserver(id);
    this.notify();
  }

  addNote(
    annotationId: string,
    noteInput: Pick<AnnotationNote, "content" | "author" | "meta"> & { id?: string; createdAt?: number }
  ): AnnotationNote | undefined {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) {
      return undefined;
    }

    const timestamp = noteInput.createdAt ?? Date.now();
    const noteId = noteInput.id ?? this.generateId("note");
    
    // 이미 존재하는 메모면 기존 것 반환
    const existing = this.notes.get(noteId);
    if (existing) {
      return existing;
    }

    const note: AnnotationNote = {
      id: noteId,
      annotationId,
      content: noteInput.content,
      author: noteInput.author,
      meta: noteInput.meta,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.notes.set(note.id, note);
    annotation.notes.push(note.id);
    annotation.updatedAt = timestamp;

    this.notify();
    return note;
  }

  updateNote(
    noteId: string,
    updates: Partial<Pick<AnnotationNote, "content" | "meta">>
  ): void {
    const note = this.notes.get(noteId);
    if (!note) {
      return;
    }
    if (updates.content !== undefined) {
      note.content = updates.content;
    }
    if (updates.meta !== undefined) {
      note.meta = updates.meta;
    }
    note.updatedAt = Date.now();
    const annotation = this.annotations.get(note.annotationId);
    if (annotation) {
      annotation.updatedAt = Date.now();
    }
    this.notify();
  }

  removeNote(noteId: string): void {
    const note = this.notes.get(noteId);
    if (!note) {
      return;
    }
    const annotation = this.annotations.get(note.annotationId);
    if (annotation) {
      annotation.notes = annotation.notes.filter((id) => id !== noteId);
      annotation.updatedAt = Date.now();
    }
    this.notes.delete(noteId);
    this.notify();
  }

  listAnnotations(): AnnotationEntry[] {
    return Array.from(this.annotations.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  listNotes(): AnnotationNote[] {
    return Array.from(this.notes.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  subscribe(listener: AnnotationSubscriber): () => void {
    this.subscribers.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  serialize(): SerializedAnnotationState {
    return {
      version: DEFAULT_VERSION,
      annotations: this.listAnnotations().map(({ layout, ...rest }) => rest),
      notes: this.listNotes(),
    };
  }

  deserialize(
    serialized: SerializedAnnotationState,
    model?: DocumentModel
  ): void {
    if (!serialized || serialized.version !== DEFAULT_VERSION) {
      throw new Error("지원되지 않는 어노테이션 버전입니다.");
    }

    this.clear();

    serialized.annotations.forEach((annotation) => {
      const restored: AnnotationEntry = {
        ...annotation,
        layout: undefined,
        notes: [...annotation.notes],
      };
      this.annotations.set(annotation.id, restored);
    });

    serialized.notes.forEach((note) => {
      this.notes.set(note.id, { ...note });
    });

    if (model && this.renderHandle) {
      this.annotations.forEach((annotation) => {
        this.updateLayout(annotation.id);
        this.registerLayoutObserver(annotation.id);
      });
    }

    this.notify();
  }

  clear(): void {
    this.detach();
    this.annotations.clear();
    this.notes.clear();
    this.notify();
  }

  private getSnapshot(): AnnotationSnapshot {
    return {
      annotations: this.listAnnotations(),
      notes: this.listNotes(),
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    this.subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        this.reportError(error);
      }
    });
  }

  private generateId(seed?: string): string {
    if (seed) {
      return `${seed}-${this.idGenerator()}`;
    }
    return this.idGenerator();
  }

  private updateLayout(annotationId: string): void {
    const annotation = this.annotations.get(annotationId);
    if (!annotation || !this.renderHandle) {
      return;
    }
    try {
      const layout = this.renderHandle.queryLayout(annotation.range);
      annotation.layout = layout;
    } catch (error) {
      this.reportError(error);
    }
  }

  private registerLayoutObserver(annotationId: string): void {
    this.unregisterLayoutObserver(annotationId);
    const annotation = this.annotations.get(annotationId);
    if (!annotation || !this.renderHandle) {
      return;
    }
    try {
      const unsubscribe = this.renderHandle.observeLayoutChange(
        annotation.range,
        (info: DocumentLayoutInfo) => {
          const target = this.annotations.get(annotationId);
          if (!target) {
            return;
          }
          target.layout = [info];
          this.notify();
        }
      );
      this.layoutObservers.set(annotationId, { unsubscribe });
    } catch (error) {
      this.reportError(error);
    }
  }

  private unregisterLayoutObserver(annotationId: string): void {
    const observer = this.layoutObservers.get(annotationId);
    if (observer) {
      try {
        observer.unsubscribe();
      } catch (error) {
        this.reportError(error);
      }
      this.layoutObservers.delete(annotationId);
    }
  }

  private reportError(error: unknown): void {
    if (this.onError) {
      this.onError(error);
    } else {
      console.warn("AnnotationService error", error);
    }
  }
}

