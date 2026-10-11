import test from 'node:test';
import assert from 'node:assert/strict';
import {findWindow,searchFold,WINDOW} from '../public/assets/pdf-reader/text-search.mjs';
test('literal Unicode search preserves n/enye, accents, whitespace and source positions',()=>{
 const text='Prologo: espan\u0303ol, español. CAPÍ\n TULO. %_';
 assert.equal(searchFold('niño'),'niño');assert.notEqual(searchFold('niño'),searchFold('nino'));
 const found=findWindow(text,'español');assert.equal(found.hits.length,2);
 assert.equal(text.slice(found.hits[0].start,found.hits[0].end),'espan\u0303ol');
 assert.equal(findWindow(text,'capí tulo').hits.length,1);assert.equal(findWindow(text,'%_').hits.length,1);
});
test('no matches lost or repeated at window boundaries or when result cap is reached',()=>{
 const query='cross window',text='x'.repeat(WINDOW-5)+query+' '+('match '.repeat(121));
 for(const needle of [query,'match']){
  let offset=0,done=false,hits=[];
  while(!done){const result=findWindow(text,needle,offset,50);assert.ok(result.next>offset||result.done);assert.ok(result.hits.length<=50);assert.ok(result.examined<=WINDOW+4);hits.push(...result.hits);offset=result.next;done=result.done;}
  assert.equal(hits.length,needle===query?1:121);assert.equal(new Set(hits.map(h=>h.start)).size,hits.length);
 }
});
