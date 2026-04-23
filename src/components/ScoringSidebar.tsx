'use client';

import { MockScoringConfig, MockScoringTier } from '@/lib/db/schema';

function getTierForPick(pickNum: number, tiers: MockScoringTier[]): MockScoringTier | null {
  return tiers.find(t => pickNum >= t.pickStart && pickNum <= t.pickEnd) || null;
}

interface Props {
  config: MockScoringConfig;
  nextPickNum: number | null;
}

export default function ScoringSidebar({ config, nextPickNum }: Props) {
  const currentTier = nextPickNum !== null ? getTierForPick(nextPickNum, config.tiers) : null;
  const lateRoundActive =
    config.lateRoundBonus.enabled &&
    nextPickNum !== null &&
    nextPickNum >= config.lateRoundBonus.threshold;

  return (
    <div className="space-y-4">
      {/* Current slot callout */}
      {nextPickNum !== null && currentTier && (
        <div className="bg-gradient-to-br from-primary to-primary-light text-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-white/70 uppercase tracking-wide">On the Clock</p>
          <p className="text-3xl font-black leading-none mt-0.5">#{nextPickNum}</p>
          <p className="text-xs text-white/80 mt-1">{currentTier.label}</p>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm">Exact pick</span>
              <span className="text-lg font-bold">{currentTier.exactPick}</span>
            </div>
            {currentTier.within1 > 0 && (
              <div className="flex items-center justify-between text-white/90">
                <span className="text-sm">Within 1 slot</span>
                <span className="text-base font-bold">{currentTier.within1}</span>
              </div>
            )}
            {currentTier.within2 > 0 && (
              <div className="flex items-center justify-between text-white/80">
                <span className="text-sm">Within 2 slots</span>
                <span className="text-base font-bold">{currentTier.within2}</span>
              </div>
            )}
          </div>
          {lateRoundActive && (
            <div className="mt-3 bg-white/15 rounded-lg px-3 py-2">
              <p className="text-xs text-white/80 uppercase tracking-wide">Late-round bonus</p>
              <p className="text-sm">
                <span className="font-bold">+{config.lateRoundBonus.points}</span> if correct player,
                off by any amount
              </p>
            </div>
          )}
        </div>
      )}

      {/* Full tier table */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <p className="text-xs text-muted uppercase tracking-wide font-semibold mb-3">
          Mock Draft Scoring
        </p>
        <div className="space-y-2">
          {config.tiers.map(tier => {
            const isCurrent = currentTier?.label === tier.label;
            return (
              <div
                key={tier.label}
                className={`rounded-lg p-2.5 border ${
                  isCurrent
                    ? 'border-primary bg-primary/5'
                    : 'border-card-border bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                    {tier.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      now
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-[10px] text-muted uppercase">Exact</div>
                    <div className="text-sm font-bold">{tier.exactPick}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase">±1</div>
                    <div className="text-sm font-bold text-muted">{tier.within1}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase">±2</div>
                    <div className="text-sm font-bold text-muted">{tier.within2}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {config.lateRoundBonus.enabled && config.lateRoundBonus.points > 0 && (
          <div className="mt-3 pt-3 border-t border-card-border">
            <p className="text-xs text-muted">
              <span className="font-semibold text-foreground">Late-round bonus:</span>{' '}
              +{config.lateRoundBonus.points} pt{config.lateRoundBonus.points === 1 ? '' : 's'} if you
              mock the right player at pick {config.lateRoundBonus.threshold}+ (any slot, no ±2 cap)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
