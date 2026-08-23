import type { FormEvent } from 'react';
import { ChevronDown, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CollectionProgress } from '@/components/collection-progress';
import { PayoutSplit } from '@/components/payout-split';
import { EmptyState, PriorityBadge, StatusBadge, TonedBadge } from '@/components/bits';
import { ALL_ITEM_NAMES } from '@/items';
import { collectedByItem } from '@/sync';
import { ago, dstr, sep } from '@/lib/format';
import { untilLabel } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import type { DB, JobStatus } from '@/types';

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
);

export function Jobs({ db, q, exp, setExp, memberNames, update, readOnly, onEdit }: {
  db: DB; q: string; exp: Record<string, boolean>;
  setExp: (fn: (s: Record<string, boolean>) => Record<string, boolean>) => void;
  memberNames: string[]; update: (fn: (d: DB) => void) => void;
  readOnly: boolean; onEdit: (jobId: string) => void;
}) {
  const ql = q.toLowerCase();
  const jobs = db.jobs
    .slice()
    .sort((a, b) => (b.postedAt || '').localeCompare(a.postedAt || ''))
    .filter((j) => !ql || `${j.name} ${j.client} ${j.tag} ${j.claimedBy} ${j.items.map((t) => t.item).join(' ')}`.toLowerCase().includes(ql));

  const addEntry = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const jobId = String(f.get('jobId'));
    const item = String(f.get('item') || '').trim();
    if (!item) return;
    const entry = {
      by: String(f.get('by') || '').trim() || 'Unknown',
      item,
      qty: Math.max(1, Number(f.get('qty') || 1)),
      at: new Date().toISOString(),
    };
    form.reset();
    update((d) => { const t = d.jobs.find((x) => x.id === jobId); if (t) t.entries.push(entry); });
  };

  if (jobs.length === 0) {
    return <EmptyState>{readOnly ? 'No jobs to show.' : 'No jobs match. Post one with New job.'}</EmptyState>;
  }

  return (
    <div className="space-y-2.5">
      {jobs.map((j) => {
        const collected = collectedByItem(j);
        const met = j.items.filter((t) => t.qty > 0 && (collected.get(t.item.trim().toLowerCase()) || 0) >= t.qty).length;
        const isOpen = !!exp[j.id];
        const due = untilLabel(j.deadline);

        return (
          <Card key={j.id} className="overflow-hidden py-0">
            <button
              type="button"
              onClick={() => setExp((s) => ({ ...s, [j.id]: !s[j.id] }))}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{j.name}</span>
                  <TonedBadge tone="neutral">{j.tag}</TonedBadge>
                  <PriorityBadge priority={j.priority} />
                  {j.collection && (
                    <TonedBadge tone="blue">
                      Collection · {j.items.length ? `${met}/${j.items.length} items done` : `${j.entries.length} turn-ins`}
                    </TonedBadge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  For {j.client || 'unspecified'} · posted by {j.postedBy || 'unknown'} · {ago(j.postedAt)}
                  {j.deadline ? ` · due ${dstr(j.deadline)}` : ''}
                  {due && j.status !== 'done' && (
                    <span className={cn(
                      'ml-1 font-medium',
                      due.overdue ? 'text-red-600 dark:text-red-400'
                        : due.soon ? 'text-amber-600 dark:text-amber-400' : '',
                    )}>
                      ({due.text})
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {j.reward > 0 && <p className="text-sm font-semibold tabular-nums">{sep(j.reward)} s</p>}
                {j.itemRewards.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {j.reward > 0 ? '+ ' : ''}{j.itemRewards.length} item{j.itemRewards.length === 1 ? '' : 's'}
                  </p>
                )}
                {j.reward > 0 ? (
                  <p className="text-[11px] text-muted-foreground">reward</p>
                ) : j.itemRewards.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">no reward</p>
                )}
              </div>
              <StatusBadge status={j.status} />
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
              <div className="grid gap-5 border-t p-4 lg:grid-cols-[1fr_260px]">
                <div className="min-w-0 space-y-4">
                  <div>
                    <SectionLabel>Description</SectionLabel>
                    <p className="whitespace-pre-wrap text-sm">{j.description || '—'}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <SectionLabel>Contact / found at</SectionLabel>
                      <p className="text-sm">{j.contact || '—'}</p>
                    </div>
                    <div>
                      <SectionLabel>Faction</SectionLabel>
                      <p className="text-sm">{j.faction || 'None'}</p>
                    </div>
                  </div>

                  {(j.reward > 0 || j.itemRewards.length > 0) && (
                    <div>
                      <SectionLabel>Reward</SectionLabel>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {j.reward > 0 && <TonedBadge tone="amber">{sep(j.reward)} septims</TonedBadge>}
                        {j.itemRewards.map((r) => (
                          <TonedBadge key={r.item} tone="blue">
                            {r.qty > 1 ? `${r.qty}× ` : ''}{r.item}
                          </TonedBadge>
                        ))}
                      </div>
                    </div>
                  )}

                  {j.collection && (
                    <>
                      <div>
                        <SectionLabel>Collection progress</SectionLabel>
                        <CollectionProgress job={j} />
                      </div>

                      {j.reward > 0 && (
                        <div>
                          <SectionLabel>Septim split</SectionLabel>
                          <PayoutSplit job={j} cutPct={db.settings.guildCutPct} />
                        </div>
                      )}

                      <div>
                        <SectionLabel>Turn-ins ({j.entries.length})</SectionLabel>
                        <div className="space-y-1.5">
                          {j.entries.slice().reverse().map((en, i) => {
                            const idx = j.entries.length - 1 - i;
                            return (
                              <div key={idx} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-sm">
                                <span className="shrink-0 font-medium">{en.by}</span>
                                <span className="min-w-0 flex-1 truncate">{en.qty}× {en.item}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{dstr(en.at)}</span>
                                {!readOnly && (
                                  <Button
                                    variant="ghost" size="icon-xs" aria-label="Remove turn-in"
                                    onClick={() => update((d) => {
                                      const t = d.jobs.find((x) => x.id === j.id);
                                      if (t) t.entries.splice(idx, 1);
                                    })}
                                  >
                                    <X />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                          {j.entries.length === 0 && (
                            <p className="text-sm text-muted-foreground">No turn-ins yet.</p>
                          )}
                        </div>

                        {!readOnly && (
                        <form onSubmit={addEntry} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="jobId" value={j.id} />
                          <Input
                            name="by" required placeholder="Who collected it"
                            list={`members-${j.id}`} autoComplete="off" className="h-8 w-40"
                          />
                          <datalist id={`members-${j.id}`}>
                            {memberNames.map((n) => <option key={n} value={n} />)}
                          </datalist>
                          <Input
                            name="item" required placeholder="Item collected"
                            list={`items-${j.id}`} autoComplete="off" className="h-8 min-w-36 flex-1"
                          />
                          <datalist id={`items-${j.id}`}>
                            {j.items.map((t) => <option key={`t-${t.item}`} value={t.item} />)}
                            {ALL_ITEM_NAMES.map((nm) => <option key={nm} value={nm} />)}
                          </datalist>
                          <Input name="qty" type="number" min={1} defaultValue={1} className="h-8 w-20" />
                          <Button type="submit" size="sm">Add turn-in</Button>
                        </form>
                        )}
                      </div>
                    </>
                  )}

                  {!j.collection && j.items.length > 0 && (
                    <div>
                      <SectionLabel>Item addons</SectionLabel>
                      <p className="text-sm">{j.items.map((t) => (t.qty ? `${t.qty}× ` : '') + t.item).join(', ')}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {readOnly ? (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Status</Label>
                        <p className="text-sm capitalize">{j.status}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Claimed by</Label>
                        <p className="text-sm">{j.claimedBy || 'Unassigned'}</p>
                      </div>
                    </>
                  ) : (
                  <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={j.status}
                      onValueChange={(v) => {
                        if (!v) return;
                        update((d) => {
                          const t = d.jobs.find((x) => x.id === j.id);
                          if (t) t.status = v as JobStatus;
                        });
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="claimed">Claimed</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Claimed by</Label>
                    <Select
                      value={j.claimedBy || '__none'}
                      onValueChange={(v) => {
                        const val = !v || v === '__none' ? '' : v;
                        update((d) => {
                          const t = d.jobs.find((x) => x.id === j.id);
                          if (t) { t.claimedBy = val; if (val && t.status === 'open') t.status = 'claimed'; }
                        });
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Unassigned</SelectItem>
                        {memberNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        {j.claimedBy && !memberNames.includes(j.claimedBy) && (
                          <SelectItem value={j.claimedBy}>{j.claimedBy}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button variant="outline" size="sm" className="mt-auto" onClick={() => onEdit(j.id)}>
                    <Pencil />
                    Edit job
                  </Button>

                  <Button
                    variant="destructive" size="sm"
                    onClick={() => {
                      if (confirm('Delete this job?')) {
                        update((d) => { d.jobs = d.jobs.filter((x) => x.id !== j.id); });
                      }
                    }}
                  >
                    Delete job
                  </Button>
                  </>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
