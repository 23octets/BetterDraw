import assert from 'node:assert/strict'
import { experimental_readRawConfig } from 'wrangler'

// `preview` n'a pas de dry-run et exige ce bloc, même vide. Le dry-run de
// production ne détecte pas son absence. Utiliser le parseur de Wrangler pour JSONC.
const { rawConfig } = experimental_readRawConfig({ config: process.argv[2] ?? 'wrangler.jsonc' })
assert.ok(rawConfig.previews && typeof rawConfig.previews === 'object' && !Array.isArray(rawConfig.previews),
  'wrangler preview exige un bloc previews dans wrangler.jsonc ({} suffit pour ce site statique)')
