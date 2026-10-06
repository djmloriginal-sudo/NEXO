import type {Specialist} from './specialists'
import {byId,recommend} from './specialists'
import type {Source} from './search'
export type Msg={role:'user'|'pro';text:string;kind?:'questions'|'result'|'text';sources?:Source[]}
export type Ctx={s:Specialist;need:string;memory:Record<string,string>;history:Msg[];sources:Source[]}
export type Reply={msg:Msg;memory?:Record<string,string>}
export interface AIProvider{name:string;live:boolean;reply(c:Ctx):Promise<Reply>}

// MODO DEMONSTRAÇÃO: respostas montadas a partir do DNA, sem modelo de linguagem. Não é IA real.
export const mockAI:AIProvider={name:'mock',live:false,async reply({s,need,memory,history}){
  await new Promise(r=>setTimeout(r,700))
  const users=history.filter(m=>m.role==='user')
  if(users.length===0)
    return {msg:{role:'pro',kind:'questions',text:`Entendi o pedido. Antes de começar, preciso entender três coisas:\n\n${s.questions.map((q,i)=>`${i+1}. ${q}`).join('\n')}`}}
  if(users.length===1){
    const a=users[0].text
    return {memory:{Respostas:a},msg:{role:'pro',kind:'result',text:
`Analisei o que você me passou. Direto ao ponto:

O QUE EU NÃO FARIA
${s.critique}

COMO EU TRABALHO
${s.method}

RASCUNHO DE ENTREGA (${s.format})
Pedido: ${need}
Base: ${a}
[Modo demonstração: o conteúdo real será gerado quando um modelo de IA for conectado.]

REVISÃO DO PRÓPRIO TRABALHO
Checaria: ${s.quality.join('; ')}.`}}
  }
  return {msg:{role:'pro',text:`Anotei o ajuste: "${history[history.length-1].text}". [Modo demonstração: sem modelo conectado, não consigo reescrever a entrega.]`}}
}}
export {byId}

export type Ranking={list:{s:Specialist;pct:number}[];why?:string;src:'ia'|'local'}
async function post<T>(url:string,body:unknown,retry=true):Promise<T>{
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-access-code':localStorage.getItem('nexo.code')||''},body:JSON.stringify(body)})
  if(r.status===401&&retry){const c=window.prompt('Código de acesso do NEXO:');if(c){localStorage.setItem('nexo.code',c.trim());return post<T>(url,body,false)}}
  const j=await r.json().catch(()=>({}))
  if(!r.ok)throw new Error(j.error||'Erro '+r.status)
  return j as T
}
// Provedor real: chama o backend (/api/chat). A chave e o prompt ficam só no servidor.
export const httpAI:AIProvider={name:'http',live:true,async reply({s,need,memory,history}){
  const users=history.filter(m=>m.role==='user')
  const j=await post<{text:string;sources:Source[]}>('/api/chat',{spId:s.id,need,memory,history:history.slice(-10).map(m=>({role:m.role,text:m.text}))})
  // "kind" é inferido pelo turno (1ª resposta = perguntas, 2ª = entrega); a IA ainda não sinaliza isso.
  const kind=users.length===0?'questions':users.length===1?'result':'text'
  return {memory:users.length===1?{Respostas:users[0].text.slice(0,300)}:undefined,msg:{role:'pro',kind,text:j.text,sources:j.sources}}
}}
// Classificação por IA, com fallback local claramente marcado (src:'local').
export async function classify(need:string):Promise<Ranking>{
  try{
    const j=await post<{list:{id:string;pct:number}[];why?:string}>('/api/classify',{need})
    return {src:'ia',why:j.why,list:j.list.map(x=>({s:byId(x.id),pct:x.pct}))}
  }catch{return {src:'local',list:recommend(need)}}
}
export const ai:AIProvider=import.meta.env.VITE_AI_MODE==='mock'?mockAI:httpAI
