import { useState } from 'react';
import { ClipboardList, Wand2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, TonedBadge } from '@/components/bits';
import { parseProjectText } from '@/lib/parse-project';
import type { ParsedProject } from '@/lib/parse-project';
import { sep } from '@/lib/format';

const SAMPLE = 'STRONGHOLD EXPANSION: LONGHOUSE, SETTLEMENT & PALISADE OVERHAUL\n\n'
  + 'STAGE 1: Fortified Palisade, Wooden Gate & Mine Hole Seal\n'
  + '(Upgraded heavy spiked timber palisade walls…)\n'
  + 'Gold: 8,000 Septims\nIron Ingots: 400\n…';

/**
 * Turns a pasted project brief — stages and their cost lists — into a draft
 * for review before anything is saved. The parser has no fixed template (see
 * parse-project.ts): it reads "STAGE 1:" and station-style headings, "Item:
 * qty" lines under them, and skips a repeated grand-total section rather than
 * double-counting it as one more stage.
 */
export function ImportProjectDialog({ close, onCreate }: {
  close: () => void;
  onCreate: (draft: ParsedProject) => void;
}) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<ParsedProject | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const parse = () => {
    const trimmed = text.trim();
    if (!trimmed) { setErr('Paste the project brief first.'); return; }
    const parsed = parseProjectText(trimmed);
    if (parsed.stages.length === 0) {
      setErr('Couldn’t find any "Item: qty" lines under a stage heading. '
        + 'Stages start at a line like "STAGE 1: …" or a heading mentioning stations.');
      setDraft(null);
      return;
    }
    setErr('');
    setDraft(parsed);
    setName(parsed.name || '');
  };

  const create = () => {
    if (!draft) return;
    onCreate({ ...draft, name: name.trim() || 'Untitled project' });
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a project</DialogTitle>
          <DialogDescription>
            Paste the brief — stages, and what each one needs. Nothing is saved until you review
            what came out of it below.
          </DialogDescription>
        </DialogHeader>

        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

        <div className="space-y-4">
          <Textarea
            rows={10}
            value={text}
            onChange={(e) => { setText(e.target.value); setDraft(null); }}
            placeholder={SAMPLE}
            className="font-mono text-xs"
          />

          <Button type="button" onClick={parse}><Wand2 />Read it</Button>

          {draft && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <Field label="Project name" htmlFor="proj-name">
                <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>

              <div className="flex items-center gap-2">
                <ClipboardList className="size-4 text-muted-foreground" />
                <TonedBadge tone="blue">
                  {draft.stages.length} stage{draft.stages.length === 1 ? '' : 's'}
                </TonedBadge>
              </div>

              <div className="space-y-2">
                {draft.stages.map((st, i) => (
                  <div key={i} className="rounded-md border bg-card p-2.5 text-sm">
                    <p className="font-medium">{st.name}</p>
                    {st.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{st.description}</p>
                    )}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {st.requirements.map((r) => `${r.item} (${sep(r.qty)}${r.unit ? ' ' + r.unit : ''})`).join(', ')}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Check the stages above against the brief — a stray line can end up in the wrong
                place. Nothing here is final; every stage and requirement can be edited or removed
                after creating the project.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="button" disabled={!draft} onClick={create}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
