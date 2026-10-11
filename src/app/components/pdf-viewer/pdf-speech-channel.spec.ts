import {PdfSpeechChannel} from './pdf-speech-channel';
import {PdfSpeechLayout} from '../../core/pdf-speech-source';

describe('PDF text channel isolation',()=>{
  const page={page:2,start:0,end:10,length:10,revision:'a'.repeat(64)};
  const layout:PdfSpeechLayout={reading:false,layoutWidth:390,fontSize:20,fontFamily:'serif',pageMargin:12,lineHeight:1.5};
  it('separates render and speech responses and rejects late replies after abort or close',async()=>{
    const postMessage=jasmine.createSpy(),channel=new PdfSpeechChannel({postMessage}),controller=new AbortController();
    const promise=channel.read(page,layout,0,5,controller.signal),id=postMessage.calls.mostRecent().args[0].id;
    expect(channel.receive({type:'render'})).toBeFalse();
    channel.receive({channel:'speech',id,type:'speech-text',text:'Texto'});expect(await promise).toBe('Texto');
    const aborted=channel.read(page,layout,0,5,controller.signal);controller.abort();await expectAsync(aborted).toBeRejected();
    expect(channel.receive({channel:'speech',id,type:'speech-text',text:'late'})).toBeTrue();
    const pending=channel.read(page,layout,0,5,new AbortController().signal);channel.close();await expectAsync(pending).toBeRejected();
  });
});
