import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickWall, newProject } from './helpers'

test('les comptes indisponibles ne bloquent pas les projets locaux', async ({ page }) => {
  await page.route('**/api/cloud', (route) => route.fulfill({ json: { databaseUrl: null } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toHaveCount(0)
  await newProject(page, 'Toujours local')
  await expect(page.getByTestId('canvas')).toBeVisible()
})

test('une panne du service de comptes permet de revenir aux projets locaux', async ({ page }) => {
  await page.route('**/api/cloud', (route) => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('frsque:account-mode', 'cloud'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Connexion indisponible' })).toBeVisible()
  await page.getByRole('button', { name: 'Ouvrir mes projets locaux' }).click()
  await expect(page.getByTestId('new-project-form')).toBeVisible()
})

// Recette contre une vraie base Dexie isolée. Le code email seul est simulé ;
// jetons signés, synchronisation et isolation serveur sont réels. Jamais en CI sans accès explicite.
test.use({ trace: 'off', video: 'off' })

const configFile = process.env.BETTERDRAW_DEXIE_TEST_CONFIG
interface LiveConfig { databaseUrl: string; clientId: string; clientSecret: string }

test('deux appareils synchronisent le compte et un autre compte reste isolé', async ({ browser }) => {
  test.skip(!configFile, 'Nécessite les identifiants privés de la base de recette Dexie')
  test.setTimeout(120_000)
  const config = JSON.parse(readFileSync(configFile!, 'utf8')) as LiveConfig
  const contexts: BrowserContext[] = []
  const guestName = 'Projet invité ' + Date.now()
  async function device(email: string, withGuest = false): Promise<Page> {
    const context = await browser.newContext(); contexts.push(context)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('console', (msg) => { if (msg.type() === 'warning' || msg.type() === 'error') console.log('Browser:', msg.text()) })
    await page.route('**/api/cloud', (route) => route.fulfill({ json: { databaseUrl: config.databaseUrl } }))
    await page.route(config.databaseUrl + '/token', async (route) => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      const body = route.request().postDataJSON()
      if (body.grant_type !== 'otp') return route.continue()
      if (!body.otp) return route.fulfill({ headers, json: { type: 'otp-sent', otp_id: 'integration-test' } })
      const response = await fetch(config.databaseUrl + '/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret,
          scopes: ['ACCESS_DB'], claims: { sub: email, email }, public_key: body.public_key }),
      })
      expect(response.status).toBe(200)
      await route.fulfill({ headers, json: await response.json() })
    })
    await page.goto('/')
    if (withGuest) {
      await newProject(page, guestName)
      await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
      await page.evaluate(() => { window.location.hash = '/' })
    }
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page.getByRole('button', { name: 'Se connecter par email' }).click()
    await page.getByLabel('Adresse email').fill(email)
    await page.getByRole('button', { name: 'Recevoir un code' }).click()
    await page.getByLabel('Code reçu par email').fill('integration-test')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.getByTestId('new-project-form')).toBeVisible({ timeout: 30_000 })
    return page
  }
  try {
    const first = await device('integration-a@betterdraw.invalid', true)
    await first.getByRole('button', { name: 'Copier mes projets locaux' }).click()
    await expect(first.getByText(guestName, { exact: true })).toBeVisible()
    const second = await device('integration-a@betterdraw.invalid')
    const other = await device('integration-b@betterdraw.invalid')
    const name = 'Synchronisé ' + Date.now()
    await newProject(first, name)
    await first.getByTestId('tool-polyline').click()
    await clickWall(first, 30, 40); await clickWall(first, 100, 160); await first.keyboard.press('Enter')
    await expect(first.getByTestId('save-state')).toHaveText('Enregistré')
    const drawingHash = await first.evaluate(() => window.location.hash)
    await first.evaluate(() => { window.location.hash = '/' })
    await expect(first.getByRole('status', { name: '' }).filter({ hasText: /^Synchronisé$/ })).toBeVisible({ timeout: 30_000 })
    await expect(second.getByText(name, { exact: true })).toBeVisible({ timeout: 30_000 }).catch(async (error) => { console.log('Second appareil :', await second.locator('body').innerText()); throw error })
    await expect(other.getByText(name, { exact: true })).toHaveCount(0)
    await second.reload()
    await expect(second.getByText(name, { exact: true })).toBeVisible({ timeout: 30_000 })
    await second.evaluate((hash) => { window.location.hash = hash }, drawingHash)
    await expect(second.getByTestId('shapes').locator('path')).toHaveCount(1)
    await second.getByTestId('tab-history').click()
    await expect(second.getByTestId('history-count')).toHaveText('1 modification')
    await second.evaluate(() => { window.location.hash = '/' })
    await first.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(first.getByRole('button', { name: 'Se connecter par email' })).toBeVisible({ timeout: 30_000 })
    await expect(first.getByText(name, { exact: true })).toHaveCount(0)
    await first.getByRole('button', { name: 'Continuer avec mes projets locaux' }).click()
    await expect(first.getByText(guestName, { exact: true })).toBeVisible()
    await expect(first.getByText(name, { exact: true })).toHaveCount(0)
  } finally { await Promise.all(contexts.map((context) => context.close())) }
})
