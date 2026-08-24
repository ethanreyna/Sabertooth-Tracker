import { useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { FileImage, ScanText, Wand2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TonedBadge } from '@/components/bits';
import { NoVisionError, readScreenshot } from '@/sync';
import { parseImport } from '@/lib/parse-import';
import type { Draft } from '@/lib/parse-import';
import { sep } from '@/lib/format';
import type { SyncCfg } from '@/types';

const PASTE_HELP =
  'Paste the post — select the message in Discord, copy, and paste here. '
  + 'Or drop in a screenshot and it will be read for you.';

/**
 * Turns a Discord job-board or storage post into a draft record.
 *
 * Two ways in, because they fail differently: pasted text is exact and always
 * available, while a screenshot has to go through a vision model that may be
 * unavailable or misread a word. Either way the result opens in the normal form
 * for review — nothing is saved from here.
 */
export function ImportDialog({ cfg, close, onUse }: {
  cfg: SyncCfg;
  close: () => void;
  onUse: (draft: Draft) => void;
}) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const read = (raw: string) => {
    setErr('');
    const trimmed = raw.trim();
    if (!trimmed) { setErr('Nothing to read yet — paste the post first.'); return; }
    setDraft(parseImport(trimmed));
  };

  const readImage = async (file: File) => {
    setBusy(true);
    setErr('');
    setNote('');
    try {
      const got = await readScreenshot(cfg, file);
      setText(got);
      if (got.trim()) {
        setDraft(parseImport(got));
        setNote('Read from the screenshot — check it against the picture before saving.');
      } else {
        setErr('Nothing legible came back. Paste the post’s text instead.');
      }
    } catch (e) {
      setErr(e instanceof NoVisionError
        ? 'Reading screenshots isn’t switched on for this site. Paste the post’s text instead — it works the same and is more accurate.'
        : e instanceof Error ? e.message : 'Could not read that screenshot.');
    } finally {
      setBusy(false);
    }
  };

  // A screenshot pasted straight from the clipboard is the common case: Discord
  // screenshots usually get there via a snipping tool, not a saved file.
  const onPaste = (e: ClipboardEvent) => {
    const img = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
    if (!img) return;
    const file = img.getAsFile();
    if (!file) return;
    e.preventDefault();
    void readImage(file);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import from the job board</DialogTitle>
          <DialogDescription>{PASTE_HELP}</DialogDescription>
        </DialogHeader>

        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        {note && <Alert><ScanText /><AlertDescription>{note}</AlertDescription></Alert>}

        <div className="space-y-4">
          <Textarea
            rows={9}
            value={text}
            onChange={(e) => { setText(e.target.value); setDraft(null); }}
            onPaste={onPaste}
            placeholder={'Name of Client: loses-the-way\n\nDescription of Job request: Collect the following:\n300 Imp Stool\n…'}
            className="font-mono text-xs"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => read(text)} disabled={busy}>
              <Wand2 />Read it
            </Button>
            <Button
              type="button" variant="outline" disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <FileImage />{busy ? 'Reading screenshot…' : 'Use a screenshot'}
            </Button>
            <Input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void readImage(f);
              }}
            />
          </div>

          {draft && <Preview draft={draft} />}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="button" disabled={!draft} onClick={() => { if (draft) onUse(draft); }}>
            {draft?.kind === 'barrel' ? 'Open in the storage form' : 'Open in the job form'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Preview({ draft }: { draft: Draft }) {
  const list = (targets: Array<{ item: string; qty: number }>) =>
    targets.map((t) => `${sep(t.qty)} × ${t.item}`).join(', ');

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <TonedBadge tone="blue">{draft.kind === 'barrel' ? 'Storage' : 'Job'}</TonedBadge>
        {draft.missing.length > 0 && (
          <TonedBadge tone="amber">Still needs: {draft.missing.join(', ')}</TonedBadge>
        )}
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
        {draft.kind === 'job' ? (
          <>
            {draft.name && <Line label="Job">{draft.name}</Line>}
            {draft.client && <Line label="Posted for">{draft.client}</Line>}
            {draft.contact && <Line label="Contact">{draft.contact}</Line>}
            {draft.faction && <Line label="Faction / place">{draft.faction}</Line>}
            {draft.items.length > 0 && <Line label="Collect">{list(draft.items)}</Line>}
            {draft.reward > 0 && <Line label="Septims">{sep(draft.reward)}</Line>}
            {draft.itemRewards.length > 0 && <Line label="Item reward">{list(draft.itemRewards)}</Line>}
            {draft.deadlineText && <Line label="Time limit">{draft.deadlineText}</Line>}
            {draft.description && <Line label="Notes">{draft.description}</Line>}
          </>
        ) : (
          <>
            {draft.owner && <Line label="Renter">{draft.owner}</Line>}
            <Line label="Weekly rate">{draft.rate > 0 ? `${sep(draft.rate)} septims` : 'free'}</Line>
            <Line label="Guild member">{draft.guildMember ? 'yes' : 'no'}</Line>
            <Line label="Paid">{draft.paid ? 'yes' : 'no'}</Line>
            {draft.notes && <Line label="Where">{draft.notes}</Line>}
          </>
        )}
      </dl>

      <p className="text-xs text-muted-foreground">
        Nothing is saved yet — this opens in the normal form so you can correct it first.
      </p>
    </div>
  );
}
