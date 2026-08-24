import { useState } from 'react';
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
 * A combobox that also accepts anything typed in, for the fields where the
 * suggestion list is help rather than law — a job can be posted for someone
 * who isn't on the roster, and a point of interest can be a kind nobody has
 * used yet.
 *
 * The typed text is mirrored into a hidden input so the surrounding forms keep
 * reading their values straight off FormData. Base UI's own `name` would submit
 * the *selected* item, which would silently drop a written-in value.
 */
export function NameField({ name, options, defaultValue = '', required, placeholder, id }: {
  name: string; options: string[];
  defaultValue?: string; required?: boolean; placeholder?: string; id?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const known = options.some((o) => o.toLowerCase() === value.trim().toLowerCase());

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Combobox
        items={options}
        inputValue={value}
        onInputValueChange={(v) => setValue(String(v ?? ''))}
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

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
