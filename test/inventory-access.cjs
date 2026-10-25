'use strict';
// Offline role tests. No Firebase requests, sign-ins or live records are used.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...original.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [,attrs,body] of scripts)if(!/application\/json|type="module"/.test(attrs)&&body.trim())new vm.Script(body);
const fixture={id:'test-camera',name:'Test camera',partNumber:'TEST-1',modelName:'TEST-1',location:'D4',sourceSheet:'LNS',sourceRow:4,sourceNo:1,pic:'LNS',onHand:7,usage:1,minimum:2,maximum:10,description:'Test fixture',vendor:'Fixture',vision:'Merge',category:'Camera',addedDate:'2026-10-25'};
const html=original.replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g,'');
const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname;if(file==='/'||file==='/index.html'){res.setHeader('Content-Type','text/html');return res.end(html);}const p=path.join(root,decodeURIComponent(file));if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);return res.end();}res.end(fs.readFileSync(p));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 for(const role of ['Engineer','Technician','Spare Parts','Admin']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await context.addInitScript(({role,fixture})=>{
   if(window.top!==window)return;
   localStorage.setItem('visionary-auth-session-v1',JSON.stringify({role,lastActivity:Date.now()}));localStorage.setItem('visionary.inventory.pending.v1',JSON.stringify({id:'pending-test',itemId:fixture.id,quantity:1}));
   window.__writes=[];window.VisionaryInventoryCloud={watch(callback){queueMicrotask(()=>callback([fixture],window.VisionarySparePartsCanManage?.()?[{id:'withdrawal-test',itemId:fixture.id,itemName:fixture.name,partNumber:fixture.partNumber,quantity:1,returnedQuantity:0,location:'D4',timestamp:'2026-10-25',technician:'Fixture'}]:[],false));const stop=()=>{};stop.hasMoreHistory=()=>false;return stop;},revokeManagement:async()=>{}};
   for(const name of ['add','edit','remove','returnPart','deleteItem','deleteWithdrawal','initialize','importCatalog','previewImportCatalog'])window.VisionaryInventoryCloud[name]=async()=>window.__writes.push(name);
  },{role,fixture});
  await page.goto(origin+'/#spare-parts-preview');await page.waitForFunction(()=>document.getElementById('app-shell')&&!document.getElementById('app-shell').hidden);await page.fill('#spp-search-input','TEST-1');await page.waitForFunction(()=>document.getElementById('spp-item-list').textContent.includes('Test camera'));
  assert((await page.locator('#spp-item-list').textContent()).includes('D4'));
  if(role!=='Admin'){
   assert.equal(await page.evaluate(()=>window.VisionarySparePartsCanManage()),false);
   await page.evaluate(()=>location.hash='daily-tasks');await page.waitForFunction(()=>location.hash==='#spare-parts-preview');assert.equal(await page.locator('#daily-tasks-view').isVisible(),false);
   for(const id of ['spp-add-item','spp-import-inventory','spp-export-workbook','spp-export-history','spp-history-details','spp-resolve'])assert.equal(await page.locator('#'+id).isVisible(),false,role+': '+id);
   assert.equal(await page.locator('[data-spp-select],[data-spp-edit],[data-spp-return],[data-spp-delete-item],[data-spp-delete-withdrawal]').count(),0);
   await page.evaluate(()=>{document.getElementById('spp-add-item').click();document.getElementById('spp-resolve').click();for(const id of ['spp-add-form','spp-edit-form','spp-withdrawal-form','spp-return-form'])document.getElementById(id).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
   assert.deepEqual(await page.evaluate(()=>window.__writes),[]);
   assert.equal(await page.locator('#spp-add-dialog').evaluate(d=>d.open),false);
   await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.spp-read-only-item').count(),1);assert.equal(await page.locator('#spp-add-item').isVisible(),false);
  }else{
   assert.equal(await page.evaluate(()=>window.VisionarySparePartsCanManage()),true);await page.locator('[data-spp-open]').click();assert.equal(await page.locator('[data-spp-edit]').isVisible(),true);assert.equal(await page.locator('[data-spp-select]').isVisible(),true);assert.equal(await page.locator('#spp-add-item').isVisible(),true);assert.equal(await page.locator('#spp-export-workbook').isVisible(),true);
  }
  assert.deepEqual(errors,[],role+' browser errors');await context.close();console.log('PASS UI: '+role);
 }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 // Exercise actual inventory methods with a denied role: they must fail before any Firebase call.
 const code=original.slice(original.indexOf('const inventoryApp=initializeApp'),original.indexOf("window.dispatchEvent(new Event('inventory-cloud-ready'))"));
 let firebaseCalls=0;const sandbox={console,window:{VisionarySparePartsCanManage:()=>false,VisionarySparePartsCanDelete:()=>false},document:{},location:{protocol:'https:'},firebaseConfig:{},initializeApp:()=>({}),getAuth:()=>({}),initializeFirestore:()=>({}),persistentLocalCache:()=>({}),persistentMultipleTabManager:()=>({}),navigator:{onLine:true},setPersistence:()=>{firebaseCalls++;throw Error('Unexpected Firebase call');}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);for(const [method,args] of [['remove',[{}]],['returnPart',[{}]],['edit',['x',{}]],['add',[{}]],['initialize',[[]]],['deleteItem',['x']],['deleteWithdrawal',['x']],['previewImportCatalog',[[]]],['importCatalog',[[],null]],['getAllInventoryHistoryForExport',[]],['getLatestInventoryForExport',[]]])await assert.rejects(sandbox.window.VisionaryInventoryCloud[method](...args),/Supervisor/);assert.equal(firebaseCalls,0);console.log('PASS actual cloud guards: 11 denied methods, zero Firebase calls.');
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
