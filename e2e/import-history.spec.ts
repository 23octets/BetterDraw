import { test, expect } from '@playwright/test'
import { defaultDoc } from '../src/model/defaults'

test('récupérer une sauvegarde dont seul l’historique est corrompu', { tag: '@essentiel' }, async ({ page }) => {
  await page.goto('/')
  const file = { format: 'betterdraw-project', version: 1, project: { id: 'p', name: 'Récupéré', createdAt: 1 },
    variants: [{ id: 'v', projectId: 'p', name: 'A', createdAt: 1, updatedAt: 1, headSeq: 1, maxSeq: 1, state: defaultDoc() }],
    entries: [{ variantId: 'v', seq: 1, label: 'mur', ts: 1, patches: [], inverse: [{ op: 'replace', path: ['wall'], value: null }] }], images: [] }
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('sans historique')
    await dialog.accept()
  })
  await page.getByTestId('import-project').setInputFiles({ name: 'projet.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.getByTestId('import-msg')).toContainText('« Récupéré » importé')
  await expect(page.getByTestId('project-card')).toContainText('Récupéré')
})

test('annuler une sauvegarde incomplète ne confirme aucun téléchargement', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[name=name]').fill('Abîmé')
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.getByTestId('canvas').waitFor()
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('betterdraw')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('variants', 'readwrite')
        const table = tx.objectStore('variants')
        const read = table.getAll()
        read.onsuccess = () => {
          const variant = read.result[0]
          variant.state.images = [{ id: 'im', blobId: 'perdu', name: 'x', x: 0, y: 0, w: 1, h: 1, opacity: 1, locked: false, visible: true }]
          table.put(variant)
        }
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      request.onerror = () => reject(request.error)
    })
  })
  let downloads = 0
  page.on('download', () => { downloads++ })
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('incomplète')
    await dialog.dismiss()
  })
  await page.getByTestId('export').click()
  await page.getByTestId('export-json').click()
  await expect(page.getByTestId('export-json')).toBeEnabled()
  await expect(page.getByText('Sauvegarde du projet : téléchargé', { exact: true })).toHaveCount(0)
  expect(downloads).toBe(0)
})
