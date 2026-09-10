/** PM Log submission service. Deploy as owner; access: Anyone.
 * No spreadsheet contents or account tokens are returned to callers.
 * Keep this project separate from your BM/PD script.
 */
const PM_SHEET_ID = '1bV9I-JyDZW7jTt4WltBlFdQW6OErzlW0U5BfgMyUjXI';
const PM_TAB = 'Sheet1';
const PM_HEADERS = ['Timestamp','0. Site','1-1. 공정 (Process)','1-2. Machine','2-2. Vision Type','2-3. Source of Cause','3-1. Completed Time','3-2. Downtime','3-3. PIC','3-4. Comments','PM Submission ID','PM Payload Hash'];
function pmSheet_(){const sheet=SpreadsheetApp.openById(PM_SHEET_ID).getSheetByName(PM_TAB);if(!sheet)throw Error('PM Log tab not found.');return sheet;}
function pmJson_(value,callback){const json=JSON.stringify(value);return ContentService.createTextOutput(callback?callback+'('+json+');':json).setMimeType(callback?ContentService.MimeType.JAVASCRIPT:ContentService.MimeType.JSON);}
function pmId_(id){return typeof id==='string'&&/^pm-log-[a-zA-Z0-9-]{20,100}$/.test(id);}
function pmFind_(sheet,id){if(sheet.getLastRow()<2)return null;const cell=sheet.getRange(2,11,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).findNext();if(!cell)return null;const row=cell.getRow();return {timestamp:String(sheet.getRange(row,1).getValue()),hash:String(sheet.getRange(row,12).getValue())};}
function pmHeaders_(sheet){const current=sheet.getRange(1,1,1,12).getDisplayValues()[0];for(let i=0;i<PM_HEADERS.length;i++){if(current[i]&&current[i]!==PM_HEADERS[i])throw Error('PM Log column '+(i+1)+' has an unexpected header. No record saved.');if(i<9&&!current[i])throw Error('The existing PM Log headers are incomplete.');}for(let i=9;i<12;i++)if(!current[i])sheet.getRange(1,i+1).setValue(PM_HEADERS[i]);}
function pmPayload_(input){
  if(!input||typeof input!=='object')throw Error('PM data is missing.');
  const keys=['building','process','machine','vision','cause','completed','downtime','pic','comments'],data={};
  keys.forEach(key=>{const value=input[key];if(typeof value!=='string'||value.length>(key==='comments'?10000:key==='cause'?2200:250))throw Error('Invalid '+key+'.');data[key]=value.trim();if(key!=='comments'&&!data[key])throw Error('Enter '+key+'.');});
  if(!['MI1','MI2'].includes(data.building)||!Object.prototype.hasOwnProperty.call(PM_RULES.visions,data.process))throw Error('Invalid building or process.');
  let machines=(['PKG','EOL'].includes(data.process)?PM_RULES.pkgMachines:PM_RULES.machines)[data.building].slice();if(['LAMI','STK'].includes(data.process))machines.push('Rework');
  if(!machines.includes(data.machine)||!PM_RULES.visions[data.process].includes(data.vision))throw Error('Machine or vision does not match the selected building and process.');
  if(!['Electrode Debris','Foreign Material','Oil from CE'].includes(data.cause)&&!/^Other: .+/.test(data.cause))throw Error('Select a cause or describe Other.');
  const match=data.completed.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);if(!match)throw Error('Choose a valid completed date and time.');const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));if(date.toISOString().slice(0,10)!==data.completed.slice(0,10))throw Error('Invalid completed date.');
  return data;
}
function pmHash_(data){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(data)).map(n=>(n&255).toString(16).padStart(2,'0')).join('');}
function pmLiteral_(text){return /^[=+@-]/.test(text)?"'"+text:text;}
function doPost(e){
  let id=null,lock=null;
  try{
    if(!e||!e.postData||e.postData.contents.length>24000)throw Error('Invalid submission.');
    const body=JSON.parse(e.postData.contents);id=body.requestId;if(!pmId_(id))throw Error('Invalid submission ID.');
    const data=pmPayload_(body.data),hash=pmHash_(data);lock=LockService.getScriptLock();lock.waitLock(20000);
    const sheet=pmSheet_();pmHeaders_(sheet);const existing=pmFind_(sheet,id);
    if(existing){if(existing.hash!==hash)throw Error('This submission ID was already used for a different entry.');return pmJson_({ok:true,saved:true,requestId:id,timestamp:existing.timestamp});}
    const timestamp=new Date().toISOString();
    const values=[timestamp,data.building,data.process,data.machine,data.vision,data.cause,data.completed.replace('T',' '),data.downtime,data.pic,data.comments,id,hash].map(pmLiteral_);
    const nextRow=sheet.getLastRow()+1;if(nextRow>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),1);
    sheet.getRange(nextRow,1,1,12).setNumberFormat('@').setValues([values]);SpreadsheetApp.flush();
    CacheService.getScriptCache().remove('pm-error-'+id);
    return pmJson_({ok:true,saved:true,requestId:id,timestamp});
  }catch(error){const message=String(error.message||'Submission failed.');if(pmId_(id))CacheService.getScriptCache().put('pm-error-'+id,JSON.stringify({ok:false,saved:false,requestId:id,error:message}),600);return pmJson_({ok:false,saved:false,requestId:id,error:message});}
  finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function doGet(e){
  const params=e&&e.parameter||{},callback=params.callback;
  if(callback&&!/^pmcb_[a-zA-Z0-9_]{1,70}$/.test(callback))return pmJson_({ok:false,error:'Invalid callback.'});
  if(params.action==='health')return pmJson_({ok:true,service:'visionary-pm-log',version:1},callback);
  if(params.action!=='status'||!pmId_(params.requestId))return pmJson_({ok:false,error:'Invalid status request.'},callback);
  try{const existing=pmFind_(pmSheet_(),params.requestId);if(existing)return pmJson_({ok:true,saved:true,requestId:params.requestId,timestamp:existing.timestamp},callback);const error=CacheService.getScriptCache().get('pm-error-'+params.requestId);return pmJson_(error?JSON.parse(error):{ok:true,saved:false,requestId:params.requestId},callback);}catch(error){return pmJson_({ok:false,saved:false,requestId:params.requestId,error:'The PM Log service could not check the save. Try again.'},callback);}
}

const PM_RULES = {"machines": {"MI1": ["1-1", "1-2", "1-3", "1-4", "1-5", "2-1", "2-2", "2-3", "2-4", "2-5"], "MI2": ["3-1", "3-2", "3-3", "3-4", "3-H", "3-5", "4-1", "4-2", "4-3", "4-4", "4-5", "4-6", "5-1", "5-2", "5-3", "5-4", "5-5", "5-6", "5-7", "5-8"]}, "visions": {"LAMI": ["Merge", "LSS", "Thickness", "NG Mark", "Final Lami"], "STK": ["Mono Sepa", "MS1", "MS2", "MS3", "ALL MS", "Half Cell", "Final Stack", "4-Side"], "PKG": ["Lead Align (-)", "Lead Align (+)", "Welding (-)", "Welding(+)", "Lead Vision", "Pouch Pinhole", "Pouch Align", "X-Ray"], "Cell Tracking": ["BCR Lami", "BCR Stack", "Laser Glass", "Laser Cover"], "EOL": ["CT Machine", "Lead Sealing", "Cosmetic", "Sealing Thickness L", "Sealing Thickness S"]}, "pkgMachines": {"MI1": ["1-1", "1-2", "2-1", "2-2"], "MI2": ["3-1", "3-2", "4-1", "4-2", "5-1", "5-2", "5-3"]}};
