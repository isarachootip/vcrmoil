import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { Rfc7807ExceptionFilter } from './rfc7807-exception.filter';

describe('Rfc7807ExceptionFilter', () => {
  let filter: Rfc7807ExceptionFilter;

  beforeEach(() => {
    filter = new Rfc7807ExceptionFilter();
  });

  it('should transform HttpException into RFC 7807 ProblemDetails json', () => {
    const jsonMock = jest.fn();
    const contentTypeMock = jest.fn().mockReturnValue({ json: jsonMock });
    const statusMock = jest.fn().mockReturnValue({ contentType: contentTypeMock });

    const mockResponse = {
      status: statusMock,
    };

    const mockRequest = {
      url: '/api/v1/test',
    };

    const hostMock = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    const exception = new BadRequestException('Validation failed on field email');

    filter.catch(exception, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(contentTypeMock).toHaveBeenCalledWith('application/problem+json');
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        detail: 'Validation failed on field email',
        instance: '/api/v1/test',
      }),
    );
  });
});
