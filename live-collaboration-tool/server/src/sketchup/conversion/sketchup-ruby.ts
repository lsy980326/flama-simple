import { existsSync } from "fs";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function normalizeEnvPath(p: string): string {
  // dotenv(.env)에서 "\ "가 그대로 들어오는 케이스 보정
  // 예: /Applications/SketchUp\ 2025/...  -> /Applications/SketchUp 2025/...
  let out = p.trim();
  // 따옴표로 감싼 케이스 보정
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1);
  }
  out = out.replace(/\\ /g, " ");
  return out;
}

function tryDeriveAppBundlePath(executablePath: string): string | null {
  // /Applications/.../SketchUp.app/Contents/MacOS/SketchUp  -> /Applications/.../SketchUp.app
  const marker = "/Contents/MacOS/";
  const idx = executablePath.indexOf(marker);
  if (idx === -1) return null;
  return executablePath.slice(0, idx);
}

type ConvertSkpToDaeOptions = {
  inputSkpPath: string;
  outputDaePath: string;
};

/**
 * SketchUp(Ruby)로 .skp를 .dae로 export 합니다.
 *
 * - 전제: 로컬 머신(특히 macOS)에서 SketchUp 앱이 설치되어 있어야 합니다.
 * - 실행 바이너리 경로는 SKETCHUP_APP_PATH로 지정할 수 있습니다.
 *
 * NOTE:
 * SketchUp은 headless CLI 전용 툴이 아니라 GUI 앱이라, 서버/CI 환경에서는 부적합할 수 있습니다.
 * 이 구현은 "빠르게 .skp 업로드→변환→뷰어 확인"을 위한 가장 현실적인 로컬 전략입니다.
 */
export async function convertSkpToDaeWithSketchupRuby({
  inputSkpPath,
  outputDaePath,
}: ConvertSkpToDaeOptions): Promise<void> {
  if (!existsSync(inputSkpPath)) {
    throw new Error(`입력 .skp 파일이 없습니다: ${inputSkpPath}`);
  }

  const rawSketchupAppPath =
    process.env.SKETCHUP_APP_PATH ||
    // macOS 기본 설치 경로 후보 (버전별로 다를 수 있어 env 권장)
    "/Applications/SketchUp 2024/SketchUp.app/Contents/MacOS/SketchUp";
  const sketchupAppPath = normalizeEnvPath(rawSketchupAppPath);

  if (!existsSync(sketchupAppPath)) {
    throw new Error(
      [
        "SketchUp 실행 파일을 찾을 수 없습니다.",
        `- SKETCHUP_APP_PATH를 설정해 주세요. (현재: ${rawSketchupAppPath})`,
        "- 예) macOS: /Applications/SketchUp 20xx/SketchUp.app/Contents/MacOS/SketchUp",
      ].join("\n")
    );
  }

  // 출력 디렉토리 보장
  await fs.mkdir(join(outputDaePath, ".."), { recursive: true }).catch(() => {});

  const logPath = join(tmpdir(), `lct-sketchup-export-${Date.now()}.log`);

  // RubyStartup 스크립트는 배포/빌드 경로 문제를 피하려고 런타임에 임시 파일로 생성
  const rubyScript = `
begin
  def lct_log(msg)
    path = ENV["LCT_LOG_PATH"]
    return if path.nil? || path.empty?
    File.open(path, "a") { |f| f.puts(msg.to_s) }
  rescue
  end

  input = ENV["SKP_INPUT"]
  output = ENV["DAE_OUTPUT"]
  lct_log("BEGIN input=#{input} output=#{output}")
  if input.nil? || input.empty? || output.nil? || output.empty?
    lct_log("Missing SKP_INPUT or DAE_OUTPUT")
    puts "Missing SKP_INPUT or DAE_OUTPUT"
    Sketchup.quit
  end

  Sketchup.open_file(input)
  model = Sketchup.active_model

  # Collada(.dae) export 옵션
  # SketchUp의 export API는 제한적이지만, 기본적으로 텍스처는 포함됨
  # 텍스처는 DAE 파일과 같은 디렉토리에 이미지 파일로 저장됨
  # 참고: SketchUp의 model.export는 Collada export 시 제한적인 옵션만 지원
  # 텍스처는 기본적으로 포함되지만, 프로시저럴 재질이나 특수 매핑은 비트맵으로 변환되지 않을 수 있음
  options = {
    :triangulated_faces => true,
    :doublesided_faces => true
  }

  # 재질 및 텍스처 정보 로깅 (디버깅용)
  materials = model.materials
  lct_log("Materials count: #{materials.length}")
  materials.each_with_index do |mat, idx|
    if mat.texture
      lct_log("Material[#{idx}] '#{mat.name}' has texture: #{mat.texture.filename rescue 'unknown'}")
    else
      lct_log("Material[#{idx}] '#{mat.name}' has NO texture (color only)")
    end
  end

  # DAE export (텍스처는 자동으로 같은 디렉토리에 저장됨)
  ok = model.export(output, options)
  lct_log(ok ? "EXPORT_OK" : "EXPORT_FAIL")
  puts(ok ? "EXPORT_OK" : "EXPORT_FAIL")
rescue => e
  lct_log("EXPORT_ERROR: #{e}")
  puts "EXPORT_ERROR: #{e}"
ensure
  begin
    # 저장/종료 모달이 뜨는 케이스 방지(가능한 범위에서 강제 닫기)
    Sketchup.active_model.close(true) rescue nil
  rescue
  end
  lct_log("QUIT")
  Sketchup.quit
end
`;

  const scriptPath = join(tmpdir(), `lct-sketchup-export-${Date.now()}.rb`);
  await fs.writeFile(scriptPath, rubyScript, "utf8");

  try {
    // SketchUp 커맨드라인은 플랫폼/버전에 따라 옵션이 다를 수 있어, 가장 흔한 RubyStartup 플래그들을 순차 시도
    const env = {
      ...process.env,
      SKP_INPUT: inputSkpPath,
      DAE_OUTPUT: outputDaePath,
      LCT_LOG_PATH: logPath,
    } as Record<string, string>;

    const appBundle = tryDeriveAppBundlePath(sketchupAppPath);
    const candidates: Array<{ cmd: string; args: string[]; label: string }> = [];
    if (appBundle) {
      // macOS 권장: open으로 실행 + args 전달
      candidates.push({
        cmd: "/usr/bin/open",
        // 파일을 인자로 넘기면 "새 모델 만들기(템플릿 선택)" 화면을 우회하는 케이스가 많음
        args: ["-W", "-n", "-a", appBundle, inputSkpPath, "--args", "-RubyStartup", scriptPath],
        label: "open -W -n -a <SketchUp.app> <file.skp> --args -RubyStartup",
      });
      candidates.push({
        cmd: "/usr/bin/open",
        args: ["-W", "-n", "-a", appBundle, inputSkpPath, "--args", "--RubyStartup", scriptPath],
        label: "open -W -n -a <SketchUp.app> <file.skp> --args --RubyStartup",
      });
      // 일부 버전은 파일을 --args 뒤로 받는 케이스가 있어 추가
      candidates.push({
        cmd: "/usr/bin/open",
        args: ["-W", "-n", "-a", appBundle, "--args", inputSkpPath, "-RubyStartup", scriptPath],
        label: "open -W -n -a <SketchUp.app> --args <file.skp> -RubyStartup",
      });
    }
    // direct 실행 fallback
    candidates.push({
      cmd: sketchupAppPath,
      args: [inputSkpPath, "-RubyStartup", scriptPath],
      label: "<SketchUp> <file.skp> -RubyStartup",
    });
    candidates.push({
      cmd: sketchupAppPath,
      args: [inputSkpPath, "--RubyStartup", scriptPath],
      label: "<SketchUp> <file.skp> --RubyStartup",
    });
    candidates.push({
      cmd: sketchupAppPath,
      args: [inputSkpPath, "-rubyStartup", scriptPath],
      label: "<SketchUp> <file.skp> -rubyStartup",
    });

    let lastErr: unknown = null;
    let lastStdout = "";
    let lastStderr = "";
    for (const c of candidates) {
      try {
        const { stdout, stderr } = await execFileAsync(c.cmd, c.args, {
          env,
          timeout: 5 * 60 * 1000, // 5분
          maxBuffer: 10 * 1024 * 1024,
        });
        lastStdout = stdout || "";
        lastStderr = stderr || "";
        lastErr = null;
        break;
      } catch (e) {
        lastErr = new Error(
          `[${c.label}] SketchUp 실행 실패: ${
            e instanceof Error ? e.message : String(e)
          }\nstdout:\n${lastStdout}\nstderr:\n${lastStderr}`
        );
      }
    }
    if (lastErr) throw lastErr;

    if (!existsSync(outputDaePath)) {
      let log = "";
      try {
        log = await fs.readFile(logPath, "utf8");
      } catch {
        // ignore
      }
      throw new Error(`SketchUp export 결과(.dae)가 생성되지 않았습니다: ${outputDaePath}`);
    }
  } finally {
    // 스크립트 정리
    try {
      await fs.unlink(scriptPath);
    } catch {
      // ignore
    }
    try {
      // 로그는 디버깅에 도움되지만 tmp 누적 방지
      await fs.unlink(logPath);
    } catch {
      // ignore
    }
  }
}

