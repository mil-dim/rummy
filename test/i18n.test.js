import test from 'node:test';
import assert from 'node:assert/strict';
import { translateControl, translateText } from '../public/i18n.js';

test('Bulgarian button captions include Rummy, Backgammon and dialog actions',()=>{
  for(const [english,bg] of [['Start match','Започни мач'],['Draw stock','Тегли от тестето'],['Take card','Вземи картата'],['Add selected','Долепи избраните карти'],['Roll','Хвърли заровете'],['Undo last move','Върни последния ход'],['Cancel','Отказ']]){
    assert.equal(translateControl(english,'bg'),bg);
    assert.equal(translateControl(english,'en'),english);
  }
});
test('control translation preserves whitespace and exact joker declarations',()=>{
  assert.equal(translateControl(' Draw stock ','bg'),' Тегли от тестето ');
  assert.equal(translateControl('Replace J♠','bg'),'Замени J♠');
  assert.equal(translateControl('English','bg'),'English');
  assert.equal(translateControl('10','bg'),'10');
});

test('lobby and room translations preserve numeric state and identifiers',()=>{
 for(const [en,bg] of [
 ['Game 3 of 6 · Your turn','Партия 3 от 6 · Ваш ред'],
 ['Game 6 of 6 finished','Партия 6 от 6 приключи'],
 ['2/4 players · ABC123','2/4 играчи · ABC123'],
 ['ROOM ABC123 · rummy','СТАЯ ABC123 · реми'],
 ['ROOM ABC123 · Bulgarian Rummy (Joker)','СТАЯ ABC123 · Българско реми (Жокер)'],
 ['Roll history — last 12 rolls','История — последни 12 хвърляния'],
 ['Point 24, 5 checkers','Позиция 24, 5 пула'],
 ['Waiting for the host to start…','Изчаква се домакинът да започне…'],
 ["'s turn",' е на ред'],
 ['  Your hand  ','  Вашите карти  ']
 ]){
  assert.equal(translateText(en,'bg'),bg);
  assert.equal(translateText(en,'en'),en);
 }
 assert.equal(translateText('J♠','bg'),'J♠');
});

test('Backgammon formats and concession confirmations have Bulgarian labels',()=>{
 for(const [english,bg] of [['Gulbara','Гюлбара'],['Tapa','Тапа'],['Number of rounds','Брой кръгове'],['Number of games','Брой партии'],['Normal Backgammon only','Само обикновена табла'],['Offer to concede this game for 1 point?','Да предложите ли предаване на тази партия за 1 точка?']])assert.equal(translateText(english,'bg'),bg);
 assert.equal(translateControl('Concede Mars — 2 points','bg'),'Предай се с марс — 2 точки');
 assert.equal(translateText('Gulbara · Round 2 of 3 · Game 5 of 9','bg'),'Гюлбара · Кръг 2 от 3 · Партия 5 от 9');
});

test('watcher controls and read-only notice translate into Bulgarian',()=>{
 assert.equal(translateControl('Watch','bg'),'Гледай');
 assert.equal(translateControl('Stop watching','bg'),'Спри наблюдението');
 assert.equal(translateText('Watchers','bg'),'Наблюдатели');
 assert.equal(translateText('Cards remaining','bg'),'Останали карти');
});

test('optional account and rating labels have Bulgarian translations',()=>{
 for(const [english,bg] of [['Ratings','Рейтинг'],['Sign in with Google','Вход с Google'],['Rated match','Мач с рейтинг'],['Number of games','Брой партии']])assert.equal(translateText(english,'bg'),bg);
 assert.equal(translateControl('Disconnect Google','bg'),'Изключи Google');
});

test('Santase and Blato controls and room labels translate',()=>{
 for(const [english,bg] of [['Play card','Играй картата'],['Claim 66','Обяви 66'],['Pass','Пас']])assert.equal(translateControl(english,'bg'),bg);
 for(const [english,bg] of [['Santase (66)','Сантасе (66)'],['Blato (3-5-8)','Блато (3-5-8)'],['ROOM SIXTY66 · santase','СТАЯ SIXTY66 · сантасе'],['Deal 3 of 9','Раздаване 3 от 9']])assert.equal(translateText(english,'bg'),bg);
});

test('feedback form and delivery messages translate',()=>{
 assert.equal(translateControl('Feedback','bg'),'Мнение');
 assert.equal(translateControl('Send feedback','bg'),'Изпрати мнението');
 assert.equal(translateText('Rules recommendation','bg'),'Препоръка за правилата');
 assert.equal(translateText('Thank you. Your feedback was saved.','bg'),'Благодарим. Мнението ви беше запазено.');
 assert.equal(translateText('Daily feedback limit reached. Please try again tomorrow.','bg'),'Достигнахте дневния лимит. Опитайте отново утре.');
});

