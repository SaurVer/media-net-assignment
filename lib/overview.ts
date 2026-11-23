import {nomineeIdsFor,type Question,type State,type Task} from './model';
import {dayKey,localAt,shiftDay} from './schedule';

export type HistoryPeriod='last7'|'today'|'previous7'|'custom';
export interface HistoryRange {from:string;to:string;start:string;end:string}
export function historyRange(now:string,period:HistoryPeriod,weekEnding?:string):HistoryRange{
  const today=dayKey(now);
  const to=period==='previous7'?shiftDay(today,-7):period==='custom'&&weekEnding&&weekEnding<=today?weekEnding:today;
  const from=period==='today'?to:shiftDay(to,-6);
  return {from,to,start:localAt(from,'00:00'),end:localAt(shiftDay(to,1),'00:00')};
}
export function withinHistory(at:string|undefined,range:HistoryRange,now:string){
  return !!at&&at>=range.start&&at<range.end&&at<=now;
}
export function taskHistory(s:State,rows:Task[],range:HistoryRange){
  return rows.filter(t=>withinHistory(t.status==='draft'?t.createdAt:t.sentAt,range,s.now));
}
export function questionActivity(questions:Question[],asOf?:string){
  const nominees=new Set<string>();
  let predicted=0,predictedAnswered=0,followups=0,nominations=0,retrospective=0,custom=0;
  for(const q of questions){
    if(q.source==='predicted'){
      predicted++;
      if(q.retrospective)retrospective++;
      if(q.answer&&(q.status==='answered'||q.status==='library')&&(!asOf||!q.answeredAt||q.answeredAt<=asOf))predictedAnswered++;
    }
    if(q.source==='asked'||q.raised)followups++;
    if(q.status==='removed'||q.status==='skipped')continue;
    if(q.source==='assigner_added')custom++;
    for(const id of nomineeIdsFor(q)){nominees.add(id);nominations++;}
  }
  return {predicted,predictedAnswered,followups,nominees,nominations,retrospective,custom};
}
