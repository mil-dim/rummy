// Streaming diagnostics: no roll data is retained, and no outcomes are altered.
function gammaQ(a,x){
 if(x<=0)return 1;
 const logGamma=z=>{const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.505632735149312e-7];z--;let y=.9999999999998099;for(let i=0;i<c.length;i++)y+=c[i]/(z+i+1);const t=z+c.length-.5;return .9189385332046727+(z+.5)*Math.log(t)-t+Math.log(y)};
 const factor=Math.exp(-x+a*Math.log(x)-logGamma(a));
 if(x<a+1){let term=1/a,sum=term;for(let n=1;n<1000;n++){term*=x/(a+n);sum+=term;if(Math.abs(term)<Math.abs(sum)*1e-14)break}return Math.max(0,Math.min(1,1-sum*factor))}
 let b=x+1-a,c=1e300,d=1/b,h=d;
 for(let i=1;i<1000;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<1e-14)break}
 return Math.max(0,Math.min(1,factor*h));
}
function chi(counts){const n=counts.reduce((a,b)=>a+b,0),expected=n/counts.length;if(!n)return {n:0,p:null};const statistic=counts.reduce((sum,c)=>sum+(c-expected)**2/expected,0);return {n,expected,statistic,degreesOfFreedom:counts.length-1,p:gammaQ((counts.length-1)/2,statistic/2),sufficientSample:expected>=5}}
export function diceStatistics(){
 const faces=Array(6).fill(0),pairs=Array(36).fill(0),transitions=Array(36).fill(0),ring=Array(32),lags=Array.from({length:32},()=>({n:0,x:0,y:0,xx:0,yy:0,xy:0,matches:0}));
 let n=0,previous=null,run=0,maxRun=0,previousPair=null,pairRun=0,maxPairRun=0,doubles=0,invalid=0,opening=0;
 function die(value){
  faces[value-1]++;if(previous!==null&&n%2===1)transitions[(previous-1)*6+value-1]++;
  run=value===previous?run+1:1;maxRun=Math.max(maxRun,run);
  for(let lag=1;lag<=Math.min(32,n);lag++){const old=ring[(n-lag)%32],s=lags[lag-1];s.n++;s.x+=old;s.y+=value;s.xx+=old*old;s.yy+=value*value;s.xy+=old*value;s.matches+=old===value?1:0}
  ring[n%32]=value;n++;previous=value;
 }
 return {
  add(dice){if(!Array.isArray(dice)||![1,2].includes(dice.length)||dice.some(d=>!Number.isInteger(d)||d<1||d>6)){invalid++;return}
   dice.forEach(die);
   if(dice.length===1){opening++;return}
   const key=(dice[0]-1)*6+dice[1]-1;pairs[key]++;if(dice[0]===dice[1])doubles++;
   pairRun=key===previousPair?pairRun+1:1;maxPairRun=Math.max(maxPairRun,pairRun);previousPair=key;
  },
  result(){const faceTest=chi(faces),pairTest=chi(pairs),transitionTest=chi(transitions),pairCount=pairs.reduce((a,b)=>a+b,0);
   const lagTests=lags.map((s,i)=>{const denom=Math.sqrt((s.n*s.xx-s.x*s.x)*(s.n*s.yy-s.y*s.y));return {lag:i+1,n:s.n,correlation:denom?(s.n*s.xy-s.x*s.y)/denom:null,equalFraction:s.n?s.matches/s.n:null,equalZ:s.n?(s.matches-s.n/6)/Math.sqrt(s.n*5/36):null}});
   return {individualDice:n,openingRolls:opening,twoDiceRolls:pairCount,invalidRecords:invalid,faces,orderedPairs:pairs,doubles,expectedDoubles:pairCount/6,maxSameFaceRun:maxRun,maxSameOrderedPairRun:maxPairRun,faceTest,pairTest,transitionTest,lagTests,
    reviewFlags:[...Object.entries({faces:faceTest,pairs:pairTest,transitions:transitionTest}).filter(([,s])=>s.sufficientSample&&s.p<1e-5).map(([name])=>name+' distribution'),...lagTests.filter(s=>s.n>=100&&((s.correlation!==null&&Math.abs(s.correlation)>5/Math.sqrt(s.n))||Math.abs(s.equalZ)>5)).map(s=>'dependence at lag '+s.lag)],
    interpretation:'Exploratory screening, not certification. Rare flags occur by chance; do not rerun until a pass or suppress repeats. Interleaving tables can hide per-game patterns. Correlation only checks lags 1..32; it cannot prove absence of longer periods.'};
  }
 };
}
