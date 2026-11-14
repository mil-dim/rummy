import {randomInt,randomUUID} from 'node:crypto';

export const RESOURCES=['timber','stone','livestock','grain','metal'];
const TERRAINS={timber:'forest',stone:'quarry',livestock:'pasture',grain:'fields',metal:'mountains',wasteland:'wasteland'};
const COSTS={route:{timber:1,stone:1},village:{timber:1,stone:1,livestock:1,grain:1},town:{grain:2,metal:3},fortune:{livestock:1,grain:1,metal:1}};
const RESOURCE_TILES=['timber','timber','timber','timber','stone','stone','stone','livestock','livestock','livestock','livestock','grain','grain','grain','grain','metal','metal','metal','wasteland'];
const TOKENS=[2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];
const HARBORS=['any','any','any','any',...RESOURCES];

const emptyResources=()=>Object.fromEntries(RESOURCES.map(name=>[name,0]));
const totalResources=value=>RESOURCES.reduce((sum,name)=>sum+Number(value?.[name]||0),0);
const shuffled=input=>{const out=[...input];for(let i=out.length-1;i>0;i--){const j=randomInt(i+1);[out[i],out[j]]=[out[j],out[i]]}return out};
const keyPoint=(x,y)=>`${x.toFixed(4)},${y.toFixed(4)}`;

function geometry(){
 const axial=[];for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++)if(Math.abs(q+r)<=2)axial.push([q,r]);
 axial.sort((a,b)=>(a[1]-b[1])||(a[0]-b[0]));
 const vertexByKey=new Map(),vertices=[],edges=[],edgeByKey=new Map(),hexes=[];
 for(const [q,r] of axial){
  const cx=Math.sqrt(3)*(q+r/2),cy=1.5*r,ids=[];
  for(let i=0;i<6;i++){const angle=(30+60*i)*Math.PI/180,rawX=cx+Math.cos(angle),rawY=cy+Math.sin(angle),x=Math.abs(rawX)<1e-9?0:rawX,y=Math.abs(rawY)<1e-9?0:rawY,key=keyPoint(x,y);let id=vertexByKey.get(key);if(id===undefined){id=vertices.length;vertexByKey.set(key,id);vertices.push({id,x,y})}ids.push(id)}
  const edgeIds=[];for(let i=0;i<6;i++){const pair=[ids[i],ids[(i+1)%6]].sort((a,b)=>a-b),key=pair.join('-');let id=edgeByKey.get(key);if(id===undefined){id=edges.length;edgeByKey.set(key,id);edges.push({id,a:pair[0],b:pair[1],hexes:[]})}edges[id].hexes.push(hexes.length);edgeIds.push(id)}
  hexes.push({id:hexes.length,q,r,cx,cy,vertices:ids,edges:edgeIds});
 }
 const xs=vertices.map(v=>v.x),ys=vertices.map(v=>v.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const norm=(x,min,max)=>8+(x-min)/(max-min)*84;
 for(const v of vertices){v.x=norm(v.x,minX,maxX);v.y=norm(v.y,minY,maxY)}
 for(const h of hexes){h.x=norm(h.cx,minX,maxX);h.y=norm(h.cy,minY,maxY);delete h.cx;delete h.cy;delete h.q;delete h.r}
 const boundary=edges.filter(edge=>edge.hexes.length===1).sort((a,b)=>{const am=(vertices[a.a].x+vertices[a.b].x)/2-50,an=(vertices[a.a].y+vertices[a.b].y)/2-50,bm=(vertices[b.a].x+vertices[b.b].x)/2-50,bn=(vertices[b.a].y+vertices[b.b].y)/2-50;return Math.atan2(an,am)-Math.atan2(bn,bm)});
 const harborEdges=[];for(let i=0;i<9;i++)harborEdges.push(boundary[Math.floor(i*boundary.length/9)].id);
 const adjacentVertices=vertices.map(()=>[]);for(const edge of edges){adjacentVertices[edge.a].push(edge.b);adjacentVertices[edge.b].push(edge.a)}
 return {vertices,edges,hexes,harborEdges,adjacentVertices};
}
const BOARD=geometry();

function tileLayout(){
 for(let attempt=0;attempt<200;attempt++){
  const resources=shuffled(RESOURCE_TILES),numbers=shuffled(TOKENS),tiles=[];let n=0;
  for(let i=0;i<BOARD.hexes.length;i++){const resource=resources[i];tiles.push({id:i,resource,terrain:TERRAINS[resource],number:resource==='wasteland'?null:numbers[n++]})}
  const hot=tiles.filter(tile=>[6,8].includes(tile.number));
  if(!hot.some((tile,index)=>hot.slice(index+1).some(other=>BOARD.hexes[tile.id].edges.some(edge=>BOARD.edges[edge].hexes.includes(other.id)))))return tiles;
 }
 throw Error('Could not create board.');
}

function fortuneDeck(){return shuffled([
  ...Array(14).fill('guard'),...Array(5).fill('victory'),...Array(2).fill('routes'),...Array(2).fill('bounty'),...Array(2).fill('monopoly')
 ]).map(type=>({id:randomUUID(),type,boughtTurn:-1}));}

export function newCrossroads(players,{gameNumber=1}={}){
 if(!Array.isArray(players)||players.length<3||players.length>4)throw Error('Crossroads of Thrace requires three or four players.');
 const ids=players.map(player=>player.id),tiles=tileLayout(),harborKinds=shuffled(HARBORS);
 return {kind:'crossroads',gameNumber,players:ids,turn:0,turnNumber:0,phase:'setup-village',setupIndex:0,lastSetupVertex:null,
  tiles,harbors:BOARD.harborEdges.map((edge,index)=>({edge,kind:harborKinds[index]})),raider:tiles.find(tile=>tile.resource==='wasteland').id,
  buildings:[],routes:[],resources:ids.map(()=>emptyResources()),bank:Object.fromEntries(RESOURCES.map(name=>[name,19])),
  fortunes:ids.map(()=>[]),fortuneDeck:fortuneDeck(),playedFortune:false,freeRoutes:0,guards:ids.map(()=>0),longestHolder:null,longestLengths:ids.map(()=>0),guardHolder:null,
  pendingDiscards:ids.map(()=>0),trade:null,resumePhase:null,winner:null,finished:false,resultRecorded:false,
  log:['The first villages are being founded.']};
}

const sideOf=(game,playerId)=>game.players.indexOf(playerId);
const buildingAt=(game,vertex)=>game.buildings.find(item=>item.vertex===vertex);
const routeAt=(game,edge)=>game.routes.find(item=>item.edge===edge);
const edgeTouches=(edge,vertex)=>edge.a===vertex||edge.b===vertex;
const otherVertex=(edge,vertex)=>edge.a===vertex?edge.b:edge.a;
function playerBuildings(game,side,type){return game.buildings.filter(item=>item.side===side&&(!type||item.type===type))}
function playerRoutes(game,side){return game.routes.filter(item=>item.side===side)}
function canAfford(game,side,cost){return RESOURCES.every(name=>game.resources[side][name]>=(cost[name]||0))}
function pay(game,side,cost){if(!canAfford(game,side,cost))throw Error('You do not have the required materials.');for(const name of RESOURCES){const count=cost[name]||0;game.resources[side][name]-=count;game.bank[name]+=count}}
function give(game,side,name,count=1){const amount=Math.min(count,game.bank[name]);game.bank[name]-=amount;game.resources[side][name]+=amount;return amount}
function log(game,message){game.log.push(message);if(game.log.length>40)game.log.shift()}
function requireTurn(game,side){if(game.finished)throw Error('This game has finished.');if(side<0||game.turn!==side)throw Error('It is not your turn.');}

function setupSide(game){const n=game.players.length,i=game.setupIndex;return i<n?i:2*n-1-i}
function legalVillageVertices(game,side,setup=false){
 if(!setup&&playerBuildings(game,side).length>=9)return [];
 return BOARD.vertices.filter(vertex=>!buildingAt(game,vertex.id)&&BOARD.adjacentVertices[vertex.id].every(id=>!buildingAt(game,id))&&
  (setup||BOARD.edges.some(edge=>edgeTouches(edge,vertex.id)&&routeAt(game,edge.id)?.side===side))).map(vertex=>vertex.id);
}
function roadConnected(game,side,edgeId){
 const edge=BOARD.edges[edgeId];if(!edge||routeAt(game,edgeId))return false;
 return [edge.a,edge.b].some(vertex=>{
  const building=buildingAt(game,vertex);if(building&&building.side!==side)return false;
  return building?.side===side||BOARD.edges.some(other=>other.id!==edgeId&&edgeTouches(other,vertex)&&routeAt(game,other.id)?.side===side);
 });
}
function legalRouteEdges(game,side,setup=false){
 if(playerRoutes(game,side).length>=15)return [];
 if(setup)return BOARD.edges.filter(edge=>!routeAt(game,edge.id)&&edgeTouches(edge,game.lastSetupVertex)).map(edge=>edge.id);
 return BOARD.edges.filter(edge=>roadConnected(game,side,edge.id)).map(edge=>edge.id);
}

function adjacentTiles(vertex){return BOARD.hexes.filter(hex=>hex.vertices.includes(vertex)).map(hex=>hex.id)}
function initialResources(game,side,vertex){for(const tileId of adjacentTiles(vertex)){const resource=game.tiles[tileId].resource;if(resource!=='wasteland')give(game,side,resource)}}
function buildVillage(game,side,vertex,setup){
 if(!legalVillageVertices(game,side,setup).includes(vertex))throw Error('That village location is not available.');
 if(!setup){if(playerBuildings(game,side,'village').length>=5)throw Error('You have no villages left.');pay(game,side,COSTS.village)}
 game.buildings.push({vertex,side,type:'village'});updateAwards(game);checkWinner(game,side);
}
function buildRoute(game,side,edge,setup){
 if(!legalRouteEdges(game,side,setup).includes(edge))throw Error('That trade route is not available.');
 if(!setup){if(game.freeRoutes>0)game.freeRoutes--;else pay(game,side,COSTS.route)}
 game.routes.push({edge,side});updateAwards(game);checkWinner(game,side);
 if(!setup&&game.phase==='free-routes'&&(game.freeRoutes===0||legalRouteEdges(game,side,false).length===0)){game.freeRoutes=0;game.phase=game.freeRouteResume||'action';game.freeRouteResume=null}
}

function longestRoute(game,side){
 const owned=new Set(playerRoutes(game,side).map(item=>item.edge));let best=0;
 function walk(vertex,used){
  best=Math.max(best,used.size);const blocker=buildingAt(game,vertex);if(used.size&&blocker&&blocker.side!==side)return;
  for(const edge of BOARD.edges)if(owned.has(edge.id)&&!used.has(edge.id)&&edgeTouches(edge,vertex)){const next=new Set(used);next.add(edge.id);walk(otherVertex(edge,vertex),next)}
 }
 for(const edgeId of owned){const edge=BOARD.edges[edgeId];walk(edge.a,new Set());walk(edge.b,new Set())}return best;
}
function awardHolder(values,minimum,current){const max=Math.max(...values);if(max<minimum)return null;const leaders=values.map((value,index)=>value===max?index:null).filter(value=>value!==null);if(leaders.length===1)return leaders[0];return leaders.includes(current)?current:null}
function updateAwards(game){game.longestLengths=game.players.map((_,side)=>longestRoute(game,side));game.longestHolder=awardHolder(game.longestLengths,5,game.longestHolder);game.guardHolder=awardHolder(game.guards,3,game.guardHolder)}
function visibleScore(game,side){return playerBuildings(game,side).reduce((sum,item)=>sum+(item.type==='town'?2:1),0)+(game.longestHolder===side?2:0)+(game.guardHolder===side?2:0)}
function totalScore(game,side){return visibleScore(game,side)+game.fortunes[side].filter(card=>card.type==='victory').length}
function checkWinner(game,side){updateAwards(game);if(totalScore(game,side)>=10){game.scores=game.players.map((_,index)=>totalScore(game,index));game.winner=game.players[side];game.finished=true;game.phase='finished';game.trade=null;log(game,`Player ${side+1} founded the strongest province.`)}}

function produce(game,total){
 const claims=Object.fromEntries(RESOURCES.map(name=>[name,[]]));
 for(const tile of game.tiles)if(tile.number===total&&tile.id!==game.raider)for(const building of game.buildings)if(BOARD.hexes[tile.id].vertices.includes(building.vertex))claims[tile.resource].push({side:building.side,count:building.type==='town'?2:1});
 for(const name of RESOURCES){const needed=claims[name].reduce((sum,item)=>sum+item.count,0);if(needed>game.bank[name])continue;for(const item of claims[name])give(game,item.side,name,item.count)}
}
function roll(game,side){requireTurn(game,side);if(game.phase!=='roll')throw Error('You cannot roll now.');const dice=[randomInt(1,7),randomInt(1,7)],total=dice[0]+dice[1];game.dice=dice;log(game,`Player ${side+1} rolled ${dice[0]} + ${dice[1]}.`);if(total===7){game.pendingDiscards=game.resources.map(value=>totalResources(value)>7?Math.floor(totalResources(value)/2):0);game.phase=game.pendingDiscards.some(Boolean)?'discard':'raider';game.resumePhase='action'}else{produce(game,total);game.phase='action'}}
function discard(game,side,cards){
 const required=game.pendingDiscards[side];if(game.phase!=='discard'||!required)throw Error('You do not need to discard.');if(totalResources(cards)!==required)throw Error(`Choose exactly ${required} materials.`);
 for(const name of RESOURCES){const count=Number(cards?.[name]||0);if(!Number.isInteger(count)||count<0||count>game.resources[side][name])throw Error('Invalid discard.');game.resources[side][name]-=count;game.bank[name]+=count}
 game.pendingDiscards[side]=0;log(game,`Player ${side+1} returned ${required} materials.`);if(!game.pendingDiscards.some(Boolean))game.phase='raider';
}
function eligibleVictims(game,side,tile){return [...new Set(game.buildings.filter(item=>item.side!==side&&BOARD.hexes[tile].vertices.includes(item.vertex)&&totalResources(game.resources[item.side])>0).map(item=>item.side))]}
function moveRaider(game,side,tile,victim){
 requireTurn(game,side);if(game.phase!=='raider')throw Error('Move the raider at the proper time.');if(!Number.isInteger(tile)||!game.tiles[tile]||tile===game.raider)throw Error('Choose a different land tile.');
 const victims=eligibleVictims(game,side,tile);if(victims.length&&victim===undefined)throw Error('Choose a neighboring player to steal from.');if(victim!==undefined&&!victims.includes(victim))throw Error('That player cannot be robbed.');
 game.raider=tile;if(victim!==undefined){const pool=[];for(const name of RESOURCES)for(let i=0;i<game.resources[victim][name];i++)pool.push(name);if(pool.length){const name=pool[randomInt(pool.length)];game.resources[victim][name]--;game.resources[side][name]++;log(game,`Player ${side+1} moved the raider and stole one material from player ${victim+1}.`)}}
 else log(game,`Player ${side+1} moved the raider.`);game.phase=game.resumePhase||'action';game.resumePhase=null;checkWinner(game,side);
}

function harborRatio(game,side,name){let ratio=4;for(const harbor of game.harbors){const edge=BOARD.edges[harbor.edge];if(![edge.a,edge.b].some(vertex=>buildingAt(game,vertex)?.side===side))continue;if(harbor.kind===name)return 2;if(harbor.kind==='any')ratio=3}return ratio}
function bankTrade(game,side,giveName,getName){if(!RESOURCES.includes(giveName)||!RESOURCES.includes(getName)||giveName===getName)throw Error('Choose two different materials.');const ratio=harborRatio(game,side,giveName);if(game.resources[side][giveName]<ratio||game.bank[getName]<1)throw Error('That market trade is not available.');game.resources[side][giveName]-=ratio;game.bank[giveName]+=ratio;give(game,side,getName);log(game,`Player ${side+1} traded at a market.`)}
function validBundle(bundle,{allowZero=false}={}){const out=emptyResources();for(const name of RESOURCES){const count=Number(bundle?.[name]||0);if(!Number.isInteger(count)||count<0||count>19)throw Error('Invalid trade materials.');out[name]=count}if(!allowZero&&totalResources(out)<1)throw Error('Choose at least one material.');return out}
function offerTrade(game,side,giveValue,wantValue){const give=validBundle(giveValue),want=validBundle(wantValue);for(const name of RESOURCES)if(give[name]>game.resources[side][name])throw Error('You cannot offer materials you do not have.');game.trade={from:side,give,want};log(game,`Player ${side+1} offered a trade.`)}
function acceptTrade(game,side){const trade=game.trade;if(!trade||trade.from===side)throw Error('No trade is available to you.');for(const name of RESOURCES)if(trade.want[name]>game.resources[side][name]||trade.give[name]>game.resources[trade.from][name])throw Error('The offered materials are no longer available.');for(const name of RESOURCES){game.resources[trade.from][name]+=trade.want[name]-trade.give[name];game.resources[side][name]+=trade.give[name]-trade.want[name]}log(game,`Player ${side+1} accepted player ${trade.from+1}'s trade.`);game.trade=null}

function buyFortune(game,side){if(!game.fortuneDeck.length)throw Error('No Fortune cards remain.');pay(game,side,COSTS.fortune);const card=game.fortuneDeck.pop();card.boughtTurn=game.turnNumber;game.fortunes[side].push(card);log(game,`Player ${side+1} bought a Fortune card.`);checkWinner(game,side)}
function takeFromBank(game,side,names){if(!Array.isArray(names)||names.length!==2||names.some(name=>!RESOURCES.includes(name)))throw Error('Choose two materials.');const counts={};for(const name of names)counts[name]=(counts[name]||0)+1;for(const [name,count] of Object.entries(counts))if(game.bank[name]<count)throw Error('Those materials are not available.');for(const name of names)give(game,side,name)}
function playFortune(game,side,cardId,action){
 if(!['roll','action'].includes(game.phase))throw Error('You cannot play a Fortune card now.');if(game.playedFortune)throw Error('Only one Fortune card may be played per turn.');const index=game.fortunes[side].findIndex(card=>card.id===cardId),card=game.fortunes[side][index];if(!card||card.type==='victory'||card.boughtTurn===game.turnNumber)throw Error('That Fortune card cannot be played now.');if(card.type==='routes'&&!legalRouteEdges(game,side,false).length)throw Error('There is nowhere to place a free route.');
 if(card.type==='bounty'){if(!Array.isArray(action.resources)||action.resources.length!==2||action.resources.some(name=>!RESOURCES.includes(name)))throw Error('Choose two materials.');const counts={};for(const name of action.resources)counts[name]=(counts[name]||0)+1;for(const [name,count] of Object.entries(counts))if(game.bank[name]<count)throw Error('Those materials are not available.')}
 if(card.type==='monopoly'&&!RESOURCES.includes(action.resource))throw Error('Choose a material.');
 game.fortunes[side].splice(index,1);game.playedFortune=true;const previous=game.phase;
 if(card.type==='guard'){game.guards[side]++;updateAwards(game);game.resumePhase=previous;game.phase='raider'}
 else if(card.type==='routes'){game.freeRoutes=2;game.freeRouteResume=previous;game.phase='free-routes'}
 else if(card.type==='bounty')takeFromBank(game,side,action.resources);
 else if(card.type==='monopoly'){const name=action.resource;if(!RESOURCES.includes(name))throw Error('Choose a material.');let count=0;for(let other=0;other<game.players.length;other++)if(other!==side){count+=game.resources[other][name];game.resources[side][name]+=game.resources[other][name];game.resources[other][name]=0}log(game,`Player ${side+1} claimed ${count} ${name}.`)}
 log(game,`Player ${side+1} played a Fortune card.`);checkWinner(game,side);
}

function endTurn(game,side){if(game.phase!=='action'||game.freeRoutes||game.trade)throw Error(game.trade?'Cancel the open trade first.':'Finish the free routes first.');game.turn=(side+1)%game.players.length;game.turnNumber++;game.phase='roll';game.dice=null;game.playedFortune=false;game.freeRoutes=0;log(game,`Player ${game.turn+1}'s turn began.`)}

export function crossroadsAction(game,playerId,action){
 if(!action||typeof action!=='object'||Array.isArray(action))throw Error('Invalid action.');const side=sideOf(game,playerId);if(side<0)throw Error('You are not seated in this game.');
 if(action.type==='discard'){discard(game,side,action.resources);return}
 if(action.type==='acceptTrade'){if(game.phase!=='action')throw Error('No trade is available now.');acceptTrade(game,side);return}
 requireTurn(game,side);
 if(game.phase==='setup-village'){
  if(action.type!=='buildVillage'||side!==setupSide(game))throw Error('Place your starting village.');buildVillage(game,side,Number(action.vertex),true);game.lastSetupVertex=Number(action.vertex);if(playerBuildings(game,side).length===2)initialResources(game,side,Number(action.vertex));game.phase='setup-route';return;
 }
 if(game.phase==='setup-route'){
  if(action.type!=='buildRoute'||side!==setupSide(game))throw Error('Place a route beside your new village.');buildRoute(game,side,Number(action.edge),true);game.setupIndex++;game.lastSetupVertex=null;if(game.setupIndex>=game.players.length*2){game.turn=0;game.phase='roll';log(game,'The founding round is complete.')}else{game.turn=setupSide(game);game.phase='setup-village'}return;
 }
 if(action.type==='roll'){roll(game,side);return}if(action.type==='moveRaider'){moveRaider(game,side,Number(action.tile),action.victim===undefined?undefined:Number(action.victim));return}
 if(action.type==='playFortune'){playFortune(game,side,String(action.cardId||''),action);return}
 if(game.phase==='free-routes'){if(action.type!=='buildRoute')throw Error('Place the free trade routes first.');buildRoute(game,side,Number(action.edge),false);return}
 if(game.phase!=='action')throw Error('Complete the current step first.');
 if(action.type==='buildRoute'){buildRoute(game,side,Number(action.edge),false);return}
 if(action.type==='buildVillage'){buildVillage(game,side,Number(action.vertex),false);return}
 if(action.type==='buildTown'){const vertex=Number(action.vertex),building=buildingAt(game,vertex);if(!building||building.side!==side||building.type!=='village')throw Error('Upgrade one of your villages.');if(playerBuildings(game,side,'town').length>=4)throw Error('You have no towns left.');pay(game,side,COSTS.town);building.type='town';checkWinner(game,side);return}
 if(action.type==='buyFortune'){buyFortune(game,side);return}
 if(action.type==='bankTrade'){bankTrade(game,side,action.give,action.get);return}
 if(action.type==='offerTrade'){offerTrade(game,side,action.give,action.want);return}
 if(action.type==='cancelTrade'){if(!game.trade||game.trade.from!==side)throw Error('You have no trade to cancel.');game.trade=null;return}
 if(action.type==='endTurn'){endTurn(game,side);return}
 throw Error('Unknown Crossroads action.');
}

function canBuy(game,side,cost,pieces=true){return canAfford(game,side,cost)&&pieces}
export function publicCrossroads(game,viewerId){
 const viewer=sideOf(game,viewerId),own=viewer>=0,setup=game.phase.startsWith('setup-'),active=own&&game.turn===viewer&&!game.finished;
 const mayBuyVillage=own&&canAfford(game,viewer,COSTS.village)&&playerBuildings(game,viewer,'village').length<5;
 const mayBuyRoute=own&&(game.freeRoutes>0||canAfford(game,viewer,COSTS.route))&&playerRoutes(game,viewer).length<15;
 const legalVertices=active&&game.phase==='setup-village'?legalVillageVertices(game,viewer,true):active&&game.phase==='action'&&mayBuyVillage?legalVillageVertices(game,viewer,false):[];
 const legalEdges=active&&game.phase==='setup-route'?legalRouteEdges(game,viewer,true):active&&['action','free-routes'].includes(game.phase)&&mayBuyRoute?legalRouteEdges(game,viewer,false):[];
 const resources=game.resources.map((value,side)=>side===viewer?{...value}:{count:totalResources(value)}),fortunes=game.fortunes.map((cards,side)=>side===viewer||game.finished?cards.map(card=>({id:card.id,type:card.type,playable:side===viewer&&card.type!=='victory'&&card.boughtTurn!==game.turnNumber&&!game.playedFortune})):{count:cards.length});
 const victims=active&&game.phase==='raider'?Object.fromEntries(game.tiles.filter(tile=>tile.id!==game.raider).map(tile=>[tile.id,eligibleVictims(game,viewer,tile.id)])):{};
 return {kind:game.kind,gameNumber:game.gameNumber,players:[...game.players],turn:game.turn,turnNumber:game.turnNumber,phase:game.phase,dice:game.dice||null,
  board:{vertices:BOARD.vertices,edges:BOARD.edges.map(({id,a,b})=>({id,a,b})),hexes:BOARD.hexes.map(({id,x,y,vertices,edges})=>({id,x,y,vertices,edges})),tiles:game.tiles,harbors:game.harbors,raider:game.raider},
  buildings:game.buildings,routes:game.routes,resources,bank:{...game.bank},fortunes,fortuneCount:game.fortuneDeck.length,guards:[...game.guards],longestLengths:[...game.longestLengths],longestHolder:game.longestHolder,guardHolder:game.guardHolder,
  scores:game.players.map((_,side)=>visibleScore(game,side)),privateScore:own?totalScore(game,viewer):null,pendingDiscards:[...game.pendingDiscards],trade:game.trade?{from:game.trade.from,give:game.trade.give,want:game.trade.want}:null,freeRoutes:active?game.freeRoutes:0,
  legalVertices,legalEdges,eligibleVictims:victims,can:active?{roll:game.phase==='roll',end:game.phase==='action'&&!game.freeRoutes&&!game.trade,route:game.phase==='action'&&canBuy(game,viewer,COSTS.route,playerRoutes(game,viewer).length<15),village:game.phase==='action'&&canBuy(game,viewer,COSTS.village,playerBuildings(game,viewer,'village').length<5),town:game.phase==='action'&&canBuy(game,viewer,COSTS.town,playerBuildings(game,viewer,'town').length<4),fortune:game.phase==='action'&&game.fortuneDeck.length>0&&canBuy(game,viewer,COSTS.fortune),trade:game.phase==='action'}:{},
  log:[...game.log],winner:game.winner,finished:game.finished};
}

export function forfeitCrossroads(game,playerId){if(game.finished)return;const side=sideOf(game,playerId);if(side<0)return;game.scores=game.players.map((_,index)=>totalScore(game,index));const candidates=game.players.map((id,index)=>({id,index,score:game.scores[index]})).filter(item=>item.index!==side).sort((a,b)=>b.score-a.score);game.winner=candidates[0]?.id||null;game.finished=true;game.phase='finished';game.forfeit=playerId;game.resultRecorded=false;log(game,`Player ${side+1} left the game.`)}

export const crossroadsGeometry=BOARD;
