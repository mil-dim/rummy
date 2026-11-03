const socket=io(), $=selector=>document.querySelector(selector);
let me=null,room=null,selected=new Set(),stagedMelds=[],draggedCard=null;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const player=id=>room?.players.find(candidate=>candidate.id===id);
const playerName=id=>esc(player(id)?.name||"Player");
const toast=message=>{const element=$("#toast");element.textContent=String(message||"Something went wrong.");element.style.display="block";setTimeout(()=>element.style.display="none",3000)};

socket.on("connect",()=>{$("#status").textContent="Connected";const token=localStorage.token;if(token)socket.emit("identify",{token,name:localStorage.name},identified)});
socket.on("disconnect",()=>$("#status").textContent="Reconnecting…");
function identified(response){if(!response?.ok){localStorage.removeItem("token");toast(response?.error);return}localStorage.token=response.token;localStorage.name=response.player.name;me=response.player;$("#welcome").hidden=true;$("#lobby").hidden=false}
$("#identity").onsubmit=event=>{event.preventDefault();socket.emit("identify",{name:$("#name").value},identified)};

socket.on("lobby",rooms=>{$("#rooms").innerHTML=rooms.map(item=>`<article class="roomCard"><p class="eyebrow">${esc(item.gameType)}</p><h3>${esc(item.name)}</h3><p>${Number(item.players)}/${Number(item.maxPlayers)} players · ${esc(item.id)}</p><button data-join="${esc(item.id)}" ${item.started?"disabled":""}>${item.started?"In progress":"Join table"}</button></article>`).join("")||"<p>No open rooms yet.</p>"});
document.addEventListener("click",event=>{const id=event.target.dataset.join;if(id)socket.emit("joinRoom",{id},response=>!response.ok&&toast(response.error))});
$("#newRoom").onclick=()=>$("#create").showModal();
$("#gameType").onchange=()=>{$("#maxPlayers").disabled=$("#gameType").value==="backgammon"};
$("#createGo").onclick=event=>{event.preventDefault();socket.emit("createRoom",{name:$("#createName").value,gameType:$("#gameType").value,maxPlayers:$("#maxPlayers").value},response=>{if(response.ok)$("#create").close();else toast(response.error)})};

function updateStartButton(){
 const button=$("#start");
 if(room.hostId!==me.id||room.game&&!room.game.winner){button.hidden=true;return}
 button.hidden=false;
 if(!room.game)button.textContent=room.gameType==="rummy"?"Start match":"Start game";
 else if(room.gameType==="rummy"&&room.match?.finished)button.textContent="New match";
 else button.textContent="Next game";
}
$("#start").onclick=()=>{
 if(room.gameType==="rummy"&&(!room.match||room.match.finished)){$("#matchSetup").showModal();return}
 socket.emit("startGame",{},response=>!response.ok&&toast(response.error));
};
$("#matchGo").onclick=event=>{event.preventDefault();socket.emit("startGame",{sprintCount:Number($("#sprintCount").value)},response=>{if(response.ok)$("#matchSetup").close();else toast(response.error)})};

socket.on("room",next=>{
 if(Number(next.protocolVersion)>2){toast("This client is too old. Refresh the page.");return}
 const previousGame=room?.game?.gameNumber;
 room=next;
 if(previousGame!==room.game?.gameNumber){selected.clear();stagedMelds=[]}
 $("#lobby").hidden=true;$("#room").hidden=false;
 $("#roomCode").textContent=`ROOM ${room.id} · ${room.gameType}`;
 $("#roomName").textContent=room.name;
 $("#players").innerHTML=room.players.map(item=>`<span>${item.connected?"●":"○"} ${esc(item.name)}</span>`).join("");
 updateStartButton();renderGame();
});

function act(action,onSuccess){
 socket.emit("action",action,response=>{
   if(!response?.ok){toast(response?.error);return}
   selected.clear();if(onSuccess)onSuccess();
 });
}

function declared(card){return card.rank==="JOKER"&&card.represents?`${card.represents.rank}${card.represents.suit}`:""}
function cardHtml(card,{hand=false}={}){
 const joker=card.rank==="JOKER",red=!joker&&"♥♦".includes(card.suit),label=declared(card);
 return `<button class="playing-card ${red?"red":"black"} ${joker?"joker":""} ${selected.has(card.id)?"selected":""}" ${hand?`data-hand-card="${esc(card.id)}" draggable="true"`:""} aria-label="${joker?`Joker ${esc(label)}`:`${esc(card.rank)} of ${esc(card.suit)}`}">
 <span class="corner top"><b>${joker?"★":esc(card.rank)}</b><i>${joker?esc(label):esc(card.suit)}</i></span>
 <span class="pip">${joker?(label?`JOKER<br><small>${esc(label)}</small>`:"JOKER"):esc(card.suit)}</span>
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
 if(id){selected.has(id)?selected.delete(id):selected.add(id);renderGame()}
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
function jokerAssignments(cards){
 const assignments=[];
 for(const card of cards.filter(item=>item.rank==="JOKER"&&!item.represents)){
   const value=prompt("Which exact card does this joker represent? Examples: 8C, J♠, QH");
   const parsed=parseDeclaration(value);
   if(!parsed){toast("Use a rank followed by S, H, D, C or a suit symbol.");return null}
   assignments.push({cardId:card.id,...parsed});
 }
 return assignments;
}

function renderGame(){
 const game=room?.game;
 if(!game){$("#game").innerHTML="<div class='notice'>Waiting for the host to start…</div>";return}
 game.kind==="rummy"?renderRummy(game):renderBackgammon(game);
}

function resultTable(game){
 const rows=game.players.map(id=>{const score=game.scores.players[id];return `<tr><td>${playerName(id)}${id===game.winner?" 🏆":""}</td><td>${score.cards}</td><td>${score.raw}</td><td>${score.match}</td><td>${score.fullHand?"Full hand":""}</td></tr>`}).join("");
 return `<section class="results"><h2>${playerName(game.winner)} wins!</h2><table><thead><tr><th>Player</th><th>Cards</th><th>Raw</th><th>Match</th><th></th></tr></thead><tbody>${rows}</tbody></table><p>Winner receives <strong>${game.scores.awarded}</strong> match points${game.sprint?" (sprint ×2)":""}.</p></section>`;
}
function standings(){
 if(!room.match)return "";
 const rows=Object.entries(room.match.cumulative).sort((a,b)=>b[1]-a[1]).map(([id,score])=>`<tr><td>${playerName(id)}</td><td>${Number(score)}</td></tr>`).join("");
 return `<section class="standings"><h3>${room.match.finished?"Final standings":"Cumulative standings"}</h3><table><tbody>${rows}</tbody></table></section>`;
}
function stagedHtml(hand){
 if(!stagedMelds.length)return "";
 const byId=new Map(hand.map(card=>[card.id,card]));
 return `<section class="staging"><h3>Staged melds</h3>${stagedMelds.map((meld,index)=>`<div class="staged-meld">${meld.cardIds.map(id=>cardHtml(byId.get(id))).join("")}<button data-unstage="${index}" class="ghost">Remove</button></div>`).join("")}<button id="layAll">Lay all melds</button></section>`;
}

function renderRummy(game){
 const hand=Array.isArray(game.hands[me.id])?orderedHand(game.hands[me.id]):[];
 const handIds=new Set(hand.map(card=>card.id));
 stagedMelds=stagedMelds.filter(meld=>meld.cardIds.every(id=>handIds.has(id)));
 const turn=game.players[game.turn]===me.id,active=turn&&!game.winner;
 const progress=room.match?`Game ${game.gameNumber} of ${room.match.totalGames}`:`Game ${game.gameNumber}`;
 const status=game.winner?`${progress} finished`:`${game.sprint?"⚡ SPRINT ×2 · ":""}${progress} · ${turn?"Your turn":playerName(game.players[game.turn])+"'s turn"}`;
 const discard=game.discard.at(-1);
 $("#game").innerHTML=`<p class="game-status">${status}</p>
 ${game.winner?resultTable(game)+standings():""}
 ${!game.winner?`<div class="draw-area"><button id="stock" ${!active||game.phase!=="draw"?"disabled":""}>Draw stock <b>${Number(game.stock.count)}</b></button><div class="discard-pile"><span>Discard</span>${discard?cardHtml(discard):"<em>Empty</em>"}<button id="discardDraw" ${!active||game.phase!=="draw"||!discard?"disabled":""}>Take card</button></div></div>`:""}
 <h3>Your hand</h3><div class="hand">${hand.map(item=>cardHtml(item,{hand:!game.winner})).join("")}</div>
 ${!game.winner?`<div class="actions"><button id="stage" ${!active||game.phase!=="play"?"disabled":""}>Stage selected meld</button><button id="discardBtn" ${!active||game.phase!=="play"?"disabled":""}>Discard selected</button></div>${stagedHtml(hand)}`:""}
 <h3>Table melds</h3>${game.melds.map(meld=>`<div class="meld"><div class="meld-cards">${meld.cards.map(item=>cardHtml(item)).join("")}</div>${!game.winner?`<button data-add="${esc(meld.id)}" ${!active||game.phase!=="play"?"disabled":""}>Add selected</button>${meld.cards.filter(item=>item.rank==="JOKER").map(item=>`<button data-replace="${esc(meld.id)}" data-joker="${esc(item.id)}" ${!active||game.phase!=="play"?"disabled":""}>Replace ${esc(declared(item))}</button>`).join("")}`:""}</div>`).join("")}`;

 $("#stock")?.addEventListener("click",()=>act({type:"draw",from:"stock"}));
 $("#discardDraw")?.addEventListener("click",()=>act({type:"draw",from:"discard"}));
 $("#stage")?.addEventListener("click",()=>{
   const ids=[...selected],used=new Set(stagedMelds.flatMap(item=>item.cardIds));
   if(ids.length<3)return toast("Select at least three cards.");
   if(ids.some(id=>used.has(id)))return toast("A card is already assigned to another staged meld.");
   const cards=ids.map(id=>hand.find(card=>card.id===id)),assignments=jokerAssignments(cards);
   if(assignments===null)return;
   stagedMelds.push({cardIds:ids,jokerAssignments:assignments});selected.clear();renderGame();
 });
 document.querySelectorAll("[data-unstage]").forEach(button=>button.onclick=()=>{stagedMelds.splice(Number(button.dataset.unstage),1);renderGame()});
 $("#layAll")?.addEventListener("click",()=>act({type:"meldBatch",melds:stagedMelds},()=>{stagedMelds=[]}));
 $("#discardBtn")?.addEventListener("click",()=>{if(selected.size!==1)return toast("Select one card.");act({type:"discard",cardId:[...selected][0]})});
 document.querySelectorAll("[data-add]").forEach(button=>button.onclick=()=>{
   const cards=[...selected].map(id=>hand.find(card=>card.id===id)),assignments=jokerAssignments(cards);
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
function renderBackgammon(game){
 const turn=game.players[game.turn]===me.id,active=turn&&!game.winner;
 const top=[12,13,14,15,16,17,18,19,20,21,22,23],bottom=[11,10,9,8,7,6,5,4,3,2,1,0];
 const row=(ids,edge)=>`${ids.slice(0,6).map(index=>bgPoint(game,index,edge)).join("")}<div class="bar ${edge}" data-point="bar">${game.bar.map((count,side)=>count?`<span class="bar-group side-${side}">${Array.from({length:Math.min(Number(count),3)},()=>"<i></i>").join("")}<b>${Number(count)}</b></span>`:"").join("")}</div>${ids.slice(6).map(index=>bgPoint(game,index,edge)).join("")}`;
 $("#game").innerHTML=`<div class="bg-status"><div><p class="eyebrow">BACKGAMMON</p><strong>${game.winner?`${playerName(game.winner)} wins!`:turn?"Your move":playerName(game.players[game.turn])+"'s move"}</strong></div>
 <div class="dice">${game.dice.map((die,index)=>`<button class="die face-${Number(die)}" data-die="${index}" ${game.used.includes(index)||!active?"disabled":""} aria-label="Die ${Number(die)}">${Array.from({length:Number(die)},()=>"<i></i>").join("")}</button>`).join("")||(!game.winner?"<span>Roll the dice</span>":"")}</div>
 ${!game.winner?`<div class="actions"><button id="roll" ${!active||game.dice.length?"disabled":""}>Roll</button></div>`:""}</div>
 <div class="backgammon-wrap"><div class="off-tray"><span>Off</span><b class="off-0">${Number(game.borneOff[0])}</b><b class="off-1">${Number(game.borneOff[1])}</b></div><div class="backgammon-board"><div class="bg-row top">${row(top,"top")}</div><div class="bg-row bottom">${row(bottom,"bottom")}</div></div></div>
 <p class="board-hint">Choose a die, then a pool. If you have checkers on the bar, choose the center bar.</p>`;
 let die=null;
 document.querySelectorAll("[data-die]").forEach(button=>button.onclick=()=>{die=Number(button.dataset.die);document.querySelectorAll("[data-die]").forEach(candidate=>candidate.classList.toggle("chosen",candidate===button));toast("Now choose a pool")});
 document.querySelectorAll("[data-point]").forEach(button=>button.onclick=()=>{if(die===null)return;act({type:"move",from:button.dataset.point==="bar"?"bar":Number(button.dataset.point),dieIndex:die})});
 $("#roll")?.addEventListener("click",()=>act({type:"roll"}));
}

$("#rulesOpen").onclick=()=>$("#rules").showModal();
document.querySelectorAll("[data-rules-lang]").forEach(button=>button.onclick=()=>{
 const language=button.dataset.rulesLang;
 document.querySelectorAll(".rules-language").forEach(section=>section.hidden=section.dataset.language!==language);
});
