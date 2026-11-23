import {IST,pendingNomineesFor,type State} from './model';
import {dayKey,localAt,shiftDay,workHours} from './schedule';
function counts(items:string[]) {
  const map=new Map<string,number>();
  for(const item of items)map.set(item,(map.get(item)??0)+1);
  return [...map].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}
export function profile(s:State,id:string){
  const sentTasks=s.tasks.filter(t=>t.sentAt&&t.sentAt<=s.now);
  const sentIds=new Set(sentTasks.map(t=>t.id));
  const tasks=sentTasks.filter(t=>t.assigneeId===id);
  const submitted=tasks.filter(t=>t.acceptanceRequestedAt&&t.acceptanceRequestedAt<=s.now);
  const questions=s.questions.filter(q=>sentIds.has(q.taskId)&&q.createdAt<=s.now&&q.status!=='removed'&&q.status!=='skipped');
  const answered=questions.filter(q=>{
    const primary=q.answeredById===id&&q.answer&&q.answerSource!=='library'&&(!q.answeredAt||q.answeredAt<=s.now);
    const followUp=(q.nomineeResponses??(q.nomineeResponse?[q.nomineeResponse]:[])).some(reply=>reply.byId===id);
    return primary||followUp;
  });
  const managedTaskIds=new Set(sentTasks.filter(t=>t.assignerId===id).map(t=>t.id));
  const awaiting=questions.filter(q=>pendingNomineesFor(q).includes(id)||(q.overlapAt&&managedTaskIds.has(q.taskId)&&q.status!=='answered'&&q.status!=='library'));
  return {
    work:counts(tasks.map(t=>t.type)),
    asked:counts(questions.filter(q=>q.askedById===id&&q.source==='asked').map(q=>q.text)),
    answered:counts(answered.map(q=>q.text)),
    awaiting:counts(awaiting.map(q=>q.text)),
    sentBackRate:submitted.length?submitted.filter(t=>t.sentBackCount).length/submitted.length:0,
    submittedCount:submitted.length,
    taskCount:tasks.length,
  };
}
export function metrics(s:State,teamId:string,from:string,to:string) {
  const start=localAt(from,'00:00',IST),requestedEnd=localAt(shiftDay(to,1),'00:00',IST);
  const todayStart=localAt(dayKey(s.now),'00:00',IST);
  const end=requestedEnd<todayStart?requestedEnd:todayStart;
  const inRange=(at?:string)=>!!at&&at>=start&&at<end;
  const events=s.events.filter(e=>e.teamId===teamId&&inRange(e.at));
  const sentIds=new Set(events.filter(e=>e.event==='sent').map(e=>e.taskId));
  const tasks=s.tasks.filter(t=>sentIds.has(t.id));
  const acceptedIds=new Set(events.filter(e=>e.event==='accept').map(e=>e.taskId));
  const accepted=s.tasks.filter(t=>acceptedIds.has(t.id)&&t.sentAt&&t.acceptedAt);
  const durations=accepted.map(t=>({date:dayKey(t.acceptedAt!),hours:workHours(s.people.find(p=>p.id===t.assigneeId)!,t.sentAt!,t.acceptedAt!)}));
  const sum=durations.reduce((a,x)=>a+x.hours,0);
  const asked=events.filter(e=>e.event==='asked'&&sentIds.has(e.taskId));
  const askedIds=new Set(asked.map(e=>e.taskId));
  const predicted=s.events.filter(e=>e.event==='predicted'&&e.at<end&&sentIds.has(e.taskId));
  const prepared=new Set(s.events.filter(e=>e.event==='prepared'&&e.at<end&&sentIds.has(e.taskId)).map(e=>e.meta?.questionId));
  const ratings=s.ratings.filter(r=>acceptedIds.has(r.taskId));
  const people=s.people.filter(p=>p.teamId===teamId);
  const billable=people.filter(p=>p.canReceive&&!p.canAssign).reduce((a,p)=>a+workHours(p,start,end,true),0);
  const managerHours=people.filter(p=>p.canAssign).reduce((a,p)=>a+workHours(p,start,end,true),0);
  const seconds=events.filter(e=>e.event==='sent').reduce((a,e)=>a+Number(e.meta?.assignerSeconds??0),0);
  const submitted=new Set(events.filter(e=>e.event==='request-acceptance').map(e=>e.taskId));
  const sentBack=new Set(events.filter(e=>e.event==='send-back').map(e=>e.taskId));
  const feedback=events.filter(e=>e.event==='helped'||e.event==='didnt_help');
  const helped=feedback.filter(e=>e.event==='helped').length;
  const daily:{date:string;hours:number|null}[]=[];
  for(let date=from;date<=to&&daily.length<93;date=shiftDay(date,1)){
    if(date>=dayKey(end))break;
    const rows=durations.filter(d=>d.date===date);
    daily.push({date,hours:rows.length?rows.reduce((a,d)=>a+d.hours,0)/rows.length:null});
  }
  return {north:accepted.length?sum/accepted.length:null, clarification:tasks.length?1-askedIds.size/tasks.length:null, additional:tasks.length?asked.length/tasks.length:null,
    preanswer:predicted.length?predicted.filter(e=>prepared.has(e.meta?.questionId)).length/predicted.length:null,
    satisfaction:ratings.length?ratings.filter(r=>r.score>=4).length/ratings.length:null,
    completed:accepted.length, throughput:billable?accepted.length/billable:null, rework:submitted.size?sentBack.size/submitted.size:null,
    out:events.filter(e=>e.event==='notification'&&e.meta?.outOfHours).length, manager:seconds/60, managerShare:managerHours?seconds/3600/managerHours:null,
    helpful:feedback.length?helped/feedback.length:null, helped, didntHelp:feedback.length-helped,
    removed:events.filter(e=>e.event==='remove').length, custom:events.filter(e=>e.event==='custom').length,
    predictions:tasks.length?tasks.every(t=>t.predictionsOn)?'On':tasks.every(t=>!t.predictionsOn)?'Off':'Mixed':s.predictions?'On':'Off',daily,assigned:tasks.length,
  };
}

export function contiguousDays<T extends {date:string;hours:number|null}>(days:T[]){
  const runs:T[][]=[];
  let current:T[]=[];
  for(const point of days){
    if(point.hours===null){current=[];continue;}
    const previous=current.at(-1);
    if(!previous||shiftDay(previous.date,1)!==point.date){
      current=[];
      runs.push(current);
    }
    current.push(point);
  }
  return runs;
}
