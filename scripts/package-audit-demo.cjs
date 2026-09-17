'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const demo = path.resolve(__dirname, '../audit-demo');
const read = (name) => fs.readFileSync(path.join(demo, name), 'utf8');
const modules = ['engine', 'planning', 'fs-mapping', 'statement-presentation', 'pbc', 'xlsx', 'app'];
const app = read('app.js');
const boundary = app.indexOf('  function workpapers()');
if (boundary < 0) throw new Error('Initial statement rendering boundary was not found.');

// Author initial HTML with the same pure template as the interactive app.
// No browser, DOM, network, playback, or event handlers are used at build time.
const initialStatement = vm.runInNewContext(app.slice(0, boundary) + '\nreturn overview();\n})();', {
  AuditEngine: require(path.join(demo, 'engine.js')),
  AuditPlanning: require(path.join(demo, 'planning.js')),
  AuditFSMapping: require(path.join(demo, 'fs-mapping.js')),
  AuditStatementPresentation: require(path.join(demo, 'statement-presentation.js')),
  AuditPBC: require(path.join(demo, 'pbc.js'))
}, {timeout: 2000});

const marker = /<!-- INITIAL_STATEMENT -->[\s\S]*?<!-- \/INITIAL_STATEMENT -->/;
let html = read('index.html');
if (!marker.test(html)) throw new Error('Initial statement markers were not found.');
html = html.replace(marker, '<!-- INITIAL_STATEMENT -->' + initialStatement + '<!-- /INITIAL_STATEMENT -->');
fs.writeFileSync(path.join(demo, 'index.html'), html);

if (process.argv[2]) {
  const output = path.resolve(process.argv[2]);
  html = html.replace('<link rel="stylesheet" href="./styles.css">', '<style>\n' + read('styles.css') + '\n</style>');
  html = html.replace(/\s*<script src="\.\/[^"\n]+" defer><\/script>/g, '');
  const scripts = modules.map((name) => '<script>\n' + read(name + '.js').replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n');
  html = html.replace('</body>', scripts + '\n</body>');
  fs.writeFileSync(output, html);
  console.log('Standalone demo written: ' + output);
}
console.log('Initial financial statement populated in audit-demo/index.html.');
