import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['engines/**/*.test.ts', 'lib/**/*.test.ts'] } })
