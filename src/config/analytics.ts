/** Mesure d’audience Umami (instance auto-hébergée), sans cookies ni identifiant persistant. */
export const analytics = {
  scriptUrl: 'https://stats.yohan.one/script.js',
  websiteId: '573b6720-8a2c-4075-b6ac-cd2b35f486d9',
  /** Seule la production est mesurée : previews, recette, local et E2E ne chargent pas le script. */
  domain: 'frsque.diy',
}

export function loadAnalytics(hostname = location.hostname, doc: Document = document): boolean {
  if (hostname !== analytics.domain) return false
  const script = doc.createElement('script')
  script.defer = true
  script.src = analytics.scriptUrl
  script.dataset.websiteId = analytics.websiteId
  script.dataset.domains = analytics.domain
  script.dataset.excludeSearch = 'true'
  script.dataset.excludeHash = 'true'
  script.dataset.doNotTrack = 'true'
  script.dataset.fetchCredentials = 'omit'
  doc.head.appendChild(script)
  return true
}
