# 문서 포맷 어댑터 설계

## 개요

- 목적: 서로 다른 문서 포맷을 `DocumentModel`과 `DocumentRenderer`에 매핑
- 구성: 파서(Parser) + 렌더러(Renderer) 결합 형태의 `DocumentAdapter`
- 등록: `DocumentAdapterRegistry`에 우선순위와 함께 등록

## 공통 흐름

1. 입력 파일 메타데이터 확인 (`extension`, `mimeType`)
2. 어댑터 선택 (`canHandle`)
3. 바이너리 → `DocumentModel` 변환 (`parse`)
4. 모델 → 뷰 렌더링 (`render`)
5. 하이라이트/주석을 위한 레이아웃 정보 제공 (`RenderHandle.queryLayout`)

## 포맷별 설계

### 1. HWP (`.hwp`)

- **외부 의존성**: `hwp.js`(오픈소스) 또는 커스텀 파서
- **파싱 전략**
  - 한글 전용 바이너리 포맷 → 내부 구조 분석
  - 문단/문장 단위 분해 후 `DocumentParagraphBlock`으로 매핑
  - 스타일 정보(글꼴/크기/색상) → `TextStyle`
  - 표/그림 → `DocumentTableBlock`, `DocumentImageBlock`
- **제약/주의**
  - 특수 스타일(세로쓰기, 각주 등) → `metadata.custom`에 저장
  - 대용량 파일 대비 스트리밍 파싱 고려
- **렌더링**
  - 기본: 캔버스 기반 텍스트 레이아웃
  - 한글 글꼴 적용, 줄바꿈 규칙 준수
  - 주석 위치 계산을 위한 글자 단위 bounding box 저장

### 2. 텍스트 (`.txt`)

- **외부 의존성**: 없음 (UTF-8 or user-specified 인코딩)
- **파싱 전략**
  - 줄 단위 분할 → `DocumentParagraphBlock` 목록
  - 인코딩 감지 필요 시 `encoding-japanese` 등 사용 가능
- **렌더링**
  - DOM 기반 `pre` 스타일 렌더링 또는 Canvas 텍스트 렌더러
  - 단순 구조이므로 하이라이트 계산 용이

### 3. DOCX (`.docx`, Microsoft Word)

- **외부 의존성**: `docx` 또는 `y-docx` 등 zip 기반 파서
- **파싱 전략**
  - ZIP 해제 후 `document.xml` 등 XML 파싱
  - `w:p`, `w:r` → 문단/텍스트 런으로 매핑
  - 스타일/테마 반영 → `TextStyle`, `DocumentMetadata`
  - 표(`w:tbl`), 이미지(`w:drawing`) 처리 → `resources.images`
- **렌더링**
  - DOM + CSS 레이아웃 또는 Canvas 기반 레이아웃 엔진
  - 페이지 구획, 머리말/바닥말은 옵션으로 지원
- **추가 고려**
  - 주석/변경 추적 → 추후 확장

### 4. ME (`.me`)

- **가정**: 내부 전용 포맷 (예: Markdown-like 또는 JSON)  
- **파싱 전략**
  - 포맷 정의에 따라 커스텀 파서 구현
  - Markdown 스타일이라면 `remark`/`markdown-it` 활용
  - JSON 기반이라면 직접 `DocumentModel`로 매핑
- **렌더링**
  - Markdown → HTML 변환 후 DOM 렌더
  - JSON → 문단/블록 매핑
  - 커스텀 블록(`DocumentCustomBlock`) 적극 활용

## 오류 처리 및 폴백

- 파싱 실패 시 커스텀 에러 (`DocumentParseError`) 던지기
- 미지원 포맷은 사용자 피드백 제공
- 단순 텍스트 폴백: 바이너리를 텍스트로 시도 후 `DocumentModel` 구성

## 테스트 전략

- 각 어댑터별 샘플 파일로 스냅샷 테스트
- 파싱 결과 → `DocumentModel` 검증
- 렌더러 → 비주얼 리그레션 테스트(스토리북/Playwright)
- 하이라이트/주석 좌표 → 단위 테스트로 검증

