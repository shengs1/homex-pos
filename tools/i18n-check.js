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
  /t\(\s*"([^"\\]+)"\s*\)/g,
  /t\(\s*'([^'\\]+)'\s*\)/g,
  /t\(\s*`([^`\\]*(?:\\`[^`\\]*)*)`\s*\)/g,
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
  const dyn = [...content.matchAll(/t\(\s*`([^`]*)`\s*\)/g)].map(x=>x[1]).filter(s=>s.includes('${'));
  if (dyn.length){
    dynamicUsages.set(file, (dynamicUsages.get(file)||[]).concat(dyn));
  }
}

console.log('Dictionary keys count:', dictKeys.size);
console.log('Files scanned:', files.length);
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
