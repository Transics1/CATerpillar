/**
 * Loads server/.env by absolute path.
 *
 * `import 'dotenv/config'` resolves relative to process.cwd(), which is the repo root when
 * scripts run through npm workspaces — so it silently missed server/.env. Import this module
 * first in any entrypoint.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })
