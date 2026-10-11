import { AfterViewInit, OnInit, Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { NavigationStart, Router,RouterLink } from "@angular/router";

import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";
import { SearchTextService } from "(src)/app/services/search-text.service";
import { AuthService } from "(src)/app/services/auth.service";
import {ReadingService} from '../../services/reading.service';
import {LibraryNavigationService} from '../../services/library-navigation.service';
import {UserManagementService} from '../../services/user-management.service';

@Component({
	selector: "header-panel",
	imports: [
		RouterLink,
		FormsModule,
		NgxSpinnerModule
	],
	templateUrl: "./header-panel.component.html",
	changeDetection: ChangeDetectionStrategy.Eager,
	styleUrl: "./header-panel.component.scss"
})
export class HeaderPanelComponent implements OnInit, AfterViewInit {
	private destroyRef = inject(DestroyRef);
		private readingStore=inject(ReadingService);
		readonly navigation=inject(LibraryNavigationService);
		private element=inject(ElementRef<HTMLElement>);
		readingAvailable=false;
		private management=inject(UserManagementService);
		managementEnabled=false;
		canManageUsers=false;
		get inAccount(){return /^\/(usuarios|cuenta)(?:[/?#]|$)/.test(this.router.url);}
		accountOpen=false;
		@ViewChild('accountControls') private accountControls?: ElementRef<HTMLElement>;
		@ViewChild('accountToggle') private accountToggle?: ElementRef<HTMLButtonElement>;
		sidebarExpanded=false;

	constructor(
		private booksService: BooksService,
		private collapseState: CollapseStateService,
		private spinner: NgxSpinnerService,
		private searchTextService: SearchTextService,
		private authService: AuthService,
		private router: Router
	) {}

	ngOnInit(): void {
		this.sidebarExpanded = window.innerWidth >= 768;
		this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event=>{
			if(event instanceof NavigationStart)this.accountOpen=false;
		});
	}

	toggleAccount(): void {
		if(!this.accountOpen)this.closeSidebar(false);
		this.accountOpen=!this.accountOpen;
	}

	closeAccount(): void { this.accountOpen=false; }

	onAccountFocusOut(event: FocusEvent): void {
		if(!this.accountControls?.nativeElement.contains(event.relatedTarget as Node | null))this.closeAccount();
	}

	@HostListener('document:click', ['$event'])
	onDocumentClick(event: MouseEvent): void {
		if(!this.accountControls?.nativeElement.contains(event.target as Node))this.closeAccount();
	}

	@HostListener('document:keydown.escape', ['$event'])
	onAccountEscape(event: Event): void {
		if(!this.accountOpen){
			if(window.innerWidth<768&&this.sidebarExpanded){event.preventDefault();this.closeSidebar();}
			return;
		}
		event.preventDefault();
		this.closeAccount();
		this.accountToggle?.nativeElement.focus();
	}

	ngAfterViewInit(): void {
		void this.management.identity().then(me=>{if(this.destroyRef.destroyed)return;this.managementEnabled=!!me.userManagementEnabled;this.canManageUsers=this.managementEnabled&&me.isAdmin;}).catch(()=>{});
		void this.readingStore.identity().then(value=>this.readingAvailable=!!value).catch(()=>{});
			this.applySidebarVisibility();
			const container=this.element.nativeElement.closest('main')??this.element.nativeElement.parentElement;
			const resize=new ResizeObserver(()=>container?.style.setProperty('--app-header-height',`${this.element.nativeElement.getBoundingClientRect().height}px`));
			resize.observe(this.element.nativeElement);
			this.destroyRef.onDestroy(()=>{resize.disconnect();container?.style.removeProperty('--app-header-height');});

		this.searchTextService.reset$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(reset => {
				if (reset) {
					this.booksService.onBooksList(this.collapseState.lastHash);
				}
			});
	}

	logout(): void {
		this.closeAccount();
		this.spinner.show();
		this.authService.logout().subscribe({
			next: () => {
				// console.info("Logout successful");
				this.router.navigate(["/auth/login"]);
				this.spinner.hide();
				this.booksService.logAction("Logout");
			},
			error: (err: any) => {
				console.error("Logout failed", err);
				this.spinner.hide();
			}
		});
	}

	onKeyDown($event: KeyboardEvent) {
		if ($event.key === "Enter") {
			$event.preventDefault();
			this.handleEnter();
		} else if ($event.key === "Escape") {
			this.handleEscape();
		}
	}

	get searchText(): string {
		return this.searchTextService.searchText;
	}

	set searchText(value: string) {
		this.searchTextService.setSearchText(value, false)
	}

	handleEnter(): void {
		void this.router.navigate(['/buscar'],{queryParams:{q:this.searchText.trim()||null}});
	}
	advancedSearch():void{void this.router.navigate(['/buscar'],{queryParams:{q:this.searchText.trim()||null,advanced:'1'}});}

	handleEscape(): void {
		this.searchText = "";
	}

	@HostListener("window:resize")
	onResize(): void {
		this.handleSidebar();
	}

	handleSidebar(): void {
		this.sidebarExpanded = window.innerWidth >= 768;
		this.applySidebarVisibility();
	}

	private applySidebarVisibility(): void {
		const sidebar = document.getElementById("sidebar");
		const sidebarToggle = document.getElementById("sidebarToggle");
		sidebar?.classList.toggle("d-none", !this.sidebarExpanded);

		if (window.innerWidth < 768) {
			sidebarToggle?.classList.remove("d-none");
		} else {
				sidebarToggle?.classList.add("d-none");
			}
	}

	toggleSidebar(): void {
		this.closeAccount();
		const sidebar = document.getElementById("sidebar");
			sidebar?.classList.toggle("d-none");
			this.sidebarExpanded=!!sidebar&&!sidebar.classList.contains('d-none');
	}

	closeSidebar(restoreFocus=true):void {
		if(window.innerWidth>=768)return;
		this.sidebarExpanded=false;this.applySidebarVisibility();
		if(restoreFocus)(this.element.nativeElement.querySelector('#sidebarToggle') as HTMLButtonElement|null)?.focus();
	}
}
