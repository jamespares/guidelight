import { error } from './auth'

export async function parseJsonBody(
  request: Request,
  maxBytes = 2_000_000,
): Promise<unknown | Response> {
  const contentLength = request.headers.get('Content-Length')
  if (contentLength && Number(contentLength) > maxBytes) {
    return error('Payload too large', 413)
  }
  try {
    return await request.json()
  } catch {
    return error('Invalid JSON', 400)
  }
}
