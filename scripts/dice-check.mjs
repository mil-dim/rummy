import {diceStatistics} from '../lib/dice-statistics.js';
import {diceRandom} from '../lib/dice.js';
import {createReadStream,readdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {join} from 'node:path';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]};
const stats=diceStatistics(),dir=get('--audit-dir',null),days=Number(get('--days',36500));let lines=0,malformed=0;const roomFilter=get('--room',null),variantFilter=get('--variant',null);
if(dir){
 if(!Number.isFinite(days)||days<1)throw Error('Invalid --days');
 const cutoff=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
 for(const name of readdirSync(dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)&&n.slice(0,10)>=cutoff).sort()){
  for await(const line of createInterface({input:createReadStream(join(dir,name)),crlfDelay:Infinity})){
   lines++;try{const row=JSON.parse(line);if(roomFilter&&row.room!==roomFilter)continue;if(variantFilter&&row.variant!==variantFilter)continue;if(row.v!==1||!['opening','turn'].includes(row.kind)||!Array.isArray(row.dice)||row.dice.length!==(row.kind==='opening'?1:2))throw Error('Invalid audit row');stats.add(row.dice)}catch{malformed++}
  }
 }
}else{
 const samples=Number(get('--samples',1000000));if(!Number.isInteger(samples)||samples<100||samples>10000000)throw Error('Use 100..10000000 two-dice samples');
 for(let i=0;i<samples;i++)stats.add([diceRandom.roll(),diceRandom.roll()]);
}
console.log(JSON.stringify({source:dir?'accepted-server-rolls':'production-crypto-generator',lines,malformed,...stats.result()},null,2));
