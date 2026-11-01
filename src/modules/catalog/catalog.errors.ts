import { HttpStatus } from '@nestjs/common';
import { AppException, type ErrorDetail } from '@shared/errors/app-exception';

export const CatalogErrorCode = {
  UNKNOWN_EXERCISE: 'UNKNOWN_EXERCISE',
  EXERCISE_NOT_FOUND: 'EXERCISE_NOT_FOUND',
} as const;

export function unknownExercisesError(details: ErrorDetail[]): AppException {
  return new AppException(
    CatalogErrorCode.UNKNOWN_EXERCISE,
    HttpStatus.BAD_REQUEST,
    'One or more exercises are not in the catalog. Use GET /api/v1/exercises to find valid names.',
    details,
  );
}

export function exerciseNotFoundError(name: string): AppException {
  return new AppException(
    CatalogErrorCode.EXERCISE_NOT_FOUND,
    HttpStatus.NOT_FOUND,
    `Exercise '${name}' is not in the catalog. Use GET /api/v1/exercises to find valid names.`,
  );
}
