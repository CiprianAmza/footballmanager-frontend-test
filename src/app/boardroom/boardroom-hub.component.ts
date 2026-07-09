import { Component } from '@angular/core';

@Component({
  selector: 'app-boardroom-hub',
  templateUrl: './boardroom-hub.component.html',
  styleUrls: ['./boardroom.component.css']
})
export class BoardroomHubComponent {

  pages = [
    { route: '/boardroom/wealth', icon: 'bi-cash-stack', title: 'Wealth',
      desc: 'Browse managers and their personal fortunes, reputation and owned clubs.' },
    { route: '/boardroom/assets', icon: 'bi-houses', title: 'Personal Assets',
      desc: 'Buy and sell houses, cars and club shares.' },
    { route: '/boardroom/ownership', icon: 'bi-building', title: 'Ownership',
      desc: 'Manage clubs you own — invest or withdraw money.' },
    { route: '/boardroom/coach-control', icon: 'bi-sliders', title: 'Coach Control',
      desc: 'As owner, set what the coach may do — transfers, XI, tactics, training — and cap his budget.' }
  ];
}
