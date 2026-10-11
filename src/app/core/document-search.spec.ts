import {DocumentSearch,SearchBatch} from './document-search';
import {domSearchWindow} from './dom-search';
describe('bounded document search',()=>{
 it('rejects late responses and never confirms an aborted cursor',async()=>{
  let resolve!:(value:SearchBatch)=>void;
  const source={search:()=>new Promise<SearchBatch>(done=>resolve=done)};
  const search=new DocumentSearch(source,()=>{});const pending=search.start('test');
  await new Promise(done=>setTimeout(done,40));search.cancel();resolve({hits:[{label:'one',excerpt:'test'}],cursor:1,done:false});await pending;
  expect(search.hits).toEqual([]);expect(search.cursor).toBeUndefined();expect(search.busy).toBeFalse();
 });
 it('retains a single results batch and retries the same failed cursor',async()=>{
  let fail=false,cursors:unknown[]=[];
  const search=new DocumentSearch({search:async(_q,cursor)=>{cursors.push(cursor);if(fail)throw Error('offline');
    return {hits:Array.from({length:50},()=>({label:'p',excerpt:'match'})),cursor:Number(cursor??0)+1,done:false};}},()=>{});
  await search.start('test');await search.more();expect(search.hits.length).toBe(50);expect(search.peakResults).toBe(50);
  fail=true;await search.more();expect(search.error).toContain('incompleta');expect(search.cursor).toBe(2);
  fail=false;await search.more();expect(cursors).toEqual([undefined,1,2,2]);search.close();expect(search.hits.length).toBe(0);
 });
 it('finds phrases across inline nodes and line breaks without changing selection or DOM',()=>{
  const root=document.createElement('div');root.innerHTML='<p>Una <em>edad</em> de<br>oro.</p><script>edad de oro</script>';
  const before=root.innerHTML,result=domSearchWindow(root,'edad de oro');
  expect(result.hits.length).toBe(1);expect(result.hits[0].range?.startContainer.textContent).toBe('edad');expect(root.innerHTML).toBe(before);
 });
 it('does not retain whole long sections and finds boundary-spanning phrases',()=>{
  const root=document.createElement('div');root.textContent='x'.repeat(32763)+'cross window'+'x'.repeat(50000);
  let cursor=0,done=false,hits=0;
  while(!done){const result=domSearchWindow(root,'cross window',cursor);hits+=result.hits.length;expect(result.examined).toBeLessThanOrEqual(32772);cursor=result.next;done=result.done;}
  expect(hits).toBe(1);
 });
});
