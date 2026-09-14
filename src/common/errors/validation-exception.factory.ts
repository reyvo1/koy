import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ERROR_CODES } from './error-code';
import { ValidationErrorDetail } from './error-response';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const messages = error.constraints
      ? Object.values(error.constraints).sort()
      : [];
    const current =
      messages.length > 0
        ? [
            {
              field,
              messages,
            },
          ]
        : [];

    return [
      ...current,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

export function createValidationException(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.ValidationFailed,
    message: 'Request validation failed',
    details: flattenValidationErrors(errors),
  });
}
