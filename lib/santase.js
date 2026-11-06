import {cardView,hiddenHand,makeDeck,shuffled,SUITS} from './trick-cards.js';

const RANKS=['A','10','K','Q','J','9'];
const POWER={A:6,'10':5,K:4,Q:3,J:2,'9':1};
const POINTS={A:11,'10':10,K:4,Q:3,J:2,'9':0};
const cloneCards=cards=>cards.map(card=>({...card}));
const sideOf=(g,id)=>g.players.indexOf(id);
const opponent=side=>1-side;

function ensurePlayer(g,id){const side=sideOf(g,id);if(side<0)throw Error('You are not in this game.');return side}
function totalPoints(g,side){return g.cardPoints[side]+g.marriagePoints[side]}
function leadingSide(g){return g.trick.length?g.trick[0].side:g.leader}
function cardById(g,side,id){return g.hands[side].find(card=>card.id===id)}
function takeCard(g,side,id){const index=g.hands[side].findIndex(card=>card.id===id);if(index<0)throw Error('Card not found.');return g.hands[side].splice(index,1)[0]}

function beats(a,b,trump){
 if(a.suit===b.suit)return POWER[a.rank]>POWER[b.rank];
 return a.suit===trump&&b.suit!==trump;
}

function strictLegal(g,side){
 const hand=g.hands[side],lead=g.trick[0]?.card;
 if(!lead)return hand;
 const same=hand.filter(card=>card.suit===lead.suit);
 if(same.length){const higher=same.filter(card=>POWER[card.rank]>POWER[lead.rank]);return higher.length?higher:same}
 const trumps=hand.filter(card=>card.suit===g.trumpSuit);
 return trumps.length?trumps:hand;
}

function legalCards(g,side){
 if(g.finished||side!==g.turn)return [];
 if(g.trick.length&&g.trick[0].side===side)return [];
 return g.closed||!g.trumpCard&&!g.stock.length?strictLegal(g,side):g.hands[side];
}

function award(g,winner,points,reason){
 g.finished=true;g.winner=g.players[winner];g.awarded=points;g.reason=reason;g.turn=winner;
}

function failureAward(g,loser,reason){
 const winner=opponent(loser);
 award(g,winner,g.tricksWon[loser]===0?3:2,reason);
}

function evaluateClaim(g,side){
 if(totalPoints(g,side)>=66){
  const other=opponent(side),points=g.tricksWon[other]===0?3:totalPoints(g,other)<=32?2:1;
  award(g,side,points,'claimed-66');
 }else failureAward(g,side,'false-claim');
}

function finishCards(g){
 if(g.closed&&g.closer!==null){
  if(totalPoints(g,g.closer)>=66)evaluateClaim(g,g.closer);
  else failureAward(g,g.closer,'failed-close');
  return;
 }
 const totals=[totalPoints(g,0),totalPoints(g,1)];
 if(totals[0]===totals[1]){g.finished=true;g.draw=true;g.reason='equal-points';return}
 const winner=totals[0]>totals[1]?0:1,loser=opponent(winner);
 award(g,winner,g.tricksWon[loser]===0?3:totals[loser]<=32?2:1,'cards-finished');
}

function resolveTrick(g){
 const [lead,reply]=g.trick,winner=beats(reply.card,lead.card,g.trumpSuit)?reply.side:lead.side;
 g.cardPoints[winner]+=POINTS[lead.card.rank]+POINTS[reply.card.rank];
 g.tricksWon[winner]++;
 g.taken[winner].push(lead.card,reply.card);
 g.lastTrick={winner:g.players[winner],cards:g.trick.map(item=>cardView(item.card))};
 g.trick=[];g.leader=winner;g.turn=winner;

 if(!g.closed){
  if(g.stock.length){
   g.hands[winner].push(g.stock.shift());
   if(g.stock.length)g.hands[opponent(winner)].push(g.stock.shift());
   else if(g.trumpCard){g.hands[opponent(winner)].push(g.trumpCard);g.trumpCard=null}
  }
 }
 if(!g.hands[0].length&&!g.hands[1].length){
  if(!g.closed)g.cardPoints[winner]+=10;
  finishCards(g);
 }
}

export function newSantase(players,{gameNumber=1,dealer=0,deck}={}){
 if(players.length!==2)throw Error('Santase needs exactly two players.');
 const cards=deck?cloneCards(deck):shuffled(makeDeck(RANKS,`s${gameNumber}`));
 if(cards.length!==24)throw Error('Santase deck must contain 24 cards.');
 const hands=[[],[]];
 for(let batch=0;batch<2;batch++)for(let side=0;side<2;side++)hands[side].push(...cards.splice(0,3));
 const trumpCard=cards.shift(),leader=opponent(dealer);
 return {kind:'santase',gameNumber,players:players.map(player=>player.id),dealer,leader,turn:leader,
  hands,stock:cards,trumpCard,trumpSuit:trumpCard.suit,trick:[],taken:[[],[]],cardPoints:[0,0],marriagePoints:[0,0],
  tricksWon:[0,0],closed:false,closer:null,finished:false,winner:null,draw:false,awarded:0,reason:null,lastTrick:null};
}

export function santaseAction(g,playerId,action){
 const side=ensurePlayer(g,playerId);
 if(g.finished)throw Error('This deal has finished.');
 if(side!==g.turn)throw Error('It is not your turn.');
 if(action.type==='play'){
  const card=cardById(g,side,action.cardId);
  if(!card||!legalCards(g,side).some(item=>item.id===card.id))throw Error('That card cannot be played.');
  if(action.announce){
   if(g.trick.length)throw Error('A marriage is announced only when leading.');
   if(g.tricksWon[side]===0)throw Error('Win a trick before announcing 20 or 40.');
   if(!['K','Q'].includes(card.rank))throw Error('Lead a king or queen to announce.');
   const mate=card.rank==='K'?'Q':'K';
   if(!g.hands[side].some(item=>item.suit===card.suit&&item.rank===mate))throw Error('You do not hold that marriage.');
   g.marriagePoints[side]+=card.suit===g.trumpSuit?40:20;
  }
  g.trick.push({side,card:takeCard(g,side,card.id),announced:Boolean(action.announce)});
  if(g.trick.length===1)g.turn=opponent(side);else resolveTrick(g);
 }else if(action.type==='claim66'){
  if(g.trick.length)throw Error('Finish the trick before claiming 66.');
  evaluateClaim(g,side);
 }else if(action.type==='close'){
  if(g.trick.length||g.tricksWon.reduce((a,b)=>a+b,0)<1)throw Error('The talon cannot be closed now.');
  if(g.closed||!g.trumpCard||g.stock.length<1)throw Error('The talon is no longer open.');
  g.closed=true;g.closer=side;
 }else if(action.type==='exchangeTrump'){
  if(g.trick.length||g.tricksWon[side]===0||g.closed||!g.trumpCard||g.stock.length<=1)throw Error('The trump nine cannot be exchanged now.');
  const nine=g.hands[side].find(card=>card.rank==='9'&&card.suit===g.trumpSuit);
  if(!nine)throw Error('You do not hold the trump nine.');
  const index=g.hands[side].indexOf(nine),old=g.trumpCard;g.hands[side][index]=old;g.trumpCard=nine;
 }else throw Error('Unknown Santase action.');
 return g;
}

export function forfeitSantase(g,playerId){
 const side=ensurePlayer(g,playerId);if(g.finished)return g;
 award(g,opponent(side),1,'forfeit');g.forfeit=true;return g;
}

export function publicSantase(g,viewerId){
 const viewer=sideOf(g,viewerId),legal=viewer>=0?new Set(legalCards(g,viewer).map(card=>card.id)):new Set();
 return {...g,
  hands:g.hands.map((hand,side)=>side===viewer?hand.map(cardView):hiddenHand(hand)),
  stock:{count:g.stock.length+(g.trumpCard?1:0)},trumpCard:cardView(g.trumpCard),taken:g.taken.map(cards=>({count:cards.length})),
  legalCardIds:[...legal],canClose:viewer>=0&&viewer===g.turn&&!g.trick.length&&!g.closed&&Boolean(g.trumpCard)&&g.stock.length>=1&&g.tricksWon.reduce((a,b)=>a+b,0)>0,
  canExchange:viewer>=0&&viewer===g.turn&&!g.trick.length&&!g.closed&&Boolean(g.trumpCard)&&g.stock.length>1&&g.tricksWon[viewer]>0&&g.hands[viewer].some(card=>card.rank==='9'&&card.suit===g.trumpSuit)
 };
}

export const santaseRules={ranks:RANKS,suits:SUITS,points:POINTS,power:POWER};
