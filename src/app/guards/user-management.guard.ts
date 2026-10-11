import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {UserManagementService} from '../services/user-management.service';

export const userManagementGuard:CanActivateFn=async route=>{
  const router=inject(Router),service=inject(UserManagementService);
  try{const me=await service.identity();return !!me.userManagementEnabled&&(!route.data['admin']||me.isAdmin)||router.parseUrl('/inicio');}
  catch{return router.parseUrl('/inicio');}
};
