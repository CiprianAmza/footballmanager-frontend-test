import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { urlApp } from '../app.component';

/**
 * Boardroom CoachPermissions for a team. The owner can revoke the coach's
 * right to pick the XI (`canPickXI=false`) and/or lock individual pitch slots
 * (`lockedSlots` — a JSON array persisted server-side). When a slot is locked
 * or XI-picking is disabled, the tactics pitch must show a 🔒 and disable
 * dragging/swapping for the affected token(s).
 */
export interface CoachPermissions {
  teamId?: number;
  canPickXI?: boolean;
  canBuyPlayers?: boolean;
  canSellPlayers?: boolean;
  canChangeFormationTactics?: boolean;
  lockedSlots?: string; // JSON string: [{positionIndex, playerId}]
  [k: string]: any;
}

export interface LockedSlot {
  positionIndex?: number;
  position?: string;
  playerId?: number;
}

/** Parsed, ready-to-query view of a team's XI permissions. */
export class CoachLockState {
  constructor(
    public readonly canPickXI: boolean,
    private readonly lockedByIndex: Set<number>,
    private readonly lockedByPosition: Set<string>
  ) {}

  /** A pitch slot is locked if XI picking is off, or this exact slot is pinned. */
  isSlotLocked(positionIndex: number, position?: string): boolean {
    if (!this.canPickXI) return true;
    if (this.lockedByIndex.has(positionIndex)) return true;
    if (position && this.lockedByPosition.has(position)) return true;
    return false;
  }

  get hasAnyLock(): boolean {
    return !this.canPickXI || this.lockedByIndex.size > 0 || this.lockedByPosition.size > 0;
  }
}

@Injectable({ providedIn: 'root' })
export class CoachPermissionsService {

  constructor(private http: HttpClient) {}

  /**
   * Fetch a team's permissions and resolve to a CoachLockState. Any error
   * (e.g. no boardroom for AI teams) degrades gracefully to "everything
   * unlocked" so the tactics pitch keeps working.
   */
  getLockState(teamId: number): Observable<CoachLockState> {
    return this.http.get<CoachPermissions>(urlApp + `/boardroom/permissions/${teamId}`).pipe(
      map((perm) => this.toLockState(perm)),
      catchError(() => of(new CoachLockState(true, new Set<number>(), new Set<string>())))
    );
  }

  private toLockState(perm: CoachPermissions | null): CoachLockState {
    const canPickXI = perm?.canPickXI !== false; // default true when missing
    const byIndex = new Set<number>();
    const byPos = new Set<string>();
    const raw = perm?.lockedSlots;
    if (raw) {
      try {
        const parsed: LockedSlot[] = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            if (s == null) continue;
            if (typeof s.positionIndex === 'number') byIndex.add(s.positionIndex);
            if (typeof s.position === 'string' && s.position) byPos.add(s.position);
          }
        }
      } catch {
        // malformed JSON: treat as no slot locks
      }
    }
    return new CoachLockState(canPickXI, byIndex, byPos);
  }
}
