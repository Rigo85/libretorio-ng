// Real MuPDF worker with an isolated browser, synthetic PDF, and mocked API/WS.
const {chromium}=require('../../local-b0-b1/tools/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base='https://localhost:8447',out=path.resolve(__dirname,'../../local-speech/reports/pdf-dev');
async function fixture(){
  const m=await import('mupdf'),doc=new m.PDFDocument(),font=new m.Font('Times-Roman'),ref=doc.addSimpleFont(font);
  for(let i=0;i<8;i++){
    const text=Array.from({length:12},(_,line)=>`0 -22 Td (Page ${i+1} line ${line+1}. This is a complete sentence for testing speech.) Tj`).join('\n');
    const page=doc.addPage([0,0,500,750],0,{Font:{F1:ref}},`BT /F1 12 Tf 24 720 Td ${text} ET`);doc.insertPage(-1,page);page.destroy();
  }
  const buffer=doc.saveToBuffer('compress'),bytes=Buffer.from(buffer.asUint8Array());buffer.destroy();ref.destroy();font.destroy();doc.destroy();return bytes;
}
async function main(){
  fs.mkdirSync(out,{recursive:true});const pdf=await fixture(),results=[];
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let active;
  try{for(const width of [320,390,1440]){
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900},serviceWorkers:'block'}),unexpected=[];
    await context.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==base&&!['blob:','data:'].includes(url.protocol)){unexpected.push(url.href);return route.abort();}
      if(url.pathname==='/api/me')return route.fulfill({json:{authenticated:true,userId:'pdf-isolated-test',isAdmin:false}});
      if(url.pathname==='/api/csrf-token')return route.fulfill({json:{csrfToken:'isolated'}});
      if(url.pathname==='/api/session/activity')return route.fulfill({json:{success:true}});
      if(url.pathname==='/books/speech.pdf'){
        const headers={'content-type':'application/pdf','accept-ranges':'bytes',etag:'"fixture-v1"'};
        if(req.method()==='HEAD')return route.fulfill({headers:{...headers,'content-length':String(pdf.length)},body:''});
        const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers()['range']??'');
        if(!range){unexpected.push('missing range');return route.abort();}
        const start=+range[1],end=Math.min(+range[2],pdf.length-1),body=pdf.subarray(start,end+1);
        return route.fulfill({status:206,headers:{...headers,'content-length':String(body.length),'content-range':`bytes ${start}-${end}/${pdf.length}`},body});
      }
      if(url.pathname.startsWith('/covers/'))return route.fulfill({status:404,body:''});
      if(/^\/(api|books|cache)(\/|$)/.test(url.pathname)){unexpected.push(url.href);return route.abort();}
      return route.continue();
    });
    await context.routeWebSocket('**/*',socket=>socket.onMessage(raw=>{
      if(JSON.parse(raw).event==='ls')socket.send(JSON.stringify({event:'list',data:{files:[{id:98765,name:'speech.pdf',parentPath:'/books',parentHash:'fixture',size:'3 KB',coverId:'pdf-test',fileKind:'FILE',webDetails:{title:'PDF TTS test'}}],total:1,directories:{name:'books',hash:'fixture',directories:[]}}}));
    }));
    await context.addInitScript(()=>{
      const voice={voiceURI:'test-es',name:'Spanish United States',lang:'es_US',localService:true,default:true};window.__utterances=[];window.__requests=[];
      class Utterance{constructor(text){this.text=text;}}
      const synth=new EventTarget();Object.assign(synth,{paused:false,getVoices:()=>[voice],speak:u=>{window.__utterances.push(u);setTimeout(()=>u.onstart?.({}),0);},cancel(){window.__utterances.at(-1)?.onerror?.({error:'interrupted'});},resume(){}});
      Object.defineProperty(window,'speechSynthesis',{value:synth});Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance});
      const post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(data,...args){window.__requests.push({type:data.type,page:data.page,start:data.start,end:data.end});return post.call(this,data,...args);};
    });
    const page=await context.newPage();active=page;const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
    async function open(){
      await page.goto(base+'/');await page.locator('.clickable-area').first().click();
      await page.locator('#bookDetailsModal').getByRole('button',{name:'Read',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.pdf-text-layer[data-page="0"]')?.dataset.speechRevision);
      await page.waitForFunction(()=>{const el=document.querySelector('recoverable-speech');return el&&window.ng.getComponent(el).reader&&!window.ng.getComponent(el).speech.busy;});
    }
    await open();
    await page.evaluate(()=>window.ng.getComponent(document.querySelector('pdf-viewer')).render(1));
    await page.waitForFunction(()=>document.querySelector('.pdf-text-layer[data-page="1"]')?.dataset.speechRevision);
    await page.evaluate(()=>{
      const first=document.querySelector('.pdf-text-layer[data-page="0"]'),last=document.querySelector('.pdf-text-layer[data-page="1"]');
      const range=document.createRange();range.setStart(first,0);range.setEnd(last,last.childNodes.length);
      const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForFunction(()=>window.ng.getComponent(document.querySelector('recoverable-speech')).selection?.pages.length===2);
    await page.locator('recoverable-speech').getByRole('button',{name:'Lectura en voz alta',exact:true}).click();
    const dialog=page.locator('recoverable-speech dialog');await dialog.getByRole('searchbox').fill('espa');
    await dialog.getByRole('combobox',{name:'Voz',exact:true}).selectOption({label:'Spanish United States (es_US)'});
    await dialog.getByRole('button',{name:'Continuar voz',exact:true}).click();
    await page.waitForFunction(()=>window.ng.getComponent(document.querySelector('recoverable-speech')).reader.state==='speaking');
    await page.evaluate(()=>window.__utterances[0].onend({}));
    await page.waitForFunction(()=>window.__utterances.length===2&&window.ng.getComponent(document.querySelector('recoverable-speech')).reader.state==='speaking');
    await dialog.getByRole('button',{name:'Pausar voz',exact:true}).click();
    const saved=await page.evaluate(()=>window.ng.getComponent(document.querySelector('recoverable-speech')).reader.session);assert.ok(saved.cursor>0);assert.ok(saved.pending);
    const geometry=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,overflow:el.scrollWidth>el.clientWidth};});
    assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.bottom<=900&&!geometry.overflow);
    await page.screenshot({path:path.join(out,`pdf-tts-${width}.png`)});
    await dialog.getByRole('button',{name:'Cerrar opciones de voz'}).click();
    const mode=await page.evaluate(()=>{const c=window.ng.getComponent(document.querySelector('pdf-viewer'));c.setReading(!c.reading);return c.reading;});
    await page.locator('recoverable-speech > button[aria-label="Continuar voz"]').click();
    await page.waitForFunction(()=>window.__utterances.length===3);assert.equal(await page.evaluate(()=>window.__utterances[2].text),saved.pending.text);
    assert.equal(await page.evaluate(()=>window.ng.getComponent(document.querySelector('pdf-viewer')).reading),mode);
    await page.locator('recoverable-speech > button[aria-label="Pausar voz"]').click();
    const beforeReload=await page.evaluate(()=>window.__requests.filter(r=>r.type==='speech-text'));
    await open();assert.equal(await page.evaluate(()=>window.__utterances.length),0);
    const restored=await page.evaluate(()=>window.ng.getComponent(document.querySelector('recoverable-speech')).reader.session);assert.equal(restored.cursor,saved.cursor);
    await page.locator('recoverable-speech > button[aria-label="Continuar voz"]').click();
    await page.waitForFunction(()=>window.__utterances.length===1);assert.equal(await page.evaluate(()=>window.__utterances[0].text),saved.pending.text);
    for(let i=0;i<150;i++) {
      const state=await page.evaluate(()=>window.ng.getComponent(document.querySelector('recoverable-speech')).reader.state);
      if(state==='done')break;
      await page.waitForFunction(()=>window.ng.getComponent(document.querySelector('recoverable-speech')).reader.state==='speaking');
      const count=await page.evaluate(()=>{window.__utterances.at(-1).onend({});return window.__utterances.length;});
      await page.waitForFunction(count=>window.__utterances.length>count||window.ng.getComponent(document.querySelector('recoverable-speech')).reader.state==='done',count);
    }
    const completed=await page.evaluate(()=>{const r=window.ng.getComponent(document.querySelector('recoverable-speech')).reader;return {state:r.state,cursor:r.session.cursor,end:r.session.end,text:window.__utterances.map(u=>u.text).join(' ')};});
    assert.equal(completed.state,'done');assert.equal(completed.cursor,completed.end);assert.ok(completed.text.includes('Page 2 line 12.'));
    const requests=beforeReload.concat(await page.evaluate(()=>window.__requests.filter(r=>r.type==='speech-text')));
    assert.ok(requests.length);assert.ok(requests.every(r=>r.end-r.start<=8192&&[0,1].includes(r.page)));
    const canvas=await page.locator('canvas').first().evaluate(el=>({width:el.width,height:el.height,ink:[...el.getContext('2d').getImageData(0,0,el.width,el.height).data].some((v,i)=>i%4!==3&&v<150)}));assert.ok(canvas.width&&canvas.height&&canvas.ink);
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);results.push({width,cursor:saved.cursor,completed:completed.cursor,reload:true,modeChange:true,geometry,requests});await context.close();
  }}catch(error){if(active&&!active.isClosed()){await active.screenshot({path:path.join(out,'failure.png')});console.error(await active.locator('body').innerText());}throw error;}
  finally{await browser.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));}
  console.log(JSON.stringify(results,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
