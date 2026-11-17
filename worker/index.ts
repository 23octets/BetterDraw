interface BoundStatement {
  run(): Promise<unknown>
  first<T>(): Promise<T | null>
}
interface Statement {
  bind(...values: unknown[]): BoundStatement
}
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  ACCOUNTS: { prepare(sql: string): Statement }
  DEXIE_DATABASE_URL?: string
  DEXIE_ADMISSION_SECRET?: string
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/api/cloud') {
    return Response.json({ databaseUrl: env.DEXIE_DATABASE_URL || null }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (url.pathname === '/api/accounts/admit') {
    // Dexie accepte une URL de webhook ; le secret reste exclusivement côté serveur.
    if (!env.DEXIE_ADMISSION_SECRET || url.searchParams.get('key') !== env.DEXIE_ADMISSION_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    try {
      const body = await request.text()
      if (body.length > 4096) return new Response('Payload too large', { status: 413 })
      const { userId, email } = JSON.parse(body)
      if (typeof userId !== 'string' || !userId || userId.length > 320 ||
          typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        return new Response('Invalid account', { status: 400 })
      }
      await env.ACCOUNTS.prepare('INSERT OR IGNORE INTO accounts (user_id, email) VALUES (?, ?)').bind(userId, email).run()
      const accepted = await env.ACCOUNTS.prepare('SELECT user_id FROM accounts WHERE user_id = ?').bind(userId).first()
      return Response.json({ ok: true, action: accepted ? 'prod' : 'reject' }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      // Une panne ne doit jamais ouvrir les inscriptions ni créer un compte d’évaluation.
      return Response.json({ ok: false, action: 'reject' }, { status: 503 })
    }
  }
  return env.ASSETS.fetch(request)
}

export default { fetch: handleRequest }
