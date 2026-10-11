// Isolated browser context and synthetic catalogue. Never forward API/WS to production.
const {chromium}=require('../../local-b0-b1/tools/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base='https://localhost:8447',out=path.resolve(__dirname,'../../local-speech/reports/epub-dev');
const epub=fs.readFileSync(path.resolve(__dirname,'../../local-b0-b1/fixtures/books/sample.epub'));
const item={id:987654,name:'sample.epub',parentPath:'/books',parentHash:'fixture',size:'1 KB',coverId:'tts-test',fileKind:'FILE',webDetails:{title:'EPUB TTS test'},customDetails:false};
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const results=[];
  let activePage;
  try {
    for(const width of [320,390,1440]) {
      const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900},serviceWorkers:'block'});
      const unexpected=[];
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base && !['blob:','data:'].includes(url.protocol)){unexpected.push(url.href);return route.abort();}
        if(url.pathname==='/api/me')return route.fulfill({json:{authenticated:true,userId:'isolated-test',isAdmin:false}});
        if(url.pathname==='/api/csrf-token')return route.fulfill({json:{csrfToken:'isolated-test'}});
        if(url.pathname==='/api/session/activity')return route.fulfill({json:{success:true}});
        if(url.pathname==='/books/sample.epub')return route.fulfill({body:route.request().method()==='HEAD'?'':epub,contentType:'application/epub+zip',headers:{etag:'"fixture-v1"','content-length':String(epub.length)}});
        if(url.pathname.startsWith('/covers/'))return route.fulfill({status:404,body:''});
        if(/^\/(api|books|cache)(\/|$)/.test(url.pathname)){unexpected.push(url.href);return route.abort();}
        return route.continue();
      });
      await context.routeWebSocket('**/*',socket=>socket.onMessage(raw=>{
        const message=JSON.parse(raw);
        if(message.event==='ls')socket.send(JSON.stringify({event:'list',data:{files:[item],total:1,directories:{name:'books',hash:'fixture',directories:[]}}}));
      }));
      await context.addInitScript(()=>{
        const voice={voiceURI:'test-es',name:'Spanish United States',lang:'es_US',localService:true,default:true};
        window.__utterances=[];
        class Utterance{constructor(text){this.text=text;}}
        const synth=new EventTarget();Object.assign(synth,{paused:false,getVoices:()=>[voice],speak:u=>{window.__utterances.push(u);setTimeout(()=>u.onstart?.({}),0);},cancel(){window.__utterances.at(-1)?.onerror?.({error:'interrupted'});},resume(){}});
        Object.defineProperty(window,'speechSynthesis',{value:synth});Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
      activePage=page;
      async function open(){
        await page.goto(base+'/');await page.locator('.clickable-area').first().click();
        await page.locator('#bookDetailsModal').getByRole('button',{name:'Read',exact:true}).click();
        await page.waitForFunction(()=>[...document.querySelectorAll('#readModal iframe')].some(f=>f.contentDocument?.querySelector('p')));
        await page.waitForFunction(()=>{const el=document.querySelector('epub-speech');return el&&window.ng?.getComponent(el)?.reader;});
      }
      await open();
      await page.evaluate(()=>{
        const frame=[...document.querySelectorAll('#readModal iframe')].find(f=>f.contentDocument?.querySelector('p'));
        const doc=frame.contentDocument,range=doc.createRange();range.selectNodeContents(doc.querySelector('p'));
        const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(range);doc.dispatchEvent(new Event('selectionchange'));
      });
      await page.waitForFunction(()=>!!window.ng.getComponent(document.querySelector('epub-speech')).selection);
      await page.locator('epub-speech').getByRole('button',{name:'Lectura en voz alta',exact:true}).click();
      const dialog=page.locator('epub-speech dialog');await dialog.getByRole('searchbox').fill('espa');
      assert.equal(await dialog.locator('select[aria-label="Idioma de voz"] option').count(),2);
      await dialog.getByRole('combobox',{name:'Voz',exact:true}).selectOption({label:'Spanish United States (es_US)'});
      await dialog.getByRole('button',{name:'Continuar voz',exact:true}).click();
      await page.waitForFunction(()=>window.__utterances.length===1);
      await page.evaluate(()=>window.__utterances[0].onend({}));
      await page.waitForFunction(()=>window.__utterances.length===2);
      if(width===390)await page.waitForTimeout(31000);
      await dialog.getByRole('button',{name:'Pausar voz',exact:true}).click();
      const before=await page.evaluate(()=>window.ng.getComponent(document.querySelector('epub-speech')).speech.reader.session);
      assert.ok(before.pending);assert.ok(before.cursor>0);
      const diagnostic=await page.evaluate(()=>window.ng.getComponent(document.querySelector('epub-speech')).speech.diagnosticReport());
      assert.ok(!JSON.stringify(diagnostic).includes('Local synthetic reading fixture'));
      assert.equal(diagnostic.diagnosticFailures,0);
      if(width===390)assert.ok(diagnostic.performance.samples.length>=2);
      await page.screenshot({path:path.join(out,`epub-tts-${width}.png`)});
      const geometry=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,overflow:el.scrollWidth>el.clientWidth};});
      assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.bottom<=900&&!geometry.overflow,JSON.stringify(geometry));
      await open();assert.equal(await page.evaluate(()=>window.__utterances.length),0);
      const restored=await page.evaluate(()=>window.ng.getComponent(document.querySelector('epub-speech')).speech.reader.session);
      assert.equal(restored.pending.text,before.pending.text);
      assert.equal(restored.cursor,before.cursor);
      await page.locator('epub-speech > button[aria-label="Continuar voz"]').click();
      await page.waitForFunction(()=>window.__utterances.length===1);
      assert.equal(await page.evaluate(()=>window.__utterances[0].text),before.pending.text);
      await page.locator('epub-speech > button[aria-label="Pausar voz"]').click();
      const after=await page.evaluate(()=>window.ng.getComponent(document.querySelector('epub-speech')).speech.diagnosticReport());
      assert.ok(after.previous.length>=1);assert.equal(after.diagnosticFailures,0);
      assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
      results.push({width,reload:true,pendingPreserved:true,cursor:before.cursor,diagnosticRestored:true,geometry});await context.close();
    }
  } catch(error) {
    if(activePage&&!activePage.isClosed()) {
      await activePage.screenshot({path:path.join(out,'failure.png')});
      console.error(await activePage.evaluate(()=>{const c=window.ng?.getComponent(document.querySelector('epub-speech')),v=window.ng?.getComponent(document.querySelector('epub-viewer'));return c?{selection:c.selection,viewerSelection:v?.speechSelection,captured:c.captured,voice:c.voiceId,state:c.reader?.state,error:c.speech.error,busy:c.speech.busy}:{};}));
    }
    throw error;
  } finally {await browser.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));}
  console.log(JSON.stringify(results,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
