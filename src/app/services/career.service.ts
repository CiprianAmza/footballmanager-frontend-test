import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface JobOffer {
  id: number;
  userId: number;
  teamId: number;
  teamName: string;
  teamReputation: number;
  offeredWage: number;
  signingBonus: number;
  contractLengthSeasons: number;
  pitch: string;
  seasonOffered: number;
  dayOffered: number;
  expiresOnDay: number;
  status: string;
  currentTeamId: number;
}

export interface CareerMe {
  userId: number;
  managerId: number;
  teamId: number;
  lastTeamId: number;
  fired: boolean;
  hasPendingOffer: boolean;
}

/**
 * Owns the user's career data: pending job offers + resign action.
 * A BehaviorSubject of pending offers means any component (app banner,
 * inbox modal, manager profile) can subscribe and react instantly.
 */
@Injectable({ providedIn: 'root' })
export class CareerService {

  private pendingOffersSubject = new BehaviorSubject<JobOffer[]>([]);
  pendingOffers$ = this.pendingOffersSubject.asObservable();

  constructor(private http: HttpClient) {}

  /** Refresh the pending-offers list (called after advance / inbox open / accept-decline). */
  refresh(): void {
    this.http.get<JobOffer[]>(urlApp + '/career/pendingOffers').subscribe({
      next: (offers) => this.pendingOffersSubject.next(offers || []),
      error: () => this.pendingOffersSubject.next([])
    });
  }

  get currentPending(): JobOffer[] {
    return this.pendingOffersSubject.value;
  }

  accept(offerId: number): Observable<any> {
    return this.http.post<any>(urlApp + `/career/offers/${offerId}/accept`, {});
  }
  decline(offerId: number): Observable<any> {
    return this.http.post<any>(urlApp + `/career/offers/${offerId}/decline`, {});
  }
  resign(): Observable<any> {
    return this.http.post<any>(urlApp + '/career/resign', {});
  }
  me(): Observable<CareerMe> {
    return this.http.get<CareerMe>(urlApp + '/career/me');
  }
}
