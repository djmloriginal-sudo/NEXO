import {useEffect,useRef,useState} from 'react'
import {SPECIALISTS,byId,recommend,type Specialist} from './lib/specialists'
import {ai,classify,type Ranking} from './lib/ai'
import {loadJobs,saveJobs,type Job} from './lib/store'

function Timer(){const [s,setS]=useState(0);useEffect(()=>{const i=setInterval(()=>setS(x=>x+1),1000);return()=>clearInterval(i)},[]);return <>{s}s</>}
type View='home'|'need'|'pick'|'work'|'jobs'
const when=(t:number)=>{const d=Math.floor((Date.now()-t)/864e5);return d<1?'hoje':d===1?'ontem':`há ${d} dias`}

export default function App(){
  const [view,setView]=useState<View>('home')
  const [need,setNeed]=useState('')
  const [jobs,setJobs]=useState<Job[]>(loadJobs)
  const [cur,setCur]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [text,setText]=useState('')
  const [ranking,setRanking]=useState<Ranking|null>(null)
  const goPick=()=>{setRanking(null);setView('pick');classify(need).then(setRanking)}
  const end=useRef<HTMLDivElement>(null)
  useEffect(()=>saveJobs(jobs),[jobs])
  const job=jobs.find(j=>j.id===cur)
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'})},[job?.messages.length,busy])
  const upd=(id:string,p:Partial<Job>)=>setJobs(js=>js.map(j=>j.id===id?{...j,...p}:j))

  async function step(j:Job,userText?:string){
    const msgs=userText?[...j.messages,{role:'user' as const,text:userText}]:j.messages
    upd(j.id,{messages:msgs});setBusy(true)
    try{
      const r=await ai.reply({s:byId(j.spId),need:j.need,memory:j.memory,history:msgs,sources:[]})
      upd(j.id,{messages:[...msgs,r.msg],memory:{...j.memory,...r.memory},status:r.msg.kind==='result'?'Entregue':'Em andamento',updated:Date.now()})
    }catch(e){
      upd(j.id,{messages:[...msgs,{role:'pro',kind:'text',text:'Não consegui responder agora: '+(e instanceof Error?e.message:'erro desconhecido')+'. Envie a mensagem de novo.'}]})
    }finally{setBusy(false)}
  }
  function start(s:Specialist,n:string,memory:Record<string,string>={}){
    const j:Job={id:crypto.randomUUID(),title:n.slice(0,48)||s.name,spId:s.id,need:n,status:'Em andamento',updated:Date.now(),messages:[],memory:{Pedido:n,...memory}}
    setJobs(js=>[j,...js]);setCur(j.id);setView('work');step(j)
  }
  const send=()=>{if(!job||!text.trim()||busy)return;const t=text.trim();setText('');step(job,t)}

  return <div className="app">
    <header className="top">
      <button className="logo" onClick={()=>setView('home')}>NEXO</button>
      <button className="link" onClick={()=>setView('jobs')}>Meus trabalhos{jobs.length>0&&<b>{jobs.length}</b>}</button>
    </header>

    {view==='home'&&<main className="hero">
      <h1>O profissional que você precisa, quando precisa.</h1>
      <p className="sub">Explique o que você quer fazer. O NEXO encontra o especialista certo e trabalha com você para chegar ao resultado.</p>
      <button className="cta" onClick={()=>setView('need')}>Começar agora</button>
      <p className="hint">Não sabe por onde começar? Só explique o que você precisa.</p>
      <div className="roster">{SPECIALISTS.map(s=><span key={s.id} title={s.tagline}>{s.emoji} {s.name}</span>)}</div>
    </main>}

    {view==='need'&&<main className="narrow">
      <h2>O que você precisa fazer?</h2>
      <p className="sub">Explique do seu jeito. Você não precisa saber exatamente por onde começar.</p>
      <textarea autoFocus value={need} onChange={e=>setNeed(e.target.value)} placeholder="Ex.: Quero começar a vender roupas pela internet, mas não sei como divulgar."/>
      <div className="row"><button className="cta" disabled={need.trim().length<8} onClick={goPick}>Continuar</button>
      <span className="muted">Voz: em breve</span></div>
    </main>}

    {view==='pick'&&(()=>{if(!ranking)return <main className="narrow"><div className="skel"/><p className="muted">Analisando seu pedido…</p></main>;const [top,...rest]=ranking.list;return <main className="narrow">
      <p className="muted">Profissional recomendado</p>
      <div className="pro big"><div className="emoji">{top.s.emoji}</div>
        <div><h3>{top.s.name}</h3><p>{ranking.why||`Para o que você descreveu, é o melhor ponto de partida: ${top.s.tagline.toLowerCase()}.`}</p>
        <small className="muted">{ranking.src==='ia'?'Análise da IA':'Estimativa local por palavras-chave (IA indisponível)'} · {top.pct}%</small></div></div>
      <button className="cta" onClick={()=>start(top.s,need)}>Começar</button>
      <p className="muted">Ou escolha outro:</p>
      {rest.map(x=><button key={x.s.id} className="pro" onClick={()=>start(x.s,need)}><span className="emoji">{x.s.emoji}</span><span>{x.s.name}</span><em>{x.pct}%</em></button>)}
      <button className="link" onClick={()=>setView('need')}>Editar meu pedido</button>
    </main>})()}

    {view==='work'&&job&&(()=>{const s=byId(job.spId);const last=job.messages[job.messages.length-1]
      return <main className="work">
      <div className="who"><span className="emoji">{s.emoji}</span><strong>{s.name.toUpperCase()}</strong>
        <small className="muted">{ai.live?'IA real':'modo demonstração'} · pesquisa web sob demanda</small></div>
      <div className="memory">{Object.entries(job.memory).map(([k,v])=><span key={k} title={v}><b>{k}:</b> {v.slice(0,40)}{v.length>40?'…':''}</span>)}</div>
      <div className="thread">
        {job.messages.map((m,i)=><div key={i} className={'msg '+m.role+(m.kind==='result'?' result':'')}>{m.text}{m.sources&&m.sources.length>0&&<div className="srcs"><b>Fontes consultadas</b>{m.sources.filter(x=>/^https?:\/\//.test(x.url)).map(x=><a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a>)}</div>}
          {m.kind==='result'&&<button className="link" onClick={()=>navigator.clipboard.writeText(m.text)}>Copiar</button>}</div>)}
        {busy&&<div className="msg pro typing"><i/><i/><i/><span className="secs">Pensando… <Timer/></span></div>}
        {!busy&&last?.kind==='result'&&s.handoff&&<div className="handoff"><p>{s.handoff.reason}</p>
          <button className="cta" onClick={()=>start(byId(s.handoff!.id),job.need,job.memory)}>Chamar {byId(s.handoff.id).name}</button></div>}
        <div ref={end}/>
      </div>
      <div className="composer"><textarea rows={2} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
        placeholder={last?.kind==='result'?'Peça ajustes ou melhorias…':'Responda aqui…'}/>
        <button className="cta" onClick={send} disabled={busy||!text.trim()}>Enviar</button></div>
    </main>})()}

    {view==='jobs'&&<main className="narrow"><h2>Meus trabalhos</h2>
      {jobs.length===0&&<p className="sub">Nada por aqui ainda. Explique o que você precisa e seu primeiro trabalho aparece nesta lista.</p>}
      {jobs.map(j=>{const s=byId(j.spId);return <div key={j.id} className="jobrow"><button className="pro" onClick={()=>{setCur(j.id);setView('work')}}>
        <span className="emoji">{s.emoji}</span><span><strong>{j.title}</strong><br/><small className="muted">{s.name} · {j.status} · atualizado {when(j.updated)}</small></span></button>
        <button className="del" aria-label={'Apagar '+j.title} onClick={()=>{if(confirm('Apagar "'+j.title+'"?'))setJobs(js=>js.filter(x=>x.id!==j.id))}}>Apagar</button></div>})}
      {jobs.length>1&&<button className="link" onClick={()=>{if(confirm('Apagar todos os '+jobs.length+' trabalhos? Isso não pode ser desfeito.'))setJobs([])}}>Apagar todos</button>}
      <button className="cta" onClick={()=>{setNeed('');setView('need')}}>Novo trabalho</button>
    </main>}
  </div>
}
