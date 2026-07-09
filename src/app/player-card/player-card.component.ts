import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

interface FaceDescriptor {
  baseFaceId?: number; skinTone?: number; hairStyle?: number; hairColor?: number; eyeColor?: number;
  faceShape?: number; noseShape?: number; eyeShape?: number; mouthShape?: number; browShape?: number;
  species?: string;
}
interface PlayerCard {
  playerId: number; name: string; position: string; overall: number;
  pac: number; sho: number; pas: number; dri: number; def: number; phy: number;
  age: number; nationId?: number; faceDescriptor?: FaceDescriptor;
}

@Component({
  selector: 'app-player-card',
  templateUrl: './player-card.component.html',
  styleUrls: ['./player-card.component.css']
})
export class PlayerCardComponent implements OnInit {
  card?: PlayerCard;
  loading = true;
  notFound = false;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => {
      const id = p.get('playerId');
      if (id) this.fetch(+id);
    });
  }

  private fetch(playerId: number): void {
    this.loading = true;
    this.notFound = false;
    this.http.get<PlayerCard>(`${urlApp}/humans/${playerId}/card`).subscribe({
      next: (c) => { this.card = c || undefined; this.notFound = !c; this.loading = false; },
      error: () => { this.notFound = true; this.loading = false; }
    });
  }

  get face(): FaceDescriptor { return this.card?.faceDescriptor || {}; }
}
