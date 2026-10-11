import {Component, inject, OnDestroy, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {UserManagementService, managementError} from '../../services/user-management.service';
import {AuthService} from '../../services/auth.service';

@Component({selector:'account-password',imports:[FormsModule],changeDetection:ChangeDetectionStrategy.Eager,styleUrl:'./users.component.scss',template:`
  <section class="users-page"><header class="users-heading"><h1>Cambiar contraseña</h1></header>
  @if(error){<p role="alert" class="text-warning">{{error}}</p>}
  <form class="user-editor" (ngSubmit)="save()"><fieldset [disabled]="saving">
    <label for="current-password">Contraseña actual</label><input id="current-password" class="form-control" type="password" name="current" [(ngModel)]="current" required maxlength="256" autocomplete="current-password">
    <label for="own-new-password">Nueva contraseña</label><input id="own-new-password" class="form-control" type="password" name="password" [(ngModel)]="password" required minlength="15" maxlength="256" autocomplete="new-password" aria-describedby="own-policy"><small id="own-policy">Entre 15 y 256 caracteres.</small>
    <label for="own-confirmation">Repetir nueva contraseña</label><input id="own-confirmation" class="form-control" type="password" name="confirmation" [(ngModel)]="confirmation" required minlength="15" maxlength="256" autocomplete="new-password">
    <p class="session-warning">Al guardar tendrás que iniciar sesión con la nueva contraseña.</p>
    <div class="editor-actions"><button class="btn btn-primary" type="submit"><i class="bi bi-check-lg" aria-hidden="true"></i>{{saving?'Guardando...':'Cambiar contraseña'}}</button></div>
  </fieldset></form></section>`})
export class AccountPasswordComponent implements OnDestroy {
  private api=inject(UserManagementService);private auth=inject(AuthService);current='';password='';confirmation='';error='';saving=false;
  ngOnDestroy(){this.current='';this.password='';this.confirmation='';}
  async save(){
    if(this.saving)return;if(this.password!==this.confirmation){this.error='Las contraseñas no coinciden.';return;}
    this.saving=true;this.error='';
    try{await this.api.password({currentPassword:this.current,password:this.password});this.auth.expireSession();}
    catch(error){this.error=managementError(error);}
    finally{this.saving=false;this.ngOnDestroy();}
  }
}
