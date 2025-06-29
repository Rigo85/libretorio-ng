import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from "@angular/core";
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { XsrfInterceptor } from "(src)/app/interceptors/xsrf.interceptor";

export const appConfig: ApplicationConfig = {
  providers: [
	  provideZoneChangeDetection({ eventCoalescing: true }),
	  provideRouter(routes),
	  provideHttpClient(withInterceptorsFromDi()),
	  {
		  provide: HTTP_INTERCEPTORS,
		  useClass: XsrfInterceptor,
		  multi: true
	  },
	  importProvidersFrom([BrowserAnimationsModule])
  ]
};
