import {Component,ElementRef,Input,OnChanges,OnDestroy,SimpleChanges,ViewChild} from '@angular/core';
import {RecoverableSpeechService,SpeechContext,SpeechSelection} from '../../services/recoverable-speech.service';
import {pdfSelectionKey} from '../../core/pdf-speech-source';

@Component({selector:'recoverable-speech,epub-speech',templateUrl:'./recoverable-speech.component.html',
  styleUrl:'../reader-speech/reader-speech.component.scss',providers:[RecoverableSpeechService]})
export class RecoverableSpeechComponent implements OnChanges,OnDestroy {
  @Input() context?:SpeechContext;
  @Input() selection?:SpeechSelection;
  @ViewChild('panel') panel?:ElementRef<HTMLDialogElement>;
  captured?:SpeechSelection;
  private pointerCaptured=false;
  private voiceLabels=new WeakMap<SpeechSynthesisVoice,string>();
  private languageLabels=new Map<string,string>();
  private languageNames={es:new Intl.DisplayNames(['es'],{type:'language'}),en:new Intl.DisplayNames(['en'],{type:'language'})};
  rate=1;voiceId='';languageId='';query='';remote=false;
  confirmation:''|'replace'|'restart'='';
  constructor(public speech:RecoverableSpeechService) {
    try {
      const saved=JSON.parse(localStorage.getItem('libretorio:tts:preferences:v1')??'{}');
      if(typeof saved.voiceId==='string')this.voiceId=saved.voiceId;
      if(typeof saved.languageId==='string')this.languageId=saved.languageId;
      if(Number.isFinite(saved.rate)&&saved.rate>=.5&&saved.rate<=2)this.rate=saved.rate;
    } catch { /* Optional preferences, not reading progress. */ }
  }
  get reader(){this.speech.revision();return this.speech.reader;}
  key(voice:SpeechSynthesisVoice):string{return JSON.stringify([voice.voiceURI,voice.name,voice.lang]);}
  private base(voice:SpeechSynthesisVoice):string{return voice.lang.replaceAll('_','-').split('-')[0].toLowerCase();}
  private normalize(text:string):string{return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('_','-').toLowerCase();}
  private languageName(id:string,locale:'es'|'en'='es'):string {
    const key=locale+':'+id;
    if(!this.languageLabels.has(key)) {
      try{this.languageLabels.set(key,this.languageNames[locale].of(id)??id);}catch{this.languageLabels.set(key,id);}
    }
    return this.languageLabels.get(key)!;
  }
  private voiceLabel(voice:SpeechSynthesisVoice):string {
    let label=this.voiceLabels.get(voice);
    if(label===undefined){label=this.normalize(`${voice.name} ${voice.lang} ${this.languageName(this.base(voice))} ${this.languageName(this.base(voice),'en')}`);this.voiceLabels.set(voice,label);}
    return label;
  }
  get matchingVoices():SpeechSynthesisVoice[]{
    const query=this.normalize(this.query);
    return this.speech.voices.voices().filter(v=>(v.localService||this.remote)&&this.voiceLabel(v).includes(query));
  }
  get languages(){return [...new Set(this.matchingVoices.map(v=>this.base(v)))].map(id=>({id,label:this.languageName(id)})).sort((a,b)=>a.label.localeCompare(b.label,'es'));}
  get voices(){return this.matchingVoices.filter(v=>!this.languageId||this.base(v)===this.languageId).sort((a,b)=>a.name.localeCompare(b.name,'es'));}
  get voice(){return this.voices.find(v=>this.key(v)===this.voiceId);}
  get status():string {
    if(this.speech.error)return this.speech.error;
    if(this.speech.busy)return 'Validando seleccion...';
    if(this.reader?.state==='error')return `Lectura detenida (${this.reader.error}). Se conserva la frase pendiente.`;
    if(this.reader?.state==='done')return 'Lectura terminada';
    return this.speech.running?'Leyendo':this.reader?.session?'En pausa':'';
  }
  get newSelection():SpeechSelection|undefined {
    if(!this.captured)return undefined;
    const key='format' in this.captured?pdfSelectionKey(this.captured):this.captured.cfi;
    const saved='format' in this.captured?this.speech.saved?.['selectionKey']:this.speech.saved?.['cfi'];
    return key!==saved || this.reader?.error==='source-changed'?this.captured:undefined;
  }
  capture():void {this.captured=this.selection;this.pointerCaptured=true;}
  open():void {if(!this.pointerCaptured)this.captured=this.selection;this.pointerCaptured=false;this.confirmation='';this.panel?.nativeElement.showModal();}
  close():void {this.confirmation='';this.panel?.nativeElement.close();}
  async play():Promise<void> {
    if(this.speech.running||this.speech.busy){this.speech.pause();return;}
    if(!this.voice)return;
    if(this.newSelection && this.reader?.session){this.confirmation='replace';return;}
    await this.speech.start(this.newSelection,this.voice,this.rate,this.remote);
  }
  async continueSaved():Promise<void> {
    if(this.speech.running || this.speech.busy){this.speech.pause();return;}
    if(!this.voice){this.open();return;}
    await this.speech.start(undefined,this.voice,this.rate,this.remote);
  }
  async confirm():Promise<void> {
    const action=this.confirmation;this.confirmation='';
    if(action==='restart')await this.speech.restart();
    else if(action==='replace'&&this.voice)await this.speech.start(this.newSelection,this.voice,this.rate,this.remote,true);
  }
  askRestart():void{this.speech.pause();this.confirmation='restart';}
  search(event:Event):void{this.query=(event.target as HTMLInputElement).value;this.languageId='';}
  changeLanguage(event:Event):void{this.languageId=(event.target as HTMLSelectElement).value;this.save();}
  changeVoice(event:Event):void{this.voiceId=(event.target as HTMLSelectElement).value;this.save();}
  changeRate(event:Event):void{this.rate=Number((event.target as HTMLSelectElement).value);this.save();}
  changeRemote(event:Event):void{this.remote=(event.target as HTMLInputElement).checked;}
  private save():void {try{localStorage.setItem('libretorio:tts:preferences:v1',JSON.stringify({voiceId:this.voiceId,languageId:this.languageId,rate:this.rate}));}catch{/* Optional. */}}
  refreshVoices():void {this.speech.voices.voices.set(this.speech.voices.platform?.synth.getVoices()??[]);}
  async exportDiagnostic():Promise<void> {
    const report=await this.speech.diagnosticReport();
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=`libretorio-${this.speech.format}-voz.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  ngOnChanges(changes:SimpleChanges):void {
    if(changes['context']) {
      this.close();this.captured=undefined;this.speech.pause();
      if(this.context)void this.speech.bind(this.context);
      else this.speech.clearContext();
    }
  }
  ngOnDestroy():void{this.close();}
}
