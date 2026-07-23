import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-feature-unavailable',
  templateUrl: './feature-unavailable.component.html',
  styleUrls: ['./feature-unavailable.component.css']
})
export class FeatureUnavailableComponent implements OnInit {
  featureName = 'This feature';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.featureName = this.route.snapshot.data['featureName'] || this.featureName;
  }
}
