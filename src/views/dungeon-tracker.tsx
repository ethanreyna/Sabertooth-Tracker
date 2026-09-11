import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Clock, Plus, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Picker, choices } from '@/components/bits';
import { ago, sep } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB, Dungeon } from '@/types';

/** Ticks once a second so every countdown on the page moves together, off one
 *  timer instead of one per row. Lives only around the tracked list — the
 *  "track a dungeon" form above it has no reason to re-render every second,
 *  and doing so was resetting its search box's filter mid-type. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** When loot is due back, in epoch ms — nothing here is stored, so it's
 *  never stale between renders. */
function readyAt(g: Dungeon): number {
  return new Date(g.lastCleared).getTime() + g.respawnSeconds * 1000;
}

/** "5:34" while under an hour, "1:05:34" once it isn't, "2d 03:14:07" for
 *  anything that runs multiple days — a clock face, not a rounded-off guess,
 *  since the whole point is to walk up to it and read the exact time left. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  if (hours > 0) return `${hours}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
}

/** Reads a typed duration back into total seconds. Colons are cosmetic —
 *  stripped out before anything else happens — so "543", "5:43", and even a
 *  stray ":5:43" all land the same place: digits are grouped from the right
 *  in twos (seconds, then minutes, then hours), the way a stopwatch reads
 *  digits typed on a keypad. Null when there's nothing to read, which leaves
 *  the form as a no-op rather than guessing. */
function parseDuration(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  const secs = Number(digits.slice(-2)) || 0;
  const mins = Number(digits.slice(-4, -2)) || 0;
  const hours = Number(digits.slice(0, -4)) || 0;
  const total = hours * 3600 + mins * 60 + secs;
  return total > 0 ? total : null;
}

/** "just now" / "12 min ago" / "3 hrs ago" — {@link ago} only tells days
 *  apart, too coarse when the whole timer runs in minutes. Falls back to it
 *  once something's been sitting long enough that the exact minute stops
 *  mattering. */
function clearedAgo(iso: string, now: number): string {
  if (!iso) return '';
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  return ago(iso);
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
          Cleared {clearedAgo(g.lastCleared, now)} · resets {formatCountdown(g.respawnSeconds * 1000)} after clearing
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

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = untracked.find((x) => x.name === name);
    const seconds = parseDuration(String(f.get('duration') || ''));
    if (!g || !seconds) return;
    onTrack(g.id, seconds);
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
          <Field label="Respawn time" htmlFor="track-duration" className="w-32">
            <Input
              id="track-duration" name="duration" type="text" inputMode="numeric" required
              placeholder="543" title="543, or 5:43 — however you'd rather type it"
            />
            <p className="text-[11px] text-muted-foreground">543 becomes 5:43</p>
          </Field>
          <Button type="submit" disabled={!name}><Plus />Start tracking</Button>
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
