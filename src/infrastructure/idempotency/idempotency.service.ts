import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { IdempotencyKey } from './idempotency-key.entity';
import { idempotencyKeyReusedError } from './idempotency.errors';

export type ClaimResult = { kind: 'new' } | { kind: 'replay'; status: number; body: unknown };

// Both methods run on the caller's transaction: the key is stored or rolled back together with the
// work it protects, so a failed request leaves nothing behind and the client can retry.
@Injectable()
export class IdempotencyService {
  async claim(
    tx: EntityManager,
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<ClaimResult> {
    // If another transaction holds the same key, this INSERT waits for it: commit → conflict → replay,
    // rollback → the insert succeeds. No 409 for "in progress" is needed.
    const inserted = await tx
      .createQueryBuilder()
      .insert()
      .into(IdempotencyKey)
      .values({ userId, key, requestHash })
      .orIgnore()
      .returning(['userId'])
      .updateEntity(false)
      .execute();
    if ((inserted.raw as unknown[]).length > 0) {
      return { kind: 'new' };
    }

    const stored = await tx.findOneBy(IdempotencyKey, { userId, key });
    if (!stored) {
      throw new Error(`Idempotency key conflicted but no row was found for user '${userId}'`);
    }
    if (stored.requestHash !== requestHash) {
      throw idempotencyKeyReusedError();
    }
    if (stored.responseStatus === null) {
      throw new Error(`Idempotency key for user '${userId}' was committed without a response`);
    }
    return { kind: 'replay', status: stored.responseStatus, body: stored.response };
  }

  async complete(
    tx: EntityManager,
    userId: string,
    key: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    const values = {
      responseStatus: status,
      response: body,
    } as QueryDeepPartialEntity<IdempotencyKey>;
    await tx.update(IdempotencyKey, { userId, key }, values);
  }
}
