import { Component } from '@angular/core';

import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-tactic-page',
  templateUrl: './tactic-page.component.html',
  styleUrls: ['./tactic-page.component.css']
})
export class TacticPageComponent {

  players = [{"name": "Inexoa", "id": 1, "positionNumber": 25, "position": "ST", "age": 21, "imageUrl": "www.google.com", "currentAbility": 100}];

}
