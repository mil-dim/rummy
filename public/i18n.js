// Keep button translation separate from game state and from user-entered names.
const bg = {
  'Rules / Правила': 'Правила',
  'Enter the lobby': 'Вход в лобито',
  'New room': 'Нова стая',
  'Join table': 'Присъедини се',
  'In progress': 'Играе се',
  'Resume game': 'Продължи играта',
  'Leave game': 'Напусни играта',
  'Back to lobby': 'Към лобито',
  'Start game': 'Започни игра',
  'Start match': 'Започни мач',
  'Next game': 'Следваща игра',
  'New match': 'Нов мач',
  'Cancel': 'Отказ',
  'Create': 'Създай',
  'Close': 'Затвори',
  'Reload updated game': 'Зареди обновената игра',
  'Draw stock': 'Тегли от тестето',
  'Take card': 'Вземи картата',
  'Undo last action': 'Върни последното действие',
  'Undo last move': 'Върни последния ход',
  'Stage selected meld': 'Подготви избраната комбинация',
  'Lay all melds': 'Свали всички комбинации',
  'Discard selected': 'Изхвърли избраната карта',
  'Add selected': 'Долепи избраните карти',
  'Arrange cards': 'Подреди картите',
  'Done arranging': 'Готово с подреждането',
  'Remove': 'Премахни',
  'Concede 1 point':'Предай се за 1 точка',
  'Concede Mars — 2 points':'Предай се с марс — 2 точки',
  'Accept concession':'Приеми предаването', 'Decline':'Откажи', 'Cancel offer':'Отмени предложението',
  'Watch':'Гледай', 'Resume watching':'Продължи наблюдението', 'Stop watching':'Спри наблюдението',
  'Change name':'Промени името', 'Sign out':'Изход', 'Save name':'Запази името',
  'Invite':'Покани', 'Accept':'Приеми',
  'Roll': 'Хвърли заровете',
  'Roll to start': 'Хвърли за начало'
};

export function translateControl(text, language) {
  if (language !== 'bg') return text;
  const trimmed = text.trim();
  let translated = bg[trimmed];
  if (translated === undefined && trimmed.startsWith('Replace '))
    translated = 'Замени ' + trimmed.slice('Replace '.length);
  if (translated === undefined) return text;
  return text.slice(0, text.length - text.trimStart().length) + translated
    + text.slice(text.trimEnd().length);
}

// Text-node updates preserve embedded counts, icons, listeners and selections.
const originals = new WeakMap();
export function translateButtons(root, language) {
  for (const button of root.querySelectorAll('button')) {
    if (button.matches('.playing-card,.die,.bg-point,.bar-zone,[data-rules-lang]')) continue;
    const walker = button.ownerDocument.createTreeWalker(button, 4); // SHOW_TEXT
    let node;
    while ((node = walker.nextNode())) {
      const saved = originals.get(node);
      const english = saved && node.nodeValue === saved.rendered ? saved.english : node.nodeValue;
      const rendered = translateControl(english, language);
      if (node.nodeValue !== rendered) node.nodeValue = rendered;
      originals.set(node, { english, rendered });
    }
    button.lang = language;
  }
}

// Only application text is translated. Names, card faces and rule articles are
// explicitly excluded by translateInterface; no game DOM is rebuilt.
const labels = {
 'Leave this table and sign out?':'Да напуснете ли тази маса и да излезете?',
 'Maintenance in progress. Try again after the update.':'Извършва се поддръжка. Опитайте след обновяването.',

 'People':'Хора', 'No one here yet.':'Все още няма никого.', 'In lobby':'В лобито', 'Playing':'Играе', 'Watching':'Наблюдава', 'Disconnected':'Временно изключен', 'At table':'На маса',
 'Game invitation':'Покана за игра', 'invited you to':'ви покани на', 'Invitation sent.':'Поканата е изпратена.', 'Current game':'Текуща игра',
 'Planned restart in':'Планирано рестартиране след', 'Maintenance is due. Waiting for the operator.':'Времето за поддръжка настъпи. Изчаква се операторът.',
 'Current games may continue. No automatic restart.':'Текущите игри могат да продължат. Няма автоматично рестартиране.',
 'Stop watching and sign out?':'Да спрете ли наблюдението и да излезете?',
 'Leave your table and sign out? An active game will be forfeited and the match will end after this hand.':'Да напуснете ли масата и да излезете? Текущата партия ще бъде служебна загуба, а мачът ще приключи след тази партия.',
 'Maintenance announced. New games are paused.':'Обявена е поддръжка. Новите игри са спрени.',

 'Watchers':'Наблюдатели', 'None':'Няма', 'Finished':'Приключила', 'Waiting for players':'Изчакват се играчи',
 'Stock cards':'Карти в тестето', 'Cards remaining':'Останали карти',
 'Watching — you are not seated and cannot make moves.':'Наблюдавате — нямате място като играч и не можете да правите ходове.',
 'Watching from White’s side. Moves are read-only.':'Наблюдавате от страната на белите. Не можете да правите ходове.',
 'You are watching a table. Stop watching before joining another.':'Наблюдавате маса. Спрете наблюдението, преди да се присъедините към друга.',
 'Stop watching before joining a table.':'Спрете наблюдението, преди да се присъедините като играч.',
 'Leave your current room before watching.':'Напуснете текущата си стая, преди да наблюдавате друга.',

 'Win by concession':'Победа след предаване',
 'Normal backgammon':'Обикновена табла', 'Gulbara':'Гюлбара', 'Tapa':'Тапа', 'You':'Вие',
 'Number of rounds':'Брой кръгове', 'One round: normal backgammon → Gulbara → Tapa.':'Един кръг: обикновена табла → Гюлбара → Тапа.',
 'offers to concede':'предлага да се предаде за', 'point(s).':'точки.',
 'Offer to concede this game for 1 point?':'Да предложите ли предаване на тази партия за 1 точка?',
 'Offer to concede this game for 2 points (Mars)?':'Да предложите ли предаване на тази партия за 2 точки (марс)?',
 'Pinned checker':'Затиснат пул',
 'Ascending doubles':'Възходящи чифтове', 'Inherited doubles':'Преотстъпени ходове от чифт', 'Original roller':'Хвърлил чифтовете',
 'Normal backgammon: hit checkers must re-enter from the center bar first.':'Обикновена табла: ударените пулове трябва първо да влязат от средната преграда.',
 'Your starting point is 24; bear off beyond point 1. Choose a die, then a highlighted point.':'Вашата начална позиция е 24; изваждате след позиция 1. Изберете зар, после осветена позиция.',
 'Gulbara: both colors move in the same direction. One opposing checker blocks a point. After your first three rolls, doubles continue upwards to six; unused moves transfer once only if you started the sequence.':'Гюлбара: двата цвята се движат в една посока. Един противников пул затваря позицията. След първите ви три хвърляния чифтовете се изиграват възходящо до шест; неизиграните ходове се преотстъпват само веднъж и само ако сте започнали поредицата.',
 'Tapa: landing on a lone opposing checker pins it until released. Pinning the last checker on its starting point wins Mars immediately.':'Тапа: самотен противников пул се затиска до освобождаването му. Затискането на последния пул на началната му позиция веднага печели марс.',
 'Respond to the concession offer before continuing play.':'Отговорете на предложението за предаване, преди да продължите.',

 'match points.':'точки.', 'BACKGAMMON':'ТАБЛА',
 'Connected':'Свързан', 'Connecting…':'Свързване…', 'Reconnecting…':'Повторно свързване…',
 'A PRIVATE GAME TABLE':'ЧАСТНА МАСА ЗА ИГРА', 'Cards, dice,':'Карти, зарове,', 'good company.':'добра компания.',
 'Bulgarian Rummy and Backgammon for friends on your LAN or across the internet.':'Българско реми и табла за приятели в локалната мрежа или по интернет.',
 'Your name':'Вашето име', 'GAME LOBBY':'ЛОБИ', 'Choose your table':'Изберете маса',
 'Your seat is reserved. Leave before joining another table.':'Мястото ви е запазено. Напуснете, преди да се присъедините към друга маса.',
 'No open rooms yet.':'Все още няма отворени стаи.', 'Open a table':'Отворете маса',
 'Bulgarian Rummy':'Българско реми', 'Bulgarian Rummy (Joker)':'Българско реми (Жокер)', 'Backgammon':'Табла', 'rummy':'реми', 'backgammon':'табла',
 'Players':'Играчи', 'Player':'Играч', 'Rummy match':'Мач по реми', 'Backgammon match':'Мач по табла',
 'Sprint cycles':'Спринтови цикли', 'Number of games':'Брой партии',
 'With N players, every N+1 game is a double-points sprint.':'При N играчи всяка (N+1)-ва партия е спринт с двойни точки.',
 'Win: 1 point. Mars (opponent has borne off none): 2 points.':'Победа: 1 точка. Марс (противникът няма извадени пулове): 2 точки.',
 'Waiting for the host to start…':'Изчаква се домакинът да започне…', 'Your hand':'Вашите карти',
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
 'Leave permanently and forfeit this game? In Rummy, the remaining players finish this hand, then start a new match.':'Да напуснете ли окончателно със служебна загуба? При реми останалите довършват партията, след което започват нов мач.',
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
   .replace(/^ROOM ([A-Za-z0-9]+) · (rummy|backgammon)$/,(_,id,kind)=>`СТАЯ ${id} · ${labels[kind]}`)
   .replace(/^ROOM ([A-Za-z0-9]+) · (Bulgarian Rummy \(Joker\)|Backgammon)$/,(_,id,kind)=>`СТАЯ ${id} · ${labels[kind]}`)
   .replace(/^(\d+)\/(\d+) players · (.+)$/, '$1/$2 играчи · $3')
   .replace(/Game (\d+) of (\d+)/g,'Партия $1 от $2')
   .replace(/Game (\d+)/g,'Партия $1')
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

