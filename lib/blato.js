import {cardView,hiddenHand,makeDeck,shuffled,SUITS} from './trick-cards.js';

const RANKS=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
const POWER=Object.fromEntries([...RANKS].reverse().map((rank,index)=>[rank,index+1]));
const sideOf=(g,id)=>g.players.indexOf(id);
const next=side=>(side+1)%3;
const cloneCards=cards=>cards.map(card=>({...card}));
function ensurePlayer(g,id){const side=sideOf(g,id);if(side<0)throw Error('You are not in this game.');return side}
function take(hand,id){const index=hand.findIndex(card=>card.id===id);if(index<0)throw Error('Card not found.');return hand.splice(index,1)[0]}

function pullPlan(g){
 if(g.gameNumber===1)return [];
 const winners=[0,1,2].filter(side=>g.previousScores[side]>0).sort((a,b)=>g.previousScores[b]-g.previousScores[a]||a-b);
 const losers=[0,1,2].filter(side=>g.previousScores[side]<0).sort((a,b)=>g.previousScores[a]-g.previousScores[b]||a-b);
 const debt=Object.fromEntries(losers.map(side=>[side,-g.previousScores[side]])),plan=[];
 for(const giver of winners){
  let credit=g.previousScores[giver];
  for(const receiver of losers){
   const count=Math.min(credit,debt[receiver]);
   if(count>0)plan.push({giver,receiver,maxCount:count});
   credit-=count;debt[receiver]-=count;
  }
 }
 return plan;
}

function deal(g){
 const cards=g.dealDeck;g.dealDeck=[];g.hands=[[],[],[]];
 for(let round=0;round<16;round++)for(let side=0;side<3;side++)g.hands[side].push(cards.shift());
 g.kitty=cards;g.kittyShown=[];g.phase='declareTrump';g.eightSide=g.targets.indexOf(8);g.dealer=g.eightSide;g.turn=g.eightSide;
}

function finishCut(g,targets){g.targets=targets;g.cutCandidates=[];g.cutPendingTargets=[];deal(g)}

function resolveCut(g){
 const candidates=g.cutCandidates;
 if(candidates.some(side=>!g.cutCards[side]))return;
 if(candidates.length===3){
  const values=candidates.map(side=>POWER[g.cutCards[side].rank]),high=Math.max(...values),low=Math.min(...values);
  const highSides=candidates.filter(side=>POWER[g.cutCards[side].rank]===high),lowSides=candidates.filter(side=>POWER[g.cutCards[side].rank]===low);
  if(high===low){for(const side of candidates)g.cutCards[side]=null;return}
  if(highSides.length===1&&lowSides.length===1){const targets=[5,5,5];targets[highSides[0]]=8;targets[lowSides[0]]=3;finishCut(g,targets);return}
  if(highSides.length===2){const targets=[null,null,null];targets[lowSides[0]]=3;g.cutBaseTargets=targets;g.cutCandidates=highSides;g.cutPendingTargets=[8,5]}
  else{const targets=[null,null,null];targets[highSides[0]]=8;g.cutBaseTargets=targets;g.cutCandidates=lowSides;g.cutPendingTargets=[5,3]}
  for(const side of g.cutCandidates)g.cutCards[side]=null;
  return;
 }
 const [a,b]=candidates,va=POWER[g.cutCards[a].rank],vb=POWER[g.cutCards[b].rank];
 if(va===vb){g.cutCards[a]=null;g.cutCards[b]=null;return}
 const targets=[...g.cutBaseTargets],high=va>vb?a:b,low=high===a?b:a;
 targets[high]=g.cutPendingTargets[0];targets[low]=g.cutPendingTargets[1];finishCut(g,targets);
}

function revealKitty(g){g.kittyShown=g.kitty.map(cardView);g.hands[g.eightSide].push(...g.kitty);g.kitty=[];g.phase='kitty';g.turn=g.eightSide}

function beginAfterTrump(g){
 g.exchangeQueue=pullPlan(g);g.exchangeLog=[];
 if(g.exchangeQueue.length){g.phase='pull';g.turn=g.exchangeQueue[0].giver}else revealKitty(g);
}

function currentWinningCard(g){
 let winner=g.trick[0];
 for(const item of g.trick.slice(1)){
  if(item.card.suit===g.contract&&winner.card.suit!==g.contract){winner=item;continue}
  if(item.card.suit===winner.card.suit&&POWER[item.card.rank]>POWER[winner.card.rank])winner=item;
 }
 return winner;
}

function legalCards(g,side){
 if(g.finished||g.phase!=='play'||side!==g.turn)return [];
 const hand=g.hands[side],lead=g.trick[0]?.card;
 if(!lead)return hand;
 const same=hand.filter(card=>card.suit===lead.suit);
 return same.length?same:hand;
}

function resolveTrick(g){
 const winner=currentWinningCard(g).side;g.tricks[winner]++;g.played.push(...g.trick.map(item=>item.card));
 g.lastTrick={winner:g.players[winner],cards:g.trick.map(item=>cardView(item.card))};g.trick=[];g.leader=winner;g.turn=winner;
 if(g.tricks.reduce((a,b)=>a+b,0)===16){
  g.finished=true;g.scores=g.tricks.map((count,side)=>count-g.targets[side]);
  const best=Math.max(...g.scores);g.winners=[0,1,2].filter(side=>g.scores[side]===best).map(side=>g.players[side]);g.winner=g.winners[0];g.phase='finished';
 }
}

export function newBlato(players,{gameNumber=1,targets=null,previousScores=[0,0,0],deck,cutDeck}={}){
 if(players.length!==3)throw Error('Blato needs exactly three players.');
 const cards=deck?cloneCards(deck):shuffled(makeDeck(RANKS,`b${gameNumber}`));
 if(cards.length!==52)throw Error('Blato deck must contain 52 cards.');
 const initialTargets=Array.isArray(targets)?[...targets]:null;
 if(initialTargets&&([...initialTargets].sort((a,b)=>a-b).join(',')!=='3,5,8'))throw Error('Blato targets must be 8, 5 and 3.');
 const g={kind:'blato',gameNumber,players:players.map(player=>player.id),dealer:null,eightSide:null,targets:initialTargets||[null,null,null],previousScores:[...previousScores],
  hands:[[],[],[]],kitty:[],kittyShown:[],phase:initialTargets?'declareTrump':'cut',turn:initialTargets?initialTargets.indexOf(8):null,contract:null,
  exchangeQueue:[],exchangeLog:[],trick:[],played:[],tricks:[0,0,0],leader:null,lastTrick:null,finished:false,winner:null,winners:[],scores:null,
  dealDeck:cards,cutDeck:cutDeck?cloneCards(cutDeck):shuffled(makeDeck(RANKS,`cut-${gameNumber}`)),cutCards:[null,null,null],cutCandidates:initialTargets?[]:[0,1,2],cutPendingTargets:initialTargets?[]:[8,5,3],cutBaseTargets:[null,null,null]};
 if(initialTargets)deal(g);
 return g;
}

export function blatoAction(g,playerId,action){
 const side=ensurePlayer(g,playerId);
 if(g.finished)throw Error('This deal has finished.');
 if(action.type==='cut'){
  if(g.phase!=='cut'||!g.cutCandidates.includes(side))throw Error('You are not cutting now.');
  if(g.cutCards[side])throw Error('You have already cut a card.');
  g.cutCards[side]=g.cutDeck.shift();resolveCut(g);return g;
 }
 if(side!==g.turn)throw Error('It is not your turn.');
 if(action.type==='declareTrump'){
  if(g.phase!=='declareTrump'||side!==g.eightSide)throw Error('Only the 8-player announces trump.');
  if(!SUITS.includes(action.suit))throw Error('Choose a valid trump suit.');
  g.contract=action.suit;beginAfterTrump(g);
 }else if(action.type==='pull'){
  if(g.phase!=='pull'||!g.exchangeQueue.length)throw Error('There is no pull to make.');
  const step=g.exchangeQueue[0];if(side!==step.giver)throw Error('Wait for the current pull.');
  if(!Array.isArray(action.cardIds)||new Set(action.cardIds).size!==action.cardIds.length||action.cardIds.length>step.maxCount)throw Error(`Choose up to ${step.maxCount} cards.`);
  const chosen=action.cardIds.map(id=>g.hands[side].find(card=>card.id===id));
  if(chosen.some(card=>!card))throw Error('Card not found.');
  if(chosen.some(card=>card.suit===g.contract))throw Error('Trump cards cannot be used for pulling.');
  const given=chosen.map(card=>take(g.hands[step.giver],card.id)),returned=[];
  for(const card of given){
   const same=g.hands[step.receiver].filter(item=>item.suit===card.suit).sort((a,b)=>POWER[b.rank]-POWER[a.rank]);
   if(same.length)returned.push(take(g.hands[step.receiver],same[0].id));else returned.push(card);
  }
  const returnedIds=new Set(returned.map(card=>card.id));
  g.hands[step.receiver].push(...given.filter(card=>!returnedIds.has(card.id)));g.hands[step.giver].push(...returned);
  g.exchangeLog.push({...step,count:given.length,given:given.map(cardView),returned:returned.map(cardView)});g.exchangeQueue.shift();
  if(g.exchangeQueue.length)g.turn=g.exchangeQueue[0].giver;else revealKitty(g);
 }else if(action.type==='discardKitty'){
  if(g.phase!=='kitty'||side!==g.eightSide)throw Error('Only the 8-player takes the talon.');
  if(!Array.isArray(action.cardIds)||action.cardIds.length!==4||new Set(action.cardIds).size!==4)throw Error('Choose exactly four cards to discard.');
  action.cardIds.forEach(id=>take(g.hands[side],id));g.discarded={count:4};g.phase='play';g.leader=g.eightSide;g.turn=g.eightSide;
 }else if(action.type==='play'){
  if(g.phase!=='play')throw Error('Cards cannot be played yet.');
  const legal=legalCards(g,side),card=legal.find(item=>item.id===action.cardId);
  if(!card)throw Error('That card cannot be played.');
  g.trick.push({side,card:take(g.hands[side],card.id)});
  if(g.trick.length<3)g.turn=next(side);else resolveTrick(g);
 }else throw Error('Unknown Blato action.');
 return g;
}

export function forfeitBlato(g,playerId){
 const side=ensurePlayer(g,playerId);if(g.finished)return g;
 g.finished=true;g.phase='finished';g.forfeit=true;g.scores=[.5,.5,.5];g.scores[side]=-1;
 g.winners=g.players.filter((_,index)=>index!==side);g.winner=g.winners[0];return g;
}

export function publicBlato(g,viewerId){
 const viewer=sideOf(g,viewerId),legal=viewer>=0?new Set(legalCards(g,viewer).map(card=>card.id)):new Set(),exchange=g.exchangeQueue[0];
 const handVisible=g.phase!=='cut'&&g.phase!=='declareTrump';
 const pullEligible=viewer>=0&&exchange?.giver===viewer&&g.phase==='pull'?g.hands[viewer].filter(card=>card.suit!==g.contract).map(card=>card.id):[];
 const {dealDeck,cutDeck,...publicGame}=g;
 return {...publicGame,
  hands:g.hands.map((hand,side)=>handVisible&&side===viewer?hand.map(cardView):hiddenHand(hand)),played:{count:g.played.length},
  kitty:g.kittyShown.length?g.kittyShown:{count:g.phase==='cut'?0:4},legalCardIds:[...legal],pullEligibleCardIds:pullEligible,
  exchangeQueue:g.exchangeQueue.map(step=>({giver:g.players[step.giver],receiver:g.players[step.receiver],maxCount:step.maxCount})),
  exchangeLog:g.exchangeLog.map(step=>step.giver===viewer||step.receiver===viewer?{giver:g.players[step.giver],receiver:g.players[step.receiver],count:step.count,given:step.given,returned:step.returned}:{giver:g.players[step.giver],receiver:g.players[step.receiver],count:step.count}),
  canCut:g.phase==='cut'&&g.cutCandidates.includes(viewer)&&!g.cutCards[viewer],canDeclareTrump:g.phase==='declareTrump'&&viewer===g.eightSide,
  canPull:Boolean(exchange&&viewer===exchange.giver),canDiscardKitty:g.phase==='kitty'&&viewer===g.eightSide
 };
}

export const blatoRules={ranks:RANKS,suits:SUITS,power:POWER};
