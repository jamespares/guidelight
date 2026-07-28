/* Ambient worker env types until `wrangler types` is run. */
interface Ai {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run(): Promise<{ success: boolean; meta: unknown }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}
