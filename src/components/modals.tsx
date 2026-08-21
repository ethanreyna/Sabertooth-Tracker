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
import { Field, NameField } from '@/components/bits';
import { ItemPicker } from '@/components/item-picker';
import { uploadImage } from '@/sync';
import { uid } from '@/lib/format';
import type { Barrel, CollectionTarget, DB, Job, LedgerEntry, Member, SyncCfg, SyncStatus } from '@/types';

export type ModalKind = 'job' | 'barrel' | 'ledger' | 'member' | 'sync';

const TAGS = ['Resource collection', 'Kill', 'Arrest', 'Guard', 'Escort', 'Delivery', 'Other'];
const PRIORITIES = ['Normal', 'Low', 'High', 'Urgent'];

export function Modals({ modal, close, memberNames, update, setJobsView, cfg, sync, offline, onLogout }: {
  modal: ModalKind; close: () => void; memberNames: string[];
  update: (fn: (d: DB) => void) => void; setJobsView: () => void;
  cfg: SyncCfg | null; sync: SyncStatus; offline: boolean; onLogout: () => void;
}) {
  const [collection, setCollection] = useState(false);
  const [paid, setPaid] = useState(false);
  const [targets, setTargets] = useState<CollectionTarget[]>([]);
  const [tag, setTag] = useState(TAGS[0]);
  const [priority, setPriority] = useState(PRIORITIES[0]);
  const [ledgerType, setLedgerType] = useState<LedgerEntry['type']>('income');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const titles: Record<ModalKind, string> = {
    job: 'Post a job',
    barrel: 'Track a barrel',
    ledger: 'Record a ledger entry',
    member: 'Add a member',
    sync: 'Guild database',
  };

  const submitJob = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const job: Job = {
      id: uid(),
      name: String(f.get('name')),
      client: String(f.get('client') || '').trim(),
      contact: String(f.get('contact') || '').trim(),
      faction: String(f.get('faction') || '').trim(),
      tag, priority,
      reward: Number(f.get('reward') || 0),
      description: String(f.get('description') || ''),
      postedBy: String(f.get('postedBy') || '').trim(),
      postedAt: new Date().toISOString(),
      deadline: f.get('deadline') ? new Date(String(f.get('deadline'))).toISOString() : '',
      status: 'open', claimedBy: '',
      collection, items: targets, entries: [],
    };
    close();
    setJobsView();
    update((d) => { d.jobs.push(job); });
  };

  const submitBarrel = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get('shot') as File | null;

    let img = '';
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

    const b: Barrel = {
      id: uid(),
      owner: String(f.get('owner') || '').trim(),
      paid,
      rate: Number(f.get('rate') || 50),
      start: f.get('start') ? new Date(String(f.get('start'))).toISOString() : '',
      end: f.get('end') ? new Date(String(f.get('end'))).toISOString() : '',
      notes: String(f.get('notes') || ''),
      img, at: new Date().toISOString(),
    };
    close();
    update((d) => { d.barrels.push(b); });
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
      role: String(f.get('role') || 'Member'),
      joined: new Date().toISOString(),
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
              <Input id="job-name" name="name" required placeholder="e.g. Clear the Valtheim towers" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Posted for (client)" htmlFor="job-client">
                <NameField id="job-client" name="client" listId="dl-clients" options={memberNames} required
                  placeholder="Pick a member or write anyone in" />
              </Field>
              <Field label="Posted by" htmlFor="job-poster">
                <NameField id="job-poster" name="postedBy" listId="dl-posters" options={memberNames} required
                  defaultValue={memberNames[0] || ''} placeholder="Pick a member or write in" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact / where found" htmlFor="job-contact">
                <Input id="job-contact" name="contact" placeholder="e.g. Bannered Mare, evenings" />
              </Field>
              <Field label="Faction association" htmlFor="job-faction">
                <Input id="job-faction" name="faction" placeholder="e.g. Companions (optional)" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Job tag">
                <Select value={tag} onValueChange={(v) => setTag(v ?? TAGS[0])}>
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
              <Field label="Reward (septims)" htmlFor="job-reward">
                <Input id="job-reward" name="reward" type="number" min={0} placeholder="500" />
              </Field>
            </div>

            <Field label="Description" htmlFor="job-desc">
              <Textarea id="job-desc" name="description" rows={3} placeholder="What the client needs done" />
            </Field>

            <Field label="Time limit (optional)" htmlFor="job-deadline">
              <Input id="job-deadline" name="deadline" type="date" />
            </Field>

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
              </div>
            )}

            {footer('Post job')}
          </form>
        )}

        {modal === 'barrel' && (
          <form onSubmit={submitBarrel} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Renter" htmlFor="barrel-owner">
                <NameField id="barrel-owner" name="owner" listId="dl-renters" options={memberNames} required
                  defaultValue={memberNames[0] || ''} placeholder="Pick a member or write in" />
              </Field>
              <Field label="Weekly rate (septims)" htmlFor="barrel-rate">
                <Input id="barrel-rate" name="rate" type="number" min={0} defaultValue={50} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rented from" htmlFor="barrel-start">
                <Input id="barrel-start" name="start" type="date" required />
              </Field>
              <Field label="Rented until" htmlFor="barrel-end">
                <Input id="barrel-end" name="end" type="date" required />
              </Field>
            </div>

            <Field label="Location notes" htmlFor="barrel-notes">
              <Input id="barrel-notes" name="notes" placeholder="e.g. Riverwood, behind the smithy" />
            </Field>

            <Field label="Location screenshot" htmlFor="barrel-shot">
              <Input id="barrel-shot" name="shot" type="file" accept="image/*" className="cursor-pointer" />
            </Field>

            <Label className="flex items-center gap-2.5 text-sm font-normal">
              <Checkbox checked={paid} onCheckedChange={(v) => setPaid(v === true)} />
              Paid
            </Label>

            {footer('Add barrel')}
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
              <NameField id="ledger-by" name="by" listId="dl-ledger-by" options={memberNames} required
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
            <Field label="Role" htmlFor="member-role">
              <Input id="member-role" name="role" defaultValue="Member" />
            </Field>
            {footer('Add member')}
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
