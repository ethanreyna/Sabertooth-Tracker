import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TonedBadge } from '@/components/bits';
import { computePayout } from '@/lib/payout';
import { sep } from '@/lib/format';
import type { Job } from '@/types';

const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.01 ? 2 : 1)}%`;

/** Who has earned what of a collection job's septim reward. */
export function PayoutSplit({ job, cutPct }: { job: Job; cutPct: number }) {
  const p = useMemo(() => computePayout(job, cutPct), [job, cutPct]);

  if (p.reward <= 0) return null;

  if (p.totalRequired === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add items with quantities above to split the {sep(p.reward)} septim reward by contribution.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Reward', value: sep(p.reward) },
          { label: `Guild cut (${p.cutPct}%)`, value: sep(p.guildCut) },
          { label: 'Player pool', value: sep(p.pool) },
          { label: 'Earned so far', value: sep(p.paid) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-muted/30 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="w-28 text-right">Credited</TableHead>
              <TableHead className="w-24 text-right">Share</TableHead>
              <TableHead className="w-28 text-right">Septims</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.rows.map((r) => (
              <TableRow key={r.member}>
                <TableCell className="font-medium">
                  {r.member}
                  {r.surplus > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      +{sep(r.surplus)} surplus
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{sep(r.credited)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.share)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{sep(r.septims)}</TableCell>
              </TableRow>
            ))}
            {p.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-5 text-center text-muted-foreground">
                  No turn-ins yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <TonedBadge tone={p.completion >= 1 ? 'green' : 'amber'}>
          {pct(Math.min(1, p.completion))} complete
        </TonedBadge>
        {p.unearned > 0 && <span>{sep(p.unearned)} septims of the pool not yet earned.</span>}
        {p.completion >= 1 && <span>Job fully delivered — the whole pool is allocated.</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        Shares are the fraction of the requested totals each member delivered, so a finished job pays
        out the full pool. Credit is capped at the requested quantity and given oldest turn-in first;
        anything past the target, or not on the list, counts as surplus and earns nothing. The guild's
        {' '}{p.cutPct}% cut is set under the gear icon.
      </p>
    </div>
  );
}
