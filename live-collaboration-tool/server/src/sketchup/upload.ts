import express, { Request, Response } from 'express';
import multer from 'multer';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getConversionQueue } from './conversion/queue';
import { extname } from 'path';
import { renameSync } from 'fs';

const upload = multer({
  dest: join(tmpdir(), 'sketchup-uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export const uploadSketchupFile = async (
  req: MulterRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '파일이 제공되지 않았습니다.' });
      return;
    }

    const originalName = req.file.originalname || '';
    const ext = extname(originalName).toLowerCase();

    // 지원 형식: .skp (변환 큐) / .glb (저장 큐)
    if (ext !== '.skp' && ext !== '.glb') {
      res.status(400).json({
        error: '지원하지 않는 파일 형식입니다.',
        message: '현재는 .skp 또는 .glb 업로드만 지원합니다.',
      });
      return;
    }

    const fileId = uuidv4();
    const conversionId = uuidv4();
    
    // 파일을 임시 저장소에 저장
    // multer가 확장자 없는 파일명으로 저장하므로, 일부 툴이 확장자에 의존할 수 있어 보정
    let tempPath = req.file.path;
    try {
      const renamed = `${tempPath}${ext}`;
      renameSync(tempPath, renamed);
      tempPath = renamed;
    } catch {
      // rename 실패 시 원본 경로 사용
    }
    
    // 변환 큐에 작업 추가
    const conversionQueue = getConversionQueue();
    const jobName = ext === '.glb' ? 'store-glb' : 'convert-skp-to-glb';
    const job = await conversionQueue.add(
      jobName,
      {
        fileId,
        conversionId,
        inputPath: tempPath,
        originalFilename: req.file.originalname,
      },
      {
        jobId: conversionId, // jobId를 conversionId로 설정하여 조회 가능하게
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    res.json({
      fileId,
      conversionId,
      status: 'pending',
      message:
        ext === '.glb'
          ? '파일 업로드 완료. 저장 작업이 큐에 등록되었습니다.'
          : '파일 업로드 완료. 변환 작업이 큐에 등록되었습니다.',
    });
  } catch (error) {
    console.error('업로드 오류:', error);
    res.status(500).json({
      error: '파일 업로드 실패',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

// 변환 상태 조회 API
export const getConversionStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { conversionId } = req.params;
    const conversionQueue = getConversionQueue();
    const job = await conversionQueue.getJob(conversionId);

    if (!job) {
      res.status(404).json({ error: '변환 작업을 찾을 수 없습니다.' });
      return;
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    if (state === 'completed') {
      const result = await job.returnvalue;
      res.json({
        conversionId,
        status: 'completed',
        progress: 100,
        glbUrl: result.glbUrl,
      });
    } else if (state === 'failed') {
      res.json({
        conversionId,
        status: 'failed',
        error: job.failedReason || '변환 실패',
      });
    } else {
      res.json({
        conversionId,
        status: state === 'active' ? 'processing' : 'pending',
        progress,
      });
    }
  } catch (error) {
    console.error('상태 조회 오류:', error);
    res.status(500).json({
      error: '상태 조회 실패',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
