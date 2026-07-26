export interface MultiplayerMember { userId: number; teamId: number | null; ready: boolean; fastForwardEnabled: boolean; }
export interface MultiplayerState {
  currentUserId: number; currentMember: MultiplayerMember | null;
  status: 'LOBBY' | 'ACTIVE' | 'CLOSED'; roomId: number; name: string; hostUserId: number;
  continueThresholdPercent: number; dayTimeoutSeconds: number; majorityTimeoutSeconds: number; maxPlayers: number; forceContinue: boolean;
  members: MultiplayerMember[]; votes: number; totalPlayers: number; requiredVotes: number; currentUserVoted: boolean;
  cycleStatus?: 'OPEN' | 'BLOCKED' | 'ADVANCING' | 'COMPLETED' | 'FAILED';
  dayDeadline?: string; majorityDeadline?: string; effectiveDeadline?: string; fastForwardCount: number; allFastForward: boolean;
  season: number; day: number; blocker: { code: string; message?: string };
  liveMatchKey?: string; liveMatchInteractive?: boolean;
  rapidStatus?: 'IDLE' | 'RUNNING' | 'CANCEL_PENDING'; rapidCurrentSeason?: number; rapidCurrentDay?: number; rapidTargetSeason?: number; rapidTargetDay?: number; rapidCancelPending?: boolean;
}
