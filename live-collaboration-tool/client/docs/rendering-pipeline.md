# 렌더링 파이프라인 & 어노테이션 연동

## 핵심 구성 요소

- `DocumentEngine`: 문서 열기/닫기, 어댑터 선택 로직
- `DocumentRenderer`: 문서 모델을 화면에 표현
- `RenderHandle`: 뷰 상태 제어, 어노테이션/하이라이트 좌표 제공
- `AnnotationService`: 하이라이트/밑줄/메모 관리 (추후 모듈)

## 단계별 흐름

1. **파일 로딩**
   - `DocumentEngine.open(file)` 호출
   - 파서 어댑터가 `DocumentModel` 생성

2. **렌더링 초기화**
   - 엔진이 렌더러 어댑터 선택 (`canRender`)
   - `renderer.render(model, surface, options)` 호출 → `RenderHandle` 획득

3. **레이아웃 동기화**
   - 렌더러는 내부적으로 레이아웃 트리 생성
   - 텍스트 런 단위로 DOMRect 목록을 계산/캐시
   - `RenderHandle.queryLayout(range)`로 특정 범위 좌표 반환

4. **어노테이션 인터랙션**
   - `AnnotationService`가 UI 이벤트로부터 좌표 획득
   - `RenderHandle.mapPointToRange(point)`로 텍스트 범위 역매핑
   - 하이라이트/밑줄 데이터 저장 후 렌더러에 델타 적용 (`update`)

5. **변경 감지**
   - 문서가 수정되면 `RenderHandle.update(range, diff)`
   - 어노테이션 영역 재계산을 위해 `observeLayoutChange`로 콜백 등록

6. **자원 정리**
   - 문서 닫을 때 `RenderHandle.dispose()` 호출
   - 엔진이 어댑터 인스턴스 정리, 이벤트 핸들러 해제

## 어노테이션 통합 API 제안

- `AnnotationService.attach(handle: RenderHandle)`
- `AnnotationService.highlight(range, style)`
- `AnnotationService.addNote(range, noteContent)`
- `AnnotationService.listNotes()` → 위치/내용 반환
- `AnnotationService.serialize()` / `deserialize()`

## 이벤트 흐름

| 이벤트 | 발생 주체 | 설명 |
| --- | --- | --- |
| `layout:ready` | 렌더러 | 초기 레이아웃 계산 완료 |
| `layout:change` | 렌더러 | 특정 범위의 레이아웃 변경 |
| `selection:change` | UI | 사용자가 드래그하여 텍스트 선택 |
| `annotation:create` | 어노테이션 서비스 | 신규 하이라이트/메모 생성 |

## 향후 확장 포인트

- 다중 페이지 지원: 페이지 단위 렌더 표준화 (`pageIndex` 필드 추가)
- 거친 좌표 → 정밀 좌표 스냅핑 전략
- 서버 동기화를 위한 OT/CRDT 통합

