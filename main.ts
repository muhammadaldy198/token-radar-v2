// Token Radar v2 — main.ts (Node 22, standard library only).
//
// Reads the sealed snapshot, scores every pre-token protocol with the model in
// lib/model.ts (Huber value fit + logistic odds + the v2 conditional-odds fix),
// writes the ranked board to /output/board.json, the dashboard's data to
// /output/data.js, copies dashboard/ and screenshots/ to /output, and writes
// /output/dossier.json with the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const started = Date.now();
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
mkdirSync(join(out, 'dashboard'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });

/** Write a file and leave it world-readable: the grader collects /output as
 *  another user, and a 0600 file fails as "not readable". */
function writeOut(rel: string, data: string | Uint8Array): void {
  const path = join(out, rel);
  writeFileSync(path, data);
  chmodSync(path, 0o644);
}

writeOut('board.json', `${JSON.stringify({ rows: board })}\n`);
writeOut('data.js', dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dot-names. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    chmodSync(join(to, name), 0o644);
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
  const size = statSync(join(out, 'screenshots', name)).size;
  if (size > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: screenshots/${name} is ${size} bytes, over the ${SCREENSHOT_CAPS.max_bytes} cap: re-export it smaller\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossierBytes = buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
writeOut('dossier.json', dossierBytes);

// Read the dossier back: fail loudly when the dashboard text was truncated
// (the "[Cut at" marker) or the dossier broke the 1.5 MiB hard cap, instead
// of handing the gate a quiet failure.
const dossierText = new TextDecoder().decode(dossierBytes);
if (dossierText.includes('[Cut at')) {
  process.stderr.write('token radar: the dashboard text hit the 65,536 byte cap and was truncated: shrink dashboard/ and rebuild\n');
  process.exit(1);
}
if (dossierBytes.length > 1_572_864) {
  process.stderr.write(`token radar: dossier.json is ${dossierBytes.length} bytes, over the 1.5 MiB cap\n`);
  process.exit(1);
}
const dossierTextLen = (JSON.parse(dossierText) as { text?: string }).text?.length ?? 0;

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const top = board[0]!;
process.stdout.write(
  `token radar v2: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.offListSize} off-list, ${radar.live_size} set aside) in ${elapsed}s\n` +
    `token radar v2: #1 ${top.slug} $${top.implied_value_usd.toLocaleString()} (v1 rank ${top.v1_rank ?? '—'}); value LOO x${radar.value.loo.toFixed(2)} vs flat x${radar.value.looFlat.toFixed(2)}; odds Brier ${radar.odds.brier.toFixed(3)} vs base ${radar.odds.brierBase.toFixed(3)}\n` +
    `token radar v2: dossier.json ${dossierBytes.length.toLocaleString()} bytes (${(dossierBytes.length / 1_572_864 * 100).toFixed(0)}% of the 1.5 MiB cap), dashboard text ${dossierTextLen.toLocaleString()} bytes of the 65,536 cap\n` +
    `token radar v2: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
