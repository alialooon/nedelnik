import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
  const source=readFileSync(fileURLToPath(new URL('../planner-standalone.html',import.meta.url)),'utf8');
  const probe=String.raw`<script>
    try {
      const board=document.querySelectorAll('#boardView .day-column').length;
      document.body.dataset.probeBoard=String(board);
      document.querySelector('[data-view="calendar"]').click();
      document.body.dataset.probeCalendar=document.querySelector('#calendarView .timeline-body')
        &&document.querySelector('.timebox-empty')?'pass':'fail';
      document.querySelector('[data-view="focus"]').click();
      document.body.dataset.probeFocus=document.querySelector('#timerFace')?.textContent==='25:00'
        &&document.querySelector('.focus-summary')?'pass':'fail';
      const example=document.querySelector('[data-suggestion]');
      example.click();
      const input=document.querySelector('#inboxInput');
      const unchanged=document.querySelectorAll('.inbox-item').length===0;
      document.body.dataset.probeExample=unchanged&&input.value==='Разобрать почту'?'pass':'fail';
      document.querySelector('#inboxForm').requestSubmit();
      document.body.dataset.probeInbox=document.querySelectorAll('.inbox-item').length===1?'pass':'fail';
      document.querySelector('#inboxToggle').click();
      document.body.dataset.probeSidebar=document.querySelector('.workspace').classList.contains('inbox-hidden')
        &&document.querySelector('#inboxToggle').getAttribute('aria-expanded')==='false'?'pass':'fail';
      const pref=JSON.parse(localStorage.getItem('nedelnik-ui-preferences-v1')||'{}');
      document.body.dataset.probePreferences=pref.view==='focus'&&pref.inboxHidden?'pass':'fail';
      document.querySelector('[data-view="board"]').click();
      document.body.dataset.probeIcons=document.querySelector('#prevPeriod .ui-icon')
        &&document.querySelector('#openStats .ui-icon')?'pass':'fail';
    } catch(error){
      document.body.dataset.probeError=String(error.message||error).slice(0,160);
    }
  </script>`;
  const browserPage=join(temp,'probe.html');
  writeFileSync(browserPage,source.replace('</body>',probe+'\n</body>'));
  const html=pathToFileURL(browserPage).href;
  const result=spawnSync(executable,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-extensions','--no-first-run','--no-default-browser-check',
    '--user-data-dir='+temp,'--virtual-time-budget=3500','--dump-dom',html
  ],{encoding:'utf8',timeout:30000,maxBuffer:5_000_000});
  if(result.status!==0){
    throw new Error('Chrome exit code '+result.status+'\n'+result.stderr?.slice(-2000));
  }
  const dom=result.stdout;
  const columns=(dom.match(/<section class="day-column [^"]*" data-drop-date="\d{4}-\d{2}-\d{2}"/g)||[]).length;
  assert.equal(columns,7,'The weekly Kanban failed to render seven days');
  assert.match(dom,/id="inboxList"/);
  assert.match(dom,/id="periodTitle">[^<]*\d{4}/);
  assert.match(dom,/id="weekProgress">/);
  const bodyTag=dom.match(/<body\b[^>]*>/)?.[0]||'';
  assert.ok(bodyTag.includes('data-probe-board="7"'),'Initial board did not render');
  for(const name of ['calendar','focus','example','inbox','sidebar','preferences','icons']){
    assert.ok(bodyTag.includes('data-probe-'+name+'="pass"'),
      'Interactive browser check failed: '+name+'; '+bodyTag.slice(0,750));
  }
  assert.doesNotMatch(bodyTag,/data-probe-error=/,'Unexpected runtime error during interaction');

  if(dom.includes('Uncaught SyntaxError'))throw new Error('JavaScript syntax error in browser');
  console.log('Browser smoke passed: '+columns+' days, Brain Dump and weekly progress rendered.');
}finally{rmSync(temp,{recursive:true,force:true});}
