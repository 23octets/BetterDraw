// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { analytics, loadAnalytics } from './analytics'


it('charge Umami seulement sur le domaine de production, avec les options de confidentialité', () => {
  const doc = document.implementation.createHTMLDocument('')
  expect(loadAnalytics('frsque.diy', doc)).toBe(true)
  const script = doc.head.querySelector('script')!
  expect(script.src).toBe(analytics.scriptUrl)
  expect({ ...script.dataset }).toEqual({
    websiteId: analytics.websiteId,
    domains: 'frsque.diy',
    excludeSearch: 'true',
    excludeHash: 'true',
    doNotTrack: 'true',
    fetchCredentials: 'omit',
  })
})

it('ne charge rien en recette, en preview ni en local', () => {
  for (const hostname of ['dev.frsque.diy', 'betterdraw.rocktane.workers.dev', 'localhost', 'www.frsque.diy']) {
    const doc = document.implementation.createHTMLDocument('')
    expect(loadAnalytics(hostname, doc)).toBe(false)
    expect(doc.querySelector('script')).toBeNull()
  }
})
