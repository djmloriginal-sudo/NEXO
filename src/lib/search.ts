// Camada de pesquisa isolada. Para ativar pesquisa real, implemente SearchProvider
// chamando um backend que use uma API de busca (Tavily, Brave Search API, SerpAPI etc.).
export type Source={title:string;url:string;snippet:string}
export interface SearchProvider{name:string;live:boolean;search(q:string):Promise<Source[]>}
export const mockSearch:SearchProvider={name:'mock',live:false,async search(){return []}}
export const search:SearchProvider=mockSearch
