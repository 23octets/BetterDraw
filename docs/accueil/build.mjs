// Assemble les maquettes à partir des fichiers *.src.html, puis les capture.
//   <!--@nom-->                         fragment de partials.mjs
//   <!--@each liste-->…{{champ}}…<!--@end-->   répète le bloc pour chaque projet de la liste
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as P from './partials.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const out = []
for (const f of readdirSync(dir).filter((f) => f.endsWith('.src.html')).sort()) {
  let html = readFileSync(join(dir, f), 'utf8')
  html = html.replace(/<!--@each (\w+)-->([\s\S]*?)<!--@end-->/g, (_, list, tpl) =>
    P[list].map((p) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (!(k in p)) throw new Error(`${f} : champ inconnu ${k}`)
      return p[k]
    })).join(''))
  html = html.replace(/<!--@(\w+)-->/g, (_, k) => {
    if (typeof P[k] !== 'string') throw new Error(`${f} : fragment inconnu ${k}`)
    return P[k]
  })
  const name = f.replace('.src.html', '.html')
  writeFileSync(join(dir, name), html)
  out.push(name)
}

if (process.argv.includes('--shots')) {
  mkdirSync(join(dir, 'shots'), { recursive: true })
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
  const { chromium } = await import('playwright')
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
  // [suffixe, largeur, hauteur, paramètres d'URL, page entière ?]
  const views = [
    ['retour', 1440, 900, '', true], ['retour-pli', 1440, 900, '', false],
    ['premier', 1440, 900, '?vide', true], ['premier-pli', 1440, 900, '?vide', false],
    ['retour-mobile', 390, 844, '', true], ['premier-mobile', 390, 844, '?vide', true],
    ['piece-pli', 1440, 900, '?piece', false], ['premier-piece-pli', 1440, 900, '?vide&piece', false],
    ['menu-pli', 1440, 900, '?menu', false], ['beaucoup', 1440, 900, '?beaucoup', true],
    ['tablette', 820, 1180, '', true],
    ['dessin-pli', 1440, 900, '?dessin&case', false], ['premier-tablette', 820, 1180, '?vide', true],
    ['refus-bas', 1440, 900, '?refus', true], ['long-pli', 1440, 900, '?long', false], ['long-mobile', 390, 844, '?long', false],
  ]
  for (const name of out.filter((n) => !only || n.startsWith(only))) {
    for (const [tag, width, height, q, full] of views) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 500 ? 2 : 1 })
      const errors = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.goto('file://' + join(dir, name) + q)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(tag.startsWith('premier') ? 2600 : 500)
      await page.screenshot({ path: join(dir, 'shots', `${name.replace('.html', '')}-${tag}.png`), fullPage: full })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow || errors.length) console.log(name, tag, 'débordement horizontal:', overflow, errors)
      await page.close()
    }
  }
  await browser.close()
}
console.log('ok', out.join(' '))
