import { useState } from 'react';
import type { FormEvent } from 'react';
import { Clock, Plus, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DurationInput, EmptyState, Field, Picker, choices } from '@/components/bits';
import { formatCountdown, parseDigits, sinceShort, useNow } from '@/lib/countdown';
import { sep } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB, Dungeon } from '@/types';

/** When loot is due back, in epoch ms — nothing here is stored, so it's
 *  never stale between renders. */
function readyAt(g: Dungeon): number {
  return new Date(g.lastCleared).getTime() + g.respawnSeconds * 1000;
}

function TrackedRow({ g, now, readOnly, onClear, onStop }: {
  g: Dungeon;
  now: number;
  readOnly: boolean;
  onClear: () => void;
  onStop: () => void;
}) {
  const msLeft = readyAt(g) - now;
  const ready = msLeft <= 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{g.name}</p>
        <p className="text-xs text-muted-foreground">
          Cleared {sinceShort(g.lastCleared, now)} · resets {formatCountdown(g.respawnSeconds * 1000)} after clearing
        </p>
      </div>
      <div
        className={cn(
          'shrink-0 rounded-lg border px-3 py-1 text-center font-mono text-2xl leading-tight font-bold tabular-nums',
          ready
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        )}
      >
        {ready ? 'Ready' : formatCountdown(msLeft)}
      </div>
      {!readOnly && (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="xs" onClick={onClear}>
            <Timer />Mark cleared
          </Button>
          <Button variant="ghost" size="icon-xs" className="text-destructive" aria-label={`Stop tracking ${g.name}`} onClick={onStop}>
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
}

/** The live-ticking half of the tracker, isolated from the form above it so
 *  typing in the dungeon picker doesn't fight a re-render every second. */
function TrackedList({ tracked, readOnly, withDungeon }: {
  tracked: Dungeon[];
  readOnly: boolean;
  withDungeon: (id: string, fn: (g: Dungeon) => void) => void;
}) {
  const now = useNow();
  return (
    <Card>
      <CardContent className="p-4">
        {tracked.map((g) => (
          <TrackedRow
            key={g.id}
            g={g}
            now={now}
            readOnly={readOnly}
            onClear={() => withDungeon(g.id, (x) => { x.lastCleared = new Date().toISOString(); })}
            onStop={() => withDungeon(g.id, (x) => { x.respawnSeconds = 0; x.lastCleared = ''; })}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function TrackDungeonForm({ untracked, onTrack }: {
  untracked: Dungeon[];
  onTrack: (dungeonId: string, respawnSeconds: number) => void;
}) {
  const [name, setName] = useState('');
  const [digits, setDigits] = useState('');
  const seconds = parseDigits(digits, 'sec');
  // Two records can share a name (one added from the map, one from the form);
  // the picker wants each name once, and the first record is as good as any.
  const names = [...new Set(untracked.map((g) => g.name))];

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const g = untracked.find((x) => x.name === name);
    if (!g || !seconds) return;
    onTrack(g.id, seconds);
    setName('');
    setDigits('');
  };

  if (untracked.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Field label="Dungeon" className="min-w-56 flex-1" htmlFor="track-dungeon">
            <Picker
              id="track-dungeon" value={name} onValueChange={setName}
              options={choices(names)} ariaLabel="Dungeon to track"
              placeholder="Search scouted dungeons…"
            />
          </Field>
          <Field label="Respawn time" htmlFor="track-duration" className="w-28">
            <DurationInput id="track-duration" digits={digits} onChange={setDigits} />
          </Field>
          <Button type="submit" disabled={!name || !seconds}><Plus />Start tracking</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Watches respawn timers on dungeons the guild has already scouted (see the
 * Dungeon Database tab) — pick one, log when you cleared it, and this ticks
 * down live so anyone can walk up, glance at it, and go check other dungeons
 * while they wait. Shared with the whole guild, same as the database itself:
 * if someone cleared it five minutes ago, everyone should see that.
 */
export function DungeonTracker({ db, update, readOnly }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
}) {
  const tracked = db.dungeons
    .filter((g) => g.respawnSeconds > 0)
    .sort((a, b) => readyAt(a) - readyAt(b));
  const untracked = db.dungeons.filter((g) => g.respawnSeconds === 0);

  const withDungeon = (id: string, fn: (g: Dungeon) => void) => update((d) => {
    const g = d.dungeons.find((x) => x.id === id);
    if (g) fn(g);
  });

  return (
    <div className="space-y-4">
      {!readOnly && (
        <TrackDungeonForm
          untracked={untracked}
          onTrack={(id, seconds) => withDungeon(id, (g) => {
            g.respawnSeconds = seconds;
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
                : 'Pick a dungeon above and set its respawn time (like 5:34) to start the clock.'}
        </EmptyState>
      ) : (
        <TrackedList tracked={tracked} readOnly={readOnly} withDungeon={withDungeon} />
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        <Clock />
        {sep(tracked.length)} tracked · counts down from when someone last hit Mark cleared, not from
        when the dungeon was added.
      </p>
    </div>
  );
}
