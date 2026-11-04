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
  expect((await download).suggestedFilename()).toContain('.frsque.json')
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
  await expect(page.getByTestId('save-state')).toHaveText('Non enregistré')
  const banner = await page.getByRole('alert').boundingBox()
  expect(banner!.width).toBeGreaterThan(800)
  expect(banner!.y).toBeGreaterThanOrEqual(0)
  expect(banner!.y + banner!.height).toBeLessThanOrEqual(600)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sauvegarder l’état affiché', exact: false }).click()
  const file = await downloaded
  expect(file.suggestedFilename()).toContain('secours.frsque.json')
  await page.goBack()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Espace de stockage insuffisant')
  await page.getByTestId('variants-page').click()
  await expect(page.getByTestId('snapshot-from-card')).toBeDisabled()
  await expect(page.getByText('if (!await requireSaved()) return')).toHaveCount(0)
  await page.getByTestId('close-variants').click()
  const opened = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Gérer l’espace depuis l’accueil' }).click()
  const home = await opened
  await expect(home.getByTestId('new-project-form')).toBeVisible()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Espace de stockage insuffisant')
  await home.close()
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.getByRole('button', { name: 'Projets', exact: true }).click()
  await expect(page.getByTestId('new-project-form')).toBeVisible()
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click()
  await expect(page.getByTestId('canvas')).toBeVisible()
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
  await expect(page.getByTestId('import-msg')).toContainText('Ce fichier n’est pas un projet frsque')
})

test('un quota après scission du plan permet une sauvegarde réimportable', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('plan')).toBeVisible()
  await page.getByTestId('layout-plan').click()
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    const add = IDBObjectStore.prototype.add
    const scope = window as unknown as { restoreStorage: () => void }
    scope.restoreStorage = () => { IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.add = add }
    IDBObjectStore.prototype.put = IDBObjectStore.prototype.add = function () { throw new DOMException('Quota', 'QuotaExceededError') }
  })
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('split-wall').click()
  await expect(page.getByRole('alert')).toContainText('Espace de stockage insuffisant')
  await expect(page.getByTestId('room-save-state')).toHaveText('Échec de l’enregistrement')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Projets', exact: true }).click()
  await expect(page.getByTestId('plan')).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sauvegarder le plan affiché (.json)' }).click()
  const file = await downloaded
  expect(file.suggestedFilename()).toContain('secours.frsque.json')
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage())
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Accueil et sauvegardes', exact: true }).click()
  await page.getByTestId('import-project').setInputFiles((await file.path())!)
  await expect(page.getByTestId('import-msg')).toContainText('importé')
  await page.getByTestId('open-room').first().click()
  await expect(page.getByTestId('room-wall-item')).toHaveCount(5)
})

test('convertit une petite image BMP en format de sauvegarde courant', async ({ page }) => {
  const bmp = Buffer.alloc(70)
  bmp.write('BM')
  bmp.writeUInt32LE(70, 2)
  bmp.writeUInt32LE(54, 10)
  bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(2, 18)
  bmp.writeInt32LE(2, 22)
  bmp.writeUInt16LE(1, 26)
  bmp.writeUInt16LE(24, 28)
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.getByTestId('image-input').setInputFiles({ name: 'reference.bmp', mimeType: 'image/bmp', buffer: bmp })
  await expect(page.getByTestId('image-row')).toHaveCount(1)
  const format = await page.evaluate(async () => {
    const path = '/src/store/db.ts'
    const { db } = await import(/* @vite-ignore */ path)
    return (await db.images.toArray())[0].dataUrl.split(';')[0]
  })
  expect(format).toBe('data:image/webp')
})

test('une sauvegarde incomplète demande confirmation et conserve son avertissement', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.getByTestId('image-input').setInputFiles('e2e/fixtures/croquis.png')
  await expect(page.getByTestId('image-row')).toHaveCount(1)
  await page.evaluate(async () => {
    const editorPath = '/src/store/editor.ts'
    const { flushPersistence } = await import(/* @vite-ignore */ editorPath)
    await flushPersistence()
    const dbPath = '/src/store/db.ts'
    const { db } = await import(/* @vite-ignore */ dbPath)
    await db.images.clear()
  })
  await page.goto('/')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: /Sauvegarder .*\(\.json\)/ }).click()
  await expect(page.getByTestId('import-msg')).toHaveText('Sauvegarde annulée.')
  page.once('dialog', (dialog) => dialog.accept())
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: /Sauvegarder .*\(\.json\)/ }).click()
  await downloaded
  await expect(page.getByTestId('import-msg')).toContainText('Sauvegarde incomplète téléchargée')
  await expect(page.getByTestId('import-msg')).toContainText('images sont absentes')
})

test('la sortie attend un enregistrement de pièce encore en cours avant de signaler son échec', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
  await expect(page.getByTestId('plan')).toBeVisible()
  await page.getByTestId('layout-plan').click()
  await page.evaluate(async () => {
    const path = '/src/store/db.ts'
    const { db } = await import(/* @vite-ignore */ path)
    const toArray = db.Collection.prototype.toArray
    db.Collection.prototype.toArray = async function (...args: unknown[]) {
      const result = await toArray.apply(this, args)
      await new Promise((resolve) => setTimeout(resolve, 500))
      return result
    }
    IDBObjectStore.prototype.put = function () { throw new DOMException('Quota', 'QuotaExceededError') }
  })
  let prompts = 0
  page.once('dialog', async (dialog) => { prompts++; await dialog.dismiss() })
  await page.getByTestId('room-floor').fill('#112233')
  await page.getByRole('button', { name: 'Projets', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Espace de stockage insuffisant')
  await expect(page.getByTestId('plan')).toBeVisible()
  expect(prompts).toBe(1)
})
