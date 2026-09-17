import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import type { JobStatus } from '@/types';

/** Coloured status/priority pills. shadcn's Badge only ships neutral variants,
 *  so the semantic colours live here rather than being re-declared everywhere. */
const TONES = {
  green: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
  blue: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  neutral: 'border-border bg-muted text-muted-foreground',
} as const;

export type Tone = keyof typeof TONES;
export { TONES };

export function TonedBadge({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return <Badge variant="outline" className={cn(TONES[tone], className)}>{children}</Badge>;
}

const STATUS_TONE: Record<JobStatus, Tone> = { open: 'green', claimed: 'amber', done: 'neutral' };
const PRIORITY_TONE: Record<string, Tone> = { Low: 'neutral', Normal: 'neutral', High: 'amber', Urgent: 'red' };

export const StatusBadge = ({ status }: { status: JobStatus }) => (
  <TonedBadge tone={STATUS_TONE[status]} className="capitalize">{status}</TonedBadge>
);

export const PriorityBadge = ({ priority }: { priority: string }) => (
  <TonedBadge tone={PRIORITY_TONE[priority] ?? 'neutral'}>{priority}</TonedBadge>
);

/** Label + control, the shape used by every form in the app. */
export function Field({ label, htmlFor, className, children }: {
  label: string; htmlFor?: string; className?: string; children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Options matching what's been typed, best first: the ones that start with it,
 * then the ones that merely contain it, each group in its original order. So
 * typing "dark" puts Dark Water Pass at the top rather than wherever the data
 * happened to leave it.
 */
function rank<T>(items: readonly T[], label: (item: T) => string, q: string): T[] {
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const l = label(item).toLowerCase();
    if (l.startsWith(q)) starts.push(item);
    else if (l.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}

/**
 * A combobox that also accepts anything typed in, for the fields where the
 * suggestion list is help rather than law — a job can be posted for someone
 * who isn't on the roster, and a point of interest can be a kind nobody has
 * used yet.
 *
 * The typed text is mirrored into a hidden input so the surrounding forms keep
 * reading their values straight off FormData. Base UI's own `name` would submit
 * the *selected* item, which would silently drop a written-in value.
 */
export function NameField({ name, options, defaultValue = '', required, placeholder, id, onValueChange }: {
  name: string; options: string[];
  defaultValue?: string; required?: boolean; placeholder?: string; id?: string;
  /** Fires with the text as it changes — typed, picked or cleared. */
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const known = options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
  const q = value.trim().toLowerCase();
  // Matched here and handed over, rather than left to the combobox — see Picker.
  const shown = q ? rank(options, (o) => o, q) : options;

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Combobox
        items={options}
        filteredItems={shown}
        inputValue={value}
        onInputValueChange={(v, details) => {
          // Base UI treats unmatched text as a mistake and wipes it when focus
          // leaves or the popup closes. Here written-in text is a legitimate
          // value — the whole point of this field — so only changes the user
          // actually made get through: typing, picking an item, or pressing
          // the clear button. The automatic resets are ignored.
          const { reason } = details;
          if (reason !== 'input-change' && reason !== 'item-press' && reason !== 'clear-press') return;
          const next = String(v ?? '');
          setValue(next);
          onValueChange?.(next);
        }}
        openOnInputClick
      >
        <ComboboxInput id={id} placeholder={placeholder} required={required} autoComplete="off" />
        <ComboboxContent>
          <ComboboxEmpty>Not on the list — saved as typed.</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {value.trim() !== '' && !known && (
        <p className="text-[11px] text-muted-foreground">New entry — saved as “{value.trim()}”.</p>
      )}
    </>
  );
}

/** One option in a {@link Picker}: the stored value, and what people read. */
export type Choice = { value: string; label: string };

/** Options whose label is the value, which is most of them. */
export const choices = (values: readonly string[]): Choice[] =>
  values.map((v) => ({ value: v, label: v }));

/** "Nothing chosen", as a real option. Its value is empty rather than a
 *  sentinel, so it reads as None wherever it lands and nothing placeholder-
 *  shaped can leak into a record or show up in the box. */
export const NONE: Choice = { value: '', label: 'None' };

/**
 * A searchable dropdown. Every picker in the app is one of these rather than a
 * plain select: the roster, the dungeon list and the item catalogue all grow
 * past the point where scrolling is pleasant, and typing to filter is quicker
 * even on the short lists.
 *
 * Unlike {@link NameField} this only ever yields one of `options` — typing is
 * filtering, not writing in — so "nothing chosen" is a real option carrying an
 * empty value, and reads as whatever it is called (None, Unassigned, …) rather
 * than as a placeholder value that leaks into the box.
 */
export function Picker({ id, value, onValueChange, options, placeholder, className, ariaLabel }: {
  id?: string;
  value: string;
  onValueChange: (v: string) => void;
  options: Choice[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  // A value the list doesn't offer still has to be readable: roles get
  // renamed and old records carry kinds nobody uses any more, and dropping
  // such a value to a blank box would quietly rewrite it on the next save.
  const known = options.find((o) => o.value === value) ?? null;
  const all = known || !value ? options : [...options, { value, label: value }];
  const selected = known ?? (value ? all[all.length - 1] : null);

  // The typed text is tracked here and the matches handed over as
  // `filteredItems`, rather than trusting the combobox to filter on its own:
  // left to itself it showed the whole list unfiltered, with the match sitting
  // wherever the data happened to put it. Ranking is ours too, so a prefix
  // match comes first. Re-opening with a selection shows everything — the
  // selected label isn't a query, it's last time's answer.
  const selectedLabel = selected?.label ?? '';
  const [typed, setTyped] = useState(selectedLabel);
  useEffect(() => { setTyped(selectedLabel); }, [selectedLabel]);
  const q = typed.trim().toLowerCase();
  const shown = q === '' || typed.trim() === selectedLabel ? all : rank(all, (o) => o.label, q);

  return (
    <Combobox<Choice>
      items={all}
      filteredItems={shown}
      value={selected}
      onValueChange={(v) => onValueChange(v ? v.value : '')}
      inputValue={typed}
      onInputValueChange={(v) => setTyped(String(v ?? ''))}
      itemToStringLabel={(o) => o.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      openOnInputClick
      autoHighlight
    >
      <ComboboxInput
        id={id} placeholder={placeholder} aria-label={ariaLabel}
        className={className} autoComplete="off"
      />
      <ComboboxContent>
        <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
        <ComboboxList>
          {(o: Choice) => <ComboboxItem key={o.value} value={o}>{o.label}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
