import type {TextDocument} from './source.mjs';
import type {ReadingSession} from './reader.mjs';
export function openStore(name?:string):Promise<ReadingStore>;
export class ReadingStore {
  db:IDBDatabase;
  putDocument(document:TextDocument):Promise<void>;
  getDocument(id:string):Promise<TextDocument | undefined>;
  load(slot:string):Promise<ReadingSession | undefined>;
  removeDocument(id:string):Promise<void>;
}
