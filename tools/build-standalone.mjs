import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const planner = join(project, 'weekly-planner');

export function standaloneHTML(index, css, logic, app) {
  const importPattern = /^import \{[^\n]+\} from '\.\/logic\.mjs';\r?\n/;
  if (!importPattern.test(app)) throw new Error('Unexpected planner module import');
  if (!index.includes('<link rel="stylesheet" href="./style.css" />')) throw new Error('Missing stylesheet reference');
  if (!index.includes('<script type="module" src="./app.js"></script>')) throw new Error('Missing application module');
  const inlineLogic = logic.replace(/^export /gm, '');
  const script = app.replace(importPattern, inlineLogic + '\n');
  return index
    .replace('  <link rel="stylesheet" href="./style.css" />', '  <style>\n' + css + '\n  </style>')
    .replace('  <script type="module" src="./app.js"></script>\n', '')
    .replace('</body>', '  <script>\n' + script + '\n  </script>\n</body>');
}

const index = readFileSync(join(planner, 'index.html'), 'utf8');
const css = readFileSync(join(planner, 'style.css'), 'utf8');
const logic = readFileSync(join(planner, 'logic.mjs'), 'utf8');
const app = readFileSync(join(planner, 'app.js'), 'utf8');
const output = standaloneHTML(index, css, logic, app);
const outputPath = join(planner, 'planner-standalone.html');
if (process.argv.includes('--check')) {
  if (readFileSync(outputPath, 'utf8') !== output) {
    console.error('Standalone HTML is out of sync. Run node tools/build-standalone.mjs');
    process.exitCode = 1;
  } else console.log('Standalone HTML matches current Week List source.');
} else {
  writeFileSync(outputPath, output, 'utf8');
  console.log('Updated standalone HTML.');
}
