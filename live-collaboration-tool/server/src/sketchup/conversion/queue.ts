import Queue, { Queue as QueueType } from 'bull';
import Redis from 'ioredis';
import type { Job } from 'bull';

export interface ConversionJobData {
  fileId: string;
  conversionId: string;
  inputPath: string;
  originalFilename: string;
}

// 지연 초기화: Queue는 실제로 사용될 때만 생성
let _conversionQueue: QueueType<ConversionJobData> | null = null;
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return _redis;
}

export function getConversionQueue(): QueueType<ConversionJobData> {
  if (!_conversionQueue) {
    _conversionQueue = new Queue<ConversionJobData>('sketchup-conversion', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
      defaultJobOptions: {
        // 너무 빨리 완료/삭제되면 클라이언트 폴링에서 404가 발생할 수 있어
        // 최근 작업은 일정 개수 유지합니다.
        removeOnComplete: 1000,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // 큐 이벤트 리스너
    _conversionQueue.on('completed', (job: Job<ConversionJobData>) => {
      console.log(`✅ 변환 완료: ${job.id}`);
    });

    _conversionQueue.on('failed', (job: Job<ConversionJobData> | undefined, err: Error) => {
      console.error(`❌ 변환 실패: ${job?.id}`, err);
    });

    _conversionQueue.on('progress', (job: Job<ConversionJobData>, progress: number) => {
      console.log(`변환 진행: ${job.id} - ${progress}%`);
    });
  }
  return _conversionQueue;
}

// 호환성을 위한 export (기존 코드에서 사용 중)
export const conversionQueue = new Proxy({} as QueueType<ConversionJobData>, {
  get(target, prop) {
    return (getConversionQueue() as any)[prop];
  }
});
