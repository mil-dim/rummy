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

test('three-variant rounds and concession confirmations have Bulgarian labels',()=>{
 for(const [english,bg] of [['Gulbara','Гюлбара'],['Tapa','Тапа'],['Number of rounds','Брой кръгове'],['Offer to concede this game for 1 point?','Да предложите ли предаване на тази партия за 1 точка?']])assert.equal(translateText(english,'bg'),bg);
 assert.equal(translateControl('Concede Mars — 2 points','bg'),'Предай се с марс — 2 точки');
 assert.equal(translateText('Gulbara · Round 2 of 3 · Game 5 of 9','bg'),'Гюлбара · Кръг 2 от 3 · Партия 5 от 9');
});

test('watcher controls and read-only notice translate into Bulgarian',()=>{
 assert.equal(translateControl('Watch','bg'),'Гледай');
 assert.equal(translateControl('Stop watching','bg'),'Спри наблюдението');
 assert.equal(translateText('Watchers','bg'),'Наблюдатели');
 assert.equal(translateText('Cards remaining','bg'),'Останали карти');
});
