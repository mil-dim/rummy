import {randomInt} from 'node:crypto';

export const SUITS=['♠','♥','♦','♣'];

export function makeDeck(ranks,prefix='c'){
 let id=0;
 return SUITS.flatMap(suit=>ranks.map(rank=>({id:`${prefix}-${++id}`,rank,suit})));
}

export function shuffled(cards){
 const result=cards.map(card=>({...card}));
 for(let index=result.length-1;index>0;index--){
  const other=randomInt(index+1);
  [result[index],result[other]]=[result[other],result[index]];
 }
 return result;
}

export const cardView=card=>card?{id:card.id,rank:card.rank,suit:card.suit}:null;
export const hiddenHand=hand=>({count:hand.length});
