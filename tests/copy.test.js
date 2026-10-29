const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const source=fs.readFileSync('background.js','utf8');
const offscreen=fs.readFileSync('offscreen.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(o={}) {
  const c={create:0,inject:0,messages:[],badges:[],titles:[],writes:0,removed:0,errors:[],menus:[]},listeners={},timers=[];
  let exists=!!o.exists,off;
  const chrome={
    runtime:{
      getManifest:()=>JSON.parse(fs.readFileSync('manifest.json')),
      getURL:p=>'chrome-extension://test/'+p,
      getContexts:async f=>{assert.equal(f.contextTypes[0],'OFFSCREEN_DOCUMENT');assert.match(f.documentUrls[0],/offscreen.html$/);return exists?[{}]:[];},
      onInstalled:{addListener:f=>listeners.install=f},onMessage:{addListener:f=>listeners.message=f},
      sendMessage:async m=>{
        if(m.target==='background')return new Promise(r=>listeners.message(m,{},r));
        c.messages.push(m);
        if(o.message)return o.message(m);
        return new Promise(r=>off(m,{},r));
      }
    },
    action:{onClicked:{addListener:f=>listeners.click=f},setBadgeText:async v=>c.badges.push(v.text),setBadgeBackgroundColor:async v=>c.color=v.color,setTitle:async v=>c.titles.push(v.title)},
    contextMenus:{onClicked:{addListener:f=>listeners.menu=f},removeAll:cb=>{c.menus.push('remove');cb();},create:v=>c.menus.push(v.id)},
    scripting:{executeScript:async a=>{c.inject++;return o.inject?o.inject(a):[{result:{text:'題名\nhttps://example.com/'}}];}},
    offscreen:{Reason:{CLIPBOARD:'CLIPBOARD'},createDocument:async a=>{c.create++;assert.equal(a.reasons[0],'CLIPBOARD');if(o.create)await o.create(c.create,()=>exists=true);exists=true;}}
  };
  const ctx=vm.createContext({chrome,URL,crypto:{randomUUID},console:{error:(...a)=>c.errors.push(a),warn(){}},setTimeout:f=>{timers.push(f);return f;},clearTimeout:f=>{const i=timers.indexOf(f);if(i>=0)timers.splice(i,1);}});
  vm.runInContext(source,ctx);
  vm.runInNewContext(offscreen,{chrome:{runtime:{onMessage:{addListener:f=>off=f},sendMessage:chrome.runtime.sendMessage}},document:{
    createElement:()=>({select(){},remove(){c.removed++;}}),body:{appendChild(){}},
    execCommand:()=>{if(o.exec)return o.exec();c.writes++;return true;}
  }});
  return {c,listeners,timers,run:(tab={id:1,url:'https://example.com/'},lang=null)=>ctx.executeCopy(tab,lang),off:(...a)=>off(...a)};
}
test('初回作成・コピー・成功表示・タイマー復元・3メニュー',async()=>{
  const h=setup();await h.run();assert.equal(h.c.create,1);assert.equal(h.c.writes,1);assert.deepEqual(h.c.badges,['C','OK']);assert.equal(h.c.color,'#137333');
  await h.timers.pop()();await tick();assert.equal(h.c.badges.at(-1),'C');
  h.listeners.install();assert.deepEqual(h.c.menus,['remove','copy-google-en','copy-google-ja','copy-standard']);
});
test('既存Offscreen・SW再起動相当のVM初期化後も再利用',async()=>{
  for(let i=0;i<2;i++){const h=setup({exists:true});await h.run();assert.equal(h.c.create,0);assert.equal(h.c.badges.at(-1),'OK');}
});
test('同時2要求は作成1回・作成完了前は送信しない',async()=>{
  const d=deferred(),h=setup({create:()=>d.promise});const a=h.run();await tick();const b=h.run();await tick();
  assert.equal(h.c.create,1);assert.equal(h.c.messages.length,0);d.resolve();await Promise.all([a,b]);assert.equal(h.c.messages.length,1);
});
test('作成失敗後に再試行成功',async()=>{
  const h=setup({create:n=>{if(n===1)throw Error('create failed');}});await h.run();assert.equal(h.c.badges.at(-1),'!');await h.run();assert.equal(h.c.create,2);assert.equal(h.c.badges.at(-1),'OK');
});
test('作成エラー後、既存ドキュメントを再確認して利用',async()=>{
  const h=setup({create:(n,exists)=>{exists();throw Error('already exists');}});await h.run();assert.equal(h.c.badges.at(-1),'OK');
});
test('遅い言語指定の旧要求は新要求後にコピー・表示しない',async()=>{
  const d=deferred();let n=0;const h=setup({inject:()=>++n===1?d.promise:[{result:{text:'new'}}]});
  const old=h.run(undefined,'en');await tick();await h.run();d.resolve([{result:{text:'old'}}]);await old;
  assert.deepEqual(h.c.messages.map(m=>m.text),['new']);assert.equal(h.c.badges.at(-1),'OK');
});
test('Offscreenでも古い配送要求を破棄・対象外メッセージは無応答',async()=>{
  const h=setup();await h.run();const old=h.c.messages[0];await h.run();
  const response=await new Promise(r=>h.off(old,{},r));assert.equal(response.discarded,true);assert.equal(h.c.writes,2);
  let responded=false;assert.equal(h.off({target:'other',type:'copy-data'},{},()=>responded=true),undefined);assert.equal(responded,false);
});
for(const mode of ['false','throw'])test('execCommand '+mode+' は失敗応答・削除・次回成功',async()=>{
  let fail=true;const h=setup({exec:()=>{if(fail){if(mode==='throw')throw Error('denied');return false;}return true;}});
  await h.run();assert.equal(h.c.removed,1);assert.equal(h.c.badges.at(-1),'!');assert.ok(!h.c.badges.includes('OK'));assert.match(h.c.titles.at(-1),/コピー失敗/);
  fail=false;await h.run();assert.equal(h.c.badges.at(-1),'OK');assert.equal(h.c.removed,2);
});
for(const mode of ['inject','missing','invalid','message','no-response','copy-response'])test(mode+' 失敗捕捉・次回成功',async()=>{
  let fail=true;const o={};
  if(['inject','missing','invalid'].includes(mode))o.inject=()=>{if(!fail)return [{result:{text:'ok'}}];if(mode==='inject')throw Error('injection denied');return mode==='missing'?[]:[{result:{text:42}}];};
  else o.message=()=>{if(!fail)return {success:true};if(mode==='message')throw Error('send failed');return mode==='no-response'?undefined:{success:false,error:'copy denied'};};
  const h=setup(o);await h.run();assert.equal(h.c.badges.at(-1),'!');assert.match(h.c.titles.at(-1),/コピー失敗/);assert.ok(h.c.errors.length);assert.ok(!h.c.badges.includes('OK'));
  fail=false;await h.run();assert.equal(h.c.badges.at(-1),'OK');
});
test('制限URLと不明URLは注入せず失敗表示',async()=>{
  for(const url of ['chrome://settings','chrome-extension://x/a','edge://settings','about:blank','view-source:https://example.com','https://chrome.google.com/webstore','https://chrome.google.com/webstore/detail/x','https://chromewebstore.google.com/','',undefined,'invalid']){
    const h=setup();await h.run({id:1,url});assert.equal(h.c.inject,0);assert.equal(h.c.badges.at(-1),'!');assert.match(h.c.titles.at(-1),/コピー失敗/);
  }
});
test('SW停止でタイマーを失っても次回開始時に既定表示',async()=>{
  const h=setup();await h.run();h.timers.length=0;await h.run();assert.deepEqual(h.c.badges,['C','OK','C','OK']);
});
test('アイコン・3メニュー経路で未処理rejectionを残さない',async()=>{
  const h=setup({inject:()=>{throw Error('denied');}}),tab={id:1,url:'file:///test'};
  h.listeners.click(tab);await tick();
  for(const menuItemId of ['copy-google-en','copy-google-ja','copy-standard']){h.listeners.menu({menuItemId},tab);await tick();}
  assert.equal(h.c.errors.length,4);assert.equal(h.c.badges.at(-1),'!');
});
async function page(url,o={}){
  let timeout,cleared=false;
  const chrome={runtime:{getManifest:()=>({action:{default_title:'default'}}),onMessage:{addListener(){}},onInstalled:{addListener(){}}},action:{onClicked:{addListener(){}}},contextMenus:{onClicked:{addListener(){}}}};
  const ctx=vm.createContext({chrome,URL,window:{location:{href:url}},document:{title:'  既定\n タイトル  ',querySelector:s=>o.elements?.[s]||null},AbortController,console:{warn(){}},
    setTimeout:(f,ms)=>{assert.equal(ms,5000);timeout=f;return 1;},clearTimeout:()=>cleared=true,
    fetch:async(url,a)=>{assert.equal(new URL(url).searchParams.get('hl'),o.lang);if(o.timeout){const p=new Promise((r,j)=>a.signal.addEventListener('abort',()=>j(Error('aborted'))));timeout();return p;}return {ok:o.ok!==false,status:503,text:async()=>'<h1>remote</h1>'};},
    DOMParser:class{parseFromString(){return {title:'remote fallback',querySelector:()=>o.noH1?null:{textContent:' 遠隔\n タイトル ',innerText:'wrong'}};}}
  });
  vm.runInContext(source,ctx);const result=await ctx.mainProcessInPage(o.lang||null);if(o.lang)assert.equal(cleared,true);return result.text;
}
test('日本語URLデコード・uule/hl削除・不正エンコード・出力形式',async()=>{
  assert.equal(await page('https://example.com/%E6%97%A5%E6%9C%AC?uule=x&hl=ja&q=keep'),'既定 タイトル\nhttps://example.com/日本?q=keep');
  assert.equal(await page('https://example.com/%ZZ'),'既定 タイトル\nhttps://example.com/%ZZ');
});
test('Support query削除・communityのパラメーター保持',async()=>{
  assert.equal((await page('https://support.google.com/a?x=1&hl=ja')).split('\n')[1],'https://support.google.com/a');
  assert.equal((await page('https://support.google.com/s/community/search?q=%E6%97%A5&x=1')).split('\n')[1],'https://support.google.com/s/community/search?q=日&x=1');
  // 現行実装に合わせ、communityもuule/hlだけは除去する。
  assert.equal((await page('https://support.google.com/s/community/?q=x&hl=ja&uule=y')).split('\n')[1],'https://support.google.com/s/community/?q=x');
});
test('全サイト別タイトルとdocument.titleへのフォールバック',async()=>{
  for(const [url,s] of [['https://faq2.epson.jp/a','.faq_qstCont_ttl, #QuestionDescription, dt.question'],['https://news.yahoo.co.jp/a','article > header > h1'],['https://eset-support.canon-its.jp/a','h2.faq_qstCont_ttl > span.icoQ'],['https://kitaney-google.blogspot.com/a','h3'],['https://kitaney-wordpress.blogspot.com/a','h3']]){
    assert.ok((await page(url,{elements:{[s]:{innerText:' 専用\n 見出し '}}})).startsWith('専用 見出し\n'));
    assert.ok((await page(url)).startsWith('既定 タイトル\n'));
  }
  assert.ok((await page('https://faq2.epson.jp/',{elements:{'.faq_qstCont_ttl, #QuestionDescription, dt.question':{innerText:'よくある質問(FAQ)｜エプソン'}}})).startsWith('既定 タイトル\n'));
});
test('言語指定成功・h1 textContent・HTTPエラー・タイムアウト',async()=>{
  for(const lang of ['en','ja'])assert.ok((await page('https://support.google.com/a?x=1',{lang})).startsWith('遠隔 タイトル\n'));
  assert.ok((await page('https://support.google.com/a',{lang:'en',noH1:true})).startsWith('remote fallback\n'));
  for(const o of [{ok:false},{timeout:true}])assert.ok((await page('https://support.google.com/a',{lang:'en',...o})).startsWith('既定 タイトル\n'));
});

test('Offscreen確認応答が遅れても書き込み順を逆転させない',async()=>{
  const d=deferred(),writes=[];let listener,checks=0;
  vm.runInNewContext(offscreen,{chrome:{runtime:{onMessage:{addListener:f=>listener=f},sendMessage:async()=>{if(++checks===1)return d.promise;return {current:true};}}},document:{
    createElement:()=>({value:'',select(){writes.push(this.value);},remove(){}}),body:{appendChild(){}},execCommand:()=>true
  }});
  const a=new Promise(r=>listener({target:'offscreen',type:'copy-data',text:'old',requestId:'old'},{},r));
  await tick();
  const b=new Promise(r=>listener({target:'offscreen',type:'copy-data',text:'new',requestId:'new'},{},r));
  await tick();assert.equal(checks,1);assert.deepEqual(writes,[]);
  d.resolve({current:true});await Promise.all([a,b]);assert.deepEqual(writes,['old','new']);
});
test('Offscreenの最新要求確認が無応答なら書き込まず失敗',async()=>{
  let listener,removed=0;
  vm.runInNewContext(offscreen,{chrome:{runtime:{onMessage:{addListener:f=>listener=f},sendMessage:async()=>undefined}},document:{createElement:()=>{throw Error('must not write');}}});
  const response=await new Promise(r=>listener({target:'offscreen',type:'copy-data',text:'test',requestId:'x'},{},r));
  assert.equal(response.success,false);assert.match(response.error,/確認できません/);
});
