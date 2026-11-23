import {DEMO,HOUR,IST,SF,TORONTO,dateAt,teams,type Person,type State,type Task,type TaskType,type Question,type LibraryEntry} from '../lib/model';
import {advance,dayKey,localAt,notify,shiftDay} from '../lib/schedule';
import {baseQuestions,suggestAnswer,audience,change,control,ctr,dashboardUsers,filters,format,guardrail,output,primary,priority,sourceTable,split,windowQuestion,words} from '../lib/predict';

const analystNames=['Devarshi','Saksham','Himanshu','Dilip','Karan','Shubham','Mandeep','Amit'];
const person=(name:string,title:string,start:string,end:string,{zone=IST,assign=false,receive=true,team='data'}={}):Person=>({
  id:name.toLowerCase(),name,title,teamId:team,canAssign:assign,canReceive:receive,timeZone:zone,workStart:start,workEnd:end,
});
export const people=[
  person('Shashank','Manager','07:30','15:30',{zone:TORONTO,assign:true,receive:false}),
  person('Gaurav','Skip-level manager','09:00','17:00',{zone:SF,assign:true,receive:false}),
  person('Saurabh','Senior analyst','15:00','01:00',{assign:true}),
  ...analystNames.map(n=>person(n,'Contract analyst','12:30','00:00')),
  person('Neha','Growth manager','08:00','16:00',{zone:'America/New_York',assign:true,receive:false,team:'growth'}),
  ...['Rohan','Isha'].map(n=>person(n,'Growth associate','12:30','21:00',{team:'growth'})),
];

const samples:Record<TaskType,string[]> = {
  metric_deep_dive:['Investigate the mobile search CTR drop for the weekly review.','Why did RPM fall in the UK on Tuesday? Need a quick read.','Explain the revenue variance by advertiser tier for Gaurav.','Unpack the search CTR decline across mobile and desktop.','Find the cause of the CTR dip on long-tail search queries.'],
  dashboard_change:['Add a mobile vs desktop split to the Search Health dashboard.','Build a weekly tile for publisher churn on the Partner dashboard.','Update the publisher dashboard with a country filter.','Add a latency chart to the Search Quality dashboard.'],
  data_pull:['Export the top 500 queries with zero results for the last 30 days.','Pull a CSV of active publishers by region.','Extract search sessions with three or more refinements.','List advertisers with a budget change this month.'],
  experiment_readout:['Read out the ad-density test that ended Friday.','Check whether the new spell-correct model changed click-through on long-tail queries.','Compare mobile checkout variants in the latest experiment.','Summarize the search suggestions A/B test for product leadership.'],
  campaign_brief:['Brief the Diwali re-engagement campaign for lapsed publishers.','Draft the creative brief for the year-end publisher webinar.','Outline the onboarding campaign for newly approved publishers.','Prepare the audience brief for the winter referral pilot.'],
};
const libraryRows:[TaskType,string,string,string?,boolean?][] = [
  ['metric_deep_dive',windowQuestion,'Compare the same weekdays against last week, then add the trailing four-week average. Use the last completed week.','shashank'],
  ['metric_deep_dive',split,'Use platform first: Android, iOS and desktop. Add country only where the change is material.'],
  ['metric_deep_dive','Which table holds daily search events?','Use search_events_daily with event_date in IST.'],
  ['metric_deep_dive',ctr,'For standard Search Health reporting, use clicks divided by searches with at least one result. Confirm the eligible population for an investigation.',undefined,false],
  ['metric_deep_dive','Where is the leadership review deck?','Shared drive › Leadership › Weekly review.','shashank'],
  ['metric_deep_dive','What format does Gaurav prefer?','One slide with a headline, a chart and three bullets.','shashank',false],
  ['metric_deep_dive','Which RPM denominator applies to billing?','Use billable impressions divided by 1,000.'],
  ['data_pull',sourceTable,'Use analytics_prod.search_events_daily for search events. Check the data catalog for other domains.'],
  ['data_pull',filters,'Exclude bots, test traffic and internal user IDs. Use the shared traffic-quality view.'],
  ['data_pull','Where should I save the export?','Save your export in the team’s Data Requests folder with today’s date.','shashank'],
  ['data_pull','How do we identify active publishers?','Require at least one paid impression in the last 30 days.'],
  ['data_pull','Which timezone should I use for event dates?','Convert event timestamps to Asia/Kolkata before extracting calendar dates.'],
  ['dashboard_change',dashboardUsers,'Search & Discovery and the weekly operations review use Search Health.','shashank'],
  ['dashboard_change','Which style do date filters use?','Use a rolling 28-day window as the default, with a calendar picker.'],
  ['dashboard_change','What happens to deprecated dashboard tiles?','Move retired tiles to the Archive tab and link to the replacement.'],
  ['dashboard_change','Where is dashboard QA documented?','See Analytics Playbook › Dashboard QA checklist.'],
  ['experiment_readout',control,'For ad-density tests, Variant A is the default control. Check the experiment record for other tests.'],
  ['experiment_readout',guardrail,'Report latency, errors and sessions without results alongside the primary metric.'],
  ['experiment_readout','How should results be made reproducible?','Link the experiment definition and save the query output snapshot.'],
  ['experiment_readout','How should I report practical significance?','Show absolute lift, confidence interval and expected weekly impact.','shashank'],
  ['campaign_brief','Which channels are in scope?','Email and publisher dashboard banners are the default channels.','neha'],
  ['campaign_brief','What is the standard audience exclusion?','Exclude opted-out publishers and accounts with unresolved support tickets.','neha'],
  ['campaign_brief','Where do approved creative assets live?','Open Growth Workspace › Creative › Approved.','neha'],
  ['campaign_brief','Who approves final campaign copy?','Neha approves final copy. Ask Isha to run the send checklist.','neha'],
];
const profiles:Record<string,[string,number][]> = {
  devarshi:[[output,.65],[ctr,.55],[priority,.4]], saksham:[[sourceTable,.6],[filters,.45],[format,.35]],
  himanshu:[[change,.55],[dashboardUsers,.4]], dilip:[[primary,.5],[control,.4],[guardrail,.3]],
  karan:[[windowQuestion,.55],[audience,.4]], shubham:[[filters,.5],[output,.4]],
  mandeep:[[priority,.5],[output,.45]], amit:[[split,.5],['Which metric definition should I use?',.4]],
  saurabh:[[audience,.4]], rohan:[['Which channels are in scope?',.5],[output,.4]], isha:[['Who is the target audience?',.6],[priority,.4]],
};
const preferred:Record<string,TaskType>={devarshi:'metric_deep_dive',saksham:'data_pull',himanshu:'dashboard_change',dilip:'experiment_readout',karan:'metric_deep_dive',shubham:'data_pull',amit:'metric_deep_dive',saurabh:'metric_deep_dive'};
const mix:TaskType[]=['metric_deep_dive','metric_deep_dive','metric_deep_dive','data_pull','data_pull','data_pull','dashboard_change','dashboard_change','experiment_readout'];
export function seed(now=DEMO):State{
  const startDay=dayKey(DEMO);
  const days:string[]=[];
  for(let d=shiftDay(startDay,-1);days.length<10;d=shiftDay(d,-1)){
    const weekday=new Date(d+'T12:00Z').getUTCDay();
    if(weekday>=1&&weekday<=5)days.unshift(d);
  }
  let rng=373987;
  const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const s:State={now:DEMO,predictions:true,slack:false,people:people.map(p=>({...p})),weeks:[0,5].map(i=>({from:days[i],to:days[i+4]})),tasks:[],questions:[],library:[],ratings:[],events:[],notifications:[]};
  s.library=libraryRows.map(([taskType,question,answer,answeredById='saurabh',reusable=true],i)=>({
    id:'library-'+i,teamId:taskType==='campaign_brief'?'growth':'data',question,answer,taskType,answeredById,keywords:words(question),reuseCount:0,helped:0,misses:0,reusable,
  }));
  function addEvent(event:string,t:Task,at:string,personId:string,meta?:Record<string,unknown>){s.events.push({id:'seed-event-'+s.events.length,event,taskId:t.id,teamId:t.teamId,personId,at,meta});}
  function addTask(day:string,index:number,p:Person,isOn:boolean) {
    const type=p.teamId==='growth'?'campaign_brief':preferred[p.id]&&random()<.71?preferred[p.id]:mix[Math.floor(random()*mix.length)];
    const id='history-'+s.tasks.length;
    const creation=localAt(day,'00:52');
    const sent=localAt(day,index%2===0?'01:10':'00:58');
    const delivered=localAt(day,p.workStart,p.timeZone);
    const requested=random()<.95;
    const accepted=requested&&random()<.895;
    const assignerId=p.teamId==='growth'?'neha':index%29===5?'gaurav':index%23===21?'saurabh':'shashank';
    const delay=(isOn?3.6:5.65)+random()*(isOn?3.3:4.8);
    const sentBackCount=requested&&random()<(isOn?.12:.3)?1:0;
    const requestedAt=requested?dateAt(Date.parse(delivered)+(delay-1)*HOUR):undefined;
    const acceptedAt=accepted?dateAt(Date.parse(delivered)+(delay+sentBackCount*.65)*HOUR):undefined;
    const t:Task={id,teamId:p.teamId,text:samples[type][Math.floor(random()*samples[type].length)],type,assignerId,assigneeId:p.id,createdAt:creation,sentAt:sent,deliveredAt:delivered,acceptanceRequestedAt:requestedAt,acceptedAt,
      status:accepted?'accepted':requested?'acceptance_requested':'in_progress',lowOnContext:!isOn,predictionsOn:isOn,sentBackCount,assignerSeconds:Math.round((isOn?65:24)+random()*50)};
    s.tasks.push(t);
    addEvent('sent',t,sent,assignerId,{assignerSeconds:t.assignerSeconds,predictionsOn:isOn});
    addEvent('delivered',t,delivered,p.id);
    if(requestedAt)addEvent('request-acceptance',t,requestedAt,p.id);
    if(sentBackCount)addEvent('send-back',t,requestedAt!,assignerId);
    if(acceptedAt)addEvent('accept',t,acceptedAt,assignerId);
    if(accepted&&random()<.6){const score=Math.max(1,Math.min(5,Math.floor((isOn?3.8:2.95)+random()*2.3)));s.ratings.push({taskId:id,raterId:p.id,score});addEvent('rating',t,acceptedAt!,p.id,{score});}
    for(const [text,chance] of (profiles[p.id]??[])){
      if(random()>chance*(isOn?.48:1)*(type===preferred[p.id]||p.teamId==='growth'?1:.63))continue;
      if(/CTR/.test(text)&&type!=='metric_deep_dive')continue;
      const known=s.library.find(e=>e.teamId===p.teamId&&e.question===text);
      const at=dateAt(Date.parse(delivered)+(.45+random()*2)*HOUR);
      const by=known?.answeredById??assignerId;
      s.questions.push({id:'seed-q-'+s.questions.length,taskId:id,text,source:'asked',status:'answered',askedById:p.id,createdAt:at,answeredAt:dateAt(Date.parse(at)+HOUR),answer:known?.answer??(text===output?'Share a one-slide summary with the key finding and a link to the source.':text===priority?'Start after your daily checks and share a first read before overlap.':'Share the first read with the project owner during overlap.'),answeredById:by,answerSource:by===assignerId?'assigner':'nominee',history:[{at,event:'Asked',byId:p.id}]});
      addEvent('asked',t,at,p.id);
    }
    if(isOn){
      for(const text of [output,priority,...(type==='metric_deep_dive'?[ctr,windowQuestion]:type==='data_pull'?[sourceTable,filters]:type==='dashboard_change'?[change,dashboardUsers]:type==='experiment_readout'?[control,guardrail]:['Which channels are in scope?'])]){
        const known=s.library.find(e=>e.taskType===type&&e.question===text&&e.reusable);
        const skipped=random()<.15;
        const nominated=!known&&!skipped&&text===ctr;
        const q:Question={id:'seed-q-'+s.questions.length,taskId:id,text,source:'predicted',status:skipped?'skipped':known?'library':'answered',createdAt:creation,history:[],
          answer:skipped?undefined:nominated?'Use clicks divided by searches with at least one result.':known?.answer??(text===output?'Send a short brief with a chart and a link to the working file.':'Prioritize this after your existing commitments.'),
          answeredById:skipped?undefined:nominated?'saurabh':known?.answeredById??assignerId,answeredAt:skipped?undefined:nominated?dateAt(Date.parse(delivered)+3*HOUR):creation,answerSource:known?'library':nominated?'nominee':'assigner',libraryId:known?.id,nomineeId:nominated?'saurabh':undefined,attached:!!known};
        if(known&&!skipped)known.reuseCount++;
        s.questions.push(q);
        addEvent('predicted',t,creation,assignerId,{questionId:q.id});
        if(!skipped)addEvent('prepared',t,creation,assignerId,{questionId:q.id});
      }
    }
  }
  days.forEach((d,i)=>{
    analystNames.forEach((name,j)=>{
      const p=s.people.find(p=>p.name===name)!;
      addTask(d,i*12+j,p,i>=5);
      if((i+j)%2===0)addTask(d,i*12+j+8,p,i>=5);
    });
    if(i%3!==2&&i!==8)addTask(d,i,s.people[2],i>=5);
    addTask(d,i,s.people.find(p=>p.id===(i%2?'isha':'rohan'))!,i>=5);
    if(i%5===1)addTask(d,i,s.people.find(p=>p.id==='isha')!,i>=5);
  });
  const liveDay=shiftDay(startDay,-1);
  function live(id:string,text:string,assigneeId:string,type:TaskType,status:Task['status'],patch:Partial<Task>={}){
    const createdAt=localAt(liveDay,'01:18'), deliveredAt=localAt(liveDay,'12:30');
    const t:Task={id,text,assigneeId,type,status,teamId:'data',assignerId:'shashank',lowOnContext:false,predictionsOn:true,createdAt,sentAt:createdAt,deliveredAt,sentBackCount:0,...patch};
    s.tasks.push(t);
    addEvent('sent',t,createdAt,'shashank',{predictionsOn:true});
    return t;
  }
  const active=live('live-search','Investigate the mobile search CTR dip on long-tail queries.','devarshi','metric_deep_dive','in_progress',{priorityNote:'Share an initial read at overlap.'});
  live('live-dashboard','Add a platform split to the Search Health dashboard.','devarshi','dashboard_change','acceptance_requested',{acceptanceRequestedAt:localAt(liveDay,'21:00'),acceptanceNote:'The updated tiles are ready for review.'});
  const extract=live('live-export','Export zero-result searches for the last 30 days.','saksham','data_pull','sent_back',{sentBackCount:1,sentBackReason:'Please remove internal and test traffic before resubmitting.'});
  function liveQuestion(t:Task,id:string,text:string,status:Question['status'],extra:Partial<Question>={}){
    const at=localAt(liveDay,'14:15');
    s.questions.push({id,taskId:t.id,text,status,source:'asked',createdAt:at,askedById:t.assigneeId,history:[{at,event:'Asked',byId:t.assigneeId}],...extra});
  }
  liveQuestion(active,'live-q1','Which search events count as eligible impressions?','nominated',{source:'predicted',nomineeId:'saurabh'});
  liveQuestion(extract,'live-q2','Which pipeline logs search refinements?','routed',{nomineeId:'saurabh'});
  const agenda=[['live-q3',active,'Should I include logged-out mobile sessions?'],['live-q4',extract,'Should I include exploratory queries from the new locale?'],['live-q5',active,'Is leadership looking for a cause or a recommendation?']] as const;
  for(const [id,t,text] of agenda)liveQuestion(t,id,text,'logged_overlap',{overlapAt:localAt(liveDay,'18:00')});
  notify(s,'saurabh','Devarshi nominated you to clarify eligible search impressions.',{at:localAt(liveDay,'15:00'),page:'questions'});
  notify(s,'shashank','One handoff is ready for acceptance.',{at:localAt(liveDay,'21:00'),page:'acceptance'});
  ensurePredictionHistory(s);
  if(now!==DEMO)advance(s,now);
  return s;
}


const demoNomineeByType:Record<TaskType,string> = {
  metric_deep_dive:'saurabh',dashboard_change:'himanshu',data_pull:'saksham',experiment_readout:'dilip',campaign_brief:'isha',
};

function diversifyDemoHistory(s:State){
  // Only adjust generated demo examples. Keep handoffs and questions created by users.
  s.questions=s.questions.filter(q=>{
    if(!q.retrospective||!q.id.startsWith('prediction-history-history-'))return true;
    const [,taskNumber,questionNumber]=q.id.match(/history-(\d+)-(\d+)$/)??[];
    return Number(questionNumber)<2+Number(taskNumber)%3;
  });
  const examples=[
    {taskId:'live-export',id:'demo-export-extra-prediction',text:'Should the CSV include queries with fewer than five searches?',answer:'Include them on a separate tab so the main export stays easy to scan.',source:'predicted'},
    {taskId:'live-dashboard',id:'demo-dashboard-custom-question',text:'Where should I link the dashboard?',answer:'Add the dashboard link to the Search Health project notes.',source:'assigner_added'},
  ] as const;
  for(const example of examples){
    const task=s.tasks.find(t=>t.id===example.taskId);
    if(!task||s.questions.some(q=>q.id===example.id))continue;
    s.questions.push({...example,status:'answered',createdAt:task.createdAt,answeredAt:task.createdAt,answeredById:task.assignerId,answerSource:'assigner',history:[]});
  }
  enrichDemoHistory(s);
}

function enrichDemoHistory(s:State){
  // Add dated examples to demo tasks so the library frequencies come from real question records.
  const sets=[
    ['Where is the leadership review deck?',9],
    ['Where should I save the export?',4],
    ['Which style do date filters use?',2],
    ['How should I report practical significance?',5],
    ['Where do approved creative assets live?',4],
    ['Who approves final campaign copy?',1],
  ] as const;
  for(const [text,limit] of sets){
    const entry=s.library.find(answer=>answer.id.startsWith('library-')&&answer.question===text);
    if(!entry)continue;
    const tasks=s.tasks.filter(t=>t.id.startsWith('history-')&&t.teamId===entry.teamId&&t.type===entry.taskType&&t.status==='accepted'&&t.deliveredAt&&t.acceptedAt&&t.acceptedAt<=s.now);
    for(const task of tasks.slice(-limit)){
      const id=`demo-history-${task.id}-${entry.id}`;
      if(s.questions.some(q=>q.id===id||(q.taskId===task.id&&q.source==='asked'&&q.text===text)))continue;
      const createdAt=dateAt(Date.parse(task.deliveredAt!)+HOUR/2);
      const answeredAt=dateAt(Date.parse(createdAt)+HOUR/2);
      s.questions.push({id,taskId:task.id,text,source:'asked',status:'answered',askedById:task.assigneeId,createdAt,answeredAt,answer:entry.answer,answerSource:'assigner',answerOrigin:'manual',answeredById:task.assignerId,
        history:[{at:createdAt,event:'Asked',byId:task.assigneeId},{at:answeredAt,event:'Answered',byId:task.assignerId}]});
      s.events.push({id:id+'-asked',event:'asked',at:createdAt,taskId:task.id,teamId:task.teamId,personId:task.assigneeId,meta:{questionId:id}});
    }
  }
  const task=s.tasks.find(t=>t.id==='live-search');
  const saved=s.library.find(entry=>entry.id==='library-0');
  if(task&&task.sentAt&&saved&&!s.questions.some(q=>q.taskId===task.id&&q.text===saved.question)){
    const id='demo-search-library-context';
    s.questions.push({id,taskId:task.id,text:saved.question,source:'predicted',status:'library',attached:true,libraryConfirmed:true,libraryId:saved.id,answer:saved.answer,answerSource:'library',answeredById:saved.answeredById,createdAt:task.createdAt,answeredAt:task.sentAt,history:[{at:task.sentAt,event:'Confirmed library answer',byId:task.assignerId}]});
    for(const name of ['predicted','prepared'])s.events.push({id:id+'-'+name,event:name,at:task.sentAt,taskId:task.id,teamId:task.teamId,personId:task.assignerId,meta:{questionId:id}});
    saved.reuseCount++;
  }
  const suggested=s.questions.find(q=>q.id.startsWith('prediction-history-live-search-')&&q.text===output&&q.status==='answered'&&!q.history.length&&q.answerOrigin===undefined);
  if(suggested){suggested.answerOrigin='system';suggested.verifiedSuggestion=true;}
  seedMetricsDemo(s);
}

function seedMetricsDemo(s:State){
  const through='2026-11-22';
  s.weeks=[{from:shiftDay(through,-13),to:shiftDay(through,-7)},{from:shiftDay(through,-6),to:through}];
  const firstDay=s.weeks[0].from;
  function record(task:Task,name:string,at:string,personId:string,key:string,questionId?:string){
    const id=`demo-metrics-${key}-${name}`;
    const meta=name==='sent'?{assignerSeconds:task.assignerSeconds,predictionsOn:task.predictionsOn}:questionId?{questionId}:undefined;
    if(!s.events.some(event=>event.id===id))s.events.push({id,event:name,at,taskId:task.id,teamId:task.teamId,personId,meta});
  }

  // Fill the first Monday with completed sample work so both periods cover five workdays.
  const baseline=[
    ['devarshi','metric_deep_dive','Review Sunday search CTR by device.'],
    ['saksham','data_pull','Export the weekend zero-result queries.'],
    ['himanshu','dashboard_change','Validate the totals on the Search Health dashboard.'],
    ['dilip','experiment_readout','Summarize the allocation checks for the search test.'],
    ['karan','metric_deep_dive','Compare the regional revenue mix for the Monday review.'],
    ['shubham','data_pull','Check the publisher export against the source table.'],
    ['isha','campaign_brief','Prepare the channel summary for the publisher campaign.'],
  ] as const;
  baseline.forEach(([assigneeId,type,text],index)=>{
    const id=`demo-metrics-baseline-${assigneeId}`;
    if(s.tasks.some(task=>task.id===id))return;
    const assignee=s.people.find(person=>person.id===assigneeId);
    if(!assignee)return;
    const assignerId=assignee.teamId==='growth'?'neha':'shashank';
    const createdAt=localAt(firstDay,'00:40'),sentAt=localAt(firstDay,'01:05');
    const deliveredAt=localAt(firstDay,assignee.workStart,assignee.timeZone);
    const acceptanceRequestedAt=dateAt(Date.parse(deliveredAt)+(5+index*.25)*HOUR);
    const acceptedAt=dateAt(Date.parse(acceptanceRequestedAt)+HOUR);
    const task:Task={id,teamId:assignee.teamId,assignerId,assigneeId,type,text,status:'accepted',createdAt,sentAt,deliveredAt,acceptanceRequestedAt,acceptedAt,lowOnContext:true,predictionsOn:false,sentBackCount:0,assignerSeconds:40+index*5};
    s.tasks.push(task);
    record(task,'sent',sentAt,assignerId,id);
    record(task,'delivered',deliveredAt,assigneeId,id);
    record(task,'request-acceptance',acceptanceRequestedAt,assigneeId,id);
    record(task,'accept',acceptedAt,assignerId,id);
    const questions=assignee.teamId==='growth'
      ? [[audience,'Use the publisher lifecycle brief to confirm the audience.'],['Which channels are in scope?','Compare email with the publisher dashboard banner.'],['Which time zone should I use for sends?','Report send windows in the recipients’ local time.']]
      : [[output,'Share one chart with a short note on the main finding and a link to the source.']];
    questions.forEach(([text,answer],number)=>{
      const questionId=`${id}-asked-${number}`;
      const createdAt=dateAt(Date.parse(deliveredAt)+(1+number*.25)*HOUR);
      const answeredAt=dateAt(Date.parse(createdAt)+HOUR/2);
      s.questions.push({id:questionId,taskId:id,text,source:'asked',status:'answered',createdAt,askedById:assigneeId,answer,answeredAt,answeredById:assignerId,answerSource:'assigner',answerOrigin:'manual',history:[{at:createdAt,event:'Asked',byId:assigneeId},{at:answeredAt,event:'Answered',byId:assignerId}]});
      record(task,'asked',createdAt,assigneeId,questionId,questionId);
    });
  });

  for(const team of teams)for(const [index,week] of s.weeks.entries()){
    const fixtures=s.tasks.filter(task=>{
      if(task.teamId!==team.id||task.status!=='accepted'||!task.sentAt||!task.acceptedAt||!task.id.startsWith('history-')&&!task.id.startsWith('demo-metrics-baseline-'))return false;
      const day=dayKey(task.sentAt);
      return day>=week.from&&day<=week.to;
    });
    const sampleSize=team.id==='data'?(index===0?6:8):4;
    let samples=0;
    for(const task of fixtures){
      const question=s.questions.find(q=>q.taskId===task.id&&q.answer&&q.answeredAt&&q.answeredAt<task.acceptedAt!&&q.status!=='removed'&&q.status!=='skipped');
      if(!question)continue;
      const action=samples%(index===0?3:4)===0?'didnt_help':'helped';
      const feedbackId=`demo-metrics-${question.id}-${action}`;
      if(!s.events.some(event=>event.id===feedbackId)&&!question.feedback){
        question.feedback=action;
        const at=dateAt((Date.parse(question.answeredAt!)+Date.parse(task.acceptedAt!))/2);
        const note=action==='didnt_help'?'Needed a more specific example for this task.':undefined;
        question.history.push({at,event:action==='helped'?'Helped':'Didn’t help',byId:task.assigneeId,note});
        const entry=s.library.find(answer=>answer.id===question.libraryId);
        if(entry){if(action==='helped')entry.helped++;else entry.misses++;}
        record(task,action,at,task.assigneeId,question.id,question.id);
      }
      if(++samples>=sampleSize)break;
    }
    for(const [position,task] of fixtures.slice(-3).entries()){
      const custom=position!==0;
      const id=`demo-metrics-review-${task.id}`;
      if(s.questions.some(question=>question.id===id))continue;
      const text=custom?'Which sample should accompany the handoff?':'Does this need a separate stakeholder sign-off?';
      const event=custom?'custom':'remove';
      s.questions.push({id,taskId:task.id,text,source:custom?'assigner_added':'predicted',status:custom?'answered':'removed',createdAt:task.createdAt,
        ...(custom?{answer:'Include the latest working example and link to the full source.',answeredById:task.assignerId,answeredAt:task.createdAt,answerSource:'assigner' as const,answerOrigin:'manual' as const}:{}),
        history:[{at:task.createdAt,event:custom?'Added':'Removed',byId:task.assignerId}]});
      if(!custom)record(task,'predicted',task.createdAt,task.assignerId,id,id);
      record(task,event,task.createdAt,task.assignerId,id,id);
    }
  }
  seedAnalystWork(s);
}

function seedAnalystWork(s:State){
  const day=shiftDay(dayKey(DEMO),-1);
  const sentAt=localAt(day,'01:25');
  const deliveredAt=localAt(day,'02:05');
  const examples=[
    {id:'demo-devarshi-traffic-rca',type:'metric_deep_dive',text:'Investigate the weekend increase in mobile search traffic.',question:'Which traffic should I compare?',answer:'Compare unique mobile search sessions against the previous two weekends. Separate organic and paid traffic and exclude internal and test sessions.'},
    {id:'demo-devarshi-empty-results',type:'data_pull',text:'Pull the top zero-result search terms for the weekly review.',question:'What should the export include?',answer:'Include the query, unique session count, device and market. Use the last seven complete days in IST and share a CSV in the team folder.'},
  ] as const;
  for(const example of examples){
    if(s.tasks.some(task=>task.id===example.id))continue;
    const task:Task={id:example.id,teamId:'data',assignerId:'shashank',assigneeId:'devarshi',type:example.type,text:example.text,status:'in_progress',createdAt:sentAt,sentAt,deliveredAt,lowOnContext:false,predictionsOn:true,sentBackCount:0};
    const questionId=example.id+'-question';
    s.tasks.push(task);
    s.questions.push({id:questionId,taskId:task.id,text:example.question,source:'predicted',status:'answered',createdAt:sentAt,answer:example.answer,answeredAt:sentAt,answeredById:task.assignerId,answerSource:'assigner',answerOrigin:'manual',history:[]});
    for(const name of ['sent','delivered','predicted','prepared']){
      s.events.push({id:example.id+'-'+name,event:name,taskId:task.id,teamId:task.teamId,personId:name==='delivered'?task.assigneeId:task.assignerId,at:name==='delivered'?deliveredAt:sentAt,meta:{questionId}});
    }
  }
  s.predictionHistoryVersion=6;
}

export function ensurePredictionHistory(s:State){
  if(s.predictionHistoryVersion===6)return;
  if(s.predictionHistoryVersion===5){seedAnalystWork(s);return;}
  if(s.predictionHistoryVersion===4){seedMetricsDemo(s);return;}
  if(s.predictionHistoryVersion===3){enrichDemoHistory(s);return;}
  if(s.predictionHistoryVersion===2){diversifyDemoHistory(s);return;}
  const drafts=new Set(s.tasks.filter(t=>!t.sentAt).map(t=>t.id));
  for(const q of s.questions){
    if(q.status==='skipped'&&drafts.has(q.taskId)){
      q.status=(q.history.findLast(e=>e.event==='Skipped')?.note as Question['status'])??'pending';
    }
  }
  if(s.predictionHistoryVersion===1){diversifyDemoHistory(s);return;}
  s.predictions=true;
  const questionsByTask=new Map<string,Question[]>();
  for(const question of s.questions){
    const group=questionsByTask.get(question.taskId);
    if(group)group.push(question);
    else questionsByTask.set(question.taskId,[question]);
  }
  for(const task of s.tasks){
    if(!task.sentAt){task.predictionsOn=true;continue;}
    const questions=questionsByTask.get(task.id)??[];
    const predicted=questions.filter(q=>q.source==='predicted');
    const liveFixture=['live-search','live-dashboard','live-export'].includes(task.id);
    if(liveFixture)for(const q of predicted){
      if(q.createdAt>task.sentAt){
        q.createdAt=task.createdAt;
        q.history=q.nomineeId?[{at:task.createdAt,event:'Nominated '+(s.people.find(p=>p.id===q.nomineeId)?.name??q.nomineeId),byId:task.assignerId}]:[];
      }
    }
    const missing=liveFixture?Math.max(0,4-predicted.length):predicted.length?0:4;
    const added=baseQuestions(task).filter(text=>!predicted.some(q=>q.text===text)).slice(0,missing).map((text,index):Question=>({
      id:`prediction-history-${task.id}-${index}`,taskId:task.id,text,source:'predicted',status:liveFixture?'answered':'pending',
      createdAt:task.createdAt,history:[],retrospective:!liveFixture,
      ...(liveFixture?{answer:suggestAnswer(task,text),answeredById:task.assignerId,answeredAt:task.createdAt,answerSource:'assigner'}:{}),
    }));
    s.questions.push(...added);
    const fixtureIndex=task.id.startsWith('history-')?Number(task.id.slice(8)):NaN;
    if(liveFixture||(Number.isInteger(fixtureIndex)&&fixtureIndex%4!==0&&task.predictionsOn)){
      const options=[demoNomineeByType[task.type],...(task.teamId==='growth'?['rohan','isha']:['gaurav','saurabh','himanshu','saksham','dilip'])];
      const nominee=options.map(id=>s.people.find(p=>p.id===id)).find(p=>p&&p.teamId===task.teamId&&p.id!==task.assignerId&&p.id!==task.assigneeId);
      const recorded=[...predicted,...added];
      if(nominee&&!recorded.some(q=>q.nomineeId)){
        const q=recorded.find(q=>q.status==='answered'&&!q.attached);
        if(q){
          q.nomineeId=nominee.id;
          q.history.push({at:task.createdAt,event:'Nominated '+nominee.name,byId:task.assignerId});
        }
      }
    }
  }
  diversifyDemoHistory(s);
}
