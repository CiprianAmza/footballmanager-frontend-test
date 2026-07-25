export interface MultiplayerMember { userId: number; teamId: number; ready: boolean; fastForwardEnabled: boolean; }
export interface MultiplayerState {
  currentUserId: number; currentMember: MultiplayerMember | null;
  status: 'LOBBY' | 'ACTIVE' | 'CLOSED'; roomId: number; hostUserId: number;
  continueThresholdPercent: number; dayTimeoutSeconds: number; majorityTimeoutSeconds: number; maxPlayers: number;
  members: MultiplayerMember[]; votes: number; totalPlayers: number; requiredVotes: number; currentUserVoted: boolean;
  dayDeadline?: string; majorityDeadline?: string; effectiveDeadline?: string; fastForwardCount: number; allFastForward: boolean;
  season: number; day: number; blocker: { code: string; message?: string };
}
