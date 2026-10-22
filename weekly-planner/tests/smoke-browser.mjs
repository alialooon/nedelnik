import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const browsers=['google-chrome','google-chrome-stable','chromium','chromium-browser'];
const executable=browsers.find(name=>spawnSync(name,['--version'],{stdio:'ignore'}).status===0);
if(!executable){
  console.error('No Chrome/Chromium executable for browser smoke test.');
  process.exit(1);
}
const temp=mkdtempSync(join(tmpdir(),'nedelnik-browser-'));
try{
  const html=pathToFileURL(fileURLToPath(new URL('../planner-standalone.html',import.meta.url))).href;
  const result=spawnSync(executable,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-extensions','--no-first-run','--no-default-browser-check',
    '--user-data-dir='+temp,'--virtual-time-budget=3500','--dump-dom',html
  ],{encoding:'utf8',timeout:30000,maxBuffer:5_000_000});
  if(result.status!==0){
    throw new Error('Chrome exit code '+result.status+'\n'+result.stderr?.slice(-2000));
  }
  const dom=result.stdout;
  const columns=(dom.match(/<section class="day-column\b/g)||[]).length;
  assert.equal(columns,7,'The weekly Kanban failed to render seven days');
  assert.match(dom,/id="inboxList"/);
  assert.match(dom,/id="periodTitle">[^<]*\d{4}/);
  assert.match(dom,/id="weekProgress">/);
  if(dom.includes('Uncaught SyntaxError'))throw new Error('JavaScript syntax error in browser');
  console.log('Browser smoke passed: '+columns+' days, Brain Dump and weekly progress rendered.');
}finally{rmSync(temp,{recursive:true,force:true});}
