import { REQUEST_ID_HEADER } from './request-id';

export function jsonApiError(
  code: string,
  message: string,
  status: number,
  req?: Request,
): Response {
  const requestId = req?.headers.get(REQUEST_ID_HEADER) ?? undefined;
  const headers = requestId ? { [REQUEST_ID_HEADER]: requestId } : undefined;
  return Response.json(
    {
      error: {
        code,
        message,
        ...(requestId ? { requestId } : {}),
      },
    },
    { status, ...(headers ? { headers } : {}) },
  );
}
