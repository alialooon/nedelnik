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
      const toolbar=document.querySelector('.app-header.app-header-macos');
      const tabs=document.querySelectorAll('.header-mode-picker [data-view]');
      const active=toolbar?.querySelector('.header-mode-picker button.active');
      const day=document.querySelector('.day-column.today');
      document.body.dataset.probeMac=toolbar&&tabs.length===3
        &&document.querySelectorAll('.mode-picker').length===1
        &&toolbar.contains(document.querySelector('#openReview'))
        &&toolbar.contains(document.querySelector('#openStats'))
        &&getComputedStyle(toolbar).display==='grid'
        &&active&&getComputedStyle(active).backgroundImage!=='none'
        &&day&&parseFloat(getComputedStyle(day).borderRadius)>=12
        ?'pass':'fail';
      document.querySelector('[data-view="calendar"]').click();
      document.body.dataset.probeCalendar=document.querySelector('#calendarView .timeline-body')
        &&document.querySelector('.timebox-empty')?'pass':'fail';
      const cal=document.querySelector('#calendarView');
      const labels=[...cal.querySelectorAll('.hour-label')];
      const calendarBody=cal.querySelector('.timeline-body');
      const upper=labels[0]?.getBoundingClientRect(),lower=labels[23]?.getBoundingClientRect();
      const bodyRect=calendarBody.getBoundingClientRect(),rowHeight=bodyRect.height/24;
      document.body.dataset.probeHourAlign=labels.length===24
        &&Math.abs((upper.top+upper.height/2)-(bodyRect.top+rowHeight*.5))<2
        &&Math.abs((lower.top+lower.height/2)-(bodyRect.top+rowHeight*23.5))<2
        &&getComputedStyle(labels[0]).textAlign==='right'
        &&getComputedStyle(labels[23]).textAlign==='right'?'pass':'fail';
      document.body.dataset.probeHourDetails=JSON.stringify({
        count:labels.length,first:labels[0]?.textContent,last:labels[23]?.textContent,
        client:cal.clientHeight,scroll:cal.scrollHeight,
        upperTop:Math.round(upper.top),bodyTop:Math.round(calendarBody.getBoundingClientRect().top),
        lowerBottom:Math.round(lower.bottom),bodyBottom:Math.round(calendarBody.getBoundingClientRect().bottom),
        overflow:getComputedStyle(cal).overflowY,
        bodyHeight:calendarBody.clientHeight
      });
      document.body.dataset.probeAllhours=labels.length===24
        &&labels[0].textContent==='00:00'&&labels[23].textContent==='23:00'
        &&cal.scrollHeight<=cal.clientHeight+2
        &&lower.bottom<=calendarBody.getBoundingClientRect().bottom+2
        &&upper.top>=calendarBody.getBoundingClientRect().top-1
        &&getComputedStyle(cal).overflowY==='hidden'?'pass':'fail';
      document.querySelector('[data-view="focus"]').click();
      document.body.dataset.probeFocus=document.querySelector('#timerFace')?.textContent==='25:00'
        &&document.querySelector('.focus-summary')?'pass':'fail';
      const preset=document.querySelector('#focusDurationPreset');
      preset.value='45';preset.dispatchEvent(new Event('change',{bubbles:true}));
      const selected45=document.querySelector('#timerFace').textContent==='45:00'
        &&focusRemaining===45*60;
      preset.value='custom';preset.dispatchEvent(new Event('change',{bubbles:true}));
      const customInput=document.querySelector('#focusCustomMinutes');
      customInput.value='37';customInput.dispatchEvent(new Event('change',{bubbles:true}));
      const selected37=document.querySelector('#timerFace').textContent==='37:00'
        &&JSON.parse(localStorage.getItem('nedelnik-ui-preferences-v1')).focusMinutes===37;
      document.querySelector('#timerReset').click();
      const reset37=document.querySelector('#timerFace').textContent==='37:00';
      preset.value='25';preset.dispatchEvent(new Event('change',{bubbles:true}));
      document.body.dataset.probeTimerDuration=selected45&&selected37&&reset37
        &&document.querySelector('#timerFace').textContent==='25:00'?'pass':'fail';
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
      const quick=document.querySelector('#inboxInput'),quickWrapper=quick.closest('.quick-add');
      quick.blur();
      const normalQuickBorder=getComputedStyle(quickWrapper).borderColor;
      const normalQuickShadow=getComputedStyle(quickWrapper).boxShadow;
      quick.focus();
      const quickAfter=getComputedStyle(quick),wrapAfter=getComputedStyle(quickWrapper);
      const quickUnchanged=quickAfter.outlineStyle==='none'
        &&quickAfter.boxShadow==='none'
        &&wrapAfter.borderColor===normalQuickBorder
        &&wrapAfter.boxShadow===normalQuickShadow;
      document.querySelector('[data-action="add-day"]').click();
      const controls=['editTitle','editDate','editHours','editMinutes','editStart',
        'editEnd','editActual','editCategory','editNotes'];
      const focusProblems=[];
      const neutral=controls.map(id=>{
        const element=document.getElementById(id);
        element.blur();
        const normal=getComputedStyle(element),baseBorder=normal.borderColor,baseBg=normal.backgroundColor;
        element.focus();
        const active=getComputedStyle(element);
        const good=active.outlineStyle==='none'&&active.boxShadow==='none'
          &&active.borderColor===baseBorder&&active.backgroundColor===baseBg;
        if(!good)focusProblems.push(id+': outline='+active.outlineStyle+',shadow='+active.boxShadow
          +',border='+baseBorder+'->'+active.borderColor+',bg='+baseBg+'->'+active.backgroundColor);
        return good;
      }).every(Boolean);
      if(!quickUnchanged)focusProblems.push('quick: outline='+quickAfter.outlineStyle
        +',shadow='+quickAfter.boxShadow+',border='+normalQuickBorder+'->'+wrapAfter.borderColor
        +',wrapperShadow='+normalQuickShadow+'->'+wrapAfter.boxShadow);
      document.body.dataset.probeFocusDetails=JSON.stringify(focusProblems);
      document.body.dataset.probeNeutralFocus=neutral&&quickUnchanged?'pass':'fail';
      document.querySelector('#editTitle').value='Тест шаблона';
      document.querySelector('#saveTemplate').checked=true;
      document.querySelector('#taskForm').requestSubmit();
      const before=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const saved=before.templates.length===1&&before.tasks.length>=1
        &&document.querySelector('#templateCount').textContent==='1';
      document.querySelector('#openQuickTemplate').click();
      const deleteButton=document.querySelector('[data-template-delete]');
      const hasDelete=!!deleteButton;
      let asked=false;
      window.confirm=message=>{asked=message.includes('Удалить шаблон');return false;};
      deleteButton?.click();
      const preserved=JSON.parse(localStorage.getItem('nedelnik-planner-v1')).templates.length===1;
      window.confirm=message=>{asked=asked&&message.includes('Удалить шаблон');return true;};
      deleteButton?.click();
      const after=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      document.body.dataset.probeTemplates=saved&&hasDelete&&asked&&preserved
        &&after.templates.length===0&&after.tasks.length===before.tasks.length
        &&document.querySelector('#templateCount').textContent==='0'
        &&document.querySelectorAll('#templateContent [data-template-delete]').length===0
        &&document.querySelector('#templateDialog').open?'pass':'fail';
      // The in-dialog quick creation must persist a reusable template without
      // adding a dated task. Using it should add a copy to the undated inbox.
      const quickTemplate=document.querySelector('#templateCreateForm');
      document.querySelector('#templateNewTitle').value='Зарядка';
      document.querySelector('#templateNewCategory').value='health';
      document.querySelector('#templateNewMinutes').value='90';
      const tasksBeforeQuick=after.tasks.length,inboxBeforeQuick=after.inbox.length;
      quickTemplate.requestSubmit();
      const direct=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const quickSaved=direct.templates.length===1
        &&direct.templates[0].title==='Зарядка'
        &&direct.templates[0].category==='health'
        &&direct.templates[0].plannedMinutes===90
        &&direct.tasks.length===tasksBeforeQuick
        &&direct.inbox.length===inboxBeforeQuick
        &&document.querySelector('#templateCount').textContent==='1'
        &&document.querySelector('#templateNewTitle').value===''
        &&document.querySelector('#templateDialog').open;
      document.querySelector('#templateContent [data-template]').click();
      const used=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      document.body.dataset.probeDirectTemplate=quickSaved
        &&used.inbox.length===inboxBeforeQuick+1
        &&used.inbox.some(t=>t.title==='Зарядка'&&t.plannedMinutes===90)
        &&used.templates.length===1
        &&used.tasks.length===tasksBeforeQuick?'pass':'fail';
      document.body.dataset.probeIcons=document.querySelector('#prevPeriod .ui-icon')
        &&document.querySelector('#openStats .ui-icon')?'pass':'fail';
      // New functions must work through real DOM controls in the standalone page.
      document.querySelector('#openQuickTemplate').click();
      document.querySelector('[data-template-edit]').click();
      document.querySelector('#templateNewMinutes').value='45';
      document.querySelector('#templateCreateForm').requestSubmit();
      const edited=JSON.parse(localStorage.getItem('nedelnik-planner-v1')).templates;
      const templateEdit=edited.length===1&&edited[0].plannedMinutes===45;
      document.querySelector('#templateDialog').close();

      document.querySelector('[data-view="board"]').click();
      document.querySelector('[data-action="add-day"]').click();
      document.querySelector('#editTitle').value='Тестовая тренировка';
      const taskDay=document.querySelector('#editDate').value;
      document.querySelector('#editRepeat').value='custom';
      document.querySelector('#editRepeat').dispatchEvent(new Event('change',{bubbles:true}));
      const weekday=(new Date(taskDay+'T12:00:00').getDay()+6)%7;
      document.querySelector('#repeatDayFields input[value="'+weekday+'"]').checked=true;
      document.querySelector('#editMeasure').value='count';
      document.querySelector('#editMeasure').dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#editTargetCount').value='25';
      document.querySelector('#editActualCount').value='18';
      document.querySelector('#newSubtask').value='Разминка';
      document.querySelector('#addSubtask').click();
      document.querySelector('.subtask-done').checked=true;
      document.querySelector('#taskForm').requestSubmit();
      let enhanced=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const countTask=enhanced.tasks.find(t=>t.title==='Тестовая тренировка');
      const repeatOk=countTask?.repeat==='custom'&&countTask.repeatDays.includes(weekday)
        &&countTask.measureMode==='count'&&countTask.targetCount===25
        &&countTask.actualCountByDate[taskDay]===18
        &&countTask.subtaskByDate[taskDay][countTask.subtasks[0].id]===true;
      const card=[...document.querySelectorAll('[data-action="start-focus"]')]
        .find(btn=>btn.dataset.id===countTask?.id);
      card?.click();
      const focused=document.querySelector('#focusTaskSelect')?.value===countTask?.id;
      if(focused){
        focusStartedAt=Date.now()-65000;
        timerTick();
        document.querySelector('#timerToggle').click();
      }
      enhanced=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const timerOk=enhanced.tasks.find(t=>t.id===countTask?.id)?.actualByDate?.[taskDay]===1;
      document.querySelector('#openStats').click();
      document.querySelector('[data-stats-scope="month"]').click();
      const analyticsOk=document.querySelector('#statsContent')?.textContent.includes('По категориям')
        &&document.querySelector('[data-stats-scope="month"]')?.classList.contains('active');
      document.querySelector('#statsDialog').close();
      document.querySelector('[data-view="board"]').click();
      const editor=[...document.querySelectorAll('[data-action="edit-task"]')]
        .find(btn=>btn.dataset.id===countTask.id);
      editor?.click();
      document.querySelector('#deleteTask').click();
      const deleted=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const trashed=deleted.trash.some(x=>x.kind==='task'&&x.value.id===countTask.id)
        &&!deleted.tasks.some(t=>t.id===countTask.id);
      document.querySelector('#openTrash').click();
      const restore=[...document.querySelectorAll('[data-restore-trash]')]
        .find(btn=>btn.closest('.template-row')?.textContent.includes('Тестовая тренировка'));
      restore?.click();
      const restored=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const recovered=restored.tasks.some(t=>t.id===countTask.id)&&
        !restored.trash.some(x=>x.value.id===countTask.id);
      const snapshots=JSON.parse(localStorage.getItem('nedelnik-planner-backups-v1')||'[]');
      document.querySelector('#trashDialog').close();
      document.body.dataset.probeAdvanced=templateEdit&&repeatOk&&focused&&timerOk
        &&analyticsOk&&trashed&&recovered&&snapshots.length>0?'pass':'fail';
      // Week and month plans must remain outside daily columns and can later
      // be assigned to a concrete day without duplicating the original record.
      document.querySelector('#openPeriodPlans').click();
      document.querySelector('#newWeekPlan').click();
      const weekDate=document.querySelector('#editDate').value;
      const weekScopeSelected=document.querySelector('#editScope').value==='week';
      document.querySelector('#editTitle').value='Задача на неделю';
      document.querySelector('#taskForm').requestSubmit();
      let plans=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const weekPlan=plans.tasks.find(t=>t.title==='Задача на неделю');
      const weeklyOk=weekScopeSelected&&weekPlan?.scope==='week'
        &&weekPlan.date===periodAnchor(weekDate,'week')
        &&!occurrencesForWeek(plans.tasks,periodAnchor(weekDate,'week')).some(t=>t.id===weekPlan.id);
      document.querySelector('#openPeriodPlans').click();
      const statusBtn=[...document.querySelectorAll('[data-action="period-status"]')]
        .find(btn=>btn.dataset.id===weekPlan?.id);
      statusBtn?.click();
      plans=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const weekDone=plans.tasks.find(t=>t.id===weekPlan?.id)?.status==='done';
      document.querySelector('#newMonthPlan').click();
      document.querySelector('#editTitle').value='Задача на месяц';
      const monthDate=document.querySelector('#editDate').value;
      const monthSelected=document.querySelector('#editScope').value==='month';
      document.querySelector('#taskForm').requestSubmit();
      plans=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const monthPlan=plans.tasks.find(t=>t.title==='Задача на месяц');
      const monthlyOk=monthSelected&&monthPlan?.scope==='month'
        &&monthPlan.date===periodAnchor(monthDate,'month')
        &&periodTasksForWeek(plans.tasks,week).some(t=>t.id===monthPlan.id);
      document.querySelector('#openPeriodPlans').click();
      const assign=[...document.querySelectorAll('[data-action="period-schedule"]')]
        .find(btn=>btn.dataset.id===weekPlan?.id);
      assign?.click();
      const dayConversion=document.querySelector('#editScope').value==='day';
      const targetDay=document.querySelector('#editDate').value;
      document.querySelector('#taskForm').requestSubmit();
      plans=JSON.parse(localStorage.getItem('nedelnik-planner-v1'));
      const scheduled=plans.tasks.find(t=>t.id===weekPlan?.id);
      const noDup=plans.tasks.filter(t=>t.id===weekPlan?.id).length===1
        &&scheduled.scope==='day'&&scheduled.date===targetDay
        &&occurrencesForWeek(plans.tasks,startOfWeek(targetDay)).some(t=>t.id===scheduled.id)
        &&periodTasksForWeek(plans.tasks,week).every(t=>t.id!==scheduled.id);
      document.querySelector('#openStats').click();
      document.querySelector('[data-stats-scope="month"]').click();
      const monthlySummary=document.querySelector('#statsContent')?.textContent.includes('Планы без конкретной даты');
      document.querySelector('#statsDialog').close();
      document.body.dataset.probePeriodPlans=weeklyOk&&weekDone&&monthlyOk&&dayConversion
        &&noDup&&monthlySummary?'pass':'fail';
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
  for(const name of ['mac','calendar','hour-align','allhours','neutral-focus','templates','direct-template','focus','timer-duration','example','inbox','sidebar','preferences','icons','advanced','period-plans']){
    assert.ok(bodyTag.includes('data-probe-'+name+'="pass"'),
      'Interactive browser check failed: '+name+'; '+bodyTag.slice(0,1250));
  }
  assert.doesNotMatch(bodyTag,/data-probe-error=/,'Unexpected runtime error during interaction');

  if(dom.includes('Uncaught SyntaxError'))throw new Error('JavaScript syntax error in browser');
  console.log('Browser smoke passed: '+columns+' days, Brain Dump and weekly progress rendered.');
}finally{rmSync(temp,{recursive:true,force:true});}
