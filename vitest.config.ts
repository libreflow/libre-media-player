import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    // jsdom creation dominated the test run (84% of the tracked time -- one
    // environment per file). vmThreads keeps per-file module isolation while
    // reusing one environment per worker thread.
    pool: 'vmThreads',
    // Tests assert French UI strings; jsdom defaults to en-US which the
    // system-locale auto-detection (i18n.ts detectSystemLocale) would pick
    // up. Pin the environment language to French so the app under test boots
    // in the same language its assertions expect.
    setupFiles: ['src/test-setup.ts'],
  },
})
