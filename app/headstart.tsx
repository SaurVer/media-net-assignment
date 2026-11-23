'use client';

import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Activity,ArrowLeft,ArrowRight,Bell,BookOpen,Check,CheckCircle2,ChevronDown,ChevronRight,Clock3,Code2,Command,CornerDownRight,House,FileCheck2,FileText,Inbox,Layers3,Mic,Plus,RotateCcw,Send,Settings2,Sparkles,Users,MessageSquare,CalendarClock,CircleHelp,X,type LucideIcon} from 'lucide-react';
import {ensurePredictionHistory,seed} from '../data/seed';
import {agenda,isOutstanding,isResolved,nominationOpen,librarySearch,listTasks} from '../lib/engine';
import {endpoints} from '../lib/api-list';
import {historyRange,questionActivity,taskHistory,withinHistory,type HistoryPeriod,type HistoryRange} from '../lib/overview';
import {contiguousDays,metrics,profile} from '../lib/metrics';
import {fallbackNominee,suggestAnswer} from '../lib/predict';
import {IST,SF,TORONTO,demoTask,taskLabels,teams,types,roleLevel,roleLevels,nomineeIdsFor,pendingNomineesFor,type Person,type Question,type State,type Task,type TaskType} from '../lib/model';
import {advance,dayKey,localAt,nextStart,onShift,shiftDay,shortTime,zone} from '../lib/schedule';
import {Mark} from './mark';

type Page='home'|'outbox'|'review'|'sent'|'agenda'|'acceptance'|'tasks'|'questions'|'people'|'library'|'metrics'|'settings'|'api'|'detail';
type ComposeDraft={text:string;assigneeId:string;urgent:boolean;createdAt?:string};
type ContextDraft={text?:string;nomineeId?:string;nomineeIds?:string[];requiresVerification?:boolean;verifySuggested?:boolean};
type AdditionalAnswerDraft={id:string;text:string};
type DraftNotes={answers:Record<string,ContextDraft>;extraAnswers?:Record<string,AdditionalAnswerDraft>;custom?:string;customAnswer?:string;customNominees?:string[]};
const emptyDraftNotes:DraftNotes={answers:{}};
type Act=(path:string,body?:Record<string,unknown>,method?:string)=>Promise<Record<string,unknown>|undefined>;
const labels:Partial<Record<Page,string>>={home:'Home',outbox:'Open items',review:'Task draft',sent:'Sent tasks',agenda:'Pending team questions',acceptance:'Awaiting acceptance',tasks:'My tasks',questions:'Questions for me',people:'People & profiles',library:'Answer library',metrics:'Metrics',settings:'Settings',api:'API reference',detail:'Task details'};
const navigation:Record<'manager'|'analyst'|'workspace', [Page,LucideIcon][]> = {
  manager:[['outbox',Inbox],['sent',Layers3],['agenda',CalendarClock],['acceptance',FileCheck2]],
  analyst:[['tasks',Inbox],['questions',MessageSquare]],
  workspace:[['people',Users],['library',BookOpen],['metrics',Activity],['settings',Settings2]],
};
const stateKey='headstart-demo-v1';
const dateLabel=(at:string)=>zone(at,IST,'EEE, d MMM');
const liveZones=[['India','IST',IST],['Toronto','ET',TORONTO],['San Francisco','PT',SF]];
function snapshotAt(state:State,now=new Date().toISOString()){
  const next=structuredClone(state);
  ensurePredictionHistory(next);
  // Resume the current shift after a long absence. Queued tasks still settle at their original delivery time.
  if(Date.parse(now)-Date.parse(next.now)>86400000)next.now=new Date(Date.parse(now)-86400000).toISOString();
  advance(next,now);
  return next;
}
function LiveClock({open,onToggle}:{open:boolean;onToggle:()=>void}){
  const [time,setTime]=useState('');
  useEffect(()=>{
    const tick=()=>setTime(new Date().toISOString());
    tick();
    const timer=window.setInterval(tick,1000);
    document.addEventListener('visibilitychange',tick);
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
  },[]);
  return <div className="top-clock-wrap">
    <button type="button" className="time-toggle" aria-expanded={open} onClick={onToggle}><Clock3 size={15}/><span>{time?zone(time,IST,'HH:mm:ss'):'--:--:--'} IST</span><span className="clock-divider"/><span className="muted time-label">Live</span><ChevronDown size={13}/></button>
    {open&&time&&<div className="popover clock-pop"><div className="popover-head"><strong>Live time</strong><span>{dateLabel(time)}</span></div>{liveZones.map(([city,abbr,tz])=><div className="clock-zone" key={city}><span>{city}</span><strong>{zone(time,tz,'HH:mm:ss')} <small>{abbr}</small></strong></div>)}</div>}
  </div>;
}
const dateTime=(at:string)=>zone(at,IST,"d MMM · HH:mm 'IST'");
const portraitSlots:Record<string,number>={shashank:1,gaurav:0,saurabh:6,devarshi:3,saksham:4,himanshu:5,dilip:7,karan:8,shubham:9,mandeep:10,amit:11,neha:12,rohan:15,isha:13};
function Avatar({p,online,small=false}:{p:Person;online?:boolean;small?:boolean}){
  const slot=portraitSlots[p.id];
  return <span className={`avatar ${small?'sm':''}`} aria-hidden="true">
    {slot===undefined?p.name.slice(0,2).toUpperCase():<span className="avatar-photo" style={{backgroundPosition:`${slot%4/3*100}% ${Math.floor(slot/4)/3*100}%`}}/>}
    {online!==undefined&&<i className={online?'active':''}/>}
  </span>;
}
function roleLabel(p:Person){return roleLevel(p)==='lead'?`Team lead · ${p.title}`:p.title;}
function Button({children,onClick,kind='default',disabled=false,type='button',className=''}:{children:ReactNode;onClick?:()=>void;kind?:string;disabled?:boolean;type?:'button'|'submit';className?:string}){
  return <button type={type} onClick={onClick} disabled={disabled} className={`button ${kind} ${className}`}>{children}</button>;
}
function Chip({children,tone=''}:{children:ReactNode;tone?:string}){return <span className={`chip ${tone}`}>{children}</span>;}
function PersonTag({p,now,compact=false}:{p:Person;now:string;compact?:boolean}){
  const online=onShift(p,now);
  return <span className="person-tag"><Avatar p={p} online={online}/><span><strong>{p.name}</strong>{!compact&&<small>{online?'Online':'Offline'} · {shortTime(now,p.timeZone)} local</small>}</span></span>;
}
function Title({title,description,kicker,children}:{title:string;description?:string;kicker?:string;children?:ReactNode}){
  return <div className="page-title"><div>{kicker&&<div className="eyebrow page-eyebrow">{kicker}</div>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{children}</div>;
}
function Empty({children,icon:Icon=Inbox}:{children:ReactNode;icon?:LucideIcon}){
  return <div className="empty"><span className="icon-square"><Icon size={18}/></span><p>{children}</p></div>;
}
function PillStatus({t}:{t:Task}){
  const tone=t.status==='accepted'?'green':['queued','waiting','acceptance_requested'].includes(t.status)?'amber':t.status==='sent_back'?'orange':t.status==='new'?'blue':'';
  return <Chip tone={tone}>{t.status==='acceptance_requested'?<span className="acceptance-status-dots" aria-hidden="true"><i/><i/><i/></span>:<i/>}{taskLabels[t.status]}</Chip>;
}
function getPersona(s:State,id:string){return s.people.find(p=>p.id===id)??s.people[0];}
type SpeechSession={lang:string;interimResults:boolean;continuous:boolean;start:()=>void;stop:()=>void;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null};
function Dictate({onText,context='answer',demoMode=false}:{onText:(text:string)=>void;context?:string;demoMode?:boolean}){
  const [phase,setPhase]=useState<'ready'|'listening'|'working'>('ready');
  const [demo,setDemo]=useState(false);
  const session=useRef<SpeechSession|null>(null);
  const sequence=useRef(0);
  const active=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>{active.current=false;sequence.current++;clearTimeout(timer.current);session.current?.stop();},[]);
  async function finish(transcript='',run=sequence.current){
    if(run!==sequence.current||!active.current)return;
    active.current=false;
    clearTimeout(timer.current);
    setPhase('working');
    try{
      const res=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript,context})});
      const result=await res.json();
      if(run===sequence.current&&typeof result.text==='string'){onText(result.text);setDemo(result.mode==='demo');}
    }finally{if(run===sequence.current)setPhase('ready');}
  }
  function begin(){
    if(phase==='working')return;
    if(phase==='listening'){session.current?.stop();void finish();return;}
    const run=++sequence.current;
    setDemo(false);
    active.current=true;
    setPhase('listening');
    const browser=window as unknown as {SpeechRecognition?:new()=>SpeechSession;webkitSpeechRecognition?:new()=>SpeechSession};
    const Speech=browser.SpeechRecognition??browser.webkitSpeechRecognition;
    if(!Speech||demoMode){timer.current=setTimeout(()=>void finish('',run),600);return;}
    try{
      const recognizer=new Speech();
      session.current=recognizer;
      recognizer.lang='en-IN';
      recognizer.interimResults=false;
      recognizer.continuous=false;
      recognizer.onresult=e=>void finish(e.results[0]?.[0]?.transcript??'',run);
      recognizer.onerror=()=>void finish('',run);
      recognizer.onend=()=>{if(active.current)void finish('',run);};
      timer.current=setTimeout(()=>{recognizer.stop();void finish('',run);},4500);
      recognizer.start();
    }catch{timer.current=setTimeout(()=>void finish('',run),600);}
  }
  return <span className="dictation"><button type="button" className={`button mic ${phase==='listening'?'listening':''}`} onClick={begin} title="Dictate with your microphone" aria-label={phase==='ready'?'Record audio':phase==='listening'?'Finish dictation':'Transcribing'}><Mic size={15}/>{phase==='ready'?'Record audio':phase==='listening'?'Listening…':'Transcribing…'}</button>{demo&&<small>Demo transcript</small>}</span>;
}
function AnswerForm({onSave,context='answer',label='Save answer',demoMode=false,initial='',placeholder='Write your answer…'}:{onSave:(text:string)=>Promise<unknown>;context?:string;label?:string;demoMode?:boolean;initial?:string;placeholder?:string}){
  const [value,setValue]=useState(initial);
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();
    if(!value.trim()||busy)return;
    setBusy(true);
    try{if(await onSave(value.trim()))setValue('');}finally{setBusy(false);}
  }
  return <form className="answer-form" onSubmit={submit}><div className="editor context-editor"><textarea aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>setValue(e.target.value)} rows={3}/><div className="editor-tools"><Dictate onText={setValue} context={context} demoMode={demoMode}/></div></div><div className="row end"><Button kind="primary" type="submit" disabled={!value.trim()||busy}>{label}</Button></div></form>;
}
function ConfirmRating({s,t,me,act}:{s:State;t:Task;me:Person;act:Act}){
  const selected=s.ratings.find(r=>r.taskId===t.id&&r.raterId===me.id)?.score;
  return <div className="rating-panel"><div><strong>How smooth was this handoff?</strong><small>{selected?'Rating recorded':'Choose a score from 1 to 5'}</small></div><div className="row">{[1,2,3,4,5].map(n=><Button key={n} kind={selected===n?'primary':'default'} onClick={()=>void act('ratings',{taskId:t.id,raterId:me.id,score:n})}>{n}</Button>)}</div></div>;
}
function qState(q:Question,s:State){
  if(q.status==='answered')return {label:'Answered',tone:'green'};
  if(q.status==='library')return {label:'Library',tone:'green'};
  if(q.status==='nominated'||q.status==='routed'){
    const names=pendingNomineesFor(q).map(id=>getPersona(s,id).name).join(', ');
    return {label:`${q.status==='nominated'?'Nominated':'Sent to'} ${names}`,tone:q.status==='nominated'?'human':'blue'};
  }
  if(q.status==='raised'||q.raised)return {label:'Raised question',tone:'orange'};
  if(q.status==='logged_overlap')return {label:'Awaiting manager reply',tone:'amber'};
  if(q.status==='skipped')return {label:'Unanswered',tone:'amber'};
  if(q.status==='removed')return {label:'Removed',tone:''};
  return {label:'Needs context',tone:'amber'};
}
function AnswerSource({s,t,q}:{s:State;t:Task;q:Question}){
  const name=s.people.find(p=>p.id===q.answeredById)?.name;
  if(q.answerSource==='library'){
    return <div className="delivered-provenance"><Chip tone="plum">From Answer Library</Chip>{name&&<small>Originally answered by {name}</small>}{q.libraryConfirmed&&<small>Confirmed by {getPersona(s,t.assignerId).name}</small>}</div>;
  }
  if(q.answerOrigin==='system'||q.answerOrigin==='edited_system'||!q.answerOrigin&&q.verifiedSuggestion&&q.answer===suggestAnswer(t,q.text)){
    return <div className="delivered-provenance"><Chip tone="plum">System-suggested answer</Chip>{name&&<small>{q.answerOrigin==='edited_system'?'Edited and accepted by':'Accepted by'} {name}</small>}</div>;
  }
  if(q.answerSource==='nominee'&&name)return <Chip tone="blue">Replied by {name}</Chip>;
  if(name)return <Chip tone="green">Answer added by {name}</Chip>;
  return <Chip tone="green">Answer shared</Chip>;
}
function Waiting({s,t,q}:{s:State;t:Task;q:Question}){
  const manager=getPersona(s,t.assignerId);
  const people=pendingNomineesFor(q).map(id=>getPersona(s,id));
  if(q.overlapAt){
    const today=dayKey(q.overlapAt)===dayKey(s.now);
    return <span className="wait-copy">Waiting for {manager.name} to reply.{q.overlapAt>s.now&&<> Their next work period starts {today?`today at ${shortTime(q.overlapAt)} IST`:`on ${dateTime(q.overlapAt)}`}.</>}</span>;
  }
  if(people.length&&['nominated','routed'].includes(q.status))return <div className="nominee-availability">{people.map(p=>{
    const next=nextStart(p,s.now);
    const time=dayKey(next)===dayKey(s.now)?`${shortTime(next)} IST`:dateTime(next);
    return <span className="wait-copy nominee-contact" key={p.id}>Ask {p.name} directly. <small>{onShift(p,s.now)?'Online now':`Next online ${time}`}</small></span>;
  })}</div>;
  return <span className="wait-copy">{q.source==='assigner_added'?'Added by the assigner. Ask a follow-up if you need context.':'Waiting for an answer.'}</span>;
}

export default function Headstart(){
  const [state,setState]=useState<State>(()=>seed());
  const live=useRef(state);
  const session=useRef('');
  const lock=useRef(false);
  const updates=useRef<BroadcastChannel|null>(null);
  const [ready,setReady]=useState(false);
  const [team,setTeam]=useState('data');
  const [viewer,setViewer]=useState('shashank');
  const [page,setPage]=useState<Page>('home');
  const [composerOpen,setComposerOpen]=useState(false);
  const [period,setPeriod]=useState<HistoryPeriod>('last7');
  const [weekEnding,setWeekEnding]=useState('');
  const [detail,setDetail]=useState('');
  const [detailOrigin,setDetailOrigin]=useState<Page>('home');
  const detailScroll=useRef(0);
  const [draftId,setDraftId]=useState('');
  const [started,setStarted]=useState(0);
  const [composers,setComposers]=useState<Record<string,ComposeDraft>>({});
  const [draftNotes,setDraftNotes]=useState<Record<string,DraftNotes>>({});
  const [predictionRun,setPredictionRun]=useState('');
  const [predicting,setPredicting]=useState('');
  const [flash,setFlash]=useState('');
  const [noticeOpen,setNoticeOpen]=useState(false);
  const [clockOpen,setClockOpen]=useState(false);
  const [voiceMode,setVoiceMode]=useState(false);
  const [busy,setBusy]=useState(false);
  const [globalError,setGlobalError]=useState('');
  const [confirmReset,setConfirmReset]=useState(false);

  useEffect(()=>{
    try{
      const saved=localStorage.getItem(stateKey);
      if(saved){
        const value=JSON.parse(saved) as {state:State;voiceMode?:boolean;composers?:Record<string,ComposeDraft>;draftNotes?:Record<string,DraftNotes>;period?:HistoryPeriod;weekEnding?:string};
        if(value.state?.weeks?.length){live.current=value.state;setVoiceMode(value.voiceMode??false);setComposers(value.composers??{});setDraftNotes(value.draftNotes??{});setPeriod(value.period??'last7');setWeekEnding(value.weekEnding??'');}
      }
      session.current=localStorage.getItem(stateKey+'-session')||crypto.randomUUID();
      localStorage.setItem(stateKey+'-session',session.current);
    }catch{session.current=crypto.randomUUID();}
    live.current=snapshotAt(live.current);
    setState(live.current);
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!ready||typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel(stateKey+'-updates');
    updates.current=channel;
    channel.onmessage=({data}:{data:{sessionId:string;state:State}})=>{
      if(data.sessionId!==session.current||lock.current||!data.state?.weeks?.length)return;
      live.current=snapshotAt(data.state);
      setState(live.current);
    };
    return ()=>{updates.current=null;channel.close();};
  },[ready]);
  useEffect(()=>{
    if(!ready)return;
    try{localStorage.setItem(stateKey,JSON.stringify({state,voiceMode,composers,draftNotes,period,weekEnding}));}catch{}
  },[state,ready,voiceMode,composers,draftNotes,period,weekEnding]);
  useEffect(()=>{
    if(!ready)return;
    const tick=()=>{
      if(lock.current)return;
      const now=new Date().toISOString();
      if(now.slice(0,16)===live.current.now.slice(0,16))return;
      live.current=snapshotAt(live.current,now);
      setState(live.current);
    };
    const timer=window.setInterval(tick,1000);
    document.addEventListener('visibilitychange',tick);
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
  },[ready]);
  useEffect(()=>{
    if(!flash)return;
    const timer=setTimeout(()=>setFlash(''),3800);
    return ()=>clearTimeout(timer);
  },[flash]);

  const me=getPersona(state,viewer);
  const now=state.now;
  const teammates=state.people.filter(p=>p.teamId===team);
  const teamName=teams.find(t=>t.id===team)?.name??'Data team';
  const notifications=state.notifications.filter(n=>n.toId===viewer&&n.at<=now).sort((a,b)=>b.at.localeCompare(a.at));
  const unread=notifications.filter(n=>!n.read).length;
  const selected=state.tasks.find(t=>t.id===detail);
  const draft=state.tasks.find(t=>t.id===draftId&&t.status==='draft');
  const range=historyRange(now,period,weekEnding);
  const openItems=taskHistory(state,state.tasks.filter(t=>t.assignerId===viewer&&t.status==='draft'),range).reverse();
  const outgoing=taskHistory(state,state.tasks.filter(t=>t.assignerId===viewer&&t.status!=='draft'),range).sort((a,b)=>(b.sentAt??'').localeCompare(a.sentAt??''));
  const incoming=taskHistory(state,listTasks(state,viewer,{includeScheduled:true}),range);
  const composer=composers[viewer];
  const filteredComposer=composer&&withinHistory(composer.createdAt??now,range,now)?composer:undefined;
  const historyControl=<HistoryControl period={period} onChange={setPeriod} weekEnding={weekEnding} onWeek={setWeekEnding} now={now} range={range}/>;
  const pending=state.tasks.filter(t=>t.assignerId===viewer&&t.status==='acceptance_requested');
  const myQuestions=state.questions.filter(q=>nominationOpen(q,viewer)&&state.tasks.some(t=>t.id===q.taskId&&t.sentAt&&t.sentAt<=now&&t.status!=='accepted')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const agendaRows=agenda(state,viewer);
  const activePage=page==='review'?'outbox':page==='detail'?detailOrigin:page;
  const nCount=(name:Page)=>name==='outbox'?openItems.length+Number(!!filteredComposer?.text.trim()):name==='agenda'?agendaRows.length:name==='acceptance'?pending.length:name==='questions'?myQuestions.length:0;

  async function act(path:string,body:Record<string,unknown>={},method='POST'){
    if(lock.current)return undefined;
    setGlobalError('');
    lock.current=true;
    try{
      const response=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json','x-headstart-session':session.current},body:JSON.stringify({...body,state:snapshotAt(live.current)})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'The action could not be completed.');
      live.current=snapshotAt(result.state as State);
      setState(live.current);
      updates.current?.postMessage({sessionId:session.current,state:live.current});
      return result.data as Record<string,unknown>;
    }catch(error){setGlobalError(error instanceof Error?error.message:'The action could not be completed.');return undefined;}
    finally{lock.current=false;}
  }
  function go(next:Page){setPage(next);setComposerOpen(false);setNoticeOpen(false);setClockOpen(false);setGlobalError('');window.scrollTo(0,0);}
  function viewAs(p:Person){
    if(!lock.current){live.current=snapshotAt(live.current);setState(live.current);}
    setTeam(p.teamId);setViewer(p.id);setDetail('');go('home');
  }
  function selectTeam(id:string){
    const p=state.people.find(p=>p.teamId===id&&p.canAssign);
    if(p)viewAs(p);
  }
  async function openTask(taskId:string){
    const t=live.current.tasks.find(t=>t.id===taskId);
    if(!t)return;
    detailScroll.current=window.scrollY;
    setDetailOrigin(page==='detail'?detailOrigin:page);
    setDetail(taskId);
    go('detail');
    if(t.assigneeId===viewer&&t.status==='new')await act('tasks/'+taskId+'/start');
  }
  async function begin(text:string,assigneeId:string,urgent:boolean){
    setBusy(true);
    const t=await act('tasks',{text,assigneeId,assignerId:viewer,urgent});
    if(!t){setBusy(false);return;}
    const id=String(t.id);
    setComposerOpen(false);
    setComposers(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>key!==viewer)));
    openDraft(id,true);
    setBusy(false);
    await runPrediction(id);
  }
  function openDraft(id:string,animate=false){
    setDraftId(id);
    setPredictionRun(animate?id:'');
    setStarted(Date.now());
    go('review');
  }
  async function runPrediction(id:string,settings:Record<string,unknown>={},endpoint='predict'){
    setPredictionRun(id);
    setPredicting(id);
    try{return await act('tasks/'+id+'/'+endpoint,settings);}
    finally{setPredicting('');}
  }
  async function sendDraft(t:Task){
    setBusy(true);
    const notes=draftNotes[t.id]??emptyDraftNotes;
    const questionEdits=Object.entries(notes.answers).map(([id,edit])=>({
      id,nomineeId:edit.nomineeId,nomineeIds:edit.nomineeIds,text:edit.requiresVerification?undefined:edit.text,
    }));
    const sent=await act('tasks/'+t.id+'/send',{seconds:Math.max(1,Math.round((Date.now()-started)/1000)),questionEdits});
    setBusy(false);
    if(sent){
      setDraftNotes(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>key!==t.id)));
      setDraftId('');detailScroll.current=0;setDetailOrigin('sent');setDetail(t.id);go('detail');setFlash(deliveryText(sent as unknown as Task,live.current));
    }
  }
  async function reset(){
    if(await act('demo/reset')){setTeam('data');setViewer('shashank');setDraftId('');setDetail('');setConfirmReset(false);setComposers({});setDraftNotes({});setPeriod('last7');setWeekEnding('');go('home');setFlash('Demo data restored.');}
  }
  const reading=busy&&composerOpen;
  const widePage=page==='home'||page==='detail'||page==='acceptance'||page==='agenda'||page==='people'||page==='library';
  const defaultAssignee=teammates.find(p=>p.id===(team==='data'?'devarshi':'rohan')&&p.id!==me.id)?.id??teammates.find(p=>p.canReceive&&p.id!==me.id)?.id??'';
  return <div className={`app ${page==='detail'?'detail-page':page==='home'?'home-page':''}`}>
    <header className="topbar">
      <button type="button" className="brand" onClick={()=>go('home')}><Mark/><span>Headstart</span></button>
      <div className="topbar-center">
        <label className="top-control team-control"><Layers3 size={15}/><select aria-label="Team filter" value={team} onChange={e=>selectTeam(e.target.value)}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><ChevronDown size={14}/></label>
        <span className="top-divider"/>
        <LiveClock open={clockOpen} onToggle={()=>{setClockOpen(!clockOpen);setNoticeOpen(false);}}/>
      </div>
      <div className="topbar-right">
        <div className="notifications-wrap"><button type="button" className="icon-button notification-button" aria-label={`Notifications, ${unread} unread`} aria-expanded={noticeOpen} onClick={()=>{setNoticeOpen(!noticeOpen);setClockOpen(false);}}><Bell size={19}/>{unread>0&&<i/>}</button>
          {noticeOpen&&<div className="popover notification-pop"><div className="popover-head"><strong>Notifications</strong><span>{unread} unread</span></div>{notifications.length?notifications.slice(0,18).map(n=><button type="button" key={n.id} className={`notification-row ${state.slack?'slack':''}`} onClick={async()=>{if(n.page==='detail'&&n.taskId)await openTask(n.taskId);else if(n.page)go(n.page as Page);await act('notifications/'+n.id);}}><span className="notification-dot">{!n.read&&<i/>}</span><span>{state.slack&&<SlackAttribution/>}{n.text}<small>{dateTime(n.at)}{n.outOfHours?' · Urgent':''}</small></span></button>):<Empty icon={Bell}>You’re all caught up.</Empty>}</div>}
        </div>
        <span className="top-divider"/>
        <label className="person-switch"><Avatar p={me} online={onShift(me,now)}/><span className="person-switch-text"><small>Viewing as</small><select aria-label="Viewing as" value={viewer} onChange={e=>viewAs(getPersona(state,e.target.value))}>{teammates.map(p=><option key={p.id} value={p.id}>{p.name} · {roleLabel(p)}</option>)}</select></span><ChevronDown size={13}/></label>
      </div>
    </header>
    <aside className="sidebar">
      <div className="workspace-label"><span className="workspace-icon"><Command size={17}/></span><span><strong>Dispatch desk</strong><small>{teamName}</small></span></div>
      <nav aria-label="Workspace navigation">
        <div className="nav-group home-navigation"><button type="button" className={`nav-link ${activePage==='home'?'current':''}`} onClick={()=>go('home')} aria-current={activePage==='home'?'page':undefined}><House size={17}/><span>Home</span></button></div>
        {(Object.entries(navigation) as [keyof typeof navigation,[Page,LucideIcon][]][]).filter(([name])=>name==='workspace'||(name==='manager'?me.canAssign:me.canReceive)).map(([section,items])=><div className="nav-group" key={section}><span className="eyebrow">{section==='manager'?'Handoff':section==='analyst'?'Your work':'Workspace'}</span>{items.map(([name,Icon])=><button type="button" key={name} className={`nav-link ${activePage===name?'current':''}`} onClick={()=>go(name)} aria-current={activePage===name?'page':undefined}><Icon size={17}/><span>{labels[name]}</span>{nCount(name)>0&&<small>{nCount(name)}</small>}</button>)}</div>)}
      </nav>
      <div className="sidebar-footer"><span className="footer-dot"/><div><strong>Demo workspace</strong><small>{voiceMode?'Demo dictation enabled':'Local demo data'}</small></div><button className="icon-button" title="Settings" aria-label="Open settings" onClick={()=>go('settings')}><Settings2 size={15}/></button></div>
    </aside>
    <main className="main"><div className={`main-inner ${widePage?'wide-workspace':''}`}>
      <div className="breadcrumbs"><span>{teamName}</span><ChevronRight size={13}/><strong>{labels[page]}</strong></div>
      {globalError&&!composerOpen&&<div className="banner orange" role="alert"><span>{globalError}</span><button aria-label="Dismiss error" onClick={()=>setGlobalError('')}><X size={15}/></button></div>}
      {(page==='home'||page==='detail'&&detailOrigin==='home')&&<div hidden={page!=='home'}><HomeSummary key={viewer} s={state} me={me} rows={me.canAssign?outgoing:incoming} drafts={openItems} composer={filteredComposer} open={openTask} onAssign={()=>{setGlobalError('');setComposerOpen(true);}} onOpenItems={()=>go('outbox')} historyControl={historyControl} period={period}/></div>}
      {composerOpen&&<Assign key={me.id} state={state} me={me} teammates={teammates} defaultAssignee={defaultAssignee} onBegin={begin} reading={reading} demoMode={voiceMode} composer={composer} onEdit={value=>setComposers(previous=>({...previous,[viewer]:{...value,createdAt:previous[viewer]?.text.trim()?previous[viewer].createdAt??now:now}}))} onClose={()=>{setComposerOpen(false);setGlobalError('');}} globalError={globalError}/>}
      {page==='outbox'&&<OpenItems s={state} tasks={openItems} composer={filteredComposer} historyControl={historyControl} onCompose={()=>setComposerOpen(true)} onResume={openDraft}/>}
      {page==='review'&&draft&&<Review key={draft.id} s={state} t={draft} act={act} onSend={()=>void sendDraft(draft)} goBack={()=>go('outbox')} started={started} busy={busy} demoMode={voiceMode} predicting={predicting===draft.id} animate={predictionRun===draft.id} onPredict={(settings,endpoint)=>runPrediction(draft.id,settings,endpoint)} notes={draftNotes[draft.id]??emptyDraftNotes} setNotes={update=>setDraftNotes(previous=>({...previous,[draft.id]:update(previous[draft.id]??emptyDraftNotes)}))}/>}
      {page==='review'&&!draft&&<><Title title="Task draft"/><Empty>This draft has already been sent.</Empty><Button onClick={()=>go('outbox')}>Open items</Button></>}
      {(page==='sent'||page==='detail'&&detailOrigin==='sent')&&<div hidden={page!=='sent'}><TaskList key={viewer+'sent'} title="Sent tasks" description="Track delivery, open questions, and work ready for acceptance." rows={outgoing} historyControl={historyControl} s={state} open={openTask} mode="sent"><Button kind="primary" onClick={()=>setComposerOpen(true)}><Plus size={16}/>Assign new task</Button></TaskList></div>}
      {(page==='tasks'||page==='detail'&&detailOrigin==='tasks')&&<div hidden={page!=='tasks'}><TaskList key={viewer+'tasks'} title="My tasks" description="See shared handoffs and open work you can send for acceptance." rows={incoming} historyControl={historyControl} s={state} open={openTask} mode="received"/></div>}
      {page==='detail'&&selected&&<TaskDetail key={selected.id+me.id} s={state} t={selected} me={me} act={act} backLabel={labels[detailOrigin]??'Home'} back={()=>{go(detailOrigin);requestAnimationFrame(()=>window.scrollTo(0,detailScroll.current));}}/>}
      {page==='questions'&&<QuestionInbox title="Questions for me" description="Questions teammates have sent you or nominated you to answer." rows={myQuestions} s={state} me={me} act={act} demoMode={voiceMode}/>}
      {page==='agenda'&&<QuestionInbox title="Pending team questions" description="Questions from your direct reports that still need an answer." rows={agendaRows} s={state} me={me} act={act} overlap demoMode={voiceMode}/>}
      {page==='acceptance'&&<Acceptance s={state} pending={pending} me={me} act={act} open={openTask}/>}
      {page==='people'&&<People s={state} team={team}/>}
      {page==='library'&&<Library s={state} team={team}/>}
      {page==='metrics'&&<Metrics s={state} team={team}/>}
      {page==='settings'&&<Settings s={state} team={team} act={act} demoMode={voiceMode} setDemoMode={setVoiceMode} onReset={()=>setConfirmReset(true)} showApi={()=>go('api')}/>}
      {page==='api'&&<ApiReference back={()=>go('settings')}/>}
    </div></main>
    {flash&&<div className="toast" role="status"><CheckCircle2 size={18}/>{flash}<button aria-label="Dismiss notification" onClick={()=>setFlash('')}><X size={15}/></button></div>}
    {confirmReset&&<div className="modal-screen"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">Reset demo data?</h2><p>Your new handoffs, answers, and settings will be cleared from this browser.</p><div className="row end"><Button onClick={()=>setConfirmReset(false)}>Cancel</Button><Button kind="primary" onClick={()=>void reset()}>Reset demo data</Button></div></section></div>}
  </div>;
}
function deliveryText(t:Task,s:State){
  const name=getPersona(s,t.assigneeId).name;
  return t.status==='queued'?`Shared with ${name}. Notification scheduled for ${shortTime(t.deliveredAt!)} IST, ${dateLabel(t.deliveredAt!)}.`:`Shared with ${name}.`;
}

function OpenItems({s,tasks,composer,onCompose,onResume,historyControl}:{s:State;tasks:Task[];composer?:ComposeDraft;onCompose:()=>void;onResume:(id:string)=>void;historyControl:ReactNode}){
  const hasComposer=!!composer?.text.trim();
  return <>
    <Title title="Open items" description="Handoffs still to be sent. Pick up where you left off." kicker="Outbox"><Button kind="primary" onClick={onCompose}><Plus size={16}/>Assign new task</Button></Title>
    <div className="history-toolbar">{historyControl}</div>
    <section className="open-stack">
      {hasComposer&&<button className="open-item" onClick={onCompose}><span className="icon-square"><FileText size={19}/></span><span><strong>{composer!.text}</strong><small>Task draft · {getPersona(s,composer!.assigneeId).name}{composer!.createdAt&&` · ${dateTime(composer!.createdAt)}`}</small></span><span className="resume-link">Resume <ArrowRight size={15}/></span></button>}
      {tasks.map(task=>{
        const qs=s.questions.filter(q=>q.taskId===task.id&&!q.attached&&q.status!=='removed');
        const reviewed=qs.filter(q=>q.status!=='pending').length;
        return <button className="open-item" key={task.id} onClick={()=>onResume(task.id)}><span className="icon-square"><Inbox size={19}/></span><span><strong>{task.text}</strong><small>{getPersona(s,task.assigneeId).name} · {qs.length?`${reviewed} of ${qs.length} questions reviewed`:'Draft ready to resume'} · {dateTime(task.createdAt)}</small></span><span className="resume-link">Resume <ArrowRight size={15}/></span></button>;
      })}
      {!hasComposer&&!tasks.length&&<Empty>No unsent handoffs in this period.</Empty>}
    </section>
  </>;
}
function HistoryControl({period,onChange,weekEnding,onWeek,now,range}:{period:HistoryPeriod;onChange:(period:HistoryPeriod)=>void;weekEnding:string;onWeek:(value:string)=>void;now:string;range:HistoryRange}){
  const date=(day:string)=>zone(localAt(day,'12:00'),IST,'d MMM');
  const label=range.from===range.to?date(range.to):`${date(range.from)} – ${date(range.to)}`;
  return <div className="history-control">
    <span className="history-dates">{label} <small>IST</small></span>
    <label className="select-field compact"><CalendarClock size={15}/><select aria-label="Task date range" value={period} onChange={e=>onChange(e.target.value as HistoryPeriod)}><option value="last7">Last 7 days</option><option value="today">Today</option><option value="previous7">Previous 7 days</option><option value="custom">Choose a week</option></select><ChevronDown size={14}/></label>
    {period==='custom'&&<label className="history-custom"><span>Week ending</span><input aria-label="Week ending" type="date" max={dayKey(now)} value={weekEnding||dayKey(now)} onChange={e=>onWeek(e.target.value)}/></label>}
  </div>;
}
function HomeOrientation(){
  return <div className="home-orientation">
    <section className="concept-note" aria-labelledby="concept-note-title">
      <h2 id="concept-note-title"><BookOpen size={17} aria-hidden="true"/>Concept note</h2>
      <p>Headstart helps teammates start work with fewer follow-ups. Given a task brief, it predicts what the assignee might ask and suggests answers or people to ask. The sender reviews what goes into the handoff.</p>
      <p><strong>Use case.</strong> Shashank hands Devarshi a search CTR analysis across time zones. Sharing the date range, device split, and expected output up front lets Devarshi start before their working hours overlap.</p>
    </section>
    <details className="demo-guide" open>
      <summary><span><FileText size={17} aria-hidden="true"/>Demo guide</span><ChevronDown size={17} aria-hidden="true"/></summary>
      <ol>
        <li><strong>Predict.</strong> In <b>Viewing as</b>, select Shashank. Click <b>Assign new task</b>, choose Devarshi, click <b>Use sample task</b>, then <b>Predict questions</b>.</li>
        <li><strong>Review and send.</strong> Check a suggested answer. Choose <b>Accept this answer</b>, edit it, or nominate a teammate who can clarify. Click <b>Send handoff</b>.</li>
        <li><strong>Try the analyst view.</strong> Switch to Devarshi, open the new handoff in <b>My tasks</b>, and read <b>Questions shared at handoff</b>. Try a follow-up or click <b>Send for acceptance</b>.</li>
        <li><strong>Close the loop.</strong> If you submitted the work, switch back to Shashank. Open it in <b>Awaiting acceptance</b> and choose <b>Accept</b> or <b>Send back</b>.</li>
      </ol>
    </details>
  </div>;
}

function HomeSummary({s,me,rows,drafts,composer,open,onAssign,onOpenItems,historyControl,period}:{s:State;me:Person;rows:Task[];drafts:Task[];composer?:ComposeDraft;open:(id:string)=>void;onAssign:()=>void;onOpenItems:()=>void;historyControl:ReactNode;period:HistoryPeriod}){
  const [recipient,setRecipient]=useState('');
  const [showAll,setShowAll]=useState(false);
  const groups=new Map<string,Task[]>();
  for(const task of rows){
    const id=me.canAssign?task.assigneeId:task.assignerId;
    const group=groups.get(id);
    if(group)group.push(task);
    else groups.set(id,[task]);
  }
  const selected=groups.has(recipient)?recipient:'';
  const activeRows=selected?groups.get(selected)!:rows;
  const taskIds=new Set(activeRows.map(t=>t.id));
  const questions=s.questions.filter(q=>taskIds.has(q.taskId)&&q.createdAt<=s.now);
  const aggregate=questionActivity(questions,s.now);
  const perTask=new Map<string,Question[]>();
  for(const q of questions){
    const group=perTask.get(q.taskId);
    if(group)group.push(q);
    else perTask.set(q.taskId,[q]);
  }
  const openCount=activeRows.filter(t=>t.status!=='accepted').length;
  const relatedDrafts=drafts.filter(t=>!selected||t.assigneeId===selected);
  const draftCount=relatedDrafts.length+Number(Boolean(composer?.text.trim()&&(!selected||composer.assigneeId===selected)));
  const userQuestions=aggregate.custom+questionActivity(s.questions.filter(q=>relatedDrafts.some(draft=>draft.id===q.taskId))).custom;
  const openForReview=activeRows.filter(t=>t.status==='acceptance_requested').length;
  const label=me.canAssign?'Assigned to':'Assigned by';
  const periodLabel=period==='last7'?'This week':period==='today'?'Today':period==='previous7'?'Previous week':'Selected week';
  return <div className="home-summary home-dashboard">
    <div className="prediction-overview-top dashboard-title">
      <div><h1>{me.canAssign?'Head start the anticipation engine':'Your tasks arrive with answers already in place'}</h1><p>{me.canAssign?'Add a task and see what your reportee may ask next. Send the clarifying answers with the work.':'Open a handoff to review the answers and see who can help with follow-up questions.'}</p></div>
      <div className="overview-actions">{historyControl}</div>
    </div>
    <HomeOrientation/>
    <div className="home-workspace">
      {me.canAssign&&<div className="prediction-launch">
        <div className="launch-copy">
          <div className="engine-ready"><span className="engine-signal"/><span>Ready to predict clarifying questions</span></div>
          <h2>Create a new task</h2>
          <p>Describe the work. Headstart predicts what your teammate may ask, drafts answers, and suggests people who can help.</p>
          <Button kind="primary" onClick={onAssign}><Plus size={24}/>Assign new task</Button>
        </div>
        <ol className="handoff-steps" aria-label="How Headstart works">
          <li><span><FileText size={17}/></span><div><strong>Add a task</strong><small>“Explain last week’s drop in search CTR.”</small></div></li>
          <li className="prediction-step"><span><Sparkles size={18}/></span><div><strong>Headstart predicts the next question</strong><small>“Which devices and dates should I compare?”</small></div></li>
          <li><span><CheckCircle2 size={17}/></span><div><strong>Approve and send</strong><small>Confirm an answer or nominate someone who can help.</small></div></li>
        </ol>
      </div>}
      <section className="panel task-overview"><div className="panel-head spread"><h2>{selected?`${label} ${getPersona(s,selected).name}`:'Recent handoffs'}</h2>{selected&&<button type="button" className="link-button" onClick={()=>{setRecipient('');setShowAll(false);}}>Show all people</button>}</div>
        {activeRows.length?<><div className="overview-table-head"><span>Task</span><span>{label}</span><span>Question activity</span><span>Status</span></div>{activeRows.slice(0,showAll?activeRows.length:7).map(task=>{
          const activity=questionActivity(perTask.get(task.id)??[],s.now);
          return <button type="button" className="overview-task" key={task.id} onClick={()=>open(task.id)}><span><strong>{task.text}</strong><small>{dateTime(task.sentAt!)}{task.status==='queued'&&task.deliveredAt?` · Notifies ${dateTime(task.deliveredAt)}`:''}</small></span><span className="overview-person"><PersonTag p={getPersona(s,me.canAssign?task.assigneeId:task.assignerId)} now={s.now} compact/></span><span className="overview-question-counts"><small>System predicted <b>{activity.predicted}</b> {activity.predicted===1?'question':'questions'}</small><small>Additional questions added <b>{activity.followups}</b></small><small>People nominated <b>{activity.nominees.size}</b></small>{activity.retrospective>0&&<small className="historical-activity">Predicted after sending</small>}</span><PillStatus t={task}/></button>;
        })}{activeRows.length>7&&<div className="overview-more"><button type="button" className="link-button" onClick={()=>setShowAll(!showAll)}>{showAll?'Show fewer':'Show more in this period'}<ChevronDown size={14}/></button></div>}</>:<Empty>No handoffs in this period.</Empty>}
      </section>
      <aside className="home-insights" aria-label="Handoff activity">
        <section className="home-insight-card system-insight">
          <h2>System performance <span>{periodLabel}</span></h2>
          <div className="prediction-overview-metrics">
            <div><strong>{aggregate.predicted}</strong><span>Questions predicted</span>{aggregate.retrospective>0&&<small>{aggregate.retrospective} generated for past tasks</small>}</div>
            <div><strong>{aggregate.predictedAnswered}</strong><span>Predicted questions answered</span></div>
            <div><strong>{aggregate.followups}</strong><span>Additional questions raised</span></div>
            <div><strong>{aggregate.nominees.size}</strong><span>{aggregate.nominees.size===1?'Person nominated':'People nominated'}</span><small>{aggregate.nominations} {aggregate.nominations===1?'nomination':'nominations'}</small></div>
          </div>
        </section>
        <section className="home-insight-card user-insight">
          <h2>Your activity <span>{periodLabel}</span></h2>
          <div className="overview-stats">
            <div><strong>{activeRows.length}</strong><small>{me.canAssign?'Assigned by you':'Assigned to you'}</small></div>
            {me.canAssign&&<div><strong>{userQuestions}</strong><small>New questions added by you</small></div>}
            <div><strong>{me.canAssign?openForReview:openCount}</strong><small>{me.canAssign?'Open tasks awaiting your review':'Open tasks'}</small>{me.canAssign&&<small className="open-task-total">{openCount} open in total</small>}</div>
            {me.canAssign?<button type="button" onClick={onOpenItems}><strong>{draftCount}</strong><small>Drafts to review <ArrowRight size={12}/></small></button>:<div><strong>{activeRows.length-openCount}</strong><small>Accepted</small></div>}
          </div>
        </section>
        {groups.size>0&&<section className="panel recipient-overview">
          <div className="panel-head"><Users size={16}/><h2>{me.canAssign?'By recipient':'By assigner'}</h2></div>
          {[...groups].map(([id,tasks])=><button key={id} type="button" aria-pressed={selected===id} data-tone={Array.from(id).reduce((sum,char)=>sum+char.charCodeAt(0),0)%4} className="recipient-filter" onClick={()=>{setRecipient(selected===id?'':id);setShowAll(false);}}><PersonTag p={getPersona(s,id)} now={s.now} compact/><span>{tasks.length}<span className="sr-only"> tasks</span></span></button>)}
        </section>}
      </aside>
    </div>
  </div>;
}

function Assign({state,me,teammates,defaultAssignee,onBegin,reading,demoMode,composer,onEdit,onClose,globalError}:{state:State;me:Person;teammates:Person[];defaultAssignee:string;onBegin:(text:string,id:string,urgent:boolean)=>void;reading:boolean;demoMode:boolean;composer?:ComposeDraft;onEdit:(value:ComposeDraft)=>void;onClose:()=>void;globalError:string}){
  const [useDemo,setUseDemo]=useState(demoMode);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current;if(node&&!node.open)node.showModal();return ()=>{if(node?.open)node.close();};},[]);
  const {assigneeId,text,urgent}=composer??{assigneeId:defaultAssignee,text:'',urgent:false};
  const recipient=teammates.find(p=>p.id===assigneeId)??teammates.find(p=>p.id===defaultAssignee)!;
  const set=(patch:Partial<ComposeDraft>)=>onEdit({assigneeId:recipient.id,text,urgent,...patch});
  const immediate=urgent||onShift(recipient,state.now);
  const delivery=immediate?state.now:nextStart(recipient,state.now);
  const example=me.teamId==='data'?demoTask:'Draft a campaign brief for re-engaging lapsed publishers ahead of Diwali.';
  return <dialog className="assignment-modal" ref={dialog} aria-labelledby="assign-dialog-title" onCancel={e=>{e.preventDefault();if(!reading)onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!reading){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}>
    <form onSubmit={e=>{e.preventDefault();if(text.trim()&&!reading)onBegin(text.trim(),recipient.id,urgent);}}>
      <div className="assignment-header"><div><h2 id="assign-dialog-title">Prepare a handoff</h2><p>Describe the task to predict what your teammate might ask.</p></div><button type="button" className="icon-button" aria-label="Close assignment" disabled={reading} onClick={onClose}><X size={19}/></button></div>
      <div className="assignment-body">
        {globalError&&<div className="banner orange" role="alert">{globalError}</div>}
        <label className="field route-to"><span>Assigned to</span><div className="select-field"><Avatar p={recipient} small/><select value={recipient.id} onChange={e=>set({assigneeId:e.target.value})} aria-label="Assign to" disabled={reading}>{teammates.filter(p=>p.canReceive&&p.id!==me.id).map(p=><option key={p.id} value={p.id}>{p.name} · {roleLabel(p)}</option>)}</select><ChevronDown size={15}/></div></label>
        <div className="field description-field"><label htmlFor="assignment-brief">What needs doing?</label><div className="editor"><textarea id="assignment-brief" placeholder="Describe the outcome you need and the context that matters." value={text} onChange={e=>set({text:e.target.value})} maxLength={5000} disabled={reading}/><div className="editor-tools"><Dictate context={me.teamId==='data'?'task':'growth'} onText={value=>set({text:value})} demoMode={useDemo}/><button className="link-button" type="button" onClick={()=>set({text:example})} disabled={reading}><FileText size={14}/>Use sample task</button></div></div></div>
        <div className="assignment-options">
          <label className="check-line"><input type="checkbox" checked={urgent} onChange={e=>set({urgent:e.target.checked})} disabled={reading}/><span><strong>Urgent delivery</strong><small>Notify the assignee immediately, even outside working hours.</small></span></label>
          <label className="aside-option"><input type="checkbox" checked={useDemo} onChange={e=>setUseDemo(e.target.checked)}/> Demo dictation</label>
        </div>
        <div className="delivery-preview"><CalendarClock size={17}/><div><strong>{immediate?'Notify when sent':`Notification at ${dateTime(delivery)}`}</strong><small>{immediate?(`Available to ${recipient.name} immediately.`):`${recipient.name} can open the handoff when sent. Their notification waits until their next shift.`}</small></div></div>
      </div>
      <div className="assignment-footer"><span>{text.trim()&&<><Check size={14}/> Draft saved</>}</span><div className="row"><Button onClick={onClose} disabled={reading}>Close</Button><Button type="submit" kind="primary" disabled={!text.trim()||reading}>{reading?'Creating draft…':'Predict questions'}<ArrowRight size={16}/></Button></div></div>
    </form>
  </dialog>;
}
function Review({s,t,act,onSend,goBack,started,busy,demoMode,predicting,animate,onPredict,notes,setNotes}:{s:State;t:Task;act:Act;onSend:()=>void;goBack:()=>void;started:number;busy:boolean;demoMode:boolean;predicting:boolean;animate:boolean;onPredict:(settings?:Record<string,unknown>,endpoint?:string)=>Promise<Record<string,unknown>|undefined>;notes:DraftNotes;setNotes:(update:(old:DraftNotes)=>DraftNotes)=>void}){
  const [guide,setGuide]=useState<number|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [confirming,setConfirming]=useState(false);
  const [confirmMessage,setConfirmMessage]=useState('');
  const [moreMessage,setMoreMessage]=useState('');
  const [exhausted,setExhausted]=useState(false);
  const revealFrom=useRef(0);
  const [add,setAdd]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const [revealed,setRevealed]=useState(0);
  const [localDemo,setLocalDemo]=useState(demoMode);
  const receiver=getPersona(s,t.assigneeId);
  const rows=s.questions.filter(q=>q.taskId===t.id&&!q.attached);
  const predictions=rows.filter(q=>q.source==='predicted');
  const library=s.questions.filter(q=>q.taskId===t.id&&q.attached);
  const confirmedLibrary=library.filter(q=>q.status==='library'&&q.libraryConfirmed);
  const libraryToReview=library.filter(q=>!confirmedLibrary.includes(q));
  const active=rows.filter(q=>q.status!=='removed'&&q.status!=='skipped');
  const removed=rows.filter(q=>q.status==='removed');
  const checked=(id:string)=>selected.includes(id);
  const toggle=(id:string)=>setSelected(old=>old.includes(id)?old.filter(key=>key!==id):[...old,id]);
  const clarificationIds=active.filter(q=>{
    const edit=notes.answers[q.id];
    return (!q.verifiedSuggestion||edit?.text!==undefined)&&Boolean(edit?.text?.trim()??(q.answer||q.source==='predicted'));
  }).map(q=>q.id);
  const libraryIds=library.filter(q=>q.status==='library'&&!q.libraryConfirmed).map(q=>q.id);
  const guideSteps=[
    {title:'Review the clarifying questions',text:'Accept or edit the answer, or nominate teammates who can help. Use Remove if the question does not belong in the handoff.',target:'clarification-review'},
    ...(libraryToReview.length?[{title:'Review questions with existing answers',text:'Confirm the existing answers that apply. Select one or several to confirm together.',target:'saved-library-answers'}]:[]),
    {title:'Send the handoff',text:`Check when ${receiver.name} will receive the task. Recipients will see the answers you accepted and the teammates you nominated.`,target:'handoff-send'},
  ];
  useEffect(()=>{
    try{if(localStorage.getItem('headstart-review-guide-v2')!=='seen')setGuide(0);}catch{}
  },[]);
  function closeGuide(){
    setGuide(null);
    try{localStorage.setItem('headstart-review-guide-v2','seen');}catch{}
  }
  function moveGuide(step:number){
    setGuide(step);
    document.getElementById(guideSteps[step].target)?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  async function bulkConfirm(mode:'clarifications'|'library',ids:string[]){
    setConfirming(true);
    setConfirmMessage('');
    try{
      const result=await act('tasks/'+t.id+'/questions/confirm',{mode,ids,edits:mode==='clarifications'?notes.answers:undefined});
      if(!result||!Array.isArray(result.confirmed))return;
      const approved=new Set(result.confirmed as string[]);
      setSelected(old=>old.filter(id=>!approved.has(id)));
      if(mode==='clarifications')setNotes(prev=>({...prev,answers:Object.fromEntries(Object.entries(prev.answers).filter(([id])=>!approved.has(id)))}));
      setConfirmMessage(`${approved.size} ${mode==='library'?'library ':''}${approved.size===1?'answer':'answers'} confirmed.`);
    }finally{setConfirming(false);}
  }
  const bulk=(mode:'clarifications'|'library',ids:string[])=>{
    const marked=ids.filter(checked);
    const allMarked=ids.length>0&&marked.length===ids.length;
    return <div className="bulk-review-controls">
      <label className="select-review-all"><input type="checkbox" aria-label={mode==='library'?'Select all library answers':'Select all clarifying questions'} checked={allMarked} disabled={!ids.length||confirming} onChange={()=>setSelected(old=>allMarked?old.filter(id=>!ids.includes(id)):[...new Set([...old,...ids])])}/> Select all</label>
      <Button className="small" kind="primary" disabled={!ids.length||confirming||busy||predicting||revealing} onClick={()=>void bulkConfirm(mode,marked.length?marked:ids)}><Check size={14}/>{marked.length&&!allMarked?`Confirm selected (${marked.length})`:mode==='library'?'Confirm all existing answers':'Confirm all clarifying questions'}</Button>
    </div>;
  };
  const total=predictions.length;
  const signature=predictions.map(q=>q.id).join(',');
  const visible=animate?Math.max(revealFrom.current,revealed):total;
  const revealing=animate&&visible<total;
  const unresolved=active.filter(q=>{
    const edit=notes.answers[q.id];
    const hasNominees=(edit?.nomineeIds??(edit?.nomineeId!==undefined?(edit.nomineeId?[edit.nomineeId]:[]):nomineeIdsFor(q))).length>0;
    const hasAnswer=Boolean(q.answer||(!edit?.requiresVerification&&edit?.text?.trim()));
    return !hasAnswer&&!hasNominees;
  }).length;
  const done=active.length-unresolved;
  const delivery=t.urgent||onShift(receiver,s.now)?s.now:nextStart(receiver,s.now);
  const wait=Math.max(0,Math.round((Date.parse(delivery)-Date.parse(s.now))/60000));
  const editQuestion=(id:string,edit:ContextDraft)=>setNotes(prev=>({...prev,answers:{...prev.answers,[id]:{...prev.answers[id],...edit}}}));
  const clearEdit=(id:string)=>setNotes(prev=>{const answers={...prev.answers};delete answers[id];return {...prev,answers};});
  const editAdditional=(id:string,draft?:AdditionalAnswerDraft)=>setNotes(prev=>{
    const extraAnswers={...prev.extraAnswers};
    if(draft)extraAnswers[id]=draft;
    else delete extraAnswers[id];
    return {...prev,extraAnswers};
  });
  const saveQuestion=async(id:string,edit:ContextDraft)=>{
    const result=await act('questions/'+id+'/context',edit);
    if(result)clearEdit(id);
    return result;
  };
  useEffect(()=>{
    const update=()=>setElapsed(started?Math.max(0,Math.round((Date.now()-started)/1000)):0);
    update();
    const timer=setInterval(update,1000);
    return ()=>clearInterval(timer);
  },[started]);
  useEffect(()=>{
    const first=Math.min(revealFrom.current,total);
    if(predicting){setRevealed(first);return;}
    if(!animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setRevealed(total);return;}
    let count=first;
    setRevealed(first);
    if(count>=total)return;
    const timer=setInterval(()=>{
      setRevealed(++count);
      if(count===total)clearInterval(timer);
    },280);
    return ()=>clearInterval(timer);
  },[animate,predicting,total,signature]);
  async function predictMore(){
    revealFrom.current=total;
    setMoreMessage('');
    const result=await onPredict({more:true});
    if(!result)return;
    const added=Array.isArray(result.questions)?result.questions.length:0;
    const matched=Array.isArray(result.libraryAnswers)?result.libraryAnswers.length:0;
    if(!added&&!matched){setExhausted(true);setMoreMessage('No new suggestions for this task. You can still add your own question.');}
    else setMoreMessage([added?`${added} more ${added===1?'question':'questions'} suggested`:'',matched?`${matched} more saved ${matched===1?'answer':'answers'} matched`:''].filter(Boolean).join(' · ')+'.');
  }
  function refreshPrediction(settings:Record<string,unknown>,endpoint?:string){
    revealFrom.current=0;
    setMoreMessage('');
    setExhausted(false);
    void onPredict(settings,endpoint);
  }
  const toolbarDisabled=busy||predicting||revealing||confirming;
  const unverifiedEdits=active.filter(q=>notes.answers[q.id]?.requiresVerification&&notes.answers[q.id]?.text?.trim()).length;
  const hasUnsavedForm=Boolean(notes.custom?.trim()||notes.customAnswer?.trim()||notes.customNominees?.length||active.some(q=>notes.extraAnswers?.[q.id]?.text.trim()));
  const [addingQuestion,setAddingQuestion]=useState(false);
  const [changingAssignee,setChangingAssignee]=useState(false);
  const recipients=s.people.filter(p=>p.teamId===t.teamId&&p.canReceive&&p.id!==t.assignerId);
  async function changeAssignee(assigneeId:string){
    setChangingAssignee(true);
    try{
      if(await act('tasks/'+t.id+'/assignee',{actorId:t.assignerId,assigneeId})){
        setExhausted(false);
        setMoreMessage('');
        setNotes(prev=>({...prev,customNominees:prev.customNominees?.filter(id=>id!==assigneeId),answers:Object.fromEntries(Object.entries(prev.answers).map(([id,note])=>[id,{...note,nomineeId:note.nomineeId===assigneeId?undefined:note.nomineeId,nomineeIds:note.nomineeIds?.filter(id=>id!==assigneeId)}]))}));
      }
    }finally{setChangingAssignee(false);}
  }
  function closeCustom(){
    setAdd(false);
    setNotes(prev=>({...prev,custom:undefined,customAnswer:undefined,customNominees:undefined}));
  }
  const reviewQuestion=(q:Question,number:number,animateQuestion=false)=><ReviewQuestion key={q.id} number={number} animate={animateQuestion} q={q} s={s} t={t} act={act} demoMode={localDemo} edit={notes.answers[q.id]} onEdit={value=>editQuestion(q.id,value)} onSave={value=>saveQuestion(q.id,value)} onCancel={()=>clearEdit(q.id)} additionalDraft={notes.extraAnswers?.[q.id]} onAdditionalEdit={value=>editAdditional(q.id,value)} selectable={clarificationIds.includes(q.id)} selected={checked(q.id)} onSelect={()=>toggle(q.id)}/>;
  return <>
    <button className="link-button back" onClick={goBack}><ArrowLeft size={15}/>Open items</button>
    <Title title="Task draft" description="Verify suggested answers and choose who can help before sending."><span className="saved-stamp"><Check size={15}/> Saved in Open items</span></Title>
    <div className="review-grid review-transition">
      <div className="review-work">
        <section className="task-summary dispatch-sheet brief-header">
          <span className="eyebrow">Task brief</span><h2>{t.text}</h2>
          <div className="task-brief-categories"><label><span>Assign to</span><span className="select-chip"><select aria-label="Draft assignee" value={t.assigneeId} disabled={toolbarDisabled||changingAssignee} onChange={e=>void changeAssignee(e.target.value)}>{recipients.map(p=><option key={p.id} value={p.id}>{p.name} · {roleLabel(p)}</option>)}</select><ChevronDown size={13}/></span></label><label><span>Category</span><span className="select-chip"><select aria-label="Task type" value={t.type} disabled={toolbarDisabled} onChange={e=>refreshPrediction({type:e.target.value,refresh:true})}>{Object.entries(types).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><ChevronDown size={13}/></span></label><label><span>Team</span><span className="select-chip"><select aria-label="Task team" value={t.teamId} disabled={toolbarDisabled} onChange={e=>refreshPrediction({teamId:e.target.value},'team')}>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select><ChevronDown size={13}/></span></label></div>
        </section>
        <section className="question-stream" id="clarification-review">
          <div className="review-sticky-tools">
            <div className="row spread wrap"><div><h2>Predicted clarifying questions</h2><p>Questions {receiver.name} may need clarified before starting.</p></div><button type="button" className="link-button review-guide-button" onClick={()=>guide===null?moveGuide(0):closeGuide()} aria-expanded={guide!==null}><CircleHelp size={16}/> Guide</button></div>
            <div className="row wrap review-actions">
              <Button className="small" onClick={()=>void (total?predictMore():onPredict())} disabled={toolbarDisabled||exhausted}><Sparkles size={15}/>{predicting?'Predicting…':total?'Predict more questions':'Predict questions'}</Button>
              <Button className="small" onClick={()=>{setAdd(true);requestAnimationFrame(()=>document.getElementById('new-handoff-question')?.focus());}} disabled={toolbarDisabled}><Plus size={15}/>Add a question</Button>
            </div>
            <div className="row spread wrap"><p aria-live="polite">{predicting?'Finding questions, answers, and nominees…':revealing?`Finding questions · ${visible} of ${total}`:`${predictions.filter(q=>q.status!=='removed').length} predicted · ${done} of ${active.length} in review addressed`}</p></div>
          </div>
          {guide!==null&&guideSteps[Math.min(guide,guideSteps.length-1)]&&<aside className="review-guide" aria-label="Handoff walkthrough">
            <div className="row spread align-top"><div><small>Step {Math.min(guide+1,guideSteps.length)} of {guideSteps.length}</small><h3>{guideSteps[Math.min(guide,guideSteps.length-1)].title}</h3></div><button type="button" className="icon-button" aria-label="Dismiss guide" onClick={closeGuide}><X size={16}/></button></div>
            <p>{guideSteps[Math.min(guide,guideSteps.length-1)].text}</p>
            <div className="row end">{guide>0&&<Button className="small" kind="plain" onClick={()=>moveGuide(guide-1)}>Back</Button>}<Button className="small" kind="primary" onClick={()=>guide+1<guideSteps.length?moveGuide(guide+1):closeGuide()}>{guide+1<guideSteps.length?'Next':'Done'}</Button></div>
          </aside>}
          {(predicting||revealing)&&<div className={`prediction-meter ${predicting?'scanning':''}`} role="progressbar" aria-label="Predicting questions" aria-valuemax={total||undefined} aria-valuenow={predicting?undefined:visible}><span style={{width:predicting?undefined:`${visible/total*100}%`}}/></div>}
          {predicting&&visible===0&&<div className="prediction-placeholder" aria-hidden="true"><span/><span/><span/></div>}
          {moreMessage&&!predicting&&!revealing&&<p className="prediction-result" role="status">{moreMessage}</p>}
          {(add||notes.custom||notes.customAnswer||Boolean(notes.customNominees?.length))&&<form className="inline-context add-question-editor" onSubmit={async e=>{
            e.preventDefault();
            const text=notes.custom?.trim();
            if(!text||addingQuestion)return;
            setAddingQuestion(true);
            try{
              if(await act('tasks/'+t.id+'/questions/custom',{text,answer:notes.customAnswer,nomineeIds:notes.customNominees??[]}))closeCustom();
            }finally{setAddingQuestion(false);}
          }}>
            <div className="row spread"><h3>Add a question</h3><button type="button" className="icon-button" aria-label="Close new question" disabled={addingQuestion} onClick={closeCustom}><X size={17}/></button></div>
            <div className="field"><label htmlFor="new-handoff-question">Question</label><div className="editor context-editor"><textarea id="new-handoff-question" rows={2} value={notes.custom??''} onChange={e=>{const custom=e.target.value;setNotes(prev=>({...prev,custom}));}}/><div className="editor-tools"><Dictate context="question" demoMode={localDemo} onText={custom=>setNotes(prev=>({...prev,custom}))}/></div></div></div>
            <label className="field"><span>Answer 1 <small>(optional)</small></span><textarea rows={2} value={notes.customAnswer??''} onChange={e=>{const customAnswer=e.target.value;setNotes(prev=>({...prev,customAnswer}));}}/></label>
            <NomineePicker people={nominationCandidates(s,t)} selected={notes.customNominees??[]} disabled={addingQuestion} onToggle={id=>setNotes(prev=>({...prev,customNominees:toggleId(prev.customNominees??[],id)}))}/>
            <div className="row end"><Button kind="primary" type="submit" disabled={!notes.custom?.trim()||addingQuestion}><Check size={15}/>Confirm question</Button></div>
          </form>}
          {confirmedLibrary.length>0&&<section className="confirmed-existing" id="confirmed-existing" aria-labelledby="confirmed-existing-title">
            <h3 id="confirmed-existing-title"><CheckCircle2 size={17}/> Confirmed existing answers <span>{confirmedLibrary.length}</span></h3>
            {confirmedLibrary.map(q=><article key={q.id} className="library-match">
              <div className="row spread align-top wrap"><h4>{q.text}</h4><Chip tone="human">Included in handoff</Chip></div>
              <p className="answer-text">{q.answer}</p>
              <div className="row spread wrap"><span className="library-match-source">Saved answer{q.answeredById&&` by ${getPersona(s,q.answeredById).name}`}</span><button type="button" className="link-button" onClick={()=>void act('questions/'+q.id+'/remove')}>Leave out</button></div>
            </article>)}
          </section>}
          {predictions.slice(0,predicting?revealFrom.current:visible).filter(q=>q.status!=='removed'&&q.status!=='skipped').map((q,index)=>reviewQuestion(q,index+1,animate&&index>=revealFrom.current))}
          {!predicting&&!revealing&&active.filter(q=>q.source!=='predicted').map((q,index)=>reviewQuestion(q,total+index+1))}
          {active.length>0&&<div className="review-bulk-footer">{bulk('clarifications',clarificationIds)}</div>}
          {confirmMessage&&<p className="confirmation-result" role="status">{confirmMessage}{confirmedLibrary.length>0&&<> <a className="link-button" href="#confirmed-existing">View confirmed existing answers</a></>}</p>}
          {removed.length>0&&<details className="parked-questions"><summary>Removed from question set ({removed.length})</summary>{removed.map(q=><div className="row spread" key={q.id}><span>{q.text}</span><button type="button" className="link-button" onClick={()=>void act('questions/'+q.id+'/remove',{},'DELETE')}>Undo removal</button></div>)}</details>}
        </section>
        {!predicting&&!revealing&&libraryToReview.length>0&&<LibraryMatches s={s} matches={libraryToReview} act={act} bulk={bulk('library',libraryIds)} selected={checked} onSelect={toggle} onConfirm={id=>bulkConfirm('library',[id])} confirming={confirming}/>}
      </div>
      <aside className="review-aside">
        <section className="delivery-route send-route" id="handoff-send"><div className="route-heading"><span className="eyebrow"><Send size={15}/> Handoff preview</span><span>{dateLabel(delivery)}</span></div><div className="send-route-body"><span className="eyebrow">To {receiver.name}</span><strong>{wait?<>{shortTime(delivery)} <small>IST</small></>:'When sent'}</strong><p>{wait?`${receiver.name} can open the handoff immediately. Their notification is scheduled for their next shift.`:t.urgent?'Your teammate can open the handoff and will be notified immediately.':'Your teammate is on shift and can see the task immediately.'}</p>{(unresolved>0||libraryIds.length>0)&&<p className="unverified-note">Unused suggestions are automatically left out.</p>}{hasUnsavedForm&&<p className="unverified-note">Confirm any new questions or extra answers you want included before sending.</p>}{unverifiedEdits>0&&<p className="unverified-note">{unverifiedEdits} edited {unverifiedEdits===1?'suggestion requires':'suggestions require'} verification to be included.</p>}</div><div className="send-route-footer"><Button kind="primary" onClick={onSend} disabled={toolbarDisabled||addingQuestion||changingAssignee}><Send size={16}/>{busy?'Sending…':'Send handoff'}</Button><Button kind="plain" onClick={goBack}>Finish later</Button></div></section>
        <div className="review-preferences"><span className="timer"><Clock3 size={14}/> Time on task <strong>{Math.floor(elapsed/60)}m {String(elapsed%60).padStart(2,'0')}s</strong></span><label className="aside-option"><input type="checkbox" checked={localDemo} onChange={e=>setLocalDemo(e.target.checked)}/> Demo dictation</label></div>
      </aside>
    </div>
  </>;
}
function LibraryMatches({s,matches,act,bulk,selected,onSelect,onConfirm,confirming}:{s:State;matches:Question[];act:Act;bulk:ReactNode;selected:(id:string)=>boolean;onSelect:(id:string)=>void;onConfirm:(id:string)=>Promise<void>;confirming:boolean}){
  return <section className="library-matches" id="saved-library-answers" aria-labelledby="library-match-title">
    <div className="stream-heading library-heading"><BookOpen size={17}/><h2 id="library-match-title">Questions with existing answers</h2><span>Confirm the answers that still apply.</span></div>
    {matches.map(q=>{
      const entry=s.library.find(e=>e.id===q.libraryId);
      const removed=q.status==='removed';
      const path='questions/'+q.id+'/remove';
      return <article className={`library-match ${removed?'excluded':''}`} key={q.id}>
        <div className="row spread align-top"><h3>{!removed&&!q.libraryConfirmed&&<input type="checkbox" aria-label={`Select library answer for ${q.text}`} checked={selected(q.id)} onChange={()=>onSelect(q.id)}/>} {q.text}</h3><Chip tone={removed?'':q.libraryConfirmed?'green':'amber'}>{removed?'Excluded':q.libraryConfirmed?'Included in handoff':'Needs confirmation'}</Chip></div>
        <p className="answer-text">{q.answer}</p>
        <div className="row spread wrap">
          <span className="library-match-source">Saved answer{q.answeredById&&` by ${getPersona(s,q.answeredById).name}`}{entry&&` · ${types[entry.taskType]}`}</span>
          <div className="row wrap">{!removed&&!q.libraryConfirmed&&<Button className="small" onClick={()=>void onConfirm(q.id)} disabled={confirming}><Check size={14}/>Confirm answer</Button>}<button type="button" className="link-button" onClick={()=>void act(path,{},removed?'DELETE':'POST')}>{removed?'Restore to review':'Leave out'}</button></div>
        </div>
        {entry&&entry.question!==q.text&&<p className="library-match-source">Matched library question: {entry.question}</p>}
      </article>;
    })}
    <div className="review-bulk-footer">{bulk}</div>
  </section>;
}
function nominationCandidates(s:State,t:Task){
  return s.people.filter(p=>p.teamId===t.teamId&&p.id!==t.assigneeId&&p.id!==t.assignerId);
}
function toggleId(ids:string[],id:string){
  return ids.includes(id)?ids.filter(value=>value!==id):[...ids,id];
}
function NomineePicker({id,people,selected,disabled,onToggle}:{id?:string;people:Person[];selected:string[];disabled?:boolean;onToggle:(id:string)=>void}){
  return <fieldset id={id} className="nominee-picker" disabled={disabled}>
    <legend>Nominate teammates</legend>
    {people.length?<div className="nominee-options">{people.map(p=><label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={()=>onToggle(p.id)}/><span>{p.name}</span></label>)}</div>:<p>No other teammates are available for nomination.</p>}
  </fieldset>;
}
function ReviewQuestion({q,s,t,act,demoMode,number,animate,edit,onEdit,onSave,onCancel,additionalDraft,onAdditionalEdit,selectable,selected,onSelect}:{q:Question;s:State;t:Task;act:Act;demoMode:boolean;number:number;animate?:boolean;edit?:ContextDraft;onEdit:(value:ContextDraft)=>void;onSave:(value:ContextDraft)=>Promise<unknown>;onCancel:()=>void;additionalDraft?:AdditionalAnswerDraft;onAdditionalEdit:(value?:AdditionalAnswerDraft)=>void;selectable:boolean;selected:boolean;onSelect:()=>void}){
  const [editing,setEditing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [nominationOpen,setNominationOpen]=useState(false);
  const [savingNominees,setSavingNominees]=useState(false);
  const path='questions/'+q.id;
  const choices=nominationCandidates(s,t);
  const suggestion=q.source==='predicted'?(q.suggestedAnswer??suggestAnswer(t,q.text)):undefined;
  const suggestedId=q.source==='predicted'?(q.suggestedNomineeId??fallbackNominee(s,t,q.text)):undefined;
  const suggestedPerson=choices.find(p=>p.id===suggestedId);
  const context=/output|format/i.test(q.text)?'output':/priority|other tasks/i.test(q.text)?'priority':/definition/i.test(q.text)?'definition':'answer';
  const isOpen=editing||edit?.text!==undefined;
  const text=edit?.text??q.answer??'';
  const currentNominees=nomineeIdsFor(q);
  const nominees=edit?.nomineeIds??(edit?.nomineeId!==undefined?(edit.nomineeId?[edit.nomineeId]:[]):currentNominees);
  const additional=q.additionalAnswers??[];
  const nextNumber=q.answer?additional.length+2:1;
  const additionalNumber=additionalDraft?.id==='new'?nextNumber:additional.findIndex(answer=>answer.id===additionalDraft?.id)+2;
  const canSave=Boolean(text.trim()&&(text.trim()!==q.answer||edit?.requiresVerification&&!q.verifiedSuggestion));

  async function savePrimary(value:ContextDraft){
    setSaving(true);
    try{if(await onSave({...value,nomineeId:edit?.nomineeId,nomineeIds:edit?.nomineeIds}))setEditing(false);}
    finally{setSaving(false);}
  }
  async function changeNominees(ids:string[]){
    setSavingNominees(true);
    try{
      if(await act(path+'/nominate',{nomineeIds:ids})&&(edit?.nomineeIds!==undefined||edit?.nomineeId!==undefined)){
        onEdit({nomineeId:undefined,nomineeIds:undefined});
      }
    }finally{setSavingNominees(false);}
  }
  const toggleNominee=(id:string)=>changeNominees(nominees.includes(id)?nominees.filter(person=>person!==id):[...nominees,id]);

  const additionalEditor=additionalDraft&&<form className="inline-context" onSubmit={async e=>{
          e.preventDefault();
          if(saving||!additionalDraft.text.trim())return;
          setSaving(true);
          try{if(await act(path+'/context',{answerId:additionalDraft.id,text:additionalDraft.text}))onAdditionalEdit();}
          finally{setSaving(false);}
        }}>
          <div className="field"><label htmlFor={`additional-${q.id}`}>Answer {additionalNumber}</label><div className="editor context-editor"><textarea id={`additional-${q.id}`} rows={3} value={additionalDraft.text} onChange={e=>onAdditionalEdit({...additionalDraft,text:e.target.value})}/><div className="editor-tools"><Dictate context={context} demoMode={demoMode} onText={value=>onAdditionalEdit({...additionalDraft,text:value})}/></div></div></div>
          <div className="row end"><Button kind="plain" disabled={saving} onClick={()=>onAdditionalEdit()}>Cancel</Button><Button kind="primary" type="submit" disabled={saving||!additionalDraft.text.trim()}>{saving?'Saving…':`Save answer ${additionalNumber}`}</Button></div>
        </form>;

  return <article className={`question-row review-question ${animate?'revealed':''}`}>
    <span className="question-index">{String(number).padStart(2,'0')}</span>
    <div className="question-main">
      <div className="row spread align-top"><div><h3>{selectable&&<input type="checkbox" aria-label={`Select clarification answer for ${q.text}`} checked={selected} onChange={onSelect}/>} {q.text}</h3>{q.reason&&<p className="reason">{q.reason}</p>}</div><button type="button" className="remove-link" onClick={()=>void act(path+'/remove')}><X size={13}/> Remove from question set</button></div>

      <div className="question-nominations">
        <div className="nomination-row">
          <strong><Users size={15}/> Nominees</strong>
          {nominees.map(id=>{
            const name=getPersona(s,id).name;
            return <span className="chip human nominee-chip" key={id}>{name}<button type="button" aria-label={`Remove ${name} from nominees`} disabled={savingNominees} onClick={()=>void toggleNominee(id)}><X size={13}/></button></span>;
          })}
          {suggestedPerson&&!nominees.includes(suggestedPerson.id)&&<button type="button" className="suggested-person" aria-label={`Nominate ${suggestedPerson.name}, suggested by Headstart`} onClick={()=>void toggleNominee(suggestedPerson.id)} disabled={savingNominees}><Sparkles size={13}/>{suggestedPerson.name}<small>Suggested</small><Plus size={13}/></button>}
          <button type="button" className="button small" onClick={()=>setNominationOpen(!nominationOpen)} aria-expanded={nominationOpen} aria-controls={nominationOpen?`nominees-${q.id}`:undefined}><Plus size={14}/>Nominate</button>
        </div>
        {nominationOpen&&<NomineePicker id={`nominees-${q.id}`} people={choices} selected={nominees} disabled={savingNominees} onToggle={id=>void toggleNominee(id)}/>}
      </div>

      <div className="question-answers">
        {q.answer&&!isOpen&&<section className="context-suggestion approved-answer">
          <div className="row spread wrap"><h4><Check size={14}/> Answer 1</h4><div className="row wrap"><span className="answer-provenance">{q.verifiedSuggestion?'Approved by you':'Added by you'}</span><button type="button" className="link-button" aria-label="Edit answer 1" disabled={Boolean(additionalDraft)} onClick={()=>setEditing(true)}>Edit</button></div></div>
          <p>{q.answer}</p>
        </section>}
        {suggestion&&!q.answer&&!isOpen&&<section className="context-suggestion suggested-answer">
          <div className="row spread wrap"><h4><Sparkles size={14}/> System-suggested answer</h4><span className="verification-status">Needs your approval</span></div>
          <p>{suggestion}</p>
          <div className="row wrap"><Button className="small" onClick={()=>void savePrimary({text:suggestion,verifySuggested:true})} disabled={saving}><Check size={14}/>Accept this answer</Button><button type="button" className="link-button" onClick={()=>{onEdit({text:suggestion,requiresVerification:true});setEditing(true);}}>Edit</button></div>
        </section>}
        {isOpen&&<form className="inline-context" onSubmit={e=>{e.preventDefault();if(canSave&&!saving)void savePrimary({text,verifySuggested:edit?.requiresVerification===true});}}>
          <div className="field"><label htmlFor={`answer-${q.id}`}>Answer 1</label><div className="editor context-editor"><textarea id={`answer-${q.id}`} rows={3} placeholder="Give your teammate a starting point…" value={text} onChange={e=>onEdit({text:e.target.value,requiresVerification:edit?.requiresVerification||q.verifiedSuggestion})}/><div className="editor-tools"><Dictate context={context} demoMode={demoMode} onText={value=>onEdit({text:value,requiresVerification:edit?.requiresVerification||q.verifiedSuggestion})}/></div></div></div>
          <div className="row end"><Button kind="plain" onClick={()=>{setEditing(false);onCancel();}}>Cancel</Button><Button kind="primary" type="submit" disabled={!canSave||saving}>{saving?'Saving…':'Save answer 1'}</Button></div>
        </form>}
        {additional.map((answer,index)=><div key={answer.id}>{additionalDraft?.id===answer.id?additionalEditor:<section className="context-suggestion approved-answer">
          <div className="row spread wrap"><h4><Check size={14}/> Answer {index+2}</h4><div className="row wrap"><span className="answer-provenance">Added by you</span><button type="button" className="link-button" aria-label={`Edit answer ${index+2}`} disabled={Boolean(additionalDraft)||isOpen} onClick={()=>onAdditionalEdit({id:answer.id,text:answer.text})}>Edit</button></div></div>
          <p>{answer.text}</p>
        </section>}</div>)}
        {additionalDraft?.id==='new'&&additionalEditor}
        {!isOpen&&!additionalDraft&&<div><Button className="small context-button" disabled={saving} onClick={()=>q.answer?onAdditionalEdit({id:'new',text:''}):setEditing(true)}><Plus size={14}/>Add answer {nextNumber}</Button></div>}
      </div>
    </div>
  </article>;
}
function TaskList({title,description,rows,s,open,mode,children,historyControl}:{title:string;description:string;rows:Task[];s:State;open:(id:string)=>void;mode:'received'|'sent';children?:ReactNode;historyControl:ReactNode}){
  const [view,setView]=useState<'active'|'all'|'accepted'>('active');
  const [search,setSearch]=useState('');
  const [limit,setLimit]=useState(20);
  const visible=rows.filter(t=>(view==='all'||(view==='accepted'?t.status==='accepted':t.status!=='accepted'))&&t.text.toLowerCase().includes(search.toLowerCase()));
  return <><Title title={title} description={description}>{children}</Title>
    <div className="history-toolbar">{historyControl}</div>
    <section className="panel">
      <div className="toolbar"><div className="segmented" aria-label="Task filters">{(['active','all','accepted'] as const).map(v=><button key={v} type="button" aria-pressed={view===v} onClick={()=>{setView(v);setLimit(20);}}>{v==='active'?'Open':v==='all'?'All':'Accepted'}{view===v&&<span>{visible.length}</span>}</button>)}</div><input type="search" aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      {visible.length?<><div className="task-table table-head"><span>Task</span><span>{mode==='sent'?'Assigned to':'Assigned by'}</span><span>Status</span><span/></div>
        {visible.slice(0,limit).map(t=><button className="task-table task-table-row" key={t.id} onClick={()=>open(t.id)}><span><strong>{t.text}</strong><small>{types[t.type]} · {dateTime(t.sentAt!)}{t.status==='queued'?` · Notifies ${dateTime(t.deliveredAt!)}${mode==='sent'?' · Assignee editable':''}`:''}{t.lowOnContext?' · Low on context':''}</small></span><PersonTag p={getPersona(s,mode==='sent'?t.assigneeId:t.assignerId)} now={s.now}/><span><PillStatus t={t}/></span><ChevronRight size={16}/></button>)}
        {limit<visible.length&&<div className="list-padding"><Button onClick={()=>setLimit(limit+20)}>Show more tasks</Button></div>}</>:<Empty>{search?'No tasks match this search.':mode==='received'?'Nothing waiting for you. New work appears here when someone sends it.':'No handoffs in this view yet.'}</Empty>}
    </section></>;
}
function TaskDetail({s,t,me,act,back,backLabel}:{s:State;t:Task;me:Person;act:Act;back:()=>void;backLabel:string}){
  const [asked,setAsked]=useState('');
  const [acceptanceNote,setAcceptanceNote]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [newAssignee,setNewAssignee]=useState('');
  const [reassigning,setReassigning]=useState(false);
  const [modifying,setModifying]=useState(false);
  const canReassign=t.assignerId===me.id&&t.status==='queued'&&Boolean(t.deliveredAt&&t.deliveredAt>s.now);
  const recipients=s.people.filter(p=>p.canReceive&&p.teamId===t.teamId&&p.id!==t.assignerId);
  const nextAssignee=recipients.find(p=>p.id===newAssignee);
  const newDelivery=nextAssignee?(t.urgent||onShift(nextAssignee,s.now)?s.now:nextStart(nextAssignee,s.now)):undefined;
  const rows=s.questions.filter(q=>q.taskId===t.id&&q.status!=='removed'&&q.status!=='skipped'&&q.createdAt<=s.now);
  const handoffRows=rows.filter(q=>q.source!=='asked'&&!q.retrospective);
  const retrospective=rows.filter(q=>q.retrospective);
  const askedRows=rows.filter(q=>q.source==='asked');
  const isAssignee=t.assigneeId===me.id;
  const isShared=Boolean(t.sentAt&&t.sentAt<=s.now);
  const canModify=isShared&&t.assignerId===me.id&&t.status!=='accepted';
  const editable=isAssignee&&isShared&&t.status!=='accepted';
  const canSubmit=editable&&['queued','new','waiting','in_progress','sent_back'].includes(t.status);
  return <>
    <button className="link-button back" onClick={back}><ArrowLeft size={15}/>Back to {backLabel}</button>
    <Title title={isAssignee?"Task details":"Handoff sent"}><div className="row wrap"><PillStatus t={t}/>{canModify&&!modifying&&<Button onClick={()=>{setNewAssignee('');setModifying(true);}}>Modify</Button>}</div></Title>
    {canModify&&modifying&&<ModifyHandoff t={t} questions={handoffRows} act={act} close={()=>setModifying(false)}/>}
    {t.status==='acceptance_requested'&&t.assignerId===me.id&&<section className="panel detail-acceptance" aria-labelledby="review-submitted-title">
      <div><h2 id="review-submitted-title">Review submitted work</h2>{t.acceptanceNote&&<p>{t.acceptanceNote}</p>}</div>
      <AcceptanceActions taskId={t.id} act={act}/>
    </section>}
    {t.status==='sent_back'&&<div className="banner orange"><strong>Sent back</strong><span>{t.sentBackReason}</span></div>}
    <section className="panel task-summary">
      <div className="eyebrow">Task</div><h2>{t.text}</h2>
      <div className="row wrap"><Chip>{types[t.type]}</Chip><Chip>{teams.find(x=>x.id===t.teamId)?.name}</Chip>{t.lowOnContext&&<Chip tone="amber">Low on context</Chip>}{t.urgent&&<Chip tone="orange">Urgent</Chip>}</div>
      <div className="task-meta"><div><div className="eyebrow">Assigned by</div><PersonTag p={getPersona(s,t.assignerId)} now={s.now}/></div><div><div className="eyebrow">Assigned to</div><div className="row wrap"><PersonTag p={getPersona(s,t.assigneeId)} now={s.now}/>{canReassign&&!newAssignee&&!modifying&&<button type="button" className="link-button" onClick={()=>setNewAssignee(t.assigneeId)}>Change assignee</button>}</div></div><div><div className="eyebrow">Assigned at</div><strong>{dateTime(t.sentAt??t.createdAt)}</strong></div>{t.status==='queued'&&t.deliveredAt&&<div><div className="eyebrow">Notification scheduled</div><strong>{dateTime(t.deliveredAt)}</strong></div>}{t.modifiedAt&&<div><div className="eyebrow">Last updated</div><strong>{dateTime(t.modifiedAt)}</strong></div>}{t.priorityNote&&<div><div className="eyebrow">Priority</div><strong>{t.priorityNote}</strong></div>}</div>
      {canReassign&&newAssignee&&<form className="inline-context reassign-form" onSubmit={async e=>{
        e.preventDefault();
        if(reassigning||!nextAssignee||nextAssignee.id===t.assigneeId)return;
        setReassigning(true);
        try{if(await act('tasks/'+t.id+'/reassign',{actorId:me.id,assigneeId:nextAssignee.id}))setNewAssignee('');}
        finally{setReassigning(false);}
      }}>
        <label className="field"><span>New assignee</span><select autoFocus value={newAssignee} disabled={reassigning} onChange={e=>setNewAssignee(e.target.value)}>{recipients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {nextAssignee&&nextAssignee.id!==t.assigneeId&&newDelivery&&<p>{newDelivery===s.now?`${nextAssignee.name} can open this immediately and will be notified now.`:`${nextAssignee.name} can open this immediately. Notification at ${dateTime(newDelivery)}.`}</p>}
        <div className="row wrap end"><Button disabled={reassigning} onClick={()=>setNewAssignee('')}>Cancel</Button><Button kind="primary" type="submit" disabled={reassigning||!nextAssignee||nextAssignee.id===t.assigneeId}>{reassigning?'Updating…':'Confirm reassignment'}</Button></div>
      </form>}
    </section>
    {canSubmit&&<section className="panel acceptance-request" aria-labelledby="submit-work-title">
      <div><h2 id="submit-work-title">Ready to submit your work?</h2><p>{getPersona(s,t.assignerId).name} will review it and accept it or send it back.</p></div>
      <form onSubmit={async e=>{
        e.preventDefault();
        if(submitting)return;
        setSubmitting(true);
        try{await act('tasks/'+t.id+'/request-acceptance',{actorId:me.id,note:acceptanceNote});}
        finally{setSubmitting(false);}
      }}>
        <input value={acceptanceNote} onChange={e=>setAcceptanceNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Acceptance note"/>
        <Button type="submit" kind="primary" disabled={submitting}><FileCheck2 size={16}/>{submitting?'Sending…':'Send for acceptance'}</Button>
      </form>
    </section>}
    {isAssignee&&t.status==='acceptance_requested'&&<div className="banner amber"><strong>Sent for review</strong><span>Waiting for {getPersona(s,t.assignerId).name} to respond.</span></div>}
    <section className="panel detail-questions handoff-context"><div className="panel-head"><span className="icon-square"><MessageSquare size={18}/></span><div><h2>Questions shared at handoff</h2><p>Predicted and added questions, answers, and people to ask.</p></div></div>{handoffRows.length?handoffRows.map(q=><AnswerRead key={q.id} s={s} t={t} q={q} act={act} editable={editable}/>):<Empty>There are no questions attached to this handoff.</Empty>}</section>
    {retrospective.length>0&&<section className="panel detail-questions handoff-context"><div className="panel-head"><span className="icon-square"><Sparkles size={18}/></span><div><h2>Questions predicted for this past task</h2><p>Headstart generated these after the task was sent.</p></div></div><ul className="retrospective-questions">{retrospective.map(q=><li key={q.id}>{q.text}</li>)}</ul></section>}
    <section className="panel detail-questions assignee-context"><div className="panel-head"><span className="icon-square"><CornerDownRight size={18}/></span><div><h2>{isAssignee?'Your follow-up questions':'Assignee follow-up questions'}</h2><p>New questions asked after the handoff, with their replies or routes.</p></div></div>{askedRows.length?askedRows.map(q=><AnswerRead key={q.id} s={s} t={t} q={q} act={act} editable={editable}/>):<div className="list-padding muted">No follow-up questions yet.</div>}
      {editable&&<form className="list-padding ask-form" onSubmit={async e=>{e.preventDefault();if(asked.trim()&&await act('tasks/'+t.id+'/questions',{text:asked}))setAsked('');}}><label className="field"><span>Ask a question</span><textarea value={asked} onChange={e=>setAsked(e.target.value)} aria-label="Ask a question" placeholder="What do you need to move forward?" rows={2}/></label><Button type="submit" kind="primary" disabled={!asked.trim()}>Ask</Button></form>}
    </section>
    {t.status==='accepted'&&<ConfirmRating s={s} t={t} me={me} act={act}/>}

  </>;
}
function ModifyHandoff({t,questions,act,close}:{t:Task;questions:Question[];act:Act;close:()=>void}){
  const [text,setText]=useState(t.text);
  const [priorityNote,setPriorityNote]=useState(t.priorityNote??'');
  const [edits,setEdits]=useState<Record<string,{text?:string;answer?:string}>>({});
  const [adding,setAdding]=useState(false);
  const [newQuestion,setNewQuestion]=useState('');
  const [newAnswer,setNewAnswer]=useState('');
  const [saving,setSaving]=useState(false);
  function edit(id:string,change:{text?:string;answer?:string}){
    setEdits(old=>({...old,[id]:{...old[id],...change}}));
  }
  return <section className="panel modify-handoff" aria-labelledby="modify-handoff-title">
    <div className="panel-head"><div><h2 id="modify-handoff-title">Modify handoff</h2><p>Saved changes appear on the assignee’s task.</p></div></div>
    <form onSubmit={async e=>{
      e.preventDefault();
      if(saving||!text.trim())return;
      setSaving(true);
      try{
        if(await act('tasks/'+t.id+'/modify',{
          actorId:t.assignerId,
          text:text.trim()!==t.text?text:undefined,
          priorityNote:priorityNote.trim()!==(t.priorityNote??'')?priorityNote:undefined,
          questions:questions.filter(q=>edits[q.id]).map(q=>{
            const change=edits[q.id];
            return {id:q.id,text:change.text?.trim()===q.text?undefined:change.text,answer:change.answer?.trim()===(q.answer??'')?undefined:change.answer};
          }),
          newQuestion,newAnswer,
        }))close();
      }finally{setSaving(false);}
    }}>
      <label className="field"><span>Task brief</span><textarea rows={3} required maxLength={5000} value={text} onChange={e=>setText(e.target.value)} disabled={saving}/></label>
      <label className="field"><span>Priority note</span><input value={priorityNote} onChange={e=>setPriorityNote(e.target.value)} disabled={saving}/></label>
      {questions.map((q,i)=><details key={q.id} className="modify-question">
        <summary>{q.text}</summary>
        <label className="field"><span>Question {i+1}</span><input value={edits[q.id]?.text??q.text} onChange={e=>edit(q.id,{text:e.target.value})} disabled={saving}/></label>
        <label className="field"><span>Answer {i+1}</span><textarea rows={2} value={edits[q.id]?.answer??q.answer??''} onChange={e=>edit(q.id,{answer:e.target.value})} disabled={saving}/></label>
      </details>)}
      {adding?<div className="modify-question">
        <label className="field"><span>New question</span><input value={newQuestion} onChange={e=>setNewQuestion(e.target.value)} disabled={saving}/></label>
        <label className="field"><span>New answer (optional)</span><textarea rows={2} value={newAnswer} onChange={e=>setNewAnswer(e.target.value)} disabled={saving}/></label>
        <Button className="small" onClick={()=>{setNewAnswer('');setNewQuestion('');setAdding(false);}} disabled={saving}>Cancel new question</Button>
      </div>:<div><Button className="small" onClick={()=>setAdding(true)} disabled={saving}><Plus size={14}/>Add a handoff question</Button></div>}
      <div className="row end wrap"><Button onClick={close} disabled={saving}>Cancel</Button><Button type="submit" kind="primary" disabled={saving||!text.trim()}>{saving?'Saving…':'Save changes'}</Button></div>
    </form>
  </section>;
}
function AnswerRead({s,t,q,act,editable}:{s:State;t:Task;q:Question;act:Act;editable:boolean}){
  const [missing,setMissing]=useState(false);
  const [note,setNote]=useState('');
  const resolved=isResolved(q);
  const badge=qState(q,s);
  const history=q.history.filter(h=>['Earlier answer','Didn’t help'].includes(h.event));
  return <article className="question-row">
    <div className="row spread align-top"><h3>{q.text}</h3>{resolved?<AnswerSource q={q} s={s} t={t}/>:<Chip tone={q.raised?'orange':badge.tone}>{q.raised?'Raised question':badge.label}</Chip>}</div>
    {q.answer&&<div className={q.additionalAnswers?.length?'delivered-answers':undefined}>
      {q.additionalAnswers?.length?<div><span className="eyebrow">Answer 1</span><p className={`answer-text ${!resolved?'old-answer':''}`}>{q.answer}</p></div>:<p className={`answer-text ${!resolved?'old-answer':''}`}>{q.answer}</p>}
      {q.additionalAnswers?.map((answer,index)=><div key={answer.id}><span className="eyebrow">Answer {index+2}</span><p className={`answer-text ${!resolved?'old-answer':''}`}>{answer.text}</p></div>)}
    </div>}
    {!resolved&&<Waiting s={s} t={t} q={q}/>}
    {resolved&&pendingNomineesFor(q).length>0&&<div className="answer-followup pending"><Users size={15}/><span>Ask {new Intl.ListFormat('en').format(pendingNomineesFor(q).map(id=>getPersona(s,id).name))} directly if you need more context.</span></div>}
    {(q.nomineeResponses??(q.nomineeResponse?[q.nomineeResponse]:[])).map(response=><div className="answer-followup" key={response.byId}><span className="eyebrow">Follow-up by {getPersona(s,response.byId).name}</span><p>{response.text}</p></div>)}
    {history.length>0&&<ul className="mini-trail">{history.slice(-4).map((h,i)=><li key={i}><span>{h.event}</span>{h.note&&<span className={h.event==='Earlier answer'?'old-answer':''}>{h.note}</span>}</li>)}</ul>}
    {resolved&&editable&&<div className="row question-actions">
      <Button className="small" kind={q.feedback==='helped'?'helped':'default'} onClick={()=>void act('questions/'+q.id+'/feedback',{feedback:'helped'})}><Check size={14}/>Helped</Button>
      <Button className="small" kind="plain" onClick={()=>setMissing(!missing)}>Didn’t help</Button>
    </div>}
    {missing&&resolved&&<form className="row missing-form" onSubmit={async e=>{e.preventDefault();if(note.trim()&&await act('questions/'+q.id+'/feedback',{feedback:'didnt_help',note})){setMissing(false);setNote('');}}}><input aria-label="What was missing?" placeholder="What was missing?" value={note} onChange={e=>setNote(e.target.value)}/><Button kind="primary" type="submit" disabled={!note.trim()}>Raise question</Button></form>}
  </article>;
}

function QuestionInbox({title,description,rows,s,me,act,overlap=false,demoMode}:{title:string;description:string;rows:Question[];s:State;me:Person;act:Act;overlap?:boolean;demoMode:boolean}){
  const [expandedId,setExpandedId]=useState<string|null>(null);
  const grouped=new Map<string,Question[]>();
  for(const q of rows){
    const t=s.tasks.find(t=>t.id===q.taskId)!;
    const key=overlap?t.assigneeId:'all';
    grouped.set(key,[...(grouped.get(key)??[]),q]);
  }
  return <><Title title={title} description={description}><Chip tone={onShift(me,s.now)?'green':'amber'}><i/>{onShift(me,s.now)?'You’re online':`You’re offline · back at ${shortTime(nextStart(me,s.now))} IST`}</Chip></Title>
    {rows.length===0&&<section className="panel"><Empty icon={MessageSquare}>{overlap?'Your team has no questions awaiting your reply.':'Nothing waiting for you. New questions appear here when someone needs your input.'}</Empty></section>}
    {[...grouped].map(([key,questions])=><section className="panel" key={key}>{key!=='all'&&<div className="panel-head spread"><PersonTag p={getPersona(s,key)} now={s.now}/><span className="muted">{questions.length} {questions.length===1?'question':'questions'}</span></div>}
      {questions.map(q=>{const task=s.tasks.find(t=>t.id===q.taskId)!;return overlap?<TeamQuestion key={q.id} q={q} t={task} s={s} me={me} act={act} demoMode={demoMode} expanded={expandedId===q.id} onToggle={()=>setExpandedId(id=>id===q.id?null:q.id)}/>:<InboxQuestion key={q.id} q={q} t={task} s={s} me={me} act={act} demoMode={demoMode}/>;})}
    </section>)}
  </>;
}
function TeamQuestion({q,t,s,me,act,demoMode,expanded,onToggle}:{q:Question;t:Task;s:State;me:Person;act:Act;demoMode:boolean;expanded:boolean;onToggle:()=>void}){
  const [answers,setAnswers]=useState(['']);
  const [nominees,setNominees]=useState(pendingNomineesFor(q));
  const [picking,setPicking]=useState(false);
  const [saving,setSaving]=useState(false);
  const [usedSuggestion,setUsedSuggestion]=useState(false);
  const suggestion=suggestAnswer(t,q.text);
  const choices=nominationCandidates(s,t);
  const hasAnswer=Boolean(answers[0].trim());
  const hasExtra=answers.slice(1).some(text=>text.trim());
  function editAnswer(index:number,text:string){
    setAnswers(old=>old.map((answer,i)=>i===index?text:answer));
    if(index===0&&!text.trim())setUsedSuggestion(false);
  }
  return <article className="question-row inbox-question team-question">
    <h3 className="team-question-title"><button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={`team-editor-${q.id}`}>
      <span><strong>{q.text}</strong><small>{t.text}</small></span>
      <span className="team-question-toggle"><Chip tone={q.raised?'orange':'amber'}>Awaiting your reply</Chip><ChevronDown size={18}/></span>
    </button></h3>
    <div id={`team-editor-${q.id}`} hidden={!expanded} className="team-question-editor">
    <form onSubmit={async e=>{
      e.preventDefault();
      if(saving||(!hasAnswer&&(!nominees.length||hasExtra)))return;
      setSaving(true);
      try{await act('questions/'+q.id+'/team-reply',{actorId:me.id,answers,nomineeIds:nominees,approvedSuggestion:usedSuggestion});}
      finally{setSaving(false);}
    }}>
      <div className="question-nominations">
        <div className="nomination-row">
          <strong><Users size={15}/> Nominees</strong>
          {nominees.map(id=><span key={id} className="chip human nominee-chip">{getPersona(s,id).name}<button type="button" aria-label={`Remove ${getPersona(s,id).name} from nominees`} disabled={saving} onClick={()=>setNominees(old=>toggleId(old,id))}><X size={13}/></button></span>)}
          <button type="button" className="button small" aria-expanded={picking} onClick={()=>setPicking(!picking)}><Plus size={14}/>Nominate</button>
        </div>
        {picking&&<NomineePicker people={choices} selected={nominees} disabled={saving} onToggle={id=>setNominees(old=>toggleId(old,id))}/>}
      </div>
      <div className="question-answers">
        {!usedSuggestion&&!hasAnswer&&<section className="context-suggestion suggested-answer"><h4><Sparkles size={14}/> System-suggested answer</h4><p>{suggestion}</p><Button className="small" onClick={()=>{editAnswer(0,suggestion);setUsedSuggestion(true);}}><Check size={14}/>Use as answer 1</Button></section>}
        {answers.map((text,index)=><div className="field" key={index}>
          <label htmlFor={`team-answer-${q.id}-${index}`}>Answer {index+1}</label>
          <div className="editor context-editor"><textarea id={`team-answer-${q.id}-${index}`} rows={2} value={text} onChange={e=>editAnswer(index,e.target.value)} disabled={saving}/><div className="editor-tools"><Dictate context="answer" demoMode={demoMode} onText={value=>editAnswer(index,value)}/></div></div>
        </div>)}
        <div className="row spread wrap"><Button className="small" onClick={()=>setAnswers(old=>[...old,''])} disabled={saving||!answers.at(-1)?.trim()}><Plus size={14}/>Add answer {answers.length+1}</Button><Button kind="primary" type="submit" disabled={saving||(!hasAnswer&&(!nominees.length||hasExtra))}><Send size={14}/>{hasAnswer?'Send reply':'Confirm nominations'}</Button></div>
      </div>
    </form>
    {q.history.length>0&&<details className="team-question-history"><summary>Question history</summary><ul className="mini-trail">{q.history.map((h,i)=><li key={i}><span>{shortTime(h.at)} IST · {h.byId?getPersona(s,h.byId).name+' · ':''}{h.event}</span>{h.note&&<span>{h.note}</span>}</li>)}</ul></details>}
    </div>
  </article>;
}
function InboxQuestion({q,t,s,me,act,demoMode}:{q:Question;t:Task;s:State;me:Person;act:Act;demoMode:boolean}){
  const [editing,setEditing]=useState(false);
  const [decline,setDecline]=useState(false);
  const [note,setNote]=useState('');
  const badge=qState(q,s);
  const followup=isResolved(q)&&nominationOpen(q,me.id);
  async function saveReply(text:string){
    const result=await act('questions/'+q.id+'/answer',{actorId:me.id,text});
    if(result)setEditing(false);
    return result;
  }
  return <article className="question-row inbox-question">
    <div className="row spread align-top"><div><div className="eyebrow">{types[t.type]}</div><h3>{q.text}</h3></div><Chip tone={q.raised?'orange':badge.tone}>{q.raised?'Raised question':badge.label}</Chip></div>
    <p className="reason">{t.text}</p>
    <PersonTag p={getPersona(s,t.assigneeId)} now={s.now}/>
    {followup&&<div className="answer-followup"><span className="eyebrow">Existing answer · {getPersona(s,q.answeredById??t.assignerId).name}</span><p>{q.answer}</p></div>}
    {q.history.length>0&&<ul className="mini-trail">{q.history.map((h,i)=><li key={i}><span>{shortTime(h.at)} IST · {h.byId?getPersona(s,h.byId).name+' · ':''}{h.event}</span>{h.note&&<span className={h.event==='Earlier answer'?'old-answer':''}>{h.note}</span>}</li>)}</ul>}
    <div className="row question-actions">
      <Button className="small" onClick={()=>{setEditing(!editing);setDecline(false);}}><MessageSquare size={14}/>{editing?'Cancel':followup?'Add follow-up':'Answer'}</Button>
      <Button className="small" kind="plain" onClick={()=>{setDecline(!decline);setEditing(false);}}>Can’t help</Button>
    </div>
    {editing&&<AnswerForm label={followup?'Save follow-up':'Save answer'} demoMode={demoMode} context={/definition/i.test(q.text)?'definition':'answer'} onSave={saveReply}/>}
    {decline&&<form className="row missing-form" onSubmit={e=>{e.preventDefault();void act('questions/'+q.id+'/cant-help',{actorId:me.id,note});}}><input aria-label="Reason the nominee can’t help" placeholder="Add context (optional)" value={note} onChange={e=>setNote(e.target.value)}/><Button type="submit" kind="primary">{followup||pendingNomineesFor(q).length>1?'Decline nomination':'Send to manager'}</Button></form>}
  </article>;
}
function Acceptance({s,pending,me,act,open}:{s:State;pending:Task[];me:Person;act:Act;open:(id:string)=>void}){
  const [accepted,setAccepted]=useState('');
  const recent=s.tasks.find(t=>t.id===accepted&&t.status==='accepted');
  return <><Title title="Awaiting acceptance" description="Review submitted work and close the handoff."/>
    {recent&&<><div className="banner green"><CheckCircle2 size={18}/><span>Accepted work from {getPersona(s,recent.assigneeId).name}.</span></div><ConfirmRating s={s} t={recent} me={me} act={act}/></>}
    <section className="panel">{pending.length?pending.sort((a,b)=>(b.acceptanceRequestedAt??'').localeCompare(a.acceptanceRequestedAt??'')).map(t=><AcceptanceRow key={t.id} t={t} s={s} act={act} open={()=>open(t.id)} onAccepted={()=>setAccepted(t.id)}/>):<Empty icon={FileCheck2}>There’s no work waiting for acceptance.</Empty>}</section>
  </>;
}
function AcceptanceRow({t,s,act,open,onAccepted}:{t:Task;s:State;act:Act;open:()=>void;onAccepted:()=>void}){
  return <article className="question-row"><div className="row spread align-top"><div><button className="text-link task-open" onClick={open}>{t.text}</button><div className="reason">{types[t.type]} · Requested {dateTime(t.acceptanceRequestedAt!)}</div></div><PersonTag p={getPersona(s,t.assigneeId)} now={s.now}/></div>
    {t.acceptanceNote&&<p className="answer-text">{t.acceptanceNote}</p>}
    <AcceptanceActions taskId={t.id} act={act} onAccepted={onAccepted}/>
  </article>;
}
function AcceptanceActions({taskId,act,onAccepted}:{taskId:string;act:Act;onAccepted?:()=>void}){
  const [sendingBack,setSendingBack]=useState(false);
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  async function decide(action:'accept'|'send-back'){
    if(saving)return;
    setSaving(true);
    try{if(await act('tasks/'+taskId+'/'+action,{reason})&&action==='accept')onAccepted?.();}
    finally{setSaving(false);}
  }
  return <>
    <div className="row question-actions wrap"><Button kind="primary" disabled={saving} onClick={()=>void decide('accept')}><Check size={16}/>Accept</Button><Button disabled={saving} onClick={()=>setSendingBack(!sendingBack)}>Send back</Button></div>
    {sendingBack&&<form className="row missing-form" onSubmit={e=>{e.preventDefault();if(reason.trim())void decide('send-back');}}><input aria-label="Send-back reason" placeholder="What needs to change?" value={reason} onChange={e=>setReason(e.target.value)}/><Button kind="primary" type="submit" disabled={!reason.trim()||saving}>Send back with reason</Button></form>}
  </>;
}
function People({s,team}:{s:State;team:string}){
  const [query,setQuery]=useState('');
  const [teamFilter,setTeamFilter]=useState(team);
  const search=query.trim().toLowerCase();
  const people=s.people.filter(p=>(!teamFilter||p.teamId===teamFilter)&&`${p.name} ${p.title}`.toLowerCase().includes(search));
  return <div className="workspace-catalog">
    <Title title="People & profiles" description="Find teammates, see their working hours, and learn what they typically ask or answer."/>
    <div className="catalog-toolbar">
      <label className="field"><span>Find a teammate</span><input type="search" placeholder="Search by name or role…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label className="field"><span>Team</span><span className="select-field"><select value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option value="">All teams</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><ChevronDown size={14}/></span></label>
      <p role="status">{people.length} {people.length===1?'teammate':'teammates'}</p>
    </div>
    {people.length?teams.map(group=>{
      const visible=people.filter(p=>p.teamId===group.id);
      if(!visible.length)return null;
      return <section className="org-chart" key={group.id} aria-label={`${group.name} reporting hierarchy`}>
        <h2>{group.name} <small>Demo reporting structure</small></h2>
        {Object.entries(roleLevels).map(([level,label])=>{
          const members=visible.filter(p=>roleLevel(p)===level);
          if(!members.length)return null;
          return <section className="profile-level" data-level={level} key={level} aria-labelledby={`profile-level-${group.id}-${level}`}>
            <h3 id={`profile-level-${group.id}-${level}`}>{label} <small>{members.length}</small></h3>
            <div className="people-grid">{members.map(p=><PersonProfile key={p.id} p={p} s={s}/>)}</div>
          </section>;
        })}
      </section>;
    }):<section className="panel"><Empty icon={Users}>No teammates match these filters.</Empty></section>}
  </div>;
}
function PersonProfile({p,s}:{p:Person;s:State}){
  const stats=profile(s,p.id);
  return <article className="panel workspace-profile">
    <div className="profile-identity">
      <Avatar p={p}/>
      <div><h3>{p.name}</h3><p>{roleLabel(p)} · {teams.find(t=>t.id===p.teamId)?.name}</p></div>
      <Chip tone={onShift(p,s.now)?'green':''}>{onShift(p,s.now)?'On shift':'Off shift'}</Chip>
    </div>
    <div className="profile-shift"><Clock3 size={16}/><div><strong>{p.workStart}–{p.workEnd}</strong><small>{zone(s.now,p.timeZone,'zzz')} · {p.timeZone.replaceAll('_',' ')}</small></div></div>
    <details className="profile-details">
      <summary aria-label={`Question history for ${p.name}`}><span>Question history <small>· {stats.awaiting.reduce((total,topic)=>total+topic.count,0)} awaiting reply</small></span><ChevronDown size={15}/></summary>
      <div className="profile-history">
        {p.canReceive&&stats.work.length>0&&<section><h4>Common assignments</h4><div className="row wrap">{stats.work.slice(0,3).map(x=><Chip key={x.label}>{types[x.label as TaskType]}</Chip>)}</div></section>}
        <ProfileTopics title="Questions they answer most" topics={stats.answered.slice(0,3)} verb="answered" empty="No recorded answers."/>
        <ProfileTopics title="Questions awaiting their reply" topics={stats.awaiting} verb="awaiting" empty="No questions awaiting their reply."/>
        {p.canReceive&&<ProfileTopics title="Questions they ask most" topics={stats.asked.slice(0,3)} verb="asked" empty="No recorded questions."/>}
      </div>
      {p.canReceive&&<div className="profile-summary"><span><b>{stats.taskCount}</b> tasks assigned</span><span>{stats.submittedCount?<><b>{percent(stats.sentBackRate)}</b> of submitted tasks sent back</>:'No submitted tasks yet'}</span></div>}
    </details>
  </article>;
}
function ProfileTopics({title,topics,verb,empty}:{title:string;topics:{label:string;count:number}[];verb:'asked'|'answered'|'awaiting';empty:string}){
  return <section className={`profile-topics ${verb}`}><h4>{title}</h4>
    {topics.length?<ul>{topics.map(topic=><li key={topic.label}><span>{topic.label}</span><small>{verb==='awaiting'?`${topic.count} pending`:`${verb==='asked'?'Asked':'Answered'} ${topic.count} ${topic.count===1?'time':'times'}`}</small></li>)}</ul>:<p>{empty}</p>}
  </section>;
}
const frequencyGroups=[
  {id:'frequent',label:'Frequently asked',minimum:7,range:'7 or more times'},
  {id:'occasional',label:'Moderately frequent',minimum:3,range:'3–6 times'},
  {id:'rare',label:'Rarely asked',minimum:0,range:'0–2 times'},
] as const;
function Library({s,team}:{s:State;team:string}){
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('');
  const [limits,setLimits]=useState<Record<string,number>>({});
  const filtered=librarySearch(s,team,query.trim()).filter(e=>!filter||e.taskType===filter).sort((a,b)=>b.askedCount-a.askedCount||b.reuseCount-a.reuseCount);
  return <div className="workspace-catalog">
    <Title title="Answer library" description="Browse saved answers by how often teammates actually asked the question."/>
    <div className="catalog-toolbar">
      <label className="field"><span>Find an answer</span><input type="search" placeholder="Search questions, answers, or teammates…" value={query} onChange={e=>{setQuery(e.target.value);setLimits({});}}/></label>
      <label className="field"><span>Task type</span><span className="select-field"><select value={filter} onChange={e=>{setFilter(e.target.value);setLimits({});}}><option value="">All task types</option>{Object.entries(types).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><ChevronDown size={14}/></span></label>
      <p role="status">{filtered.length} {filtered.length===1?'answer':'answers'}</p>
    </div>
    {filtered.length?frequencyGroups.map((group,index)=>{
      const entries=filtered.filter(e=>e.askedCount>=group.minimum&&(index===0||e.askedCount<frequencyGroups[index-1].minimum));
      if(!entries.length)return null;
      const limit=limits[group.id]??6;
      return <section className="library-frequency" data-frequency={group.id} key={group.id} aria-labelledby={`frequency-${group.id}`}>
        <h2 id={`frequency-${group.id}`}>{group.label} <small>{group.range}</small></h2>
        <div className="answer-catalog-grid">{entries.slice(0,limit).map(e=><article className="panel answer-catalog-card" data-type={e.taskType} key={e.id}>
          <header><span className="answer-type"><BookOpen size={14}/>{types[e.taskType]}</span><h3>{e.question}</h3></header>
          <p className="answer-text">{e.answer}</p>
          <footer><span className="answer-author">Answered by <strong>{getPersona(s,e.answeredById).name}</strong></span><span className="row wrap"><Chip tone="plum">Asked {e.askedCount} {e.askedCount===1?'time':'times'}</Chip><Chip tone={e.reuseCount?'green':''}>Reused {e.reuseCount} {e.reuseCount===1?'time':'times'}</Chip></span></footer>
        </article>)}</div>
        {entries.length>limit&&<div className="catalog-more"><Button onClick={()=>setLimits(old=>({...old,[group.id]:limit+6}))}>Show more {group.id==='frequent'?'frequent':group.id==='occasional'?'moderately frequent':'rare'} questions <ChevronDown size={15}/></Button></div>}
      </section>;
    }):<section className="panel"><Empty icon={BookOpen}>No answers match these filters.</Empty></section>}
  </div>;
}
const percent=(v:number|null)=>v===null?'—':Math.round(v*100)+'%';
const decimal=(v:number|null,d=1)=>v===null?'—':v.toFixed(d);
function Metrics({s,team}:{s:State;team:string}){
  const [period,setPeriod]=useState<'compare'|'first'|'second'|'custom'>('compare');
  const [from,setFrom]=useState(s.weeks[0].from);
  const lastCompleteDay=shiftDay(dayKey(s.now),-1);
  const [to,setTo]=useState(lastCompleteDay);
  const [weekOne,weekTwo]=s.weeks;
  const first=metrics(s,team,weekOne.from,weekOne.to);
  const second=metrics(s,team,weekTwo.from,weekTwo.to);
  const dateRange=(start:string,end:string)=>`${zone(localAtFor(start),IST,'d MMM')}–${zone(localAtFor(end),IST,'d MMM yyyy')}`;
  const firstLabel=`Week 1 · ${dateRange(weekOne.from,weekOne.to)}`;
  const secondLabel=`Week 2 · ${dateRange(weekTwo.from,weekTwo.to)}`;
  const validRange=!!from&&!!to&&from<=to&&to<=lastCompleteDay&&Date.parse(to)-Date.parse(from)<93*86400000;
  const custom=period==='custom'&&validRange?metrics(s,team,from,to):undefined;
  const primary=period==='first'?first:period==='custom'?custom:second;
  const compare=period==='compare';
  const primaryLabel=period==='first'?firstLabel:period==='custom'?(validRange?dateRange(from,to):'Custom dates'):secondLabel;
  const daily=compare?[...first.daily,...second.daily]:primary?.daily??[];
  const max=Math.max(8,...daily.map(d=>d.hours??0));
  const chartWidth=Math.max(600,daily.length*33);
  const left=34,right=14,top=15,bottom=126;
  const plot=daily.map((d,i)=>({...d,x:left+(chartWidth-left-right)*(daily.length<=1?.5:i/(daily.length-1)),y:d.hours===null?bottom:bottom-(bottom-top)*d.hours/max}));
  const groups=compare?[plot.slice(0,first.daily.length),plot.slice(first.daily.length)]:[plot];
  const value=(m:typeof first|undefined,fn:(m:typeof first)=>string)=>m?fn(m):'—';
  const rows:[string,string,(m:typeof first)=>string][]=[
    ['User','Tasks with no follow-up questions',m=>percent(m.clarification)],['User','Additional questions per task',m=>decimal(m.additional,2)],['User','Pre-answer rate',m=>percent(m.preanswer)],['User','Handoff satisfaction',m=>percent(m.satisfaction)],
    ['Business','Tasks completed',m=>String(m.completed)],['Business','Tasks per billable hour',m=>decimal(m.throughput,3)],
    ['Guardrails','Rework rate',m=>percent(m.rework)],['Guardrails','Out-of-hours messages',m=>String(m.out)],['Guardrails','Manager time in the tool',m=>decimal(m.manager)+' min · '+(m.managerShare===null?'—':(m.managerShare*100).toFixed(1)+'% of shift hours')],
    ['Diagnostics','Answer helpfulness',m=>m.helpful===null?'—':`${percent(m.helpful)} · ${m.helped} helped, ${m.didntHelp} didn’t help`],['Diagnostics','Questions removed / added',m=>m.removed+' / '+m.custom],
  ];
  return <><Title title="Handoff metrics" description="Compare two weeks of demo handoff activity or choose a date range."><label className="select-field compact"><select aria-label="Metrics period" value={period} onChange={e=>setPeriod(e.target.value as typeof period)}><option value="compare">Compare both weeks</option><option value="first">{firstLabel}</option><option value="second">{secondLabel}</option><option value="custom">Custom dates</option></select><ChevronDown size={14}/></label></Title>
    {period==='custom'&&<div className="row range-controls"><label>From <input type="date" max={lastCompleteDay} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To <input type="date" max={lastCompleteDay} value={to} onChange={e=>setTo(e.target.value)}/></label>{!validRange&&<span className="muted">Choose up to 93 completed days.</span>}</div>}
    <section className="panel chart-panel"><div className="panel-head"><span className="icon-square"><Activity size={17}/></span><div><h2>Working hours to acceptance</h2><p>Average assignee working time from assignment to accepted work.</p></div></div>
      <div className="chart-metrics">{compare&&<div><Chip tone="amber">{firstLabel}</Chip><strong>{decimal(first.north)} <small>hrs</small></strong></div>}<div><Chip tone={period==='first'?'amber':'green'}>{primaryLabel}</Chip><strong>{decimal(primary?.north??null)} <small>hrs</small></strong></div></div>
      {plot.length>0&&<div className="plot-scroll"><svg className="plot" width="100%" viewBox={`0 0 ${chartWidth} 155`} role="img" aria-label="Daily working hours to acceptance">
        {[0,.25,.5,.75,1].map(p=><g key={p}><line x1={left} y1={bottom-(bottom-top)*p} x2={chartWidth-right} y2={bottom-(bottom-top)*p}/><text x={left-8} y={bottom-(bottom-top)*p+4} textAnchor="end">{Math.round(max*p)}h</text></g>)}
        {groups.map((g,idx)=><g key={idx} className={period==='first'||compare&&idx===0?'plot-period-first':'plot-period-second'}>{contiguousDays(g).filter(run=>run.length>1).map(run=><polyline key={run[0].date} points={run.map(d=>d.x+','+d.y).join(' ')}/>)}{g.filter(d=>d.hours!==null).map(d=><circle key={d.date} cx={d.x} cy={d.y} r="4"><title>{d.date} · {decimal(d.hours)}h</title></circle>)}</g>)}
        {plot.filter((_,i)=>i%Math.max(1,Math.ceil(plot.length/14))===0).map(d=><text key={d.date} x={d.x} y="148" textAnchor="middle">{zone(localAtFor(d.date),IST,'d MMM')}</text>)}
      </svg></div>}
    </section>
    <section className="panel metric-table"><div className="panel-head"><h2>Handoff performance</h2></div><table><thead><tr><th>Metric</th>{compare&&<th>{firstLabel}</th>}<th>{primaryLabel}</th></tr></thead><tbody>{rows.map(([category,label,fn],i)=><tr key={label}><td>{(i===0||category!==rows[i-1][0])&&<small>{category}</small>}{label}</td>{compare&&<td>{fn(first)}</td>}<td>{value(primary,fn)}</td></tr>)}</tbody></table><p className="table-note">Metrics use completed days in IST. The week-to-week comparison uses simulated data and seeded shift schedules.</p></section>
  </>;
}
function localAtFor(day:string){return day+'T12:00:00Z';}

function Settings({s,team,act,demoMode,setDemoMode,onReset,showApi}:{s:State;team:string;act:Act;demoMode:boolean;setDemoMode:(value:boolean)=>void;onReset:()=>void;showApi:()=>void}){
  const [personId,setPersonId]=useState(s.people.find(p=>p.teamId===team)?.id??'');
  const person=s.people.find(p=>p.id===personId&&p.teamId===team)??s.people.find(p=>p.teamId===team)!;
  return <><Title title="Settings" description="Manage demo preferences and teammate working hours."/>
    <section className="panel">
      <div className="panel-head"><span className="icon-square"><Settings2 size={17}/></span><div><h2>Demo preferences</h2><p>Settings apply to this browser.</p></div></div>
      <div className="settings-line"><div><h3>Question predictions</h3><p>Headstart predicts clarifying questions for every new task.</p></div><Chip tone="green">Always on</Chip></div>
      <Toggle title="Show Slack-style previews" description="Change how notifications look under the bell in Headstart. This is a preview inside Headstart only." checked={s.slack} onChange={enabled=>void act('settings/slack',{enabled},'PUT')}/>
      <div className="notification-preview">
        <span className="eyebrow">Example notification</span>
        <div className={`notification-row ${s.slack?'slack':''}`}><span className="notification-dot"><i/></span><div>{s.slack&&<SlackAttribution/>}A task is ready for your review.<small>Just now</small></div></div>
      </div>
      <Toggle title="Use demo dictation" description="Insert a sample transcript when you use dictation during the walkthrough. The sample uses no microphone." checked={demoMode} onChange={setDemoMode}/>
    </section>
    <section className="panel"><div className="panel-head spread"><div><h2>People and working hours</h2><p>Times are entered in each person’s local time zone.</p></div><label className="select-field compact"><select aria-label="Select person to edit" value={person.id} onChange={e=>setPersonId(e.target.value)}>{s.people.filter(p=>p.teamId===team).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><ChevronDown size={14}/></label></div><HoursForm key={person.id} person={person} act={act}/></section>
    <section className="panel"><div className="settings-line"><div><h3>API reference</h3><p>View the endpoints behind the prototype.</p></div><Button onClick={showApi}><Code2 size={16}/>View API</Button></div><div className="settings-line"><div><h3>Reset demo data</h3><p>Restore the sample profiles, library, and task history.</p></div><Button onClick={onReset}><RotateCcw size={16}/>Reset demo data</Button></div></section>
  </>;
}
function SlackAttribution(){
  return <b className="slack-name">Headstart <Chip>APP</Chip></b>;
}
function Toggle({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:(v:boolean)=>void}){
  return <label className="settings-line"><span><strong>{title}</strong><small>{description}</small></span><span className="switch"><input type="checkbox" role="switch" aria-label={title} checked={checked} onChange={e=>onChange(e.target.checked)}/><i/></span></label>;
}
function HoursForm({person,act}:{person:Person;act:Act}){
  const [start,setStart]=useState(person.workStart),[end,setEnd]=useState(person.workEnd),[tz,setTz]=useState(person.timeZone);
  const [saved,setSaved]=useState(false);
  return <form className="list-padding hours-form" onSubmit={async e=>{e.preventDefault();setSaved(!!await act('settings/people/'+person.id,{workStart:start,workEnd:end,timeZone:tz},'PUT'));}}>
    <label className="field"><span>Time zone</span><input required value={tz} onChange={e=>{setTz(e.target.value);setSaved(false);}}/></label><label className="field"><span>Starts</span><input type="time" required value={start} onChange={e=>{setStart(e.target.value);setSaved(false);}}/></label><label className="field"><span>Ends</span><input type="time" required value={end} onChange={e=>{setEnd(e.target.value);setSaved(false);}}/></label><Button type="submit" kind="primary">Save hours</Button>{saved&&<Chip tone="green">Saved</Chip>}
  </form>;
}
function ApiReference({back}:{back:()=>void}){
  return <><button className="link-button back" onClick={back}><ArrowLeft size={15}/>Settings</button><Title title="API reference" description="Next.js endpoints for prediction, scheduling, context, and acceptance."/><section className="panel api-table">{endpoints.map(([method,path,description])=><div className="api-row" key={method+path}><Chip tone={method==='GET'?'blue':'green'}>{method}</Chip><code>{path}</code><span>{description}</span></div>)}</section></>;
}
