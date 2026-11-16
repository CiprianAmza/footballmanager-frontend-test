/**
 * Build switch for Tactic Arena. The `simulator` build (angular.json) replaces this file with
 * `arena-env.simulator.ts`: the UI is then served by the Arena backend itself, calls its routes
 * on the page's own origin and opens straight on /tactic-arena, without the game's login.
 */
export const ARENA_SAME_ORIGIN = false;
