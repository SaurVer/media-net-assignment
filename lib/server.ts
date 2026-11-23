import {ensurePredictionHistory,seed} from '../data/seed';
import {mutate,read} from './engine';
import {demoTask,types,type State} from './model';
import {predict} from './predict';

const sessions=new Map<string,State>();
const demoAnswers:Record<string,string> = {
  output:'Share one slide with a headline, a platform breakdown chart, and three bullets on the likely drivers. Link the working query beneath it.',
  priority:'Pick this up after the daily quality checks. Share an initial read before the 18:00 overlap.',
  definition:'Use clicks divided by searches that returned at least one result. Count unique search IDs and exclude bots and test traffic.',
  question:'Should we use the new platform split for this analysis?',
};
export function mockTranscript(context:string) {
  if(context==='task')return demoTask;
  if(context==='growth')return 'Draft a campaign brief for re-engaging lapsed publishers ahead of Diwali.';
  return demoAnswers[context]??'Use the last complete week and include a brief note on any exclusions so we can review the cut together.';
}
async function language(prompt:string){
  const key=process.env.ANTHROPIC_API_KEY||process.env.OPENAI_API_KEY;
  if(!key)return undefined;
  const anthropic=Boolean(process.env.ANTHROPIC_API_KEY);
  try{
    const response=await fetch(anthropic?'https://api.anthropic.com/v1/messages':'https://api.openai.com/v1/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(6500),headers:{'content-type':'application/json',...(anthropic?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{authorization:'Bearer '+key})},
      body:JSON.stringify({model:anthropic?(process.env.ANTHROPIC_MODEL||'claude-haiku-4-5'):(process.env.OPENAI_MODEL||'gpt-4.1-mini'),max_tokens:500,messages:[{role:'user',content:prompt}]}),
    });
    if(!response.ok)return undefined;
    const result=await response.json();
    return (anthropic?result.content?.[0]?.text:result.choices?.[0]?.message?.content) as string|undefined;
  }catch{return undefined;}
}
async function speech(audio:Blob){
  const key=process.env.STT_API_KEY||process.env.OPENAI_API_KEY;
  if(!key)return undefined;
  const data=new FormData();
  data.set('file',audio,audio instanceof File?audio.name:'recording.webm');
  data.set('model',process.env.STT_MODEL||'whisper-1');
  try{
    const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{authorization:'Bearer '+key},body:data,signal:AbortSignal.timeout(12000)});
    if(response.ok)return (await response.json()).text as string|undefined;
  }catch{return undefined;}
}
export async function handleApi(request:Request,path:string[]) {
  const url=new URL(request.url);
  const method=request.method;
  try{
    if(path[0]==='transcribe'){
      if(method!=='POST')return Response.json({error:'Use POST.'},{status:405});
      let transcript:string|undefined, context='task';
      if(request.headers.get('content-type')?.includes('multipart/form-data')){
        const form=await request.formData();
        context=String(form.get('context')??context);
        const audio=form.get('audio');
        if(audio instanceof Blob&&audio.size>0&&audio.size<=12_000_000)transcript=await speech(audio);
        transcript||=String(form.get('transcript')??'').trim();
      }else{
        const body=await request.json().catch(()=>({}));
        transcript=typeof body.transcript==='string'?body.transcript.trim():undefined;
        if(typeof body.context==='string')context=body.context;
      }
      const mode=transcript?'transcribed':'demo';
      const tidy=transcript?await language('Clean up this dictation. Preserve the meaning and all domain terms. Return only the transcript. Input: '+JSON.stringify(transcript.slice(0,5000))):undefined;
      return Response.json({text:tidy||transcript||mockTranscript(context),mode});
    }
    const input=method==='GET'?{}:await request.json().catch(()=>({}));
    const session=request.headers.get('x-headstart-session')??'';
    const cached=/^[a-f0-9-]{36}$/i.test(session)?sessions.get(session):undefined;
    const s:State=input.state??(cached?structuredClone(cached):seed());
    ensurePredictionHistory(s);
    if(method==='GET')return Response.json(read(s,path,url.searchParams),{headers:{'Cache-Control':'no-store'}});
    if(!['POST','PUT','DELETE'].includes(method))return Response.json({error:'Method not allowed.'},{status:405});
    if(path[0]==='tasks'&&path[2]==='predict'&&input.more!==true&&(process.env.ANTHROPIC_API_KEY||process.env.OPENAI_API_KEY)){
      const t=s.tasks.find(t=>t.id===path[1]);
      if(t&&!t.sentAt){
        if(typeof input.type!=='string'){
          const raw=await language('Classify this task. Reply with just one of '+Object.keys(types).join(', ')+'. Task: '+JSON.stringify(t.text.slice(0,1800)));
          const found=Object.keys(types).find(x=>raw?.trim().replace(/[`"']/g,'')===x);
          if(found)input.type=found;
        }
        const labels=predict(s,{...t,type:Object.hasOwn(types,String(input.type))?input.type:t.type}).map(q=>q.text);
        const raw=await language('Return a JSON object mapping each input question to a concise version for the task. Preserve intent and do not answer them. Task: '+JSON.stringify(t.text.slice(0,1800))+' Questions: '+JSON.stringify(labels));
        try{const parsed=JSON.parse(raw?.replace(/^```(?:json)?\s*|\s*```$/g,'')??'{}');input.phrases=Object.fromEntries(Object.entries(parsed).filter(([key,v])=>labels.includes(key)&&typeof v==='string'&&v.length<250));}catch{}
      }
    }
    const data=mutate(s,path,method,input);
    const state=data&&typeof data==='object'&&'reset' in data?data.reset??s:s;
    if(/^[a-f0-9-]{36}$/i.test(session)){
      if(sessions.size>=12&&!sessions.has(session))sessions.delete(sessions.keys().next().value!);
      sessions.set(session,state);
    }
    return Response.json({state,data});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'The action could not be completed.'},{status:400});
  }
}
