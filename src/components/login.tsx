import { useState } from 'react';
import type { FormEvent } from 'react';
import { Moon, Shield, Sun } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/bits';
import { AuthError } from '@/sync';
import type { Theme } from '@/types';

/** The password gate. Nothing renders behind this until the server says yes. */
export function Login({ onLogin, theme, toggleTheme }: {
  onLogin: (password: string) => Promise<void>;
  theme: Theme;
  toggleTheme: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onLogin(password.trim());
    } catch (e2) {
      setErr(e2 instanceof AuthError
        ? 'That password was rejected. Check it with your guildmaster.'
        : 'Could not reach the guild server. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Keizaal</p>
              <p className="text-sm font-bold tracking-tight">Sabertooth Adventurers</p>
            </div>
            <Button
              type="button" variant="ghost" size="icon-sm" onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Enter the guild password to open the shared job board, barrel register, and ledger.
            Everything you change is saved to the guild database and shows up for everyone else.
          </p>

          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

          <form onSubmit={submit} className="space-y-3">
            <Field label="Guild password" htmlFor="guild-password">
              <Input
                id="guild-password" type="password" value={password} autoFocus
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ask your guildmaster" autoComplete="current-password"
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || !password.trim()}>
              {busy ? 'Checking…' : 'Enter the guild hall'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
