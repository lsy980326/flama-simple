import { DocumentLayoutInfo, DocumentRange } from "../documents/types";

export type AnnotationType = "highlight" | "underline";

export interface AnnotationStyle {
  color?: string;
  opacity?: number;
  underlineColor?: string;
  underlineStyle?: "solid" | "dashed" | "dotted";
  underlineThickness?: number;
  label?: string;
}

export interface AnnotationAuthor {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface AnnotationEntry {
  id: string;
  type: AnnotationType;
  range: DocumentRange;
  style?: AnnotationStyle;
  author?: AnnotationAuthor;
  createdAt: number;
  updatedAt: number;
  notes: string[];
  meta?: Record<string, unknown>;
  layout?: DocumentLayoutInfo[];
}

export interface AnnotationNote {
  id: string;
  annotationId: string;
  content: string;
  author?: AnnotationAuthor;
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, unknown>;
}

export interface SerializedAnnotationState {
  version: number;
  annotations: Omit<AnnotationEntry, "layout">[];
  notes: AnnotationNote[];
}

export interface AnnotationSnapshot {
  annotations: AnnotationEntry[];
  notes: AnnotationNote[];
}

export type AnnotationSubscriber = (snapshot: AnnotationSnapshot) => void;

export interface AnnotationServiceOptions {
  idGenerator?: () => string;
  onError?: (error: unknown) => void;
}

