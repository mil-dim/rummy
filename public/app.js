const socket=io(), $=selector=>document.querySelector(selector);
let me=null,room=null,selected=new Set(),stagedMelds=[],draggedCard=null,pendingRoom=null,browsingLobby=sessionStorage.getItem("tabletopView")==="lobby",arranging=false,arrangeFrom=null;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const player=id=>[...(room?.players||[]),...(room?.formerPlayers||[])].find(candidate=>candidate.id===id);
const playerName=id=>esc(player(id)?.name||"Player");
const toast=message=>{const element=$("#toast");element.textContent=String(message||"Something went wrong.");element.style.display="block";setTimeout(()=>element.style.display="none",3000)};

socket.on("connect",()=>{$("#status").textContent="Connected";const token=localStorage.token;if(token)socket.emit("identify",{token,name:localStorage.name},identified)});
socket.on("disconnect",()=>$("#status").textContent="Reconnecting…");
function identified(response){if(!response?.ok){localStorage.removeItem("token");toast(response?.error);return}localStorage.token=response.token;localStorage.name=response.player.name;me=response.player;$("#welcome").hidden=true;$("#lobby").hidden=Boolean(response.resumed)&&!browsingLobby;if(pendingRoom){const next=pendingRoom;pendingRoom=null;showRoom(next)}else if(!response.resumed){room=null;$("#room").hidden=true;renderLobby()}}
$("#identity").onsubmit=event=>{event.preventDefault();socket.emit("identify",{name:$("#name").value},identified)};

let lobbyRooms=[];
function renderLobby(){const rooms=lobbyRooms;$("#rooms").innerHTML=rooms.map(item=>`<article class="roomCard"><p class="eyebrow">${esc(item.gameType)}</p><h3>${esc(item.name)}</h3><p>${Number(item.players)}/${Number(item.maxPlayers)} players · ${esc(item.id)}</p><button data-join="${esc(item.id)}" ${item.started||room?"disabled":""}>${item.started?"In progress":"Join table"}</button></article>`).join("")||"<p>No open rooms yet.</p>";$("#resumeArea").hidden=!room;$("#newRoom").disabled=Boolean(room)}
socket.on("lobby",rooms=>{lobbyRooms=rooms;renderLobby()});
document.addEventListener("click",event=>{const id=event.target.dataset.join;if(id&&!room){browsingLobby=false;sessionStorage.setItem("tabletopView","room");socket.emit("joinRoom",{id},response=>!response.ok&&toast(response.error))}});
$("#newRoom").onclick=()=>$("#create").showModal();
$("#gameType").onchange=()=>{$("#maxPlayers").disabled=$("#gameType").value==="backgammon"};
$("#createGo").onclick=event=>{event.preventDefault();socket.emit("createRoom",{name:$("#createName").value,gameType:$("#gameType").value,maxPlayers:$("#maxPlayers").value},response=>{if(response.ok){$("#create").close();setLobbyView(false)}else toast(response.error)})};

function setLobbyView(value){
 browsingLobby=value;sessionStorage.setItem("tabletopView",value?"lobby":"room");
 $("#lobby").hidden=!value;$("#room").hidden=value;renderLobby();
}
$("#backLobby").onclick=()=>setLobbyView(true);
$("#resumeGame").onclick=()=>{if(room){setLobbyView(false);renderGame()}};
function leaveGame(){
 if(!room)return;
 const message=room.game&&!room.game.winner
   ?"Leave permanently and forfeit this game? In Rummy, the remaining players finish this hand, then start a new match."
   :"Leave this table permanently?";
 if(confirm(message))socket.emit("leaveRoom",{},response=>{if(!response?.ok)toast(response?.error)});
}
$("#leaveGame").onclick=leaveGame;
$("#leaveLobby").onclick=leaveGame;
socket.on("roomLeft",()=>{
 room=null;pendingRoom=null;selected.clear();stagedMelds=[];arranging=false;arrangeFrom=null;
 $("#game").replaceChildren();setLobbyView(true);
});

function updateStartButton(){
 const button=$("#start");
 if(room.hostId!==me.id||room.game&&!room.game.winner){button.hidden=true;return}
 button.hidden=false;
 if(!room.game)button.textContent="Start match";
 else if(room.match?.finished)button.textContent="New match";
 else button.textContent="Next game";
}
$("#start").onclick=()=>{
 if(room.gameType==="backgammon"&&(!room.match||room.match.finished)){$("#bgMatchSetup").showModal();return}
 if(room.gameType==="rummy"&&(!room.match||room.match.finished)){$("#matchSetup").showModal();return}
 socket.emit("startGame",{},response=>!response.ok&&toast(response.error));
};
$("#matchGo").onclick=event=>{event.preventDefault();socket.emit("startGame",{sprintCount:Number($("#sprintCount").value)},response=>{if(response.ok)$("#matchSetup").close();else toast(response.error)})};

$("#bgMatchGo").onclick=event=>{
 event.preventDefault();const input=$("#bgGameCount");if(!input.reportValidity())return;
 socket.emit("startGame",{gameCount:Number(input.value)},response=>{if(response.ok)$("#bgMatchSetup").close();else toast(response.error)});
};

function showRoom(next){
 if(!me){pendingRoom=next;return}
 if(Number(next.protocolVersion)>5){toast("This client is too old. Refresh the page.");return}
 const previousGame=room?.game?.gameNumber;
 const changedRoom=room?.id!==next.id;
 room=next;
 if(changedRoom||previousGame!==room.game?.gameNumber){selected.clear();stagedMelds=[];arrangeFrom=null}
 $("#lobby").hidden=!browsingLobby;$("#room").hidden=browsingLobby;
 renderLobby();
 $("#roomCode").textContent=`ROOM ${room.id} · ${room.gameType}`;
 $("#roomName").textContent=room.name;
 $("#players").innerHTML=room.players.map(item=>`<span>${item.connected?"●":"○"} ${esc(item.name)}</span>`).join("");
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
function cardHtml(card,{hand=false}={}){
 const joker=card.rank==="JOKER",red=!joker&&"♥♦".includes(card.suit),label=declared(card);
 return `<button class="playing-card ${red?"red":"black"} ${joker?"joker":""} ${(hand&&arranging?arrangeFrom===card.id:selected.has(card.id))?"selected":""}" ${hand?`data-hand-card="${esc(card.id)}" draggable="true"`:""} aria-label="${joker?`Joker ${esc(label)}`:`${esc(card.rank)} of ${esc(card.suit)}`}">
 <span class="corner top"><b>${joker?"★":esc(card.rank)}</b><i>${joker?esc(label):esc(card.suit)}</i></span>
 <span class="pip">${joker?(label?`JOKER<br><small>→ ${esc(label)}</small>`:"JOKER"):esc(card.suit)}</span>
 <span class="corner bottom"><b>${joker?"★":esc(card.rank)}</b><i>${joker?esc(label):esc(card.suit)}</i></span></button>`;
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
   document.body.append(dialog);dialog.showModal();
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
 if(!game){$("#game").innerHTML="<div class='notice'>Waiting for the host to start…</div>";return}
 game.kind==="rummy"?renderRummy(game):renderBackgammon(game);
}

const signedPoints=value=>Number(value)>0?`+${Number(value)}`:String(Number(value));
function resultTable(game){
 const rows=game.players.map(id=>{const score=game.scores.players[id];return `<tr><td>${playerName(id)}${id===game.winner?" 🏆":""}</td><td>${score.cards}</td><td>${score.raw}</td><td>${signedPoints(score.match)}</td><td>${score.fullHand?"Full hand":""}</td></tr>`}).join("");
 return `<section class="results"><h2>${playerName(game.winner)} wins!</h2><table><thead><tr><th>Player</th><th>Cards</th><th>Raw</th><th>Change</th><th></th></tr></thead><tbody>${rows}</tbody></table><p>Winner receives <strong>${game.scores.awarded}</strong> match points${game.sprint?" (sprint ×2)":""}.</p></section>`;
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
 const hand=Array.isArray(game.hands[me.id])?orderedHand(game.hands[me.id]):[];
 const handIds=new Set(hand.map(card=>card.id));
 stagedMelds=stagedMelds.filter(meld=>meld.cardIds.every(id=>handIds.has(id)));
 const turn=game.players[game.turn]===me.id,active=turn&&!game.winner;
 const progress=room.match?`Game ${game.gameNumber} of ${room.match.totalGames}`:`Game ${game.gameNumber}`;
 const status=game.winner?`${progress} finished`:`${game.sprint?"⚡ SPRINT ×2 · ":""}${progress} · ${turn?"Your turn":playerName(game.players[game.turn])+"'s turn"}`;
 const discard=game.discard.at(-1);
 $("#game").innerHTML=`<p class="game-status">${status}</p>${game.forfeited?.length?`<p class="notice">Left by forfeit: ${game.forfeited.map(playerName).join(", ")}. This is the last hand of this match.</p>`:""}
 ${game.winner?resultTable(game)+standings():""}
 ${!game.winner?`<div class="draw-area"><button id="stock" ${!active||game.phase!=="draw"?"disabled":""}>Draw stock <b>${Number(game.stock.count)}</b></button><div class="discard-pile"><span>Discard</span>${discard?cardHtml(discard):"<em>Empty</em>"}<button id="discardDraw" ${!active||game.phase!=="draw"||!discard?"disabled":""}>Take card</button></div></div>`:""}
 <div class="actions"><h3>Your hand</h3>${!game.winner?'<button id="arrangeHand" class="ghost" aria-pressed="'+arranging+'">'+(arranging?"Done arranging":"Arrange cards")+'</button>':""}</div>
 ${arranging&&!game.winner?'<p class="board-hint">Tap a card, then tap its destination. Tap Done arranging to select cards for play.</p>':""}
 <div class="hand">${hand.map(item=>cardHtml(item,{hand:!game.winner})).join("")}</div>
 ${!game.winner?`<div class="actions"><button id="undoTurn" ${!active||!game.canUndo?"disabled":""}>Undo last action</button><button id="stage" ${!active||game.phase!=="play"?"disabled":""}>Stage selected meld</button><button id="discardBtn" ${!active||game.phase!=="play"?"disabled":""}>Discard selected</button></div>${stagedHtml(hand)}`:""}
 <h3>Table melds</h3><div class="table-melds">${game.melds.map(meld=>`<div class="meld ${meld.cards.length>6?"meld-wide":""}"><div class="meld-cards">${meld.cards.map(item=>cardHtml(item)).join("")}</div>${!game.winner?`<button data-add="${esc(meld.id)}" ${!active||game.phase!=="play"?"disabled":""}>Add selected</button>${meld.cards.filter(item=>item.rank==="JOKER").map(item=>`<button data-replace="${esc(meld.id)}" data-joker="${esc(item.id)}" ${!active||game.phase!=="play"?"disabled":""}>Replace ${esc(declared(item))}</button>`).join("")}`:""}</div>`).join("")}</div>`;

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

const checkerStack=point=>point.count?`<span class="checker-stack">${Array.from({length:Math.min(Number(point.count),5)},(_,index)=>`<i class="checker side-${Number(point.owner)}" style="--stack:${index}"></i>`).join("")}${point.count>5?`<b class="checker-count">${Number(point.count)}</b>`:""}</span>`:"";
const bgPoint=(game,index,edge)=>`<button class="bg-point ${edge}" data-point="${index}" aria-label="Point ${index+1}, ${Number(game.points[index].count)} checkers"><span class="triangle"></span><small>${index+1}</small>${checkerStack(game.points[index])}</button>`;
const dieHtml=(die,{index=null,disabled=true,used=false}={})=>`<button class="die face-${Number(die)} ${used?"die-used":""}" ${index===null?"":`data-die="${index}"`} ${disabled?"disabled":""} aria-label="Die ${Number(die)}${used?", used":""}">${Array.from({length:Number(die)},()=>"<i></i>").join("")}</button>`;
function renderBackgammon(game){
 const turn=game.players[game.turn]===me.id,active=turn&&!game.winner;
 const top=[12,13,14,15,16,17,18,19,20,21,22,23],bottom=[11,10,9,8,7,6,5,4,3,2,1,0];
 const row=(ids,edge)=>`${ids.slice(0,6).map(index=>bgPoint(game,index,edge)).join("")}<div class="bar-space" aria-hidden="true"></div>${ids.slice(6).map(index=>bgPoint(game,index,edge)).join("")}`;
 const barSide=side=>`<button class="bar-zone side-${side}" data-bar="${side}" aria-label="${side===0?"White":"Red"} hit checkers: ${Number(game.bar[side])}"><span>${side===0?"White":"Red"}</span><div class="bar-checkers">${Array.from({length:Math.min(game.bar[side],5)},()=>`<i class="checker side-${side}"></i>`).join("")}</div><b>${Number(game.bar[side])}</b></button>`;
 const offSide=side=>`<div class="off-group side-${side}" aria-label="${side===0?"White":"Red"} borne off: ${Number(game.borneOff[side])}"><span>${side===0?"White":"Red"}</span><div class="off-checkers">${Array.from({length:game.borneOff[side]},()=>`<i class="off-checker side-${side}"></i>`).join("")}</div><b>${Number(game.borneOff[side])}</b></div>`;
 const opening=game.phase==="opening";
 const mySide=game.players.indexOf(me.id);
 const progress=room.match?`Game ${game.gameNumber} of ${room.match.totalGames}`:`Game ${game.gameNumber}`;
 const status=game.winner?`${playerName(game.winner)} wins${game.scores?.mars?" — Mars!":"!"}`:opening?"Roll to decide who starts":`${turn?"Your move":playerName(game.players[game.turn])+"'s move"}`;
 const openingHtml=game.openingRolls.some(die=>die!==null)||opening?`<section class="opening-rolls"><p>${opening&&game.openingPrevious?"Opening tie — both players roll again.":opening?"Each player rolls one die. Higher roll starts, then rolls both dice again.":"Opening rolls"}</p>${game.players.map((id,side)=>`<div><span>${playerName(id)}</span>${game.openingRolls[side]!==null?dieHtml(game.openingRolls[side]):"<span>Waiting…</span>"}</div>`).join("")}${opening&&game.openingPrevious?`<small>Previous tie: ${game.openingPrevious.join(" : ")}</small>`:""}</section>`:"";
 const legal=game.legalMoves||[];
 $("#game").innerHTML=`<p>${progress}</p><div class="bg-status"><strong>${status}</strong>
 <div class="dice">${game.dice.map((die,index)=>dieHtml(die,{index,disabled:!active||!legal.some(move=>move.dieIndex===index),used:game.used.includes(index)})).join("")}</div>
 ${!game.winner?`<div class="actions"><button id="bgUndo" ${game.canUndo?"":"disabled"}>Undo first move</button><button id="roll" ${opening?game.openingRolls[mySide]===null?"":"disabled":active&&game.phase==="roll"?"":"disabled"}>${opening?"Roll to start":"Roll"}</button></div>`:""}</div>
 ${game.gameNumber===1&&(opening||(!game.dice.length&&!game.lastTurn))?openingHtml:""}
 ${game.lastTurn?`<section class="last-roll"><p>${playerName(game.lastTurn.playerId)}: ${game.lastTurn.reason==="blocked"?"No legal moves remaining — turn passed":"Turn completed"}</p><div class="dice">${game.lastTurn.dice.map((die,index)=>dieHtml(die,{used:game.lastTurn.used.includes(index)})).join("")}</div></section>`:""}
 ${game.winner?`<section class="results"><h3>${game.scores?.forfeit?"Win by forfeit":game.scores?.mars?"Mars — opponent bore off no checkers":"Win"}</h3><p>${playerName(game.winner)} receives ${Number(game.scores?.awarded||0)} point(s).</p></section>${standings()}`:""}
 <div class="backgammon-layout"><div class="backgammon-wrap"><div class="backgammon-board"><div class="bg-row top">${row(top,"top")}</div><div class="bg-row bottom">${row(bottom,"bottom")}</div><div class="center-bar" aria-label="Bar — hit checkers">${barSide(0)}${barSide(1)}</div></div></div><aside class="off-tray" aria-label="Borne-off checkers"><strong>Off board</strong>${offSide(0)}${offSide(1)}</aside></div>
 <p class="board-hint">White moves toward point 1; red toward point 24. Choose a die, then a highlighted point. Hit checkers must re-enter from the center bar first. Undo is available only before the second move (or the opponent's next roll).</p>`;
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
 $("#roll")?.addEventListener("click",()=>act({type:"roll"}));
 $("#bgUndo")?.addEventListener("click",()=>act({type:"undo"}));
}

$("#rulesOpen").onclick=()=>$("#rules").showModal();
document.querySelectorAll("[data-rules-lang]").forEach(button=>button.onclick=()=>{
 const language=button.dataset.rulesLang;
 document.querySelectorAll(".rules-language").forEach(section=>section.hidden=section.dataset.language!==language);
});

fetch("/version",{cache:"no-store"}).then(response=>{
 if(!response.ok)throw Error("Version unavailable");
 return response.json();
}).then(info=>{
 document.querySelector("#buildInfo").textContent=
   info.environment+" · v"+info.version+" · build "+info.build;
}).catch(()=>{document.querySelector("#buildInfo").textContent="Build information unavailable"});
