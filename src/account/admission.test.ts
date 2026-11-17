import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../../worker/index'

function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../../migrations/0001_accounts.sql', import.meta.url), 'utf8'))
  return { db, env: {
    DEXIE_ADMISSION_SECRET: 'test-secret',
    ACCOUNTS: { prepare(sql: string) { return { bind(...params: unknown[]) { return {
      async run() { return db.prepare(sql).run(...params as string[]) },
      async first<T>() { return (db.prepare(sql).get(...params as string[]) ?? null) as T | null },
    } } } } },
    ASSETS: { fetch: async () => new Response('assets') },
  } }
}
function request(user: number, key = 'test-secret') {
  return new Request('https://example.com/api/accounts/admit?key=' + key, {
    method: 'POST', body: JSON.stringify({ userId: 'user' + user, email: `user${user}@example.com` }),
  })
}
describe('plafond serveur', () => {
  it('accepte 25 identités, refuse la 26e et accepte les répétitions sans consommer de place', async () => {
    const { db, env } = setup()
    try {
      const results = await Promise.all(Array.from({ length: 30 }, (_, i) => handleRequest(request(i), env).then((r) => r.json())))
      expect(results.filter((r) => r.action === 'prod')).toHaveLength(25)
      expect(results.filter((r) => r.action === 'reject')).toHaveLength(5)
      expect(await (await handleRequest(request(0), env)).json()).toEqual({ ok: true, action: 'prod' })
      expect(db.prepare('SELECT COUNT(*) AS total FROM accounts').get()?.total).toBe(25)
    } finally { db.close() }
  })
  it('ne réserve aucune place sans secret valide ni en cas d’erreur', async () => {
    const { db, env } = setup()
    try {
      expect((await handleRequest(request(0, 'bad'), env)).status).toBe(401)
      expect(db.prepare('SELECT COUNT(*) AS total FROM accounts').get()?.total).toBe(0)
      const broken = { ...env, ACCOUNTS: { prepare() { throw new Error('unavailable') } } }
      const result = await handleRequest(request(1), broken)
      expect(result.status).toBe(503)
      expect((await result.json()).action).toBe('reject')
    } finally { db.close() }
  })
})
