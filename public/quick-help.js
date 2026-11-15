const spanishHelp=[
 {title:'💡 Cómo empezar',html:'<p>Elige un nombre y entra en la sala. Son juegos multijugador: únete a una mesa o crea una e invita a un amigo o a un bot 🤖. No necesitas una cuenta.</p><small>Toca el título para ocultar o volver a mostrar estos consejos.</small>'},
 {title:'💡 Busca compañero o invita a un bot',html:'<p>1. Únete a una mesa abierta o elige Nueva mesa y un juego.</p><p>2. Tras crearla, usa Volver a la sala → Personas → Invitar junto a un amigo o un bot 🤖 libre. Los bots aceptan automáticamente.</p><p>3. Vuelve con Volver a la partida. Cuando todos ocupen su asiento, el anfitrión pulsa Empezar partida. Santase y Backgammon son para 2; Blato para 3; Rummy para 2–6; Encrucijadas para 3–4 personas y sin bots.</p><p>La invitación queda visible para más tarde. Observar permite mirar sin ocupar un asiento.</p><small>Toca el título para ocultar o volver a mostrar estos consejos.</small>'},
 {title:'💡 En tu mesa: ¿qué sigue?',html:'<p>¿Esperas a alguien? Usa Volver a la sala → Personas → Invitar y luego Volver a la partida. El anfitrión empieza cuando todos están sentados.</p><p>Volver a la sala conserva tu asiento. Abandonar partida deja la mesa definitivamente y cuenta como abandono si la partida está activa.</p><p>Durante el juego: Rummy — roba, baja o añade y descarta. Santase/Blato — toca una carta legal. Backgammon — tira y arrastra una ficha. Las reglas completas están en Reglas.</p><small>Toca el título para ocultar o volver a mostrar estos consejos.</small>'}
];
document.querySelectorAll('.quick-help').forEach((help,index)=>{
 if(help.querySelector('[data-help-lang="es"]')||!spanishHelp[index])return;
 const summary=document.createElement('span');summary.dataset.helpLang='es';summary.hidden=true;summary.textContent=spanishHelp[index].title;help.querySelector('summary')?.append(summary);
 const body=document.createElement('div');body.dataset.helpLang='es';body.hidden=true;body.innerHTML=spanishHelp[index].html;help.append(body);
});

function updateQuickHelpLanguage() {
 const language = ['en','bg','es'].includes(document.querySelector('#uiLanguage')?.value)?document.querySelector('#uiLanguage').value:'en';
 for (const help of document.querySelectorAll('.quick-help')) {
   for (const element of help.querySelectorAll('[data-help-lang]'))
     element.hidden = element.dataset.helpLang !== language;
   if(language==='es'&&!help.querySelector('[data-help-lang="es"]')){
     for(const element of help.querySelectorAll('[data-help-lang="en"]'))element.hidden=false;
   }
 }
}
document.querySelector("#uiLanguage")?.addEventListener("change", updateQuickHelpLanguage);
queueMicrotask(updateQuickHelpLanguage);
