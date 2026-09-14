import { ErrorCode } from './error-code';

export interface ValidationErrorDetail {
  field: string;
  messages: string[];
}

export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details?: ValidationErrorDetail[];
}

export interface ApiErrorEnvelope {
  statusCode: number;
  error: ApiErrorBody;
  requestId: string;
  timestamp: string;
  path: string;
}
