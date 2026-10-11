import {Component, DestroyRef, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../../services/auth.service';
import {ManagedUser, managementError, UserManagementService} from '../../services/user-management.service';

@Component({selector:'app-users',imports:[FormsModule,DatePipe],changeDetection:ChangeDetectionStrategy.Default,templateUrl:'./users.component.html',styleUrl:'./users.component.scss'})
export class UsersComponent implements OnInit {
  private api=inject(UserManagementService);private auth=inject(AuthService);private destroy=inject(DestroyRef);private request=0;
  items:ManagedUser[]=[];next:string|null=null;before?:string;q='';state='';loading=false;saving=false;error='';notice='';
  editing=false;selected?:ManagedUser;action='edit';email='';isActive=true;isAdmin=false;password='';confirmation='';adminPassword='';
  constructor(){this.destroy.onDestroy(()=>{this.request++;this.password='';this.confirmation='';this.adminPassword='';});}
  ngOnInit(){void this.load();}
  async load(before?:string){
    const request=++this.request;this.loading=true;this.error='';
    try{const page=await this.api.list(this.q,this.state,before);if(request!==this.request)return;this.items=page.items;this.next=page.next;this.before=before;}
    catch(error){if(request===this.request)this.error=managementError(error);}
    finally{if(request===this.request)this.loading=false;}
  }
  edit(user?:ManagedUser){
    this.selected=user;this.editing=true;this.action='edit';this.email=user?.email??'';this.isActive=user?.isActive??true;this.isAdmin=user?.isAdmin??false;
    this.password='';this.confirmation='';this.adminPassword='';this.error='';this.notice='';
  }
  cancel(){if(this.saving)return;this.editing=false;this.selected=undefined;this.password='';this.confirmation='';this.adminPassword='';void this.load(this.before);}
  changeAction(){this.password='';this.confirmation='';this.adminPassword='';this.error='';}
  async save(){
    if(this.saving)return;
    const needsPassword=!this.selected||this.action==='password';
    if(needsPassword&&this.password!==this.confirmation){this.error='Las contraseñas no coinciden.';return;}
    const body:any={adminPassword:this.adminPassword};
    if(this.selected)body.expectedRevision=this.selected.revision;
    if(!this.selected||this.action==='edit')Object.assign(body,{email:this.email,isAdmin:this.isAdmin,isActive:this.isActive});
    if(needsPassword)body.password=this.password;
    this.saving=true;this.error='';
    try{
      const result=await this.api.save(this.selected?.id,this.action,body);if(this.destroy.destroyed)return;
      if(result.selfRevoked){this.auth.expireSession();return;}
      this.editing=false;this.selected=undefined;this.notice='Cambios guardados.';await this.load(this.before);
    }catch(error){if(!this.destroy.destroyed)this.error=managementError(error);}
    finally{this.saving=false;this.adminPassword='';this.password='';this.confirmation='';}
  }
}
