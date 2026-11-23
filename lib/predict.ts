import {types,uuid,type LibraryEntry,type Question,type State,type Task,type TaskType} from './model';

export const output='What should the output look like?';
export const priority='Where does this sit against my other tasks?';
export const audience='Who will see this and what decision does it support?';
export const ctr='Which CTR definition should I use?';
export const windowQuestion='Which time window and comparison period?';
export const split='Should I break it down by platform, country or segment?';
export const sourceTable='Which table is the source of truth?';
export const filters='Which filters apply (bots, test traffic, internal users)?';
export const format='What format do they need (sheet, CSV, query)?';
export const change='Can I change existing charts or only add new ones?';
export const dashboardUsers='Who uses this dashboard today?';
export const primary='What was the primary metric?';
export const control='Which variant is control?';
export const guardrail='Should I flag guardrail metrics?';
const keywords:Record<TaskType,string[]> = {
  metric_deep_dive:['rca','root cause','dip','drop','spike','why','trend','ctr','revenue','rpm','fall','deep-dive','decline','variance'],
  dashboard_change:['dashboard','chart','tile','looker','tableau','visualisation'],
  data_pull:['pull','extract','export','csv','list','top 500'],
  experiment_readout:['experiment','a/b','variant','test','readout','spell-correct','control'],
  campaign_brief:['campaign','creative','audience','brief','re-engagement','channel'],
};
export const templates:Record<TaskType,string[]>={
  metric_deep_dive:['Which metric definition should I use?',windowQuestion,split],
  dashboard_change:[change,dashboardUsers],
  data_pull:[sourceTable,filters,format],
  experiment_readout:[primary,control,guardrail],
  campaign_brief:['Who is the target audience?','What is the budget range?','Which channels are in scope?'],
};
const followups:Record<TaskType,string[]>={
  metric_deep_dive:[
    'Which source should I use to validate the numbers?',
    'Should I exclude outages, launches, or other unusual days?',
    'What size of change is worth flagging in the review?',
    'Which suspected drivers should I test first?',
    'Should I include recommendations alongside the findings?',
    'Are there known tracking changes that could explain the movement?',
  ],
  dashboard_change:[
    'What should the new view let readers decide or do?',
    'Which filters and defaults should the new view inherit?',
    'How often should the data refresh?',
    'Whose sign-off is needed before publishing the change?',
    'What checks would confirm that the new tiles are correct?',
  ],
  data_pull:[
    'What should one row represent in the export?',
    'How should I handle duplicate or missing records?',
    'What time zone should define the date boundaries?',
    'Where should the results be shared, and who needs access?',
    'What totals should I reconcile before sharing the result?',
  ],
  experiment_readout:[
    'Which dates and eligible users should be included?',
    'What decision should the readout support?',
    'How should I report inconclusive or conflicting results?',
    'Which segments or rollout stages should I compare?',
    'Were there tracking or allocation issues I should account for?',
  ],
  campaign_brief:[
    'What action should the audience take after seeing the campaign?',
    'What outcome should we measure?',
    'Are there approval requirements or deadlines for the creative?',
    'Are there audience groups we should exclude?',
    'Which previous campaigns or assets should inform the brief?',
  ],
};
const stop=new Set('a an and are as at be do did does for from had has how i in is it last me my of on only or our should that the their them then there they this to us use was we were what when where which who will with would you your weekly'.split(' '));
export const words=(text:string)=>[...new Set(text.toLowerCase().match(/[a-z0-9_]+/g)??[])].filter(w=>!stop.has(w));
const overlap=(a:string[],b:string[])=>a.filter(x=>b.includes(x)).length;
export function classify(text:string,teamId:string):TaskType {
  const ranked=Object.entries(keywords).map(([type,keys])=>({type:type as TaskType,score:keys.filter(word=>new RegExp('\\b'+word+'\\b','i').test(text)).length})).sort((a,b)=>b.score-a.score);
  return ranked[0].score?ranked[0].type:teamId==='growth'?'campaign_brief':'data_pull';
}
const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
const contextWords=(text:string)=>words(text).filter(w=>['search','ctr','ad','density','platform','revenue','publisher','mobile','diwali','rpm'].includes(w));
type BriefQuestion={text:string;answer:string};
const briefPatterns:{type:TaskType;match:RegExp;questions:BriefQuestion[]}[]=[
  {type:'metric_deep_dive',match:/\b(rca|root cause|spike|increase|drop|dip|surge|decline)\b/i,questions:[
    {text:'When did the change start, and what should I compare it against?',answer:'Find the first hour or day when the pattern shifted. Compare with the same weekday and hour in the prior week, and check a longer baseline before treating it as unusual.'},
    {text:'Which platforms or traffic sources contributed most to the change?',answer:'Compare absolute changes by platform, acquisition source, and geography. Rank the segments by their contribution to the total change.'},
    {text:'How should I separate real traffic from bots or tracking changes?',answer:'Compare raw events with unique sessions and check for duplicate events, internal traffic, or bot spikes. Review release and instrumentation changes around the start time.'},
    {text:'Which releases, campaigns, or external events should I check?',answer:'Compare the onset with release, campaign, and incident timelines. For each plausible cause, check whether the affected segment and timing match the change.'},
  ]},
  {type:'data_pull',match:/\b(export|csv|extract|download|pull a list|pull a csv)\b/i,questions:[
    {text:'What should one row represent in the export?',answer:'Use one row per requested entity. Document the unique identifier and check for duplicates after joins.'},
    {text:'Which fields should the export include, and who needs access?',answer:'Include the fields needed for the requested analysis and omit unrelated identifiers. Confirm the destination and recipient list before sharing.'},
    {text:'How should I validate the export before sharing it?',answer:'Reconcile counts to the source for the same filters and date range. Spot-check edge cases and include the final row count with the export.'},
  ]},
  {type:'dashboard_change',match:/\b(dashboard|chart|tile|visualization)\b/i,questions:[
    {text:'What should the new view help its readers decide?',answer:'Put the metric and comparison that support the decision first. Keep diagnostic dimensions available as filters or drill-downs.'},
    {text:'Which filters and defaults should the new view inherit?',answer:'Carry over the existing date and segment filters unless the brief specifies changes. Document defaults and test that they apply to each affected chart.'},
    {text:'How should I validate the updated view before publishing?',answer:'Compare totals against the current dashboard at the same grain and filters. Test one empty result and one high-volume segment before publishing.'},
  ]},
  {type:'experiment_readout',match:/\b(experiment|holdout|variant|a\/b|readout)\b/i,questions:[
    {text:'What decision should I make if the results are inconclusive?',answer:'Compare the interval with the minimum effect worth shipping. Spell out whether the data support a rollout, more time, or an inconclusive result.'},
    {text:'Which exposure and allocation checks should the readout include?',answer:'Check exposure counts, allocation balance, and whether eligibility or tracking changed during the test before interpreting any lift.'},
    {text:'Which guardrail changes could outweigh a primary-metric win?',answer:'Report the main guardrail changes with their uncertainty and explain which would delay a rollout or require a second check.'},
  ]},
  {type:'campaign_brief',match:/\b(campaign|publishers|re-engag|creative)\b/i,questions:[
    {text:'Which audience should receive the campaign, and who should be excluded?',answer:'Write down eligibility and exclusions, including opted-out users. Estimate reachable audience by channel and check for overlapping sends.'},
    {text:'What counts as a successful action after the campaign?',answer:'Define the activation event and follow-up window before launch. Track reach and conversions by channel so the team can compare outcomes.'},
  ]},
];
function questionsForBrief(t:Task){
  return briefPatterns.filter(pattern=>pattern.type===t.type&&pattern.match.test(t.text)).flatMap(pattern=>pattern.questions);
}

export function matchLibrary(s:State,t:Task,text:string,exclude?:string,exactOnly=false):LibraryEntry|undefined {
  const tokens=words(text);
  return s.library.filter(e=>(!exactOnly||normalized(e.question)===normalized(text))&&e.id!==exclude&&e.createdFor!==t.id&&e.teamId===t.teamId&&e.reusable&&e.misses<2&&(e.taskType===t.type||normalized(e.question)===normalized(text)))
    .map(e=>{
      const exact=normalized(e.question)===normalized(text);
      const matches=overlap(tokens,e.keywords);
      const contextualWords=contextWords(e.question).filter(w=>!tokens.includes(w));
      const contextual=exact||contextualWords.every(w=>words(t.text).includes(w));
      return {e,score:contextual&&(exact||matches>=2)?Number(exact)*100+matches+e.helped*.03:0};
    }).sort((a,b)=>b.score-a.score).find(x=>x.score>0)?.e;
}

export function attach(s:State,q:Question,e:LibraryEntry,count=true) {
  Object.assign(q,{status:'library',answer:e.answer,answeredById:e.answeredById,answerSource:'library',answerOrigin:undefined,libraryId:e.id,answeredAt:s.now,overlapAt:undefined,verifiedSuggestion:false});
  if(count)e.reuseCount++;
}
export function suggestAnswer(t:Task,text:string) {
  const q=normalized(text);
  const tailored=questionsForBrief(t).find(question=>normalized(question.text)===q);
  if(tailored)return tailored.answer;
  if(/output|format|share the results/.test(q)){
    if(t.type==='data_pull')return 'Share a CSV with a short note on filters, date range, and row count. Confirm the delivery location before exporting.';
    if(t.type==='dashboard_change')return 'Share a link to the updated view and a short note on what changed. Include the filters and checks you used.';
    if(t.type==='campaign_brief')return 'Share a one-page brief with the audience, objective, channels, and measurement plan.';
    return 'Share a short summary with the key finding, one comparison chart, and a link to the underlying data.';
  }
  if(/priority|other tasks/.test(q))return 'Continue your current priority work first, then share an initial read at the next working-hours overlap. Confirm if this should move ahead of existing work.';
  if(/who will see|audience|decision|what action/.test(q)){
    return /leadership/i.test(t.text)?'Prepare this for the leadership review. Lead with the change, its likely drivers, and the decision that needs input.':'Share a first pass with the task owner. Put the decision or action at the top and confirm who else should review it.';
  }
  if(/ctr definition/.test(q))return 'Use clicks divided by searches with at least one result as a starting definition. Confirm that this matches the reporting metric and its exclusions.';
  if(/definition|primary metric/.test(q))return 'Start with the team’s documented metric definition. State the numerator, denominator, and exclusions before comparing results.';
  if(/date|window|period/.test(q))return 'Use the last completed reporting period and compare like-for-like dates. Confirm the reporting time zone and any excluded days.';
  if(/platform|segment|country/.test(q))return 'Start with the largest segments and break out smaller groups only where the movement changes the conclusion.';
  if(/source|table|data refresh/.test(q))return 'Start with the team’s maintained reporting source. Verify its freshness and reconcile totals against the existing dashboard.';
  if(/duplicate|missing|filters|traffic|one row|rows/.test(q))return 'Keep the grain consistent with the requested output. Document deduplication, missing values, and exclusions before sharing.';
  if(/variant|control|inconclusive|rollout/.test(q))return 'Use the experiment plan to confirm the control and eligible population. Label inconclusive results and describe any rollout changes.';
  if(/guardrail|validate|checks|reconcile/.test(q))return 'Check sample size, totals, and any changes in tracking. Call out discrepancies alongside the result.';
  if(/outage|drivers|tracking/.test(q))return 'Check changes that align with the start of the movement, including releases and instrumentation. Keep observations separate from unverified causes.';
  if(/review|approval|sign off/.test(q))return 'Share the first draft with the task owner for review and confirm the final approver before publishing.';
  if(t.type==='campaign_brief')return 'Start with the stated campaign objective. Flag any open decisions about budget, audience, timing, and channels for the owner.';
  if(t.type==='dashboard_change')return 'Preserve existing definitions and defaults where possible. Flag any behavior change and document how you tested it.';
  return 'Use the task brief as the scope for a first pass. Note any assumptions that would change the result and confirm them with the task owner.';
}

export function fallbackNominee(s:State,t:Task,text:string){
  const choices=s.people.filter(p=>p.teamId===t.teamId&&p.id!==t.assignerId&&p.id!==t.assigneeId);
  if(/priority|other tasks|audience|decision|who will|approval/i.test(text)){
    const lead=choices.find(p=>p.canAssign&&/manager/i.test(p.title));
    if(lead)return lead.id;
  }
  const senior=choices.find(p=>p.title==='Senior analyst');
  if(senior)return senior.id;
  return choices.map(p=>({id:p.id,count:s.tasks.filter(task=>task.assigneeId===p.id&&task.type===t.type&&task.status==='accepted').length}))
    .sort((a,b)=>b.count-a.count)[0]?.id;
}
export function baseQuestions(t:Task){
  const ctrTask=t.type==='metric_deep_dive'&&/\bctr\b/i.test(t.text);
  return [output,priority,audience,...templates[t.type].map(q=>ctrTask&&q.startsWith('Which metric definition')?ctr:q)];
}

export function predict(s:State,t:Task,phrases?:Record<string,string>,additional=false) {
  const p=s.people.find(p=>p.id===t.assigneeId)!;
  const same=s.tasks.filter(x=>x.id!==t.id&&x.sentAt&&x.type===t.type&&x.teamId===t.teamId);
  const personal=same.filter(x=>x.assigneeId===p.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const similar=[...same].sort((a,b)=>overlap(words(t.text),words(b.text))-overlap(words(t.text),words(a.text))).slice(0,5);
  const personalIds=new Set(personal.map(x=>x.id));
  const similarIds=new Set(similar.map(x=>x.id));
  const relevant=s.questions.filter(q=>q.source==='asked'&&Boolean(q.answeredAt)&&(personalIds.has(q.taskId)||similarIds.has(q.taskId)));
  const ctrTask=t.type==='metric_deep_dive'&&/\bctr\b/i.test(t.text);
  const defaults=baseQuestions(t);
  const tailored=new Set(questionsForBrief(t).map(q=>q.text));
  const existing=additional?s.questions.filter(q=>q.taskId===t.id):[];
  const seen=new Set(existing.flatMap(q=>[q.predictionKey,normalized(q.text)]).filter(Boolean));
  const usedEntries=new Set(existing.map(q=>q.libraryId).filter(Boolean));
  const candidates=[...new Map([...tailored,...defaults,...relevant.map(q=>ctrTask&&q.text==='Which metric definition should I use?'?ctr:q.text),...(additional?followups[t.type]:[])].map(q=>[normalized(q),q])).values()]
    .filter(q=>!seen.has(normalized(q))&&!seen.has(normalized(phrases?.[q]||q)));
  const ranked=candidates.map(text=>{
    const matches=(q:Question)=>normalized(q.text)===normalized(text);
    const count=new Set(relevant.filter(q=>personalIds.has(q.taskId)&&matches(q)).map(q=>q.taskId)).size;
    const removed=s.questions.filter(q=>matches(q)&&q.status==='removed'&&same.some(t=>t.id===q.taskId)).length;
    const technical=/definition|table|filters|source of truth/i.test(text);
    const helpers=new Map<string,number>();
    if(technical)for(const q of s.questions){
      if((matches(q)||overlap(words(q.text),words(text))>=2)&&q.answeredById&&q.answeredById!==t.assignerId&&q.answeredById!==p.id&&s.people.some(p=>p.id===q.answeredById&&p.teamId===t.teamId))helpers.set(q.answeredById,(helpers.get(q.answeredById)??0)+1);
    }
    const nominee=[...helpers].sort((a,b)=>b[1]-a[1])[0]?.[0]??fallbackNominee(s,t,text);
    return {text,nominee,reason:tailored.has(text)?'Suggested from the details in this task brief':count?`${p.name} asked this on ${count} of their last ${personal.length} ${types[t.type].toLowerCase()} tasks`:nominee&&helpers.has(nominee)?`${s.people.find(p=>p.id===nominee)?.name} answered similar questions before`:`Standard question for ${types[t.type].toLowerCase()} tasks`,
      score:(tailored.has(text)?4:0)+(count/(personal.length||1))+(/priority|output|other tasks|decision|audience|who will/i.test(text)?1:.3)+(/definition|table|source|priority|output|other tasks/i.test(text)?1:.5)-Math.min(removed*.22,1)};
  }).sort((a,b)=>b.score-a.score);
  const prepared=ranked.flatMap(c=>{
    const label=phrases?.[c.text]||c.text;
    const key=normalized(c.text);
    if(seen.has(key)||seen.has(normalized(label)))return [];
    seen.add(key);
    seen.add(normalized(label));
    const e=matchLibrary(s,t,c.text,undefined,tailored.has(c.text));
    if(e&&usedEntries.has(e.id))return [];
    if(e)usedEntries.add(e.id);
    const q:Question={id:uuid(),taskId:t.id,text:label,predictionKey:key,source:'predicted',status:'pending',createdAt:s.now,history:[],reason:c.reason,suggestedNomineeId:c.nominee};
    if(e){attach(s,q,e,false);q.attached=true;}
    else q.suggestedAnswer=suggestAnswer(t,c.text);
    return [q];
  });
  return additional?prepared.slice(0,3):[...prepared.filter(q=>!q.attached).slice(0,5),...prepared.filter(q=>q.attached).slice(0,3)];
}
