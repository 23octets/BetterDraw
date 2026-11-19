// Sauvegarde cohérente d'un environnement de comptes : compteur D1 puis données Dexie Cloud.
// Usage : node scripts/sauvegarder-comptes.mjs <dev|prod> [dossier]
// Les clés Dexie sont lues dans ~/.config/betterdraw/dexie-<env>/ et ne sont jamais copiées.
// Le dossier de sortie (par défaut ~/.config/betterdraw/sauvegardes/<env>/<horodatage>) doit rester privé.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const envs = {
  dev: { database: 'betterdraw-accounts-dev', config: 'wrangler.dev.jsonc' },
  prod: { database: 'betterdraw-accounts-prod', config: 'wrangler.jsonc' },
}
const name = process.argv[2]
const target = envs[name]
if (!target) {
  console.error('Usage : node scripts/sauvegarder-comptes.mjs <dev|prod> [dossier]')
  process.exit(2)
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const out = resolve(process.argv[3] ?? join(homedir(), '.config/betterdraw/sauvegardes', name, stamp))
const dexieDir = join(homedir(), '.config/betterdraw', `dexie-${name}`)
mkdirSync(out, { recursive: true, mode: 0o700 })

const root = resolve(import.meta.dirname, '..')
const bin = (tool) => join(root, 'node_modules/.bin', tool)

// 1. D1 d'abord : une place réservée sans compte Dexie est sans danger, l'inverse ne l'est pas.
execFileSync(bin('wrangler'), ['d1', 'export', target.database, '--remote', '--config', target.config,
  '--output', join(out, `${target.database}.sql`)], { cwd: root, stdio: 'inherit' })

// 2. Dexie Cloud : schéma, rôles et données (le CLI lit dexie-cloud.json/.key du dossier courant).
if (existsSync(join(dexieDir, 'dexie-cloud.key'))) {
  // CLI hors dépendances du projet : version figée pour des exports reproductibles.
  execFileSync('npx', ['--yes', 'dexie-cloud@3', 'export', join(out, 'dexie.json')], { cwd: dexieDir, stdio: 'inherit' })
} else {
  console.warn(`Aucune clé Dexie dans ${dexieDir} : seule la D1 est sauvegardée.`)
}

const files = readdirSync(out).map((f) => ({ fichier: f, octets: statSync(join(out, f)).size }))
writeFileSync(join(out, 'manifeste.json'), JSON.stringify({ environnement: name, date: new Date().toISOString(), files }, null, 2))
console.log(`Sauvegarde ${name} : ${out}`)
console.table(files)
