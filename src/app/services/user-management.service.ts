import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {firstValueFrom, timeout} from 'rxjs';

export interface ManagedUser {id:string;email:string;isAdmin:boolean;isActive:boolean;createdAt:string;lastLogin?:string;revision:number;}
export interface ManagedPage {items:ManagedUser[];next:string|null;}
export interface ManagementIdentity {authenticated:boolean;isAdmin:boolean;userId:string;userManagementEnabled?:boolean;}
@Injectable({providedIn:'root'})
export class UserManagementService {
  private http=inject(HttpClient);
  identity(){return firstValueFrom(this.http.get<ManagementIdentity>('/api/me?passive=1').pipe(timeout(15000)));}
  list(q:string,state:string,before?:string){
    let params=new HttpParams().set('q',q).set('state',state);if(before)params=params.set('before',before);
    return firstValueFrom(this.http.get<ManagedPage>('/api/admin/users',{params}).pipe(timeout(15000)));
  }
  save(id:string|undefined,action:string,body:object){
    const base='/api/admin/users';
    const request=!id?this.http.post(base,body):action==='edit'?this.http.patch(`${base}/${id}`,body):this.http.post(`${base}/${id}/${action}`,body);
    return firstValueFrom(request.pipe(timeout(30000))) as Promise<{selfRevoked?:boolean}>;
  }
  password(body:object){return firstValueFrom(this.http.post('/api/account/password',body).pipe(timeout(30000)));}
}
export function managementError(error:any):string {
  const messages:Record<string,string>={ADMIN_REQUIRED:'No tienes permisos de administrador.',REAUTHENTICATION_FAILED:'Tu contraseña no es correcta.',
    LAST_ADMIN:'Debe quedar al menos un administrador activo.',EMAIL_EXISTS:'Ya existe una cuenta con ese correo.',
    USER_CHANGED:'La cuenta cambió. Vuelve a la lista y revisa sus datos antes de guardar.',INVALID_EMAIL:'Revisa el correo.',
    INVALID_PASSWORD:'La contraseña debe tener entre 15 y 256 caracteres.',USER_NOT_FOUND:'La cuenta ya no está disponible.',
    USER_MANAGEMENT_DISABLED:'La gestión de usuarios no está habilitada en este servidor.'};
  if(error?.status===429)return 'Demasiados intentos. Espera un minuto antes de repetir.';
  return messages[error?.error?.code]??'No se pudo completar la operación. Revisa el estado antes de reintentar.';
}
