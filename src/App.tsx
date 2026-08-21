import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Coins, LayoutDashboard, Moon, Package, Settings, Shield, Sun, Users, Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Login } from '@/components/login';
import { Modals } from '@/components/modals';
import type { ModalKind } from '@/components/modals';
import { Dashboard } from '@/views/dashboard';
import { Jobs } from '@/views/jobs';
import { Barrels } from '@/views/barrels';
import { Ledger } from '@/views/ledger';
import { Roster } from '@/views/roster';
import { emptyDb } from '@/data';
import { applyTheme, loadTheme } from '@/theme';
import {
  AuthError, ConflictError, clearLocal, loadCfg, loadLocal, pullDb, pushDb, saveCfg, saveLocal,
} from '@/sync';
import { cn } from '@/lib/utils';
import type { DB, SyncCfg, SyncStatus, Theme } from '@/types';

type View = 'dash' | 'jobs' | 'barrels' | 'ledger' | 'roster';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const NAV: Array<{ id: View; label: string; icon: ReactNode }> = [
  { id: 'dash', label: 'Dashboard', icon: <LayoutDashboard /> },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase /> },
  { id: 'barrels', label: 'Barrels', icon: <Package /> },
  { id: 'ledger', label: 'Ledger', icon: <Coins /> },
  { id: 'roster', label: 'Roster', icon: <Users /> },
];

const TITLES: Record<View, string> = {
  dash: 'Dashboard', jobs: 'Jobs', barrels: 'Barrels', ledger: 'Ledger', roster: 'Roster',
};

const ACTIONS: Partial<Record<View, { label: string; modal: ModalKind }>> = {
  jobs: { label: 'New job', modal: 'job' },
  barrels: { label: 'New barrel', modal: 'barrel' },
  ledger: { label: 'New entry', modal: 'ledger' },
  roster: { label: 'Add member', modal: 'member' },
};

export default function App() {
  const [view, setView] = useState<View>('dash');
  const [q, setQ] = useState('');
  const [db, setDb] = useState<DB>(() => loadLocal() ?? emptyDb());
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [sync, setSync] = useState<SyncStatus>('syncing');
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [cfg, setCfg] = useState<SyncCfg | null>(() => loadCfg());
  const [booted, setBooted] = useState(false);
  const [offline, setOffline] = useState(false);

  const cfgRef = useRef<SyncCfg | null>(cfg);
  cfgRef.current = cfg;
  const bootedRef = useRef(booted);
  bootedRef.current = booted;
  const versionRef = useRef(0);
  const pendingRef = useRef<Array<(d: DB) => void>>([]);
  const inFlightRef = useRef(false);
  const pushT = useRef<number | undefined>(undefined);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => { applyTheme(theme); }, [theme]);

  const commit = useCallback((next: DB) => {
    setDb(next);
    saveLocal(next);
  }, []);

  // Push whatever is unsaved. On a version conflict, rebuild local state as
  // "server copy + every mutation we haven't had acknowledged yet" so two
  // people editing at once merge instead of clobbering each other.
  const flush = useCallback(async () => {
    const c = cfgRef.current;
    if (!c || inFlightRef.current || pendingRef.current.length === 0) return;
    inFlightRef.current = true;
    const acked = pendingRef.current.length;
    setSync('syncing');
    try {
      versionRef.current = await pushDb(c, dbRef.current, versionRef.current);
      pendingRef.current = pendingRef.current.slice(acked);
      setSync(pendingRef.current.length ? 'syncing' : 'synced');
    } catch (e) {
      if (e instanceof ConflictError) {
        const rebuilt = clone(e.db);
        for (const fn of pendingRef.current) fn(rebuilt);
        versionRef.current = e.version;
        commit(rebuilt);
        setSync('syncing');
      } else if (e instanceof AuthError) {
        setSync('denied');
      } else {
        setSync('error');
      }
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current.length) {
        window.clearTimeout(pushT.current);
        pushT.current = window.setTimeout(() => { void flush(); }, 600);
      }
    }
  }, [commit]);

  const pull = useCallback(async () => {
    const c = cfgRef.current;
    // Don't overwrite local edits that haven't landed yet.
    if (!c || pendingRef.current.length || inFlightRef.current) return;
    try {
      const { db: rec, version } = await pullDb(c);
      versionRef.current = version;
      if (JSON.stringify(rec) !== JSON.stringify(dbRef.current)) commit(rec);
      setOffline(false);
      setSync('synced');
      setBooted(true);
    } catch (e) {
      if (e instanceof AuthError) { setSync('denied'); return; }
      setSync('error');
      setOffline(true);
      // Server unreachable on first load: fall back to the last known copy so
      // the tracker is readable, clearly flagged as stale.
      if (!bootedRef.current) {
        const cached = loadLocal();
        if (cached) commit(cached);
        setBooted(true);
      }
    }
  }, [commit]);

  // Poll only while the tab is visible, and re-sync the moment it regains focus.
  useEffect(() => {
    if (!cfg) return;
    setSync('syncing');
    void pull();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pull();
    }, 10000);
    const onVis = () => { if (document.visibilityState === 'visible') void pull(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [cfg, pull]);

  const update = useCallback((fn: (d: DB) => void) => {
    const next = clone(dbRef.current);
    fn(next);
    commit(next);
    if (!cfgRef.current) return;
    pendingRef.current.push(fn);
    setSync('syncing');
    window.clearTimeout(pushT.current);
    pushT.current = window.setTimeout(() => { void flush(); }, 800);
  }, [commit, flush]);

  // Verifies the password against the server before letting anyone in. The
  // server's copy always wins — nothing local is ever uploaded on sign-in.
  const login = useCallback(async (password: string) => {
    const c: SyncCfg = { password };
    const { db: rec, version } = await pullDb(c);
    versionRef.current = version;
    pendingRef.current = [];
    commit(rec);
    saveCfg(c);
    setCfg(c);
    setOffline(false);
    setBooted(true);
    setSync('synced');
  }, [commit]);

  const logout = useCallback(() => {
    window.clearTimeout(pushT.current);
    saveCfg(null);
    clearLocal();
    pendingRef.current = [];
    versionRef.current = 0;
    setCfg(null);
    setBooted(false);
    setDb(emptyDb());
    setModal(null);
    setSync('syncing');
  }, []);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const memberNames = db.members.map((m) => m.name);
  const income = db.ledger.filter((l) => l.type === 'income').reduce((s, l) => s + Number(l.amount || 0), 0);
  const spend = db.ledger.filter((l) => l.type === 'expense').reduce((s, l) => s + Number(l.amount || 0), 0);

  const SYNC_UI: Record<SyncStatus, { dot: string; text: string }> = {
    local: { dot: 'bg-muted-foreground', text: 'Not connected' },
    syncing: { dot: 'bg-amber-500', text: 'Syncing…' },
    synced: { dot: 'bg-emerald-500', text: 'Synced to guild database' },
    error: { dot: 'bg-red-500', text: offline ? 'Offline — last synced copy' : 'Sync error — retrying' },
    denied: { dot: 'bg-red-500', text: 'Wrong guild password' },
  };

  // Nothing is usable without the guild password: the tracker is the shared
  // database, not a local notebook that might sync later.
  if (!cfg) return <Login onLogin={login} theme={theme} toggleTheme={toggleTheme} />;
  if (!booted) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading the guild database…
      </div>
    );
  }

  const action = ACTIONS[view];

  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar max-md:hidden">
        <div className="flex items-center gap-2.5 border-b px-3 py-3.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Shield className="size-3.5" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Keizaal</p>
            <p className="truncate text-xs font-bold tracking-tight">Sabertooth Adventurers</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 p-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors [&_svg]:size-4',
                view === n.id
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              )}
            >
              {n.icon}{n.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-1.5 border-t px-3 py-2.5">
          <span className={cn('size-2 shrink-0 rounded-full', SYNC_UI[sync].dot)} />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{SYNC_UI[sync].text}</span>
          <Button
            variant="ghost" size="icon-xs" onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost" size="icon-xs" onClick={() => setModal('sync')}
            aria-label="Guild database settings"
          >
            <Settings />
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-13 shrink-0 items-center gap-3 border-b px-4">
          <h1 className="text-[15px] font-semibold">{TITLES[view]}</h1>
          <div className="ml-auto flex items-center gap-2">
            {view === 'jobs' && (
              <Input
                placeholder="Search jobs" value={q} onChange={(e) => setQ(e.target.value)}
                className="h-8 w-56 max-sm:w-32"
              />
            )}
            {action && <Button size="sm" onClick={() => setModal(action.modal)}>{action.label}</Button>}
          </div>
        </header>

        {/* Mobile nav: the sidebar is hidden below md. */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5 md:hidden">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                view === n.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto bg-muted/40 p-4">
          {view === 'dash' && <Dashboard db={db} income={income} spend={spend} />}
          {view === 'jobs' && <Jobs db={db} q={q} exp={exp} setExp={setExp} memberNames={memberNames} update={update} />}
          {view === 'barrels' && <Barrels db={db} update={update} />}
          {view === 'ledger' && <Ledger db={db} income={income} spend={spend} />}
          {view === 'roster' && <Roster db={db} update={update} />}
        </div>
      </main>

      {modal && (
        <Modals
          key={modal}
          modal={modal}
          close={() => setModal(null)}
          memberNames={memberNames}
          update={update}
          setJobsView={() => setView('jobs')}
          cfg={cfg}
          sync={sync}
          offline={offline}
          onLogout={logout}
        />
      )}
    </div>
  );
}
