import { Component, OnInit } from '@angular/core';
import { CompetitionIntelligenceService, CoefficientWorkspace, CountryCoefficient } from '../services/competition-intelligence.service';
import { TeamService } from '../services/team.service';

@Component({ selector: 'app-coefficients3', templateUrl: './coefficients3.component.html', styleUrls: ['../coefficients-lab.css'] })
export class Coefficients3Component implements OnInit {
  data?: CoefficientWorkspace;
  selected?: CountryCoefficient;
  loading = true;
  constructor(private intelligence: CompetitionIntelligenceService, private team: TeamService) {}
  ngOnInit(): void { this.intelligence.loadWorkspace(this.team.currentSeason || 1).subscribe({ next: data => { this.data = data; this.selected = data.countries[0]; this.loading = false; }, error: () => this.loading = false }); }
  keys(row: CountryCoefficient): number[] { return Object.keys(row.perSeason || {}).map(Number).sort((a, b) => a - b); }
  max(row: CountryCoefficient): number { return Math.max(...Object.values(row.perSeason || {}), 1); }
}
