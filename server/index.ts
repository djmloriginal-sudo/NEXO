import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {SPECIALISTS} from '../src/lib/specialists'
import {buildSystemPrompt} from '../src/lib/prompt'
import type {Source} from '../src/lib/search'
import {tavily} from './search'

const KEY=process.env.AI_API_KEY
const MODEL=process.env.AI_MODEL||'gemini-2.5-flash'
const PORT=Number(process.env.PORT||8787)
const ORIGIN=process.env.ALLOWED_ORIGIN||'http://localhost:5173'
const hits=new Map<string,number[]>()
const limited=(ip:string)=>{const n=Date.now(),a=(hits.get(ip)||[]).filter(t=>n-t<6e4);a.push(n);hits.set(ip,a);return a.length>20}
const cap=(s:unknown,n:number)=>String(s??'').slice(0,n)

async function call(body:any):Promise<any>{
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',
    headers:{'content-type':'application/json','x-goog-api-key':KEY!},body:JSON.stringify(body)})
  if(r.status===429)throw new Error('Limite gratuito da IA atingido. Aguarde um pouco e tente de novo.')
  if(!r.ok)throw new Error('Falha no provedor de IA ('+r.status+')')
  return r.json()
}
const tools=[{functionDeclarations:[{name:'web_search',description:'Pesquisa na web informações atuais. Use só quando necessário.',
  parameters:{type:'OBJECT',properties:{query:{type:'STRING'}},required:['query']}}]}]

async function chat(b:any){
  const sp=SPECIALISTS.find(s=>s.id===b?.spId)
  if(!sp)throw new Error('Especialista inválido')
  const memory:Record<string,string>={}
  for(const [k,v] of Object.entries(b.memory||{}).slice(0,12))memory[cap(k,40)]=cap(v,400)
  const hist:any[]=(Array.isArray(b.history)?b.history:[]).slice(-10)
    .filter((m:any)=>m&&(m.role==='user'||m.role==='pro'))
    .map((m:any)=>({role:m.role==='user'?'user':'model',parts:[{text:cap(m.text,4000)}]}))
  const contents:any[]=[{role:'user',parts:[{text:'Pedido do cliente: '+cap(b.need,1500)}]},...hist]
  const system=buildSystemPrompt({s:sp,memory,canSearch:tavily.live})
  const used:Source[]=[]
  for(let i=0;i<3;i++){
    const r=await call({systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:3000},...(tavily.live&&i<2?{tools}:{})})
    const parts:any[]=r.candidates?.[0]?.content?.parts||[]
    const calls=parts.filter(p=>p.functionCall)
    if(!calls.length){
      const text=parts.map(p=>p.text||'').join('\n').trim()
      if(!text)throw new Error('A IA não retornou resposta')
      return {text,sources:used}
    }
    contents.push({role:'model',parts})
    const resp:any[]=[]
    for(const p of calls){
      try{
        const found=await tavily.search(cap(p.functionCall.args?.query,200))
        found.forEach(f=>{if(!used.some(u=>u.url===f.url))used.push(f)})
        resp.push({functionResponse:{name:p.functionCall.name,response:{results:found}}})
      }catch(e){resp.push({functionResponse:{name:p.functionCall.name,response:{error:'Busca indisponível'}}})}
    }
    contents.push({role:'user',parts:resp})
  }
  throw new Error('Limite de pesquisas excedido')
}

async function classify(b:any){
  const r=await call({
    systemInstruction:{parts:[{text:'Você roteia pedidos para o profissional certo. Responda SOMENTE JSON: {"scores":{"<id>":0-100},"why":"uma frase em português explicando a escolha do primeiro"}. Ids: '+SPECIALISTS.map(s=>`${s.id} (${s.tagline})`).join('; ')}]},
    contents:[{role:'user',parts:[{text:cap(b?.need,1500)}]}],
    generationConfig:{responseMimeType:'application/json',maxOutputTokens:400}})
  const txt=(r.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||'').join('')
  const m=txt.match(/\{[\s\S]*\}/)
  const j=JSON.parse(m?m[0]:'{}')
  const list=SPECIALISTS.map(s=>({id:s.id,pct:Math.max(0,Math.min(100,Math.round(Number(j.scores?.[s.id])||0)))}))
    .sort((x,y)=>y.pct-x.pct).slice(0,3)
  if(list[0].pct===0)throw new Error('Classificação inválida')
  return {list,why:cap(j.why,300)}
}

const DIST=path.resolve('dist')
const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'}
// Em produção o mesmo servidor entrega o site (pasta dist) e a API.
function serve(req:http.IncomingMessage,res:http.ServerResponse){
  const u=decodeURIComponent((req.url||'/').split('?')[0])
  let f=path.join(DIST,u)
  if(!f.startsWith(DIST)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(DIST,'index.html')
  if(!fs.existsSync(f)){res.writeHead(404);return res.end('Rode npm run build:web primeiro')}
  res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)
}
http.createServer(async(req,res)=>{
  const send=(c:number,o:unknown)=>{res.writeHead(c,{'content-type':'application/json','access-control-allow-origin':ORIGIN,'access-control-allow-headers':'content-type,x-access-code','access-control-allow-methods':'POST,OPTIONS'});res.end(JSON.stringify(o))}
  try{
    if(req.method==='GET')return serve(req,res)
    if(req.method==='OPTIONS')return send(204,{})
    if(req.method!=='POST')return send(405,{error:'Método não permitido'})
    if(process.env.ACCESS_CODE&&req.headers['x-access-code']!==process.env.ACCESS_CODE)return send(401,{error:'Código de acesso inválido'})
    if(!KEY)return send(503,{error:'AI_API_KEY não configurada no servidor'})
    if(limited(req.socket.remoteAddress||'?'))return send(429,{error:'Muitas requisições. Aguarde um minuto.'})
    let raw=''
    for await(const c of req){raw+=c;if(raw.length>20000)return send(413,{error:'Requisição grande demais'})}
    const b=JSON.parse(raw||'{}')
    if(req.url==='/api/chat')return send(200,await chat(b))
    if(req.url==='/api/classify')return send(200,await classify(b))
    send(404,{error:'Não encontrado'})
  }catch(e){console.error(e);send(500,{error:e instanceof Error?e.message:'Erro interno'})}
}).listen(PORT,()=>console.log(`NEXO API em :${PORT} | IA: ${KEY?'ok':'SEM CHAVE'} | busca: ${tavily.live?'ok':'SEM CHAVE'}`))
