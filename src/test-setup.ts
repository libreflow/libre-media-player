// Shared vitest setup: pin the jsdom navigator to French. Tests assert
// French UI strings, and the app's 'auto' locale setting resolves through
// detectSystemLocale() (src/i18n.ts) -- jsdom's en-US default would flip
// the whole rendered UI to English before any explicit choice is made.
Object.defineProperty(navigator, 'languages', { value: ['fr-FR', 'fr'], configurable: true })
Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true })
