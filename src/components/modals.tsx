import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MapPinPlus } from 'lucide-react';
import { Field, NameField } from '@/components/bits';
import { ItemPicker } from '@/components/item-picker';
import { uploadImage } from '@/sync';
import { uid } from '@/lib/format';
import { DURATION_UNITS, fromNow } from '@/lib/deadline';
import type { DurationUnit } from '@/lib/deadline';
import { SPOT_KINDS } from '@/types';
import { coordOrEmpty } from '@/lib/maps';
import type { Barrel, CollectionTarget, DB, Dungeon, Job, LedgerEntry, Member, Role, Settings, Spot, SyncCfg, SyncStatus } from '@/types';

export type ModalKind = 'job' | 'barrel' | 'dungeon' | 'spot' | 'ledger' | 'member' | 'role' | 'sync';

const NO_ROLE = '__none';
const NO_KIND = '__none';
const COLLECTION_TAG = 'Resource collection';
const TAGS = [COLLECTION_TAG, 'Kill', 'Arrest', 'Guard', 'Escort', 'Delivery', 'Other'];
const PRIORITIES = ['Normal', 'Low', 'High', 'Urgent'];
const DIFFICULTIES = ['Easy', 'Moderate', 'Hard', 'Deadly'];

/** yyyy-mm-dd for a date input, in local time. */
const toDateInput = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Modals({ modal, close, roles, settings, memberNames, editRole, editJob, editBarrel, editDungeon, editSpot, dungeons, onPickOnMap, newSpotAt, newSpotKind, newDungeonAt, update, setJobsView, cfg, sync, offline, readOnly, onLogout }: {
  modal: ModalKind; close: () => void; roles: Role[]; settings: Settings; memberNames: string[];
  editRole: Role | null; editJob: Job | null; editBarrel: Barrel | null;
  editDungeon: Dungeon | null; editSpot: Spot | null;
  /** Existing dungeons, so a point can be attached to one instead of duplicating it. */
  dungeons: Dungeon[];
  /** Hands the next map click to this record, so a marker can be repositioned
   *  without deleting and re-adding it. */
  onPickOnMap: (kind: 'spot' | 'dungeon', id: string) => void;
  newSpotAt: { x: string; y: string } | null;
  newSpotKind: string;
  newDungeonAt: { x: string; y: string } | null;
  update: (fn: (d: DB) => void) => void; setJobsView: () => void;
  cfg: SyncCfg | null; sync: SyncStatus; offline: boolean; readOnly: boolean; onLogout: () => void;
}) {
  const [tag, setTag] = useState(editJob?.tag ?? TAGS[0]);
  // Resource-collection jobs are collection jobs by definition, so the box is
  // on by default for that tag. Still overridable for the odd exception.
  const [collection, setCollection] = useState(editJob ? editJob.collection : TAGS[0] === COLLECTION_TAG);
  const [paid, setPaid] = useState(editBarrel?.paid ?? false);
  const [guildMember, setGuildMember] = useState(editBarrel?.guildMember ?? true);
  const [difficulty, setDifficulty] = useState(editDungeon?.difficulty || DIFFICULTIES[1]);
  const [dungeonImgs, setDungeonImgs] = useState<string[]>(editDungeon?.imgs ?? []);
  const [spotImgs, setSpotImgs] = useState<string[]>(editSpot?.imgs ?? []);
  const [targets, setTargets] = useState<CollectionTarget[]>(editJob?.items ?? []);
  const [itemRewards, setItemRewards] = useState<CollectionTarget[]>(editJob?.itemRewards ?? []);
  const [priority, setPriority] = useState(editJob?.priority ?? PRIORITIES[0]);
  const [deadlineMode, setDeadlineMode] = useState<'none' | 'date' | 'in'>(editJob?.deadline ? 'date' : 'none');
  const [durationAmount, setDurationAmount] = useState(1);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('weeks');
  const [ledgerType, setLedgerType] = useState<LedgerEntry['type']>('income');
  const [memberRole, setMemberRole] = useState(roles[0]?.name ?? NO_ROLE);
  const [advanceRole, setAdvanceRole] = useState(editRole?.advanceTo || NO_ROLE);
  const [spotKind, setSpotKind] = useState(editSpot?.kind ?? newSpotKind);
  const [attachDungeon, setAttachDungeon] = useState('');
  const [cutPct, setCutPct] = useState(String(settings.guildCutPct));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const isDungeonKind = spotKind.trim().toLowerCase() === 'dungeon' && !editSpot;
  const attachedDungeon = dungeons.find((g) => g.name === attachDungeon.trim()) ?? null;

  const cutClean = Math.min(100, Math.max(0, Math.round(Number(cutPct) || 0)));
  const cutDirty = cutPct !== '' && cutClean !== settings.guildCutPct;

  const submitSettings = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cutDirty) return;
    update((d) => { d.settings.guildCutPct = cutClean; });
  };

  const pickTag = (v: string | null) => {
    const next = v ?? TAGS[0];
    setTag(next);
    if (next === COLLECTION_TAG) setCollection(true);
  };

  const titles: Record<ModalKind, string> = {
    job: editJob ? 'Edit job' : 'Post a job',
    barrel: editBarrel ? 'Edit storage' : 'Track storage',
    dungeon: editDungeon ? 'Edit dungeon' : 'Add a dungeon',
    spot: editSpot ? 'Edit point of interest' : 'Add a point of interest',
    ledger: 'Record a ledger entry',
    member: 'Add a member',
    role: editRole ? 'Edit role' : 'Create a role',
    sync: 'Guild database',
  };

  const submitJob = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    let deadline = '';
    if (deadlineMode === 'date' && f.get('deadline')) {
      deadline = new Date(String(f.get('deadline'))).toISOString();
    } else if (deadlineMode === 'in') {
      deadline = fromNow(durationAmount, durationUnit);
    }

    const fields = {
      name: String(f.get('name')),
      client: String(f.get('client') || '').trim(),
      contact: String(f.get('contact') || '').trim(),
      faction: String(f.get('faction') || '').trim(),
      tag, priority,
      reward: Number(f.get('reward') || 0),
      itemRewards,
      description: String(f.get('description') || ''),
      postedBy: String(f.get('postedBy') || '').trim(),
      deadline,
      collection,
      items: targets,
    };

    close();

    if (editJob) {
      // Leave status, claimedBy, postedAt and the turn-in log alone — editing
      // the posting shouldn't rewrite what members have already delivered.
      update((d) => {
        const t = d.jobs.find((x) => x.id === editJob.id);
        if (t) Object.assign(t, fields);
      });
      return;
    }

    const job: Job = {
      id: uid(),
      ...fields,
      postedAt: new Date().toISOString(),
      status: 'open', claimedBy: '',
      entries: [],
    };
    setJobsView();
    update((d) => { d.jobs.push(job); });
  };

  const submitRole = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim();
    const desc = String(f.get('desc') || '').trim();
    if (!name) return;

    const clash = roles.some((r) => r.id !== editRole?.id && r.name.toLowerCase() === name.toLowerCase());
    if (clash) { setErr(`There is already a role called “${name}”.`); return; }

    const advanceTo = advanceRole === NO_ROLE ? '' : advanceRole;
    const advanceAfter = advanceTo ? Math.max(1, Number(f.get('advanceAfter') || 1)) : 0;

    close();
    update((d) => {
      if (!editRole) { d.roles.push({ id: uid(), name, desc, advanceAfter, advanceTo }); return; }
      const t = d.roles.find((r) => r.id === editRole.id);
      if (!t) return;
      const oldName = t.name;
      t.name = name;
      t.desc = desc;
      t.advanceAfter = advanceAfter;
      t.advanceTo = advanceTo;
      // Roles are held by name on the member record, so a rename has to follow.
      if (oldName !== name) {
        for (const m of d.members) if (m.role === oldName) m.role = name;
      }
    });
  };

  const submitBarrel = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get('shot') as File | null;

    // Keep the existing screenshot unless a new file was picked.
    let img = editBarrel?.img ?? '';
    if (file && file.size && cfg) {
      setBusy(true);
      setErr('');
      try {
        img = await uploadImage(cfg, file);
      } catch {
        setBusy(false);
        setErr('Screenshot upload failed. Save without it, or try a smaller image.');
        return;
      }
      setBusy(false);
    }

    const fields = {
      owner: String(f.get('owner') || '').trim(),
      guildMember,
      paid,
      rate: Number(f.get('rate') || 50),
      start: f.get('start') ? new Date(String(f.get('start'))).toISOString() : '',
      end: f.get('end') ? new Date(String(f.get('end'))).toISOString() : '',
      notes: String(f.get('notes') || ''),
      img,
    };

    close();
    if (editBarrel) {
      update((d) => {
        const t = d.barrels.find((x) => x.id === editBarrel.id);
        if (t) Object.assign(t, fields);
      });
      return;
    }
    update((d) => { d.barrels.push({ id: uid(), ...fields, at: new Date().toISOString() }); });
  };

  const submitSpot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    // A point whose kind is Dungeon belongs in the Dungeons section, not
    // alongside the ore veins — otherwise the same cave exists twice with two
    // sets of notes and only one of them on the map.
    if (spotKind.trim().toLowerCase() === 'dungeon' && !editSpot) {
      const x = coordOrEmpty(String(f.get('x') || ''));
      const y = coordOrEmpty(String(f.get('y') || ''));
      const attachTo = dungeons.find((g) => g.name === attachDungeon.trim());
      close();
      if (attachTo) {
        update((d) => {
          const t = d.dungeons.find((g) => g.id === attachTo.id);
          if (t) { t.x = x; t.y = y; }
        });
        return;
      }
      const name = String(f.get('name') || '').trim();
      if (!name) return;
      update((d) => {
        d.dungeons.push({
          id: uid(), name,
          location: String(f.get('location') || '').trim(),
          recommended: Math.max(0, Number(f.get('recommended') || 0)),
          difficulty: String(f.get('difficulty') || '').trim(),
          notes: String(f.get('notes') || ''),
          x, y, imgs: [],
          addedBy: String(f.get('addedBy') || '').trim(),
          at: new Date().toISOString(),
        });
      });
      return;
    }

    const files = (f.getAll('shots') as File[]).filter((x) => x && x.size);

    let imgs = spotImgs;
    if (files.length && cfg) {
      setBusy(true);
      setErr('');
      try {
        const uploaded = await Promise.all(files.map((file) => uploadImage(cfg, file)));
        imgs = [...imgs, ...uploaded.filter(Boolean)];
      } catch {
        setBusy(false);
        setErr('Screenshot upload failed. Save without it, or try smaller images.');
        return;
      }
      setBusy(false);
    }

    const fields = {
      name: String(f.get('name') || '').trim(),
      kind: spotKind.trim() || 'Other',
      location: String(f.get('location') || '').trim(),
      yield: String(f.get('yield') || '').trim(),
      respawn: String(f.get('respawn') || '').trim(),
      x: coordOrEmpty(String(f.get('x') || '')),
      y: coordOrEmpty(String(f.get('y') || '')),
      mapUrl: '',
      notes: String(f.get('notes') || ''),
      imgs,
      addedBy: String(f.get('addedBy') || '').trim(),
    };
    if (!fields.name) return;

    close();
    if (editSpot) {
      update((d) => {
        const t = d.spots.find((x) => x.id === editSpot.id);
        if (t) Object.assign(t, fields);
      });
      return;
    }
    update((d) => { d.spots.push({ id: uid(), ...fields, at: new Date().toISOString() }); });
  };

  const submitDungeon = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const files = (f.getAll('maps') as File[]).filter((x) => x && x.size);

    let imgs = dungeonImgs;
    if (files.length && cfg) {
      setBusy(true);
      setErr('');
      try {
        const uploaded = await Promise.all(files.map((file) => uploadImage(cfg, file)));
        imgs = [...imgs, ...uploaded.filter(Boolean)];
      } catch {
        setBusy(false);
        setErr('Map upload failed. Save without it, or try smaller images.');
        return;
      }
      setBusy(false);
    }

    const fields = {
      name: String(f.get('name') || '').trim(),
      location: String(f.get('location') || '').trim(),
      recommended: Math.max(0, Number(f.get('recommended') || 0)),
      difficulty,
      notes: String(f.get('notes') || ''),
      x: coordOrEmpty(String(f.get('x') || '')),
      y: coordOrEmpty(String(f.get('y') || '')),
      imgs,
      addedBy: String(f.get('addedBy') || '').trim(),
    };
    if (!fields.name) return;

    close();
    if (editDungeon) {
      update((d) => {
        const t = d.dungeons.find((x) => x.id === editDungeon.id);
        if (t) Object.assign(t, fields);
      });
      return;
    }
    update((d) => { d.dungeons.push({ id: uid(), ...fields, at: new Date().toISOString() }); });
  };

  const submitLedger = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const l: LedgerEntry = {
      id: uid(), type: ledgerType,
      amount: Number(f.get('amount') || 0),
      desc: String(f.get('desc')),
      by: String(f.get('by') || '').trim(),
      at: new Date().toISOString(),
    };
    close();
    update((d) => { d.ledger.push(l); });
  };

  const submitMember = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const m: Member = {
      id: uid(),
      name: String(f.get('name')).trim(),
      role: memberRole === NO_ROLE ? '' : memberRole,
      joined: new Date().toISOString(),
      log: [],
    };
    close();
    update((d) => { d.members.push(m); });
  };

  const footer = (label: string) => (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={close}>Cancel</Button>
      <Button type="submit" disabled={busy}>{busy ? 'Working…' : label}</Button>
    </DialogFooter>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{titles[modal]}</DialogTitle>
          {modal === 'sync' && (
            <DialogDescription>
              Every change is written to the guild database straight away and re-read every
              10 seconds, so the whole roster sees the same board.
            </DialogDescription>
          )}
        </DialogHeader>

        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

        {modal === 'job' && (
          <form onSubmit={submitJob} className="space-y-4">
            <Field label="Job name" htmlFor="job-name">
              <Input id="job-name" name="name" required defaultValue={editJob?.name ?? ""} placeholder="e.g. Clear the Valtheim towers" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Posted for (client)" htmlFor="job-client">
                <NameField id="job-client" name="client" options={memberNames} required
                  defaultValue={editJob?.client ?? ""} placeholder="Pick a member or write anyone in" />
              </Field>
              <Field label="Posted by" htmlFor="job-poster">
                <NameField id="job-poster" name="postedBy" options={memberNames} required
                  defaultValue={editJob?.postedBy ?? (memberNames[0] || '')} placeholder="Pick a member or write in" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact / where found" htmlFor="job-contact">
                <Input id="job-contact" name="contact" defaultValue={editJob?.contact ?? ""} placeholder="e.g. Bannered Mare, evenings" />
              </Field>
              <Field label="Faction association" htmlFor="job-faction">
                <Input id="job-faction" name="faction" defaultValue={editJob?.faction ?? ""} placeholder="e.g. Companions (optional)" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job tag">
                <Select value={tag} onValueChange={pickTag}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAGS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={priority} onValueChange={(v) => setPriority(v ?? PRIORITIES[0])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Description" htmlFor="job-desc">
              <Textarea id="job-desc" name="description" rows={3} defaultValue={editJob?.description ?? ""} placeholder="What the client needs done" />
            </Field>

            {/* Reward: septims, items, or both. */}
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Reward
              </p>
              <Field label="Septims" htmlFor="job-reward">
                <Input id="job-reward" name="reward" type="number" min={0} defaultValue={editJob?.reward ? String(editJob.reward) : ""} placeholder="500" />
              </Field>
              <div className="space-y-1.5">
                <Label className="text-xs">Item rewards</Label>
                <ItemPicker targets={itemRewards} setTargets={setItemRewards} label="Search items to offer…" />
              </div>
            </div>

            {/* Time limit: a fixed date, or a span from now. */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Time limit
              </p>
              <Select value={deadlineMode} onValueChange={(v) => setDeadlineMode((v as typeof deadlineMode) || 'none')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No time limit</SelectItem>
                  <SelectItem value="in">A set time from now</SelectItem>
                  <SelectItem value="date">By a specific date</SelectItem>
                </SelectContent>
              </Select>

              {deadlineMode === 'date' && (
                <Input id="job-deadline" name="deadline" type="date" required defaultValue={toDateInput(editJob?.deadline ?? "")} />
              )}

              {deadlineMode === 'in' && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={1} value={durationAmount}
                    aria-label="Amount of time"
                    className="w-24"
                    onChange={(e) => setDurationAmount(Math.max(1, Number(e.target.value || 1)))}
                  />
                  <Select value={durationUnit} onValueChange={(v) => setDurationUnit((v as DurationUnit) || 'weeks')}>
                    <SelectTrigger className="flex-1" aria-label="Unit of time"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="shrink-0 text-xs text-muted-foreground">from now</span>
                </div>
              )}
            </div>

            <Label className="flex items-center gap-2.5 text-sm font-normal">
              <Checkbox checked={collection} onCheckedChange={(v) => setCollection(v === true)} />
              This is a collection job (members turn in items over time)
            </Label>

            {collection && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Items to collect
                </p>
                <ItemPicker targets={targets} setTargets={setTargets} />
                <p className="text-xs text-muted-foreground">
                  Any septim reward is split by how much of these totals each member delivers, after
                  the guild’s 25% cut.
                </p>
              </div>
            )}

            {footer('Post job')}
          </form>
        )}

        {modal === 'barrel' && (
          <form onSubmit={submitBarrel} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Renter" htmlFor="barrel-owner">
                <NameField id="barrel-owner" name="owner" options={memberNames} required
                  defaultValue={editBarrel?.owner ?? (memberNames[0] || '')} placeholder="Pick a member or write in" />
              </Field>
              <Field label="Weekly rate (septims)" htmlFor="barrel-rate">
                <Input id="barrel-rate" name="rate" type="number" min={0} defaultValue={editBarrel?.rate ?? 50} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rented from" htmlFor="barrel-start">
                <Input id="barrel-start" name="start" type="date" required defaultValue={toDateInput(editBarrel?.start ?? '')} />
              </Field>
              <Field label="Rented until" htmlFor="barrel-end">
                <Input id="barrel-end" name="end" type="date" required defaultValue={toDateInput(editBarrel?.end ?? '')} />
              </Field>
            </div>

            <Field label="Location notes" htmlFor="barrel-notes">
              <Input id="barrel-notes" name="notes" defaultValue={editBarrel?.notes ?? ''} placeholder="e.g. Riverwood, behind the smithy" />
            </Field>

            <Field label={editBarrel?.img ? 'Replace location screenshot' : 'Location screenshot'} htmlFor="barrel-shot">
              <Input id="barrel-shot" name="shot" type="file" accept="image/*" className="cursor-pointer" />
            </Field>
            {editBarrel?.img && (
              <img src={editBarrel.img} alt="Current location" className="h-28 w-full rounded-lg border object-cover" />
            )}

            <div className="space-y-2.5">
              <Label className="flex items-center gap-2.5 text-sm font-normal">
                <Checkbox checked={guildMember} onCheckedChange={(v) => setGuildMember(v === true)} />
                Guild member storage
              </Label>
              <Label className="flex items-center gap-2.5 text-sm font-normal">
                <Checkbox checked={paid} onCheckedChange={(v) => setPaid(v === true)} />
                Paid
              </Label>
            </div>

            {footer(editBarrel ? 'Save storage' : 'Add storage')}
          </form>
        )}

        {modal === 'spot' && (
          <form onSubmit={submitSpot} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="sp-name">
                <Input id="sp-name" name="name" required autoFocus
                  defaultValue={editSpot?.name ?? ''} placeholder="e.g. Halted Stream iron veins" />
              </Field>
              <Field label="Kind">
                {/* Controlled, because choosing Dungeon changes which fields
                    the form shows and where the record ends up being saved. */}
                <Select value={spotKind || NO_KIND} onValueChange={(v) => setSpotKind(!v || v === NO_KIND ? '' : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_KIND}>Unspecified</SelectItem>
                    {SPOT_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Location" htmlFor="sp-location">
              <Input id="sp-location" name="location"
                defaultValue={editSpot?.location ?? ''}
                placeholder="e.g. Halted Stream Camp, north of Whiterun" />
            </Field>

            {isDungeonKind ? (
              <div className="space-y-3 rounded-lg border border-sky-500/25 bg-sky-500/10 p-3">
                <p className="text-xs text-sky-700 dark:text-sky-400">
                  Dungeons live in the Dungeons section, so this will be saved there rather than as a
                  gathering point — one record per cave, with its position on the map.
                </p>
                <Field label="Attach to an existing dungeon">
                  {/* Controlled so the form can hide the create-new fields once
                      an existing dungeon is chosen. */}
                  <Select
                    value={attachDungeon || NO_KIND}
                    onValueChange={(v) => setAttachDungeon(!v || v === NO_KIND ? '' : v)}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_KIND}>Create a new dungeon</SelectItem>
                      {dungeons.slice().sort((a, b) => a.name.localeCompare(b.name)).map((g) => (
                        <SelectItem key={g.id} value={g.name}>
                          {g.name}{g.x && g.y ? ' (already placed)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {!attachedDungeon && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Recommended party" htmlFor="sp-rec">
                      <Input id="sp-rec" name="recommended" type="number" min={0} placeholder="2" />
                    </Field>
                    <Field label="Difficulty" htmlFor="sp-diff">
                      <NameField name="difficulty" options={DIFFICULTIES} defaultValue=""
                        placeholder="Easy, Moderate…" id="sp-diff" />
                    </Field>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Yield" htmlFor="sp-yield">
                  <Input id="sp-yield" name="yield"
                    defaultValue={editSpot?.yield ?? ''} placeholder="e.g. 8 iron veins + transmute" />
                </Field>
                <Field label="Respawn" htmlFor="sp-respawn">
                  <Input id="sp-respawn" name="respawn"
                    defaultValue={editSpot?.respawn ?? ''} placeholder="e.g. every 10 days" />
                </Field>
              </div>
            )}

            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Map
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="X" htmlFor="sp-x">
                  <Input id="sp-x" name="x" inputMode="numeric"
                    defaultValue={editSpot?.x ?? newSpotAt?.x ?? ''} placeholder="-5782" />
                </Field>
                <Field label="Y" htmlFor="sp-y">
                  <Input id="sp-y" name="y" inputMode="numeric"
                    defaultValue={editSpot?.y ?? newSpotAt?.y ?? ''} placeholder="23050" />
                </Field>
                {editSpot && (
                  <Field label="Reposition">
                    <Button
                      type="button" variant="outline"
                      onClick={() => onPickOnMap('spot', editSpot.id)}
                    >
                      <MapPinPlus />
                      Pick on map
                    </Button>
                  </Field>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Skyrim world coordinates build a{' '}
                <a href="https://gamemap.uesp.net/sr/" target="_blank" rel="noreferrer" className="underline">
                  UESP map
                </a>{' '}
                link automatically — read them off the UESP map's address bar, or from{' '}
                <code className="text-[11px]">getpos</code> in the console.              </p>
            </div>

            <Field label="Notes" htmlFor="sp-notes">
              <Textarea id="sp-notes" name="notes" rows={3}
                defaultValue={editSpot?.notes ?? ''}
                placeholder="Route in, what guards it, anything worth knowing" />
            </Field>

            <Field label="Screenshots" htmlFor="sp-shots">
              <Input id="sp-shots" name="shots" type="file" accept="image/*" multiple className="cursor-pointer" />
            </Field>

            {spotImgs.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {spotImgs.map((src) => (
                  <div key={src} className="relative">
                    <img src={src} alt="Spot" className="h-20 w-full rounded-md border object-cover" />
                    <Button
                      type="button" variant="destructive" size="icon-xs"
                      className="absolute right-1 top-1" aria-label="Remove screenshot"
                      onClick={() => setSpotImgs((list) => list.filter((u) => u !== src))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Field label="Added by" htmlFor="sp-by">
              <NameField id="sp-by" name="addedBy" options={memberNames} required
                defaultValue={editSpot?.addedBy ?? (memberNames[0] || '')}
                placeholder="Pick a member or write in" />
            </Field>

            {footer(editSpot ? 'Save point' : 'Add point')}
          </form>
        )}

        {modal === 'dungeon' && (
          <form onSubmit={submitDungeon} className="space-y-4">
            <Field label="Dungeon name" htmlFor="dg-name">
              <Input id="dg-name" name="name" required autoFocus
                defaultValue={editDungeon?.name ?? ''} placeholder="e.g. Bleak Falls Barrow" />
            </Field>

            <Field label="Location" htmlFor="dg-location">
              <Input id="dg-location" name="location"
                defaultValue={editDungeon?.location ?? ''}
                placeholder="e.g. Above Riverwood, up the mountain path" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recommended party size" htmlFor="dg-rec">
                <Input id="dg-rec" name="recommended" type="number" min={1}
                  defaultValue={editDungeon?.recommended || 2} />
              </Field>
              <Field label="Difficulty">
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v ?? DIFFICULTIES[1])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="X" htmlFor="dg-x">
                <Input id="dg-x" name="x" inputMode="numeric"
                  defaultValue={editDungeon?.x ?? newDungeonAt?.x ?? ''} placeholder="optional" />
              </Field>
              <Field label="Y" htmlFor="dg-y">
                <Input id="dg-y" name="y" inputMode="numeric"
                  defaultValue={editDungeon?.y ?? newDungeonAt?.y ?? ''} placeholder="or place it on the map" />
              </Field>
              {editDungeon && (
                <Field label="Reposition">
                  <Button
                    type="button" variant="outline"
                    onClick={() => onPickOnMap('dungeon', editDungeon.id)}
                  >
                    <MapPinPlus />
                    Pick on map
                  </Button>
                </Field>
              )}
            </div>

            <Field label="Notes" htmlFor="dg-notes">
              <Textarea id="dg-notes" name="notes" rows={3}
                defaultValue={editDungeon?.notes ?? ''}
                placeholder="What's inside, what to watch out for, best approach" />
            </Field>

            <Field label="Map screenshots" htmlFor="dg-maps">
              <Input id="dg-maps" name="maps" type="file" accept="image/*" multiple className="cursor-pointer" />
            </Field>

            {dungeonImgs.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {dungeonImgs.map((src) => (
                  <div key={src} className="relative">
                    <img src={src} alt="Map" className="h-20 w-full rounded-md border object-cover" />
                    <Button
                      type="button" variant="destructive" size="icon-xs"
                      className="absolute right-1 top-1" aria-label="Remove map"
                      onClick={() => setDungeonImgs((list) => list.filter((u) => u !== src))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Field label="Added by" htmlFor="dg-by">
              <NameField id="dg-by" name="addedBy" options={memberNames} required
                defaultValue={editDungeon?.addedBy ?? (memberNames[0] || '')}
                placeholder="Pick a member or write in" />
            </Field>

            {footer(editDungeon ? 'Save dungeon' : 'Add dungeon')}
          </form>
        )}

        {modal === 'ledger' && (
          <form onSubmit={submitLedger} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <Select value={ledgerType} onValueChange={(v) => setLedgerType(v as LedgerEntry['type'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Spending</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Amount (septims)" htmlFor="ledger-amount">
                <Input id="ledger-amount" name="amount" type="number" min={1} required placeholder="250" />
              </Field>
            </div>

            <Field label="Description" htmlFor="ledger-desc">
              <Input id="ledger-desc" name="desc" required placeholder="e.g. Bounty payout — Valtheim towers" />
            </Field>

            <Field label="Recorded by" htmlFor="ledger-by">
              <NameField id="ledger-by" name="by" options={memberNames} required
                defaultValue={memberNames[0] || ''} placeholder="Pick a member or write in" />
            </Field>

            {footer('Record')}
          </form>
        )}

        {modal === 'member' && (
          <form onSubmit={submitMember} className="space-y-4">
            <Field label="Name" htmlFor="member-name">
              <Input id="member-name" name="name" required placeholder="e.g. Lydia of Whiterun" />
            </Field>
            <Field label="Role">
              <Select value={memberRole} onValueChange={(v) => setMemberRole(v || NO_ROLE)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROLE}>No role</SelectItem>
                  {roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {roles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No roles exist yet — create them under Roles, then assign them here or on the roster.
              </p>
            )}
            {footer('Add member')}
          </form>
        )}

        {modal === 'role' && (
          <form onSubmit={submitRole} className="space-y-4">
            <Field label="Role name" htmlFor="role-name">
              <Input
                id="role-name" name="name" required autoFocus
                defaultValue={editRole?.name ?? ''} placeholder="e.g. Quartermaster"
              />
            </Field>
            <Field label="What this role does (optional)" htmlFor="role-desc">
              <Textarea
                id="role-desc" name="desc" rows={2}
                defaultValue={editRole?.desc ?? ''}
                placeholder="e.g. Keeps the stores and logs turn-ins"
              />
            </Field>
            {/* Progression track: how a member graduates out of this role.
                This is what models blooding — Initiate, 3 credits, Saberblooded. */}
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Progression (optional)
              </p>
              <Field label="Advances to">
                <Select value={advanceRole} onValueChange={(v) => setAdvanceRole(v || NO_ROLE)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>No progression</SelectItem>
                    {roles
                      .filter((r) => r.id !== editRole?.id)
                      .map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {advanceRole !== NO_ROLE && (
                <Field label="Completions required" htmlFor="role-after">
                  <Input
                    id="role-after" name="advanceAfter" type="number" min={1}
                    defaultValue={editRole?.advanceAfter || 3}
                  />
                </Field>
              )}
              <p className="text-xs text-muted-foreground">
                Members in this role get a progress bar on the roster, and can be promoted once they
                hit the number of logged completions.
              </p>
            </div>

            {editRole && (
              <p className="text-xs text-muted-foreground">
                Renaming this role updates everyone currently holding it.
              </p>
            )}
            {footer(editRole ? 'Save role' : 'Create role')}
          </form>
        )}

        {modal === 'sync' && (
          <div className="space-y-4">
            {sync === 'synced' && (
              <Alert className="border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <AlertDescription>Connected — your edits are live for the whole guild.</AlertDescription>
              </Alert>
            )}
            {sync === 'syncing' && (
              <Alert className="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertDescription>Saving to the guild database…</AlertDescription>
              </Alert>
            )}
            {sync === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>
                  {offline
                    ? 'Can’t reach the server. You’re looking at the last synced copy — changes made now may not stick.'
                    : 'The last save failed. The app keeps retrying automatically.'}
                </AlertDescription>
              </Alert>
            )}

            {readOnly && (
              <Alert className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400">
                <AlertDescription>
                  You’re viewing as a guest — you can read the board but not change it. Sign out and
                  enter the guild password to edit.
                </AlertDescription>
              </Alert>
            )}

            {!readOnly && (
              <form onSubmit={submitSettings} className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payout
                </p>
                <div className="flex items-end gap-2">
                  <Field label="Guild cut (%)" htmlFor="guild-cut" className="flex-1">
                    <Input
                      id="guild-cut" type="number" min={0} max={100} step={1}
                      value={cutPct}
                      onChange={(e) => setCutPct(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" disabled={!cutDirty}>Save</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The guild keeps this share of every collection job's septim reward; members split
                  the remaining {100 - (Number(cutPct) || 0)}% by how much they delivered. Changing it
                  re-splits every job, including finished ones.
                </p>
              </form>
            )}

            <p className="text-sm text-muted-foreground">
              Signing out clears this browser’s copy and returns you to the password screen. It does
              not delete anything from the guild database.
            </p>

            <DialogFooter>
              <Button variant="destructive" className="sm:mr-auto" onClick={onLogout}>Sign out</Button>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
