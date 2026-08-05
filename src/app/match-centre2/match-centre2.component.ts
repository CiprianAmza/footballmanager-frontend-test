import { Component, NgZone, OnInit, SimpleChange } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LiveMatchComponent } from '../live-match/live-match.component';
import { LiveMatchService } from '../services/live-match.service';
import { TeamService } from '../services/team.service';
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-match-centre2',
  standalone: true,
  imports: [SharedModule],
  templateUrl: '../live-match/live-match.component.html',
  styleUrls: ['../live-match/live-match.component.css', './match-centre2.component.css']
})
export class MatchCentre2Component extends LiveMatchComponent implements OnInit {
  constructor(
    teamService: TeamService,
    liveMatch: LiveMatchService,
    zone: NgZone,
    private route: ActivatedRoute) {
    super(teamService, liveMatch, zone);
  }

  ngOnInit(): void {
    const key = this.route.snapshot.paramMap.get('matchKey');
    if (!key) return;
    try { localStorage.setItem('fm_matchViewMode', 'PITCH_2D'); } catch { /* storage unavailable */ }
    this.interactive = this.route.snapshot.queryParamMap.get('interactive') !== '0';
    this.matchKey = key;
    this.ngOnChanges({ matchKey: new SimpleChange(null, key, true) });
  }
}
