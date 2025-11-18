## 협업 기능 설계 (실시간 동기화, 다중 사용자)

### 목표
- 문서 뷰어의 어노테이션(형광펜/밑줄)과 메모를 실시간으로 동기화
- 다중 사용자 환경에서 충돌 최소화 및 사용자 상태(접속, 커서/선택 영역) 표시

### 아키텍처 개요
- 서버: WebSocket 기반 실시간 허브
  - 문서 단위의 룸(documentId)을 구성하고 해당 룸에 브로드캐스트
  - 이벤트 타입 기반 메시지 라우팅(`annotation:add`, `annotation:update`, `annotation:remove`, `note:add`, `note:update`, `note:remove`, `presence:ping`, `presence:update`)
  - 간단한 메모리 스토어(초기 버전), 이후 영속 스토리지로 확장 가능
- 클라이언트: RealtimeClient
  - 문서 진입 시 `join` → 서버가 현재 스냅샷 또는 증분 이벤트 제공
  - 로컬 변경 발생 시 이벤트 전송, 서버 브로드캐스트 수신 → 로컬 상태 반영

### 메시지 프로토콜 (초안)
- 공통 envelope
```json
{
  "type": "annotation:add",      // 이벤트 타입
  "documentId": "doc-123",
  "clientId": "c-uuid",          // 발신자 식별
  "payload": { /* 타입별 데이터 */ }
}
```

- 이벤트 타입별 payload
1) annotation:add
```json
{
  "id": "ann-uuid",
  "range": { "blockId": "block-1", "startOffset": 10, "endOffset": 35 },
  "style": { "kind": "highlight", "color": "#facc15" },
  "author": { "id": "u1", "name": "홍길동" },
  "createdAt": 1731730000000
}
```
2) annotation:update
```json
{
  "id": "ann-uuid",
  "patch": { "style": { "color": "#22c55e" } },
  "updatedAt": 1731731000000
}
```
3) annotation:remove
```json
{ "id": "ann-uuid" }
```
4) note:add
```json
{
  "id": "note-uuid",
  "annotationId": "ann-uuid",
  "content": "메모 내용",
  "author": { "id": "u1", "name": "홍길동" },
  "createdAt": 1731730000000
}
```
5) note:update
```json
{
  "id": "note-uuid",
  "patch": { "content": "수정된 내용" },
  "updatedAt": 1731731000000
}
```
6) note:remove
```json
{ "id": "note-uuid" }
```
7) presence:ping
```json
{
  "user": { "id": "u1", "name": "홍길동" },
  "cursor": { "blockId": "block-3", "offset": 120 },     // 선택/커서 위치(옵션)
  "selection": { "blockId": "block-2", "start": 10, "end": 24 } // 옵션
}
```
8) presence:update (서버→클라이언트 브로드캐스트)
```json
{
  "users": [
    { "id": "u1", "name": "홍길동", "lastSeen": 1731730005000 },
    { "id": "u2", "name": "이몽룡", "lastSeen": 1731730003000 }
  ]
}
```

### 동기화 전략
- 단순 브로드캐스트(낙관적 UI): 로컬에서 즉시 반영 후 서버 브로드캐스트로 정합성 일치
- 충돌 처리(초기): 최신 타임스탬프 우선(last-write-wins)
  - 향후 CRDT(Y.js 등) 또는 서버 락/버전 관리 도입 가능

### 보안/권한(초안)
- 문서 접근 토큰(JWT) → 서버 연결 시 검증
- 권한 레벨: viewer, commenter, editor
  - viewer: 읽기
  - commenter: 메모 작성 가능
  - editor: 어노테이션/메모 추가/수정/삭제 가능

### 확장 포인트
- 영속 저장소 연동: Postgres + Prisma or MongoDB
- 이력/리플레이: 이벤트 소싱 저장
- 사용자 상태 표시: 온라인 배지, 커서/선택 하이라이트, 타이핑 인디케이터

### 클라이언트 통합 계획
1) RealtimeClient 구현 및 연결 수명주기 관리
2) DocumentViewer에 선택적 `realtime` prop 추가
   - enabled, documentId, user, serverUrl 등
3) AnnotationService/Note 변경 시 realtime 이벤트 발행
4) 서버 브로드캐스트 수신 → AnnotationService에 반영(중복/자기 이벤트 무시)

### MVP 범위
- 서버: 문서 룸, 기본 이벤트 라우팅/브로드캐스트, presence 간단 구현
- 클라이언트: 접속/이탈/핑, annotation/note add/update/remove 동기화(낙관적 UI)


