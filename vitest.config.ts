import { defineConfig } from 'vitest/config'
import { validators } from './build/validators'
export default defineConfig({ plugins: [validators()], test: { include: ['tests/**/*.test.ts'] } })
