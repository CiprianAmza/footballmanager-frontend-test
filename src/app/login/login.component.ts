import { Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { AuthService, CareerRole } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {

  @Output() loggedIn = new EventEmitter<void>();

  mode: 'login' | 'register' = 'login';
  username = '';
  password = '';
  email = '';
  displayName = '';
  careerRole: CareerRole = 'MANAGER';
  loading = false;
  error = '';

  constructor(
    private authService: AuthService,
    private adminService: AdminService,
    private router: Router
  ) {}

  submit(): void {
    if (!this.username.trim() || !this.password) {
      this.error = 'Username and password are required.';
      return;
    }
    if (this.mode === 'register') {
      this.register();
      return;
    }
    this.startLogin();
  }

  switchMode(): void {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.error = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.submit();
  }

  private register(): void {
    if (!this.email.trim() || !this.displayName.trim() || this.password.length < 10) {
      this.error = 'Use a valid email, display name and a password of at least 10 characters.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.authService.register({
      username: this.username.trim(),
      email: this.email.trim(),
      password: this.password,
      displayName: this.displayName.trim(),
      careerRole: this.careerRole
    }).subscribe({
      next: result => {
        if (result.success) this.startLogin();
        else this.finishWithError(result.error || 'Registration failed.');
      },
      error: err => this.finishWithError(err?.error?.error || 'Registration failed.')
    });
  }

  private startLogin(): void {
    this.loading = true;
    this.error = '';
    if (this.username.trim() === 'admin') {
      this.adminService.login('admin', this.password).subscribe({
        next: result => {
          this.loading = false;
          if (result.success && result.token) {
            this.adminService.storeToken(result.token);
            void this.router.navigateByUrl('/admin');
          } else {
            this.error = result.message || 'Invalid username or password.';
          }
        },
        error: err => this.finishWithError(
          err?.error?.message || err?.error?.error || 'Invalid username or password.'
        )
      });
      return;
    }
    this.authService.login(this.username.trim(), this.password).subscribe({
      next: result => {
        this.loading = false;
        if (result.success) this.loggedIn.emit();
        else this.error = result.error || 'Login failed.';
      },
      error: err => this.finishWithError(err?.error?.error || 'Invalid username or password.')
    });
  }

  private finishWithError(message: string): void {
    this.loading = false;
    this.error = message;
  }
}
