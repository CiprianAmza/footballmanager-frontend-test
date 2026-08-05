import { Component } from '@angular/core';
import { TeamService } from '../services/team.service';
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-ui-comparison',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './ui-comparison.component.html',
  styleUrls: ['./ui-comparison.component.css']
})
export class UiComparisonComponent {
  constructor(public team: TeamService) {}
}
