# 문서 뷰어 UI & 커스터마이징 가이드

## DocumentViewer 컴포넌트 개요

- 경로: `lib/components/DocumentViewer.tsx`
- 역할: 문서 모델(`DocumentModel`)과 어노테이션(`AnnotationService`)을 결합해 UI 렌더링
- 특징: 그림 그리기 모듈과 유사한 상단 툴바 + 우측 패널 레이아웃, CSS 변수 기반 테마

## 주요 Props

| Prop | 설명 |
| --- | --- |
| `document` | 렌더링할 `DocumentModel` |
| `annotationService` | 하이라이트/메모 상태를 제공하는 `AnnotationService` 인스턴스 |
| `actions` | 툴바 버튼 구성을 위한 `DocumentViewerAction[]` |
| `theme` | `background`, `accent`, `highlightColor` 등 CSS 변수 오버라이드 |
| `renderHeader` | 헤더 커스텀 렌더 함수 |
| `renderToolbar` | 툴바 영역 커스텀 렌더 함수 |
| `renderSidebar` | 사이드바 영역 커스텀 렌더 함수 |
| `renderBlock` | 개별 블록 커스텀 렌더 (고급 사용) |
| `renderHandleFactory` | 맞춤형 `RenderHandle`을 연결하고 싶을 때 옵션 |

## DocumentViewerRenderContext

렌더 함수(`renderToolbar`, `renderSidebar`, `renderBlock`)는 공통 컨텍스트를 받습니다.

```ts
interface DocumentViewerRenderContext {
  document: DocumentModel;
  snapshot: AnnotationSnapshot;
  annotationService: AnnotationService;
  actions: DocumentViewerAction[];
  noteDrafts: Record<string, string>;
  setNoteDraft(id: string, value: string): void;
  addNote(id: string, content: string): void;
  getExcerpt(annotation: AnnotationEntry): string;
}
```

- `addNote`는 기본적으로 `AnnotationService.addNote`를 호출하지만 `DocumentViewer`의 `onAddNote`를 오버라이드하면 외부 저장소 연동 가능
- `getExcerpt`는 어노테이션 범위에 해당하는 텍스트를 반환

## CSS 테마

- 기본 테마는 `DocumentViewer.css`에 정의
- `theme` prop으로 아래 변수들을 덮어쓸 수 있음
  - `--document-viewer-bg`
  - `--document-viewer-surface`
  - `--document-viewer-accent`
  - `--document-viewer-text`
  - `--document-viewer-highlight`
- 추가 커스터마이징은 클래스(`document-viewer__*`) 기반 SCSS/Styled Components로 확장 가능

## Selection/Annotation Hooks

- `onRootRef` prop으로 렌더된 루트 엘리먼트를 제공 → 외부에서 텍스트 선택 범위 계산 가능
- 툴바에서 `renderToolbar`를 사용해 “선택 적용/해제”와 같은 커스텀 액션 구현
- 사이드바 커스터마이징 시 `annotationService.removeAnnotation` 호출로 삭제 버튼 구성

## 데모 (`DocumentViewerDemo.tsx`)

- URL: `http://localhost:3000/?view=doc`
- 특징
  - 툴바: 형광펜/밑줄/메모 버튼 상태 토글 + 힌트 텍스트
  - 사이드바: 요약 카드 + 어노테이션 카드 (메모 입력 폼, 삭제 버튼 포함)
  - 텍스트 선택 후 “선택 적용”으로 형광펜/밑줄/메모 추가
  - 초기 데이터: 예제 텍스트에 기본 하이라이트/밑줄/메모 삽입
- 커스터마이징 예시로 `renderToolbar`, `renderSidebar`, `theme`를 전달
- `.txt` 파일 업로드 → `TxtAdapter`로 파싱 후 뷰어에 표시
- 저장/불러오기 → `MemoryStorageProvider`, `IndexedDBStorageProvider` 데모

## 확장 아이디어

- `actions`에 아이콘 컴포넌트 전달 → 툴바 아이콘 버튼화
- `renderBlock`으로 도식, 표 등 리치 콘텐츠 렌더링
- `renderHandleFactory`로 WebGL/Canvas 기반 렌더러의 레이아웃 계산 값을 재사용
- 사이드바를 `renderSidebar`에서 탭 구조로 확장 (예: 메모 / 히스토리 / 버전 로그)

