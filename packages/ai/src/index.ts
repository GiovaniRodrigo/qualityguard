import { z } from 'zod';
import type { Finding } from '@qualityguard/domain';

export interface AIRequest { system: string; prompt: string; }
export interface AIProvider { readonly name: string; complete(request: AIRequest): Promise<string>; }
export interface AIReviewContext { diff: string; architecture?: string; rules?: string; }
const findingSchema = z.object({ severity:z.enum(['critical','high','medium','low','info']), category:z.enum(['architecture','security','performance','clean_code','testing','dependency','scalability','maintainability']), file:z.string(), line:z.number().int().positive().optional(), title:z.string(), description:z.string(), suggestion:z.string(), confidence:z.number().min(0).max(1), decision:z.enum(['approve','review_required','block']), evidence:z.array(z.string()).optional() });
const arraySchema = z.array(findingSchema);

export function buildReviewPrompt(context: AIReviewContext): AIRequest { return { system:'You are a software quality auditor. Return ONLY a JSON array of findings. Never invent files or lines. Use block only for critical/high risk.', prompt:`Review this change.\nDIFF:\n${context.diff}\nARCHITECTURE:\n${context.architecture ?? 'not provided'}\nRULES:\n${context.rules ?? 'default policy'}` }; }
export function parseAIFindings(raw: string, source='ai'): Finding[] { const cleaned = raw.replace(/^```(?:json)?/,'').replace(/```$/,'').trim(); const parsed = arraySchema.parse(JSON.parse(cleaned)); return parsed.map((f, i) => ({ id:`ai-${i}-${f.file}-${f.line ?? 0}`, source: source as 'ai', status:'open' as const, ...f })); }

export class HttpAIProvider implements AIProvider { constructor(public readonly name:string, private readonly endpoint:string, private readonly headers:Record<string,string>, private readonly model:string){} async complete(request:AIRequest){const response=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json',...this.headers},body:JSON.stringify({model:this.model,messages:[{role:'system',content:request.system},{role:'user',content:request.prompt}],temperature:0})});if(!response.ok)throw new Error(`${this.name} returned ${response.status}`);const data=await response.json() as {choices?:Array<{message?:{content?:string}}>};const content=data.choices?.[0]?.message?.content;if(!content)throw new Error(`${this.name} returned no content`);return content;}}
export function openAI():AIProvider{return new HttpAIProvider('openai','https://api.openai.com/v1/chat/completions',{Authorization:`Bearer ${process.env.OPENAI_API_KEY ?? ''}`},process.env.OPENAI_MODEL ?? 'gpt-5-mini');}
export function anthropic():AIProvider{return new HttpAIProvider('anthropic','https://api.anthropic.com/v1/messages',{'x-api-key':process.env.ANTHROPIC_API_KEY ?? '','anthropic-version':'2023-06-01'},process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5');}
export function gemini():AIProvider{return new HttpAIProvider('gemini',`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,{Authorization:`Bearer ${process.env.GEMINI_API_KEY ?? ''}`},process.env.GEMINI_MODEL ?? 'gemini-2.5-flash');}
export function ollama():AIProvider{return new HttpAIProvider('ollama',`${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/v1/chat/completions`,{},process.env.OLLAMA_MODEL ?? 'llama3.1');}
