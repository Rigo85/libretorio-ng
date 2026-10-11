export const WINDOW=32768;
export function searchFold(text){return text.normalize('NFC').toLowerCase().replace(/[áàäâãå]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i').replace(/[óòöôõ]/g,'o').replace(/[úùüû]/g,'u').replace(/\s+/g,' ');}
// Offsets always refer to the original text, not to its whitespace/accent-normalized copy.
export function findWindow(text,query,start=0,limit=50){
  const needle=searchFold(query).trim();
  if(!needle||needle.length>128||!Number.isSafeInteger(start)||start<0||start>text.length)throw new Error('invalid-search');
  let normalized='',positions=[],ends=[],raw=start;
  const boundary=Math.min(text.length,start+WINDOW);
  for(;raw<boundary;){
    const begin=raw,point=String.fromCodePoint(text.codePointAt(raw));raw+=point.length;
    // Include combining marks with their base letter (including n + combining tilde).
    while(raw<text.length&&/[\u0300-\u036f]/.test(text[raw]))raw++;
    const value=searchFold(text.slice(begin,raw));
    if(value===' '&&normalized.endsWith(' ')){ends[ends.length-1]=raw;continue;}
    for(const char of value){normalized+=char;for(let i=0;i<char.length;i++){positions.push(begin);ends.push(raw);}}
  }
  const final=raw>=text.length,stop=final?normalized.length:Math.max(0,normalized.length-needle.length);
  const hits=[];let offset=0,next=final?text.length:(positions[stop]??raw);
  while(offset<=stop){const found=normalized.indexOf(needle,offset);if(found<0||(!final&&found>=stop))break;
    const begin=positions[found],end=ends[found+needle.length-1];
    hits.push({start:begin,end,excerpt:text.slice(Math.max(start,begin-45),Math.min(raw,end+75)).replace(/\s+/g,' ')});
    offset=found+needle.length;
    if(hits.length===limit){next=end;break;}
  }
  if(next<=start&&next<text.length)throw new Error('search-window-overflow');
  return {hits,next,done:next>=text.length,examined:raw-start};
}
