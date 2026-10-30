import { readFileSync } from 'node:fs'

// Cross-language consistency checks that no per-language linter can catch:
// 1. The video extension list is triplicated (TS utils, Rust lib.rs, NSIS
//    hooks + tauri.conf.json) -- a divergence silently breaks file
//    association, drag-drop filtering or the open-with flow for the
//    missing extension.
// 2. The ProgIds in hooks.nsh must match tauri.conf.json's
//    bundle.fileAssociations[].name verbatim (Tauri uses that name as the
//    ProgId; a mismatch points Default Programs at a ProgId that doesn't
//    exist).
// 3. package.json, tauri.conf.json and Cargo.toml must carry the same
//    version -- nothing else keeps the three in sync.
// Exits non-zero with a clear message on any mismatch.

const ROOT = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8')

function fail(msg) {
  console.error(`consistency: ${msg}`)
  process.exit(1)
}

// --- 1. Video extensions: TS <-> Rust <-> tauri.conf.json <-> NSIS ---

const tsList = read('src/utils.ts').match(/export const VIDEO_EXTENSIONS = \[([^\]]+)\]/)[1]
const tsExtensions = [...tsList.matchAll(/'([^']+)'/g)].map((m) => m[1])

const rustList = read('src-tauri/src/lib.rs').match(/const VIDEO_EXTENSIONS: &\[&str\] = &\[(.*?)\];/s)[1]
const rustExtensions = [...rustList.matchAll(/"([^"]+)"/g)].map((m) => m[1])

const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json'))
const confExtensions = tauriConf.bundle.fileAssociations.flatMap((fa) => fa.ext)

const nsis = read('src-tauri/windows/hooks.nsh')
// Handles both the one-line form and NSIS's line-continuation (backslash)
// form used for the FileAssociations entries.
const nsisExtensions = [
  ...nsis
    .replace(/\\\n\s*/g, ' ')
    .matchAll(/WriteRegStr SHCTX "[^"]*FileAssociations" "\.(\w+)" "(.+?)"/g),
].map((m) => [m[1], m[2]])

// Same membership, ignoring order (the lists are grouped differently per
// file: tauri.conf.json groups extensions by ProgId, utils.ts by codec).
const same = (a, b) =>
  a.length === b.length && a.every((ext) => b.includes(ext)) && b.every((ext) => a.includes(ext))

for (const [label, list] of [
  ['src/utils.ts', tsExtensions],
  ['src-tauri/src/lib.rs', rustExtensions],
  ['tauri.conf.json fileAssociations', confExtensions],
  ['windows/hooks.nsh', nsisExtensions.map(([ext]) => ext)],
]) {
  if (!same(list, tsExtensions)) {
    fail(`video extension list mismatch between src/utils.ts and ${label}:\n  utils.ts: ${tsExtensions.join(', ')}\n  ${label}: ${list.join(', ')}`)
  }
}

// --- 2. ProgIds: hooks.nsh <-> tauri.conf.json fileAssociations[].name ---

const confProgIds = new Set(tauriConf.bundle.fileAssociations.map((fa) => fa.name))
for (const [, progId] of nsisExtensions) {
  if (!confProgIds.has(progId)) {
    fail(`hooks.nsh references ProgId "${progId}" which no tauri.conf.json fileAssociations[].name declares`)
  }
}

// --- 3. MIME types: one canonical type per extension in tauri.conf.json ---
// A mimeType copy-pasted from another entry (e.g. video/x-matroska on .avi)
// produces a wrong shared-mime-info registration on Linux and a misleading
// "Open with" description elsewhere. Map each extension to its canonical
// IANA/freedesktop type so a wrong one fails CI instead of shipping.
const CANONICAL_MIME_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv',
  ts: 'video/mp2t',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
}

for (const fa of tauriConf.bundle.fileAssociations) {
  for (const ext of fa.ext) {
    if (fa.mimeType !== CANONICAL_MIME_TYPES[ext]) {
      fail(
        `tauri.conf.json: extension .${ext} has mimeType "${fa.mimeType}", expected "${CANONICAL_MIME_TYPES[ext]}"`,
      )
    }
  }
}

// --- 4. Versions: package.json <-> tauri.conf.json <-> Cargo.toml ---

const pkgVersion = JSON.parse(read('package.json')).version
// Restrict to the [package] section so dependency versions don't match.
const cargoVersion = read('src-tauri/Cargo.toml').match(/^version = "(.+)"$/m)[1]
if (tauriConf.version !== pkgVersion) {
  fail(`version mismatch: package.json ${pkgVersion} vs tauri.conf.json ${tauriConf.version}`)
}
if (cargoVersion !== pkgVersion) {
  fail(`version mismatch: package.json ${pkgVersion} vs Cargo.toml ${cargoVersion}`)
}

console.log(
  `consistency: OK (${tsExtensions.length} extensions, ${confProgIds.size} ProgIds, version ${pkgVersion})`,
)
