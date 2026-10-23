import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    // jsdom creation dominated the test run (84% of the tracked time -- one
    // environment per file). vmThreads keeps per-file module isolation while
    // reusing one environment per worker thread.
    pool: 'vmThreads',
  },
})
