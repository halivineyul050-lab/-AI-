import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { imageErrorTitle } from '../image-generation-gateway.mjs';
import { HttpError } from '../validation.mjs';

export function createImageGenerationService({ jobs, creditStore, imageGateway, imageCloudHistory, imageResults, activeCreditReservations, logger }) {
  const running = new Set();
  let closing = false;
  return {
    prepare(userId, input, modelId, key) {
      if (closing) throw new HttpError(503, 'image_service_stopping', '服务正在重启，请稍后再试。');
      const id = randomUUID();
      const reservation = jobs.reserve(userId, {
        requestId: `${userId}:${key || randomUUID()}`, count: input.count, modelRecordId: modelId
      }, id);
      return { id, reservation };
    },
    run(job, userId, input, model) {
      const execute = async () => {
        const { reservation } = job;
        activeCreditReservations.add(reservation.id);
        try {
          const result = await imageGateway.generate(input);
          const wallet = creditStore.settle(reservation.id, result.images.length);
          const charged = result.images.length * reservation.unitCredits;
          const credits = { ...wallet, charged, refunded: reservation.reservedCredits - charged };
          let saved = null;
          try {
            saved = imageCloudHistory.save(userId, {
              generationId: result.generationId, prompt: input.prompt, modelName: model.displayName,
              ratio: input.ratio, style: input.style,
              images: result.images.map(({ id, mimeType, localPath }) => ({ id, mimeType, bytes: readFileSync(localPath) }))
            });
          } catch (error) {
            if (logger) console.error('Image cloud history save failed:', error?.code || 'unknown');
          }
          if (!saved) imageResults.set(result.generationId, { ...result, ownerId: userId });
          const data = {
            generationId: result.generationId, historySaved: Boolean(saved), credits,
            ...(saved ? {} : { warning: '图片已生成，但保存到账号云历史失败。请现在下载；临时预览约 15 分钟后失效。' }),
            images: saved ? saved.map(({ id, mimeType }) => ({ id, mimeType, expiresAt: null, url: `/api/v1/image-history/${id}/image` }))
              : result.images.map(({ id, mimeType, expiresAt }) => ({ id, mimeType, expiresAt, url: `/api/v1/image-generations/${result.generationId}/images/${id}` }))
          };
          jobs.complete(job.id, data);
          return data;
        } catch (error) {
          jobs.fail(job.id, {
            status: Number(error.status) || 500, code: error.code || 'internal_error',
            message: imageErrorTitle(error.code) || '图片生成失败，请稍后重试。'
          });
          throw error;
        } finally {
          activeCreditReservations.delete(reservation.id);
        }
      };
      const task = execute();
      running.add(task);
      // Both fulfillment and rejection remove the task without creating an unhandled rejected promise.
      void task.then(() => running.delete(task), () => running.delete(task));
      return task;
    },
    async close() { closing = true; await Promise.allSettled([...running]); }
  };
}
