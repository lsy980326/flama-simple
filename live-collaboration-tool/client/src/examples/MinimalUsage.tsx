import React from "react";
import { LiveCollabCanvas } from "../lib";

// 가장 단순한 예제 컴포넌트
export default function MinimalUsage() {
  return (
    <div style={{ padding: 16 }}>
      <h3>LiveCollabCanvas Minimal Example</h3>
      <LiveCollabCanvas
        serverUrl="ws://localhost:5001"
        roomId="demo-room"
        user={{
          id: "demo-user",
          name: "Demo",
          color: "#4ECDC4",
          isOnline: true,
        }}
        width={800}
        height={500}
        showToolbar
      />
    </div>
  );
}
