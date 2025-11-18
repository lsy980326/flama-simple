# 저장/불러오기 파이프라인 설계

## 목표

- 문서(`DocumentModel`)와 어노테이션(`SerializedAnnotationState`)을 묶어 일관된 번들 형태로 관리
- 다양한 저장소(로컬 파일, IndexedDB, 원격 API 등)를 플러그인 형태로 연결
- 대용량 자산(이미지, 폰트) 분리 저장 및 스트리밍 고려
- 협업/버전 관리 확장성 확보

## 데이터 구조

### DocumentBundle

```ts
interface DocumentBundle {
  document: DocumentModel;
  annotations?: SerializedAnnotationState;
  assets?: DocumentAsset[];
  metadata?: DocumentBundleMetadata;
  version: number;
}
```

- `document`: 파서 결과물
- `annotations`: 어노테이션 직렬화 결과
- `assets`: 이미지/폰트/부속 파일
- `metadata`: 작성자, 설명, 버전 등
- `version`: 저장 포맷 버전(마이그레이션에 사용)

### DocumentAsset

- `type`: `binary`/`image`/`font`/`custom`
- `mimeType`, `data`, `size`, `name`
- 추가 메타데이터로 썸네일, 해시 등 기록

### DocumentStorageProvider

```ts
interface DocumentStorageProvider {
  id: string;
  label: string;
  capabilities: DocumentStorageProviderCapabilities;
  canHandle(target: DocumentStorageTarget): boolean;
  save(...): Promise<DocumentStorageResult>;
  load(...): Promise<DocumentBundleImportResult>;
  list?(...): Promise<DocumentStorageListResult>;
  delete?(target): Promise<void>;
}
```

- 저장소별 구현(예: `local-file`, `indexeddb`, `s3`, `rest-api`)
- `capabilities`로 기능 지원 여부를 선언
- `target.uri` 스킴 기반으로 `canHandle` 판단 (`file://`, `memory://`, `s3://` 등)

## DocumentStorageManager

- Provider 등록/해제/조회
- 저장/불러오기 시 대상 URI로 Provider 자동 선택
- `SaveDocumentOptions`에서 어노테이션 포함 여부 설정
- 향후 프로그래스 콜백, AbortSignal, 버전 관리 확장 가능

```ts
const manager = new DocumentStorageManager({ defaultProviderId: "local" });
manager.registerProvider(new LocalFileProvider());

await manager.save(
  { uri: "file://demo-document" },
  { document, version: 1 },
  { annotations: annotationService.serialize() }
);
```

## 흐름

1. 문서/어노테이션 편집 후 `DocumentBundle` 구성
2. `DocumentStorageManager.save` 호출
3. Provider가 번들을 직렬화(예: JSON + 바이너리)하여 저장
4. 로드 시 `DocumentBundleImportResult` 반환
5. `AnnotationService.deserialize`로 어노테이션 복원

## 커스터마이징 포인트

- 번들 버전 마이그레이션 전략 (ex. `version` 필드 확인 후 변환)
- 자산 압축/압축해제 (zip, tar, custom)
- 증분 저장 지원 (capabilities에서 `supportsIncrementalSave`)
- 협업 모드: 버전 해시/리비전 메타데이터 활용, 충돌 해결 정책 추가

## TODO

- 표준 JSON 스키마 문서화
- 샘플 Provider 구현 (`LocalMemoryProvider`, `FileSystemAccessProvider`)
- 테스트 케이스: 저장/로드 시 어노테이션/자산 무결성 검증

## 샘플 구현

- `MemoryStorageProvider`: 세션 내 메모리에 번들을 저장. 테스트/데모 용도.
- `IndexedDBStorageProvider`: 브라우저 IndexedDB에 구조화 저장.
- 둘 다 `DocumentStorageManager`에 등록하여 사용하며, URI 스킴(`memory://`, `indexeddb://`)으로 구분한다.

