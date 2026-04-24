// A "trade" in the prop-count sense = one transaction. A simple two-team
// swap (A's pick goes to B, B's pick goes to A) is ONE trade, not two —
// even though both pick slots look "traded" individually. This helper
// pairs up swap picks so we count them as a single event.

interface PickForTrade {
  pickNumber: number;
  team?: string;
  originalTeam?: string | null;
  isTrade?: boolean;
}

function normalizeTeam(t: string | null | undefined): string {
  return String(t || '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Returns the count of distinct trade TRANSACTIONS among the picks, pairing
 * up any two picks whose teams got swapped.
 *
 * Example: pick 11 (Dolphins original) goes to Cowboys, pick 12 (Cowboys
 * original) goes to Dolphins. Both picks have isTrade=true, but they
 * represent one transaction, so this returns 1.
 *
 * A team that traded up without a direct swap (e.g. gave up future picks)
 * is counted as one trade — no pair partner, one count.
 */
export function countDistinctTrades(picks: PickForTrade[]): number {
  const traded = picks.filter(p => p.isTrade && p.originalTeam);
  const paired = new Set<number>();
  let transactions = 0;

  for (let i = 0; i < traded.length; i++) {
    if (paired.has(traded[i].pickNumber)) continue;
    const a = traded[i];
    // Find a later pick that is A's exact swap partner
    const partnerIdx = traded.findIndex((b, j) =>
      j !== i &&
      !paired.has(b.pickNumber) &&
      normalizeTeam(b.team) === normalizeTeam(a.originalTeam) &&
      normalizeTeam(b.originalTeam) === normalizeTeam(a.team),
    );
    if (partnerIdx !== -1) {
      paired.add(a.pickNumber);
      paired.add(traded[partnerIdx].pickNumber);
      transactions += 1; // one transaction for the pair
    } else {
      transactions += 1; // solo trade (trade-up with future picks, etc.)
    }
  }
  return transactions;
}
