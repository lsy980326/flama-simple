import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { dirname } from "path";
import { promises as fs } from "fs";

const execFileAsync = promisify(execFile);

export type ConvertSkpToGlbWithCSDKOptions = {
  inputSkpPath: string;
  /**
   * 컨버터가 텍스처/부가 파일을 생성해야 한다면 이 디렉토리 아래에 생성하도록 권장합니다.
   * (없어도 동작하지만, GLB가 외부 asset을 참조하는 경우를 대비)
   */
  outputDirForFile: string;
  /**
   * 중간 산출물 포맷. 기본은 obj.
   * - obj: model.obj + model.mtl (+ model/* 텍스처)
   * - dae: model.dae (+ model/* 텍스처)
   */
  format?: "obj" | "dae";
  timeoutMs?: number;
};

function normalizeEnvPath(p: string): string {
  // dotenv(.env)에서 "\ "가 그대로 들어오는 케이스 보정
  let out = (p || "").trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1);
  }
  out = out.replace(/\\ /g, " ");
  return out;
}

function replacePlaceholders(s: string, vars: Record<string, string>): string {
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function parseArgsJson(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new Error("SKETCHUP_CSDK_ARGS_JSON은 문자열 배열(JSON)이어야 합니다.");
  }
  return parsed as string[];
}

/**
 * SketchUp C SDK 기반 컨버터(외부 CLI)를 호출하여 .skp → (중간 포맷 obj/dae) 변환을 수행합니다.
 *
 * 전제:
 * - 실제 C SDK 변환기는 본 프로젝트에 포함되지 않습니다.
 * - 이 모듈은 "사용자 제공 CLI"를 실행하는 래퍼입니다.
 *
 * 환경 변수:
 * - SKETCHUP_CSDK_BIN: 변환기 실행 파일 경로(또는 PATH에 있는 커맨드명)
 * - SKETCHUP_CSDK_ARGS_JSON: argv 배열(JSON). 기본값은 ["{input}", "{output}", "{format}"]
 *
 * 플레이스홀더:
 * - {input}: inputSkpPath
 * - {output}: outputDirForFile (출력 디렉토리)
 * - {outDir}: outputDirForFile
 * - {format}: obj | dae
 */
export async function convertSkpToIntermediateWithSketchupCSDK({
  inputSkpPath,
  outputDirForFile,
  format = "obj",
  timeoutMs = 10 * 60 * 1000, // 10분
}: ConvertSkpToGlbWithCSDKOptions): Promise<{ intermediatePath: string }> {
  if (!existsSync(inputSkpPath)) {
    throw new Error(`입력 .skp 파일이 없습니다: ${inputSkpPath}`);
  }

  const rawBin = process.env.SKETCHUP_CSDK_BIN || "";
  if (!rawBin || rawBin.trim().length === 0) {
    throw new Error(
      [
        "SKETCHUP_CONVERTER=sdk 모드에는 C SDK 변환기 CLI가 필요합니다.",
        "- SKETCHUP_CSDK_BIN을 실행 파일 경로(또는 PATH의 커맨드명)로 설정해 주세요.",
      ].join("\n")
    );
  }
  const bin = normalizeEnvPath(rawBin);

  // 출력 디렉토리 보장
  await fs.mkdir(outputDirForFile, { recursive: true }).catch(() => {});

  let argsTemplate: string[] = ["{input}", "{output}", "{format}"];
  const rawArgsJson = process.env.SKETCHUP_CSDK_ARGS_JSON;
  if (rawArgsJson && rawArgsJson.trim().length > 0) {
    argsTemplate = parseArgsJson(rawArgsJson);
  }

  const vars = {
    input: inputSkpPath,
    output: outputDirForFile,
    outDir: outputDirForFile,
    format,
  };
  const args = argsTemplate.map((a) => replacePlaceholders(a, vars));

  try {
    const extraEnv: Record<string, string> = {};
    // macOS: .framework 런타임 로딩을 위해 DYLD_FRAMEWORK_PATH가 필요할 수 있음
    if (process.env.SKETCHUP_CSDK_DYLD_FRAMEWORK_PATH) {
      extraEnv.DYLD_FRAMEWORK_PATH = process.env.SKETCHUP_CSDK_DYLD_FRAMEWORK_PATH;
    }

    await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 100 * 1024 * 1024,
      cwd: outputDirForFile,
      env: {
        ...process.env,
        ...extraEnv,
      } as NodeJS.ProcessEnv,
    });
  } catch (e) {
    throw new Error(
      [
        "SketchUp C SDK 컨버터 실행 실패",
        `- bin: ${bin}`,
        `- args: ${JSON.stringify(args)}`,
        `- message: ${e instanceof Error ? e.message : String(e)}`,
        "힌트:",
        '- SKETCHUP_CSDK_BIN을 올바른 경로로 설정했는지 확인하세요.',
        '- SKETCHUP_CSDK_ARGS_JSON이 유효한 JSON 배열인지 확인하세요.',
        "- (macOS) dyld 오류가 나오면 SKETCHUP_CSDK_DYLD_FRAMEWORK_PATH를 SDK 폴더로 설정해 보세요.",
        "- (macOS) 'library load disallowed by system policy'가 나오면 SDK 프레임워크를 ad-hoc 서명해 보세요:",
        "  - codesign --force --deep --sign - <SDK>/SketchUpAPI.framework",
        "  - codesign --force --sign - <path-to>/sketchup-csdk-converter",
      ].join("\n")
    );
  }

  const intermediatePath =
    format === "dae"
      ? `${outputDirForFile}/model.dae`
      : `${outputDirForFile}/model.obj`;

  if (!existsSync(intermediatePath)) {
    throw new Error(
      `C SDK 변환 결과(${format})가 생성되지 않았습니다: ${intermediatePath}`
    );
  }

  return { intermediatePath };
}

