// scripts/add-js-extensions.mjs
// Usage: node scripts/add-js-extensions.mjs --dry   (preview only)
//        node scripts/add-js-extensions.mjs         (apply)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src');
const SKIP_DIRS = new Set(['generated', 'node_modules']); // Prisma writes its own imports
const DRY = process.argv.includes('--dry');

// Matches relative specifiers only:  from './x'  |  import './x'  |  import('./x')
const SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.{1,2}(?:\/[^'"\n]*)?)\2/g;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (full.endsWith('.ts')) {
      yield full;
    }
  }
}

// Returns the specifier with an extension, or null when no matching file exists
function withExtension(fileDir, spec) {
  if (/\.(js|mjs|cjs|json)$/.test(spec)) return spec;
  if (spec.endsWith('.ts')) return spec.replace(/\.ts$/, '.js');
  const target = path.resolve(fileDir, spec);
  if (fs.existsSync(`${target}.ts`)) return `${spec}.js`;
  if (fs.existsSync(path.join(target, 'index.ts'))) {
    return `${spec.replace(/\/$/, '')}/index.js`;
  }
  return null;
}

let changedFiles = 0;
const unresolved = [];

for (const file of walk(ROOT)) {
  const source = fs.readFileSync(file, 'utf8');
  const fileDir = path.dirname(file);

  const output = source
    .replace(SPECIFIER, (match, prefix, quote, spec) => {
      const fixed = withExtension(fileDir, spec);
      if (fixed === null) {
        unresolved.push(`${path.relative(process.cwd(), file)}: ${spec}`);
        return match;
      }
      return `${prefix}${quote}${fixed}${quote}`;
    })
    // bcrypt is a CommonJS package: a default import is the safest form in ESM
    .replace(
      /import \* as bcrypt from 'bcrypt'/g,
      "import bcrypt from 'bcrypt'",
    );

  if (output !== source) {
    changedFiles++;
    if (!DRY) fs.writeFileSync(file, output);
    console.log(
      `${DRY ? '[dry] ' : ''}updated ${path.relative(process.cwd(), file)}`,
    );
  }
}

console.log(`\n${changedFiles} file(s) ${DRY ? 'would be ' : ''}updated`);
if (unresolved.length > 0) {
  console.log('\nCould not resolve (fix by hand):');
  unresolved.forEach((item) => console.log(`  ${item}`));
}
