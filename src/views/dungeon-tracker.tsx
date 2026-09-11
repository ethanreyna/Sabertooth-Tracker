import { useState } from 'react';
import type { FormEvent } from 'react';
import { CircleCheck, Clock, Plus, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Picker, TonedBadge, choices } from '@/components/bits';
import { ago, sep } from '@/lib/format';
import { untilLabel } from '@/lib/deadline';
import type { DB, Dungeon } from '@/types';

/** When loot is due back, computed from the last clear and the respawn
 *  length — nothing here is stored, so it's never stale between renders. */
function readyAt(g: Dungeon): string {
  return new Date(new Date(g.lastCleared).getTime() + g.respawnDays * 864e5).toISOString();
}

function TrackedRow({ g, readOnly, onClear, onStop }: {
  g: Dungeon;
  readOnly: boolean;
  onClear: () => void;
  onStop: () => void;
}) {
  const until = untilLabel(readyAt(g));
  // untilLabel's own words are written for a deadline ("3 days overdue"); a
  // dungeon that's overdue for its respawn isn't overdue, it's just ready.
  const ready = !until || until.overdue;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{g.name}</p>
        <p className="text-xs text-muted-foreground">
          Cleared {ago(g.lastCleared)} · checked every {g.respawnDays} day{g.respawnDays === 1 ? '' : 's'}
        </p>
      </div>
      <TonedBadge tone={ready ? 'green' : 'amber'}>
        {ready ? 'Ready now' : `Ready in ${until!.text.replace(' left', '')}`}
      </TonedBadge>
      {!readOnly && (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="xs" onClick={onClear}>
            <CircleCheck />Mark cleared
          </Button>
          <Button variant="ghost" size="icon-xs" className="text-destructive" aria-label={`Stop tracking ${g.name}`} onClick={onStop}>
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
}

function TrackDungeonForm({ untracked, onTrack }: {
  untracked: Dungeon[];
  onTrack: (dungeonId: string, respawnDays: number) => void;
}) {
  const [name, setName] = useState('');

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = untracked.find((x) => x.name === name);
    const days = Math.max(1, Math.round(Number(f.get('days') || 0)));
    if (!g || !days) return;
    onTrack(g.id, days);
    setName('');
    e.currentTarget.reset();
  };

  if (untracked.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Field label="Dungeon" className="min-w-56 flex-1" htmlFor="track-dungeon">
            <Picker
              id="track-dungeon" value={name} onValueChange={setName}
              options={choices(untracked.map((g) => g.name))} ariaLabel="Dungeon to track"
              placeholder="Search scouted dungeons…"
            />
          </Field>
          <Field label="Respawns every" htmlFor="track-days" className="w-32">
            <Input id="track-days" name="days" type="number" min={1} required placeholder="10" />
          </Field>
          <Button type="submit" disabled={!name}><Plus />Start tracking</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Watches respawn timers on dungeons the guild has already scouted (see the
 * Dungeon Database tab) — pick one, say how often it resets, and this counts
 * down from the last time someone marked it cleared. Shared with the whole
 * guild, same as the database itself: if someone cleared it yesterday,
 * everyone should see that, not just whoever went.
 */
export function DungeonTracker({ db, update, readOnly }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
}) {
  const tracked = db.dungeons
    .filter((g) => g.respawnDays > 0)
    .sort((a, b) => new Date(readyAt(a)).getTime() - new Date(readyAt(b)).getTime());
  const untracked = db.dungeons.filter((g) => g.respawnDays === 0);

  const withDungeon = (id: string, fn: (g: Dungeon) => void) => update((d) => {
    const g = d.dungeons.find((x) => x.id === id);
    if (g) fn(g);
  });

  return (
    <div className="space-y-4">
      {!readOnly && (
        <TrackDungeonForm
          untracked={untracked}
          onTrack={(id, days) => withDungeon(id, (g) => {
            g.respawnDays = days;
            g.lastCleared = new Date().toISOString();
          })}
        />
      )}

      {tracked.length === 0 ? (
        <EmptyState>
          <Timer className="mx-auto mb-2 size-6 text-muted-foreground" />
          {db.dungeons.length === 0
            ? 'No dungeons scouted yet — add one in the Dungeon Database tab first.'
            : readOnly
              ? 'Nobody is tracking a respawn timer yet.'
              : untracked.length === 0
                ? 'Every scouted dungeon is already being tracked.'
                : 'Pick a dungeon above and say how often it respawns to start watching it.'}
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-4">
            {tracked.map((g) => (
              <TrackedRow
                key={g.id}
                g={g}
                readOnly={readOnly}
                onClear={() => withDungeon(g.id, (x) => { x.lastCleared = new Date().toISOString(); })}
                onStop={() => withDungeon(g.id, (x) => { x.respawnDays = 0; x.lastCleared = ''; })}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        <Clock />
        {sep(tracked.length)} tracked · counts down from when someone last hit Mark cleared, not from
        when the dungeon was added.
      </p>
    </div>
  );
}
