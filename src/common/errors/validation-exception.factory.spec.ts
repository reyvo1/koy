import { ValidationError } from 'class-validator';
import { ERROR_CODES } from './error-code';
import { createValidationException } from './validation-exception.factory';

describe('Validation Exception Factory', () => {
  it('creates a stable validation error contract without target values', () => {
    const errors: ValidationError[] = [
      {
        property: 'profile',
        children: [
          {
            property: 'email',
            constraints: {
              isEmail: 'email must be an email',
              isNotEmpty: 'email should not be empty',
            },
            target: { email: 'secret@example' },
            value: 'secret@example',
          },
        ],
      },
    ];

    const response = createValidationException(errors).getResponse();

    expect(response).toEqual({
      code: ERROR_CODES.ValidationFailed,
      message: 'Request validation failed',
      details: [
        {
          field: 'profile.email',
          messages: ['email must be an email', 'email should not be empty'],
        },
      ],
    });
    expect(JSON.stringify(response)).not.toContain('secret@example');
  });
});
