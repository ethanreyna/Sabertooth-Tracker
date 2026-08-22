import { useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, StickyNote, Trash2, Trophy, CircleCheck } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, TonedBadge } from '@/components/bits';
import { ago, dstr, initials, sep, uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB, Member, MemberEntry, Role } from '@/types';

const NO_ROLE = '__none';

/** Credits count toward the threshold on the member's current role. */
function progressFor(member: Member, roles: Role[]) {
  const role = roles.find((r) => r.name === member.role);
  const credits = member.log.filter((l) => l.kind === 'credit').length;
  if (!role || role.advanceAfter <= 0) return { credits, target: 0, role, ready: false };
  return {
    credits,
    target: role.advanceAfter,
    role,
    ready: credits >= role.advanceAfter && !!role.advanceTo,
  };
}

export function Roster({ db, update, readOnly }: {
  db: DB; update: (fn: (d: DB) => void) => void; readOnly: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const addEntry = (memberId: string, kind: MemberEntry['kind']) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const text = String(f.get('text') || '').trim();
    if (!text) return;
    const entry: MemberEntry = {
      id: uid(), kind, text,
      jobId: String(f.get('jobId') || ''),
      by: String(f.get('by') || '').trim() || 'Unknown',
      at: new Date().toISOString(),
    };
    form.reset();
    update((d) => { const t = d.members.find((x) => x.id === memberId); if (t) t.log.push(entry); });
  };

  const promote = (m: Member, to: string) => {
    if (!confirm(`Promote ${m.name} to ${to}? Their completed credits stay on the record.`)) return;
    update((d) => {
      const t = d.members.find((x) => x.id === m.id);
      if (!t) return;
      t.role = to;
      t.log.push({
        id: uid(), kind: 'note',
        text: `Advanced to ${to}.`,
        jobId: '', by: 'Guild', at: new Date().toISOString(),
      });
    });
  };

  if (db.members.length === 0) {
    return <EmptyState>{readOnly ? 'No members yet.' : 'No members yet. Add one with Add member.'}</EmptyState>;
  }

  const openJobs = db.jobs.filter((j) => j.status !== 'done');

  return (
    <div className="max-w-4xl space-y-2.5">
      {db.members.map((m) => {
        const claimed = db.jobs.filter((j) => j.claimedBy === m.name).length;
        const posted = db.jobs.filter((j) => j.postedBy === m.name).length;
        const turnedIn = db.jobs.reduce(
          (s, j) => s + j.entries.filter((e) => e.by === m.name).reduce((t, e) => t + e.qty, 0),
          0,
        );
        const known = db.roles.some((r) => r.name === m.role);
        const p = progressFor(m, db.roles);
        const isOpen = !!open[m.id];

        return (
          <Card key={m.id} className="overflow-hidden py-0">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [m.id]: !s[m.id] }))}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="text-[11px] font-semibold">{initials(m.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{m.name}</span>
                    {m.role && <TonedBadge tone={known ? 'neutral' : 'amber'}>{m.role}</TonedBadge>}
                    {p.target > 0 && (
                      <TonedBadge tone={p.ready ? 'green' : 'blue'}>
                        {p.credits}/{p.target} toward {p.role?.advanceTo || 'advancement'}
                      </TonedBadge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Joined {dstr(m.joined)} · {claimed} claimed · {posted} posted · {sep(turnedIn)} items
                  </p>
                </div>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
              </button>

              {!readOnly && (
                <>
                  <Select
                    value={m.role || NO_ROLE}
                    onValueChange={(v) => {
                      const val = !v || v === NO_ROLE ? '' : v;
                      update((d) => { const t = d.members.find((x) => x.id === m.id); if (t) t.role = val; });
                    }}
                  >
                    <SelectTrigger className="h-8 w-36 shrink-0 max-sm:hidden" aria-label={`Role for ${m.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ROLE}>No role</SelectItem>
                      {db.roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                      {m.role && !known && <SelectItem value={m.role}>{m.role} (unlisted)</SelectItem>}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`}
                    onClick={() => {
                      if (confirm(`Remove ${m.name} from the roster?`)) {
                        update((d) => { d.members = d.members.filter((x) => x.id !== m.id); });
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>

            {isOpen && (
              <div className="space-y-4 border-t bg-muted/20 p-4">
                {p.target > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex-1">
                        Progress toward <span className="font-medium">{p.role?.advanceTo}</span>
                      </span>
                      <span className="font-medium tabular-nums">{p.credits}/{p.target}</span>
                    </div>
                    <Progress
                      value={Math.min(100, (p.credits / p.target) * 100)}
                      className={cn(p.ready
                        ? '[&_[data-slot=progress-indicator]]:bg-emerald-500'
                        : '[&_[data-slot=progress-indicator]]:bg-sky-500')}
                    />
                    {p.ready && !readOnly && (
                      <Button size="sm" className="mt-1" onClick={() => promote(m, p.role!.advanceTo)}>
                        <Trophy />
                        Promote to {p.role?.advanceTo}
                      </Button>
                    )}
                    {p.ready && readOnly && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Ready to advance to {p.role?.advanceTo}.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Record ({m.log.length})
                  </p>
                  {m.log.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {m.log.slice().reverse().map((l) => {
                        const job = l.jobId ? db.jobs.find((j) => j.id === l.jobId) : undefined;
                        return (
                          <div key={l.id} className="flex items-start gap-2.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                            {l.kind === 'credit'
                              ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                              : <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0 flex-1">
                              <p className="break-words">{l.text}</p>
                              <p className="text-xs text-muted-foreground">
                                {l.by} · {ago(l.at)}
                                {job ? ` · job “${job.name}”` : ''}
                              </p>
                            </div>
                            {!readOnly && (
                              <Button
                                variant="ghost" size="icon-xs" aria-label="Remove entry"
                                onClick={() => update((d) => {
                                  const t = d.members.find((x) => x.id === m.id);
                                  if (t) t.log = t.log.filter((e) => e.id !== l.id);
                                })}
                              >
                                <Trash2 />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!readOnly && (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <form onSubmit={addEntry(m.id, 'credit')} className="space-y-1.5 rounded-lg border bg-card p-2.5">
                      <p className="text-xs font-medium">Log a completion</p>
                      <Input name="text" required placeholder="What they completed" className="h-8" />
                      <div className="flex gap-1.5">
                        <select
                          name="jobId"
                          aria-label="Link to a job"
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
                          defaultValue=""
                        >
                          <option value="">No job link</option>
                          {openJobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                        </select>
                        <Input name="by" required placeholder="Logged by" className="h-8 w-28" />
                      </div>
                      <Button type="submit" size="sm" className="w-full">Add credit</Button>
                    </form>

                    <form onSubmit={addEntry(m.id, 'note')} className="space-y-1.5 rounded-lg border bg-card p-2.5">
                      <p className="text-xs font-medium">Add a note</p>
                      <Input name="text" required placeholder="Anything worth remembering" className="h-8" />
                      <Input name="by" required placeholder="Noted by" className="h-8" />
                      <Button type="submit" size="sm" variant="outline" className="w-full">Add note</Button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
