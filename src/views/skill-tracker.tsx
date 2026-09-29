import { useState } from 'react';
import type { FormEvent } from 'react';
import { GraduationCap, Pencil, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DurationInput, EmptyState, Field, NameField, Picker, TonedBadge } from '@/components/bits';
import type { Tone } from '@/components/bits';
import { formatCountdown, parseDigits, sinceShort, useNow } from '@/lib/countdown';
import { sep, uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SKILLS, SKILL_TIERS } from '@/types';
import type { DB, SkillEntry } from '@/types';

const MASTER = SKILL_TIERS.length - 1;

/** Rank colours run cool to hot, so a glance down the list reads as progress. */
const TIER_TONE: Tone[] = ['neutral', 'neutral', 'blue', 'blue', 'amber', 'green'];

const tierName = (tier: number) => SKILL_TIERS[tier] ?? SKILL_TIERS[0];

/** When training comes back, in epoch ms. Nothing here is stored, so it can't
 *  go stale between renders. */
const readyAt = (sk: SkillEntry) =>
  new Date(sk.lastTrained).getTime() + sk.cooldownSeconds * 1000;

/** True when a timer is running at all — a record with no cooldown is just a
 *  note of where somebody stands. */
const isTimed = (sk: SkillEntry) => sk.cooldownSeconds > 0 && sk.lastTrained !== '';

/** A skill as the dialog works on it. */
type SkillDraft = Omit<SkillEntry, 'id' | 'at' | 'lastTrained'>;

function SkillDialog({ title, action, initial, memberNames, close, onSave }: {
  title: string;
  action: string;
  initial: SkillDraft;
  memberNames: string[];
  close: () => void;
  onSave: (draft: SkillDraft) => void;
}) {
  const [skill, setSkill] = useState(initial.skill);
  const [tier, setTier] = useState(initial.tier);
  const [digits, setDigits] = useState(() => {
    if (!initial.cooldownSeconds) return '';
    const mins = Math.round(initial.cooldownSeconds / 60);
    return String(Math.floor(mins / 60) * 100 + (mins % 60));
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const who = String(f.get('who') || '').trim();
    if (!who || !skill.trim()) return;
    onSave({
      who,
      skill: skill.trim(),
      tier,
      xpEarned: Math.max(0, Math.round(Number(f.get('xpEarned') || 0))),
      xpNeeded: Math.max(0, Math.round(Number(f.get('xpNeeded') || 0))),
      // Hours and minutes here, so "230" is two and a half hours.
      cooldownSeconds: parseDigits(digits, 'min') ?? 0,
    });
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Where they stand on this skill, and how long training takes to come back.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Member" htmlFor="skill-who">
              <NameField id="skill-who" name="who" options={memberNames} required
                defaultValue={initial.who || memberNames[0] || ''}
                placeholder="Pick a member or write in" />
            </Field>
            <Field label="Skill" htmlFor="skill-name">
              {/* Written-in names are allowed: the server can add a skill
                  without waiting on a release here. */}
              <NameField id="skill-name" name="skill" options={SKILLS} required
                defaultValue={initial.skill} placeholder="Pick a skill or write one in"
                onValueChange={setSkill} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label="Tier">
              <Picker
                value={String(tier)} onValueChange={(v) => setTier(Number(v) || 0)}
                ariaLabel="Tier"
                options={SKILL_TIERS.map((name, i) => ({ value: String(i), label: `${i} · ${name}` }))}
              />
            </Field>
            {/* Both halves of the game's "800 / 2300", in that order, so the
                panel can be copied across without any arithmetic. */}
            <Field
              label={tier >= MASTER ? 'XP earned' : `XP toward ${tierName(tier + 1)}`}
              htmlFor="skill-xp-earned" className="sm:w-28"
            >
              <Input
                id="skill-xp-earned" name="xpEarned" type="number" min={0}
                defaultValue={initial.xpEarned || ''} placeholder="800"
                disabled={tier >= MASTER}
              />
            </Field>
            <Field label="out of" htmlFor="skill-xp-needed" className="sm:w-28">
              <Input
                id="skill-xp-needed" name="xpNeeded" type="number" min={0}
                defaultValue={initial.xpNeeded || ''} placeholder="2300"
                disabled={tier >= MASTER}
              />
            </Field>
          </div>

          <Field label="Training comes back after" htmlFor="skill-cooldown" className="w-40">
            <DurationInput id="skill-cooldown" digits={digits} onChange={setDigits} grain="min" />
            <p className="text-[11px] text-muted-foreground">Hours and minutes — 230 is 2:30. Leave blank for no timer.</p>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit">{action}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SkillRow({ sk, now, readOnly, onTrained, onEdit, onRemove }: {
  sk: SkillEntry;
  now: number;
  readOnly: boolean;
  onTrained: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const timed = isTimed(sk);
  const msLeft = readyAt(sk) - now;
  const ready = msLeft <= 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{sk.skill}</span>
          <TonedBadge tone={TIER_TONE[sk.tier] ?? 'neutral'}>{tierName(sk.tier)}</TonedBadge>
          <span className="truncate text-xs text-muted-foreground">{sk.who}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {sk.tier >= MASTER
            ? 'Mastered'
            : sk.xpNeeded > 0
              ? `${sep(sk.xpEarned)} / ${sep(sk.xpNeeded)} XP toward ${tierName(sk.tier + 1)}`
              : sk.xpEarned > 0
                ? `${sep(sk.xpEarned)} XP toward ${tierName(sk.tier + 1)}`
                : `No XP recorded toward ${tierName(sk.tier + 1)}`}
          {timed && ` · trained ${sinceShort(sk.lastTrained, now)}`}
          {sk.cooldownSeconds > 0 && ` · comes back after ${formatCountdown(sk.cooldownSeconds * 1000)}`}
        </p>
      </div>

      {timed && (
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
      )}

      {!readOnly && (
        <div className="flex shrink-0 items-center gap-1">
          {sk.cooldownSeconds > 0 && (
            <Button variant="outline" size="xs" onClick={onTrained}>
              <Timer />Trained now
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" aria-label={`Edit ${sk.who}'s ${sk.skill}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost" size="icon-xs" className="text-destructive"
            aria-label={`Remove ${sk.who}'s ${sk.skill}`} onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
}

/** The live-ticking list, kept apart from the page around it so a clock tick
 *  doesn't re-render anything being typed into. */
function SkillList({ skills, readOnly, onTrained, onEdit, onRemove }: {
  skills: SkillEntry[];
  readOnly: boolean;
  onTrained: (id: string) => void;
  onEdit: (sk: SkillEntry) => void;
  onRemove: (sk: SkillEntry) => void;
}) {
  const now = useNow();
  return (
    <Card>
      <CardContent className="p-4">
        {skills.map((sk) => (
          <SkillRow
            key={sk.id} sk={sk} now={now} readOnly={readOnly}
            onTrained={() => onTrained(sk.id)}
            onEdit={() => onEdit(sk)}
            onRemove={() => onRemove(sk)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Where everyone stands on the server's skills, and when each can be trained
 * again. A record carries the tier someone has reached and the XP left to the
 * next one; giving it a cooldown starts a clock that ticks down live, the same
 * way the Dungeon Tracker's respawns do. Shared with the guild — knowing who
 * is nearly a Master blacksmith is the point.
 */
export function SkillTracker({ db, update, readOnly, memberNames }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  memberNames: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SkillEntry | null>(null);

  // Running timers first, soonest ready at the top; everything else after, by
  // member then skill, so the list reads as a roster once the clocks are done.
  const skills = db.skills.slice().sort((a, b) => {
    const ta = isTimed(a);
    const tb = isTimed(b);
    if (ta !== tb) return ta ? -1 : 1;
    if (ta && tb) return readyAt(a) - readyAt(b);
    return a.who.localeCompare(b.who) || a.skill.localeCompare(b.skill);
  });

  const ticking = skills.filter(isTimed).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <GraduationCap />Track a skill
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {sep(db.skills.length)} tracked{ticking > 0 ? `, ${sep(ticking)} on a timer` : ''} · a
          clock counts down from when someone last hit Trained now.
        </p>
      </div>

      {skills.length === 0 ? (
        <EmptyState>
          <GraduationCap className="mx-auto mb-2 size-6 text-muted-foreground" />
          {readOnly
            ? 'Nobody is tracking a skill yet.'
            : 'No skills tracked yet. Add one with Track a skill.'}
        </EmptyState>
      ) : (
        <SkillList
          skills={skills}
          readOnly={readOnly}
          onTrained={(id) => update((d) => {
            const t = d.skills.find((x) => x.id === id);
            if (t) t.lastTrained = new Date().toISOString();
          })}
          onEdit={setEditing}
          onRemove={(sk) => {
            if (confirm(`Stop tracking ${sk.who}'s ${sk.skill}?`)) {
              update((d) => { d.skills = d.skills.filter((x) => x.id !== sk.id); });
            }
          }}
        />
      )}

      {adding && (
        <SkillDialog
          title="Track a skill" action="Start tracking"
          initial={{ who: '', skill: '', tier: 0, xpEarned: 0, xpNeeded: 0, cooldownSeconds: 0 }}
          memberNames={memberNames}
          close={() => setAdding(false)}
          onSave={(draft) => update((d) => {
            d.skills.push({
              id: uid(), ...draft,
              // A cooldown set now starts running now; without one there's
              // nothing to count and the field stays blank.
              lastTrained: draft.cooldownSeconds > 0 ? new Date().toISOString() : '',
              at: new Date().toISOString(),
            });
          })}
        />
      )}

      {editing && (
        <SkillDialog
          title="Edit skill" action="Save"
          initial={editing}
          memberNames={memberNames}
          close={() => setEditing(null)}
          onSave={(draft) => update((d) => {
            const t = d.skills.find((x) => x.id === editing.id);
            if (!t) return;
            // Starting a timer on a record that had none begins the clock;
            // otherwise the last training time stands, so correcting a tier
            // doesn't quietly reset what someone is waiting on.
            const started = draft.cooldownSeconds > 0 && t.cooldownSeconds === 0;
            Object.assign(t, draft);
            if (started) t.lastTrained = new Date().toISOString();
            if (draft.cooldownSeconds === 0) t.lastTrained = '';
          })}
        />
      )}
    </div>
  );
}
