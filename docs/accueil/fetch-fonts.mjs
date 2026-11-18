// Télécharge les polices en woff2 (sous-ensembles latin et latin-ext) pour un hébergement local.
import { writeFileSync } from 'node:fs'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const sets = {
  archivo: 'family=Archivo:wdth,wght@62..125,100..900',
  barlow: 'family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700',
  bricolage: 'family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800',
  chantier: 'family=Big+Shoulders+Display:wght@700;800;900&family=Big+Shoulders+Stencil+Display:wght@800&family=Instrument+Sans:wght@400..700',
}
for (const [slug, q] of Object.entries(sets)) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${q}&display=swap`, { headers: { 'User-Agent': UA } })).text()
  let out = '', n = 0
  for (const m of css.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face \{[^}]+\})/g)) {
    if (m[1] !== 'latin' && m[1] !== 'latin-ext') continue
    const url = m[2].match(/url\((https:[^)]+\.woff2)\)/)[1]
    const file = `${slug}-${n++}.woff2`
    writeFileSync(`fonts/${file}`, Buffer.from(await (await fetch(url)).arrayBuffer()))
    out += m[2].replace(url, file) + '\n'
  }
  writeFileSync(`fonts/${slug}.css`, out)
  console.log(slug, n, 'fichiers')
}
