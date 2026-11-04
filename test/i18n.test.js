import test from 'node:test';
import assert from 'node:assert/strict';
import { translateControl } from '../public/i18n.js';

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
