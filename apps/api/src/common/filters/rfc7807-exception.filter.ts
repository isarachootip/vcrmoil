import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProblemDetails } from '@vcrm/shared';

@Catch()
export class Rfc7807ExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred';
    let code = 'INTERNAL_ERROR';
    let errors: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        detail = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        title = (obj.error as string) || exception.message || title;
        detail = (obj.message as string) || detail;

        if (Array.isArray(obj.message)) {
          // Class validator error messages array
          title = 'Validation Failed';
          code = 'VALIDATION_ERROR';
          detail = 'One or more fields failed validation criteria';
          errors = {
            fields: obj.message as string[],
          };
        }

        if (obj.code && typeof obj.code === 'string') {
          code = obj.code;
        }
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    const problem: ProblemDetails = {
      type: `https://vcrm.app/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      detail,
      instance: request.url,
      code,
      errors,
      timestamp: new Date().toISOString(),
    };

    response.status(status).contentType('application/problem+json').json(problem);
  }
}
