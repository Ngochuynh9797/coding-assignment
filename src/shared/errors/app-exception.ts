export interface ErrorDetail {
  field: string;
  issue: string;
}

export class AppException extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'AppException';
  }
}
