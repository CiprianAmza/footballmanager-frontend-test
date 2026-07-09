import { Component, EventEmitter, Output } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {

  @Output() loggedIn = new EventEmitter<void>();

  username = '';
  loading = false;
  error = '';

  constructor(private authService: AuthService) {}

  submit(): void {
    if (!this.username.trim()) {
      this.error = 'Please enter a username.';
      return;
    }
    this.error = '';
    this.loading = true;

    this.authService.login(this.username.trim()).subscribe({
      next: (result) => {
        this.loading = false;
        if (result.success) {
          this.loggedIn.emit();
        } else {
          this.error = result.error || 'Login failed.';
        }
      },
      error: (err) => {
        console.error('Login error:', err);
        this.error = 'Could not connect to server. Is the backend running?';
        this.loading = false;
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.submit();
    }
  }
}
