import React from "react";
import { DocumentViewerWithUpload } from "../../../live-collaboration-tool/client/src/lib";
import { useDemoUser } from "./demoUser";

/**
 * 문서 뷰어 기본 사용 예제
 *
 * 파일 업로드, 어노테이션, 텍스트 선택 등 모든 기능이
 * 컴포넌트 내부에서 자동으로 처리됩니다.
 */
export function DocumentViewerExample() {
  const user = useDemoUser("user-doc", "문서 뷰어 사용자");

  return (
    <div style={{ padding: 20 }}>
      <h3>문서 뷰어 예제</h3>
      <p style={{ color: "#666", marginBottom: 16 }}>
        PDF 파일을 포함한 문서 파일을 업로드하고 텍스트를 선택하여 형광펜, 밑줄,
        메모를 추가할 수 있습니다. Ctrl+1 (형광펜), Ctrl+2 (밑줄) 단축키도
        지원합니다.
      </p>
      <DocumentViewerWithUpload user={user} height={600} searchEnabled={true} />
    </div>
  );
}
