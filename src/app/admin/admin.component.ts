import { Component } from '@angular/core';
import { AdminService } from '../services/admin.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent {

  // Login state
  username = '';
  password = '';
  loginError = '';
  loginLoading = false;

  constructor(public adminService: AdminService) {}

  login(): void {
    if (!this.username || !this.password) {
      this.loginError = 'Username and password required';
      return;
    }
    this.loginLoading = true;
    this.loginError = '';
    this.adminService.login(this.username, this.password).subscribe({
      next: (res) => {
        this.loginLoading = false;
        if (res.success && res.token) {
          this.adminService.storeToken(res.token);
        } else {
          this.loginError = res.message || 'Login failed';
        }
      },
      error: (err) => {
        this.loginLoading = false;
        this.loginError = err?.error?.message || 'Invalid credentials';
      }
    });
  }

  logout(): void {
    this.adminService.logout();
  }
}
