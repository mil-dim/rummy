import {validateMeld, cardPoints, RANKS, SUITS} from '../lib/rummy.js';

const value=rank=>RANKS.indexOf(rank)+1;
const effective=card=>card.rank==='JOKER'?card.represents:card;
const combinations=(items,n)=>{
 const out=[];
 function visit(start,chosen){if(chosen.length===n){out.push(chosen);return}for(let i=start;i<items.length;i++)visit(i+1,[...chosen,items[i]])}
 visit(0,[]);return out;
};

export function meldCandidates(hand){
 const found=new Map(),jokers=hand.filter(c=>c.rank==='JOKER'),natural=hand.filter(c=>c.rank!=='JOKER');
 function add(cards,assignments=[]){
  const checked=validateMeld(cards,assignments);if(!checked.ok)return;
  const key=cards.map(c=>c.id).sort().join('|')+JSON.stringify(assignments);
  found.set(key,{cardIds:cards.map(c=>c.id),jokerAssignments:assignments,points:checked.points});
 }
 for(const rank of RANKS){
  const same=natural.filter(c=>c.rank===rank);
  for(const size of [3,4])for(let j=0;j<=Math.min(jokers.length,size-1);j++){
   for(const group of combinations(same,size-j)){
    const missing=SUITS.filter(s=>!group.some(c=>c.suit===s));
    if(new Set(group.map(c=>c.suit)).size!==group.length||missing.length<j)continue;
    const js=jokers.slice(0,j);
    add([...group,...js],js.map((c,i)=>({cardId:c.id,rank,suit:missing[i]})));
   }
  }
 }
 for(const suit of SUITS)for(const sequence of [RANKS,[...RANKS.slice(1),'A']]){
  for(let start=0;start<sequence.length-2;start++)for(let end=start+3;end<=sequence.length;end++){
   const ranks=sequence.slice(start,end),missing=ranks.filter(r=>!natural.some(c=>c.rank===r&&c.suit===suit));
   if(missing.length>jokers.length||missing.length===ranks.length)continue;
   // Include each physical duplicate as an alternative, with bounded branching.
   let variants=[[]];
   for(const rank of ranks.filter(r=>!missing.includes(r))){
    const choices=natural.filter(c=>c.rank===rank&&c.suit===suit);
    variants=variants.flatMap(group=>choices.map(c=>[...group,c])).slice(0,8);
   }
   const js=jokers.slice(0,missing.length);
   for(const group of variants)add([...group,...js],js.map((c,i)=>({cardId:c.id,rank:missing[i],suit})));
  }
 }
 return [...found.values()].sort((a,b)=>b.cardIds.length-a.cardIds.length||b.points-a.points).slice(0,180);
}

export function meldPlans(hand,opened){
 const candidates=meldCandidates(hand),plans=new Map();let nodes=0;
 function visit(start,used,chosen,points){
  if(++nodes>20000)return;
  if(chosen.length&&(opened||points>=44||hand.length-used.size<=1)){
   const action={type:'meldBatch',melds:chosen.map(({cardIds,jokerAssignments})=>({cardIds,jokerAssignments}))};
   const score=used.size*100+points;
   plans.set([...used].sort().join('|'),{action,score,cards:used.size,points});
   if(plans.size>80){const lowest=[...plans].sort((a,b)=>a[1].score-b[1].score)[0];plans.delete(lowest[0]);}
  }
  if(chosen.length===8)return;
  for(let i=start;i<candidates.length&&nodes<=20000;i++){
   const m=candidates[i];if(m.cardIds.some(id=>used.has(id)))continue;
   visit(i+1,new Set([...used,...m.cardIds]),[...chosen,m],points+m.points);
  }
 }
 visit(0,new Set(),[],0);
 return [...plans.values()].sort((a,b)=>b.score-a.score).slice(0,12);
}

function additions(game,hand){
 const out=[];
 for(const meld of game.melds||[])for(const card of hand){
  const assignments=[];
  if(card.rank==='JOKER'){
   const virtual=meld.cards.map(effective);
   if(meld.type==='set')for(const suit of SUITS.filter(s=>!virtual.some(c=>c.suit===s)))assignments.push({cardId:card.id,rank:virtual[0].rank,suit});
   else for(const sequence of [RANKS,[...RANKS.slice(1),'A']]){
    const ranks=virtual.map(c=>sequence.indexOf(c.rank));
    for(const index of [Math.min(...ranks)-1,Math.max(...ranks)+1])if(index>=0&&index<sequence.length)assignments.push({cardId:card.id,rank:sequence[index],suit:virtual[0].suit});
   }
  }
  for(const declaration of card.rank==='JOKER'?assignments:[null]){
   const jokerAssignments=declaration?[declaration]:[];
   if(validateMeld([...meld.cards,card],jokerAssignments).ok)out.push({action:{type:'add',meldId:meld.id,cardIds:[card.id],jokerAssignments},score:100+cardPoints(card)});
  }
 }
 return out;
}

function utility(card,hand){
 if(card.rank==='JOKER')return 100;
 const same=new Set(hand.filter(c=>c.id!==card.id&&c.rank===card.rank&&c.suit!==card.suit).map(c=>c.suit)).size;
 const neighbors=hand.filter(c=>c.id!==card.id&&c.rank!=='JOKER'&&c.suit===card.suit&&
  (Math.abs(value(c.rank)-value(card.rank))<=2||[c.rank,card.rank].includes('A')&&[c.rank,card.rank].some(r=>['Q','K'].includes(r)))).length;
 return same*8+neighbors*4-cardPoints(card)*.3;
}

export function rummyOptions(game,id){
 if(game.kind!=='rummy'||game.winner||game.players[game.turn]!==id)return [];
 const hand=game.hands[id];if(!Array.isArray(hand))return [];
 const opened=Boolean(game.opened[id]);
 if(game.phase==='draw'){
  const top=game.discard?.at(-1),options=[{action:{type:'draw',from:'stock'},score:0}];
  if(top){
   const extended=[...hand,top],plans=meldPlans(extended,opened);
   const useful=plans.some(p=>p.action.melds.some(m=>m.cardIds.includes(top.id)))||opened&&additions(game,[top]).length;
   if(useful)options.unshift({action:{type:'draw',from:'discard'},score:100});
  }
  return options;
 }
 if(game.phase!=='play')return [];
 const plans=meldPlans(hand,opened);
 const moves=opened?[...plans,...additions(game,hand)]:plans;
 if(moves.length)return moves.sort((a,b)=>b.score-a.score).slice(0,12);
 if(opened&&game.openedTurn?.[id]!==game.turnNumber){
  for(const meld of game.melds||[])for(const joker of meld.cards){
   if(joker.rank!=='JOKER'||!joker.represents)continue;
   const card=hand.find(c=>c.rank===joker.represents.rank&&c.suit===joker.represents.suit);
   if(card)return [{action:{type:'replaceJoker',meldId:meld.id,jokerId:joker.id,cardId:card.id},score:100}];
  }
 }
 return hand.filter(c=>c.rank!=='JOKER'||hand.every(x=>x.rank==='JOKER'))
  .map(card=>({action:{type:'discard',cardId:card.id},score:-utility(card,hand)-(additions(game,[card]).length?12:0)})).sort((a,b)=>b.score-a.score).slice(0,8);
}

export function rummyDecision(room,id){
 const game=room?.game;if(room?.role!=='player'||game?.kind!=='rummy')return null;
 const options=rummyOptions(game,id);if(!options.length)return null;
 const hand=game.hands[id],cards=new Map(hand.map((c,i)=>[c.id,{ref:`h${i}`,rank:c.rank,suit:c.suit}]));
 const publicCard=c=>({rank:c.rank,suit:c.suit,...(c.represents?{represents:c.represents}:{})});
 return {actions:options.map(o=>o.action),state:{kind:'rummy',phase:game.phase,opened:Boolean(game.opened[id]),
  hand:[...cards.values()],stockCount:game.stock.count,discard:game.discard.slice(-8).map(publicCard),
  opponents:game.players.filter(p=>p!==id).map(p=>({count:game.hands[p]?.count??game.hands[p]?.length,opened:Boolean(game.opened[p])})),
  melds:game.melds.map((m,i)=>({ref:`m${i}`,type:m.type,cards:m.cards.map(publicCard)})),
  candidates:options.map((o,candidateId)=>({candidateId,type:o.action.type,from:o.action.from,
   cards:o.action.cardIds?.map(cid=>cards.get(cid)),card:o.action.cardId?cards.get(o.action.cardId):undefined,
   meld:o.action.meldId?`m${game.melds.findIndex(m=>m.id===o.action.meldId)}`:undefined,
   melds:o.action.melds?.map(m=>({cards:m.cardIds.map(cid=>cards.get(cid)),jokers:m.jokerAssignments.map(a=>({ref:cards.get(a.cardId)?.ref,rank:a.rank,suit:a.suit}))})),
   jokerAssignments:o.action.jokerAssignments?.map(a=>({ref:cards.get(a.cardId)?.ref,rank:a.rank,suit:a.suit})),
   cardsLaid:o.cards,openingPoints:o.points}))}};
}
