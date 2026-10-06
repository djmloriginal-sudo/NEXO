import type {SearchProvider} from '../src/lib/search'
// Implementação Tavily atrás da interface SearchProvider. Trocar de provedor = trocar este arquivo.
export const tavily:SearchProvider={name:'tavily',live:!!process.env.WEB_SEARCH_API_KEY,
 async search(q:string){
  const r=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.WEB_SEARCH_API_KEY},body:JSON.stringify({query:q,max_results:5})})
  if(!r.ok)throw new Error('Falha na busca ('+r.status+')')
  const j:any=await r.json()
  return (j.results||[]).map((x:any)=>({title:String(x.title),url:String(x.url),snippet:String(x.content||'').slice(0,400)}))
 }}
