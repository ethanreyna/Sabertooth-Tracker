import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState, TonedBadge } from '@/components/bits';
import { activeFor } from '@/views/enchants';
import type { Tone } from '@/components/bits';
import { ago, uid } from '@/lib/format';
import type { BankItem, DB, Job, LedgerEntry, Suggestion, SuggestionKind } from '@/types';

const KIND_LABEL: Record<SuggestionKind, string> = {
  job: 'Job',
  ledger: 'Bank entry',
  bankItem: 'Storage item',
  enchant: 'Enchantment',
};

const STATUS_TONE: Record<Suggestion['status'], Tone> = {
  pending: 'amber', approved: 'green', denied: 'red',
};

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim();
const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

/** The proposed record, as label/value pairs, so each kind reads plainly. */
function summarize(s: Suggestion): Array<[string, string]> {
  const p = s.payload;
  if (s.kind === 'job') {
    return [
      ['Job', str(p.name)],
      ['Posted for', str(p.client)],
      ['Type', str(p.tag)],
      ['Reward', p.reward ? num(p.reward).toLocaleString() + ' septims' : ''],
      ['Details', str(p.description)],
    ].filter(([, v]) => v !== '') as Array<[string, string]>;
  }
  if (s.kind === 'ledger') {
    return [
      ['Type', str(p.type) === 'expense' ? 'Spending' : 'Income'],
      ['Amount', num(p.amount).toLocaleString() + ' septims'],
      ['Description', str(p.desc)],
    ].filter(([, v]) => v !== '') as Array<[string, string]>;
  }
  if (s.kind === 'enchant') {
    return [
      ['Whose item', str(p.who)],
      ['Item', str(p.item)],
      ['Enchantment', str(p.enchantment)],
      ['Notes', str(p.notes)],
    ].filter(([, v]) => v !== '') as Array<[string, string]>;
  }
  return [
    ['Movement', str(p.type) === 'out' ? 'Took out' : 'Put in'],
    ['Item', str(p.item)],
    ['Quantity', String(num(p.qty) || 1)],
    ['Note', str(p.note)],
  ].filter(([, v]) => v !== '') as Array<[string, string]>;
}

/** Turns an approved suggestion into the real record it was asking for. */
function accept(d: DB, s: Suggestion): void {
  const p = s.payload;
  const at = new Date().toISOString();

  if (s.kind === 'job') {
    const job: Job = {
      id: uid(),
      name: str(p.name) || 'Untitled job',
      client: str(p.client),
      contact: '', faction: '',
      tag: str(p.tag) || 'Other',
      priority: 'Normal',
      reward: num(p.reward),
      itemRewards: [],
      description: str(p.description),
      postedBy: s.by,
      postedAt: at,
      deadline: '',
      status: 'open',
      claimedBy: '',
      collection: false,
      items: [],
      entries: [],
    };
    d.jobs.push(job);
    return;
  }

  if (s.kind === 'ledger') {
    const entry: LedgerEntry = {
      id: uid(),
      type: str(p.type) === 'expense' ? 'expense' : 'income',
      amount: num(p.amount),
      desc: str(p.desc),
      by: s.by,
      at,
    };
    d.ledger.push(entry);
    return;
  }

  if (s.kind === 'enchant') {
    d.enchants.push({
      id: uid(),
      // The owner named in the suggestion, falling back to whoever sent it.
      who: str(p.who) || s.by,
      item: str(p.item),
      enchantment: str(p.enchantment),
      notes: str(p.notes),
      status: 'waiting',
      by: s.by,
      at,
      doneBy: '', doneAt: '',
    });
    return;
  }

  const item: BankItem = {
    id: uid(),
    type: str(p.type) === 'out' ? 'out' : 'in',
    item: str(p.item),
    qty: num(p.qty) || 1,
    by: s.by,
    note: str(p.note),
    at,
  };
  d.bankItems.push(item);
}

function Row({ s, decide }: { s: Suggestion; decide: (id: string, ok: boolean) => void }) {
  const rows = summarize(s);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <TonedBadge tone="blue">{KIND_LABEL[s.kind]}</TonedBadge>
            {s.status !== 'pending' && (
              <TonedBadge tone={STATUS_TONE[s.status]} className="capitalize">{s.status}</TonedBadge>
            )}
            <span className="text-xs text-muted-foreground">
              Suggested by <span className="font-medium text-foreground">{s.by}</span> {ago(s.at)}
            </span>
          </div>

          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs text-muted-foreground sm:pt-0.5">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>

          {s.note && (
            <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              “{s.note}”
            </p>
          )}

          {s.status !== 'pending' && s.decidedBy && (
            <p className="text-xs text-muted-foreground">
              {s.status === 'approved' ? 'Approved' : 'Denied'} by {s.decidedBy} {ago(s.decidedAt)}
            </p>
          )}
        </div>

        {s.status === 'pending' && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => decide(s.id, true)}>
              <Check />Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide(s.id, false)}>
              <X />Deny
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Suggestions({ db, update, memberNames }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  memberNames: string[];
}) {
  const [tab, setTab] = useState('pending');
  const [err, setErr] = useState('');

  const sorted = db.suggestions.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const pending = sorted.filter((s) => s.status === 'pending');
  const decided = sorted.filter((s) => s.status !== 'pending');

  // Whoever is signed in shares one password, so there is no logged-in identity
  // to stamp; the first roster name is the best guess and the log stays honest
  // about being a guess by saying "a member" when the roster is empty.
  const me = memberNames[0] || 'a member';

  const decide = (id: string, ok: boolean) => {
    const s = db.suggestions.find((x) => x.id === id);
    if (!s) return;

    // The waitlist allows one item each, and approving is how a guest's request
    // gets onto it — so the rule has to hold here too. Left pending rather than
    // denied: it becomes approvable again once their current item is done.
    if (ok && s.kind === 'enchant') {
      const who = str(s.payload.who) || s.by;
      const held = activeFor(db.enchants, who);
      if (held) {
        setErr(`${who} already has ${held.item} on the enchanting list — one item each. `
          + 'Mark that one done first, then approve this.');
        return;
      }
    }

    setErr('');
    update((d) => {
      const t = d.suggestions.find((x) => x.id === id);
      if (!t || t.status !== 'pending') return;
      t.status = ok ? 'approved' : 'denied';
      t.decidedBy = me;
      t.decidedAt = new Date().toISOString();
      if (ok) accept(d, t);
    });
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v ? String(v) : 'pending')}>
      {err && (
        <Alert variant="destructive" className="mb-3"><AlertDescription>{err}</AlertDescription></Alert>
      )}
      <TabsList>
        <TabsTrigger value="pending">
          Waiting{pending.length > 0 && <span className="ml-1.5 text-muted-foreground">{pending.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="decided">
          Decided{decided.length > 0 && <span className="ml-1.5 text-muted-foreground">{decided.length}</span>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-4 space-y-3">
        {pending.length === 0
          ? <EmptyState>Nothing waiting. Guests can propose jobs, bank entries, storage items and enchantments, and they land here for approval.</EmptyState>
          : pending.map((s) => <Row key={s.id} s={s} decide={decide} />)}
      </TabsContent>

      <TabsContent value="decided" className="mt-4 space-y-3">
        {decided.length === 0
          ? <EmptyState>No suggestions have been decided yet.</EmptyState>
          : decided.map((s) => <Row key={s.id} s={s} decide={decide} />)}
      </TabsContent>
    </Tabs>
  );
}
