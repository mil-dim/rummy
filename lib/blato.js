import {cardView,hiddenHand,makeDeck,shuffled,SUITS} from './trick-cards.js';

const RANKS=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
const POWER=Object.fromEntries([...RANKS].reverse().map((rank,index)=>[rank,index+1]));
const sideOf=(g,id)=>g.players.indexOf(id);
const next=side=>(side+1)%3;
const cloneCards=cards=>cards.map(card=>({...card}));
function ensurePlayer(g,id){const side=sideOf(g,id);if(side<0)throw Error('You are not in this game.');return side}
function take(hand,id){const index=hand.findIndex(card=>card.id===id);if(index<0)throw Error('Card not found.');return hand.splice(index,1)[0]}

function targetsFor(dealer){
 const first=next(dealer),second=next(first);
 const targets=[0,0,0];targets[first]=8;targets[second]=5;targets[dealer]=3;return {targets,first};
}

function exchangePlan(g){
 if(g.gameNumber===1||g.contract==='NT')return [];
 const positive=[0,1,2].filter(side=>g.previousScores[side]>0).sort((a,b)=>g.targets[b]-g.targets[a]);
 const negative=[0,1,2].filter(side=>g.previousScores[side]<0).sort((a,b)=>g.targets[b]-g.targets[a]);
 const remaining=Object.fromEntries(negative.map(side=>[side,-g.previousScores[side]])),plan=[];
 for(const giver of positive){
  let count=g.previousScores[giver];
  for(const receiver of negative)while(count>0&&remaining[receiver]>0){plan.push({giver,receiver});count--;remaining[receiver]--}
 }
 return plan;
}

function beginAfterBid(g){
 g.exchangeQueue=exchangePlan(g);g.exchangeLog=[];
 g.phase=g.exchangeQueue.length?'exchange':'kitty';g.turn=g.exchangeQueue[0]?.giver??g.eightSide;
}

function redeal(g){
 const cards=shuffled(makeDeck(RANKS,`b${g.gameNumber}-${g.redeals+1}`));g.redeals++;
 g.hands=[[],[],[]];for(let round=0;round<16;round++)for(let side=0;side<3;side++)g.hands[side].push(cards.shift());
 g.kitty=cards;g.kittyShown=[];g.phase='bid';g.bidOrder=[g.eightSide,next(g.eightSide),next(next(g.eightSide))];g.bidIndex=0;g.turn=g.bidOrder[0];g.contract=null;
}

function currentWinningCard(g){
 let winner=g.trick[0];
 for(const item of g.trick.slice(1)){
  if(g.contract!=='NT'&&item.card.suit===g.contract&&winner.card.suit!==g.contract){winner=item;continue}
  if(item.card.suit===winner.card.suit&&POWER[item.card.rank]>POWER[winner.card.rank])winner=item;
 }
 return winner;
}

function legalCards(g,side){
 if(g.finished||g.phase!=='play'||side!==g.turn)return [];
 const hand=g.hands[side],lead=g.trick[0]?.card;
 if(!lead)return hand;
 const same=hand.filter(card=>card.suit===lead.suit);
 if(same.length){
  if(g.contract===lead.suit){
   const winner=currentWinningCard(g).card,higher=same.filter(card=>winner.suit!==g.contract||POWER[card.rank]>POWER[winner.rank]);
   return higher.length?higher:same;
  }
  return same;
 }
 if(g.contract==='NT')return hand;
 const trumps=hand.filter(card=>card.suit===g.contract),played=g.trick.filter(item=>item.card.suit===g.contract);
 if(!trumps.length)return hand;
 if(!played.length)return trumps;
 const high=played.reduce((best,item)=>POWER[item.card.rank]>POWER[best.rank]?item.card:best,played[0].card);
 const higher=trumps.filter(card=>POWER[card.rank]>POWER[high.rank]);
 return higher.length?higher:hand;
}

function resolveTrick(g){
 const winner=currentWinningCard(g).side;g.tricks[winner]++;g.played.push(...g.trick.map(item=>item.card));
 g.lastTrick={winner:g.players[winner],cards:g.trick.map(item=>cardView(item.card))};g.trick=[];g.leader=winner;g.turn=winner;
 if(g.tricks.reduce((a,b)=>a+b,0)===16){
  g.finished=true;g.scores=g.tricks.map((count,side)=>count-g.targets[side]);
  const best=Math.max(...g.scores);g.winners=[0,1,2].filter(side=>g.scores[side]===best).map(side=>g.players[side]);g.winner=g.winners[0];g.phase='finished';
 }
}

export function newBlato(players,{gameNumber=1,dealer=(gameNumber-1)%3,previousScores=[0,0,0],passesUsed=[false,false,false],deck}={}){
 if(players.length!==3)throw Error('Blato needs exactly three players.');
 const cards=deck?cloneCards(deck):shuffled(makeDeck(RANKS,`b${gameNumber}`));
 if(cards.length!==52)throw Error('Blato deck must contain 52 cards.');
 const {targets,first}=targetsFor(dealer),hands=[[],[],[]];
 for(let round=0;round<16;round++)for(let side=0;side<3;side++)hands[side].push(cards.shift());
 return {kind:'blato',gameNumber,players:players.map(player=>player.id),dealer,eightSide:first,targets,previousScores:[...previousScores],passesUsed:[...passesUsed],
  hands,kitty:cards,kittyShown:[],phase:'bid',bidOrder:[first,next(first),dealer],bidIndex:0,turn:first,contract:null,exchangeQueue:[],exchangeLog:[],
  trick:[],played:[],tricks:[0,0,0],leader:first,lastTrick:null,finished:false,winner:null,winners:[],scores:null,redeals:0};
}

export function blatoAction(g,playerId,action){
 const side=ensurePlayer(g,playerId);
 if(g.finished)throw Error('This deal has finished.');
 if(side!==g.turn)throw Error('It is not your turn.');
 if(action.type==='bid'){
  if(g.phase!=='bid')throw Error('Bidding has finished.');
  const contract=action.contract;
  if(contract==='PASS'){
   if(g.passesUsed[side])throw Error('You have already used your pass in this match.');
   g.passesUsed[side]=true;g.bidIndex++;
   if(g.bidIndex>=g.bidOrder.length){redeal(g);return g}
   g.turn=g.bidOrder[g.bidIndex];
  }else{
   if(![...SUITS,'NT'].includes(contract))throw Error('Choose a valid contract.');
   g.contract=contract;beginAfterBid(g);
  }
 }else if(action.type==='exchange'){
  if(g.phase!=='exchange'||!g.exchangeQueue.length)throw Error('There is no exchange to make.');
  const step=g.exchangeQueue[0];if(side!==step.giver)throw Error('Wait for the current exchange.');
  const given=take(g.hands[step.giver],action.cardId);g.hands[step.receiver].push(given);
  const stronger=g.hands[step.receiver].filter(card=>card.id!==given.id&&card.suit===given.suit&&POWER[card.rank]>POWER[given.rank]).sort((a,b)=>POWER[b.rank]-POWER[a.rank]);
  const returned=stronger.length?take(g.hands[step.receiver],stronger[0].id):take(g.hands[step.receiver],given.id);
  g.hands[step.giver].push(returned);g.exchangeLog.push({giver:step.giver,receiver:step.receiver});g.exchangeQueue.shift();
  if(g.exchangeQueue.length)g.turn=g.exchangeQueue[0].giver;else{g.phase='kitty';g.turn=g.eightSide}
 }else if(action.type==='discardKitty'){
  if(g.phase!=='kitty'||side!==g.eightSide)throw Error('Only the 8-player takes the talon.');
  if(!Array.isArray(action.cardIds)||action.cardIds.length!==4||new Set(action.cardIds).size!==4)throw Error('Choose exactly four cards to return.');
  g.kittyShown=g.kitty.map(cardView);g.hands[side].push(...g.kitty);g.kitty=[];
  action.cardIds.forEach(id=>take(g.hands[side],id));g.discarded={count:4};
  g.phase='play';g.leader=g.eightSide;g.turn=g.eightSide;
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
 const viewer=sideOf(g,viewerId),legal=viewer>=0?new Set(legalCards(g,viewer).map(card=>card.id)):new Set();
 const exchange=g.exchangeQueue[0];
 return {...g,
  hands:g.hands.map((hand,side)=>side===viewer?hand.map(cardView):hiddenHand(hand)),
  played:{count:g.played.length},
  kitty:g.phase==='kitty'||g.kittyShown.length?g.kitty.map(cardView):{count:g.kitty.length},
  legalCardIds:[...legal],
  exchangeQueue:g.exchangeQueue.map(step=>({giver:g.players[step.giver],receiver:g.players[step.receiver]})),
  exchangeLog:g.exchangeLog.map(step=>({giver:g.players[step.giver],receiver:g.players[step.receiver]})),
  canExchange:Boolean(exchange&&viewer===exchange.giver),canDiscardKitty:g.phase==='kitty'&&viewer===g.eightSide
 };
}

export const blatoRules={ranks:RANKS,suits:SUITS,power:POWER};
