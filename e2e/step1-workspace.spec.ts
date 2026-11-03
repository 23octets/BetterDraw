import { expect, test } from '@playwright/test'
import { newProject, resetDb, setField, SHOTS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetDb(page)
})

test('création de projet, mur par défaut et grille cotée', async ({ page }) => {
  await page.screenshot({ path: `${SHOTS}/step1-01-accueil.png` })
  await newProject(page)
  await expect(page.getByTestId('project-name')).toHaveText('Chambre de Léa')
  await expect(page.getByTestId('wall')).toHaveAttribute('width', '300')
  await expect(page.getByTestId('wall')).toHaveAttribute('height', '250')
  const labels = page.getByTestId('grid-labels')
  await expect(labels.getByText('A', { exact: true })).toBeVisible()
  await expect(labels.getByText('F', { exact: true })).toBeVisible()
  await expect(labels.getByText('250', { exact: true })).toHaveCount(2)
  await expect(page.getByTestId('grid-summary')).toContainText('6 × 5 cases')
  await page.screenshot({ path: `${SHOTS}/step1-02-espace-de-travail.png` })
})

test('redimensionner le mur et la grille, enregistré en continu', async ({ page }) => {
  await newProject(page, 'Salon')
  await page.getByTestId('open-settings').click()
  await setField(page, 'wall-w', 420)
  await page.getByTestId('origin-tl').click()
  await page.screenshot({ path: `${SHOTS}/step14-01-reglages.png` })
  await page.getByTestId('close-settings').click()
  await expect(page.getByTestId('settings-modal')).toHaveCount(0)
  await setField(page, 'grid-step', 40)
  await expect(page.getByTestId('grid-summary')).toContainText('11 × 7 cases')
  await expect(page.getByTestId('grid-summary')).toHaveText("11 × 7 cases + ↔ 20 cm et ↕ 10 cm")
  await expect(page.getByTestId('grid-summary')).toHaveAttribute('title', /dernière colonne 20 cm · dernière ligne 10 cm/)
  await page.getByTestId('fit').click()
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.screenshot({ path: `${SHOTS}/step1-03-mur-420-grille-40.png` })
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.reload()
  await expect(page.getByTestId('wall')).toHaveAttribute('width', '420')
  await expect(page.getByTestId('grid-step')).toHaveValue('40')
  // annuler / rétablir
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('grid-step')).toHaveValue('50')
  // l'origine (haut-gauche) a bien été enregistrée
  await page.getByTestId('open-settings').click()
  await expect(page.getByRole('radio', { name: 'Haut gauche' })).toBeChecked()
  await expect(page.getByTestId('origin-tl')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-modal')).toHaveCount(0)
  await page.getByTestId('redo').click()
  await expect(page.getByTestId('grid-step')).toHaveValue('40')
})

test('liste des projets sur l’accueil', async ({ page }) => {
  await newProject(page, 'Projet 1')
  await page.getByRole('button', { name: 'Projets', exact: true }).click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await expect(page.getByTestId('project-card')).toContainText('300 × 250 cm')
})
