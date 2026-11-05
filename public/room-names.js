export const roomNames={
 en:['One More Game','Lucky Table','Last Game, Promise','Blame the Dice','Where’s My Joker?','No Mercy','Beginner’s Luck','The Usual Suspects','Just Warming Up','Coffee and Revenge','The Crooked Dice','Mars Express'],
 bg:['Още една партия','Масата на късмета','Последна, обещавам','Заровете са виновни','Къде ми е жокерът?','Без милост','Късметът на начинаещия','Обичайните заподозрени','Само загряваме','Кафе и реванш','Кривите зарове','Марс експрес']
};
const key=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function uniqueName(base,existing){
 const used=new Set(existing.map(key));base=base.trim().slice(0,30)||'Game room';
 if(!used.has(key(base)))return base;
 for(let n=2;;n++){const suffix=' '+n,candidate=base.slice(0,30-suffix.length)+suffix;if(!used.has(key(candidate)))return candidate;}
}
export function suggestName(existing,language='en',random=Math.random){
 const pool=roomNames[language]||roomNames.en,used=new Set(existing.map(key)),available=pool.filter(name=>!used.has(key(name)));
 const choices=available.length?available:pool;
 return uniqueName(choices[Math.floor(random()*choices.length)],existing);
}
