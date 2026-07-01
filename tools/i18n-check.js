const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const langFile = path.join(root, 'frontend', 'contexts', 'language-context.tsx');

function readFile(p){ return fs.readFileSync(p, 'utf8'); }

const langContent = readFile(langFile);
// extract all keys from language-context by matching "key":
const keyRegex = /"([^"\\]+)"\s*:\s*"/g;
const dictKeys = new Set();
let m;
while ((m = keyRegex.exec(langContent)) !== null){ dictKeys.add(m[1]); }

function extractKeysBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return new Set();
  const section = content.slice(start, end);
  const keys = new Set();
  let match;
  const rx = /"([^"\\]+)"\s*:\s*"/g;
  while ((match = rx.exec(section)) !== null) keys.add(match[1]);
  return keys;
}

function unionSets(...sets) {
  const out = new Set();
  sets.forEach((set) => set.forEach((value) => out.add(value)));
  return out;
}

function difference(left, right) {
  return [...left].filter((key) => !right.has(key)).sort();
}

const viKeys = unionSets(
  extractKeysBetween(langContent, 'const vi: Dictionary = {', 'const en: Dictionary = {'),
  extractKeysBetween(langContent, 'const megaVi: Dictionary = {', 'const megaEn: Dictionary = {')
);
const enKeys = unionSets(
  extractKeysBetween(langContent, 'const en: Dictionary = {', 'const megaVi: Dictionary = {'),
  extractKeysBetween(langContent, 'const megaEn: Dictionary = {', 'const dictionaries: Record<Language, Dictionary> =')
);
const missingViKeys = difference(enKeys, viKeys);
const missingEnKeys = difference(viKeys, enKeys);
// walk frontend files
function walk(dir){
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries){
    const p = path.join(dir, e.name);
    if (e.isDirectory()){
      if (['node_modules', '.next', 'dist', 'out'].includes(e.name)) continue;
      results.push(...walk(p));
    }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) results.push(p);
  }
  return results;
}

const frontendDir = path.join(root, 'frontend');
const files = walk(frontendDir);

const usageRegexes = [
  /\bt\(\s*"([^"\\]+)"\s*\)/g,
  /\bt\(\s*'([^'\\]+)'\s*\)/g,
  /\bt\(\s*`([^`\\]*(?:\\`[^`\\]*)*)`\s*\)/g,
];

const missing = new Map();
const dynamicUsages = new Map();

for (const file of files){
  const content = readFile(file);
  usageRegexes.forEach((rx) => {
    let mm;
    while ((mm = rx.exec(content)) !== null){
      const key = mm[1];
      // ignore template literals with ${
      if (key.includes('${')){
        if (!dynamicUsages.has(file)) dynamicUsages.set(file, []);
        dynamicUsages.get(file).push(key);
        continue;
      }
      if (!dictKeys.has(key)){
        if (!missing.has(key)) missing.set(key, new Set());
        missing.get(key).add(file);
      }
    }
  });
  // also detect t(`status.${...}`) style where backtick contains ${
  const dyn = [...content.matchAll(/\bt\(\s*`([^`]*)`\s*\)/g)].map(x=>x[1]).filter(s=>s.includes('${'));
  if (dyn.length){
    dynamicUsages.set(file, (dynamicUsages.get(file)||[]).concat(dyn));
  }
}

console.log('Dictionary keys count:', dictKeys.size);
console.log('VI keys count:', viKeys.size);
console.log('EN keys count:', enKeys.size);
console.log('Files scanned:', files.length);
console.log('');
if (missingViKeys.length || missingEnKeys.length) {
  if (missingViKeys.length) console.log('Keys missing in VI:', missingViKeys.join(', '));
  if (missingEnKeys.length) console.log('Keys missing in EN:', missingEnKeys.join(', '));
} else console.log('VI/EN dictionaries have matching key sets.');

console.log('');
if (missing.size===0) console.log('No missing static keys found.');
else{
  console.log('Missing keys (used but not defined):');
  for (const [k, filesSet] of missing.entries()){
    console.log('-', k);
    for (const f of filesSet) console.log('   ', path.relative(root, f));
  }
}

console.log('');
if (dynamicUsages.size){
  console.log('Dynamic usages (template keys or runtime keys) found:');
  for (const [f, arr] of dynamicUsages.entries()){
    console.log('-', path.relative(root, f));
    arr.forEach(a=>console.log('    ', a));
  }
} else console.log('No dynamic usages found.');

const hardcodedVietnamese = [];
const vietnameseRegex = /[\u00C0-\u1EF9]/;
const hardcodeIgnoreFiles = new Set([
  path.join(root, 'frontend', 'contexts', 'language-context.tsx'),
  path.join(root, 'frontend', 'lib', 'demo-products.ts'),
]);
function shouldIgnoreHardcodedLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//')
    || trimmed.startsWith('/*')
    || trimmed.startsWith('*')
    || trimmed.startsWith('{/*')
    || line.includes('.replace(/đ/g')
    || line.includes('.replace(/Đ/g')
    || line.includes('/back|rear|environment|sau|mặt sau|camera sau/i')
    || line.includes('/^(thiết bị|THIẾT BỊ)');
}

for (const file of files) {
  if (hardcodeIgnoreFiles.has(file)) continue;
  const rel = path.relative(root, file);
  const lines = readFile(file).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!vietnameseRegex.test(line)) return;
    if (shouldIgnoreHardcodedLine(line)) return;
    hardcodedVietnamese.push(`${rel}:${index + 1}: ${line.trim()}`);
  });
}

console.log('');
if (hardcodedVietnamese.length) {
  console.log('Hardcoded Vietnamese candidates:');
  hardcodedVietnamese.forEach((line) => console.log('-', line));
} else {
  console.log('No hardcoded Vietnamese candidates found outside dictionaries/demo data/comments.');
}






