import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MapPinPlus } from 'lucide-react';
import { Field, NONE, NameField, Picker, TonedBadge, choices } from '@/components/bits';
import type { Choice } from '@/components/bits';
import { ItemPicker } from '@/components/item-picker';
import { MapThumb } from '@/components/map-thumb';
import { catalogue } from '@/items';
import { uploadImage } from '@/sync';
import { uid } from '@/lib/format';
import { DUNGEON_STATUSES, STATUS_LABEL, STATUS_TONE, dungeonLabel } from '@/lib/dungeon';
import { cn } from '@/lib/utils';
import { DURATION_UNITS, fromNow } from '@/lib/deadline';
import type { DurationUnit } from '@/lib/deadline';
import { ENCHANTMENT_TIERS, ITEM_CATEGORIES, SPOT_KINDS } from '@/types';
import { coordOrEmpty } from '@/lib/maps';
import type { BankItem, Barrel, CollectionTarget, DB, Dungeon, DungeonStatus, EnchantmentRecord, ItemRecord, Job, LedgerEntry, Member, Role, Settings, Spot, SyncCfg, SyncStatus } from '@/types';
import { durationFromText } from '@/lib/deadline';
import type { BarrelDraft, JobDraft } from '@/lib/parse-import';

export type ModalKind = 'job' | 'barrel' | 'dungeon' | 'spot' | 'ledger' | 'bankItem' | 'item' | 'enchantment' | 'import' | 'member' | 'role' | 'sync';

const DEADLINE_MODES: Choice[] = [
  { value: 'none', label: 'No time limit' },
  { value: 'in', label: 'A set time from now' },
  { value: 'date', label: 'By a specific date' },
];
const LEDGER_TYPES: Choice[] = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Spending' },
];
const BANK_MOVES: Choice[] = [
  { value: 'in', label: 'Put into guild storage' },
  { value: 'out', label: 'Took out of guild storage' },
];
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

export function Modals({ modal, close, roles, settings, memberNames, editRole, editJob, editBarrel, editDungeon, editSpot, editItem, editEnchantment, customItems, draftJob, draftBarrel, dungeons, onPickOnMap, newSpotAt, newSpotKind, newDungeonAt, update, setJobsView, cfg, sync, offline, readOnly, onLogout }: {
  modal: ModalKind; close: () => void; roles: Role[]; settings: Settings; memberNames: string[];
  editRole: Role | null; editJob: Job | null; editBarrel: Barrel | null;
  editDungeon: Dungeon | null; editSpot: Spot | null; editItem: ItemRecord | null;
  editEnchantment: EnchantmentRecord | null;
  /** The guild's own item records, merged with the built-in catalogue for the
   *  item pickers so a job can ask for something the guild added. */
  customItems: ItemRecord[];
  /** A record read off a pasted job-board post, seeding a new form. */
  draftJob: JobDraft | null;
  draftBarrel: BarrelDraft | null;
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
  const items = catalogue(customItems);
  const itemNames = items.map((i) => i.name);

  const [tag, setTag] = useState(editJob?.tag ?? (draftJob?.items.length ? COLLECTION_TAG : TAGS[0]));
  // Resource-collection jobs are collection jobs by definition, so the box is
  // on by default for that tag. Still overridable for the odd exception.
  const [collection, setCollection] = useState(
    editJob ? editJob.collection : draftJob ? draftJob.items.length > 0 : TAGS[0] === COLLECTION_TAG,
  );
  const [paid, setPaid] = useState(editBarrel?.paid ?? draftBarrel?.paid ?? false);
  const [guildMember, setGuildMember] = useState(editBarrel?.guildMember ?? draftBarrel?.guildMember ?? true);
  const [difficulty, setDifficulty] = useState(editDungeon?.difficulty || DIFFICULTIES[1]);
  const [dungeonStatus, setDungeonStatus] = useState<DungeonStatus>(editDungeon?.status ?? 'active');
  const [dungeonImgs, setDungeonImgs] = useState<string[]>(editDungeon?.imgs ?? []);
  const [spotImgs, setSpotImgs] = useState<string[]>(editSpot?.imgs ?? []);
  const [targets, setTargets] = useState<CollectionTarget[]>(editJob?.items ?? draftJob?.items ?? []);
  const [itemRewards, setItemRewards] = useState<CollectionTarget[]>(editJob?.itemRewards ?? draftJob?.itemRewards ?? []);
  const [priority, setPriority] = useState(editJob?.priority ?? PRIORITIES[0]);
  // An imported "3 days" or "complete weekly" seeds the time limit; anything
  // it can't read leaves the form on "no time limit" rather than guessing.
  const imported = draftJob ? durationFromText(draftJob.deadlineText) : null;
  const [deadlineMode, setDeadlineMode] = useState<'none' | 'date' | 'in'>(
    editJob?.deadline ? 'date' : imported ? 'in' : 'none',
  );
  const [durationAmount, setDurationAmount] = useState(imported?.amount ?? 1);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(imported?.unit ?? 'weeks');
  const [ledgerType, setLedgerType] = useState<LedgerEntry['type']>('income');
  const [bankMove, setBankMove] = useState<BankItem['type']>('in');
  const [memberRole, setMemberRole] = useState(roles[0]?.name ?? '');
  const [advanceRole, setAdvanceRole] = useState(editRole?.advanceTo ?? '');
  const [spotKind, setSpotKind] = useState(editSpot?.kind ?? newSpotKind);
  const [attachDungeon, setAttachDungeon] = useState('');
  // Mirrored so the map preview follows what is typed, not just what is saved.
  const [dgX, setDgX] = useState(editDungeon?.x ?? newDungeonAt?.x ?? '');
  const [dgY, setDgY] = useState(editDungeon?.y ?? newDungeonAt?.y ?? '');
  const [itemCategory, setItemCategory] = useState(editItem?.category || ITEM_CATEGORIES[0]);
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
    item: editItem ? 'Edit item' : 'Add an item',
    enchantment: editEnchantment ? 'Edit enchantment' : 'Add an enchantment',
    // Handled by its own dialog; listed so the map of titles stays total.
    import: 'Import from the job board',
    bankItem: 'Log a storage item',
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

    const advanceTo = advanceRole;
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
          chests: Math.min(20, Math.max(0, Number(f.get('chests') || 0))),
          status: 'active',
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
      chests: Math.min(20, Math.max(0, Number(f.get('chests') || 0))),
      status: dungeonStatus,
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

  const submitBankItem = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const b: BankItem = {
      id: uid(), type: bankMove,
      item: String(f.get('item') || '').trim(),
      qty: Math.max(1, Math.round(Number(f.get('qty') || 1))),
      by: String(f.get('by') || '').trim(),
      note: String(f.get('note') || '').trim(),
      at: new Date().toISOString(),
    };
    close();
    update((d) => { d.bankItems.push(b); });
  };

  const submitItem = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim();
    const category = itemCategory.trim();
    const notes = String(f.get('notes') || '').trim();

    // Adding a name the guild already lists would leave two records competing
    // for the same picker entry, so an existing one is updated instead.
    const clash = customItems.find(
      (i) => i.id !== editItem?.id && i.name.trim().toLowerCase() === name.toLowerCase(),
    );
    const targetId = editItem?.id ?? clash?.id ?? null;

    close();
    update((d) => {
      const found = targetId ? d.items.find((i) => i.id === targetId) : null;
      if (found) {
        found.name = name; found.category = category; found.notes = notes;
        return;
      }
      d.items.push({
        id: uid(), name, category, notes,
        // No field asks who added it, and guessing the first name on the roster
        // would put one person's name on everybody's items.
        addedBy: '',
        at: new Date().toISOString(),
      });
    });
  };

  const submitEnchantment = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim();
    if (!name) return;
    const fields = {
      name,
      tier: String(f.get('tier') || '').trim(),
      cost: String(f.get('cost') || '').trim(),
      notes: String(f.get('notes') || '').trim(),
    };
    close();
    update((d) => {
      const found = editEnchantment ? d.enchantments.find((x) => x.id === editEnchantment.id) : null;
      if (found) { Object.assign(found, fields); return; }
      d.enchantments.push({ id: uid(), ...fields, addedBy: '', at: new Date().toISOString() });
    });
  };

  const submitMember = (e: FormEvent<HTMLFormElement>) => {



    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const m: Member = {
      id: uid(),
      name: String(f.get('name')).trim(),
      role: memberRole,
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
              <Input id="job-name" name="name" required defaultValue={editJob?.name ?? draftJob?.name ?? ""} placeholder="e.g. Clear the Valtheim towers" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Posted for (client)" htmlFor="job-client">
                <NameField id="job-client" name="client" options={memberNames} required
                  defaultValue={editJob?.client ?? draftJob?.client ?? ""} placeholder="Pick a member or write anyone in" />
              </Field>
              <Field label="Posted by" htmlFor="job-poster">
                <NameField id="job-poster" name="postedBy" options={memberNames} required
                  defaultValue={editJob?.postedBy ?? ''} placeholder="Pick a member or write in" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact / where found" htmlFor="job-contact">
                <Input id="job-contact" name="contact" defaultValue={editJob?.contact ?? draftJob?.contact ?? ""} placeholder="e.g. Bannered Mare, evenings" />
              </Field>
              <Field label="Faction association" htmlFor="job-faction">
                <Input id="job-faction" name="faction" defaultValue={editJob?.faction ?? draftJob?.faction ?? ""} placeholder="e.g. Companions (optional)" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job tag">
                <Picker value={tag} onValueChange={pickTag} options={choices(TAGS)} ariaLabel="Job tag" />
              </Field>
              <Field label="Priority">
                <Picker
                  value={priority} onValueChange={(v) => setPriority(v || PRIORITIES[0])}
                  options={choices(PRIORITIES)} ariaLabel="Priority"
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="job-desc">
              <Textarea id="job-desc" name="description" rows={3} defaultValue={editJob?.description ?? draftJob?.description ?? ""} placeholder="What the client needs done" />
            </Field>

            {/* Reward: septims, items, or both. */}
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Reward
              </p>
              <Field label="Septims" htmlFor="job-reward">
                <Input id="job-reward" name="reward" type="number" min={0} defaultValue={editJob?.reward ? String(editJob.reward) : draftJob?.reward ? String(draftJob.reward) : ""} placeholder="500" />
              </Field>
              <div className="space-y-1.5">
                <Label className="text-xs">Item rewards</Label>
                <ItemPicker targets={itemRewards} setTargets={setItemRewards} catalogue={items} label="Search items to offer…" />
              </div>
            </div>

            {/* Time limit: a fixed date, or a span from now. */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Time limit
              </p>
              <Picker
                value={deadlineMode}
                onValueChange={(v) => setDeadlineMode((v as typeof deadlineMode) || 'none')}
                options={DEADLINE_MODES} ariaLabel="Time limit"
              />

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
                  <Picker
                    value={durationUnit}
                    onValueChange={(v) => setDurationUnit((v as DurationUnit) || 'weeks')}
                    options={DURATION_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                    className="flex-1" ariaLabel="Unit of time"
                  />
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
                <ItemPicker targets={targets} setTargets={setTargets} catalogue={items} />
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
                  defaultValue={editBarrel?.owner ?? draftBarrel?.owner ?? ''} placeholder="Pick a member or write in" />
              </Field>
              <Field label="Weekly rate (septims)" htmlFor="barrel-rate">
                <Input id="barrel-rate" name="rate" type="number" min={0} defaultValue={editBarrel?.rate ?? draftBarrel?.rate ?? 50} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rented from" htmlFor="barrel-start">
                <Input id="barrel-start" name="start" type="date" required
                  defaultValue={editBarrel ? toDateInput(editBarrel.start) : draftBarrel?.start ?? ''} />
              </Field>
              <Field label="Rented until" htmlFor="barrel-end">
                <Input id="barrel-end" name="end" type="date" required
                  defaultValue={editBarrel ? toDateInput(editBarrel.end) : draftBarrel?.end ?? ''} />
              </Field>
            </div>

            <Field label="Location notes" htmlFor="barrel-notes">
              <Input id="barrel-notes" name="notes" defaultValue={editBarrel?.notes ?? draftBarrel?.notes ?? ''} placeholder="e.g. Riverwood, behind the smithy" />
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
                <Picker
                  value={spotKind} onValueChange={setSpotKind}
                  options={[NONE, ...choices(SPOT_KINDS)]} ariaLabel="Kind"
                />
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
                  <Picker
                    value={attachDungeon} onValueChange={setAttachDungeon}
                    ariaLabel="Attach to an existing dungeon"
                    options={[
                      { value: '', label: 'Create a new dungeon' },
                      ...dungeons.slice().sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({
                        value: g.name,
                        label: dungeonLabel(g) + (g.x && g.y ? ' — already placed' : ''),
                      })),
                    ]}
                  />
                </Field>
                {!attachedDungeon && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Recommended party" htmlFor="sp-rec">
                      <Input id="sp-rec" name="recommended" type="number" min={0} placeholder="2" />
                    </Field>
                    <Field label="Lootable chests" htmlFor="sp-chests">
                      <Input id="sp-chests" name="chests" type="number" min={0} max={20} placeholder="1–3" />
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
                defaultValue={editSpot?.addedBy ?? ''}
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

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Recommended party size" htmlFor="dg-rec">
                <Input id="dg-rec" name="recommended" type="number" min={1}
                  defaultValue={editDungeon?.recommended || 2} />
              </Field>
              <Field label="Lootable chests" htmlFor="dg-chests">
                <Input
                  id="dg-chests" name="chests" type="number" min={0} max={20}
                  defaultValue={editDungeon?.chests ?? ''} placeholder="1–3"
                />
              </Field>
              <Field label="Difficulty">
                <Picker
                  value={difficulty} onValueChange={(v) => setDifficulty(v || DIFFICULTIES[1])}
                  options={choices(DIFFICULTIES)} ariaLabel="Difficulty"
                />
              </Field>
            </div>

            <Field label="Status">
              <div className="flex flex-wrap items-center gap-2">
                {DUNGEON_STATUSES.map((s) => {
                  const selected = dungeonStatus === s;
                  return (
                    // Disabled's own tone is 'neutral' — the same tone an
                    // unselected button uses — so colour alone can't show
                    // which is picked when Disabled is it. The ring can:
                    // it doesn't depend on which tone won.
                    <button
                      key={s} type="button" onClick={() => setDungeonStatus(s)}
                      className={cn(
                        'rounded-full',
                        selected && 'ring-2 ring-offset-2 ring-offset-background ring-foreground/50',
                      )}
                    >
                      <TonedBadge tone={selected ? STATUS_TONE[s] : 'neutral'}>
                        {STATUS_LABEL[s]}
                      </TonedBadge>
                    </button>
                  );
                })}
              </div>
            </Field>
            {dungeonStatus !== 'active' && (
              <p className="-mt-2 text-xs text-muted-foreground">
                {dungeonStatus === 'disabled'
                  ? 'Marked Disabled: shown on the map with an unlit cave marker, so it stays on '
                    + 'record without anyone making a trip for nothing.'
                  : 'Marked Unknown: shown on the map with a "?" marker until someone checks and '
                    + 'sets it one way or the other.'}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="X" htmlFor="dg-x">
                <Input id="dg-x" name="x" inputMode="numeric" value={dgX}
                  onChange={(e) => setDgX(e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Y" htmlFor="dg-y">
                <Input id="dg-y" name="y" inputMode="numeric" value={dgY}
                  onChange={(e) => setDgY(e.target.value)} placeholder="or place it on the map" />
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

            {/* What those numbers actually mean, without leaving the form. */}
            <MapThumb
              x={dgX} y={dgY} zoom={5} radius={2} status={dungeonStatus}
              className="h-44 rounded-lg border"
            />

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
                defaultValue={editDungeon?.addedBy ?? ''}
                placeholder="Pick a member or write in" />
            </Field>

            {footer(editDungeon ? 'Save dungeon' : 'Add dungeon')}
          </form>
        )}

        {modal === 'ledger' && (
          <form onSubmit={submitLedger} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <Picker
                  value={ledgerType}
                  onValueChange={(v) => setLedgerType((v as LedgerEntry['type']) || 'income')}
                  options={LEDGER_TYPES} ariaLabel="Type"
                />
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
                placeholder="Pick a member or write in" />
            </Field>

            {footer('Record')}
          </form>
        )}

        {modal === 'bankItem' && (
          <form onSubmit={submitBankItem} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Movement">
                <Picker
                  value={bankMove}
                  onValueChange={(v) => setBankMove((v as BankItem['type']) || 'in')}
                  options={BANK_MOVES} ariaLabel="Movement"
                />
              </Field>
              <Field label="Quantity" htmlFor="bank-item-qty">
                <Input id="bank-item-qty" name="qty" type="number" min={1} defaultValue={1} required />
              </Field>
            </div>

            <Field label="Item" htmlFor="bank-item-name">
              <NameField id="bank-item-name" name="item" options={itemNames} required
                placeholder="Search Skyrim items, or write one in" />
            </Field>

            <Field label="Where it went (optional)" htmlFor="bank-item-note">
              <Input id="bank-item-note" name="note" placeholder="e.g. Left barrel, Sabretooth hall" />
            </Field>

            <Field label="Logged by" htmlFor="bank-item-by">
              <NameField id="bank-item-by" name="by" options={memberNames} required
                placeholder="Pick a member or write in" />
            </Field>

            {footer('Log it')}
          </form>
        )}

        {modal === 'item' && (
          <form onSubmit={submitItem} className="space-y-4">
            <Field label="Item name" htmlFor="item-name">
              <Input
                id="item-name" name="name" required autoFocus
                defaultValue={editItem?.name ?? ''} placeholder="e.g. Frost Salts"
              />
            </Field>
            <Field label="Category">
              <Picker
                value={itemCategory} onValueChange={setItemCategory}
                options={choices(ITEM_CATEGORIES)} ariaLabel="Category"
              />
            </Field>
            <Field label="Notes (optional)" htmlFor="item-notes">
              <Textarea
                id="item-notes" name="notes" rows={2}
                defaultValue={editItem?.notes ?? ''}
                placeholder="Where it comes from, who buys it, anything worth knowing"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Added items show up everywhere items are picked — collection jobs, item rewards
              and guild storage.
            </p>
            {footer(editItem ? 'Save item' : 'Add item')}
          </form>
        )}

        {modal === 'enchantment' && (
          <form onSubmit={submitEnchantment} className="space-y-4">
            <Field label="Enchantment" htmlFor="ench-name">
              <Input
                id="ench-name" name="name" required autoFocus
                defaultValue={editEnchantment?.name ?? ''}
                placeholder="e.g. Fortify Smithing I (+15 Smithing)"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tier">
                <NameField
                  name="tier" options={ENCHANTMENT_TIERS} id="ench-tier"
                  defaultValue={editEnchantment?.tier ?? ENCHANTMENT_TIERS[0] ?? ''}
                  placeholder="Novice, Advanced…"
                />
              </Field>
              <Field label="Cost" htmlFor="ench-cost">
                <Input
                  id="ench-cost" name="cost"
                  defaultValue={editEnchantment?.cost ?? ''}
                  placeholder="e.g. 80 filled soul gems"
                />
              </Field>
            </div>
            <Field label="Notes (optional)" htmlFor="ench-notes">
              <Textarea
                id="ench-notes" name="notes" rows={2}
                defaultValue={editEnchantment?.notes ?? ''}
                placeholder="What it needs, who can do it, anything worth knowing"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Added enchantments show up on the waitlist form and on guest requests.
            </p>
            {footer(editEnchantment ? 'Save enchantment' : 'Add enchantment')}
          </form>
        )}

        {modal === 'member' && (



          <form onSubmit={submitMember} className="space-y-4">
            <Field label="Name" htmlFor="member-name">
              <Input id="member-name" name="name" required placeholder="e.g. Lydia of Whiterun" />
            </Field>
            <Field label="Role">
              <Picker
                value={memberRole} onValueChange={setMemberRole} ariaLabel="Role"
                options={[NONE, ...choices(roles.map((r) => r.name))]}
              />
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
                <Picker
                  value={advanceRole} onValueChange={setAdvanceRole} ariaLabel="Advances to"
                  options={[
                    NONE,
                    ...choices(roles.filter((r) => r.id !== editRole?.id).map((r) => r.name)),
                  ]}
                />
              </Field>
              {advanceRole !== '' && (
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
