import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { TeamService } from './team.service';

/**
 * Domains of game state that pages render. A mutation emits the domain(s) it
 * touched; pages subscribe to the domain(s) they show and reload reactively.
 */
export type GameDomain =
  | 'squad'
  | 'finances'
  | 'training'
  | 'transfers'
  | 'standings'
  | 'injuries'
  | 'staff'
  | 'tactics'
  | 'youth'
  | 'stadium'
  | 'scouting';

const ALL_DOMAINS: GameDomain[] = [
  'squad', 'finances', 'training', 'transfers', 'standings',
  'injuries', 'staff', 'tactics', 'youth', 'stadium', 'scouting',
];

/**
 * Lightweight, app-wide reactive event bus. Lets any action that mutates game
 * state notify the rest of the app so pages update live without a manual
 * refresh. Builds on the existing TeamService.refresh$ (which fires on game
 * advance / press-conference responses): a game advance can change everything,
 * so it fans out to every domain.
 */
@Injectable({ providedIn: 'root' })
export class GameEventsService {

  private readonly subjects = new Map<GameDomain, Subject<void>>(
    ALL_DOMAINS.map(d => [d, new Subject<void>()] as [GameDomain, Subject<void>])
  );

  /** Fires after any game advance / continue. */
  private readonly advancedSubject = new Subject<void>();
  readonly gameAdvanced$ = this.advancedSubject.asObservable();

  constructor(private teamService: TeamService) {
    // A CONTINUE / press-conference response can change any domain — fan out.
    this.teamService.refresh$.subscribe(() => {
      this.advancedSubject.next();
      this.subjects.forEach(s => s.next());
    });
  }

  /** Observable that fires whenever the given domain changes. */
  on(domain: GameDomain): Observable<void> {
    return this.subjects.get(domain)!.asObservable();
  }

  /** Notify that one or more domains changed (call after a mutation succeeds). */
  emit(...domains: GameDomain[]): void {
    domains.forEach(d => this.subjects.get(d)?.next());
  }
}
