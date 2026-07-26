import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MULTIPLAYER_API_BASE } from '../multiplayer/multiplayer-api';
import { MultiplayerState } from '../multiplayer/multiplayer.models';

@Injectable({ providedIn: 'root' })
export class MultiplayerRoomService {
  private readonly base = MULTIPLAYER_API_BASE;
  constructor(private http: HttpClient) {}
  state(): Observable<MultiplayerState> { return this.http.get<MultiplayerState>(this.base + '/room/state'); }
  create(body: any): Observable<MultiplayerState> { return this.http.post<MultiplayerState>(this.base + '/room', body); }
  join(password: string): Observable<MultiplayerState> { return this.http.post<MultiplayerState>(this.base + '/room/join', { password }); }
  settings(body: any): Observable<MultiplayerState> { return this.http.patch<MultiplayerState>(this.base + '/room/settings', body); }
  ready(value: boolean): Observable<MultiplayerState> { return value ? this.http.post<MultiplayerState>(this.base + '/room/ready', {}) : this.http.delete<MultiplayerState>(this.base + '/room/ready'); }
  start(): Observable<MultiplayerState> { return this.http.post<MultiplayerState>(this.base + '/room/start', {}); }
  leave(): Observable<any> { return this.http.post<any>(this.base + '/room/leave', {}); }
  continue(): Observable<MultiplayerState> { return this.http.post<MultiplayerState>(this.base + '/room/continue', {}); }
  withdraw(): Observable<MultiplayerState> { return this.http.delete<MultiplayerState>(this.base + '/room/continue'); }
  fastForward(enabled: boolean, seasons = 1): Observable<MultiplayerState> { return this.http.post<MultiplayerState>(this.base + '/room/fast-forward', { enabled, seasons }); }
}
