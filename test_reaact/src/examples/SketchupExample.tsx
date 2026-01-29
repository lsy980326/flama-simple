import React from "react";
import { SketchupUploader } from "../../../live-collaboration-tool/client/src/lib";
import { SketchupViewer } from "../../../live-collaboration-tool/client/src/lib/sketchup";

/**
 * 스케치업 뷰어 데모 (React 19 호환)
 * - GLB URL 직접 입력해서 로드 가능
 * - (선택) 서버 업로드/변환도 가능
 */
export function SketchupExample() {
  const [glbUrl, setGlbUrl] = React.useState<string>("");
  const [activeUrl, setActiveUrl] = React.useState<string>("");
  const [progress, setProgress] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const serverUrl = "http://localhost:5002";
  const uploader = React.useMemo(() => new SketchupUploader(serverUrl), []);

  const onPickFile = () => fileRef.current?.click();

  const onUpload = async (file: File) => {
    setError(null);
    setProgress(0);
    try {
      const res = await uploader.uploadFile(file);
      const url = await uploader.waitForConversion(res.conversionId, (p) =>
        setProgress(p)
      );
      setActiveUrl(url);
      setGlbUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>스케치업 뷰어</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={glbUrl}
          onChange={(e) => setGlbUrl(e.target.value)}
          placeholder="GLB URL 입력 (예: http://localhost:5002/api/sketchup/models/xxx.glb)"
          style={{ width: 720, maxWidth: "100%", padding: "8px 10px" }}
        />
        <button onClick={() => setActiveUrl(glbUrl)} disabled={!glbUrl}>
          로드
        </button>
        <button onClick={onPickFile}>.skp/.glb 업로드</button>
        <input
          ref={fileRef}
          type="file"
          accept=".skp,.glb"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {progress > 0 && progress < 100 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          변환 진행률: {progress}%
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#c62828" }}>
          오류: {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {activeUrl ? (
          <SketchupViewer
            glbUrl={activeUrl}
            width={900}
            height={600}
            onModelClick={(pos) => {
              console.log("click", pos);
            }}
          />
        ) : (
          <div style={{ color: "#666" }}>GLB URL을 입력하고 로드하세요.</div>
        )}
      </div>
    </div>
  );
}

