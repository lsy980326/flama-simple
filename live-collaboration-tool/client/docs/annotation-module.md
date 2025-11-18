# 어노테이션 모듈 설계

## 핵심 목표

- 문서 뷰어와 분리된 독립 라이브러리로 하이라이트/밑줄/메모 관리
- `DocumentModel` / `RenderHandle`과 느슨한 결합
- 저장/불러오기, 이벤트 구독, 메모 집계 기능 제공

## 주요 타입

- `AnnotationType`: `"highlight"` \| `"underline"`
- `AnnotationEntry`: 범위(`DocumentRange`), 스타일, 작성자, 메모 ID 목록 등
- `AnnotationNote`: 작성자/내용/타임스탬프
- `AnnotationSnapshot`: 어노테이션 + 메모 컬렉션
- `SerializedAnnotationState`: 저장용 JSON 포맷 (버전 관리)

## AnnotationService

| 메서드 | 설명 |
| --- | --- |
| `attach(handle)` | 렌더 핸들 연동, 레이아웃 감시 시작 |
| `detach()` | 관찰자 해제 |
| `createHighlight(range, options)` | 형광펜 생성 |
| `createUnderline(range, options)` | 밑줄 생성 |
| `updateAnnotationRange(id, range)` | 범위 업데이트 |
| `addNote(id, note)` | 메모 추가 |
| `listAnnotations()` | 어노테이션 목록 |
| `listNotes()` | 메모 목록 |
| `serialize()` / `deserialize()` | 저장/복원 |
| `subscribe(listener)` | 상태 변경 구독 |

### 옵션

```ts
createHighlight(range, {
  style: { color, label, underlineColor, ... },
  author: { id, name },
  notes: [{ content, author }]
})
```

## 레이아웃 관찰

- `RenderHandle.queryLayout(range)` 결과를 `AnnotationEntry.layout`에 저장
- `RenderHandle.observeLayoutChange(range, callback)`로 DOM 변경 추적
- 렌더 미연결 상태에서도 데이터 조작 가능 (레이아웃은 추후 계산)

## 데모 화면

- `?view=doc` 쿼리 파라미터로 접근 (`DocumentViewerDemo`)
- 단일 문서 모델을 렌더해 하이라이트/밑줄/메모 기능 시연
- 메모 입력 폼과 목록 제공, 레이아웃은 간단한 DOM 기반

## 추후 확장 포인트

- 협업 동기화(OT/CRDT) 연동
- 주석 유형 확장 (자유 그리기, 박스 주석 등)
- 권한/필터링 모델 (사용자별 가시성)
- 서버 저장소 연동을 위한 Adapter 설계

