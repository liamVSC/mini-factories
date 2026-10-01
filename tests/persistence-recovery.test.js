import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../src/state.js';
import {saveRecoveredState,loadRecoveredState,SAVE_KEY,BACKUP_KEY,RECOVERY_KEY} from '../src/persistence/recovery.js';

function storage(){
  const data=new Map();
  return{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}

test('recovery save can be loaded from a valid primary snapshot',()=>{
  const store=storage(),s=freshState();s.buildings=[];s.roads=[];s.cash=1234;
  assert.equal(saveRecoveredState(s,store,100),true);
  const loaded=loadRecoveredState(store);
  assert.equal(loaded.cash,1234);
  assert.ok(store.getItem(SAVE_KEY));
  assert.equal(store.getItem(RECOVERY_KEY),null);
});

test('corrupt primary falls back to the last valid backup',()=>{
  const store=storage(),s=freshState();s.buildings=[];s.roads=[];s.cash=800;
  saveRecoveredState(s,store,100);
  s.cash=1200;
  saveRecoveredState(s,store,200);
  store.setItem(SAVE_KEY,'{not valid json');
  const loaded=loadRecoveredState(store);
  assert.equal(loaded.cash,800);
  assert.ok(store.getItem(BACKUP_KEY));
});

test('incomplete recovery snapshot is ignored',()=>{
  const store=storage(),s=freshState();s.buildings=[];s.roads=[];
  store.setItem(RECOVERY_KEY,JSON.stringify({schema:1,savedAt:999,state:{version:6,buildings:[],roads:null}}));
  assert.equal(loadRecoveredState(store),null);
});
