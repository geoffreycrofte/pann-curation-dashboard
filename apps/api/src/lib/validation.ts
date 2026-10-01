import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

export async function parseJson<T extends z.ZodType>(schema: T, req: Request): Promise<z.infer<T>> {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new HTTPException(400, { message: z.prettifyError(body.error) })
  return body.data
}
