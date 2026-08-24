import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, NameField } from '@/components/bits';
import { ALL_ITEM_NAMES } from '@/items';
import { postSuggestion } from '@/sync';
import type { SuggestionKind, SyncCfg } from '@/types';

const TAGS = ['Resource collection', 'Kill', 'Arrest', 'Guard', 'Escort', 'Delivery', 'Other'];

const SENT: Record<SuggestionKind, string> = {
  job: 'Job suggestion sent. A guild member will review it.',
  ledger: 'Bank entry suggestion sent. A guild member will review it.',
  bankItem: 'Storage item suggestion sent. A guild member will review it.',
};

/**
 * The one thing a guest may write. Nothing here changes the tracker directly —
 * each submission is appended as a pending suggestion that a member approves or
 * denies, so the guest never needs (or gets) write access to the records.
 */
export function Suggest({ cfg, memberNames }: { cfg: SyncCfg; memberNames: string[] }) {
  const [tab, setTab] = useState<SuggestionKind>('job');
  const [tag, setTag] = useState(TAGS[0]);
  const [ledgerType, setLedgerType] = useState('income');
  const [moveType, setMoveType] = useState('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<SuggestionKind | null>(null);
  // NameField holds its text in React state, so form.reset() alone would leave
  // the last name behind. Bumping this remounts the form to genuinely clear it.
  const [seq, setSeq] = useState(0);

  const send = async (
    kind: SuggestionKind,
    form: HTMLFormElement,
    build: (f: FormData) => Record<string, string | number>,
  ) => {
    const f = new FormData(form);
    setBusy(true);
    setErr('');
    try {
      await postSuggestion(cfg, kind, build(f), String(f.get('by') || '').trim(), String(f.get('note') || '').trim());
      form.reset();
      setSeq((n) => n + 1);
      setDone(kind);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send that suggestion.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (
    kind: SuggestionKind,
    build: (f: FormData) => Record<string, string | number>,
  ) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(kind, e.currentTarget, build);
  };

  const who = (
    <Field label="Your name" htmlFor="sg-by">
      <NameField id="sg-by" name="by" options={memberNames} required placeholder="Who is suggesting this?" />
    </Field>
  );

  const note = (
    <Field label="Anything else (optional)" htmlFor="sg-note">
      <Textarea id="sg-note" name="note" rows={2} placeholder="Context for whoever reviews this" />
    </Field>
  );

  const actions = (label: string) => (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={busy}><Send />{busy ? 'Sending…' : label}</Button>
      <p className="text-xs text-muted-foreground">A guild member has to approve it before it appears.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        You are signed in as a guest, so you can read the board but not change it. Anything you send from
        here is queued for a guild member to approve or deny.
      </p>

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
      {done && (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{SENT[done]}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => { setTab((v ? String(v) : 'job') as SuggestionKind); setDone(null); setErr(''); }}
      >
        <TabsList>
          <TabsTrigger value="job">A job</TabsTrigger>
          <TabsTrigger value="ledger">A bank entry</TabsTrigger>
          <TabsTrigger value="bankItem">A storage item</TabsTrigger>
        </TabsList>

        <TabsContent value="job" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <form
                key={'job' + seq}
                className="space-y-4"
                onSubmit={submit('job', (f) => ({
                  name: String(f.get('name') || ''),
                  client: String(f.get('client') || ''),
                  tag,
                  reward: Number(f.get('reward') || 0),
                  description: String(f.get('description') || ''),
                }))}
              >
                <Field label="What needs doing" htmlFor="sg-job-name">
                  <Input id="sg-job-name" name="name" required placeholder="e.g. Clear the bandits at Valtheim Towers" />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Posted for" htmlFor="sg-job-client">
                    <NameField id="sg-job-client" name="client" options={memberNames} placeholder="Who it's for" />
                  </Field>
                  <Field label="Type">
                    <Select value={tag} onValueChange={(v) => setTag(v ? String(v) : TAGS[0])}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TAGS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Septim reward (optional)" htmlFor="sg-job-reward">
                  <Input id="sg-job-reward" name="reward" type="number" min={0} placeholder="500" />
                </Field>

                <Field label="Details" htmlFor="sg-job-desc">
                  <Textarea id="sg-job-desc" name="description" rows={3} placeholder="Where, who, and anything the party should know" />
                </Field>

                {who}
                {note}
                {actions('Suggest this job')}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <form
                key={'ledger' + seq}
                className="space-y-4"
                onSubmit={submit('ledger', (f) => ({
                  type: ledgerType,
                  amount: Number(f.get('amount') || 0),
                  desc: String(f.get('desc') || ''),
                }))}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Type">
                    <Select value={ledgerType} onValueChange={(v) => setLedgerType(v ? String(v) : 'income')}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Spending</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Amount (septims)" htmlFor="sg-bank-amount">
                    <Input id="sg-bank-amount" name="amount" type="number" min={1} required placeholder="250" />
                  </Field>
                </div>

                <Field label="What it was for" htmlFor="sg-bank-desc">
                  <Input id="sg-bank-desc" name="desc" required placeholder="e.g. Bounty payout — Valtheim Towers" />
                </Field>

                {who}
                {note}
                {actions('Suggest this entry')}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bankItem" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <form
                key={'bankItem' + seq}
                className="space-y-4"
                onSubmit={submit('bankItem', (f) => ({
                  type: moveType,
                  item: String(f.get('item') || ''),
                  qty: Number(f.get('qty') || 1),
                  note: String(f.get('itemNote') || ''),
                }))}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Movement">
                    <Select value={moveType} onValueChange={(v) => setMoveType(v ? String(v) : 'in')}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in">Put into guild storage</SelectItem>
                        <SelectItem value="out">Took out of guild storage</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Quantity" htmlFor="sg-item-qty">
                    <Input id="sg-item-qty" name="qty" type="number" min={1} defaultValue={1} required />
                  </Field>
                </div>

                <Field label="Item" htmlFor="sg-item-name">
                  <NameField id="sg-item-name" name="item" options={ALL_ITEM_NAMES} required
                    placeholder="Search Skyrim items, or write one in" />
                </Field>

                <Field label="Where it went (optional)" htmlFor="sg-item-note">
                  <Input id="sg-item-note" name="itemNote" placeholder="e.g. Left barrel, Sabretooth hall" />
                </Field>

                {who}
                {note}
                {actions('Suggest this item')}
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
