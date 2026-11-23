import {seed} from '../data/seed';
import {DEMO,IST,dateAt,teams,types,uuid,nomineeIdsFor,pendingNomineesFor,type Question,type State,type Task,type TaskType,type Person} from './model';
import {advance,dayKey,localAt,nextStart,notify,onShift,shiftDay} from './schedule';
import {attach,classify,fallbackNominee,matchLibrary,predict,suggestAnswer,words} from './predict';
import {metrics,profile} from './metrics';

type Input=Record<string,unknown>;
const asText=(v:unknown)=>typeof v==='string'?v.trim():'';
function required(v:unknown,message='Enter some text.'){const text=asText(v);if(!text)throw new Error(message);return text;}
function event(s:State,name:string,t:Task,personId?:string,meta?:Input){
  s.events.push({id:uuid(),event:name,at:s.now,taskId:t.id,teamId:t.teamId,personId,meta});
}
function trail(s:State,q:Question,name:string,byId?:string,note?:string){q.history.push({at:s.now,event:name,byId,note});}
function makeQuestion(s:State,t:Task,text:string,source:Question['source']){
  const q:Question={id:uuid(),taskId:t.id,text,source,status:'pending',createdAt:s.now,history:[],askedById:source==='asked'?t.assigneeId:undefined};
  s.questions.push(q);
  return q;
}
function person(s:State,id:unknown){
  const p=s.people.find(p=>p.id===id);
  if(!p)throw new Error('Person not found.');
  return p;
}
export const isResolved=(q:Question)=>q.status==='answered'||q.status==='library';
export const nominationOpen=(q:Question,id?:string)=>id?pendingNomineesFor(q).includes(id):pendingNomineesFor(q).length>0;
function setPendingNominees(q:Question,ids:string[]){
  q.pendingNomineeIds=ids;
  q.nominationPending=ids.length>0;
}
export const isOutstanding=(q:Question)=>!isResolved(q)&&q.status!=='removed'&&q.status!=='skipped';
export function agenda(s:State,assignerId:string) {
  const own=new Set(s.tasks.filter(t=>t.assignerId===assignerId).map(t=>t.id));
  return s.questions.filter(q=>own.has(q.taskId)&&q.overlapAt&&isOutstanding(q)).sort((a,b)=>Number(!!b.raised)-Number(!!a.raised)||b.createdAt.localeCompare(a.createdAt));
}
export function listTasks(s:State,id:string,{includeScheduled=false}={}) {
  const priority:Record<string,number>={sent_back:0,new:1,queued:2,waiting:3,in_progress:4,acceptance_requested:5,accepted:6};
  return s.tasks.filter(t=>t.assigneeId===id&&t.sentAt&&t.sentAt<=s.now&&(
    t.status==='queued'?includeScheduled:Boolean(t.status!=='draft'&&t.deliveredAt&&t.deliveredAt<=s.now)
  ))
    .sort((a,b)=>((priority[a.status]??9)-(priority[b.status]??9))||Number(!!b.urgent)-Number(!!a.urgent)||b.createdAt.localeCompare(a.createdAt));
}
export function librarySearch(s:State,teamId:string,q:string) {
  const questionKey=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const sent=new Set(s.tasks.filter(t=>t.teamId===teamId&&t.sentAt&&t.sentAt<=s.now).map(t=>t.id));
  const asked=new Map<string,number>();
  for(const entry of s.questions){
    if(entry.source!=='asked'||entry.createdAt>s.now||!sent.has(entry.taskId))continue;
    const key=questionKey(entry.text);
    asked.set(key,(asked.get(key)??0)+1);
  }
  return s.library.filter(e=>e.teamId===teamId&&`${e.question} ${e.answer} ${types[e.taskType]} ${person(s,e.answeredById).name}`.toLowerCase().includes(q.toLowerCase()))
    .map(e=>({...e,askedCount:asked.get(questionKey(e.question))??0}))
    .sort((a,b)=>b.reuseCount-a.reuseCount);
}
function overlap(s:State,t:Task,q:Question) {
  const manager=person(s,t.assignerId);
  q.overlapAt=onShift(manager,s.now)?s.now:nextStart(manager,s.now);
  q.status=q.raised?'raised':'logged_overlap';
  trail(s,q,'Queued for manager reply',t.assigneeId);
  if(onShift(manager,s.now))notify(s,manager.id,`A question is awaiting your reply for ${person(s,t.assigneeId).name}.`,{taskId:t.id,page:'agenda'});
}
function route(s:State,t:Task,q:Question,exclude?:string) {
  const e=matchLibrary(s,t,q.text,exclude);
  if(e){attach(s,q,e);setPendingNominees(q,[]);trail(s,q,'Answered from Library',e.answeredById,e.answer);return;}
  const eligible=[...nomineeIdsFor(q),...s.questions.filter(x=>x.taskId===t.id).flatMap(nomineeIdsFor),t.teamId==='data'?'saurabh':undefined];
  const nominee=s.people.find(p=>p.id===eligible.find(id=>s.people.some(p=>p.id===id&&p.id!==q.cantHelpById&&p.id!==t.assigneeId&&p.id!==t.assignerId&&p.teamId===t.teamId&&onShift(p,s.now))));
  if(nominee){
    q.nomineeId=nominee.id;
    q.overlapAt=undefined;
    q.status='routed';
    setPendingNominees(q,[nominee.id]);
    trail(s,q,'Sent to '+nominee.name,t.assigneeId);
    notify(s,nominee.id,`${person(s,t.assigneeId).name} sent you a question.`,{taskId:t.id,page:'questions'});
  }else{setPendingNominees(q,[]);overlap(s,t,q);}
}
function updateWaiting(s:State,t:Task) {
  if(['new','in_progress','waiting'].includes(t.status)){
    t.status=s.questions.some(q=>q.taskId===t.id&&isOutstanding(q)&&(q.source!=='assigner_added'||nominationOpen(q)))?'waiting':'in_progress';
  }
}
function answer(s:State,t:Task,q:Question,actor:string,text:string,notifyAssignee=true) {
  const p=person(s,actor);
  const isAssigner=actor===t.assignerId;
  if(q.status==='removed')throw new Error('Undo removal before answering.');
  if(!isAssigner&&(!t.sentAt||!nominationOpen(q,actor)))throw new Error('This nomination is already closed or assigned to someone else.');
  const followUp=!isAssigner&&isResolved(q);
  if(!isAssigner)setPendingNominees(q,pendingNomineesFor(q).filter(id=>id!==actor));
  if(followUp){
    const response={text,byId:actor};
    const earlier=q.nomineeResponses??(q.nomineeResponse?[q.nomineeResponse]:[]);
    q.nomineeResponses=[...earlier,response];
    q.nomineeResponse=response;
    trail(s,q,'Added a follow-up',actor,text);
    event(s,'answer',t,actor,{questionId:q.id});
    notify(s,t.assigneeId,`${p.name} added a follow-up to your handoff.`,{taskId:t.id,page:'detail'});
    return;
  }
  const reuseAllowed=q.source==='asked'&&/definition|table|traffic|filter|control|guardrail|denominator|timezone/i.test(q.text)&&!q.raised;
  let e=s.library.find(x=>x.teamId===t.teamId&&x.taskType===t.type&&x.question===q.text&&x.answer===text);
  if(!e){
    e={id:uuid(),teamId:t.teamId,question:q.text,answer:text,taskType:t.type,answeredById:p.id,keywords:words(q.text),reuseCount:0,helped:0,misses:0,reusable:reuseAllowed,createdFor:t.id};
    s.library.push(e);
  }
  Object.assign(q,{answer:text,answeredById:p.id,answeredAt:s.now,answerSource:isAssigner?'assigner':'nominee',answerOrigin:'manual',status:'answered',libraryId:e.id,overlapAt:undefined,feedback:undefined,missingNote:undefined,verifiedSuggestion:false});
  trail(s,q,'Answered',p.id,text);
  event(s,'answer',t,p.id,{questionId:q.id});
  if(t.sentAt){
    updateWaiting(s,t);
    if(notifyAssignee)notify(s,t.assigneeId,`${p.name} answered a question on your handoff.`,{taskId:t.id,page:'detail'});
  }
}
function nominationChoices(s:State,t:Task,value:unknown){
  const ids=[...new Set(Array.isArray(value)?value:value===''?[]:[value])];
  const people=ids.map(id=>person(s,id));
  if(people.some(p=>p.teamId!==t.teamId||p.id===t.assigneeId||p.id===t.assignerId))throw new Error('Choose other teammates on this team.');
  return people;
}
function nominate(s:State,t:Task,q:Question,value:unknown,afterHandoff=false){
  if((t.sentAt&&!afterHandoff)||q.status==='removed')throw new Error('Change the nominations before sending.');
  const people=nominationChoices(s,t,value);
  const previous=new Set(nomineeIdsFor(q));
  const next=people.map(p=>p.id);
  if(next.length===previous.size&&next.every(id=>previous.has(id)))return;
  q.nomineeIds=next;
  q.nomineeId=next[0];
  const pending=afterHandoff?[...pendingNomineesFor(q).filter(id=>next.includes(id)),...next.filter(id=>!previous.has(id))]:next;
  setPendingNominees(q,pending);
  if(!isResolved(q)){
    q.status=afterHandoff?'routed':next.length?'nominated':'pending';
    if(afterHandoff)q.overlapAt=undefined;
  }
  for(const p of people.filter(p=>!previous.has(p.id)))trail(s,q,'Nominated '+p.name,t.assignerId);
  if([...previous].some(id=>!next.includes(id)))trail(s,q,'Updated nominations',t.assignerId);
  if(afterHandoff)for(const p of people.filter(p=>!previous.has(p.id))){
    notify(s,p.id,`${person(s,t.assignerId).name} nominated you to answer a question for ${person(s,t.assigneeId).name}.`,{taskId:t.id,page:'questions'});
  }
}
function saveContext(s:State,t:Task,q:Question,input:Input){
  if(t.sentAt||q.status==='removed')throw new Error('Edit context before sending.');
  if(typeof input.answerId==='string'){
    if(!q.answer||q.status!=='answered'||q.attached)throw new Error('Save the first answer before adding another.');
    const text=required(input.text);
    const answers=q.additionalAnswers??[];
    if(input.answerId==='new'){
      q.additionalAnswers=[...answers,{id:uuid(),text}];
      trail(s,q,'Added an answer',t.assignerId,text);
    }else{
      const existing=answers.find(answer=>answer.id===input.answerId);
      if(!existing)throw new Error('Answer not found.');
      if(existing.text!==text){
        existing.text=text;
        trail(s,q,'Edited an answer',t.assignerId,text);
      }
    }
    return q;
  }
  if(Array.isArray(input.nomineeIds))nominate(s,t,q,input.nomineeIds);
  else if(typeof input.nomineeId==='string')nominate(s,t,q,input.nomineeId);
  const text=asText(input.text);
  if(text&&text!==q.answer&&input.requiresVerification!==true){
    const suggested=q.suggestedAnswer??(q.source==='predicted'?suggestAnswer(t,q.text):undefined);
    const wasSuggested=q.answerOrigin==='system'||q.answerOrigin==='edited_system';
    const fromSuggestion=input.verifySuggested===true&&(wasSuggested||!q.answer&&Boolean(suggested)&&input.fromSuggestion!==false);
    answer(s,t,q,t.assignerId,text);
    q.verifiedSuggestion=input.verifySuggested===true;
    if(fromSuggestion)q.answerOrigin=text===suggested?'system':'edited_system';
  }
  return q;
}
function send(s:State,t:Task,seconds:number){
  if(t.sentAt)return t;
  t.predictionsOn=true;
  if(!s.questions.some(q=>q.taskId===t.id&&q.source==='predicted'))mutate(s,['tasks',t.id,'predict'],'POST',{});
  const receiver=person(s,t.assigneeId), sender=person(s,t.assignerId);
  const online=onShift(receiver,s.now);
  t.sentAt=s.now;
  t.assignerSeconds=Math.max(0,Number.isFinite(seconds)?seconds:0);
  t.deliveredAt=online||t.urgent?s.now:nextStart(receiver,s.now);
  t.status=online||t.urgent?'new':'queued';
  for(const q of s.questions.filter(q=>q.taskId===t.id)){
    delete q.suggestedAnswer;
    if(q.status==='library'&&q.attached&&!q.libraryConfirmed){
      q.status='removed';
      trail(s,q,'Excluded at send because the library answer was unconfirmed',sender.id);
    }else if(q.source==='predicted'&&isOutstanding(q)&&!nominationOpen(q)){
      q.status='skipped';
      trail(s,q,'Left out at send because the suggestion was not used',sender.id);
    }
    if(q.status==='library'&&q.libraryId){const e=s.library.find(e=>e.id===q.libraryId);if(e)e.reuseCount++;}
    for(const id of pendingNomineesFor(q))notify(s,id,`${sender.name} nominated you to answer a question for ${receiver.name}.`,{taskId:t.id,page:'questions',urgent:t.urgent,at:s.now});
    if(q.source==='predicted'&&(isResolved(q)||q.status==='nominated'))event(s,'prepared',t,sender.id,{questionId:q.id});
  }
  notify(s,receiver.id,`${sender.name} assigned you work: ${t.text}`,{taskId:t.id,page:'detail',urgent:t.urgent});
  if(sender.id==='gaurav')notify(s,'shashank',`Gaurav assigned work to ${receiver.name}: ${t.text}`,{taskId:t.id,page:'sent',urgent:t.urgent});
  event(s,'sent',t,sender.id,{predictionsOn:t.predictionsOn,assignerSeconds:t.assignerSeconds});
  if(t.status==='new')event(s,'delivered',t,receiver.id);
  return t;
}
function reassignQueued(s:State,t:Task,input:Input){
  if(input.actorId!==t.assignerId)throw new Error('Only the assigner can change the recipient.');
  if(t.status!=='queued'||!t.deliveredAt||t.deliveredAt<=s.now)throw new Error('The handoff has already been delivered.');
  const receiver=person(s,input.assigneeId);
  if(!receiver.canReceive||receiver.id===t.assignerId||receiver.teamId!==t.teamId)throw new Error('Choose an eligible teammate on this team.');
  const previousAssignee=t.assigneeId;
  if(receiver.id===previousAssignee)return t;
  const sender=person(s,t.assignerId);
  const removedNotifications=new Set(s.notifications.filter(n=>n.taskId===t.id&&(
    (n.page==='detail'&&n.toId===previousAssignee)||(n.page==='questions'&&n.toId===receiver.id)
  )).map(n=>n.id));
  s.notifications=s.notifications.filter(n=>!removedNotifications.has(n.id));
  s.events=s.events.filter(e=>!removedNotifications.has(e.id)||e.at<=s.now);
  for(const q of s.questions.filter(q=>q.taskId===t.id&&nomineeIdsFor(q).includes(receiver.id))){
    q.nomineeIds=nomineeIdsFor(q).filter(id=>id!==receiver.id);
    q.nomineeId=q.nomineeIds[0];
    setPendingNominees(q,pendingNomineesFor(q).filter(id=>id!==receiver.id));
    if(q.status==='nominated'&&!nominationOpen(q))q.status=q.source==='predicted'?'skipped':'pending';
    trail(s,q,'Nominee became the assignee',sender.id,receiver.name);
  }
  for(const n of s.notifications.filter(n=>n.taskId===t.id&&n.page==='questions')){
    n.text=`${sender.name} nominated you to answer a question for ${receiver.name}.`;
  }
  t.assigneeId=receiver.id;
  const deliverNow=onShift(receiver,s.now)||t.urgent;
  t.deliveredAt=deliverNow?s.now:nextStart(receiver,s.now);
  t.status=deliverNow?'new':'queued';
  notify(s,receiver.id,`${sender.name} assigned you work: ${t.text}`,{taskId:t.id,page:'detail',urgent:t.urgent});
  event(s,'reassigned',t,sender.id,{previousAssigneeId:previousAssignee,assigneeId:receiver.id});
  if(deliverNow)event(s,'delivered',t,receiver.id);
  return t;
}
function makeAvailableForWork(s:State,t:Task){
  if(t.status!=='queued')return;
  t.deliveredAt=s.now;
  t.status='new';
  event(s,'delivered',t,t.assigneeId);
}
function modifyHandoff(s:State,t:Task,input:Input){
  if(input.actorId!==t.assignerId)throw new Error('Only the assigner can modify this handoff.');
  if(!t.sentAt||t.sentAt>s.now||t.status==='accepted')throw new Error('Only sent handoffs that are still open can be modified.');
  const text=input.text===undefined?t.text:required(input.text,'Describe the work first.');
  const priorityNote=input.priorityNote===undefined?t.priorityNote:asText(input.priorityNote)||undefined;
  const questionEdits=Array.isArray(input.questions)?input.questions as Input[]:[];
  const edits=questionEdits.map(edit=>{
    const q=s.questions.find(row=>row.id===edit?.id&&row.taskId===t.id&&row.source!=='asked'&&!row.retrospective&&row.status!=='removed'&&row.status!=='skipped');
    if(!q)throw new Error('A handoff question is no longer available to edit.');
    return {q,text:edit.text===undefined?q.text:required(edit.text,'Enter the question.'),answerText:edit.answer===undefined?q.answer:required(edit.answer,'Enter an answer.')};
  });
  if(new Set(edits.map(edit=>edit.q.id)).size!==edits.length)throw new Error('Each question can only be edited once.');
  const newQuestion=asText(input.newQuestion);
  const newAnswer=asText(input.newAnswer);
  if(newAnswer&&!newQuestion)throw new Error('Enter the new question before adding its answer.');
  const changed=edits.filter(edit=>edit.q.text!==edit.text||edit.q.answer!==edit.answerText);
  if(text===t.text&&priorityNote===t.priorityNote&&!changed.length&&!newQuestion)return t;
  t.text=text;
  t.priorityNote=priorityNote;
  t.modifiedAt=s.now;
  for(const edit of changed){
    if(edit.q.text!==edit.text){
      trail(s,edit.q,'Question edited',t.assignerId,edit.q.text);
      edit.q.text=edit.text;
    }
    if(edit.answerText&&edit.answerText!==edit.q.answer){
      const wasSuggestion=edit.q.answerOrigin==='system'||edit.q.answerOrigin==='edited_system';
      answer(s,t,edit.q,t.assignerId,edit.answerText,false);
      edit.q.attached=false;
      edit.q.libraryConfirmed=false;
      if(wasSuggestion){
        edit.q.answerOrigin='edited_system';
        edit.q.verifiedSuggestion=true;
      }
    }
  }
  if(newQuestion){
    const q=makeQuestion(s,t,newQuestion,'assigner_added');
    trail(s,q,'Added to sent handoff',t.assignerId);
    event(s,'custom',t,t.assignerId,{questionId:q.id});
    if(newAnswer)answer(s,t,q,t.assignerId,newAnswer,false);
  }
  event(s,'handoff-modified',t,t.assignerId);
  const assignmentNotice=s.notifications.find(n=>n.taskId===t.id&&n.page==='detail'&&n.toId===t.assigneeId&&n.at>s.now);
  const message=`${person(s,t.assignerId).name} updated your handoff: ${text}`;
  if(assignmentNotice)assignmentNotice.text=message;
  else notify(s,t.assigneeId,message,{taskId:t.id,page:'detail',urgent:t.urgent});
  return t;
}
export function mutate(s:State,path:string[],method:string,input:Input){
  const [resource,id,action,sub]=path;
  if(resource==='demo'&&id==='reset')return {reset:seed()};
  if(resource==='clock'){
    const to=asText(input.to);
    if(!Number.isFinite(Date.parse(to)))throw new Error('Choose a valid simulated time.');
    if(Math.abs(Date.parse(to)-Date.parse(s.now))>366*86400000)throw new Error('Choose a date within one year of the simulated clock.');
    advance(s,dateAt(Date.parse(to)));
    return {now:s.now};
  }
  if(resource==='notifications'){
    const n=s.notifications.find(n=>n.id===id);
    if(n)n.read=true;
    return n;
  }
  if(resource==='settings'){
    if(id==='predictions'){s.predictions=true;return {predictions:true};}
    if(id==='slack'){s.slack=input.enabled===true;return {slack:s.slack};}
    if(id==='people'){
      const p=person(s,action);
      const workStart=required(input.workStart),workEnd=required(input.workEnd);
      if(![workStart,workEnd].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||workStart===workEnd)throw new Error('Enter two different valid working times.');
      const timeZone=required(input.timeZone);
      new Intl.DateTimeFormat('en',{timeZone});
      Object.assign(p,{workStart,workEnd,timeZone});
      s.tasks.filter(t=>t.assigneeId===p.id&&t.status==='queued'&&t.sentAt).forEach(t=>{t.deliveredAt=onShift(p,s.now)?s.now:nextStart(p,s.now);});
      s.notifications.filter(n=>n.toId===p.id&&n.at>s.now&&!n.urgent).forEach(n=>{n.at=onShift(p,s.now)?s.now:nextStart(p,s.now);});
      advance(s,s.now);
      return p;
    }
    throw new Error('Unknown setting.');
  }
  if(resource==='ratings'){
    const t=s.tasks.find(t=>t.id===input.taskId);
    if(!t||t.status!=='accepted')throw new Error('Accept the handoff before rating it.');
    const raterId=asText(input.raterId);
    const score=Number(input.score);
    if(![t.assigneeId,t.assignerId].includes(raterId)||!Number.isInteger(score)||score<1||score>5)throw new Error('Choose a score from 1 to 5.');
    s.ratings=s.ratings.filter(r=>r.taskId!==t.id||r.raterId!==raterId);
    s.ratings.push({taskId:t.id,raterId,score});
    event(s,'rating',t,raterId,{score});
    return {score};
  }
  if(resource==='tasks'&&method==='DELETE'){
    const t=s.tasks.find(task=>task.id===id);
    if(action||!t)throw new Error('Task not found.');
    if(input.actorId!==t.assignerId)throw new Error('Only the assigner can delete this task.');
    s.tasks=s.tasks.filter(task=>task.id!==t.id);
    s.questions=s.questions.filter(question=>question.taskId!==t.id);
    s.notifications=s.notifications.filter(notification=>notification.taskId!==t.id);
    s.ratings=s.ratings.filter(rating=>rating.taskId!==t.id);
    s.events=s.events.filter(entry=>entry.taskId!==t.id);
    return {id:t.id};
  }
  if(resource==='tasks'&&!id){
    const assigner=person(s,input.assignerId),assignee=person(s,input.assigneeId);
    if(!assigner.canAssign||assigner.teamId!==assignee.teamId||assigner.id===assignee.id)throw new Error('Choose a teammate in your workspace.');
    const text=required(input.text,'Describe the work first.');
    const t:Task={id:uuid(),text,teamId:assignee.teamId,type:classify(text,assignee.teamId),assignerId:assigner.id,assigneeId:assignee.id,createdAt:s.now,
      status:'draft',lowOnContext:false,predictionsOn:true,sentBackCount:0,urgent:input.urgent===true};
    s.tasks.push(t);
    event(s,'created',t,assigner.id);
    return t;
  }
  if(resource==='tasks'){
    const t=s.tasks.find(t=>t.id===id);
    if(!t)throw new Error('Task not found.');
    if(action==='reassign')return reassignQueued(s,t,input);
    if(action==='modify')return modifyHandoff(s,t,input);
    if(action==='assignee'){
      if(t.sentAt||input.actorId!==t.assignerId)throw new Error('Only the assigner can change a draft recipient.');
      const recipient=person(s,input.assigneeId);
      if(!recipient.canReceive||recipient.id===t.assignerId||recipient.teamId!==t.teamId)throw new Error('Choose an eligible teammate on this team.');
      if(recipient.id===t.assigneeId)return t;
      t.assigneeId=recipient.id;
      for(const q of s.questions.filter(q=>q.taskId===t.id&&q.status!=='removed'&&q.status!=='skipped')){
        if(nomineeIdsFor(q).includes(recipient.id))nominate(s,t,q,nomineeIdsFor(q).filter(id=>id!==recipient.id));
        if(q.source==='predicted'&&(!q.suggestedNomineeId||q.suggestedNomineeId===recipient.id))q.suggestedNomineeId=fallbackNominee(s,t,q.text);
      }
      return t;
    }
    if(action==='predict'){
      if(t.sentAt)throw new Error('This handoff was already sent.');
      const additional=input.more===true;
      const type=asText(input.type) as TaskType;
      if(!additional&&Object.hasOwn(types,type))t.type=type;
      const existing=s.questions.filter(q=>q.taskId===t.id&&q.source==='predicted');
      if(!additional&&existing.length&&input.refresh!==true)return {type:t.type,team:t.teamId,questions:existing.filter(q=>!q.attached),libraryAnswers:existing.filter(q=>q.attached),suggestedNominees:existing.map(q=>q.suggestedNomineeId).filter(Boolean)};
      if(!additional)s.questions=s.questions.filter(q=>q.taskId!==t.id||q.source!=='predicted');
      if(!additional&&input.refresh===true){
        const discarded=new Set(existing.map(q=>q.id));
        s.events=s.events.filter(e=>e.event!=='predicted'||!discarded.has(String(e.meta?.questionId)));
      }
      const candidates=predict(s,t,input.phrases as Record<string,string>|undefined,additional);
      s.questions.push(...candidates);
      candidates.forEach(q=>event(s,'predicted',t,t.assignerId,{questionId:q.id}));
      return {type:t.type,team:t.teamId,questions:candidates.filter(q=>!q.attached),libraryAnswers:candidates.filter(q=>q.attached),suggestedNominees:candidates.map(q=>q.suggestedNomineeId).filter(Boolean)};
    }
    if(action==='team'){
      if(t.sentAt||!teams.some(team=>team.id===input.teamId))throw new Error('Choose a valid team for this draft.');
      t.teamId=String(input.teamId);
      return mutate(s,['tasks',t.id,'predict'],'POST',{type:t.type,refresh:true});
    }
    if(action==='send'){
      if(!t.sentAt&&Array.isArray(input.questionEdits)){
        for(const edit of input.questionEdits){
          const q=s.questions.find(q=>q.id===edit?.id&&q.taskId===t.id&&q.status!=='removed'&&q.status!=='skipped');
          if(q)saveContext(s,t,q,edit);
        }
      }
      return send(s,t,Number(input.seconds??0));
    }
    if(action==='start'){
      if(t.status==='new')updateWaiting(s,t);
      return t;
    }
    if(action==='questions'&&sub==='confirm'){
      if(t.sentAt)throw new Error('Review answers before sending.');
      const mode=input.mode;
      if(mode!=='clarifications'&&mode!=='library')throw new Error('Choose which answers to confirm.');
      if(!Array.isArray(input.ids))throw new Error('Select answers to confirm.');
      const selected=new Set(input.ids);
      const confirmed:string[]=[];
      const edits=input.edits&&typeof input.edits==='object'?input.edits as Record<string,Input>:{};
      for(const q of s.questions.filter(q=>q.taskId===t.id&&selected.has(q.id)&&q.status!=='removed'&&q.status!=='skipped')){
        if(mode==='library'){
          if(!q.attached||q.status!=='library'||!q.answer)continue;
          if(!q.libraryConfirmed){
            q.libraryConfirmed=true;
            trail(s,q,'Confirmed library answer',t.assignerId);
          }
        }else{
          if(q.attached||q.source==='asked'||q.verifiedSuggestion&&!edits[q.id])continue;
          const edit=edits[q.id];
          const text=typeof edit?.text==='string'?asText(edit.text):q.answer||q.suggestedAnswer||(q.source==='predicted'?suggestAnswer(t,q.text):'');
          if(!text)continue;
          saveContext(s,t,q,{text,nomineeIds:edit?.nomineeIds,nomineeId:edit?.nomineeId,verifySuggested:true,fromSuggestion:edit?.text!==undefined?edit.requiresVerification===true:!q.answer});
          q.verifiedSuggestion=true;
        }
        confirmed.push(q.id);
      }
      return {confirmed};
    }
    if(action==='questions'&&sub==='custom'){
      if(t.sentAt)throw new Error('This handoff was already sent.');
      if(Array.isArray(input.nomineeIds))nominationChoices(s,t,input.nomineeIds);
      const q=makeQuestion(s,t,required(input.text),'assigner_added');
      trail(s,q,'Added',t.assignerId);
      event(s,'custom',t,t.assignerId,{questionId:q.id});
      if(Array.isArray(input.nomineeIds))nominate(s,t,q,input.nomineeIds);
      if(asText(input.answer))saveContext(s,t,q,{text:input.answer});
      return q;
    }
    if(action==='questions'){
      if(!t.sentAt||t.sentAt>s.now||t.status==='accepted')throw new Error('This task is unavailable for questions.');
      const text=required(input.text,'Enter your question.');
      makeAvailableForWork(s,t);
      const q=makeQuestion(s,t,text,'asked');
      trail(s,q,'Asked',t.assigneeId);
      event(s,'asked',t,t.assigneeId,{questionId:q.id});
      route(s,t,q);
      updateWaiting(s,t);
      return q;
    }
    if(action==='request-acceptance'){
      if(input.actorId!==undefined&&input.actorId!==t.assigneeId)throw new Error('Only the assignee can submit this work for acceptance.');
      if(!t.sentAt||t.sentAt>s.now||!['queued','new','waiting','in_progress','sent_back'].includes(t.status))throw new Error('This task is unavailable for acceptance requests.');
      makeAvailableForWork(s,t);
      t.status='acceptance_requested';
      t.acceptanceRequestedAt=s.now;
      t.acceptanceNote=asText(input.note);
      event(s,'request-acceptance',t,t.assigneeId);
      notify(s,t.assignerId,`${person(s,t.assigneeId).name} requested acceptance.`,{taskId:t.id,page:'acceptance'});
      return t;
    }
    if(action==='accept'||action==='send-back'){
      if(t.status!=='acceptance_requested')throw new Error('The assignee needs to request acceptance first.');
      if(action==='accept'){t.status='accepted';t.acceptedAt=s.now;}
      else{
        t.sentBackReason=required(input.reason,'Enter a reason to send this back.');
        t.sentBackCount++;
        t.status='sent_back';
      }
      event(s,action,t,t.assignerId);
      notify(s,t.assigneeId,action==='accept'?`${person(s,t.assignerId).name} accepted your work. How smooth was the handoff?`:`Your task was sent back: ${t.sentBackReason}`,{taskId:t.id,page:'detail'});
      return t;
    }
  }
  if(resource==='questions'){
    const q=s.questions.find(q=>q.id===id);
    if(!q)throw new Error('Question not found.');
    const t=s.tasks.find(t=>t.id===q.taskId)!;
    if(action==='team-reply'){
      if(input.actorId!==t.assignerId||!t.sentAt||!q.overlapAt||!isOutstanding(q))throw new Error('This question is no longer awaiting your reply.');
      const answers=Array.isArray(input.answers)?input.answers.map(asText).filter(Boolean):[];
      const ids=Array.isArray(input.nomineeIds)?input.nomineeIds:nomineeIdsFor(q);
      const people=nominationChoices(s,t,ids);
      if(!answers.length&&!people.length)throw new Error('Add an answer or choose someone to help.');
      if(answers.length){
        answer(s,t,q,t.assignerId,answers[0]);
        q.additionalAnswers=answers.slice(1).map(text=>({id:uuid(),text}));
        q.verifiedSuggestion=input.approvedSuggestion===true;
        if(q.verifiedSuggestion)q.answerOrigin=answers[0]===suggestAnswer(t,q.text)?'system':'edited_system';
      }
      nominate(s,t,q,ids,true);
      if(!answers.length&&isOutstanding(q)&&q.overlapAt){
        q.status='routed';
        q.overlapAt=undefined;
        setPendingNominees(q,people.map(p=>p.id));
      }
      updateWaiting(s,t);
      return q;
    }
    if(action==='answer'){
      const actor=asText(input.actorId)||t.assignerId;
      answer(s,t,q,actor,required(input.text??input.answer));
      if(input.approvedSuggestion===true&&actor===t.assignerId){
        q.verifiedSuggestion=true;
        q.answerOrigin=q.answer===suggestAnswer(t,q.text)?'system':'edited_system';
      }
      return q;
    }
    if(action==='context')return saveContext(s,t,q,input);
    if(action==='nominate'){
      nominate(s,t,q,input.nomineeIds??input.nomineeId);
    }else if(action==='remove'){
      if(t.sentAt)throw new Error('This handoff was already sent.');
      if(method==='DELETE'){
        if(q.status!=='removed')return q;
        const prior=q.history.findLast(e=>e.event==='Removed');
        q.status=(prior?.note as Question['status'])??'pending';
        if(q.status==='skipped')q.status='pending';
        trail(s,q,'Restored',t.assignerId);
      }else if(q.status!=='removed'){
        const prior=q.status;
        q.status='removed';
        trail(s,q,'Removed',t.assignerId,prior);
        event(s,'remove',t,t.assignerId,{questionId:q.id});
      }
    }else if(action==='feedback'){
      if(!t.sentAt||!isResolved(q))throw new Error('Answer this question before giving feedback.');
      const mode=input.feedback??input.value;
      const entry=s.library.find(e=>e.id===q.libraryId);
      if(mode==='helped'){
        if(q.feedback==='helped')return q;
        q.feedback='helped';
        if(entry){entry.helped++;if(q.source==='asked'&&/definition|table|filter|traffic|control/i.test(q.text))entry.reusable=true;}
        trail(s,q,'Helped',t.assigneeId);
      }else if(mode==='didnt_help'){
        const note=required(input.note,'Describe what was missing.');
        if(entry){entry.misses++;if(q.feedback==='helped')entry.helped=Math.max(0,entry.helped-1);}
        q.feedback='didnt_help';
        q.missingNote=note;
        q.raised=true;
        if(q.answer)trail(s,q,'Earlier answer',q.answeredById,q.answer);
        trail(s,q,'Didn’t help',t.assigneeId,note);
        route(s,t,q,entry?.id);
        if(q.status==='library')q.feedback=undefined;
      }else throw new Error('Choose a feedback action.');
      event(s,String(mode),t,t.assigneeId,{questionId:q.id});
      updateWaiting(s,t);
    }else if(action==='cant-help'){
      const p=person(s,input.actorId??pendingNomineesFor(q)[0]);
      if(!t.sentAt||!nominationOpen(q,p.id))throw new Error('This question is unavailable.');
      setPendingNominees(q,pendingNomineesFor(q).filter(id=>id!==p.id));
      q.cantHelpById=p.id;
      if(isResolved(q)||nominationOpen(q)){
        trail(s,q,`${p.name} couldn’t help`,p.id,asText(input.note)||undefined);
        event(s,'cant-help',t,p.id,{questionId:q.id});
        return q;
      }
      q.raised=true;
      q.cantHelpById=p.id;
      trail(s,q,`${p.name} couldn’t answer`,p.id,asText(input.note)||undefined);
      overlap(s,t,q);
      event(s,'cant-help',t,p.id,{questionId:q.id});
      updateWaiting(s,t);
    }else throw new Error('Unknown question action.');
    return q;
  }
  throw new Error('Unknown API route.');
}
export function read(s:State,path:string[],params:URLSearchParams){
  const [resource,id,sub]=path;
  const personId=params.get('personId')??'shashank';
  const teamId=params.get('teamId')??'data';
  if(resource==='demo')return s;
  if(resource==='me'&&id==='tasks')return listTasks(s,personId,{includeScheduled:true}).map(t=>({...t,questions:s.questions.filter(q=>q.taskId===t.id&&q.status!=='removed'&&q.status!=='skipped'&&q.createdAt<=s.now)}));
  if(resource==='library')return librarySearch(s,teamId,params.get('q')??'');
  if(resource==='people'&&sub==='profile')return profile(s,person(s,id).id);
  if(resource==='overlap-agenda')return agenda(s,personId);
  if(resource==='metrics'){
    const from=params.get('from')??s.weeks[0].from;
    const to=params.get('to')??s.weeks[1].to;
    if(![from,to].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d)))||from>to||Date.parse(to)-Date.parse(from)>93*86400000)throw new Error('Choose a valid date range of up to 93 days.');
    return metrics(s,teamId,from,to);
  }
  throw new Error('Unknown API route.');
}
export function jump(s:State,hour:string){
  const today=dayKey(s.now,IST);
  const at=localAt(today,hour);
  return at>=s.now?at:localAt(shiftDay(today,1),hour);
}
export const resetDemoTime=DEMO;
