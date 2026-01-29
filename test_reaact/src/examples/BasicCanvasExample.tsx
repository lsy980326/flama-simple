import React from "react";
import { LiveCollabCanvas, getWSEndpoint } from "../../../live-collaboration-tool/client/src/lib";
import { useDemoUser } from "./demoUser";

/**
 * 가장 기본적인 캔버스 사용 예제
 * 
 * 단순히 컴포넌트를 import하고 props만 전달하면 됩니다.
 * 모든 기능이 라이브러리 내부에서 처리됩니다.
 */
export function BasicCanvasExample() {
  const user = useDemoUser("user-basic", "사용자");

  return (
    <div style={{ padding: 20 }}>
      <h3>기본 캔버스 예제</h3>
      <p style={{ color: "#666", marginBottom: 16 }}>
        가장 간단한 사용법입니다. 툴바가 포함되어 있어 바로 사용할 수 있습니다.
      </p>
      <LiveCollabCanvas
        serverUrl={getWSEndpoint()}
        roomId="basic-example-room"
        user={user}
        width={800}
        height={600}
        showToolbar={true}
      />
    </div>
  );
}

