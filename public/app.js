import {suggestName} from "./room-names.js";
import { boardView, moveDestination, variantName } from "./backgammon-view.js";
import { translateInterface, translateText } from "./i18n.js";

const socket=io(), $=selector=>document.querySelector(selector);
let uiLanguage=localStorage.uiLanguage==="bg"?"bg":"en";
function localizeControls(root=document){translateInterface(root,uiLanguage)}
let soundMuted=localStorage.tabletopMuted==='1',audioContext=null,lastSoundAt={};
function audio(){
 if(soundMuted)return null;
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;
 audioContext||=new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});return audioContext;
}
function soundTone(ctx,frequency,start,duration,{type='sine',gain=.08,endFrequency=frequency}={}){
 const oscillator=ctx.createOscillator(),volume=ctx.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),start+duration);
 volume.gain.setValueAtTime(.0001,start);volume.gain.exponentialRampToValueAtTime(gain,start+.008);volume.gain.exponentialRampToValueAtTime(.0001,start+duration);oscillator.connect(volume).connect(ctx.destination);oscillator.start(start);oscillator.stop(start+duration+.01);
}
function playSound(kind){
 const now=performance.now();if(soundMuted||now-(lastSoundAt[kind]||0)<45)return;lastSoundAt[kind]=now;const ctx=audio();if(!ctx)return;const at=ctx.currentTime+.01;
 if(kind==='dice'){
  for(let i=0;i<9;i++)soundTone(ctx,170+i%3*55,at+i*.055,.045,{type:'square',gain:.035,endFrequency:95+i*8});
  soundTone(ctx,95,at+.48,.12,{type:'triangle',gain:.09,endFrequency:55});soundTone(ctx,145,at+.51,.1,{type:'triangle',gain:.07,endFrequency:75});
 }else if(kind==='checker'){
  soundTone(ctx,190,at,.055,{type:'triangle',gain:.11,endFrequency:85});soundTone(ctx,120,at+.035,.06,{type:'square',gain:.04,endFrequency:65});
 }else{
  soundTone(ctx,520,at,.075,{type:'triangle',gain:.045,endFrequency:210});soundTone(ctx,760,at+.035,.09,{type:'sine',gain:.035,endFrequency:330});
 }
}
function updateSoundToggle(){const button=$("#soundToggle"),english=soundMuted?'🔇 Muted':'🔊 Sound on';button.textContent=translateText(english,uiLanguage);button.setAttribute('aria-pressed',String(soundMuted));button.lang=uiLanguage}
document.addEventListener('pointerdown',()=>audio(),{capture:true});
$("#soundToggle").onclick=()=>{soundMuted=!soundMuted;localStorage.tabletopMuted=soundMuted?'1':'0';updateSoundToggle();if(!soundMuted)playSound('checker')};
updateSoundToggle();
let maintenance=null,invitation=null,lobbyPeople=[];
let signedAccount=null,authConfigured=false;
let me=null,room=null,selected=new Set(),stagedMelds=[],draggedCard=null,pendingRoom=null,browsingLobby=sessionStorage.getItem("tabletopView")==="lobby",arranging=false,arrangeFrom=null;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const player=id=>[...(room?.players||[]),...(room?.formerPlayers||[])].find(candidate=>candidate.id===id);
const playerName=id=>`<span data-no-translate>${esc(player(id)?.name||"Player")}</span>`;
const gameIsFinished=game=>Boolean(game?.winner||game?.finished);
const toast=message=>{const element=$("#toast");element.textContent=translateText(String(message||"Something went wrong."),uiLanguage);element.style.display="block";setTimeout(()=>element.style.display="none",3000)};
function renderAccount(){
 $("#authActions").hidden=!authConfigured&&!signedAccount;$("#googleSignIn").hidden=Boolean(signedAccount)||!authConfigured;
 $("#accountBadge").hidden=!signedAccount;$("#accountSignOut").hidden=!signedAccount;
 if(signedAccount)$("#accountBadge").textContent=`${signedAccount.displayName} · ${signedAccount.approved?"Rated":"Approval pending"}`;
}
async function loadAccount(){try{const response=await fetch('/api/account',{cache:'no-store'}),data=await response.json();authConfigured=Boolean(data.configured);signedAccount=data.account;renderAccount()}catch{}}
$("#accountSignOut").onclick=async()=>{await fetch('/auth/logout',{method:'POST'});location.reload()};
const ratingName=category=>({rummy:'Bulgarian Rummy','backgammon-normal':'Normal Backgammon','backgammon-rotate':'Backgammon rotation',santase:'Santase (66)',blato:'Blato (3-5-8)'})[category]||category;
async function loadScoreboard(){
 try{const response=await fetch('/api/scoreboard',{cache:'no-store'}),data=await response.json(),groups=(data.ratings||[]).reduce((all,row)=>{(all[row.category]||=[]).push(row);return all},{});
  $("#scoreboards").innerHTML=Object.keys(groups).length?`<div class="scoreboard-grid">${Object.entries(groups).map(([category,rows])=>`<div><h4>${esc(ratingName(category))}</h4><table><thead><tr><th>Player</th><th>Rating</th><th>Games</th></tr></thead><tbody>${rows.map(row=>`<tr><td data-no-translate>${esc(row.display_name)}</td><td>${Number(row.rating)}</td><td>${Number(row.games)}</td></tr>`).join("")}</tbody></table></div>`).join("")}</div>`:'<p>No rated matches yet.</p>';localizeControls($("#scoreboards"));
 }catch{$("#scoreboards").innerHTML='<p>Ratings are temporarily unavailable.</p>'}
}

socket.on("connect",()=>{
 $("#status").textContent="Connected";localizeControls();
 pendingRoom=null;
 checkServerVersion();
 const token=localStorage.token;
 if(token)socket.emit("identify",{token,name:localStorage.name},identified);
});
socket.on("disconnect",()=>{$("#status").textContent="Reconnecting…";localizeControls()});
function clearRoomState(){
 room=null;pendingRoom=null;selected.clear();stagedMelds=[];arranging=false;arrangeFrom=null;draggedCard=null;
 $("#game").replaceChildren();
}
function identified(response){
 if(!response?.ok){toast(response?.error);return}
 const hadRoom=Boolean(room||pendingRoom);
 localStorage.token=response.token;localStorage.name=response.player.name;me=response.player;
 $("#welcome").hidden=true;$("#profileActions").hidden=false;$("#currentName").textContent=me.name;
 if(!response.resumed){
   clearRoomState();setLobbyView(true);
   if(response.sessionReplaced&&hadRoom)toast("Your previous session expired. You are back in the lobby.");
 }else{
   $("#lobby").hidden=!browsingLobby;$("#room").hidden=browsingLobby||!room;
   if(pendingRoom){const next=pendingRoom;pendingRoom=null;showRoom(next)}
 }
 socket.emit("setView",{view:browsingLobby?"lobby":"room"});
}
$("#identity").onsubmit=event=>{event.preventDefault();socket.emit("identify",{token:localStorage.token,name:$("#name").value},identified)};

socket.on("identityChanged",player=>{me=player;localStorage.name=player.name;$("#currentName").textContent=player.name});
$("#renameOpen").onclick=()=>{$("#renameInput").value=me.name;$("#renameDialog").showModal()};
$("#renameSave").onclick=event=>{event.preventDefault();if(!$("#renameInput").reportValidity())return;socket.emit("rename",{name:$("#renameInput").value},response=>{if(response.ok)$("#renameDialog").close();else toast(response.error)})};
socket.on("signedOut",()=>{
 localStorage.removeItem("token");localStorage.removeItem("name");sessionStorage.removeItem("tabletopView");
 me=null;invitation=null;renderInvitation();clearRoomState();$("#welcome").hidden=false;$("#lobby").hidden=true;$("#room").hidden=true;$("#profileActions").hidden=true;$("#name").value="";
});
$("#signOut").onclick=()=>{
 const logout=()=>socket.emit("signOut",{},response=>{if(!response.ok)toast(response.error)});
 if(!room){logout();return}
 const warning=room.role==="watcher"?"Stop watching and sign out?":room.game&&!room.game.winner?"Leave your table and sign out? An active game will be forfeited and the match will end after this hand.":"Leave this table and sign out?";
 if(confirm(translateText(warning,uiLanguage)))socket.emit("leaveRoom",{},response=>{if(response.ok)logout();else toast(response.error)});
};
function gameTypeName(type){return ({rummy:"Bulgarian Rummy (Joker)",backgammon:"Backgammon",santase:"Santase (66)",blato:"Blato (3-5-8)"})[type]||type}
function canInvitgmu�h��춻�q�^t�почне…', 'Your hand':'Вашите карти',
 'Santase match':'Мач по сантасе','Blato match':'Мач по блато','Card match':'Мач с карти',
 'First to 11 match points wins.':'Печели първият достигнал 11 точки.','Nine deals rotate the 8, 5 and 3 targets.':'Девет раздавания редуват целите 8, 5 и 3.',
 'Trump card':'Козова карта','Current trick':'Текуща ръка','Last trick':'Последна ръка','Talon':'Талон','Closed':'Затворен',
 'Hands are hidden while you watch.':'Картите в ръцете са скрити при наблюдение.','Choose contract':'Изберете игра','Card exchange':'Размяна на карти',
 'Take the talon and return four cards':'Вземете талона и върнете четири карти','Public talon':'Открит талон','Deal complete':'Раздаването приключи','Deal result':'Резултат от раздаването',
 'Cut cards to assign 8, 5 and 3':'Цепете карти за определяне на 8, 5 и 3','Opening cut':'Начално цепене','Cut a card':'Цепи карта',
 'The 8-player announces trump before hands are opened':'Играчът на 8 обявява коз преди отварянето на картите','All dealt hands remain closed until trump is announced.':'Раздадените карти остават затворени до обявяването на коза.',
 'Private pulling':'Теглене','Public talon — discard four privately':'Открит талон — изхвърлете тайно четири карти','Trump':'Коз','Not announced':'Не е обявен',
 'Completed pulls':'Завършени тегления','Forgive this pull':'Прости това теглене','Discard selected four cards privately':'Изхвърли избраните четири карти тайно',
 'Staged melds':'Подготвени комбинации', 'Table melds':'Свалени комбинации',
 'Tap a card, then tap its destination. Tap Done arranging to select cards for play.':'Докоснете карта, после мястото ѝ. Натиснете „Готово с подреждането“, за да избирате карти за игра.',
 'Discard':'Изхвърлена карта', 'Empty':'Празно', 'Cards':'Карти', 'Raw':'Точки в ръката', 'Change':'Промяна',
 'Full hand':'Несвалил', 'Winner receives':'Победителят получава', 'match points':'точки',
 '(sprint ×2)':'(спринт ×2)', 'Remaining cards / Останали карти':'Останали карти',
 'Cumulative standings':'Общо класиране', 'Final standings':'Крайно класиране',
 'Your turn':'Ваш ред', 'Your move':'Ваш ход', "'s turn":' е на ред', "'s move":' е на ход',
 'wins!':'печели!', 'wins — Mars!':'печели — марс!', 'wins':'печели',
 'Left by forfeit:':'Напуснали със служебна загуба:', '. This is the last hand of this match.':'. Това е последната партия от мача.',
 'Choose the card represented by the joker':'Изберете картата, която жокерът замества',
 'Roll to decide who starts':'Хвърлете, за да определите кой започва',
 'Opening tie — both players roll again.':'Равенство — двамата играчи хвърлят отново.',
 'Each player rolls one die. Higher roll starts, then rolls both dice again.':'Всеки хвърля един зар. По-високият започва и хвърля двата зара наново.',
 'Opening rolls':'Начални хвърляния', 'Waiting…':'Изчакване…', 'Opening':'Начало', 'Turn':'Ход',
 'No legal moves remaining — turn passed':'Няма възможни ходове — редът преминава', 'Turn completed':'Ходът приключи',
 'Win by forfeit':'Служебна победа', 'Mars — opponent bore off no checkers':'Марс — противникът няма извадени пулове',
 'Win':'Победа', 'White':'Бели', 'Red':'Червени', 'Off board':'Извадени',
 'Bar — hit checkers':'Преграда — ударени пулове', 'Borne-off checkers':'Извадени пулове',
 'White moves toward point 1; red toward point 24. Choose a die, then a highlighted point. Hit checkers must re-enter from the center bar first. Undo steps back one move at a time until the final dice move. On doubles, the fourth move commits the turn. If blocked early, undo remains available until the opponent rolls.':'Белите се движат към позиция 1, червените — към позиция 24. Изберете зар, после осветена позиция. Ударените пулове трябва първо да влязат от средната преграда. Можете да връщате местенията едно по едно преди последното. При чифт четвъртото местене потвърждава хода. Ако няма повече възможни ходове, връщането е достъпно до хвърлянето на противника.',
 'An update is available.':'Има налично обновяване.',
 '🔊 Sound on':'🔊 Звукът е включен','🔇 Muted':'🔇 Без звук',
 'Leave permanently and forfeit this game? In Rummy, the remaining players finish this hand, then start a new match.':'Да напуснете ли окончателно със служебна загуба? При реми останалите довършват партията, след което започват нов мач.',
 'Leave permanently and forfeit this game? The current match will end.':'Да напуснете ли окончателно със служебна загуба? Текущият мач ще приключи.',
 'Leave this table permanently?':'Да напуснете ли тази маса окончателно?',
 'Your previous session expired. You are back in the lobby.':'Предишната ви сесия изтече. Върнахте се в лобито.',
 'This client is too old. Refresh the page.':'Тази версия е остаряла. Презаредете страницата.',
 'Something went wrong.':'Възникна грешка.', 'These cards cannot form a valid meld.':'Тези карти не образуват валидна комбинация.',
 'Select at least three cards.':'Изберете поне три карти.', 'A card is already assigned to another staged meld.':'Една от картите вече е в друга подготвена комбинация.',
 'Select one card.':'Изберете една карта.', 'Select cards from your hand.':'Изберете карти от ръката си.',
 'Select the exact replacement card from your hand.':'Изберете точната карта за замяна от ръката си.'
};

export function translateText(text, language) {
 if(language!=='bg')return text;
 const value=text.trim();
 let translated=labels[value];
 if(translated===undefined){
  translated=translateControl(value,language);
  translated=translated
   .replace(/^Normal backgammon · /,'Обикновена табла · ')
   .replace(/^Gulbara · /,'Гюлбара · ')
   .replace(/^Tapa · /,'Тапа · ')
   .replace(/Round (\d+) of (\d+)/g,'Кръг $1 от $2')
   .replace(/^ROOM ([A-Za-z0-9]+) · (rummy|backgammon|santase|blato)$/,(_,id,kind)=>`СТАЯ ${id} · ${labels[kind]}`)
   .replace(/^ROOM ([A-Za-z0-9]+) · (Bulgarian Rummy \(Joker\)|Backgammon|Santase \(66\)|Blato \(3-5-8\))$/,(_,id,kind)=>`СТАЯ ${id} · ${labels[kind]}`)
   .replace(/^(\d+)\/(\d+) players · (.+)$/, '$1/$2 играчи · $3')
   .replace(/Game (\d+) of (\d+)/g,'Партия $1 от $2')
   .replace(/Game (\d+)/g,'Партия $1')
   .replace(/Deal (\d+) of (\d+)/g,'Раздаване $1 от $2')
   .replace(/Deal (\d+)/g,'Раздаване $1')
   .replace(/ finished$/, ' приключи')
   .replace(/Your turn$/, 'Ваш ред')
   .replace(/SPRINT/g,'СПРИНТ')
   .replace(/^Point (\d+), (\d+) checkers$/, 'Позиция $1, $2 пула')
   .replace(/^Die (\d+)(, used)?$/, (_,die,used)=>`Зар ${die}${used?', използван':''}`)
   .replace(/^(White|Red) hit checkers: (\d+)$/,(_,side,n)=>`${labels[side]} ударени пулове: ${n}`)
   .replace(/^(White|Red) borne off: (\d+)$/,(_,side,n)=>`${labels[side]} извадени: ${n}`)
   .replace(/^Previous tie: ([\d :]+)$/, 'Предишно равенство: $1')
   .replace(/^Roll history — last (\d+) rolls$/, 'История — последни $1 хвърляния')
   .replace(/^receives (\d+) point\(s\)\.$/, 'получава $1 точки.')
   .replace(/^(\d+) cards · (\d+) raw points · (-?\d+) match points/, '$1 карти · $2 точки в ръката · $3 точки за мача')
   .replace(' · Full hand: 100 points / Неоткрит: 100 точки',' · Несвалил: 100 точки')
   .replace(/^Update available \(v(.+)\)\. Reload to use the latest game\.$/,'Налична е версия $1. Презаредете, за да използвате обновената игра.');
 }
 return text.slice(0,text.length-text.trimStart().length)+translated+text.slice(text.trimEnd().length);
}

const attributeOriginals=new WeakMap();
export function translateInterface(root,language){
 translateButtons(root,language);
 const doc=root.ownerDocument||root;
 const excluded='.playing-card,.die,.bg-point,.rules-language,[data-rules-lang],[data-no-translate],#roomName,#buildInfo,.roomCard h3,script,style,select#uiLanguage';
 const walker=doc.createTreeWalker(root,4);
 let node;
 while((node=walker.nextNode())){
  if(node.parentElement?.closest(excluded))continue;
  const saved=originals.get(node);
  const english=saved&&node.nodeValue===saved.rendered?saved.english:node.nodeValue;
  const rendered=translateText(english,language);
  if(node.nodeValue!==rendered)node.nodeValue=rendered;
  originals.set(node,{english,rendered});
 }
 for(const element of root.querySelectorAll('[placeholder],[aria-label]')){
  if(element.closest('.playing-card,.rules-language,[data-no-translate],#uiLanguage'))continue;
  const saved=attributeOriginals.get(element)||{};
  for(const attr of ['placeholder','aria-label']){
   if(!element.hasAttribute(attr))continue;
   const current=element.getAttribute(attr),previous=saved[attr];
   const english=previous&&current===previous.rendered?previous.english:current;
   const rendered=translateText(english,language);
   element.setAttribute(attr,rendered);saved[attr]={english,rendered};
  }
  attributeOriginals.set(element,saved);
 }
 doc.documentElement.lang=language;
}

