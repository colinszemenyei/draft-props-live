// Mock Draft Scoring Engine
// Compares each user's 32-pick mock draft against actual draft results
// Awards points based on configurable pick-range tiers

import { sqlite } from '../db';
import { v4 as uuid } from 'uuid';
import { MockScoringConfig, MockScoringTier } from '../db/schema';

interface DraftPick {
  pickNumber: number;
  playerName: string;
}

export const DEFAULT_CONFIG: MockScoringConfig = {
  tiers: [
    { label: 'Picks 1-5', pickStart: 1, pickEnd: 5, exactPick: 3, within1: 1, within2: 0 },
    { label: 'Picks 6-15', pickStart: 6, pickEnd: 15, exactPick: 5, within1: 2, within2: 1 },
    { label: 'Picks 16-25', pickStart: 16, pickEnd: 25, exactPick: 7, within1: 3, within2: 1 },
    { label: 'Picks 26-32', pickStart: 26, pickEnd: 32, exactPick: 10, within1: 5, within2: 2 },
  ],
  lateRoundBonus: { enabled: true, threshold: 20, points: 2 },
};

function normalizePlayerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\bjr\.?\b/gi, '')
    .replace(/\biii\b/gi, '')
    .replace(/\bii\b/gi, '')
    .replace(/[.,]/g, '')
    .trim();
}

function getTierForPick(pickNumber: number, tiers: MockScoringTier[]): MockScoringTier | null {
  return tiers.find(t => pickNumber >= t.pickStart && pickNumber <= t.pickEnd) || null;
}

export function scoreMockDraft(
  mockPicks: Record<string, string>,
  actualPicks: DraftPick[],
  config: MockScoringConfig = DEFAULT_CONFIG,
): {
  totalPoints: number;
  exactMatches: number;
  within1: number;
  within2: number;
  lateRoundHits: number;
  pickDetails: Array<{
    pickNumber: number;
    mockedPlayer: string;
    actualPlayer: string;
    points: number;
    matchType: string;
    tierLabel: string;
  }>;
} {
  let totalPoints = 0;
  let exactMatches = 0;
  let within1Count = 0;
  let within2Count = 0;
  let lateRoundHits = 0;
  const pickDetails: Array<{
    pickNumber: number;
    mockedPlayer: string;
    actualPlayer: string;
    points: number;
    matchType: string;
    tierLabel: string;
  }> = [];

  // Build actual pick lookups
  const actualPlayerToPick = new Map<string, number>();
  const actualPickToPlayer = new Map<number, string>();
  for (const pick of actualPicks) {
    actualPlayerToPick.set(normalizePlayerName(pick.playerName), pick.pickNumber);
    actualPickToPlayer.set(pick.pickNumber, pick.playerName);
  }

  // Score each mock pick
  for (const [pickStr, mockedPlayer] of Object.entries(mockPicks)) {
    const mockPickNum = Number(pickStr);
    if (!mockedPlayer || isNaN(mockPickNum)) continue;

    const actualPlayer = actualPickToPlayer.get(mockPickNum) || '';
    const actualPickForMockedPlayer = actualPlayerToPick.get(normalizePlayerName(mockedPlayer));

    // Find which tier this mock pick falls into
    const tier = getTierForPick(mockPickNum, config.tiers);
    const tierLabel = tier?.label || '';

    let points = 0;
    let matchType = 'miss';

    if (actualPickForMockedPlayer !== undefined) {
      const diff = Math.abs(mockPickNum - actualPickForMockedPlayer);

      if (diff === 0 && tier) {
        points = tier.exactPick;
        matchType = 'exact';
        exactMatches++;
      } else if (diff === 1 && tier && tier.within1 > 0) {
        points = tier.within1;
        matchType = 'within1';
        within1Count++;
      } else if (diff === 2 && tier && tier.within2 > 0) {
        points = tier.within2;
        matchType = 'within2';
        within2Count++;
      }

      // Late-round bonus: player mocked at threshold+ and actually went threshold+
      if (
        points === 0 &&
        config.lateRoundBonus.enabled &&
        config.lateRoundBonus.points > 0 &&
        mockPickNum >= config.lateRoundBonus.threshold &&
        actualPickForMockedPlayer >= config.lateRoundBonus.threshold
      ) {
        points = config.lateRoundBonus.points;
        matchType = 'late_round';
        lateRoundHits++;
      }
    }

    totalPoints += points;
    pickDetails.push({
      pickNumber: mockPickNum,
      mockedPlayer,
      actualPlayer,
      points,
      matchType,
      tierLabel,
    });
  }

  pickDetails.sort((a, b) => a.pickNumber - b.pickNumber);

  return { totalPoints, exactMatches, within1: within1Count, within2: within2Count, lateRoundHits, pickDetails };
}

export function scoreAllMockDrafts(year: number) {
  // Load config
  const yearData = sqlite.prepare('SELECT mock_scoring_config FROM draft_years WHERE year = ?').get(year) as { mock_scoring_config: string } | undefined;
  let config: MockScoringConfig;
  try {
    config = yearData?.mock_scoring_config
      ? (typeof yearData.mock_scoring_config === 'string' ? JSON.parse(yearData.mock_scoring_config) : yearData.mock_scoring_config)
      : DEFAULT_CONFIG;
    // Validate it has the new tier structure
    if (!config.tiers || !Array.isArray(config.tiers)) {
      config = DEFAULT_CONFIG;
    }
  } catch {
    config = DEFAULT_CONFIG;
  }

  // Load actual picks
  const actualPicks = sqlite.prepare(
    'SELECT pick_number, player_name FROM draft_picks WHERE year = ?'
  ).all(year) as Array<{ pick_number: number; player_name: string }>;

  const picks: DraftPick[] = actualPicks.map(p => ({
    pickNumber: p.pick_number,
    playerName: p.player_name,
  }));

  if (picks.length === 0) return;

  // Load all mock drafts
  const mocks = sqlite.prepare(`
    SELECT m.id, m.user_id, m.picks, u.display_name
    FROM mock_drafts m
    JOIN users u ON m.user_id = u.id
    WHERE m.year = ?
  `).all(year) as Array<{ id: string; user_id: string; picks: string; display_name: string }>;

  const stmt = sqlite.transaction(() => {
    for (const mock of mocks) {
      const mockPicks = typeof mock.picks === 'string' ? JSON.parse(mock.picks) : mock.picks;
      const result = scoreMockDraft(mockPicks, picks, config);

      for (const detail of result.pickDetails) {
        const existing = sqlite.prepare(
          'SELECT id FROM mock_scores WHERE mock_draft_id = ? AND pick_number = ?'
        ).get(mock.id, detail.pickNumber) as { id: string } | undefined;

        if (existing) {
          sqlite.prepare(
            'UPDATE mock_scores SET points_earned = ?, match_type = ?, resolved_at = ? WHERE id = ?'
          ).run(detail.points, detail.matchType, new Date().toISOString(), existing.id);
        } else {
          sqlite.prepare(
            'INSERT INTO mock_scores (id, mock_draft_id, pick_number, points_earned, match_type, resolved_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(uuid(), mock.id, detail.pickNumber, detail.points, detail.matchType, new Date().toISOString());
        }
      }
    }
  });

  stmt();
}

export function getMockLeaderboard(year: number): Array<{
  userId: string;
  displayName: string;
  mockPoints: number;
  exactMatches: number;
  totalScored: number;
}> {
  const results = sqlite.prepare(`
    SELECT
      u.id,
      u.display_name,
      COALESCE(SUM(ms.points_earned), 0) as mock_points,
      COALESCE(SUM(CASE WHEN ms.match_type = 'exact' THEN 1 ELSE 0 END), 0) as exact_matches,
      COUNT(ms.id) as total_scored
    FROM mock_drafts m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN mock_scores ms ON ms.mock_draft_id = m.id
    WHERE m.year = ?
    GROUP BY u.id, u.display_name
    ORDER BY mock_points DESC, exact_matches DESC, u.display_name ASC
  `).all(year) as Array<Record<string, unknown>>;

  return results.map(r => ({
    userId: r.id as string,
    displayName: r.display_name as string,
    mockPoints: r.mock_points as number,
    exactMatches: r.exact_matches as number,
    totalScored: r.total_scored as number,
  }));
}
