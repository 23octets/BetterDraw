import { test, expect } from '@playwright/test'

test('explique le stockage et sauvegarde depuis l’accueil', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Vos projets restent uniquement')).toBeVisible()
  await page.locator('input[name="name"]').fill('Sauvegarde locale')
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('save-state')).toBeVisible()
  await page.goto('/')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sauvegarder Sauvegarde locale (.json)' }).click()
  expect((await download).suggestedFilename()).toContain('.betterdraw.json')
})

test('propose une issue quand IndexedDB est inaccessible', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () { throw new DOMException('Refus', 'SecurityError') }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Stockage local inaccessible')
  await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible()
})

test('réduit une grande image en conservant son placement proportionnel', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('save-state')).toBeVisible()
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 4096; c.height = 2048
    c.getContext('2d')!.fillRect(0, 0, c.width, c.height)
    return c.toDataURL('image/png').split(',')[1]
  })
  await page.getByTestId('image-input').setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByTestId('image-row')).toHaveCount(1)
  await page.waitForTimeout(500)
  const result = await page.evaluate(async () => {
    const modulePath = '/src/store/db.ts'
    const { db } = await import(/* @vite-ignore */ modulePath)
    const image = (await db.images.toArray())[0]
    const variant = (await db.variants.toArray())[0]
    return { width: image.width, height: image.height, placed: variant.state.images[0] }
  })
  expect(result.width).toBe(2048)
  expect(result.height).toBe(1024)
  expect(result.placed.w).toBeCloseTo(240)
  expect(result.placed.h).toBeCloseTo(120)
  expect(result.placed.x).toBeCloseTo(30)
})

test('un quota atteint laisse une alerte durable et une sauvegarde de secours', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.evaluate(async () => {
    const path = '/src/store/editor.ts'
    const { useEditor } = await import(/* @vite-ignore */ path)
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      const request = put.apply(this, args)
      const tx = this.transaction
      if (this.name === 'projects') request.addEventListener('success', () => {
        IDBObjectStore.prototype.put = put
        Object.defineProperty(tx, 'error', { value: new DOMException('Quota', 'QuotaExceededError') })
        tx.abort()
      }, { once: true })
      return request
    }
    useEditor.getState().commit('Modification sans espace', (d: { wall: { w: number } }) => { d.wall.w = 456 })
  })
  await expect(page.getByRole('alert')).toContainText('Espace de stockage insuffisant')
  await expect(page.getByTestId('save-state')).toHaveText('Échec de l’enregistrement')
  const banner = await page.getByRole('alert').boundingBox()
  expect(banner!.width).toBeGreaterThan(800)
  expect(banner!.y).toBeGreaterThanOrEqual(0)
  expect(banner!.y + banner!.height).toBeLessThanOrEqual(600)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sauvegarder l’état affiché', exact: false }).click()
  const file = await downloaded
  expect(file.suggestedFilename()).toContain('secours.betterdraw.json')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.goBack()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Espace de stockage insuffisant')
  let prompts = 0
  page.on('dialog', async (dialog) => { prompts++; await dialog.accept() })
  await page.getByRole('button', { name: 'Gérer l’espace depuis l’accueil' }).click()
  await expect(page.getByTestId('new-project-form')).toBeVisible()
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click()
  await expect(page.getByTestId('canvas')).toBeVisible()
  expect(prompts).toBe(1)
})

test('un nettoyage défaillant laisse l’accueil et les sauvegardes accessibles', async ({ page }) => {
  await page.addInitScript(() => {
    const keys = IDBObjectStore.prototype.getAllKeys
    IDBObjectStore.prototype.getAllKeys = function (...args: Parameters<typeof keys>) {
      if (this.name === 'images') throw new DOMException('Lecture refusée', 'UnknownError')
      return keys.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByTestId('new-project-form')).toBeVisible()
  await expect(page.getByText('Vos projets restent uniquement')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('explique les fichiers qui ne sont pas des sauvegardes JSON', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('import-project').setInputFiles({ name: 'invalide.json', mimeType: 'application/json', buffer: Buffer.from('not json') })
  await expect(page.getByTestId('import-msg')).toContainText('ce n’est pas une sauvegarde JSON valide')
  await page.getByTestId('import-project').setInputFiles({ name: 'autre.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":true}') })
  await expect(page.getByTestId('import-msg')).toContainText('Ce fichier n’est pas un projet BetterDraw')
})

test('un quota sur le plan reste visible et protège la sortie', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('plan')).toBeVisible()
  await page.getByTestId('layout-plan').click()
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Quota', 'QuotaExceededError') }
  })
  await page.getByTestId('room-floor').fill('#112233')
  await expect(page.getByRole('alert')).toContainText('Espace de stockage insuffisant')
  await expect(page.getByTestId('room-save-state')).toHaveText('Échec de l’enregistrement')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Projets', exact: true }).click()
  await expect(page.getByTestId('plan')).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sauvegarder le plan affiché (.json)' }).click()
  expect((await downloaded).suggestedFilename()).toContain('secours.betterdraw.json')
})
