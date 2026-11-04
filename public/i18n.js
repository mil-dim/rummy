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
