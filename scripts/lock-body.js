import fs from 'node:fs/promises'
import path from 'node:path'
import { createBodyLock } from '../src/body-lock.js'
const requested = path.resolve(process.argv[2])
const articlePath = (await fs.stat(requested)).isDirectory() ? path.join(requested, 'index.md') : requested
console.log(await createBodyLock(articlePath))
