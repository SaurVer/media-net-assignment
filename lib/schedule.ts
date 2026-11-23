import {formatInTimeZone, fromZonedTime} from 'date-fns-tz';
import {DAY,HOUR,IST,dateAt,type Person,type State,type Notification} from './model';
export {formatInTimeZone as zone};
export const shortTime=(at:string|Date, tz=IST)=>formatInTimeZone(at,tz,'HH:mm');
export const dayKey=(at:string|Date,tz=IST)=>formatInTimeZone(at,tz,'yyyy-MM-dd');
export const shiftDay=(day:string,n:number)=>dateAt(Date.parse(day+'T12:00:00Z')+n*DAY).slice(0,10);
export const localAt=(day:string,time:string,tz=IST)=>fromZonedTime(day+'T'+time+':00',tz).toISOString();
export function windowFor(p:Person,day:string) {
  return {start:localAt(day,p.workStart,p.timeZone),end:localAt(shiftDay(day,Number(p.workEnd<=p.workStart)),p.workEnd,p.timeZone)};
}
export function onShift(p:Person,at:string) {
  const day=dayKey(at,p.timeZone);
  return [shiftDay(day,-1),day].some(d=>{const w=windowFor(p,d);return w.start<=at && at<w.end;});
}
export function nextStart(p:Person,at:string) {
  const day=dayKey(at,p.timeZone);
  const start=windowFor(p,day).start;
  return start>=at?start:windowFor(p,shiftDay(day,1)).start;
}
export function workHours(p:Person,from:string,to:string,weekdays=false) {
  if(from>=to)return 0;
  let total=0;
  let day=shiftDay(dayKey(from,p.timeZone),-1);
  const last=dayKey(to,p.timeZone);
  while(day<=last){
    const weekday=new Date(day+'T12:00Z').getUTCDay();
    if(!weekdays || (weekday!==0&&weekday!==6)){
      const {start,end}=windowFor(p,day);
      total+=Math.max(0, Math.min(Date.parse(to),Date.parse(end))-Math.max(Date.parse(from),Date.parse(start)));
    }
    day=shiftDay(day,1);
  }
  return total/HOUR;
}
export function notify(s:State,toId:string,text:string,options:Partial<Notification>={}) {
  const p=s.people.find(p=>p.id===toId);
  if(!p)return;
  const {id=crypto.randomUUID(),at=s.now,urgent=false,taskId,page}=options;
  if(s.notifications.some(n=>n.id===id))return;
  const online=onShift(p,at);
  const n={id,toId,text,at:online||urgent?at:nextStart(p,at),urgent,outOfHours:!online&&urgent,read:false,taskId,page};
  s.notifications.push(n);
  s.events.push({id,event:'notification',at:n.at,personId:toId,teamId:p.teamId,taskId,meta:{outOfHours:n.outOfHours}});
}
export function advance(s:State,to:string) {
  const old=s.now;
  s.now=to;
  if(to<old)return;
  for(const t of s.tasks.filter(t=>t.status==='queued'&&t.deliveredAt&&t.deliveredAt<=to)){
    t.status='new';
    s.events.push({id:crypto.randomUUID(),event:'delivered',at:t.deliveredAt!,taskId:t.id,teamId:t.teamId,personId:t.assigneeId});
  }
  for(const p of s.people.filter(p=>p.canAssign)){
    let day=shiftDay(dayKey(old,p.timeZone),-1);
    const last=dayKey(to,p.timeZone);
    while(day<=last){
      const {start,end}=windowFor(p,day);
      const reminder=dateAt(Date.parse(end)-HOUR);
      if(reminder>=old&&reminder<=to){
        const count=s.tasks.filter(t=>t.assignerId===p.id&&((t.status==='draft'&&s.questions.some(q=>q.taskId===t.id&&q.status==='pending'))||((t.status==='queued'||t.status==='new')&&t.lowOnContext&&!onShift(p,t.deliveredAt??reminder)))).length;
        if(count)notify(s,p.id,`${count} handoff${count===1?'':'s'} still need context before you log off.`,{id:'reminder-'+p.id+day,at:reminder,page:'sent'});
      }
      if(start>old&&start<=to){
        const taskIds=new Set(s.tasks.filter(t=>t.assignerId===p.id).map(t=>t.id));
        const questions=s.questions.filter(q=>taskIds.has(q.taskId)&&q.overlapAt&&q.overlapAt<=start&&q.createdAt<=start).length;
        const approvals=s.tasks.filter(t=>t.assignerId===p.id&&t.acceptanceRequestedAt&&t.acceptanceRequestedAt<=start&&t.status==='acceptance_requested').length;
        if(questions||approvals)notify(s,p.id,`Your work period has started. ${questions} questions await your reply and ${approvals} tasks await acceptance.`,{id:'overlap-'+p.id+day,at:start,page:'agenda'});
      }
      day=shiftDay(day,1);
    }
  }
}
