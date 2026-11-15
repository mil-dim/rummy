import "./quick-help.js";
import {suggestName} from "./room-names.js";
import { backgammonSound, boardView, moveDestination, variantName } from "./backgammon-view.js";
import { translateInterface, translateText } from "./i18n.js";

const socket=io(), $=selector=>document.querySelector(selector);
let uiLanguage=['en','bg','es'].includes(localStorage.uiLanguage)?localStorage.uiLanguage:'en';
function localizeControls(root=document){translateInterface(root,uiLanguage)}
let soundMuted=localStorage.tabletopMuted==='1',audioContext=null,lastSoundAt={};
const sampleSoundFiles=Object.freeze({dice:'/sounds/dice-hard-table.wav',checker:'/sounds/checker-stack-clack.wav',hit:'/sounds/checker-brutal-hit.wav'});
const sampleSoundVolumes=Object.freeze({dice:.72,checker:.58,hit:.82}),samplePlayers=new Map();
function samplePlayer(kind){
 if(!sampleSoundFiles[kind])return null;
 if(!samplePlayers.has(kind)){const player=new Audio(sampleSoundFiles[kind]);player.preload='auto';player.volume=sampleSoundVolumes[kind];samplePlayers.set(kind,player)}
 return samplePlayers.get(kind);
}
function cardAudio(){
 if(soundMuted)return null;
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;
 audioContext||=new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});return audioContext;
}
function soundTone(ctx,frequency,start,duration,{type='sine',gain=.08,endFrequency=frequency}={}){
 const oscillator=ctx.createOscillator(),volume=ctx.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),start+duration);
 volume.gain.setValueAtTime(.0001,start);volume.gain.exponentialRampToValueAtTime(gain,start+.008);volume.gain.exponentialRampToValueAtTime(.0001,start+duration);oscillator.connect(volume).connect(ctx.destination);oscillator.start(start);oscillator.stop(start+duration+.01);
}
function playSound(kind){
 const now=performance.now();if(soundMuted||now-(lastSoundAt[kind]||0)<45)return;lastSoundAt[kind]=now;
 const sample=samplePlayer(kind);if(sample){sample.currentTime=0;sample.play().catch(()=>{});return}
 const ctx=cardAudio();if(!ctx)return;const at=ctx.currentTime+.01;
 soundTone(ctx,520,at,.075,{type:'triangle',gain:.045,endFrequency:210});soundTone(ctx,760,at+.035,.09,{type:'sine',gain:.035,endFrequency:330});
}
function updateSoundToggle(){const button=$("#soundToggle"),english=soundMuted?'🔇 Muted':'🔊 Sound on';button.textContent=translateText(english,uiLanguage);button.setAttribute('aria-pressed',String(soundMuted));button.lang=uiLanguage}
document.addEventListener('pointerdown',()=>{for(const kind of Object.keys(sampleSoundFiles))samplePlayer(kind)?.load();cardAudio()},{capture:true,once:true});
$("#soundToggle").onclick=()=>{soundMuted=!soundMuted;localStorage.tabletopMuted=soundMuted?'1':'0';updateSoundToggle();if(!soundMuted)playSound('checker')};
updateSoundToggle();
let maintenance=null,invitation=null,lobbyPeople=[];
let signedAccount=null,authConfigured=false,feedbackConfigured=false;
let me=null,room=null,selected=new Set(),stagedMelds=[],draggedCard=null,pendingRoom=null,browsingLobby=sessionStorage.getItem("tabletopView")==="lobby",arranging=false,arrangeFrom=null;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const player=id=>[...(room?.players||[]),...(room?.formerPlayers||[])].find(candidate=>candidate.id===id);
const playerName=id=>{const item=player(id);return `<span data-no-translate>${item?.bot?"🤖 ":""}${esc(item?.name||"Player")}</span>`};
const plainPlayerName=id=>player(id)?.name||"Player";
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
function browserProfile(){
 const locale=navigator.language||"";let country="";
 try{country=new Intl.Locale(locale).region||""}catch{const match=locale.match(/[-_]([A-Za-z]{2})$/);country=match?match[1].toUpperCase():""}
 let timeZone="";try{timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch{}
 return {locale,country,timeZone};
}
const identification=(token,name)=>({token,name,...browserProfile()});

socket.on("connect",()=>{
 $("#status").textContent="Connected";localizeControls();
 pendingRoom=null;
 checkServerVersion();
 const token=localStorage.token;
 if(token)socket.emit("identify",identification(token,localStorage.name),identified);
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
 feedbackConfigured=Boolean(response.feedbackConfigured);$("#feedbackOpen").hidden=!feedbackConfigured;
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
$("#identity").onsubmit=event=>{event.preventDefault();socket.emit("identify",identification(localStorage.token,$("#name").value),identified)};

socket.on("identityChanged",player=>{me=player;localStorage.name=player.name;$("#currentName").textContent=player.name});
$("#renameOpen").onclick=()=>{$("#renameInput").value=me.name;$("#renameDialog").showModal()};
$("#renameSave").onclick=event=>{event.preventDefault();if(!$("#renameInput").reportValidity())return;socket.emit("rename",{name:$("#renameInput").value},response=>{if(response.ok)$("#renameDialog").close();else toast(response.error)})};
socket.on("signedOut",()=>{
 localStorage.removeItem("token");localStorage.removeItem("name");sessionStorage.removeItem("tabletopView");
 me=null;invitation=null;renderInvitation();clearRoomState();$("#welcome").hidden=false;$("#lobby").hidden=true;$("#room").hidden=true;$("#profileActions").hidden=true;$("#feedbackOpen").hidden=true;$("#name").value="";
});
$("#signOut").onclick=()=>{
 const logout=()=>socket.emit("signOut",{},response=>{if(!response.ok)toast(response.error)});
 if(!room){logout();return}
 const warning=room.role==="watcher"?"Stop watching and sign out?":room.game&&!room.game.winner?"Leave your table and sign out? An active game will be forfeited and the match will end after this hand.":"Leave this table and sign out?";
 if(confirm(translateText(warning,uiLanguage)))socket.emit("leaveRoom",{},response=>{if(response.ok)logout();else toast(response.error)});
};
function gameTypeName(type){return ({rummy:"Bulgarian Rummy (Joker)",backgammon:"Backgammon",santase:"Santase (66)",blato:"Blato (3-5-8)",crossroads:"Crossroads of Thrace"})[type]||type}
function canInvite(person){return Boolean(room?.role==="player"&&!room.game&&room.players.length<room.maxPlayers&&!maintenance&&person.id!==me?.id&&person.connected&&person.roomId!==room.id&&!(room.gameType==='crossroads'&&person.bot))}
function renderPeople(){
 $("#people").innerHTML=lobbyPeople.map(person=>`<p><span><span data-no-translate>${person.bot?"🤖 ":""}${esc(person.name)}</span> · <span>${esc(person.activity)}</span>${person.roomName?` · <span data-no-translate>${esc(person.roomName)}</span>`:""}</span>${canInvite(person)?` <button class="small ghost" data-invite="${esc(person.id)}">Invite</button>`:""}</p>`).join("")||"<p>No one here yet.</p>";localizeControls();
}
socket.on("people",people=>{lobbyPeople=people;renderPeople()});
document.addEventListener("click",event=>{const id=event.target.closest?.("[data-invite]")?.dataset.invite;if(id)socket.emit("invitePlayer",{playerId:id},response=>response?.ok?toast("Invitation sent."):toast(response?.error))});

function renderInvitation(){
 const panel=$("#invitationNotice");panel.hidden=!invitation;if(!invitation)return;
 $("#invitationFrom").textContent=invitation.fromName;$("#invitationRoom").textContent=invitation.roomName;$("#invitationGame").textContent=gameTypeName(invitation.gameType);
 $("#invitationAccept").hidden=!invitation.actionable;$("#invitationDecline").textContent=invitation.actionable?"Decline":"Later";
 $("#invitationHint").textContent=invitation.actionable?"":"You are at another table. You can use this invitation after you leave it.";localizeControls(panel);
}
socket.on("gameInvitation",value=>{invitation=value;renderInvitation()});
function answerInvitation(accept){
 if(!invitation)return;const id=invitation.id;
 socket.emit("respondInvitation",{id,accept},response=>{if(!response?.ok){toast(response?.error);return}invitation=null;renderInvitation();if(response.joined)setLobbyView(false)});
}
$("#invitationAccept").onclick=()=>answerInvitation(true);
$("#invitationDecline").onclick=()=>{if(invitation?.actionable)answerInvitation(false);else $("#invitationNotice").hidden=true};
function renderMaintenance(){
 $("#maintenanceNotice").hidden=!maintenance;if(!maintenance)return;
 const seconds=Math.max(0,Math.ceil((maintenance.deadline-Date.now())/1000));
 $("#maintenanceCountdown").textContent=seconds?translateText("Planned restart in",uiLanguage)+` ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`:translateText("Maintenance is due. Waiting for the operator.",uiLanguage);
 $("#maintenanceMessage").textContent=maintenance.message;
}
socket.on("maintenance",notice=>{maintenance=notice;renderMaintenance();renderLobby();if(room&&me)updateStartButton()});
setInterval(renderMaintenance,1000);

let lobbyRooms=[];
function memberList(members){return members?.length?members.map(member=>`<span class="member-name">${member.connected?"●":"○"} <span data-no-translate>${member.bot?"🤖 ":""}${esc(member.name)}</span></span>`).join(" "):"<span>None</span>"}
function currentGameLabel(item){
 const game=item.currentGame;if(!game)return "";
 const rated=game.rated?" · Rated":"";
 if(item.gameType==="rummy")return `Game ${game.number}${game.totalGames?` of ${game.totalGames}`:""}${game.sprint?" · SPRINT ×2":""}${rated}`;
 if(item.gameType==="santase")return `Deal ${game.number} · first to 11${rated}`;
 if(item.gameType==="blato")return `Deal ${game.number} of ${game.totalGames||9}${rated}`;
 if(item.gameType==="crossroads")return "Founding game · first to 10 points";
 return `${variantName(game.variant)}${game.round&&game.roundCount?` · Round ${game.round} of ${game.roundCount}`:""} · Game ${game.number}${game.totalGames?` of ${game.totalGames}`:""}${rated}`;
}
function renderLobby(){
 $("#rooms").innerHTML=lobbyRooms.map(item=>`<article class="roomCard"><p class="eyebrow">${esc(gameTypeName(item.gameType))}</p><h3>${esc(item.name)}</h3><p>${Number(item.players)}/${Number(item.maxPlayers)} players · ${esc(item.id)}</p><p class="room-status"><span>${item.status==="finished"?"Finished":item.started?"In progress":"Waiting for players"}</span></p>${item.currentGame?`<p class="room-current"><strong>Current game</strong>: <span>${esc(currentGameLabel(item))}</span></p>`:""}<p class="room-members"><strong>Players</strong>: ${memberList(item.playerList)}</p><p class="room-watchers"><strong>Watchers</strong>: ${memberList(item.watchers)}</p><div class="actions"><button data-join="${esc(item.id)}" ${item.started||room||maintenance?"disabled":""}>${item.started?"In progress":"Join table"}</button><button data-watch="${esc(item.id)}" class="ghost" ${room?"disabled":""}>Watch</button></div></article>`).join("")||"<p>No open rooms yet.</p>";
 $("#resumeArea").hidden=!room;$("#newRoom").disabled=Boolean(room||maintenance);
 const watching=room?.role==="watcher";
 $("#resumeGame").textContent=watching?"Resume watching":"Resume game";
 $("#leaveLobby").textContent=watching?"Stop watching":"Leave game";
 $("#resumeHint").textContent=watching?"You are watching a table. Stop watching before joining another.":"Your seat is reserved. Leave before joining another table.";
 renderPeople();localizeControls();
}
socket.on("lobby",rooms=>{lobbyRooms=rooms;renderLobby();loadScoreboard()});
document.addEventListener("click",event=>{const id=event.target.dataset.join;if(id&&!room){browsingLobby=false;sessionStorage.setItem("tabletopView","room");socket.emit("joinRoom",{id},response=>!response.ok&&toast(response.error))}});
document.addEventListener("click",event=>{
 const button=event.target.closest?.("[data-watch]");
 if(button&&!room){browsingLobby=false;sessionStorage.setItem("tabletopView","room");socket.emit("watchRoom",{id:button.dataset.watch},response=>{if(!response.ok){setLobbyView(true);toast(response.error)}})}
});
$("#newRoom").onclick=()=>{$("#createName").value=suggestName(lobbyRooms.map(r=>r.name),uiLanguage);$("#create").showModal()};
$("#gameType").onchange=()=>{const type=$("#gameType").value,fixed=!['rummy','crossroads'].includes(type);$("#maxPlayers").disabled=fixed;if(type==="blato")$("#maxPlayers").value=3;else if(type==="crossroads"){$("#maxPlayers").min=3;$("#maxPlayers").max=4;$("#maxPlayers").value=3}else if(type==="rummy"){$("#maxPlayers").min=2;$("#maxPlayers").max=6;$("#maxPlayers").value=2}else if(fixed)$("#maxPlayers").value=2};
$("#createGo").onclick=event=>{event.preventDefault();socket.emit("createRoom",{name:$("#createName").value,language:uiLanguage,gameType:$("#gameType").value,maxPlayers:$("#maxPlayers").value},response=>{if(response.ok){$("#create").close();setLobbyView(false)}else toast(response.error)})};

function setLobbyView(value){
 browsingLobby=value;if(me)socket.emit("setView",{view:value?"lobby":"room"});sessionStorage.setItem("tabletopView",value?"lobby":"room");
 $("#lobby").hidden=!value;$("#room").hidden=value;renderLobby();
}
$("#backLobby").onclick=()=>setLobbyView(true);
$("#resumeGame").onclick=()=>{if(room){setLobbyView(false);renderGame()}};
function leaveGame(){
 if(!room)return;
 if(room.role==="watcher"){socket.emit("leaveRoom",{},response=>{if(!response?.ok)toast(response?.error)});return}
 const message=room.game&&!room.game.winner
   ?"Leave permanently and forfeit this game? The current match will end."
   :"Leave this table permanently?";
 if(confirm(translateText(message,uiLanguage)))socket.emit("leaveRoom",{},response=>{if(!response?.ok)toast(response?.error)});
}
$("#leaveGame").onclick=leaveGame;
$("#leaveLobby").onclick=leaveGame;
socket.on("roomLeft",()=>{
 clearRoomState();setLobbyView(true);
});

function updateStartButton(){
 const button=$("#start");
 if(room.role==="watcher"||room.hostId!==me.id||room.game&&!gameIsFinished(room.game)){button.hidden=true;return}
 button.hidden=false;button.disabled=Boolean(maintenance);
 if(!room.game)button.textContent="Start match";
 else if(room.match?.finished)button.textContent="New match";
 else button.textContent="Next game";
}
function renderBackgammonFormat(){
 const rotating=$("#bgVariantMode").value==="rotate";
 $("#bgCountLabel").textContent=translateText(rotating?"Number of rounds":"Number of games",uiLanguage);
 $("#bgFormatHint").textContent=translateText(rotating?"One round: Normal Backgammon → Gulbara → Tapa.":"Every game uses Normal Backgammon.",uiLanguage);
}
function configureRated(checkbox){
 const eligible=room?.players?.length>1&&room.players.every(player=>player.account?.approved);
 checkbox.disabled=!eligible;checkbox.checked=eligible&&checkbox.checked;
 const hint=checkbox.closest('form').querySelector('.ratedHint');hint.textContent=translateText(eligible?'Optional: results will update the public rating.':'Rated play requires every player to sign in and receive approval.',uiLanguage);
}
$("#bgVariantMode").onchange=renderBackgammonFormat;
$("#start").onclick=()=>{
 if(room.gameType==="backgammon"&&(!room.match||room.match.finished)){renderBackgammonFormat();configureRated($("#bgRated"));$("#bgMatchSetup").showModal();return}
 if(room.gameType==="rummy"&&(!room.match||room.match.finished)){configureRated($("#rummyRated"));$("#matchSetup").showModal();return}
 if(["santase","blato"].includes(room.gameType)&&(!room.match||room.match.finished)){
  $("#cardMatchTitle").textContent=room.gameType==="santase"?"Santase match":"Blato match";
  $("#cardMatchHint").textContent=room.gameType==="santase"?"First to 11 match points wins.":"Nine deals rotate the 8, 5 and 3 targets.";
  configureRated($("#cardRated"));$("#cardMatchSetup").showModal();localizeControls($("#cardMatchSetup"));return;
 }
 socket.emit("startGame",{},response=>!response.ok&&toast(response.error));
};
$("#matchGo").onclick=event=>{event.preventDefault();socket.emit("startGame",{sprintCount:Number($("#sprintCount").value),rated:$("#rummyRated").checked},response=>{if(response.ok)$("#matchSetup").close();else toast(response.error)})};

$("#bgMatchGo").onclick=event=>{
 event.preventDefault();const input=$("#bgGameCount");if(!input.reportValidity())return;
 socket.emit("startGame",{roundCount:Number(input.value),variantMode:$("#bgVariantMode").value,rated:$("#bgRated").checked},response=>{if(response.ok)$("#bgMatchSetup").close();else toast(response.error)});
};
$("#cardMatchGo").onclick=event=>{event.preventDefault();socket.emit("startGame",{rated:$("#cardRated").checked},response=>{if(response.ok)$("#cardMatchSetup").close();else toast(response.error)})};

function cardStateSignature(game){
 if(!game||game.kind==='backgammon')return '';
 return JSON.stringify([game.phase,game.turn,game.stock,game.discard,game.hands,game.melds,game.trick,game.played,game.kitty,game.lastTrick]);
}
function announceGameSound(previous,next){
 const before=previous?.game,after=next?.game;
 if(!before||!after||previous.id!==next.id||before.kind!==after.kind||before.gameNumber!==after.gameNumber)return;
 if(after.kind==='backgammon'){
  const kind=backgammonSound(before,after);if(kind)playSound(kind);
 }else if(cardStateSignature(before)!==cardStateSignature(after))playSound('card');
}

function showRoom(next){
 if(!me){pendingRoom=next;return}
 if(Number(next.protocolVersion)>14){toast("This client is too old. Refresh the page.");return}
 const previousRoom=room;announceGameSound(previousRoom,next);
 const previousGame=room?.game?.gameNumber;
 const changedRoom=room?.id!==next.id;
 room=next;
 if(changedRoom||previousGame!==room.game?.gameNumber){selected.clear();stagedMelds=[];arrangeFrom=null}
 $("#lobby").hidden=!browsingLobby;$("#room").hidden=browsingLobby;
 renderLobby();
 $("#roomCode").textContent=`ROOM ${room.id} · ${gameTypeName(room.gameType)}`;
 $("#roomName").textContent=room.name;
 $("#players").innerHTML=room.players.map((item,index)=>`<span>${room.gameType==="backgammon"?`<i class="player-checker side-${room.game?room.game.players.indexOf(item.id):index}" aria-hidden="true"></i><span>${(room.game?room.game.players.indexOf(item.id):index)===0?"White":"Red"}</span> `:""}${item.connected?"●":"○"} <span data-no-translate>${item.bot?"🤖 ":""}${esc(item.name)}</span></span>`).join("");
 $("#watchers").innerHTML=`<strong>Watchers</strong>: ${memberList(room.watchers)}`;
 $("#watchingNotice").hidden=room.role!=="watcher";
 $("#leaveGame").textContent=room.role==="watcher"?"Stop watching":"Leave game";
 updateStartButton();renderGame();
}
socket.on("room",showRoom);

function act(action,onSuccess){
 socket.emit("action",action,response=>{
   if(!response?.ok){toast(response?.error);return}
   selected.clear();if(onSuccess)onSuccess();
 });
}

function declared(card){return card.rank==="JOKER"&&card.represents?`${card.represents.rank}${card.represents.suit}`:""}
function cardHtml(card,{hand=false,proof=false}={}){
 const joker=card.rank==="JOKER",red=!joker&&"♥♦".includes(card.suit),label=declared(card);
 return `<button class="playing-card ${red?"red":"black"} ${joker?"joker":""} ${(!proof&&(hand&&arranging?arrangeFrom===card.id:selected.has(card.id)))?"selected":""}" ${proof?"disabled":""} ${hand?`data-hand-card="${esc(card.id)}" draggable="true"`:""} aria-label="${joker?`Joker ${esc(label)}`:`${esc(card.rank)} of ${esc(card.suit)}`}">
 <span class="corner top"><b>${joker?"★":esc(card.rank)}</b><i>${joker?esc(label):esc(card.suit)}</i></span>
 <span class="pip">${joker?(label?`JOKER<br><small>→ ${esc(label)}</small>`:"JOKER"):esc(card.suit)}</span>
 <span class="corner bottom"><b>${joker?"★":esc(card.rank)}</b><i>${joker?esc(label):esc(card.suit)}</i></span></button>`;
}

function trickCard(card,{id=card.id,disabled=false,selectedCard=false}={}){
 return cardHtml(card).replace('<button class="playing-card ',`<button data-trick-card="${esc(id)}" class="playing-card ${selectedCard?'selected ':''}`).replace(' aria-label=',`${disabled?' disabled':''} aria-label=`);
}

function renderSantase(game){
 const watching=room.role==='watcher',side=game.players.indexOf(me.id),mine=side>=0&&game.turn===side&&!game.finished;
 const hand=Array.isArray(game.hands[side])?game.hands[side]:[],legal=new Set(game.legalCardIds||[]),chosen=hand.find(card=>selected.has(card.id));
 const canMarriage=chosen&&game.trick.length===0&&game.tricksWon[side]>0&&['K','Q'].includes(chosen.rank)&&hand.some(card=>card.suit===chosen.suit&&card.rank===(chosen.rank==='K'?'Q':'K'));
 const scoreLine=game.players.map((id,index)=>`${playerName(id)}: <strong>${Number(game.cardPoints[index])+Number(game.marriagePoints[index])}</strong> (${Number(game.tricksWon[index])} tricks)`).join(' · ');
 const status=game.finished?(game.draw?'Equal points — redeal':`${playerName(game.winner)} wins ${Number(game.awarded)} match point(s)`):`${mine?'Your turn':playerName(game.players[game.turn])+"'s turn"}`;
 $("#game").innerHTML=`<section class="trick-game"><p class="bg-progress">Santase · Deal ${Number(game.gameNumber)}${room.match?.rated?' · Rated':''} · First to 11</p>
  <div class="trick-status"><h3>${status}</h3><p>${scoreLine}</p><p>Trump: <strong>${esc(game.trumpSuit)}</strong> · Talon: ${Number(game.stock.count)}${game.closed?' · Closed':''}</p></div>
  <div class="trick-table"><div><h4>Trump card</h4>${game.trumpCard?trickCard(game.trumpCard,{disabled:true}):'<p>Taken</p>'}</div><div><h4>Current trick</h4><div class="card-row">${game.trick.map(item=>trickCard(item.card,{disabled:true})).join('')||'<span>Waiting for lead…</span>'}</div></div></div>
  ${game.lastTrick?`<details><summary>Last trick</summary><div class="card-row">${game.lastTrick.cards.map(card=>trickCard(card,{disabled:true})).join('')}</div></details>`:''}
  ${game.finished?`<section class="results"><h3>${game.reason==='false-claim'?'Incorrect 66 claim':game.reason==='failed-close'?'Talon close failed':game.draw?'65–65 draw':'Deal complete'}</h3></section>${standings()}`:''}
  ${!watching&&!game.finished?`<section><h3>Your hand</h3><div class="card-row santase-hand">${hand.map(card=>trickCard(card,{disabled:!legal.has(card.id),selectedCard:selected.has(card.id)})).join('')}</div>
   <div class="actions"><label><input id="announceMarriage" type="checkbox" ${canMarriage?'':'disabled'}> Announce ${canMarriage?(chosen.suit===game.trumpSuit?'40':'20'):''}</label><button id="playSantase" ${chosen&&legal.has(chosen.id)?'':'disabled'}>Play card</button><button id="claim66">Claim 66</button><button id="closeTalon" ${game.canClose?'':'disabled'}>Close talon</button><button id="exchangeTrump" ${game.canExchange?'':'disabled'}>Exchange trump 9</button></div></section>`:''}
  ${watching&&!game.finished?'<p class="notice">Hands are hidden while you watch.</p>':''}</section>`;
 document.querySelectorAll('[data-trick-card]:not([disabled])').forEach(button=>button.onclick=()=>{selected.clear();selected.add(button.dataset.trickCard);renderSantase(game);localizeControls()});
 $("#playSantase")?.addEventListener('click',()=>{if(chosen)act({type:'play',cardId:chosen.id,announce:Boolean($("#announceMarriage")?.checked)})});
 $("#claim66")?.addEventListener('click',()=>act({type:'claim66'}));
 $("#closeTalon")?.addEventListener('click',()=>act({type:'close'}));
 $("#exchangeTrump")?.addEventListener('click',()=>act({type:'exchangeTrump'}));
}

function renderBlato(game){
 const watching=room.role==='watcher',side=game.players.indexOf(me.id);
 const hand=Array.isArray(game.hands[side])?game.hands[side]:[],legal=new Set(game.legalCardIds||[]),pullEligible=new Set(game.pullEligibleCardIds||[]);
 const seats=game.players.map((id,index)=>`${playerName(id)}: target ${game.targets[index]??'?'}, tricks ${Number(game.tricks[index])}${game.scores?`, ${signedPoints(game.scores[index])}`:''}`).join(' · ');
 const phaseName={cut:'Cut cards to assign 8, 5 and 3',declareTrump:'The 8-player announces trump before hands are opened',pull:'Private pulling',kitty:'Public talon — discard four privately',play:'Play',finished:'Deal complete'}[game.phase]||game.phase;
 const kittyCards=Array.isArray(game.kitty)?game.kitty:[],pullStep=game.exchangeQueue[0],maxPull=Number(pullStep?.maxCount||0);
 const cutLine=game.phase==='cut'?`<section class="cut-cards"><h3>Opening cut</h3><div class="card-row">${game.players.map((id,index)=>game.cutCards[index]?`<div><span>${playerName(id)}</span>${trickCard(game.cutCards[index],{disabled:true})}</div>`:`<div><span>${playerName(id)}</span><p>Waiting…</p></div>`).join('')}</div>${game.canCut?'<button id="cutBlato">Cut a card</button>':''}</section>`:'';
 $("#game").innerHTML=`<section class="trick-game"><p class="bg-progress">Blato · Deal ${Number(game.gameNumber)} of 9${room.match?.rated?' · Rated':''}</p>
  <div class="trick-status"><h3>${game.finished?`${game.winners.map(playerName).join(', ')} ${game.winners.length>1?'win':'wins'} the deal`:phaseName}</h3><p>${seats}</p><p>Trump: <strong>${game.contract||'Not announced'}</strong></p></div>
  ${cutLine}
  ${game.phase==='declareTrump'&&game.canDeclareTrump?`<div class="actions contract-buttons">${['♠','♥','♦','♣'].map(suit=>`<button data-trump="${suit}">${suit}</button>`).join('')}</div>`:''}
  ${game.phase==='declareTrump'?'<p class="notice">All dealt hands remain closed until trump is announced.</p>':''}
  ${game.phase==='pull'?`<p class="notice">${playerName(pullStep?.giver)} may privately pull up to ${maxPull} card(s) from ${playerName(pullStep?.receiver)}. Trump cards cannot be used. ${game.exchangeQueue.length} pull(s) remain.</p>`:''}
  ${kittyCards.length?`<section><h3>Public talon</h3><div class="card-row">${kittyCards.map(card=>trickCard(card,{disabled:true})).join('')}</div></section>`:''}
  ${game.phase==='play'?`<section class="trick-table"><div><h4>Current trick</h4><div class="card-row">${game.trick.map(item=>trickCard(item.card,{disabled:true})).join('')||'<span>Waiting for lead…</span>'}</div></div></section>`:''}
  ${game.lastTrick?`<details><summary>Last trick</summary><div class="card-row">${game.lastTrick.cards.map(card=>trickCard(card,{disabled:true})).join('')}</div></details>`:''}
  ${!watching&&!game.finished?`<section><h3>Your hand</h3><div class="card-row blato-hand">${hand.map(card=>trickCard(card,{disabled:game.phase==='play'?!legal.has(card.id):game.phase==='pull'?!pullEligible.has(card.id):game.phase==='kitty'?!game.canDiscardKitty:true,selectedCard:selected.has(card.id)})).join('')}</div>
   ${game.phase==='pull'&&game.canPull?`<div class="actions"><button id="pullBlato">Pull selected (${selected.size}/${maxPull})</button><button id="forgivePull">Forgive this pull</button></div>`:''}
   ${game.phase==='kitty'&&game.canDiscardKitty?`<button id="discardKitty" ${selected.size===4?'':'disabled'}>Discard selected four cards privately</button>`:''}</section>`:''}
  ${game.exchangeLog?.length?`<details><summary>Completed pulls</summary>${game.exchangeLog.map(step=>`<p>${playerName(step.giver)} / ${playerName(step.receiver)}: ${Number(step.count)} card(s)${step.given?` — ${step.given.map(card=>`${card.rank}${card.suit}`).join(', ')} → ${step.returned.map(card=>`${card.rank}${card.suit}`).join(', ')}`:''}</p>`).join('')}</details>`:''}
  ${game.finished?`<section class="results"><h3>${game.forfeit?'Deal forfeited':'Deal result'}</h3></section>${standings()}`:''}
  ${watching&&!game.finished?'<p class="notice">Hands are hidden while you watch.</p>':''}</section>`;
 $("#cutBlato")?.addEventListener('click',()=>act({type:'cut'}));
 document.querySelectorAll('[data-trump]').forEach(button=>button.onclick=()=>act({type:'declareTrump',suit:button.dataset.trump}));
 document.querySelectorAll('[data-trick-card]:not([disabled])').forEach(button=>button.onclick=()=>{
  const id=button.dataset.trickCard;if(game.phase==='play'){act({type:'play',cardId:id});return}
  selected.has(id)?selected.delete(id):selected.add(id);const limit=game.phase==='pull'?maxPull:4;if(selected.size>limit)selected.delete(selected.values().next().value);
  renderBlato(game);localizeControls();
 });
 $("#pullBlato")?.addEventListener('click',()=>act({type:'pull',cardIds:[...selected]}));
 $("#forgivePull")?.addEventListener('click',()=>act({type:'pull',cardIds:[]}));
 $("#discardKitty")?.addEventListener('click',()=>act({type:'discardKitty',cardIds:[...selected]}));
}

const crossResource={timber:'Timber',stone:'Stone',livestock:'Livestock',grain:'Grain',metal:'Metal'};
const crossIcon={timber:'🌲',stone:'🪨',livestock:'🐑',grain:'🌾',metal:'⛏️',wasteland:'🏜️'};
const crossProgress={guard:'Guard — strengthens your guard',routes:'Two free trade routes',bounty:'Two materials of your choice',monopoly:'Material monopoly',victory:'Hidden victory point'};
const crossColors=['#315c45','#b84432','#d39424','#526fa8'];
function crossBundleInputs(prefix){return Object.keys(crossResource).map(name=>`<label>${crossIcon[name]} <input type="number" min="0" max="19" value="0" data-cross-bundle="${prefix}" data-resource="${name}" aria-label="${crossResource[name]}"></label>`).join('')}
function readCrossBundle(prefix){const value={};document.querySelectorAll(`[data-cross-bundle="${prefix}"]`).forEach(input=>value[input.dataset.resource]=Number(input.value)||0);return value}
function crossHexPoints(game,hex){return hex.vertices.map(id=>{const vertex=game.board.vertices[id];return `${vertex.x},${vertex.y}`}).join(' ')}
function crossStatus(game,side){
 if(game.finished)return `${playerName(game.winner)} wins Crossroads of Thrace`;
 if(game.phase==='opening')return game.can?.openingRoll?'Roll both dice to decide who places first':'Waiting for the opening rolls';
 if(game.phase==='discard')return game.pendingDiscards[side]?`Return ${game.pendingDiscards[side]} materials after the seven`:'Waiting for other players to return materials';
 if(game.turn!==side)return `${playerName(game.players[game.turn])}'s turn`;
 return ({'setup-village':'Place a starting village','setup-route':'Place a trade route beside it',roll:'Roll the dice',raider:'Move the raider',action:'Build, trade, or end your turn','free-routes':`Place ${game.freeRoutes} free trade route${game.freeRoutes===1?'':'s'}`})[game.phase]||game.phase;
}
function renderCrossroads(game){
 const watching=room.role==='watcher',side=game.players.indexOf(me.id),mine=side>=0&&game.turn===side&&!game.finished,own=side>=0?game.resources[side]:null;
 const buildings=new Map(game.buildings.map(item=>[item.vertex,item])),routes=new Map(game.routes.map(item=>[item.edge,item]));
 const harborByEdge=new Map(game.board.harbors.map(item=>[item.edge,item.kind]));
 const hexes=game.board.hexes.map(hex=>{const tile=game.board.tiles[hex.id],raider=game.board.raider===hex.id,victims=game.eligibleVictims?.[hex.id]||[];return `<g class="cross-hex ${mine&&game.phase==='raider'&&hex.id!==game.board.raider?'selectable':''}" data-cross-tile="${hex.id}" data-victims="${victims.join(',')}"><polygon points="${crossHexPoints(game,hex)}" class="terrain-${tile.resource}"></polygon><text x="${hex.x}" y="${hex.y-1.2}" class="terrain-icon">${crossIcon[tile.resource]}</text>${tile.number?`<circle cx="${hex.x}" cy="${hex.y+4}" r="2.8" class="number-token"></circle><text x="${hex.x}" y="${hex.y+5}" class="number-text ${[6,8].includes(tile.number)?'hot':''}">${tile.number}</text>`:''}${raider?`<text x="${hex.x+5}" y="${hex.y-4}" class="raider">⚔</text>`:''}</g>`}).join('');
 const edgeLines=game.board.edges.map(edge=>{const a=game.board.vertices[edge.a],b=game.board.vertices[edge.b],route=routes.get(edge.id),legal=game.legalEdges.includes(edge.id),harbor=harborByEdge.get(edge.id),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;return `<g>${route?`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="cross-route" style="stroke:${crossColors[route.side]}"></line>`:''}${legal?`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="cross-route-target" data-cross-edge="${edge.id}"></line>`:''}${harbor?`<text x="${mx}" y="${my}" class="harbor-mark">${harbor==='any'?'3:1':crossIcon[harbor]+' 2:1'}</text>`:''}</g>`}).join('');
 const vertexMarks=game.board.vertices.map(vertex=>{const building=buildings.get(vertex.id),legal=game.legalVertices.includes(vertex.id);if(building){const ownBuilding=building.side===side&&mine&&game.phase==='action';return building.type==='town'?`<rect x="${vertex.x-2.2}" y="${vertex.y-2.2}" width="4.4" height="4.4" rx=".5" class="cross-building" fill="${crossColors[building.side]}"></rect>`:`<circle cx="${vertex.x}" cy="${vertex.y}" r="2.1" class="cross-building ${ownBuilding?'upgradeable':''}" fill="${crossColors[building.side]}" ${ownBuilding?`data-cross-town="${vertex.id}"`:''}></circle>`}return legal?`<circle cx="${vertex.x}" cy="${vertex.y}" r="2" class="cross-vertex-target" data-cross-vertex="${vertex.id}"></circle>`:''}).join('');
 const standings=game.players.map((id,index)=>`<span class="cross-seat ${index===game.turn&&!game.finished&&game.phase!=='opening'?'current':''}"><i style="background:${crossColors[index]}"></i>${playerName(id)} · ${game.scores[index]} VP · ${game.resources[index].count??Object.values(game.resources[index]).reduce((a,b)=>a+b,0)} materials · ${game.fortunes[index].count??game.fortunes[index].length} Progress cards</span>`).join('');
 const resourcePanel=own?`<section class="cross-hand"><h4>Your materials</h4>${Object.entries(crossResource).map(([name,label])=>`<span>${crossIcon[name]} ${label}: <b>${Number(own[name]||0)}</b></span>`).join('')}<span>🎴 Progress cards: <b>${game.fortunes[side].length}</b></span><span>Victory points: <b>${game.privateScore}</b></span></section>`:'';
 const opening=game.phase==='opening'?`<section class="opening-rolls"><p>${game.openingPrevious?'Opening tie — highlighted players roll again.':'Everyone rolls two dice. Highest total places first.'}</p>${game.players.map((id,index)=>`<div><span>${playerName(id)}</span>${game.openingRolls[index]?`<strong>🎲 ${game.openingRolls[index][0]} + ${game.openingRolls[index][1]} = ${game.openingRolls[index][0]+game.openingRolls[index][1]}</strong>`:`<span>${game.openingCandidates.includes(index)?'Waiting…':'Tie resolved'}</span>`}</div>`).join('')}</section>`:'';
 const discard=side>=0&&game.pendingDiscards[side]?`<section class="cross-action-card"><h4>Return exactly ${game.pendingDiscards[side]} materials</h4><div class="cross-bundle">${crossBundleInputs('discard')}</div><button id="crossDiscard">Return materials</button></section>`:'';
 const trade=game.trade?`<section class="cross-action-card"><h4>Trade offered by ${playerName(game.players[game.trade.from])}</h4><p>Gives: ${Object.entries(game.trade.give).filter(([,n])=>n).map(([r,n])=>`${n} ${crossIcon[r]}`).join(' ')||'—'} · Wants: ${Object.entries(game.trade.want).filter(([,n])=>n).map(([r,n])=>`${n} ${crossIcon[r]}`).join(' ')||'—'}</p>${side===game.trade.from?'<button id="crossCancelTrade" class="ghost">Cancel trade</button>':side>=0?'<button id="crossAcceptTrade">Accept trade</button>':''}</section>`:'';
 const fortuneButtons=side>=0?game.fortunes[side].filter(card=>card.playable).map(card=>`<button class="ghost" data-cross-fortune="${card.id}" data-kind="${card.type}"><span>Play</span>: <span>${crossProgress[card.type]||card.type}</span></button>`).join(''):'';
 const actions=game.phase==='opening'&&game.can?.openingRoll?'<button id="crossOpeningRoll">Roll to start</button>':mine&&game.phase==='roll'?`<div class="actions"><button id="crossRoll">Roll dice</button>${fortuneButtons}</div>`:mine&&game.phase==='free-routes'?'<p class="notice">Select a highlighted route on the board.</p>':mine&&game.phase==='action'?`<section class="cross-actions"><div class="actions"><button id="crossBuyFortune" ${game.can.fortune?'':'disabled'}>Buy Progress card</button><button id="crossEnd" ${game.can.end?'':'disabled'}>End turn</button>${fortuneButtons}</div><details><summary>Trade with a market</summary><div class="cross-bank-trade"><select id="crossGive">${Object.keys(crossResource).map(r=>`<option value="${r}">${crossIcon[r]} ${crossResource[r]}</option>`).join('')}</select><span>for</span><select id="crossGet">${Object.keys(crossResource).map(r=>`<option value="${r}">${crossIcon[r]} ${crossResource[r]}</option>`).join('')}</select><button id="crossBankTrade">Trade</button></div></details><details><summary>Offer a player trade</summary><p>You give:</p><div class="cross-bundle">${crossBundleInputs('give')}</div><p>You want:</p><div class="cross-bundle">${crossBundleInputs('want')}</div><button id="crossOfferTrade">Offer trade</button></details></section>`:'';
 $("#game").innerHTML=`<section class="crossroads"><p class="eyebrow">CROSSROADS OF THRACE</p><h3>${crossStatus(game,side)}</h3>${game.dice?`<p class="cross-dice">🎲 ${game.dice[0]} + ${game.dice[1]} = <strong>${game.dice[0]+game.dice[1]}</strong></p>`:''}<div class="cross-standings">${standings}</div>${opening}${resourcePanel}${discard}${trade}${actions}<div class="cross-board-wrap"><svg class="cross-board" viewBox="0 0 100 100" role="img" aria-label="Crossroads of Thrace board">${hexes}${edgeLines}${vertexMarks}</svg></div><details class="cross-log"><summary>Table history</summary><ol>${game.log.slice().reverse().map(line=>`<li>${esc(line)}</li>`).join('')}</ol></details>${watching?'<p class="notice">You are watching. Materials and Progress cards remain private.</p>':''}</section>`;
 document.querySelectorAll('[data-cross-vertex]').forEach(node=>node.onclick=()=>act({type:'buildVillage',vertex:Number(node.dataset.crossVertex)}));
 document.querySelectorAll('[data-cross-edge]').forEach(node=>node.onclick=()=>act({type:'buildRoute',edge:Number(node.dataset.crossEdge)}));
 document.querySelectorAll('[data-cross-town]').forEach(node=>node.onclick=()=>confirm('Upgrade this village to a town?')&&act({type:'buildTown',vertex:Number(node.dataset.crossTown)}));
 document.querySelectorAll('[data-cross-tile]').forEach(node=>node.onclick=()=>{if(!mine||game.phase!=='raider'||Number(node.dataset.crossTile)===game.board.raider)return;const victims=(node.dataset.victims||'').split(',').filter(Boolean).map(Number);let victim;if(victims.length===1)victim=victims[0];else if(victims.length>1){const answer=prompt(`Steal from: ${victims.map(index=>`${index+1} ${plainPlayerName(game.players[index])}`).join(', ')}`);const chosen=Number(answer)-1;if(!victims.includes(chosen))return;victim=chosen}act({type:'moveRaider',tile:Number(node.dataset.crossTile),victim})});
 $("#crossOpeningRoll")?.addEventListener('click',()=>act({type:'openingRoll'}));$("#crossRoll")?.addEventListener('click',()=>act({type:'roll'}));$("#crossEnd")?.addEventListener('click',()=>act({type:'endTurn'}));$("#crossBuyFortune")?.addEventListener('click',()=>act({type:'buyFortune'}));
 $("#crossDiscard")?.addEventListener('click',()=>act({type:'discard',resources:readCrossBundle('discard')}));$("#crossBankTrade")?.addEventListener('click',()=>act({type:'bankTrade',give:$("#crossGive").value,get:$("#crossGet").value}));$("#crossOfferTrade")?.addEventListener('click',()=>act({type:'offerTrade',give:readCrossBundle('give'),want:readCrossBundle('want')}));$("#crossAcceptTrade")?.addEventListener('click',()=>act({type:'acceptTrade'}));$("#crossCancelTrade")?.addEventListener('click',()=>act({type:'cancelTrade'}));
 document.querySelectorAll('[data-cross-fortune]').forEach(button=>button.onclick=()=>{const action={type:'playFortune',cardId:button.dataset.crossFortune},kind=button.dataset.kind;if(kind==='bounty'){const names=prompt('Choose two materials, separated by a comma: timber, stone, livestock, grain, metal');if(!names)return;action.resources=names.toLowerCase().split(',').map(v=>v.trim())}if(kind==='monopoly'){const name=prompt('Choose one material: timber, stone, livestock, grain, metal');if(!name)return;action.resource=name.trim().toLowerCase()}act(action)});
}

function orderKey(){return `rummyOrder:${room.id}:${me.id}`}
function readOrder(){try{const value=JSON.parse(localStorage.getItem(orderKey())||"[]");return Array.isArray(value)?value:[]}catch{return []}}
function orderedHand(hand){
 const stored=readOrder();
 const known=new Set(hand.map(card=>card.id));
 const ids=[...stored.filter(id=>known.has(id)),...hand.map(card=>card.id).filter(id=>!stored.includes(id))];
 localStorage.setItem(orderKey(),JSON.stringify(ids));
 const byId=new Map(hand.map(card=>[card.id,card]));
 return ids.map(id=>byId.get(id));
}
function saveMove(from,to){
 const ids=readOrder(),a=ids.indexOf(from),b=ids.indexOf(to);
 if(a<0||b<0||a===b)return;
 ids.splice(a,1);ids.splice(b,0,from);localStorage.setItem(orderKey(),JSON.stringify(ids));renderGame();
}

document.addEventListener("click",event=>{
 const id=event.target.closest("[data-hand-card]")?.dataset.handCard;
 if(id){
   if(arranging){
     if(!arrangeFrom){arrangeFrom=id;renderGame()}
     else {const from=arrangeFrom;arrangeFrom=null;saveMove(from,id);renderGame()}
   }else {selected.has(id)?selected.delete(id):selected.add(id);renderGame()}
 }
});
document.addEventListener("dragstart",event=>{draggedCard=event.target.closest("[data-hand-card]")?.dataset.handCard||null});
document.addEventListener("dragover",event=>{if(event.target.closest("[data-hand-card]"))event.preventDefault()});
document.addEventListener("drop",event=>{const target=event.target.closest("[data-hand-card]")?.dataset.handCard;if(draggedCard&&target){event.preventDefault();saveMove(draggedCard,target)}draggedCard=null});

function parseDeclaration(value){
 const match=String(value||"").trim().toUpperCase().match(/^(10|[2-9AJQK])\s*([SHDC♠♥♦♣])$/);
 if(!match)return null;
 const suits={S:"♠",H:"♥",D:"♦",C:"♣","♠":"♠","♥":"♥","♦":"♦","♣":"♣"};
 return {rank:match[1],suit:suits[match[2]]};
}
const jokerRanks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const jokerSuits=["♠","♥","♦","♣"];
function validVirtualMeld(cards){
 if(cards.every(card=>card.rank===cards[0].rank))return cards.length<=8;
 if(!cards.every(card=>card.suit===cards[0].suit))return false;
 return [false,true].some(high=>{
   const values=cards.map(card=>card.rank==="A"?(high?14:1):jokerRanks.indexOf(card.rank)+1).sort((a,b)=>a-b);
   return new Set(values).size===values.length&&values.at(-1)-values[0]===values.length-1;
 });
}
function chooseJokerCard(options){
 if(options.length===1)return Promise.resolve(options[0]);
 return new Promise(resolve=>{
   const dialog=document.createElement("dialog");
   dialog.innerHTML='<h3>Choose the card represented by the joker</h3><div class="joker-options"></div><button class="ghost joker-cancel">Cancel</button>';
   const finish=value=>{dialog.close();dialog.remove();resolve(value)};
   for(const option of options){
     const wrapper=document.createElement("div");
     wrapper.innerHTML=cardHtml({...option,id:"joker-option"});
     const button=wrapper.firstElementChild;
     button.onclick=()=>finish(option);
     dialog.querySelector(".joker-options").append(button);
   }
   dialog.querySelector(".joker-cancel").onclick=()=>finish(null);
   dialog.addEventListener("cancel",event=>{event.preventDefault();finish(null)});
   document.body.append(dialog);localizeControls(dialog);dialog.showModal();
 });
}
async function jokerAssignments(cards,existing=[]){
 const combined=[...existing,...cards];
 const pending=combined.filter(card=>card.rank==="JOKER"&&!card.represents);
 if(!pending.length)return [];
 const solutions=[];
 function search(index,assignments){
   if(index===pending.length){
     const virtual=combined.map(card=>card.rank==="JOKER"?(card.represents||assignments.find(a=>a.cardId===card.id)):card);
     if(validVirtualMeld(virtual))solutions.push(assignments.slice());
     return;
   }
   const normal=combined.filter(card=>card.rank!=="JOKER");
   for(const rank of jokerRanks)for(const suit of jokerSuits){
     if(normal.length&&normal.every(card=>card.rank===normal[0].rank)&&rank===normal[0].rank&&normal.some(card=>card.suit===suit))continue;
     search(index+1,[...assignments,{cardId:pending[index].id,rank,suit}]);
   }
 }
 search(0,[]);
 let remaining=solutions;
 const result=[];
 for(const joker of pending){
   const options=[...new Map(remaining.map(solution=>{const a=solution.find(a=>a.cardId===joker.id);return [a.rank+a.suit,a]})).values()];
   if(!options.length){toast("These cards cannot form a valid meld.");return null}
   const choice=await chooseJokerCard(options);
   if(!choice)return null;
   result.push(choice);
   remaining=remaining.filter(solution=>solution.some(a=>a.cardId===joker.id&&a.rank===choice.rank&&a.suit===choice.suit));
 }
 return result;
}

function renderGame(){
 const game=room?.game;
 if(!game){$("#game").innerHTML="<div class='notice'>Waiting for the host to start…</div>";localizeControls();return}
 if(game.kind==="rummy")renderRummy(game);else if(game.kind==="backgammon")renderBackgammon(game);else if(game.kind==="santase")renderSantase(game);else if(game.kind==="blato")renderBlato(game);else renderCrossroads(game);
 localizeControls();
}

const signedPoints=value=>Number(value)>0?`+${Number(value)}`:String(Number(value));
function resultTable(game){
 const rows=game.players.map(id=>{const score=game.scores.players[id];return `<tr><td>${playerName(id)}${id===game.winner?" 🏆":""}</td><td>${score.cards}</td><td>${score.raw}</td><td>${signedPoints(score.match)}</td><td>${score.fullHand?"Full hand":""}</td></tr>`}).join("");
 return `<section class="results"><h2>${playerName(game.winner)} wins!</h2><table><thead><tr><th>Player</th><th>Cards</th><th>Raw</th><th>Change</th><th></th></tr></thead><tbody>${rows}</tbody></table><p>Winner receives <strong>${game.scores.awarded}</strong> match points${game.sprint?" (sprint ×2)":""}.</p></section>`;
}
function remainingHands(game){
 if(!game.winner)return "";
 return `<section class="remaining-hands"><h3>Remaining cards / Останали карти</h3>${game.players.filter(id=>id!==game.winner).map(id=>{
  const score=game.scores.players[id],cards=game.hands[id];
  return `<article class="remaining-player"><h4>${playerName(id)}</h4><p>${score.cards} cards · ${score.raw} raw points · ${signedPoints(score.match)} match points${score.fullHand?" · Full hand: 100 points / Неоткрит: 100 точки":""}</p><div class="remaining-cards">${Array.isArray(cards)?cards.map(card=>cardHtml(card,{proof:true})).join(""):""}</div></article>`;
 }).join("")}</section>`;
}
function standings(){
 if(!room.match)return "";
 const rows=Object.entries(room.match.cumulative).sort((a,b)=>b[1]-a[1]).map(([id,score])=>`<tr><td>${playerName(id)}</td><td>${signedPoints(score)}</td></tr>`).join("");
 return `<section class="standings"><h3>${room.match.finished?"Final standings":"Cumulative standings"}</h3><table><tbody>${rows}</tbody></table></section>`;
}
function stagedHtml(hand){
 if(!stagedMelds.length)return "";
 const byId=new Map(hand.map(card=>[card.id,card]));
 return `<section class="staging"><h3>Staged melds</h3>${stagedMelds.map((meld,index)=>`<div class="staged-meld">${meld.cardIds.map(id=>cardHtml({...byId.get(id),represents:meld.jokerAssignments?.find(a=>a.cardId===id)})).join("")}<button data-unstage="${index}" class="ghost">Remove</button></div>`).join("")}<button id="layAll">Lay all melds</button></section>`;
}

function renderRummy(game){
 const watching=room.role==="watcher";
 const hand=Array.isArray(game.hands[me.id])?orderedHand(game.hands[me.id]):[];
 const handIds=new Set(hand.map(card=>card.id));
 stagedMelds=stagedMelds.filter(meld=>meld.cardIds.every(id=>handIds.has(id)));
 const turn=game.players[game.turn]===me.id,active=turn&&!game.winner;
 const progress=(room.match?`Game ${game.gameNumber} of ${room.match.totalGames}`:`Game ${game.gameNumber}`)+(room.match?.rated?" · Rated":"");
 const status=game.winner?`${progress} finished`:`${game.sprint?"⚡ SPRINT ×2 · ":""}${progress} · ${turn?"Your turn":playerName(game.players[game.turn])+"'s turn"}`;
 const discard=game.discard.at(-1);
 $("#game").innerHTML=`<p class="game-status">${status}</p>${game.forfeited?.length?`<p class="notice">Left by forfeit: ${game.forfeited.map(playerName).join(", ")}. This is the last hand of this match.</p>`:""}
 ${game.winner?resultTable(game)+standings()+remainingHands(game):""}
 ${!game.winner&&watching?`<div class="draw-area"><p><span>Stock cards</span>: ${Number(game.stock.count)}</p><div class="discard-pile"><span>Discard</span>${discard?cardHtml(discard,{proof:true}):"<em>Empty</em>"}</div></div>`:""}
 ${!game.winner&&!watching?`<div class="draw-area"><button id="stock" ${!active||game.phase!=="draw"?"disabled":""}>Draw stock <b>${Number(game.stock.count)}</b></button><div class="discard-pile"><span>Discard</span>${discard?cardHtml(discard):"<em>Empty</em>"}<button id="discardDraw" ${!active||game.phase!=="draw"||!discard?"disabled":""}>Take card</button></div></div>`:""}
 ${watching?`<section class="hand-counts"><h3>Cards remaining</h3>${game.players.map(id=>`<p>${playerName(id)}: ${Array.isArray(game.hands[id])?game.hands[id].length:Number(game.hands[id]?.count||0)}</p>`).join("")}</section>`:`<div class="actions"><h3>Your hand</h3>${!game.winner?'<button id="arrangeHand" class="ghost" aria-pressed="'+arranging+'">'+(arranging?"Done arranging":"Arrange cards")+'</button>':""}</div>
 ${arranging&&!game.winner?'<p class="board-hint">Tap a card, then tap its destination. Tap Done arranging to select cards for play.</p>':""}
 <div class="hand">${hand.map(item=>cardHtml(item,{hand:!game.winner})).join("")}</div>`}
 ${!game.winner&&!watching?`<div class="actions"><button id="undoTurn" ${!active||!game.canUndo?"disabled":""}>Undo last action</button><button id="stage" ${!active||game.phase!=="play"?"disabled":""}>Stage selected meld</button><button id="discardBtn" ${!active||game.phase!=="play"?"disabled":""}>Discard selected</button></div>${stagedHtml(hand)}`:""}
 <h3>Table melds</h3><div class="table-melds">${game.melds.map(meld=>`<div class="meld ${meld.cards.length>6?"meld-wide":""}"><div class="meld-cards">${meld.cards.map(item=>cardHtml(item,{proof:watching})).join("")}</div>${!game.winner&&!watching?`<button data-add="${esc(meld.id)}" ${!active||game.phase!=="play"?"disabled":""}>Add selected</button>${meld.cards.filter(item=>item.rank==="JOKER").map(item=>`<button data-replace="${esc(meld.id)}" data-joker="${esc(item.id)}" ${!active||game.phase!=="play"?"disabled":""}>Replace ${esc(declared(item))}</button>`).join("")}`:""}</div>`).join("")}</div>`;

 $("#arrangeHand")?.addEventListener("click",()=>{arranging=!arranging;arrangeFrom=null;selected.clear();renderGame()});
 $("#undoTurn")?.addEventListener("click",()=>act({type:"undo"},()=>{stagedMelds=[];selected.clear();renderGame()}));
 $("#stock")?.addEventListener("click",()=>act({type:"draw",from:"stock"}));
 $("#discardDraw")?.addEventListener("click",()=>act({type:"draw",from:"discard"}));
 $("#stage")?.addEventListener("click",async()=>{
   const ids=[...selected],used=new Set(stagedMelds.flatMap(item=>item.cardIds));
   if(ids.length<3)return toast("Select at least three cards.");
   if(ids.some(id=>used.has(id)))return toast("A card is already assigned to another staged meld.");
   const cards=ids.map(id=>hand.find(card=>card.id===id)),assignments=await jokerAssignments(cards);
   if(assignments===null)return;
   stagedMelds.push({cardIds:ids,jokerAssignments:assignments});selected.clear();renderGame();
 });
 document.querySelectorAll("[data-unstage]").forEach(button=>button.onclick=()=>{stagedMelds.splice(Number(button.dataset.unstage),1);renderGame()});
 $("#layAll")?.addEventListener("click",()=>act({type:"meldBatch",melds:stagedMelds},()=>{stagedMelds=[]}));
 $("#discardBtn")?.addEventListener("click",()=>{if(selected.size!==1)return toast("Select one card.");act({type:"discard",cardId:[...selected][0]})});
 document.querySelectorAll("[data-add]").forEach(button=>button.onclick=async()=>{
   const cards=[...selected].map(id=>hand.find(card=>card.id===id)),assignments=await jokerAssignments(cards,game.melds.find(meld=>meld.id===button.dataset.add)?.cards||[]);
   if(!cards.length)return toast("Select cards from your hand.");if(assignments===null)return;
   act({type:"add",meldId:button.dataset.add,cardIds:[...selected],jokerAssignments:assignments});
 });
 document.querySelectorAll("[data-replace]").forEach(button=>button.onclick=()=>{
   if(selected.size!==1)return toast("Select the exact replacement card from your hand.");
   act({type:"replaceJoker",meldId:button.dataset.replace,jokerId:button.dataset.joker,cardId:[...selected][0]});
 });
}

const checkerStack=point=>point.count?`<span class="checker-stack">${point.pinned!==undefined?`<i class="checker pinned-checker side-${Number(point.pinned)}" style="--stack:0" aria-label="Pinned checker"></i>`:""}${Array.from({length:Math.min(Number(point.count),5)},(_,index)=>`<i class="checker side-${Number(point.owner)}" style="--stack:${index+(point.pinned!==undefined?0.5:0)}"></i>`).join("")}${point.count>5?`<b class="checker-count">${Number(point.count)}</b>`:""}</span>`:"";
const bgPoint=(game,index,edge,view)=>`<button class="bg-point ${edge}" data-point="${index}" aria-label="Point ${view.label(index)}, ${Number(game.points[index].count)} checkers${game.points[index].pinned!==undefined?", pinned checker":""}"><span class="triangle"></span><small>${view.label(index)}</small>${checkerStack(game.points[index])}</button>`;
const dieHtml=(die,{index=null,disabled=true,used=false}={})=>`<button class="die face-${Number(die)} ${used?"die-used":""}" ${index===null?"":`data-die="${index}"`} ${disabled?"disabled":""} aria-label="Die ${Number(die)}${used?", used":""}">${Array.from({length:Number(die)},()=>"<i></i>").join("")}</button>`;
function enableCheckerDragging(game,mySide,legal){
 if(mySide<0||!legal.length)return;
 const moves=legal.map(move=>({...move,to:moveDestination(game,move,mySide)}));
 const sourceKey=move=>String(move.from),sourceButtons=new Map();
 for(const move of moves){
  const button=move.from==='bar'?document.querySelector(`[data-bar="${mySide}"]`):document.querySelector(`[data-point="${move.from}"]`);
  if(!button)continue;button.disabled=false;button.classList.add('checker-drag-source');sourceButtons.set(sourceKey(move),button);
 }
 for(const [from,button] of sourceButtons)button.addEventListener('pointerdown',event=>{
  if(event.button!==0||!event.target.closest('.checker-stack,.bar-checkers'))return;
  const candidates=moves.filter(move=>sourceKey(move)===from);if(!candidates.length)return;
  event.preventDefault();button.setPointerCapture?.(event.pointerId);button.classList.add('dragging-checker');
  const targets=new Map();for(const move of candidates){
   const target=move.to==='off'?document.querySelector(`[data-off="${mySide}"]`):document.querySelector(`[data-point="${move.to}"]`);
   if(target){target.classList.add('checker-drop-target');targets.set(target,move)}
  }
  const ghost=document.createElement('i');ghost.className=`checker checker-drag-ghost side-${mySide}`;document.body.append(ghost);
  const place=pointer=>{ghost.style.left=`${pointer.clientX}px`;ghost.style.top=`${pointer.clientY}px`};place(event);
  const movePointer=pointer=>place(pointer);
  const cleanup=()=>{
   button.removeEventListener('pointermove',movePointer);button.removeEventListener('pointerup',finish);button.removeEventListener('pointercancel',cancel);
   button.classList.remove('dragging-checker');for(const target of targets.keys())target.classList.remove('checker-drop-target');ghost.remove();
  };
  const finish=pointer=>{const match=[...targets].find(([target])=>{const box=target.getBoundingClientRect();return pointer.clientX>=box.left&&pointer.clientX<=box.right&&pointer.clientY>=box.top&&pointer.clientY<=box.bottom}),move=match?.[1];cleanup();if(move)act({type:'move',from:move.from,dieIndex:move.dieIndex})};
  const cancel=()=>cleanup();
  button.addEventListener('pointermove',movePointer);button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',cancel);
 });
}
function renderBackgammon(game){
 const watching=room.role==="watcher";
 const turn=game.players[game.turn]===me.id,active=turn&&!game.winner&&!game.resignationOffer;
 const mySide=game.players.indexOf(me.id),view=boardView(game.variant,mySide);
 const {top,bottom}=view;
 const row=(ids,edge)=>`${ids.slice(0,6).map(index=>bgPoint(game,index,edge,view)).join("")}<div class="bar-space" aria-hidden="true"></div>${ids.slice(6).map(index=>bgPoint(game,index,edge,view)).join("")}`;
 const barSide=side=>`<button class="bar-zone side-${side}" data-bar="${side}" aria-label="${side===0?"White":"Red"} hit checkers: ${Number(game.bar[side])}"><span>${side===0?"White":"Red"}</span><div class="bar-checkers">${Array.from({length:Math.min(game.bar[side],5)},()=>`<i class="checker side-${side}"></i>`).join("")}</div><b>${Number(game.bar[side])}</b></button>`;
 const offSide=side=>`<div class="off-group side-${side}" data-off="${side}" aria-label="${side===0?"White":"Red"} borne off: ${Number(game.borneOff[side])}"><span>${side===0?"White":"Red"}</span><div class="off-checkers">${Array.from({length:game.borneOff[side]},()=>`<i class="off-checker side-${side}"></i>`).join("")}</div><b>${Number(game.borneOff[side])}</b></div>`;
 const opening=game.phase==="opening";
 const rotating=room.match?.variantMode!=="normal";
 const progress=`${variantName(game.variant)}${rotating?` · Round ${Math.ceil(game.gameNumber/3)} of ${room.match?.roundCount||Math.ceil((room.match?.totalGames||3)/3)}`:""} · Game ${game.gameNumber} of ${room.match?.totalGames||3}${room.match?.rated?" · Rated":""}`;
 const status=game.winner?`${playerName(game.winner)} wins${game.scores?.mars?" — Mars!":"!"}`:opening?"Roll to decide who starts":`${turn?"Your move":playerName(game.players[game.turn])+"'s move"}`;
 const openingHtml=game.openingRolls.some(die=>die!==null)||opening?`<section class="opening-rolls"><p>${opening&&game.openingPrevious?"Opening tie — both players roll again.":opening?"Each player rolls one die. Higher roll starts, then rolls both dice again.":"Opening rolls"}</p>${game.players.map((id,side)=>`<div><span>${playerName(id)}</span>${game.openingRolls[side]!==null?dieHtml(game.openingRolls[side]):"<span>Waiting…</span>"}</div>`).join("")}${opening&&game.openingPrevious?`<small>Previous tie: ${game.openingPrevious.join(" : ")}</small>`:""}</section>`:"";
 const legal=game.legalMoves||[];
 const history=(game.rollHistory||[]).slice().reverse();
 const historyHtml=history.length?`<details class="roll-history"><summary>Roll history — last ${history.length} rolls</summary><ol>${history.map(entry=>`<li>#${Number(entry.id)} · ${playerName(entry.playerId)} · ${entry.kind==="opening"?"Opening":"Turn"} · <strong>${entry.dice.map(Number).join(" : ")}</strong></li>`).join("")}</ol></details>`:"";
 const offer=game.resignationOffer;
 $("#game").innerHTML=`<p class="bg-progress">${progress}</p><div class="bg-colors">${game.players.map((id,side)=>`<span class="color-seat ${side===game.turn?"current-seat":""}"><i class="player-checker side-${side}" aria-hidden="true"></i>${playerName(id)} · <span>${side===0?"White":"Red"}</span>${side===mySide?" · <b>You</b>":""}</span>`).join("")}</div><div class="bg-status"><strong>${status}</strong>
 <div class="dice">${game.dice.map((die,index)=>dieHtml(die,{index,disabled:!active||!legal.some(move=>move.dieIndex===index),used:game.used.includes(index)})).join("")}</div>
 ${!game.winner&&!watching?`<div class="actions"><button id="bgUndo" ${game.canUndo?"":"disabled"}>Undo last move</button><button id="roll" ${opening?game.openingRolls[mySide]===null?"":"disabled":active&&game.phase==="roll"?"":"disabled"}>${opening?"Roll to start":"Roll"}</button></div>`:""}</div>
 ${game.gameNumber===1&&(opening||(!game.dice.length&&!game.lastTurn))?openingHtml:""}
 ${game.lastTurn?`<section class="last-roll"><p>${playerName(game.lastTurn.playerId)}: ${game.lastTurn.reason==="blocked"?"No legal moves remaining — turn passed":"Turn completed"}</p><div class="dice">${game.lastTurn.dice.map((die,index)=>dieHtml(die,{used:game.lastTurn.used.includes(index)})).join("")}</div></section>`:""}
 ${game.winner?`<section class="results"><h3>${game.scores?.resigned?"Win by concession":game.scores?.forfeit?"Win by forfeit":game.scores?.mars?"Mars — opponent bore off no checkers":"Win"}</h3><p>${playerName(game.winner)} receives ${Number(game.scores?.awarded||0)} point(s).</p></section>${standings()}`:""}
 ${!game.winner&&!watching?`<div class="concession actions">${offer?`<p>${playerName(game.players[offer.side])} <span>offers to concede</span> ${offer.points} <span>point(s).</span></p>${offer.side===mySide?'<button id="cancelResign" class="ghost">Cancel offer</button>':'<button id="acceptResign">Accept concession</button><button id="declineResign" class="ghost">Decline</button>'}`:'<button data-concede="1" class="ghost">Concede 1 point</button><button data-concede="2" class="ghost">Concede Mars — 2 points</button>'}</div>`:""}
 ${watching&&offer?`<p class="notice">${playerName(game.players[offer.side])} <span>offers to concede</span> ${offer.points} <span>point(s).</span></p>`:""}
 ${game.sequence&&!game.winner?`<p class="notice sequence-status"><span>${game.sequence.handedOver?"Inherited doubles":"Ascending doubles"}</span>: ${game.sequence.face} → 6 · <span>Original roller</span>: ${playerName(game.players[game.sequence.roller])}</p>`:""}
 ${historyHtml}
 <div class="backgammon-layout"><div class="backgammon-wrap"><div class="backgammon-board"><div class="bg-row top">${row(top,"top")}</div><div class="bg-row bottom">${row(bottom,"bottom")}</div><div class="center-bar" aria-label="Bar — hit checkers">${game.variant==="normal"||!game.variant?barSide(1-Math.max(0,mySide))+barSide(Math.max(0,mySide)):""}</div></div></div><aside class="off-tray" aria-label="Borne-off checkers"><strong>Off board</strong>${offSide(1-Math.max(0,mySide))}${offSide(Math.max(0,mySide))}</aside></div>
 <p class="board-hint">${game.variant==="gulbara"?"Gulbara: both colors move in the same direction. One opposing checker blocks a point. After your first two rolls, doubles continue upwards to six; unused moves transfer once only if you started the sequence.":game.variant==="tapa"?"Tapa: landing on a lone opposing checker pins it until released. Pinning the last checker on its starting point wins Mars immediately.":"Normal backgammon: hit checkers must re-enter from the center bar first."} <span>${watching?"Watching from White’s side. Moves are read-only.":"Your starting point is 24; bear off beyond point 1. Drag a checker, or choose a die then a highlighted point."}</span></p>`;
 document.querySelectorAll('[data-concede]').forEach(button=>button.onclick=()=>{const points=Number(button.dataset.concede);if(confirm(translateText(points===1?"Offer to concede this game for 1 point?":"Offer to concede this game for 2 points (Mars)?",uiLanguage)))act({type:"offerResignation",points})});
 $("#acceptResign")?.addEventListener("click",()=>act({type:"acceptResignation"}));
 $("#declineResign")?.addEventListener("click",()=>act({type:"declineResignation"}));
 $("#cancelResign")?.addEventListener("click",()=>act({type:"cancelResignation"}));
 if(offer)document.querySelectorAll("#roll,#bgUndo,[data-die]").forEach(button=>button.disabled=true);
 let die=null;
 function chooseDie(index){
   die=index;document.querySelectorAll("[data-die]").forEach(button=>button.classList.toggle("chosen",Number(button.dataset.die)===die));
   document.querySelectorAll("[data-point]").forEach(button=>button.disabled=!legal.some(move=>move.dieIndex===die&&move.from===Number(button.dataset.point)));
   document.querySelectorAll("[data-bar]").forEach(button=>button.disabled=Number(button.dataset.bar)!==mySide||!legal.some(move=>move.dieIndex===die&&move.from==="bar"));
 }
 document.querySelectorAll("[data-point], [data-bar]").forEach(button=>button.disabled=true);
 document.querySelectorAll("[data-die]").forEach(button=>button.onclick=()=>chooseDie(Number(button.dataset.die)));
 document.querySelectorAll("[data-point]").forEach(button=>button.onclick=()=>{if(die!==null)act({type:"move",from:Number(button.dataset.point),dieIndex:die})});
 document.querySelectorAll("[data-bar]").forEach(button=>button.onclick=()=>{if(die!==null)act({type:"move",from:"bar",dieIndex:die})});
 enableCheckerDragging(game,mySide,legal);
 $("#roll")?.addEventListener("click",()=>act({type:"roll"}));
 $("#bgUndo")?.addEventListener("click",()=>act({type:"undo"}));
}

$("#uiLanguage").value=uiLanguage;
$("#uiLanguage").onchange=()=>{
 uiLanguage=['en','bg','es'].includes($("#uiLanguage").value)?$("#uiLanguage").value:'en';
 localStorage.uiLanguage=uiLanguage;renderMaintenance();
 localizeControls();
 updateSoundToggle();
 renderBackgammonFormat();
 document.querySelectorAll(".rules-language").forEach(section=>section.hidden=section.dataset.language!==uiLanguage);
};
localizeControls();
loadAccount();loadScoreboard();
document.querySelectorAll(".rules-language").forEach(section=>section.hidden=section.dataset.language!==uiLanguage);

function showRules(language=uiLanguage){
 const activeGame=!$("#room").hidden&&room?.gameType?room.gameType:null;
 document.querySelectorAll('.rules-language').forEach(article=>{
  article.hidden=article.dataset.language!==language;
  let sectionGame=null;
  for(const child of article.children){
   if(child.dataset.ruleGame)sectionGame=child.dataset.ruleGame;
   child.hidden=Boolean(activeGame&&sectionGame!==activeGame);
  }
 });
}
$("#rulesOpen").onclick=()=>{showRules();$("#rules").showModal()};
$("#feedbackOpen").onclick=()=>$("#feedbackDialog").showModal();
$("#feedbackCancel").onclick=()=>$("#feedbackDialog").close();
$("#feedbackForm").onsubmit=event=>{
 event.preventDefault();
 if(!$("#feedbackForm").reportValidity())return;
 const button=$("#feedbackSend");button.disabled=true;
 socket.emit("submitFeedback",{type:$("#feedbackType").value,message:$("#feedbackMessage").value,website:$("#feedbackWebsite").value},response=>{
  button.disabled=false;
  if(!response?.ok){toast(response?.error);return}
  $("#feedbackDialog").close();$("#feedbackForm").reset();toast("Thank you. Your feedback was saved.");
 });
};
document.querySelectorAll("[data-rules-lang]").forEach(button=>button.onclick=()=>{
 const language=button.dataset.rulesLang;
 showRules(language);
});

// The HTML carries the build that actually loaded this client. Comparing only
// two /version requests could incorrectly bless old JS after a deployment.
const loadedBuild=$("meta[name=app-build]")?.content;
const loadedVersion=$("meta[name=app-version]")?.content;
let checkingVersion=false;
function observeServerVersion(info){
 if(!info||typeof info.build!=="string"||typeof info.version!=="string")return;
 $("#buildInfo").textContent=String(info.environment||"unspecified")+" · v"+(loadedVersion||info.version)+" · build "+(loadedBuild||info.build);
 if(loadedBuild&&loadedBuild!==info.build){
   $("#updateMessage").textContent="Update available (v"+info.version+"). Reload to use the latest game.";
   $("#updateNotice").hidden=false;localizeControls();
 }
}
async function checkServerVersion(){
 if(checkingVersion)return;
 checkingVersion=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{
   const response=await fetch("/version",{cache:"no-store",signal:controller.signal});
   if(response.ok)observeServerVersion(await response.json());
 }catch{/* An unavailable version endpoint must not interrupt a game. */}
 finally{clearTimeout(timer);checkingVersion=false}
}
$("#reloadUpdate").onclick=()=>{
 // A fresh navigation also gets a new HTML/asset URL. Preserve player storage.
 const url=new URL(location.href);url.searchParams.set("_buildReload",String(Date.now()));location.replace(url.href);
};
socket.on("serverVersion",observeServerVersion);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkServerVersion()});
window.addEventListener("pageshow",()=>checkServerVersion());
setInterval(()=>{if(!document.hidden)checkServerVersion()},60000);
checkServerVersion();

