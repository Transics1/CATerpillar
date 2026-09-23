// dotenv resolves against process.cwd(), which is the repo root under npm workspaces. Load by
// absolute path instead, and import this first in any entrypoint.
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })
