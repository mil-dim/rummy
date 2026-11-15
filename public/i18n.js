// Keep button translation separate from game state and from user-entered names.
const bg = {
  'Rules / Правила': 'Правила',
  'Feedback':'Мнение', 'Send feedback':'Изпрати мнението',
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
  'Watch':'Гледай', 'Resume watching':'Продължи наблюдението', 'Stop watching':'Спри наблюдението', 'Later':'По-късно',
  'Change name':'Промени името', 'Sign out':'Изход', 'Save name':'Запази името', 'Disconnect Google':'Изключи Google',
  'Invite':'Покани', 'Accept':'Приеми',
  'Roll': 'Хвърли заровете',
  'Roll to start': 'Хвърли за начало'
  ,'Play card':'Играй картата','Claim 66':'Обяви 66','Close talon':'Затвори талона','Exchange trump 9':'Смени козовата деветка',
  'Give selected card':'Дай избраната карта','Return selected four cards':'Върни избраните четири карти','No trump':'Без коз','Pass':'Пас',
  'Roll dice':'Хвърли заровете','Buy Progress card':'Купи карта за развитие','Play':'Изиграй','End turn':'Край на хода','Return materials':'Върни материалите','Trade':'Размени','Offer trade':'Предложи размяна','Accept trade':'Приеми размяната','Cancel trade':'Отмени размяната'
};

const esControls={
 'Rules / Правила':'Reglas','Feedback':'Opinión','Send feedback':'Enviar opinión','Enter the lobby':'Entrar en la sala','New room':'Nueva mesa','Join table':'Unirse','In progress':'En curso','Resume game':'Volver a la partida','Leave game':'Abandonar partida','Back to lobby':'Volver a la sala','Start game':'Empezar partida','Start match':'Empezar encuentro','Next game':'Siguiente partida','New match':'Nuevo encuentro','Cancel':'Cancelar','Create':'Crear','Close':'Cerrar','Reload updated game':'Cargar la versión nueva',
 'Draw stock':'Robar del mazo','Take card':'Tomar carta','Undo last action':'Deshacer última acción','Undo last move':'Deshacer último movimiento','Stage selected meld':'Preparar combinación','Lay all melds':'Bajar combinaciones','Discard selected':'Descartar seleccionada','Add selected':'Añadir seleccionadas','Arrange cards':'Ordenar cartas','Done arranging':'Terminar orden','Remove':'Quitar',
 'Concede 1 point':'Rendirse por 1 punto','Concede Mars — 2 points':'Rendirse con Mars — 2 puntos','Accept concession':'Aceptar rendición','Decline':'Rechazar','Cancel offer':'Cancelar oferta','Watch':'Observar','Resume watching':'Seguir observando','Stop watching':'Dejar de observar','Later':'Más tarde','Change name':'Cambiar nombre','Sign out':'Salir','Save name':'Guardar nombre','Disconnect Google':'Desconectar Google','Invite':'Invitar','Accept':'Aceptar',
 'Roll':'Tirar','Roll to start':'Tirar para empezar','Play card':'Jugar carta','Claim 66':'Declarar 66','Close talon':'Cerrar talón','Exchange trump 9':'Cambiar el 9 de triunfo','Give selected card':'Dar carta seleccionada','Return selected four cards':'Devolver cuatro cartas','No trump':'Sin triunfo','Pass':'Pasar','Roll dice':'Tirar los dados','Buy Progress card':'Comprar carta de progreso','Play':'Jugar','End turn':'Terminar turno','Return materials':'Devolver materiales','Trade':'Cambiar','Offer trade':'Proponer intercambio','Accept trade':'Aceptar intercambio','Cancel trade':'Cancelar intercambio'
};

export function translateControl(text, language) {
  if (!['bg','es'].includes(language)) return text;
  const trimmed = text.trim();
  const controls=language==='bg'?bg:esControls;
  let translated = controls[trimmed];
  if (translated === undefined && trimmed.startsWith('Replace '))
    translated = (language==='bg'?'Замени ':'Sustituir ') + trimmed.slice('Replace '.length);
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
 'Rules and feedback':'Правила и мнения',
 'Send a rules recommendation, feature idea, or opinion to the operator.':'Изпратете препоръка за правилата, идея за функция или мнение до оператора.',
 'Type':'Вид', 'Rules recommendation':'Препоръка за правилата', 'Feature recommendation':'Препоръка за функция', 'General opinion':'Общо мнение',
 'Your message':'Вашето съобщение', 'Please describe your suggestion…':'Опишете предложението си…',
 'At most one message every 10 minutes and three per day. Do not include passwords or private information.':'Най-много едно съобщение на 10 минути и три на ден. Не включвайте пароли или лична информация.',
 'Thank you. Your feedback was saved.':'Благодарим. Мнението ви беше запазено.',
 'Feedback is temporarily unavailable.':'Формата за мнения временно не е достъпна.',
 'Enter the lobby before sending feedback.':'Влезте в лобито, преди да изпратите мнение.',
 'Choose a feedback type.':'Изберете вид на мнението.',
 'Please write at least 20 characters.':'Напишете поне 20 знака.',
 'Feedback is limited to 2000 characters.':'Мнението е ограничено до 2000 знака.',
 'Please wait before sending more feedback.':'Изчакайте, преди да изпратите ново мнение.',
 'Daily feedback limit reached. Please try again tomorrow.':'Достигнахте дневния лимит. Опитайте отново утре.',
 'Too many submissions from this network. Please try again tomorrow.':'Твърде много съобщения от тази мрежа. Опитайте отново утре.',
 'Feedback could not be saved. Please try again later.':'Мнението не беше запазено. Опитайте отново по-късно.',

 'People':'Хора', 'No one here yet.':'Все още няма никого.', 'In lobby':'В лобито', 'Playing':'Играе', 'Watching':'Наблюдава', 'Disconnected':'Временно изключен', 'At table':'На маса',
 'Ratings':'Рейтинг', 'Rating':'Рейтинг', 'Games':'Партии', 'Sign in with Google':'Вход с Google', 'Rated':'С рейтинг', 'Approval pending':'Изчаква одобрение',
 'Rated match':'Мач с рейтинг', 'Sign-in is optional. Only approved signed players can choose rated matches.':'Входът не е задължителен. Само одобрени влезли играчи могат да изберат мач с рейтинг.',
 'Optional: results will update the public rating.':'По желание: резултатите ще променят публичния рейтинг.',
 'Rated play requires every player to sign in and receive approval.':'За мач с рейтинг всеки играч трябва да влезе и да бъде одобрен.',
 'No rated matches yet.':'Все още няма мачове с рейтинг.', 'Ratings are temporarily unavailable.':'Рейтингът временно не е достъпен.',
 'Rummy':'Реми', 'Backgammon rotation':'Редувана табла', 'Santase (66)':'Сантасе (66)', 'Blato (3-5-8)':'Блато (3-5-8)', 'Crossroads of Thrace':'Тракийски кръстопътища',
 'Game invitation':'Покана за игра', 'invited you to':'ви покани на', 'Invitation sent.':'Поканата е изпратена.', 'Current game':'Текуща игра',
 'You are at another table. You can use this invitation after you leave it.':'Вече сте на друга маса. Можете да използвате поканата, след като я напуснете.',
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
 'Match format':'Формат на мача', 'Normal Backgammon only':'Само обикновена табла', 'Rotate: Normal → Gulbara → Tapa':'Редуване: Обикновена → Гюлбара → Тапа',
 'Number of games':'Брой партии', 'Number of rounds':'Брой кръгове',
 'One round: Normal Backgammon → Gulbara → Tapa.':'Един кръг: Обикновена табла → Гюлбара → Тапа.',
 'Every game uses Normal Backgammon.':'Всяка партия е обикновена табла.',
 'offers to concede':'предлага да се предаде за', 'point(s).':'точки.',
 'Offer to concede this game for 1 point?':'Да предложите ли предаване на тази партия за 1 точка?',
 'Offer to concede this game for 2 points (Mars)?':'Да предложите ли предаване на тази партия за 2 точки (марс)?',
 'Pinned checker':'Затиснат пул',
 'Ascending doubles':'Възходящи чифтове', 'Inherited doubles':'Преотстъпени ходове от чифт', 'Original roller':'Хвърлил чифтовете',
 'Normal backgammon: hit checkers must re-enter from the center bar first.':'Обикновена табла: ударените пулове трябва първо да влязат от средната преграда.',
 'Your starting point is 24; bear off beyond point 1. Drag a checker, or choose a die then a highlighted point.':'Вашата начална позиция е 24; изваждате след позиция 1. Плъзнете пул или изберете зар, после осветена позиция.',
 'Gulbara: both colors move in the same direction. One opposing checker blocks a point. After your first two rolls, doubles continue upwards to six; unused moves transfer once only if you started the sequence.':'Гюлбара: двата цвята се движат в една посока. Един противников пул затваря позицията. След първите ви две хвърляния чифтовете се изиграват възходящо до шест; неизиграните ходове се преотстъпват само веднъж и само ако сте започнали поредицата.',
 'Tapa: landing on a lone opposing checker pins it until released. Pinning the last checker on its starting point wins Mars immediately.':'Тапа: самотен противников пул се затиска до освобождаването му. Затискането на последния пул на началната му позиция веднага печели марс.',
 'Respond to the concession offer before continuing play.':'Отговорете на предложението за предаване, преди да продължите.',

 'match points.':'точки.', 'BACKGAMMON':'ТАБЛА',
 'Connected':'Свързан', 'Connecting…':'Свързване…', 'Reconnecting…':'Повторно свързване…',
 'A PRIVATE GAME TABLE':'ЧАСТНА МАСА ЗА ИГРА', 'Cards, dice,':'Карти, зарове,', 'good company.':'добра компания.',
 'Rummy and Backgammon for friends, wherever they are.':'Реми и табла за приятели, където и да са.',
 'Bulgarian card games and Backgammon for friends, wherever they are.':'Български игри с карти и табла за приятели, където и да са.',
 'Your name':'Вашето име', 'GAME LOBBY':'ЛОБИ', 'Choose your table':'Изберете маса',
 'Your seat is reserved. Leave before joining another table.':'Мястото ви е запазено. Напуснете, преди да се присъедините към друга маса.',
 'No open rooms yet.':'Все още няма отворени стаи.', 'Open a table':'Отворете маса',
 'Rummy':'Реми', 'Rummy (Joker)':'Реми (Жокер)', 'Backgammon':'Табла', 'rummy':'реми', 'backgammon':'табла', 'santase':'сантасе', 'blato':'блато', 'crossroads':'тракийски кръстопътища',
 'Players':'Играчи', 'Player':'Играч', 'Rummy match':'Мач по реми', 'Backgammon match':'Мач по табла',
 'Sprint cycles':'Спринтови цикли', 'Number of games':'Брой партии',
 'With N players, every N+1 game is a double-points sprint.':'При N играчи всяка (N+1)-ва партия е спринт с двойни точки.',
 'Win: 1 point. Mars (opponent has borne off none): 2 points.':'Победа: 1 точка. Марс (противникът няма извадени пулове): 2 точки.',
 'Waiting for the host to start…':'Изчаква се домакинът да започне…', 'Your hand':'Вашите карти',
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

const esLabels={
 ...esControls,
 'Leave this table and sign out?':'¿Abandonar esta mesa y salir?','Maintenance in progress. Try again after the update.':'Mantenimiento en curso. Inténtalo después de la actualización.',
 'Rules and feedback':'Reglas y opiniones','Send a rules recommendation, feature idea, or opinion to the operator.':'Envía una recomendación sobre las reglas, una idea o una opinión.','Type':'Tipo','Rules recommendation':'Recomendación de reglas','Feature recommendation':'Idea para una función','General opinion':'Opinión general','Your message':'Tu mensaje','Please describe your suggestion…':'Describe tu sugerencia…','At most one message every 10 minutes and three per day. Do not include passwords or private information.':'Como máximo un mensaje cada 10 minutos y tres al día. No incluyas contraseñas ni información privada.','Thank you. Your feedback was saved.':'Gracias. Tu opinión se ha guardado.','Please wait before sending more feedback.':'Espera antes de enviar otra opinión.','Feedback could not be saved. Please try again later.':'No se pudo guardar. Inténtalo más tarde.',
 'People':'Personas','No one here yet.':'Todavía no hay nadie.','In lobby':'En la sala','Playing':'Jugando','Watching':'Observando','Disconnected':'Desconectado','At table':'En una mesa','Ratings':'Clasificación','Rating':'Puntuación','Games':'Partidas','Sign in with Google':'Entrar con Google','Rated':'Clasificada','Approval pending':'Aprobación pendiente','Rated match':'Encuentro clasificado','Sign-in is optional. Only approved signed players can choose rated matches.':'Iniciar sesión es opcional. Solo los jugadores aprobados pueden elegir encuentros clasificados.','No rated matches yet.':'Todavía no hay encuentros clasificados.','Ratings are temporarily unavailable.':'La clasificación no está disponible temporalmente.',
 'Rummy':'Rummy','Rummy (Joker)':'Rummy (Joker)','Backgammon rotation':'Rotación de backgammon','Backgammon':'Backgammon','Santase (66)':'Santase (66)','Blato (3-5-8)':'Blato (3-5-8)','Crossroads of Thrace':'Encrucijadas de Tracia','rummy':'rummy','backgammon':'backgammon','santase':'santase','blato':'blato','crossroads':'encrucijadas de Tracia',
 'Game invitation':'Invitación a una partida','invited you to':'te ha invitado a','Invitation sent.':'Invitación enviada.','Current game':'Partida actual','You are at another table. You can use this invitation after you leave it.':'Estás en otra mesa. Podrás usar esta invitación después de abandonarla.','Planned restart in':'Reinicio previsto en','Maintenance is due. Waiting for the operator.':'Es hora del mantenimiento. Esperando al operador.','Current games may continue. No automatic restart.':'Las partidas actuales pueden continuar. No hay reinicio automático.',
 'Watchers':'Observadores','None':'Ninguno','Finished':'Terminada','Waiting for players':'Esperando jugadores','Stock cards':'Cartas en el mazo','Cards remaining':'Cartas restantes','Watching — you are not seated and cannot make moves.':'Estás observando; no ocupas asiento ni puedes jugar.','Hands are hidden while you watch.':'Las manos están ocultas mientras observas.','You':'Tú','Players':'Jugadores','Player':'Jugador','Waiting for the host to start…':'Esperando a que el anfitrión empiece…','Your hand':'Tu mano','Your turn':'Tu turno','Your move':'Tu movimiento','Waiting…':'Esperando…',
 'Normal backgammon':'Backgammon normal','Gulbara':'Gulbara','Tapa':'Tapa','Match format':'Formato del encuentro','Normal Backgammon only':'Solo backgammon normal','Rotate: Normal → Gulbara → Tapa':'Rotar: normal → Gulbara → Tapa','Number of games':'Número de partidas','Number of rounds':'Número de rondas','Every game uses Normal Backgammon.':'Todas las partidas usan backgammon normal.','Pinned checker':'Ficha inmovilizada','Ascending doubles':'Dobles ascendentes','Inherited doubles':'Dobles heredados','Original roller':'Jugador original','White':'Blancas','Red':'Rojas','Off board':'Fuera del tablero','Bar — hit checkers':'Barra: fichas capturadas','Borne-off checkers':'Fichas retiradas','Win':'Victoria','Win by concession':'Victoria por rendición','Win by forfeit':'Victoria por abandono','Mars — opponent bore off no checkers':'Mars: el rival no retiró fichas','Roll to decide who starts':'Tira para decidir quién empieza','Opening rolls':'Tiradas iniciales','Opening':'Inicio','Turn':'Turno','Turn completed':'Turno terminado','No legal moves remaining — turn passed':'No quedan movimientos legales; pasa el turno',
 'A PRIVATE GAME TABLE':'UNA MESA DE JUEGO PRIVADA','Cards, dice,':'Cartas, dados,','good company.':'buena compañía.','Bulgarian card games and Backgammon for friends, wherever they are.':'Juegos de cartas búlgaros y backgammon para amigos, estén donde estén.','Your name':'Tu nombre','GAME LOBBY':'SALA DE JUEGO','Choose your table':'Elige tu mesa','Your seat is reserved. Leave before joining another table.':'Tu asiento está reservado. Abandona antes de unirte a otra mesa.','No open rooms yet.':'Todavía no hay mesas abiertas.','Open a table':'Abrir una mesa','Rummy match':'Encuentro de rummy','Backgammon match':'Encuentro de backgammon','Santase match':'Encuentro de santase','Blato match':'Encuentro de blato','Card match':'Encuentro de cartas','Sprint cycles':'Ciclos sprint','First to 11 match points wins.':'Gana el primero en llegar a 11 puntos.','Nine deals rotate the 8, 5 and 3 targets.':'Nueve manos rotan los objetivos 8, 5 y 3.',
 'Trump card':'Carta de triunfo','Current trick':'Baza actual','Last trick':'Última baza','Talon':'Talón','Closed':'Cerrado','Choose contract':'Elegir contrato','Card exchange':'Intercambio de cartas','Take the talon and return four cards':'Toma el talón y devuelve cuatro cartas','Public talon':'Talón público','Deal complete':'Mano terminada','Deal result':'Resultado de la mano','Opening cut':'Corte inicial','Cut a card':'Cortar una carta','Trump':'Triunfo','Not announced':'Sin anunciar','Completed pulls':'Peticiones terminadas','Staged melds':'Combinaciones preparadas','Table melds':'Combinaciones en mesa','Discard':'Descarte','Empty':'Vacío','Cards':'Cartas','Raw':'Puntos de la mano','Change':'Cambio','Full hand':'Sin abrir','Winner receives':'El ganador recibe','Cumulative standings':'Clasificación acumulada','Final standings':'Clasificación final',
 'Timber':'Madera','Stone':'Piedra','Livestock':'Ganado','Grain':'Grano','Metal':'Metal','Your materials':'Tus materiales','Progress cards':'Cartas de progreso','Progress card':'Carta de progreso','Victory points':'Puntos de victoria','Guard — strengthens your guard':'Guardia: refuerza tu guardia','Two free trade routes':'Dos rutas comerciales gratis','Two materials of your choice':'Dos materiales a elegir','Material monopoly':'Monopolio de un material','Hidden victory point':'Punto de victoria oculto','Trade with a market':'Intercambiar con un mercado','Offer a player trade':'Proponer intercambio a un jugador','You give:':'Ofreces:','You want:':'Quieres:','Table history':'Historial de la mesa','You are watching. Materials and Progress cards remain private.':'Estás observando. Los materiales y las cartas de progreso siguen siendo privados.','Roll both dice to decide who places first':'Tira ambos dados para decidir quién coloca primero','Waiting for the opening rolls':'Esperando las tiradas iniciales','Place a starting village':'Coloca una aldea inicial','Place a trade route beside it':'Coloca una ruta comercial a su lado','Roll the dice':'Tira los dados','Move the raider':'Mueve al saqueador','Build, trade, or end your turn':'Construye, comercia o termina tu turno',
 'An update is available.':'Hay una actualización disponible.','🔊 Sound on':'🔊 Sonido activado','🔇 Muted':'🔇 Silenciado','Something went wrong.':'Algo salió mal.','Select at least three cards.':'Selecciona al menos tres cartas.','Select one card.':'Selecciona una carta.','Select cards from your hand.':'Selecciona cartas de tu mano.','Choose the card represented by the joker':'Elige la carta que representa el comodín'
};

export function translateText(text, language) {
 if(!['bg','es'].includes(language))return text;
 const value=text.trim();
 const dictionary=language==='bg'?labels:esLabels;
 let translated=dictionary[value];
 if(translated===undefined){
  translated=translateControl(value,language);
  translated=language==='bg'?translated
   .replace(/^Normal backgammon · /,'Обикновена табла · ')
   .replace(/^Gulbara · /,'Гюлбара · ')
   .replace(/^Tapa · /,'Тапа · ')
   .replace(/Round (\d+) of (\d+)/g,'Кръг $1 от $2')
   .replace(/^ROOM ([A-Za-z0-9]+) · (rummy|backgammon|santase|blato|crossroads)$/,(_,id,kind)=>`СТАЯ ${id} · ${labels[kind]}`)
   .replace(/^ROOM ([A-Za-z0-9]+) · (Rummy \(Joker\)|Backgammon|Santase \(66\)|Blato \(3-5-8\)|Crossroads of Thrace)$/,(_,id,kind)=>`СТАЯ ${id} · ${labels[kind]}`)
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
   .replace(/^Update available \(v(.+)\)\. Reload to use the latest game\.$/,'Налична е версия $1. Презаредете, за да използвате обновената игра.')
   :translated
   .replace(/^Normal backgammon · /,'Backgammon normal · ')
   .replace(/Round (\d+) of (\d+)/g,'Ronda $1 de $2')
   .replace(/^ROOM ([A-Za-z0-9]+) · (.+)$/,(_,id,kind)=>`MESA ${id} · ${esLabels[kind]||kind}`)
   .replace(/^(\d+)\/(\d+) players · (.+)$/,'$1/$2 jugadores · $3')
   .replace(/Game (\d+) of (\d+)/g,'Partida $1 de $2').replace(/Game (\d+)/g,'Partida $1')
   .replace(/Deal (\d+) of (\d+)/g,'Mano $1 de $2').replace(/Deal (\d+)/g,'Mano $1')
   .replace(/^Roll history — last (\d+) rolls$/,'Historial: últimas $1 tiradas')
   .replace(/^Point (\d+), (\d+) checkers$/,'Punto $1, $2 fichas')
   .replace(/^Die (\d+)(, used)?$/,(_,die,used)=>`Dado ${die}${used?', usado':''}`);
 }
 if(translated===undefined)translated=value;
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

