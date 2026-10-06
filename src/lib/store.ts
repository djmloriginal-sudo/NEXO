import type {Msg} from './ai'
export type Job={id:string;title:string;spId:string;need:string;status:string;updated:number;messages:Msg[];memory:Record<string,string>}
const K='nexo.jobs.v1'
// Persistência local. Para Supabase: troque estas duas funções por chamadas à tabela "jobs" (RLS por usuário).
export const loadJobs=():Job[]=>{try{return JSON.parse(localStorage.getItem(K)||'[]')}catch{return[]}}
export const saveJobs=(j:Job[])=>localStorage.setItem(K,JSON.stringify(j))
