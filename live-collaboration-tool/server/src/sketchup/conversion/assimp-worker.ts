import { Job } from 'bull';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { promises as fs } from 'fs';
import { getConversionQueue, ConversionJobData } from './queue';
import { extname } from 'path';
import { tmpdir } from 'os';
import { convertSkpToDaeWithSketchupRuby } from './sketchup-ruby';

const execAsync = promisify(exec);

const ASSIMP_PATH = process.env.ASSIMP_PATH || 'assimp';
const OUTPUT_DIR = process.env.SKETCHUP_OUTPUT_DIR || './uploads/converted';
const STORE_URL = process.env.SKETCHUP_STORE_URL; // 예: http://main-server:5002
const INTERNAL_KEY = process.env.SKETCHUP_INTERNAL_KEY;

function glbOutputFor(fileId: string) {
  // Assimp가 GLB에 텍스처를 "임베드"하지 않고 image.uri로 외부 파일을 참조하는 경우가 있습니다.
  // (예: "model/xxx.jpg") 이 경우 GLB와 같은 디렉토리 구조로 텍스처 파일이 존재해야 합니다.
  // 그래서 파일별 폴더를 만들고 그 안에 model.glb + model/ 텍스처 폴더를 같이 둡니다.
  const outputDirForFile = resolve(OUTPUT_DIR, fileId);
  const outputPath = resolve(outputDirForFile, 'model.glb');
  const glbUrl = `/api/sketchup/models/${fileId}/model.glb`;
  return { outputDirForFile, outputPath, glbUrl };
}

// Worker는 Queue의 process 메서드로 생성 (지연 초기화)
// 실제로 사용될 때만 Queue 생성
let workerInitialized = false;

export function initializeAssimpWorker() {
  if (workerInitialized) return;
  
  const conversionQueue = getConversionQueue();
  // Bull은 "job name" 별로 process handler가 필요합니다.
  // upload.ts에서 add('convert-skp-to-glb', ...)로 넣기 때문에 동일 name으로 등록해야 합니다.
  conversionQueue.process(
    'convert-skp-to-glb',
    4, // concurrency
    async (job: Job<ConversionJobData>) => {
      const { fileId, conversionId, inputPath } = job.data;

      try {
        await job.progress(10);

        // 입력 파일 존재 확인 (재시도에서 파일이 지워졌다면 여기서 바로 원인 메시지 제공)
        if (!existsSync(inputPath)) {
          throw new Error(
            `입력 파일을 찾을 수 없습니다: ${inputPath} (재시도 중 임시파일이 삭제되었을 수 있습니다)`
          );
        }

        // 출력 파일 경로 (파일별 폴더로 분리)
        const { outputDirForFile, outputPath, glbUrl } = glbOutputFor(fileId);
        await fs.mkdir(outputDirForFile, { recursive: true });

        // 변환 전략:
        // - .skp: SketchUp(Ruby)로 .dae export → Assimp로 .dae → .glb
        // - 그 외: Assimp로 직접 변환(지원 포맷에 한함)
        await job.progress(30);

        const originalExt = extname(job.data.originalFilename || inputPath).toLowerCase();
        let sourcePath = inputPath;
        let intermediateDir: string | null = null;
        let intermediateDaePath: string | null = null;

        if (originalExt === '.skp') {
          // .skp → .dae
          // SketchUp Collada export는 DAE와 함께 텍스처 이미지를 "같은 디렉토리"에 생성합니다.
          // /tmp 같은 공용 디렉토리에 바로 export 하면 파일명 충돌/덮어쓰기로 텍스처가 누락될 수 있어
          // 변환마다 고유 디렉토리를 만들고 그 안에 DAE+텍스처를 묶습니다.
          intermediateDir = join(tmpdir(), `lct-${fileId}-${conversionId}`);
          await fs.mkdir(intermediateDir, { recursive: true });
          intermediateDaePath = join(intermediateDir, 'model.dae');
          await job.progress(40);
          await convertSkpToDaeWithSketchupRuby({
            inputSkpPath: inputPath,
            outputDaePath: intermediateDaePath,
          });
          sourcePath = intermediateDaePath;
        }

        // Assimp로 source → glb
        // 텍스처 포함을 위해 DAE 파일이 있는 디렉토리에서 실행
        // 하지만 출력 파일은 절대 경로로 지정해야 함
        const command = `${ASSIMP_PATH} export "${sourcePath}" "${outputPath}" glb`;
        
        // DAE 파일이 있는 경우, 같은 디렉토리에서 실행하여 텍스처 경로 문제 해결
        // 출력 파일은 절대 경로로 지정하므로 cwd와 관계없이 작동
        const workingDir = intermediateDir ?? join(outputPath, '..');

        await execAsync(command, {
          maxBuffer: 50 * 1024 * 1024, // 50MB
          cwd: workingDir, // 텍스처 경로 문제 해결 (입력 파일 기준)
        });

        await job.progress(70);

        // DAE export 후 텍스처 파일 확인 및 로깅
        if (intermediateDir) {
          const srcTexDir = join(intermediateDir, 'model');
          if (existsSync(srcTexDir)) {
            const texFiles = await fs.readdir(srcTexDir).catch(() => []);
            console.log(`[변환] DAE 텍스처 파일 개수: ${texFiles.length} (${intermediateDir}/model/)`);
            if (texFiles.length > 0) {
              console.log(`[변환] 텍스처 샘플: ${texFiles.slice(0, 5).join(', ')}`);
            }
          } else {
            console.warn(`[변환] 텍스처 디렉토리가 없습니다: ${srcTexDir}`);
          }
        }

        // Assimp가 image.uri로 외부 텍스처를 참조한 경우를 대비해 텍스처 폴더를 결과 폴더로 복사
        // (SketchUp이 model.dae 옆에 model/ 폴더로 텍스처를 생성하는 패턴을 사용)
        if (intermediateDir) {
          const srcTexDir = join(intermediateDir, 'model');
          const destTexDir = join(outputDirForFile, 'model');
          if (existsSync(srcTexDir)) {
            await fs.cp(srcTexDir, destTexDir, { recursive: true }).catch((err) => {
              console.error(`[변환] 텍스처 폴더 복사 실패: ${err}`);
            });
            const copiedFiles = await fs.readdir(destTexDir).catch(() => []);
            console.log(`[변환] 복사된 텍스처 파일 개수: ${copiedFiles.length} (${destTexDir})`);
          }
        }

        // GLB 생성 후 텍스처 포함 여부 검증
        if (existsSync(outputPath)) {
          try {
            const glbBuffer = await fs.readFile(outputPath);
            // GLB JSON 청크 파싱 (간단한 검증)
            let jsonChunk: any = null;
            let offset = 12; // GLB 헤더(12바이트) 이후
            while (offset < glbBuffer.length) {
              const chunkLength = glbBuffer.readUInt32LE(offset);
              const chunkType = glbBuffer.readUInt32LE(offset + 4);
              const chunkStart = offset + 8;
              const chunkEnd = chunkStart + chunkLength;
              if (chunkType === 0x4e4f534a) { // 'JSON'
                const jsonStr = glbBuffer.slice(chunkStart, chunkEnd).toString('utf8').replace(/\0+$/, '');
                jsonChunk = JSON.parse(jsonStr);
                break;
              }
              offset = chunkEnd;
            }
            if (jsonChunk) {
              const imageCount = (jsonChunk.images || []).length;
              const materialCount = (jsonChunk.materials || []).length;
              const materialsWithTexture = (jsonChunk.materials || []).filter((m: any) => {
                const pbr = m.pbrMetallicRoughness || {};
                return !!pbr.baseColorTexture;
              }).length;
              console.log(`[변환] GLB 검증: images=${imageCount}, materials=${materialCount}, materials_with_texture=${materialsWithTexture}`);
            }
          } catch (err) {
            console.warn(`[변환] GLB 검증 실패 (계속 진행): ${err}`);
          }
        }

        // Draco 압축 (옵션)
        // NOTE: 현재 gltf-pipeline가 의존하는 cesium CJS/ESM 호환 문제로 런타임 에러가 발생할 수 있어
        // 기본은 비활성화하고, 필요 시 SKETCHUP_ENABLE_DRACO=1로 켭니다.
        if (process.env.SKETCHUP_ENABLE_DRACO === '1') {
          try {
            const gltfPipeline = await import('gltf-pipeline');
            const pipeline = (gltfPipeline as any).default || gltfPipeline;

            const glbBuffer = await fs.readFile(outputPath);
            const options = {
              dracoOptions: {
                compressionLevel: 7,
                quantizePositionBits: 14,
                quantizeNormalBits: 10,
                quantizeTexcoordBits: 12,
              },
            };

            const processed = await pipeline.processGlb(glbBuffer, options);
            if (processed && processed.glb) {
              await fs.writeFile(outputPath, Buffer.from(processed.glb));
            } else {
              console.warn('Draco 압축 결과가 비어있음, 원본 GLB 사용');
            }
          } catch (dracoError) {
            console.warn('Draco 압축 실패, 원본 GLB 사용:', dracoError);
          }
        }

        await job.progress(100);

        // 원격 저장 모드: 변환 결과를 메인 서버로 업로드 후 로컬 파일은 제거
        if (STORE_URL) {
          if (!INTERNAL_KEY) {
            throw new Error(
              'SKETCHUP_STORE_URL이 설정되어 있지만 SKETCHUP_INTERNAL_KEY가 없습니다. (내부 업로드 인증키 필요)'
            );
          }

          const base = STORE_URL.replace(/\/+$/, '');
          const putUrl = `${base}/api/sketchup/internal/models/${fileId}`;
          const glbBuf = await fs.readFile(outputPath);

          const resp = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'content-type': 'application/octet-stream',
              'x-sketchup-internal-key': INTERNAL_KEY,
            },
            body: glbBuf as any,
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`원격 GLB 저장 실패: ${resp.status} ${resp.statusText} ${text}`);
          }

          const json = (await resp.json().catch(() => ({}))) as any;
          const returnedGlbUrl = typeof json.glbUrl === 'string' ? json.glbUrl : glbUrl;

          // 임시 파일 삭제
          if (existsSync(inputPath)) unlinkSync(inputPath);
          if (intermediateDir) {
            await fs.rm(intermediateDir, { recursive: true, force: true }).catch(() => {});
          } else if (intermediateDaePath && existsSync(intermediateDaePath)) {
            try {
              unlinkSync(intermediateDaePath);
            } catch {
              // ignore
            }
          }
          try {
            await fs.rm(outputDirForFile, { recursive: true, force: true }).catch(() => {});
          } catch {
            // ignore
          }

          return {
            fileId,
            conversionId,
            glbUrl: returnedGlbUrl,
            outputPath,
          };
        }

        // 임시 파일 삭제
        if (existsSync(inputPath)) unlinkSync(inputPath);
        if (intermediateDir) {
          await fs.rm(intermediateDir, { recursive: true, force: true }).catch(() => {});
        } else if (intermediateDaePath && existsSync(intermediateDaePath)) {
          try {
            unlinkSync(intermediateDaePath);
          } catch {
            // ignore
          }
        }

        return {
          fileId,
          conversionId,
          glbUrl,
          outputPath,
        };
      } catch (error) {
        // 중요: Bull 재시도(attempts)가 남아있는 경우 inputPath를 지우면
        // 다음 시도에서 "Unable to open file"로 2차 실패가 발생합니다.
        // 마지막 시도에서만 정리합니다.
        const maxAttempts =
          typeof job.opts.attempts === 'number' && job.opts.attempts > 0 ? job.opts.attempts : 1;
        const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
        if (isLastAttempt && existsSync(inputPath)) {
          try {
            unlinkSync(inputPath);
          } catch (e) {
            // 무시
          }
        }
        throw error;
      }
    }
  );

  // 개발 편의: 이미 GLB인 파일은 변환 없이 저장만 하고 URL을 반환
  conversionQueue.process(
    'store-glb',
    4,
    async (job: Job<ConversionJobData>) => {
      const { fileId, conversionId, inputPath } = job.data;

      if (!existsSync(inputPath)) {
        throw new Error(`입력 파일을 찾을 수 없습니다: ${inputPath}`);
      }

      await job.progress(20);

      const { outputDirForFile, outputPath, glbUrl } = glbOutputFor(fileId);
      await fs.mkdir(outputDirForFile, { recursive: true });

      // temp -> output 복사
      const buf = await fs.readFile(inputPath);
      await fs.writeFile(outputPath, buf);

      await job.progress(100);

      // 원격 저장 모드
      if (STORE_URL) {
        if (!INTERNAL_KEY) {
          throw new Error(
            'SKETCHUP_STORE_URL이 설정되어 있지만 SKETCHUP_INTERNAL_KEY가 없습니다. (내부 업로드 인증키 필요)'
          );
        }
        const base = STORE_URL.replace(/\/+$/, '');
        const putUrl = `${base}/api/sketchup/internal/models/${fileId}`;
        const resp = await fetch(putUrl, {
          method: 'PUT',
          headers: {
            'content-type': 'application/octet-stream',
            'x-sketchup-internal-key': INTERNAL_KEY,
          },
          body: buf as any,
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`원격 GLB 저장 실패: ${resp.status} ${resp.statusText} ${text}`);
        }
        const json = (await resp.json().catch(() => ({}))) as any;
        const returnedGlbUrl = typeof json.glbUrl === 'string' ? json.glbUrl : glbUrl;

        // 로컬 파일 정리
        try {
          await fs.rm(outputDirForFile, { recursive: true, force: true }).catch(() => {});
        } catch {
          // ignore
        }
        try {
          if (existsSync(inputPath)) unlinkSync(inputPath);
        } catch {
          // ignore
        }

        return { fileId, conversionId, glbUrl: returnedGlbUrl, outputPath };
      }

      // 임시 파일 삭제
      try {
        if (existsSync(inputPath)) unlinkSync(inputPath);
      } catch {
        // ignore
      }

      return { fileId, conversionId, glbUrl, outputPath };
    }
  );
  
  workerInitialized = true;
  console.log('✅ Assimp Worker 초기화 완료');
}

// Worker 인스턴스 export (호환성을 위해)
export const assimpConversionWorker = new Proxy({} as any, {
  get(target, prop) {
    const queue = getConversionQueue();
    return (queue as any)[prop];
  }
});
