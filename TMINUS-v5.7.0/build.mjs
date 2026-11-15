// T-MINUS static build: native ES modules, no bundler required.
// All imports are relative and vendored; works directly in modern desktop browsers.
// Keeping the entry module small guarantees that source fixes are not hidden by an
// out-of-date pre-generated bundle.
import {readFile, writeFile} from 'node:fs/promises';
const {version} = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const entry = `// T-MINUS v${version} · browser-native ES module release\nimport './game.js';\n`;
const target = process.argv[2] || `dist/t-minus-v${version}.js`;
await writeFile(target, entry);
console.log(`Built ${target} (native module entry; all game modules and vendor assets in dist/)`);
