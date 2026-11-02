import { HttpStatus, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';
import { v7 } from 'uuid';
import { runInTransaction } from '@infra/database/transaction';
import { hashRequestBody } from '@infra/idempotency/canonical-json';
import { IdempotencyService } from '@infra/idempotency/idempotency.service';
import type { ExerciseRef } from '@modules/catalog/catalog.repository';
import { CatalogService } from '@modules/catalog/catalog.service';
import { DailyBestsWriter } from '@modules/personal-records/daily-bests/daily-bests.writer';
import { AppException, type ErrorDetail } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';
import { roundForOutput, UnitConverter } from '@shared/units/unit-converter';
import { BASE_UNIT_CODE } from '@shared/units/unit.registry';
import type { LogWorkoutsDto } from './log-workouts.dto';
import { type NewEntry, type NewSet, LogWorkoutsRepository } from './log-workouts.repository';

const MAX_WEIGHT_KG = new Decimal(1000);

export interface LoggedSet {
  id: string;
  setIndex: number;
  reps: number;
  weight: number;
  unit: string;
  weightKg: number;
}

export interface LoggedEntry {
  id: string;
  date: string;
  exercise: { id: number; name: string };
  sets: LoggedSet[];
}

export interface LogWorkoutsResponse {
  data: { entries: LoggedEntry[] };
}

export interface LogBulkResult {
  status: number;
  // LogWorkoutsResponse, or on a replay the stored JSON returned as-is (its shape is not re-checked).
  body: unknown;
  replayed: boolean;
}

interface ConvertedWeight {
  weight: Decimal;
  weightKg: Decimal;
}

@Injectable()
export class LogWorkoutsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly converter: UnitConverter,
    private readonly repository: LogWorkoutsRepository,
    private readonly dailyBests: DailyBestsWriter,
    private readonly idempotency: IdempotencyService,
  ) {}

  logBulk(userId: string, dto: LogWorkoutsDto, idempotencyKey?: string): Promise<LogBulkResult> {
    return runInTransaction(this.dataSource, async (tx) => {
      if (idempotencyKey !== undefined) {
        // Hashed after validation, so "LBS" and "lb" or a different key order count as the same body.
        const claim = await this.idempotency.claim(
          tx,
          userId,
          idempotencyKey,
          hashRequestBody(dto),
        );
        if (claim.kind === 'replay') {
          return { status: claim.status, body: claim.body, replayed: true };
        }
      }

      const exercises = await this.catalog.resolveNamesOrThrow(
        dto.entries.map((entry, i) => ({
          name: entry.exerciseName,
          field: `entries[${i}].exerciseName`,
        })),
        tx,
      );
      const weights = this.convertOrThrow(dto);

      // Ids are generated here, in request order, so sets can reference their entry and the bests can
      // reference sets without reading anything back from a multi-row INSERT.
      const entries: NewEntry[] = [];
      const sets: NewSet[][] = [];
      dto.entries.forEach((entry, i) => {
        const entryId = v7();
        entries.push({
          id: entryId,
          userId,
          exerciseId: exercises[i]!.id,
          performedOn: entry.date,
        });
        sets.push(
          entry.sets.map((set, j) => ({
            id: v7(),
            entryId,
            setIndex: j + 1,
            reps: set.reps,
            unit: set.unit,
            ...weights[i]![j]!,
          })),
        );
      });

      await this.repository.insertEntriesAndSets(tx, entries, sets.flat());
      await this.dailyBests.applySets(
        tx,
        userId,
        entries.flatMap((entry, i) =>
          sets[i]!.map((set) => ({
            setId: set.id,
            exerciseId: entry.exerciseId,
            performedOn: entry.performedOn,
            reps: set.reps,
            weightKg: set.weightKg,
          })),
        ),
      );

      const body = toResponse(entries, sets, exercises);
      if (idempotencyKey !== undefined) {
        await this.idempotency.complete(tx, userId, idempotencyKey, HttpStatus.CREATED, body);
      }
      return { status: HttpStatus.CREATED, body, replayed: false };
    });
  }

  private convertOrThrow(dto: LogWorkoutsDto): ConvertedWeight[][] {
    const errors: ErrorDetail[] = [];
    const weights = dto.entries.map((entry, i) =>
      entry.sets.map((set, j) => {
        const weight = new Decimal(set.weight);
        const weightKg = this.converter.toStoredKg(weight, set.unit);
        if (weightKg.gt(MAX_WEIGHT_KG)) {
          errors.push({
            field: `entries[${i}].sets[${j}].weight`,
            issue: `exceeds maximum of ${MAX_WEIGHT_KG.toFixed()} ${BASE_UNIT_CODE}`,
          });
        }
        return { weight, weightKg };
      }),
    );
    if (errors.length > 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Request validation failed',
        errors,
      );
    }
    return weights;
  }
}

function toResponse(
  entries: NewEntry[],
  sets: NewSet[][],
  exercises: ExerciseRef[],
): LogWorkoutsResponse {
  return {
    data: {
      entries: entries.map((entry, i) => ({
        id: entry.id,
        date: entry.performedOn,
        exercise: { id: exercises[i]!.id, name: exercises[i]!.displayName },
        sets: sets[i]!.map((set) => ({
          id: set.id,
          setIndex: set.setIndex,
          reps: set.reps,
          weight: set.weight.toNumber(),
          unit: set.unit,
          weightKg: roundForOutput(set.weightKg),
        })),
      })),
    },
  };
}
