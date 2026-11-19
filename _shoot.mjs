import { chromium } from 'playwright'
const out = process.argv[2], U = 'http://localhost:5211/'
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.goto(U); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500)
await p.screenshot({ path: out + '/premier.png', fullPage: true })
await p.getByTestId('kind-room').click(); await p.screenshot({ path: out + '/premier-piece.png' }); await p.getByTestId('kind-wall').click()
// trois projets : un mur vide, une pièce, puis l'exemple (le plus récent)
await p.locator('input[name=name]').fill('Salon, mur du canapé'); await p.locator('input[name=width]').fill('420'); await p.getByRole('button', { name: 'Créer le projet' }).click(); await p.getByTestId('canvas').waitFor(); await p.goto(U)
await p.getByTestId('kind-room').click(); await p.locator('input[name=name]').fill('Studio'); await p.getByRole('button', { name: 'Créer le projet' }).click(); await p.waitForTimeout(1500); await p.goto(U)
await p.getByRole('button', { name: 'Ouvrir le projet exemple' }).first().click(); await p.getByTestId('canvas').waitFor(); await p.goto(U)
await p.waitForTimeout(600)
await p.screenshot({ path: out + '/retour.png', fullPage: true })
await p.getByTestId('project-menu').first().click(); await p.screenshot({ path: out + '/menu.png' }); await p.keyboard.press('Escape')
for (const [n, w, h] of [['mobile', 390, 844], ['tablette', 820, 1180]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/retour-${n}.png`, fullPage: true }); console.log(n, 'débordement', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) }
console.log('erreurs', errs)
await b.close()
