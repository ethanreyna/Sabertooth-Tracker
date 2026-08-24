import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Boxes, Coins, FileInput, Hammer, Inbox, LayoutDashboard, Swords, Map as MapIcon, MessageSquarePlus, Moon, Package, Scale, Settings, Shield, Skull, Sun, Users, Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Login } from '@/components/login';
import { Modals } from '@/components/modals';
import type { ModalKind } from '@/components/modals';
import { Dashboard } from '@/views/dashboard';
import { Jobs } from '@/views/jobs';
import { Storage } from '@/views/storage';
import { Ledger as Bank } from '@/views/ledger';
import { Prices } from '@/views/prices';
import { Dungeons } from '@/views/dungeons';
import { Recipes } from '@/views/recipes';
import { MapView } from '@/views/map';
import { Suggestions } from '@/views/suggestions';
import { Suggest } from '@/views/suggest';
import { Items } from '@/views/items';
import { Run } from '@/views/run';
import { Settings as SettingsView } from '@/views/settings';
import type { SettingsTab } from '@/views/settings';
import { ImportDialog } from '@/components/import-dialog';
import type { Draft } from '@/lib/parse-import';
import type { AddMode } from '@/views/map';
import type { MapKind } from '@/components/map-canvas';
import { emptyDb } from '@/data';
import { catalogue } from '@/items';
import { applyTheme, loadTheme } from '@/theme';
import {
  AuthError, ConflictError, ReadOnlyError, clearLocal, loadCfg, loadLocal, pullDb, pushDb, saveCfg, saveLocal,
} from '@/sync';
import { cn } from '@/lib/utils';
import type { AccessRole, DB, SyncCfg, SyncStatus, Theme } from '@/types';

type View = 'dash' | 'jobs' | 'storage' | 'dungeons' | 'map' | 'bank' | 'ledger' | 'items' | 'run' | 'recipes' | 'settings' | 'suggestions' | 'suggest';

/** What a read-only guest is allowed to see. `ledger` is the market price list,
 *  which comes from the public sheet; `bank` (the guild's septims) stays hidden,
 *  and the Worker strips those transactions from a guest response entirely. */
const GUEST_VIEWS: View[] = ['jobs', 'storage', 'dungeons', 'map', 'ledger', 'items', 'run', 'recipes', 'settings', 'suggest'];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const NAV: Array<{ id: View; label: string; icon: ReactNode }> = [
  { id: 'dash', label: 'Dashboard', icon: <LayoutDashboard /> },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase /> },
  { id: 'storage', label: 'Storage', icon: <Package /> },
  { id: 'map', label: 'Map', icon: <MapIcon /> },
  { id: 'bank', label: 'Bank', icon: <Coins /> },
  { id: 'ledger', label: 'Ledger', icon: <Scale /> },
  { id: 'recipes', label: 'Recipes', icon: <Hammer /> },
  { id: 'dungeons', label: 'Dungeons', icon: <Skull /> },
  { id: 'items', label: 'Items', icon: <Boxes /> },
  { id: 'settings', label: 'Settings', icon: <Users /> },
  { id: 'suggestions', label: 'Suggestions', icon: <Inbox /> },
  { id: 'run', label: 'Loot Tracker', icon: <Swords /> },
  { id: 'suggest', label: 'Suggest', icon: <MessageSquarePlus /> },
];

const TITLES: Record<View, string> = {
  dash: 'Dashboard', jobs: 'Jobs', storage: 'Storage', dungeons: 'Dungeons', map: 'Map',
  bank: 'Bank', ledger: 'Ledger', items: 'Item database', run: 'Loot Tracker', recipes: 'Recipes',
  settings: 'Settings', suggestions: 'Guest suggestions', suggest: 'Suggest a change',
};

type Action = { label: string; modal: ModalKind; variant?: 'outline' };

/** Header buttons per view. Bank has two, one per tab. */
const ACTIONS: Partial<Record<View, Action[]>> = {
  jobs: [{ label: 'Import', modal: 'import', variant: 'outline' }, { label: 'New job', modal: 'job' }],
  storage: [{ label: 'Import', modal: 'import', variant: 'outline' }, { label: 'New storage', modal: 'barrel' }],
  dungeons: [{ label: 'New dungeon', modal: 'dungeon' }],
  map: [{ label: 'New point', modal: 'spot' }],
  bank: [{ label: 'New item', modal: 'bankItem' }, { label: 'New entry', modal: 'ledger' }],
  items: [{ label: 'Add item', modal: 'item' }],
};

/** Settings holds two lists behind tabs, so its button depends on which. */
const SETTINGS_ACTIONS: Record<SettingsTab, Action[]> = {
  roster: [{ label: 'Add member', modal: 'member' }],
  roles: [{ label: 'New role', modal: 'role' }],
};

export default function App() {
  const [view, setView] = useState<View>('dash');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('roster');
  const [q, setQ] = useState('');
  const [db, setDb] = useState<DB>(() => loadLocal() ?? emptyDb());
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [editJobId, setEditJobId] = useState<string | null>(null);
  const [editBarrelId, setEditBarrelId] = useState<string | null>(null);
  const [editDungeonId, setEditDungeonId] = useState<string | null>(null);
  const [editSpotId, setEditSpotId] = useState<string | null>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  // A job or storage record read off a pasted board post, waiting to be
  // reviewed in the normal form. Never saved straight from the importer.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newSpotAt, setNewSpotAt] = useState<{ x: string; y: string } | null>(null);
  // A record awaiting a map click to set its coordinates. Kinded, so the click
  // writes to the collection the record actually lives in.
  const [placingTarget, setPlacingTarget] = useState<{ kind: MapKind; id: string } | null>(null);
  const [newDungeonAt, setNewDungeonAt] = useState<{ x: string; y: string } | null>(null);
  const [newSpotKind, setNewSpotKind] = useState('');
  const [addMode, setAddMode] = useState<AddMode>('point');
  const [access, setAccess] = useState<AccessRole>('member');
  const [sync, setSync] = useState<SyncStatus>('syncing');
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [cfg, setCfg] = useState<SyncCfg | null>(() => loadCfg());
  const [booted, setBooted] = useState(false);
  const [offline, setOffline] = useState(false);

  const cfgRef = useRef<SyncCfg | null>(cfg);
  cfgRef.current = cfg;
  const bootedRef = useRef(booted);
  bootedRef.current = booted;
  const accessRef = useRef(access);
  accessRef.current = access;
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
      } else if (e instanceof ReadOnlyError) {
        // The server refused a write we shouldn't have offered. Drop the queued
        // edits rather than retrying forever; the next poll restores its copy.
        pendingRef.current = [];
        setAccess('guest');
        setSync('synced');
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
      const { db: rec, version, role } = await pullDb(c);
      versionRef.current = version;
      setAccess(role);
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
    // Guests can't write. The UI hides the controls; this is the backstop.
    if (accessRef.current !== 'member') return;
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
  const start = useCallback(async (c: SyncCfg) => {
    const { db: rec, version, role } = await pullDb(c);
    versionRef.current = version;
    pendingRef.current = [];
    setAccess(role);
    if (role !== 'member') setView('jobs');
    commit(rec);
    saveCfg(c);
    setCfg(c);
    setOffline(false);
    setBooted(true);
    setSync('synced');
  }, [commit]);

  const login = useCallback((password: string) => start({ password, guest: false }), [start]);

  /** No password: the Worker serves guests anonymously, read-only and redacted. */
  const enterAsGuest = useCallback(() => start({ password: '', guest: true }), [start]);

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
    setAccess('member');
    setView('dash');
    setSync('syncing');
  }, []);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const placing = placingTarget
    ? (() => {
        const list = placingTarget.kind === 'dungeon' ? db.dungeons : db.spots;
        const r = list.find((x) => x.id === placingTarget.id);
        return r ? { id: r.id, name: r.name, kind: placingTarget.kind } : null;
      })()
    : null;

  const memberNames = db.members.map((m) => m.name);
  const itemNames = catalogue(db.items).map((i) => i.name);
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
  if (!cfg) return <Login onLogin={login} onGuest={enterAsGuest} theme={theme} toggleTheme={toggleTheme} />;
  if (!booted) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading the guild database…
      </div>
    );
  }

  const readOnly = access !== 'member';
  // 'suggest' is the guest's write path and 'suggestions' the members' inbox
  // for it, so each side sees exactly one of the pair.
  const nav = readOnly
    ? NAV.filter((n) => GUEST_VIEWS.includes(n.id))
    : NAV.filter((n) => n.id !== 'suggest');
  const actions = readOnly
    ? undefined
    : view === 'settings' ? SETTINGS_ACTIONS[settingsTab] : ACTIONS[view];
  const pending = db.suggestions.filter((s) => s.status === 'pending').length;

  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar max-md:hidden">
        <div className="flex items-center gap-2.5 border-b px-3 py-3.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Shield className="size-3.5" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Keizaal</p>
            <p className="truncate text-xs font-bold tracking-tight">Sabretooth Adventurers</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 p-2">
          {nav.map((n) => (
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
              {n.icon}
              <span className="min-w-0 flex-1 truncate text-left">{n.label}</span>
              {n.id === 'suggestions' && pending > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {pending}
                </span>
              )}
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
          {readOnly && (
            <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400">
              View only
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {view === 'jobs' && (
              <Input
                placeholder="Search jobs" value={q} onChange={(e) => setQ(e.target.value)}
                className="h-8 w-56 max-sm:w-32"
              />
            )}
            {actions?.map((a) => (
              <Button key={a.modal} size="sm" variant={a.variant} onClick={() => setModal(a.modal)}>
                {a.modal === 'import' && <FileInput />}{a.label}
              </Button>
            ))}
          </div>
        </header>

        {/* Mobile nav: the sidebar is hidden below md. */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5 md:hidden">
          {nav.map((n) => (
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
          {view === 'jobs' && (
            <Jobs
              db={db} q={q} exp={exp} setExp={setExp} memberNames={memberNames} update={update}
              readOnly={readOnly}
              onEdit={(id) => { setEditJobId(id); setModal('job'); }}
            />
          )}
          {view === 'storage' && (
            <Storage
              db={db} update={update} readOnly={readOnly}
              onEdit={(id) => { setEditBarrelId(id); setModal('barrel'); }}
            />
          )}
          {view === 'dungeons' && (
            <Dungeons
              db={db} update={update} readOnly={readOnly}
              onEdit={(id) => { setEditDungeonId(id); setModal('dungeon'); }}
              onPlace={(id) => { setPlacingTarget({ kind: 'dungeon', id }); setView('map'); }}
            />
          )}
          {view === 'map' && (
            <MapView
              db={db} update={update} readOnly={readOnly}
              placing={placing}
              onCancelPlacing={() => setPlacingTarget(null)}
              addMode={addMode}
              onAddModeChange={setAddMode}
              onPick={(x, y) => {
                // Repositioning an existing record wins over adding a new
                // anything: that flow was started deliberately.
                if (placingTarget) {
                  const { kind, id } = placingTarget;
                  setPlacingTarget(null);
                  update((d) => {
                    const list = kind === 'dungeon' ? d.dungeons : d.spots;
                    const t = list.find((r) => r.id === id);
                    if (t) { t.x = String(x); t.y = String(y); }
                  });
                  return;
                }
                const at = { x: String(x), y: String(y) };
                if (addMode === 'dungeon') {
                  setNewDungeonAt(at);
                  setModal('dungeon');
                  return;
                }
                setNewSpotAt(at);
                setNewSpotKind(addMode === 'settlement' ? 'Settlement' : '');
                setModal('spot');
              }}
              onOpen={(kind, id) => {
                // Editing a marker opens the form for whichever collection it
                // actually lives in, so a dungeon edit lands in Dungeons.
                if (kind === 'dungeon') { setEditDungeonId(id); setModal('dungeon'); return; }
                setEditSpotId(id);
                setModal('spot');
              }}
              onDelete={(kind, id) => update((d) => {
                if (kind === 'dungeon') d.dungeons = d.dungeons.filter((g) => g.id !== id);
                else d.spots = d.spots.filter((sp) => sp.id !== id);
              })}
              onMove={(kind, id, x, y) => update((d) => {
                const list = kind === 'spot' ? d.spots : d.dungeons;
                const t = list.find((r) => r.id === id);
                if (t) { t.x = String(x); t.y = String(y); }
              })}
            />
          )}
          {view === 'bank' && (
            <Bank db={db} income={income} spend={spend} readOnly={readOnly} update={update} />
          )}
          {view === 'suggestions' && <Suggestions db={db} update={update} memberNames={memberNames} />}
          {view === 'suggest' && <Suggest cfg={cfg} memberNames={memberNames} itemNames={itemNames} />}
          {view === 'ledger' && <Prices />}
          {view === 'run' && (
            <Run db={db} update={update} readOnly={readOnly} memberNames={memberNames} />
          )}
          {view === 'items' && (
            <Items
              db={db} update={update} readOnly={readOnly}
              onEdit={(id) => { setEditItemId(id); setModal('item'); }}
            />
          )}
          {view === 'recipes' && <Recipes />}
          {view === 'settings' && (
            <SettingsView
              db={db} update={update} readOnly={readOnly}
              tab={settingsTab} onTabChange={setSettingsTab}
              onEditRole={(id) => { setEditRoleId(id); setModal('role'); }}
            />
          )}
        </div>
      </main>

      {modal === 'import' && !readOnly && (
        <ImportDialog
          cfg={cfg}
          // Which page the button was on decides how the post is read: the two
          // board formats overlap enough that guessing gets short posts wrong.
          kind={view === 'storage' ? 'barrel' : 'job'}
          close={() => setModal(null)}
          onUse={(d) => {
            // Straight into the record's own form, so it gets the same
            // validation and review as anything typed by hand.
            setDraft(d);
            setModal(d.kind === 'barrel' ? 'barrel' : 'job');
          }}
        />
      )}

      {/* Guests get the connection dialog (to sign out) but no editing dialogs. */}
      {modal && modal !== 'import' && (!readOnly || modal === 'sync') && (

        <Modals
          key={`${modal}:${editRoleId ?? editJobId ?? editBarrelId ?? editDungeonId ?? editSpotId ?? editItemId ?? (draft ? 'draft' : 'new')}`}
          modal={modal}
          close={() => {
            setModal(null);
            setEditRoleId(null); setEditJobId(null);
            setEditBarrelId(null); setEditDungeonId(null); setEditSpotId(null);
            setEditItemId(null); setDraft(null);
            setNewSpotAt(null); setNewDungeonAt(null); setNewSpotKind('');
          }}
          roles={db.roles}
          settings={db.settings}
          memberNames={memberNames}
          editRole={db.roles.find((r) => r.id === editRoleId) ?? null}
          editJob={db.jobs.find((j) => j.id === editJobId) ?? null}
          editBarrel={db.barrels.find((b) => b.id === editBarrelId) ?? null}
          editDungeon={db.dungeons.find((g) => g.id === editDungeonId) ?? null}
          editSpot={db.spots.find((sp) => sp.id === editSpotId) ?? null}
          editItem={db.items.find((i) => i.id === editItemId) ?? null}
          customItems={db.items}
          draftJob={draft?.kind === 'job' ? draft : null}
          draftBarrel={draft?.kind === 'barrel' ? draft : null}
          dungeons={db.dungeons}
          newSpotAt={newSpotAt}
          newSpotKind={newSpotKind}
          newDungeonAt={newDungeonAt}
          update={update}
          setJobsView={() => setView('jobs')}
          cfg={cfg}
          sync={sync}
          offline={offline}
          readOnly={readOnly}
          onPickOnMap={(kind, id) => {
            // Close the dialog and hand the next map click to this record.
            setModal(null); setEditSpotId(null); setEditDungeonId(null);
            setPlacingTarget({ kind, id });
            setView('map');
          }}
          onLogout={logout}
        />
      )}
    </div>
  );
}
