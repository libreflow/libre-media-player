// Test-only ambient declaration: the vitest tests install a module-level
// process.on('unhandledRejection') listener to turn unhandled rejections
// into test failures. The app tsconfig deliberately keeps `types` limited
// to vite/client (no node), so `process` is not declared in the DOM lib.
// @types/node is a devDependency; declaring just the member we use here
// keeps `tsc -b` (which includes src/**) green without widening `types`.
declare const process: {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void
}
