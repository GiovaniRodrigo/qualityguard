const plans = [
  {name:'Community', price:'Free', features:['Local analysis','Deterministic rules','CLI','Local AI']},
  {name:'Pro', price:'$19 / developer / month', features:['Cloud AI','GitHub PR review','Quality gates','History']},
  {name:'Team', price:'$39 / developer / month', features:['Shared policies','Team insights','Architecture governance','Audit trail']},
  {name:'Enterprise', price:'Custom', features:['SSO','Self-hosted','Advanced audit','Enterprise support']},
];
export default function Home(){return <main style={{maxWidth:1100,margin:'0 auto',padding:'64px 24px',fontFamily:'system-ui'}}><header><p>QUALITYGUARD</p><h1>Software quality governance for AI-assisted development.</h1><p>Turn architecture and quality rules into an executable control layer for every change.</p></header><section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16,marginTop:48}}>{plans.map(p=><article key={p.name} style={{border:'1px solid #ddd',borderRadius:12,padding:24}}><h2>{p.name}</h2><strong>{p.price}</strong><ul>{p.features.map(f=><li key={f}>{f}</li>)}</ul><button>{p.name==='Community'?'Start free':'Choose plan'}</button></article>)}</section></main>}
