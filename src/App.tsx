import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import type { Barrel, DB, Job, JobStatus, LedgerEntry, Member, SyncCfg, SyncStatus } from './types';
import { demoDb } from './data';
import { loadCfg, loadLocal, pullDb, pushDb, saveCfg, saveLocal } from './sync';
import { C, ago, badge, btnOutline, btnPrimary, card, dstr, field, input, prioStyles, sectionLabel, select, sep, statusStyles, uid } from './ui';

type View = 'dash' | 'jobs' | 'barrels' | 'ledger' | 'roster';
type Modal = null | 'job' | 'barrel' | 'ledger' | 'member' | 'sync';

const ic = (paths: ReactNode, size = 15, stroke = 'currentColor') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);
const icons = {
  home: ic(<><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>),
  jobs: ic(<><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>),
  barrel: ic(<><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>),
  ledger: ic(<><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></>),
  roster: ic(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  gear: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, 14),
  shield: ic(<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />, 15, '#fafafa'),
  image: ic(<><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>, 22),
  trash: ic(<><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>, 14),
  chevron: <polyline points="6 9 12 15 18 9" />,
};

export default function App() {
  const [view, setView] = useState<View>('dash');
  const [q, setQ] = useState('');
  const [db, setDb] = useState<DB>(() => loadLocal() ?? demoDb());
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<Modal>(null);
  const [sync, setSync] = useState<SyncStatus>('local');
  const cfgRef = useRef<SyncCfg | null>(null);
  const pushT = useRef<number | undefined>(undefined);
  const dbRef = useRef(db);
  dbRef.current = db;

  const pull = useCallback(() => {
    const cfg = cfgRef.current;
    if (!cfg) return;
    pullDb(cfg)
      .then((rec) => {
        if (rec && JSON.stringify(rec) !== JSON.stringify(dbRef.current)) {
          setDb(rec);
          saveLocal(rec);
        }
        setSync('synced');
      })
      .catch(() => setSync('error'));
  }, []);

  useEffect(() => {
    cfgRef.current = loadCfg();
    if (cfgRef.current) {
      setSync('syncing');
      pull();
      const t = window.setInterval(pull, 30000);
      return () => window.clearInterval(t);
    }
  }, [pull]);

  const update = (fn: (d: DB) => void) => {
    const next: DB = JSON.parse(JSON.stringify(dbRef.current));
    fn(next);
    setDb(next);
    saveLocal(next);
    const cfg = cfgRef.current;
    if (!cfg) { setSync('local'); return; }
    setSync('syncing');
    window.clearTimeout(pushT.current);
    pushT.current = window.setTimeout(() => {
      pushDb(cfg, next).then(() => setSync('synced')).catch(() => setSync('error'));
    }, 800);
  };

  const memberNames = db.members.map((m) => m.name);
  const income = db.ledger.filter((l) => l.type === 'income').reduce((s, l) => s + Number(l.amount || 0), 0);
  const spend = db.ledger.filter((l) => l.type === 'expense').reduce((s, l) => s + Number(l.amount || 0), 0);

  const titles: Record<View, string> = { dash: 'Dashboard', jobs: 'Jobs', barrels: 'Barrels', ledger: 'Ledger', roster: 'Roster' };
  const actions: Partial<Record<View, { label: string; modal: Modal }>> = {
    jobs: { label: 'New job', modal: 'job' },
    barrels: { label: 'New barrel', modal: 'barrel' },
    ledger: { label: 'New entry', modal: 'ledger' },
    roster: { label: 'Add member', modal: 'member' },
  };
  const syncMap: Record<SyncStatus, [string, string]> = {
    local: [C.mutedFg, 'Saved on this device'],
    syncing: [C.amber, 'Syncing\u2026'],
    synced: [C.green, 'Synced to guild database'],
    error: [C.red, 'Sync error \u2014 check settings'],
  };

  const navItem = (v: View, label: string, icon: ReactNode): ReactNode => (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); setView(v); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, fontSize: 13,
        color: view === v ? C.primary : C.fg2,
        background: view === v ? C.muted : 'transparent',
        fontWeight: view === v ? 500 : 400,
      }}
    >
      {icon}{label}
    </a>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontSize: 13, lineHeight: 1.45 }}>
      <aside style={{ width: 230, flex: 'none', background: '#fff', borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', borderBottom: '1px solid ' + C.border }}>
          <div style={{ width: 28, height: 28, flex: 'none', borderRadius: 6, background: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {icons.shield}
          </div>
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.mutedFg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keizaal</div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em' }}>Sabertooth Adventurers</div>
          </div>
        </div>
        <nav style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItem('dash', 'Dashboard', icons.home)}
          {navItem('jobs', 'Jobs', icons.jobs)}
          {navItem('barrels', 'Barrels', icons.barrel)}
          {navItem('ledger', 'Ledger', icons.ledger)}
          {navItem('roster', 'Roster', icons.roster)}
        </nav>
        <div style={{ marginTop: 'auto', borderTop: '1px solid ' + C.border, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, flex: 'none', borderRadius: 9999, background: syncMap[sync][0] }} />
          <span style={{ fontSize: 12, color: C.fg2, flex: 1 }}>{syncMap[sync][1]}</span>
          <button
            onClick={() => setModal('sync')}
            title="Sync settings"
            style={{ width: 26, height: 26, background: 'none', border: 0, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.mutedFg, cursor: 'pointer' }}
          >
            {icons.gear}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 52, flex: 'none', background: '#fff', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{titles[view]}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {view === 'jobs' && (
              <input placeholder="Search jobs" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, height: 32, width: 220 }} />
            )}
            {actions[view] && (
              <button onClick={() => setModal(actions[view]!.modal)} style={{ ...btnPrimary, height: 32 }}>{actions[view]!.label}</button>
            )}
          </div>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: C.muted }}>
          {view === 'dash' && <Dashboard db={db} income={income} spend={spend} />}
          {view === 'jobs' && <Jobs db={db} q={q} exp={exp} setExp={setExp} memberNames={memberNames} update={update} />}
          {view === 'barrels' && <Barrels db={db} update={update} />}
          {view === 'ledger' && <Ledger db={db} income={income} spend={spend} />}
          {view === 'roster' && <Roster db={db} update={update} />}
        </div>
      </main>

      {modal && (
        <Modals
          modal={modal}
          close={() => setModal(null)}
          memberNames={memberNames}
          update={update}
          setView={setView}
          cfg={cfgRef.current}
          onSyncSave={(cfg) => {
            cfgRef.current = cfg;
            saveCfg(cfg);
            setModal(null);
            if (cfg) {
              setSync('syncing');
              pushDb(cfg, dbRef.current).then(() => setSync('synced')).catch(() => setSync('error'));
            } else setSync('local');
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 12, color: C.mutedFg, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4, color: color || 'inherit' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.mutedFg, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ db, income, spend }: { db: DB; income: number; spend: number }) {
  const dot = (bg: string): CSSProperties => ({ width: 7, height: 7, flex: 'none', borderRadius: 9999, background: bg });
  const activity = [
    ...db.jobs.map((j) => ({ at: j.postedAt, text: j.postedBy + ' posted job \u201C' + j.name + '\u201D', dot: dot(C.primary) })),
    ...db.barrels.map((b) => ({ at: b.at, text: b.owner + ' rented a barrel (' + (b.notes || 'no location noted') + ')', dot: dot(C.amber) })),
    ...db.ledger.map((l) => ({ at: l.at, text: (l.type === 'income' ? '+' : '\u2212') + sep(l.amount) + ' s \u2014 ' + l.desc, dot: dot(l.type === 'income' ? C.green : C.red) })),
  ].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 7);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Treasury balance" value={sep(income - spend)} sub="septims" />
        <StatCard label="Open jobs" value={db.jobs.filter((j) => j.status === 'open').length} sub={db.jobs.filter((j) => j.status === 'claimed').length + ' claimed'} />
        <StatCard label="Barrels rented" value={db.barrels.length} sub={db.barrels.filter((b) => !b.paid).length + ' unpaid'} />
        <StatCard label="Members" value={db.members.length} sub="on the roster" />
      </div>
      <div style={card}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + C.border2, fontSize: 14, fontWeight: 600 }}>Recent activity</div>
        {activity.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid ' + C.border3 }}>
            <span style={a.dot} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
            <span style={{ fontSize: 12, color: C.mutedFg, flex: 'none' }}>{ago(a.at)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Jobs({ db, q, exp, setExp, memberNames, update }: {
  db: DB; q: string; exp: Record<string, boolean>;
  setExp: (fn: (s: Record<string, boolean>) => Record<string, boolean>) => void;
  memberNames: string[]; update: (fn: (d: DB) => void) => void;
}) {
  const ql = q.toLowerCase();
  const jobs = db.jobs
    .slice()
    .sort((a, b) => (b.postedAt || '').localeCompare(a.postedAt || ''))
    .filter((j) => !ql || (j.name + ' ' + j.client + ' ' + j.tag + ' ' + (j.claimedBy || '')).toLowerCase().includes(ql));

  const addEntry = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const jobId = String(f.get('jobId'));
    const entry = { by: String(f.get('by')), item: String(f.get('item')), qty: Number(f.get('qty') || 1), at: new Date().toISOString() };
    form.reset();
    update((d) => { const t = d.jobs.find((x) => x.id === jobId); if (t) t.entries.push(entry); });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {jobs.map((j) => (
        <div key={j.id} style={card}>
          <div
            onClick={() => setExp((s) => ({ ...s, [j.id]: !s[j.id] }))}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', cursor: 'pointer' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{j.name}</span>
                <span style={badge('hsl(240 4.8% 95.9%)', C.fg2, 'hsl(220 13% 88%)')}>{j.tag}</span>
                <span style={prioStyles[j.priority] || prioStyles.Normal}>{j.priority}</span>
                {j.collection && (
                  <span style={badge('hsl(199 89% 96%)', 'hsl(199 89% 30%)', 'hsl(199 89% 85%)')}>Collection · {j.entries.length} entries</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.mutedFg, marginTop: 3 }}>
                Client {j.client} · posted by {j.postedBy} · {ago(j.postedAt)}{j.deadline ? ' · due ' + dstr(j.deadline) : ''}
              </div>
            </div>
            <div style={{ flex: 'none', textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{sep(j.reward)} s</div>
              <div style={{ fontSize: 11, color: C.mutedFg }}>reward</div>
            </div>
            <span style={statusStyles[j.status]}>{j.status}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.mutedFg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              style={{ flex: 'none', transition: 'transform 0.2s ease-out', transform: exp[j.id] ? 'rotate(180deg)' : undefined }}>
              {icons.chevron}
            </svg>
          </div>
          {exp[j.id] && (
            <div style={{ borderTop: '1px solid ' + C.border2, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                <div>
                  <div style={sectionLabel}>Description</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{j.description}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><div style={sectionLabel}>Contact / found at</div><div>{j.contact}</div></div>
                  <div><div style={sectionLabel}>Faction</div><div>{j.faction || 'None'}</div></div>
                </div>
                {j.items.length > 0 && (
                  <div><div style={sectionLabel}>Item addons</div><div>{j.items.join(', ')}</div></div>
                )}
                {j.collection && (
                  <div>
                    <div style={{ ...sectionLabel, marginBottom: 6 }}>Collection entries</div>
                    {j.entries.map((en, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: '1px solid ' + C.border2, borderRadius: 6, marginBottom: 6, background: 'hsl(0 0% 99%)' }}>
                        <span style={{ fontWeight: 500, flex: 'none' }}>{en.by}</span>
                        <span style={{ flex: 1 }}>{en.qty}× {en.item}</span>
                        <span style={{ fontSize: 12, color: C.mutedFg }}>{dstr(en.at)}</span>
                      </div>
                    ))}
                    <form onSubmit={addEntry} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <input type="hidden" name="jobId" value={j.id} />
                      <select name="by" style={{ ...select, height: 32, width: 150 }}>
                        {memberNames.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <input name="item" required placeholder="Item (e.g. iron ingot)" style={{ ...input, height: 32, flex: 1 }} />
                      <input name="qty" type="number" min={1} defaultValue={1} style={{ ...input, height: 32, width: 70 }} />
                      <button type="submit" style={{ ...btnPrimary, height: 32, padding: '0 12px' }}>Add entry</button>
                    </form>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Status</div>
                  <select
                    value={j.status}
                    onChange={(e) => { const val = e.target.value as JobStatus; update((d) => { const t = d.jobs.find((x) => x.id === j.id); if (t) t.status = val; }); }}
                    style={{ ...select, height: 32, width: '100%' }}
                  >
                    <option value="open">Open</option>
                    <option value="claimed">Claimed</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Claimed by</div>
                  <select
                    value={j.claimedBy}
                    onChange={(e) => { const val = e.target.value; update((d) => { const t = d.jobs.find((x) => x.id === j.id); if (t) { t.claimedBy = val; if (val && t.status === 'open') t.status = 'claimed'; } }); }}
                    style={{ ...select, height: 32, width: '100%' }}
                  >
                    <option value="">Unassigned</option>
                    {memberNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => { if (confirm('Delete this job?')) update((d) => { d.jobs = d.jobs.filter((x) => x.id !== j.id); }); }}
                  style={{ ...btnOutline, height: 32, marginTop: 'auto', color: C.red }}
                >
                  Delete job
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {jobs.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed hsl(220 13% 88%)', borderRadius: 12, padding: 40, textAlign: 'center', color: C.mutedFg }}>
          No jobs match. Post one with New job.
        </div>
      )}
    </div>
  );
}

function Barrels({ db, update }: { db: DB; update: (fn: (d: DB) => void) => void }) {
  const now = Date.now();
  const barrels = db.barrels.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {barrels.map((b) => {
          const left = b.end ? Math.ceil((new Date(b.end).getTime() - now) / 864e5) : null;
          const expired = left !== null && left < 0;
          return (
            <div key={b.id} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {b.img ? (
                <img src={b.img} alt="Barrel location" style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block', borderBottom: '1px solid ' + C.border2 }} />
              ) : (
                <div style={{ height: 150, background: C.muted, borderBottom: '1px solid ' + C.border2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: C.mutedFg }}>
                  {icons.image}
                  <span style={{ fontSize: 12 }}>No location screenshot</span>
                </div>
              )}
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{b.owner}</span>
                  <button
                    onClick={() => update((d) => { const t = d.barrels.find((x) => x.id === b.id); if (t) t.paid = !t.paid; })}
                    style={{
                      height: 24, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      border: '1px solid ' + (b.paid ? 'hsl(142 50% 80%)' : 'hsl(38 80% 75%)'),
                      background: b.paid ? 'hsl(142 76% 96%)' : 'hsl(38 92% 95%)',
                      color: b.paid ? 'hsl(142 76% 26%)' : 'hsl(38 92% 25%)',
                    }}
                  >
                    {b.paid ? 'Paid' : 'Unpaid'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: C.mutedFg }}>{dstr(b.start)} – {dstr(b.end)} · {sep(b.rate)} s/week</div>
                {b.notes && <div style={{ fontSize: 12 }}>{b.notes}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: expired ? C.red : left !== null && left <= 3 ? 'hsl(38 92% 35%)' : C.mutedFg }}>
                    {expired ? 'Expired ' + Math.abs(left!) + 'd ago' : left === null ? '' : left + ' days left'}
                  </span>
                  <button
                    onClick={() => { if (confirm('Remove this barrel?')) update((d) => { d.barrels = d.barrels.filter((x) => x.id !== b.id); }); }}
                    style={{ ...btnOutline, marginLeft: 'auto', height: 26, padding: '0 10px', fontSize: 12, color: C.red }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {barrels.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed hsl(220 13% 88%)', borderRadius: 12, padding: 40, textAlign: 'center', color: C.mutedFg }}>
          No barrels tracked yet. Add one with New barrel.
        </div>
      )}
    </>
  );
}

function Ledger({ db, income, spend }: { db: DB; income: number; spend: number }) {
  const cols = '110px 1fr 140px 110px 120px';
  const rows = db.ledger.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Balance" value={sep(income - spend)} />
        <StatCard label="Income" value={sep(income)} color={C.green} />
        <StatCard label="Spending" value={sep(spend)} color={C.red} />
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '9px 16px', borderBottom: '1px solid ' + C.border, background: 'hsl(0 0% 99%)', fontSize: 11, fontWeight: 600, color: C.mutedFg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Type</span><span>Description</span><span>By</span><span>Date</span><span style={{ textAlign: 'right' }}>Amount</span>
        </div>
        {rows.map((l) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '10px 16px', borderBottom: '1px solid ' + C.border3, alignItems: 'center' }}>
            <span>
              <span style={badge(l.type === 'income' ? 'hsl(142 76% 96%)' : 'hsl(0 84% 97%)', l.type === 'income' ? 'hsl(142 76% 26%)' : C.redDark, l.type === 'income' ? 'hsl(142 50% 80%)' : 'hsl(0 70% 85%)')}>
                {l.type === 'income' ? 'Income' : 'Spending'}
              </span>
            </span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.desc}</span>
            <span style={{ color: C.fg2 }}>{l.by}</span>
            <span style={{ fontSize: 12, color: C.mutedFg }}>{dstr(l.at)}</span>
            <span style={{ textAlign: 'right', fontWeight: 600, color: l.type === 'income' ? 'hsl(142 76% 30%)' : C.redDark }}>
              {(l.type === 'income' ? '+' : '\u2212') + sep(l.amount)} s
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Roster({ db, update }: { db: DB; update: (fn: (d: DB) => void) => void }) {
  return (
    <div style={{ ...card, overflow: 'hidden', maxWidth: 720 }}>
      {db.members.map((m) => {
        const claimed = db.jobs.filter((j) => j.claimedBy === m.name).length;
        const posted = db.jobs.filter((j) => j.postedBy === m.name).length;
        return (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid ' + C.border3 }}>
            <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 9999, background: C.muted, border: '1px solid ' + C.border, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
              {m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            <span style={{ fontWeight: 500, flex: 1 }}>{m.name}</span>
            <span style={{ fontSize: 12, color: C.mutedFg }}>{m.role}</span>
            <span style={{ fontSize: 12, color: C.mutedFg, width: 140, textAlign: 'right' }}>{claimed} claimed · {posted} posted</span>
            <button
              onClick={() => { if (confirm('Remove ' + m.name + ' from the roster?')) update((d) => { d.members = d.members.filter((x) => x.id !== m.id); }); }}
              title="Remove member"
              style={{ width: 26, height: 26, border: 0, background: 'none', borderRadius: 6, color: C.mutedFg, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {icons.trash}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Modals({ modal, close, memberNames, update, setView, cfg, onSyncSave }: {
  modal: Exclude<Modal, null>; close: () => void; memberNames: string[];
  update: (fn: (d: DB) => void) => void; setView: (v: View) => void;
  cfg: SyncCfg | null; onSyncSave: (cfg: SyncCfg | null) => void;
}) {
  const titles: Record<Exclude<Modal, null>, string> = {
    job: 'Post a job', barrel: 'Track a barrel', ledger: 'Record a ledger entry', member: 'Add a member', sync: 'Shared database',
  };
  const footer = (submitLabel: string) => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid ' + C.border, margin: '4px -18px 0', padding: '12px 18px 0' }}>
      <button type="button" onClick={close} style={btnOutline}>Cancel</button>
      <button type="submit" style={btnPrimary}>{submitLabel}</button>
    </div>
  );
  const formStyle: CSSProperties = { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 };
  const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  const submitJob = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const job: Job = {
      id: uid(), name: String(f.get('name')), client: String(f.get('client')),
      contact: String(f.get('contact') || '\u2014'), faction: String(f.get('faction') || ''),
      tag: String(f.get('tag')), priority: String(f.get('priority')),
      reward: Number(f.get('reward') || 0), description: String(f.get('description') || ''),
      postedBy: String(f.get('postedBy')), postedAt: new Date().toISOString(),
      deadline: f.get('deadline') ? new Date(String(f.get('deadline'))).toISOString() : '',
      status: 'open', claimedBy: '', collection: !!f.get('collection'),
      items: String(f.get('items') || '').split(',').map((s) => s.trim()).filter(Boolean),
      entries: [],
    };
    close();
    setView('jobs');
    update((d) => { d.jobs.push(job); });
  };

  const submitBarrel = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get('shot') as File | null;
    const add = (img: string) => {
      const b: Barrel = {
        id: uid(), owner: String(f.get('owner')), paid: !!f.get('paid'), rate: Number(f.get('rate') || 0),
        start: f.get('start') ? new Date(String(f.get('start'))).toISOString() : '',
        end: f.get('end') ? new Date(String(f.get('end'))).toISOString() : '',
        notes: String(f.get('notes') || ''), img, at: new Date().toISOString(),
      };
      close();
      update((d) => { d.barrels.push(b); });
    };
    if (file && file.size) {
      const r = new FileReader();
      r.onload = () => add(String(r.result));
      r.readAsDataURL(file);
    } else add('');
  };

  const submitLedger = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const l: LedgerEntry = {
      id: uid(), type: f.get('type') as LedgerEntry['type'], amount: Number(f.get('amount') || 0),
      desc: String(f.get('desc')), by: String(f.get('by')), at: new Date().toISOString(),
    };
    close();
    update((d) => { d.ledger.push(l); });
  };

  const submitMember = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const m: Member = { id: uid(), name: String(f.get('name')), role: String(f.get('role') || 'Member'), joined: new Date().toISOString() };
    close();
    update((d) => { d.members.push(m); });
  };

  const submitSync = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const binId = String(f.get('binId') || '').trim();
    const apiKey = String(f.get('apiKey') || '').trim();
    onSyncSave(binId ? { binId, apiKey } : null);
  };

  const memberOptions = memberNames.map((n) => <option key={n} value={n}>{n}</option>);

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / 0.35)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', border: '1px solid ' + C.border, borderRadius: 12, width: 520, maxWidth: '100%', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{titles[modal]}</span>
          <button onClick={close} style={{ width: 26, height: 26, border: 0, background: 'none', borderRadius: 6, color: C.mutedFg, cursor: 'pointer' }}>✕</button>
        </div>

        {modal === 'job' && (
          <form onSubmit={submitJob} style={formStyle}>
            <div style={grid2}>
              <label style={field}>Job name<input name="name" required placeholder="e.g. Clear the Valtheim towers" style={input} /></label>
              <label style={field}>Client name<input name="client" required placeholder="e.g. Brenuin of Whiterun" style={input} /></label>
            </div>
            <div style={grid2}>
              <label style={field}>Contact / where found<input name="contact" placeholder="e.g. Bannered Mare, evenings" style={input} /></label>
              <label style={field}>Faction association<input name="faction" placeholder="e.g. Companions (optional)" style={input} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <label style={field}>Job tag<select name="tag" style={select}>
                <option>Resource collection</option><option>Kill</option><option>Arrest</option><option>Guard</option><option>Escort</option><option>Delivery</option><option>Other</option>
              </select></label>
              <label style={field}>Priority<select name="priority" style={select}>
                <option>Normal</option><option>Low</option><option>High</option><option>Urgent</option>
              </select></label>
              <label style={field}>Reward (septims)<input name="reward" type="number" min={0} placeholder="500" style={input} /></label>
            </div>
            <label style={field}>Description<textarea name="description" rows={3} placeholder="What the client needs done" style={{ ...input, height: 'auto', padding: '8px 10px', resize: 'vertical' }} /></label>
            <div style={grid2}>
              <label style={field}>Posted by<select name="postedBy" style={select}>{memberOptions}</select></label>
              <label style={field}>Time limit (optional)<input name="deadline" type="date" style={input} /></label>
            </div>
            <label style={field}>Item addons (comma separated)<input name="items" placeholder="e.g. 20 iron ingots, 5 leather strips" style={input} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" name="collection" style={{ width: 15, height: 15 }} />This is a collection job (members turn in items over time)
            </label>
            {footer('Post job')}
          </form>
        )}

        {modal === 'barrel' && (
          <form onSubmit={submitBarrel} style={formStyle}>
            <div style={grid2}>
              <label style={field}>Renter<select name="owner" style={select}>{memberOptions}</select></label>
              <label style={field}>Weekly rate (septims)<input name="rate" type="number" min={0} defaultValue={150} style={input} /></label>
            </div>
            <div style={grid2}>
              <label style={field}>Rented from<input name="start" type="date" required style={input} /></label>
              <label style={field}>Rented until<input name="end" type="date" required style={input} /></label>
            </div>
            <label style={field}>Location notes<input name="notes" placeholder="e.g. Riverwood, behind the smithy" style={input} /></label>
            <label style={field}>Location screenshot<input name="shot" type="file" accept="image/*" style={{ fontSize: 12, fontWeight: 400 }} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" name="paid" style={{ width: 15, height: 15 }} />Paid
            </label>
            {footer('Add barrel')}
          </form>
        )}

        {modal === 'ledger' && (
          <form onSubmit={submitLedger} style={formStyle}>
            <div style={grid2}>
              <label style={field}>Type<select name="type" style={select}>
                <option value="income">Income</option><option value="expense">Spending</option>
              </select></label>
              <label style={field}>Amount (septims)<input name="amount" type="number" min={1} required placeholder="250" style={input} /></label>
            </div>
            <label style={field}>Description<input name="desc" required placeholder="e.g. Bounty payout — Valtheim towers" style={input} /></label>
            <label style={field}>Recorded by<select name="by" style={select}>{memberOptions}</select></label>
            {footer('Record')}
          </form>
        )}

        {modal === 'member' && (
          <form onSubmit={submitMember} style={formStyle}>
            <label style={field}>Name<input name="name" required placeholder="e.g. Lydia of Whiterun" style={input} /></label>
            <label style={field}>Role<input name="role" defaultValue="Member" style={input} /></label>
            {footer('Add member')}
          </form>
        )}

        {modal === 'sync' && (
          <form onSubmit={submitSync} style={formStyle}>
            <div style={{ fontSize: 12, color: C.mutedFg, lineHeight: 1.5 }}>
              Changes save to this browser automatically. To share one live ledger with the whole guild, create a free bin at jsonbin.io, then paste the same Bin ID and API key here on everyone's device. The app pulls updates every 30 seconds.
            </div>
            <label style={field}>Bin ID<input name="binId" defaultValue={cfg?.binId || ''} placeholder="e.g. 66c1f2e8ad19ca34f8a1b2c3" style={input} /></label>
            <label style={field}>API key (X-Master-Key)<input name="apiKey" defaultValue={cfg?.apiKey || ''} placeholder="$2a$10$..." style={input} /></label>
            {footer('Save and connect')}
          </form>
        )}
      </div>
    </div>
  );
}
