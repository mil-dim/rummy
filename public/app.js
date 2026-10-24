const socket=io(), $=s=>document.querySelector(s); let me=null,room=null,selected=new Set();
const toast=m=>{const e=$("#toast");e.textContent=m;e.style.display="block";setTimeout(()=>e.style.display="none",2600)};
socket.on("connect",()=>{$("#status").textContent="Connected";const token=localStorage.token;if(token)socket.emit("identify",{token,name:localStorage.name},identified)});
socket.on("disconnect",()=>$("#status").textContent="Reconnecting…");
function identified(x){localStorage.token=x.token;localStorage.name=x.player.name;me=x.player;$("#welcome").hidden=true;$("#lobby").hidden=false}
$("#identity").onsubmit=e=>{e.preventDefault();socket.emit("identify",{name:$("#name").value},identified)};
socket.on("lobby",rooms=>{$("#rooms").innerHTML=rooms.map(r=>`<article class="roomCard"><p class="eyebrow">${r.gameType}</p><h3>${r.name}</h3><p>${r.players}/${r.maxPlayers} players · ${r.id}</p><button data-join="${r.id}" ${r.started?"disabled":""}>${r.started?"In progress":"Join table"}</button></article>`).join("")||"<p>No open rooms yet.</p>"});
document.addEventListener("click",e=>{const id=e.target.dataset.join;if(id)socket.emit("joinRoom",{id},x=>!x.ok&&toast(x.error))});
$("#newRoom").onclick=()=>$("#create").showModal();
$("#gameType").onchange=()=>{$("#maxPlayers").disabled=$("#gameType").value==="backgammon"};
$("#createGo").onclick=e=>{e.preventDefault();socket.emit("createRoom",{name:$("#createName").value,gameType:$("#gameType").value,maxPlayers:$("#maxPlayers").value},x=>{if(x.ok)$("#create").close();else toast(x.error)})};
$("#start").onclick=()=>socket.emit("startGame",{},x=>!x.ok&&toast(x.error));
socket.on("room",r=>{room=r;$("#lobby").hidden=true;$("#room").hidden=false;$("#roomCode").textContent=`ROOM ${r.id} · ${r.gameType}`;$("#roomName").textContent=r.name;$("#players").innerHTML=r.players.map(p=>`<span>${p.connected?"●":"○"} ${p.name}</span>`).join("");$("#start").hidden=!!r.game||r.hostId!==me.id;renderGame()});
function act(a){socket.emit("action",a,x=>!x.ok&&toast(x.error));selected.clear()}
function card(c){
 const joker=c.rank==="JOKER", red=!joker&&"♥♦".includes(c.suit);
 return `<button class="playing-card ${red?"red":"black"} ${joker?"joker":""} ${selected.has(c.id)?"selected":""}" data-card="${c.id}" aria-label="${joker?"Joker":`${c.rank} of ${c.suit}`}">
   <span class="corner top"><b>${joker?"★":c.rank}</b><i>${joker?"":c.suit}</i></span>
   <span class="pip">${joker?"JOKER":c.suit}</span>
   <span class="corner bottom"><b>${joker?"★":c.rank}</b><i>${joker?"":c.suit}</i></span>
 </button>`;
}
document.addEventListener("click",e=>{const id=e.target.closest("[data-card]")?.dataset.card;if(id){selected.has(id)?selected.delete(id):selected.add(id);renderGame()}});
function renderGame(){const g=room?.game;if(!g){$("#game").innerHTML="<div class='card'>Waiting for the host to start…</div>";return}g.kind==="rummy"?renderRummy(g):renderBackgammon(g)}
function renderRummy(g){const hand=g.hands[me.id]||[];const turn=g.players[g.turn]===me.id;
 $("#game").innerHTML=`<p>${g.sprint?"⚡ SPRINT — DOUBLE SCORE":"Game "+g.gameNumber} · ${turn?"Your turn":room.players.find(p=>p.id===g.players[g.turn])?.name+"'s turn"}</p>
 ${g.winner?`<h2>${room.players.find(p=>p.id===g.winner)?.name} wins!</h2><pre>${JSON.stringify(g.scores,null,2)}</pre>`:""}
 <div class="actions"><button id="stock" ${!turn||g.phase!=="draw"?"disabled":""}>Draw stock (${g.stock.count})</button><button id="discardDraw" ${!turn||g.phase!=="draw"?"disabled":""}>Take discard ${g.discard.at(-1)?.rank||""}</button></div>
 <div class="hand">${hand.map(card).join("")}</div>
 <div class="actions"><button id="meld" ${!turn||g.phase!=="play"?"disabled":""}>Lay selected meld</button><button id="discardBtn" ${!turn||g.phase!=="play"?"disabled":""}>Discard selected</button></div>
 <h3>Table melds</h3>${g.melds.map(m=>`<div class="meld">${m.cards.map(card).join("")}<button data-add="${m.id}">Add selected</button></div>`).join("")}`;
 $("#stock")?.addEventListener("click",()=>act({type:"draw",from:"stock"}));$("#discardDraw")?.addEventListener("click",()=>act({type:"draw",from:"discard"}));
 $("#meld")?.addEventListener("click",()=>act({type:"meld",cardIds:[...selected]}));$("#discardBtn")?.addEventListener("click",()=>{if(selected.size!==1)return toast("Select one card.");act({type:"discard",cardId:[...selected][0]})});
 document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>act({type:"add",meldId:b.dataset.add,cardIds:[...selected]}));
}
const checkerStack=(p,side)=>p.count?`<span class="checker-stack">${Array.from({length:Math.min(p.count,5)},(_,i)=>`<i class="checker side-${p.owner}" style="--stack:${i}"></i>`).join("")}${p.count>5?`<b class="checker-count">${p.count}</b>`:""}</span>`:"";
const bgPoint=(g,i,edge)=>`<button class="bg-point ${edge}" data-point="${i}" aria-label="Point ${i+1}, ${g.points[i].count} checkers"><span class="triangle"></span><small>${i+1}</small>${checkerStack(g.points[i])}</button>`;
function renderBackgammon(g){
 const turn=g.players[g.turn]===me.id;
 const top=[12,13,14,15,16,17,18,19,20,21,22,23], bottom=[11,10,9,8,7,6,5,4,3,2,1,0];
 const row=(ids,edge)=>`${ids.slice(0,6).map(i=>bgPoint(g,i,edge)).join("")}<div class="bar ${edge}" data-point="bar">${g.bar.map((n,s)=>n?`<span class="bar-group side-${s}">${Array.from({length:Math.min(n,3)},()=>"<i></i>").join("")}<b>${n}</b></span>`:"").join("")}</div>${ids.slice(6).map(i=>bgPoint(g,i,edge)).join("")}`;
 $("#game").innerHTML=`<div class="bg-status"><div><p class="eyebrow">BACKGAMMON</p><strong>${turn?"Your move":room.players.find(p=>p.id===g.players[g.turn])?.name+"'s move"}</strong></div>
 <div class="dice">${g.dice.map((d,i)=>`<button class="die face-${d}" data-die="${i}" ${g.used.includes(i)?"disabled":""} aria-label="Die ${d}">${Array.from({length:d},()=>"<i></i>").join("")}</button>`).join("")||"<span>Roll the dice</span>"}</div>
 <div class="actions"><button id="roll" ${!turn||g.dice.length?"disabled":""}>Roll</button><button id="end" ${!turn||!g.dice.length?"disabled":""}>End turn</button></div></div>
 ${g.winner?`<h2>${room.players.find(p=>p.id===g.winner)?.name} wins!</h2>`:""}
 <div class="backgammon-wrap"><div class="off-tray"><span>Off</span><b class="off-0">${g.borneOff[0]}</b><b class="off-1">${g.borneOff[1]}</b></div>
 <div class="backgammon-board"><div class="bg-row top">${row(top,"top")}</div><div class="bg-row bottom">${row(bottom,"bottom")}</div></div></div>
 <p class="board-hint">Choose a die, then a pool. If you have checkers on the bar, choose the center bar.</p>`;
 let die=null;
 document.querySelectorAll("[data-die]").forEach(b=>b.onclick=()=>{die=Number(b.dataset.die);document.querySelectorAll("[data-die]").forEach(x=>x.classList.toggle("chosen",x===b));toast("Now choose a pool")});
 document.querySelectorAll("[data-point]").forEach(b=>b.onclick=()=>{if(die===null)return;act({type:"move",from:b.dataset.point==="bar"?"bar":Number(b.dataset.point),dieIndex:die})});
 $("#roll").onclick=()=>act({type:"roll"});$("#end").onclick=()=>act({type:"end"});
}
