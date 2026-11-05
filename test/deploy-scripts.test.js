import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,chmodSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const deployScript=resolve('scripts/deploy-safe.sh');
const announceScript=resolve('scripts/announce-restart.sh');

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'tabletop-deploy-'));
 const source=join(root,'git','rummy');
 const target=join(root,'rummy','qa');
 const bin=join(root,'bin');
 mkdirSync(join(source,'.git'),{recursive:true});
 mkdirSync(join(source,'scripts'),{recursive:true});
 mkdirSync(join(source,'data'),{recursive:true});
 mkdirSync(join(source,'upload'),{recursive:true});
 mkdirSync(join(target,'data'),{recursive:true});
 mkdirSync(join(target,'upload'),{recursive:true});
 mkdirSync(bin,{recursive:true});
 writeFileSync(join(source,'compose.yaml'),'services: {}\n');
 writeFileSync(join(source,'package.json'),'{}\n');
 writeFileSync(join(source,'.env'),'SOURCE=must-not-copy\n');
 writeFileSync(join(source,'app.txt'),'new\n');
 writeFileSync(join(source,'data','source.txt'),'excluded\n');
 writeFileSync(join(source,'upload','source.txt'),'excluded\n');
 cpSync(deployScript,join(source,'scripts','deploy-safe.sh'));
 cpSync(announceScript,join(source,'scripts','announce-restart.sh'));
 writeFileSync(join(target,'compose.yaml'),'services: old\n');
 writeFileSync(join(target,'.env'),'KEEP=yes\n');
 writeFileSync(join(target,'stale.txt'),'delete me\n');
 writeFileSync(join(target,'data','keep.txt'),'keep\n');
 writeFileSync(join(target,'upload','keep.txt'),'keep\n');
 const docker=join(bin,'docker');
 writeFileSync(docker,"#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$DOCKER_LOG\"\nif [ \"${FAIL_READY:-0}\" = 1 ] && [ \"$*\" = 'compose exec -T tabletop node scripts/admin.mjs ready' ]; then exit 9; fi\n");
 chmodSync(docker,0o755);
 return {root,source,target,bin,log:join(root,'docker.log')};
}

function run(script,args,fx,extra={}){
 return spawnSync('sh',[script,...args],{cwd:fx.target,encoding:'utf8',env:{...process.env,...extra,PATH:`${fx.bin}:${process.env.PATH}`,DOCKER_LOG:fx.log}});
}

test('safe deploy syncs the checkout, preserves environment data, and gates recreation',()=>{
 const fx=fixture();
 try{
  const result=run(deployScript,['--source',fx.source],fx);
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.equal(readFileSync(join(fx.target,'.env'),'utf8'),'KEEP=yes\n');
  assert.equal(readFileSync(join(fx.target,'app.txt'),'utf8'),'new\n');
  assert.equal(existsSync(join(fx.target,'stale.txt')),false);
  assert.equal(existsSync(join(fx.target,'data','keep.txt')),true);
  assert.equal(existsSync(join(fx.target,'upload','keep.txt')),true);
  assert.equal(existsSync(join(fx.target,'data','source.txt')),false);
  assert.deepEqual(readFileSync(fx.log,'utf8').trim().split('\n'),[
   'compose build',
   'compose exec -T tabletop node scripts/admin.mjs ready',
   'compose up -d --no-build',
   'compose ps'
  ]);
 }finally{rmSync(fx.root,{recursive:true,force:true})}
});

test('safe deploy stops before recreation when readiness fails',()=>{
 const fx=fixture();
 try{
  const result=run(deployScript,['--source',fx.source],fx,{FAIL_READY:'1'});
  assert.equal(result.status,9);
  assert.deepEqual(readFileSync(fx.log,'utf8').trim().split('\n'),[
   'compose build',
   'compose exec -T tabletop node scripts/admin.mjs ready'
  ]);
 }finally{rmSync(fx.root,{recursive:true,force:true})}
});

test('force deploy bypasses only readiness and prints a destructive warning',()=>{
 const fx=fixture();
 try{
  const result=run(deployScript,['--source',fx.source,'--force'],fx,{FAIL_READY:'1'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stderr,/permanently loses all in-memory games/);
  const log=readFileSync(fx.log,'utf8');
  assert.doesNotMatch(log,/admin\.mjs ready/);
  assert.match(log,/compose up -d --no-build/);
 }finally{rmSync(fx.root,{recursive:true,force:true})}
});

test('restart announcement wrapper supplies defaults and custom text',()=>{
 const fx=fixture();
 try{
  let result=run(announceScript,[],fx);
  assert.equal(result.status,0,result.stderr||result.stdout);
  result=run(announceScript,['7','Dinner','then','restart'],fx);
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.deepEqual(readFileSync(fx.log,'utf8').trim().split('\n'),[
   'compose exec -T tabletop node scripts/admin.mjs announce 10 Server update planned',
   'compose exec -T tabletop node scripts/admin.mjs announce 7 Dinner then restart'
  ]);
 }finally{rmSync(fx.root,{recursive:true,force:true})}
});
