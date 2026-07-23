import { Component } from '@angular/core';

@Component({
  selector: 'app-boardroom-hub',
  templateUrl: './boardroom-hub.component.html',
  styleUrls: ['./boardroom.component.css']
})
export class BoardroomHubComponent {

  pages = [
    { route: '/economy', icon: 'bi-cash-stack', title: 'Personal Economy',
      desc: 'Open the reviewed, canonical economy experience.' }
  ];
}
