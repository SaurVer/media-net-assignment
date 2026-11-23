export const types = {
  metric_deep_dive: 'Metric deep-dive', dashboard_change: 'Dashboard change',
  data_pull: 'Data pull', experiment_readout: 'Experiment readout', campaign_brief: 'Campaign brief',
} as const;
export type TaskType = keyof typeof types;
export const roleLevels={skip:'Skip-level managers',manager:'Managers',lead:'Team leads',staff:'Team members',contractor:'Contractors'} as const;
export function roleLevel(person:Person):keyof typeof roleLevels {
  if(person.title.toLowerCase().startsWith('skip-level'))return 'skip';
  if(person.canAssign)return person.canReceive?'lead':'manager';
  return /contract/i.test(person.title)?'contractor':'staff';
}
export type TaskStatus = 'draft' | 'queued' | 'new' | 'in_progress' | 'waiting' | 'acceptance_requested' | 'sent_back' | 'accepted';
export type QuestionStatus = 'pending' | 'answered' | 'nominated' | 'skipped' | 'removed' | 'library' | 'routed' | 'logged_overlap' | 'raised';
export const taskLabels: Record<TaskStatus,string> = {
  draft:'Draft', queued:'Notification scheduled', new:'New', in_progress:'In progress', waiting:'Waiting for answer',
  acceptance_requested:'Acceptance requested', sent_back:'Sent back', accepted:'Accepted',
};
export const teams = [{id:'data',name:'Data team'},{id:'growth',name:'Growth Marketing'}];
export const IST = 'Asia/Kolkata';
export const TORONTO = 'America/Toronto';
export const SF = 'America/Los_Angeles';
export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const DEMO = '2026-11-23T19:30:00.000Z';
export const demoTask = "Pull last week's search CTR drop by platform for the leadership review.";
export interface Person {
  id:string; name:string; teamId:string; title:string; canAssign:boolean; canReceive:boolean; timeZone:string;
  workStart:string; workEnd:string;
}
export interface Task {
  id:string; teamId:string; text:string; type:TaskType; assignerId:string; assigneeId:string; priorityNote?:string;
  status:TaskStatus; lowOnContext:boolean; predictionsOn:boolean; createdAt:string; sentAt?:string; deliveredAt?:string;
  acceptanceRequestedAt?:string; acceptanceNote?:string; acceptedAt?:string; sentBackCount:number;
  sentBackReason?:string; assignerSeconds?:number; urgent?:boolean; modifiedAt?:string;
}
export interface Trail {at:string; event:string; byId?:string; note?:string;}
export interface AdditionalAnswer {id:string; text:string}
export interface Question {
  id:string; taskId:string; text:string; source:'predicted'|'asked'|'assigner_added'; status:QuestionStatus;
  feedback?:'helped'|'didnt_help'; missingNote?:string; cantHelpById?:string; history:Trail[]; reason?:string;
  askedById?:string; nomineeId?:string; nomineeIds?:string[]; pendingNomineeIds?:string[]; suggestedNomineeId?:string; answer?:string; answeredById?:string;
  suggestedAnswer?:string; verifiedSuggestion?:boolean; retrospective?:boolean;
  answerOrigin?:'manual'|'system'|'edited_system';
  additionalAnswers?:AdditionalAnswer[];
  answerSource?:'assigner'|'library'|'nominee'; createdAt:string; answeredAt?:string; libraryId?:string;
  nominationPending?:boolean; nomineeResponse?:{text:string; byId:string}; nomineeResponses?:{text:string; byId:string}[];
  attached?:boolean; libraryConfirmed?:boolean; predictionKey?:string; raised?:boolean; overlapAt?:string;
}
export const nomineeIdsFor=(q:Question)=>q.nomineeIds??(q.nomineeId?[q.nomineeId]:[]);
export const pendingNomineesFor=(q:Question)=>
  ['removed','skipped'].includes(q.status)?[]:
  q.pendingNomineeIds??(['nominated','routed'].includes(q.status)||q.nominationPending?nomineeIdsFor(q):[]);
export interface LibraryEntry {
  id:string; teamId:string; question:string; answer:string; taskType:TaskType; answeredById:string;
  keywords:string[]; reuseCount:number; helped:number; misses:number; reusable:boolean; createdFor?:string;
}
export interface Rating {taskId:string; raterId:string; score:number;}
export interface AppEvent extends Trail {id:string; taskId?:string; teamId?:string; personId?:string; meta?:Record<string,unknown>;}
export interface Notification {id:string; toId:string; text:string; at:string; taskId?:string; page?:string; urgent?:boolean; outOfHours:boolean; read:boolean;}
export interface State {
  predictionHistoryVersion?:number; now:string; predictions:boolean; slack:boolean; people:Person[]; tasks:Task[]; questions:Question[];
  library:LibraryEntry[]; ratings:Rating[]; events:AppEvent[]; notifications:Notification[]; weeks:{from:string;to:string}[];
}
export const uuid=()=>globalThis.crypto.randomUUID();
export const dateAt=(ms:number)=>new Date(ms).toISOString();
