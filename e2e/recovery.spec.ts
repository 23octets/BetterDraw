import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { resetDb, newProject } from './helpers'

test('deux onglets : conflit visible, secours téléchargeable, aucun écrasement', async ({ page, context }) => {
  await resetDb(page)
  await newProject(page, 'Concurrence')
  const other = await context.newPage()
  await other.goto(page.url())
  await other.getByTestId('canvas').waitFor()
  const change = async (p: typeof page, width: number) => p.evaluate(async (w) => {
    const path = '/src/store/editor.ts'
    const { useEditor, flushPersistence } = await import(/* @vite-ignore */ path)
    useEditor.getState().commit('Largeur', (d: { wall: { w: number } }) => { d.wall.w = w })
    await flushPersistence()
  }, width)
  await change(page, 321)
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await change(other, 333)
  await expect(other.getByRole('alert')).toContainText('autre onglet')
  await expect(other.getByTestId('save-state')).toHaveText('Non enregistré')
  await other.waitForTimeout(3600)
  await expect(other.getByTestId('save-state')).toHaveText('Non enregistré')
  await other.getByRole('button', { name: 'Projets', exact: true }).click()
  await expect(other.getByTestId('canvas')).toBeVisible()
  await expect(other.getByRole('alert')).toContainText('autre onglet')
  await other.getByTestId('variants-page').click()
  await expect(other.getByTestId('snapshot')).toBeDisabled()
  await other.getByTestId('close-variants').click()
  await other.getByTestId('export').click()
  const backup = other.waitForEvent('download')
  await other.getByTestId('export-json').click()
  const backupPath = (await (await backup).path())!
  const data = JSON.parse(await readFile(backupPath, 'utf8'))
  expect(data.variants[0].state.wall.w).toBe(333)
  expect(data.variants[0].headSeq).toBe(0)
  await other.getByRole('button', { name: 'Fermer', exact: true }).click()
  const download = other.waitForEvent('download')
  await other.getByRole('button', { name: 'Exporter le secours' }).click()
  expect((await download).suggestedFilename()).toBe('frsque-secours.json')
  await page.reload()
  await page.getByTestId('canvas').waitFor()
  expect(await page.evaluate(async () => {
    const path = '/src/store/editor.ts'
    return (await import(/* @vite-ignore */ path)).useEditor.getState().doc.wall.w
  })).toBe(321)
  await other.close()
})

test('attend une sauvegarde saine avant de quitter le dessin', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Navigation')
  await page.evaluate(async () => {
    const storePath = '/src/store/editor.ts'
    const routerPath = '/src/ui/router.ts'
    const { useEditor } = await import(/* @vite-ignore */ storePath)
    const { navigate } = await import(/* @vite-ignore */ routerPath)
    useEditor.getState().commit('Largeur', (d: { wall: { w: number } }) => { d.wall.w = 345 })
    await navigate('/')
    if (useEditor.getState().message?.kind === 'error') throw new Error('Erreur malgré une sauvegarde saine')
  })
  await expect(page).toHaveURL(/#\/$/)
})
