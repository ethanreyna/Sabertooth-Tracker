import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AuthError, fetchBoard, loadBoard } from '@/sync';
import type { PublicBoard } from '@/sync';
import { defaultBoard } from '@/data';
import { priceGroups } from '@/lib/price-tabs';
import type { CatalogueItem, Notice, Noticeboard as Board, PriceTab } from '@/types';
import './noticeboard.css';

/** How often an open board checks for a changed price list. */
const POLL_MS = 15_000;

/**
 * The clan's shop window: the first thing anyone opening the link sees.
 *
 * A wooden board with the clan's poster nailed to it, a note of what they
 * trade, and a hanging tag that unrolls the price list. Members get in by the
 * clan entrance at the foot of the board; nobody else needs a password to read
 * any of it.
 *
 * Signed-out visitors read the board from /api/board, polled so a price a
 * member changes shows up without a reload. A member looking at it from inside
 * the tracker passes `live` instead, which is their own copy and so is current
 * the moment they type.
 */
export function Noticeboard({ live, onEnter, onGuest, onBack, notice }: {
  live?: PublicBoard;
  /** Rejects with AuthError on a wrong password. */
  onEnter?: (password: string) => Promise<void>;
  onGuest?: () => Promise<void>;
  /** For a member already inside: back to the tracker. */
  onBack?: () => void;
  /** Why someone was sent back here, if they didn't ask to be. */
  notice?: string;
}) {
  const fetched = usePublicBoard(!live);
  const { board, catalogue, priceTabs } = live ?? fetched;

  // #prices opens straight onto the price list, so a post can link there
  // directly; #clan opens the entrance, for a member's bookmark.
  const [listOpen, setListOpen] = useState(() => readHash() === 'prices');
  const [doorOpen, setDoorOpen] = useState(() => !!notice || readHash() === 'clan');

  const openList = (open: boolean) => { setListOpen(open); writeHash(open ? 'prices' : ''); };
  const openDoor = (open: boolean) => { setDoorOpen(open); writeHash(open ? 'clan' : ''); };

  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      setListOpen(h === 'prices');
      setDoorOpen(h === 'clan');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const visible = useMemo(() => catalogue.filter((c) => !c.hidden), [catalogue]);
  const notices = board.notices.filter((n) => !n.hidden && !noticeIsEmpty(n));
  const { left, right } = balanceColumns(board, notices);

  return (
    <div className="nb-scene" style={board.backdrop ? { ['--nb-backdrop' as string]: `url("${board.backdrop}")` } : undefined}>
      {/* Roughens the big lettering's edges; see .nb-name and friends. */}
      <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
        <filter id="nb-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="nb-wrap">
        <div className="nb-board">
          <span className="nb-rivet nb-rivet-tl" aria-hidden />
          <span className="nb-rivet nb-rivet-tr" aria-hidden />
          <span className="nb-rivet nb-rivet-bl" aria-hidden />
          <span className="nb-rivet nb-rivet-br" aria-hidden />

          {(board.boardTitle || board.where) && (
            <header className="nb-boardhead">
              <span>{board.boardTitle}</span>
              {board.where && <span>{board.where}</span>}
            </header>
          )}

          {/* Two columns on a wide screen. On a phone the columns dissolve
              and `order` puts the poster first, the price tag second, and
              the notices after in the order the clan set them. */}
          <div className="nb-grid">
            <div className="nb-col">
              <MainPoster board={board} />
              {left.map((n) => <NoticeSheet key={n.id} notice={n} tilt={notices.indexOf(n)} />)}
            </div>
            <div className="nb-col nb-side">
              <PriceTag board={board} count={visible.length} onOpen={() => openList(true)} />
              {right.map((n) => <NoticeSheet key={n.id} notice={n} tilt={notices.indexOf(n)} />)}
            </div>
          </div>

          <footer className="nb-foot">
            {onBack ? (
              <button type="button" className="nb-plaque" onClick={onBack}>
                <span className="nb-plaque-small">You are signed in</span>
                <span className="nb-plaque-big">Back to the war room</span>
              </button>
            ) : (
              <button type="button" className="nb-plaque" onClick={() => openDoor(true)}>
                {board.doorSmall && <span className="nb-plaque-small">{board.doorSmall}</span>}
                <span className="nb-plaque-big">{board.doorTitle || 'Clan entrance'}</span>
              </button>
            )}
          </footer>
        </div>
      </div>

      {listOpen && <PriceList board={board} items={visible} tabs={priceTabs} onClose={() => openList(false)} />}
      {doorOpen && onEnter && (
        <Entrance
          board={board} notice={notice} onEnter={onEnter} onGuest={onGuest}
          onClose={() => openDoor(false)}
        />
      )}
    </div>
  );
}

const readHash = () => window.location.hash.replace(/^#/, '').toLowerCase();

/** Replaces rather than pushes, so Back leaves the board instead of stepping
 *  through every time the list was opened and closed. */
function writeHash(h: string) {
  const url = window.location.pathname + window.location.search + (h ? `#${h}` : '');
  window.history.replaceState(window.history.state, '', url);
}

/** The board a signed-out visitor sees: last copy first, then the live one,
 *  re-read while the tab is in view. */
function usePublicBoard(enabled: boolean): PublicBoard {
  const [data, setData] = useState<PublicBoard>(() => loadBoard() ?? {
    board: defaultBoard(),
    catalogue: [],
    priceTabs: [],
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const pull = () => {
      fetchBoard().then((b) => { if (alive) setData(b); }).catch(() => {
        /* offline or the server is down: keep showing the last copy */
      });
    };
    pull();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') pull();
    }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);

  return data;
}

const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function MainPoster({ board }: { board: Board }) {
  return (
    <div className="nb-shadow" style={{ order: 0 }}>
    <article className="nb-paper nb-poster nb-wear nb-wear-poster nb-ragged-corner">
      <span className="nb-nail nb-nail-l" aria-hidden />
      <span className="nb-nail nb-nail-r" aria-hidden />
      <div className="nb-poster-frame">
        {board.motto && <p className="nb-smallcaps nb-motto">{board.motto}</p>}
        {board.showMark && <Emblem />}
        {board.name && <h1 className="nb-name">{board.name}</h1>}
        {board.tagline && <p className="nb-tagline">{board.tagline}</p>}
        <Divider />
        <div className="nb-welcome">
          {paragraphs(board.welcome).map((p, i) => <p key={i}>{p}</p>)}
        </div>
        {(board.signedBy || board.signedAs) && (
          <div className="nb-sign">
            {board.signedBy && <p className="nb-signature">{board.signedBy}</p>}
            {board.signedAs && <p className="nb-smallcaps nb-signedas">{board.signedAs}</p>}
          </div>
        )}
        {board.posterFoot && <p className="nb-smallcaps nb-poster-foot">{board.posterFoot}</p>}
      </div>
    </article>
    </div>
  );
}

function PriceTag({ board, count, onOpen }: { board: Board; count: number; onOpen: () => void }) {
  return (
    <button type="button" className="nb-tag" onClick={onOpen} aria-haspopup="dialog" style={{ order: 1 }}>
      <span className="nb-tag-rod" aria-hidden />
      <span className="nb-tag-cord" aria-hidden />
      <span className="nb-tag-card">
        {board.tagSmall && <span className="nb-smallcaps nb-tag-small">{board.tagSmall}</span>}
        <span className="nb-tag-big">{board.tagTitle || 'Price list'}</span>
        <span className="nb-tag-rule" aria-hidden />
        <span className="nb-tag-hint">
          {board.tagHint}
          {count > 0 && <>{board.tagHint ? ' - ' : ''}<span className="nb-num">{count}</span></>}
        </span>
      </span>
    </button>
  );
}

const noticeIsEmpty = (n: Notice) =>
  !n.label && !n.heading && !n.picture && !n.caption && !n.body.trim() && n.list.length === 0 && !n.sign && !n.linkUrl;

/** "https://www.harmsjournal.com/x" -> "harmsjournal.com", for a link with no words of its own. */
const siteName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Roughly how tall a notice will stand, in pixels at desktop width. Only good
 * enough to choose a column by — the board can't measure what it hasn't drawn.
 */
const lines = (text: string, perLine: number) =>
  text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
function noticeHeight(n: Notice): number {
  return 90
    + (n.picture ? 320 : 0) + (n.caption ? 36 : 0)
    + (n.label ? 24 : 0) + (n.heading ? lines(n.heading, 26) * 38 : 0)
    + (n.body.trim() ? lines(n.body.trim(), 42) * 27 : 0)
    + n.list.length * 46 + (n.sign ? 44 : 0) + (n.linkUrl ? 60 : 0);
}

/** Each notice goes to whichever column is shorter so far, keeping the two
 *  roughly level instead of leaving a gap under the poster. */
function balanceColumns(board: Board, notices: Notice[]): { left: Notice[]; right: Notice[] } {
  let leftH = 260 + (board.showMark ? 80 : 0) + lines(board.welcome, 48) * 30 + (board.signedBy || board.signedAs ? 90 : 0);
  let rightH = 220; // the hanging price tag
  const left: Notice[] = [];
  const right: Notice[] = [];
  for (const n of notices) {
    const h = noticeHeight(n) + 30;
    if (rightH <= leftH) { right.push(n); rightH += h; } else { left.push(n); leftH += h; }
  }
  return { left, right };
}

/** Small turns either way, so a row of notices looks pinned up by hand. */
const TILTS = [0.6, -0.9, 1.3, -0.5, 0.9, -1.2];

/** One notice: picture, words and list, in that order, each only if given. */
function NoticeSheet({ notice: n, tilt }: { notice: Notice; tilt: number }) {
  const torn = n.paper === 'torn';
  return (
    // The shadow sits on a wrapper: the torn edge is a clip-path, and a clip
    // takes the paper's own shadow off with everything else outside it.
    <div className="nb-shadow" style={{ transform: `rotate(${TILTS[tilt % TILTS.length]}deg)`, order: 10 + tilt }}>
      <section
        className={`nb-paper nb-note nb-wear nb-wear-${tilt % 3} ${torn ? 'nb-note-torn' : `nb-note-plain ${tilt % 2 ? 'nb-ragged-tear' : 'nb-ragged'}`}`}
      >
        <span className="nb-nail nb-nail-c" aria-hidden />
        {n.picture && (
          <figure className="nb-note-figure">
            <img src={n.picture} alt={n.caption || n.heading || 'A picture pinned to the board'} loading="lazy" />
            {n.caption && <figcaption className="nb-picture-caption">{n.caption}</figcaption>}
          </figure>
        )}
        {n.label && <p className="nb-smallcaps nb-note-small">{n.label}</p>}
        {n.heading && <h2 className="nb-note-heading">{n.heading}</h2>}
        {paragraphs(n.body).map((p, i) => <p key={i} className="nb-note-intro">{p}</p>)}
        {n.list.length > 0 && (
          <ol className={`nb-offers ${n.numbered ? '' : 'nb-offers-plain'}`}>
            {n.list.map((o, i) => (
              <li key={i}>
                {n.numbered && <span className="nb-offer-n">{String(i + 1).padStart(2, '0')}</span>}
                {o}
              </li>
            ))}
          </ol>
        )}
        {n.linkUrl && (
          <a className="nb-note-link" href={n.linkUrl} target="_blank" rel="noopener noreferrer">
            {n.linkLabel || siteName(n.linkUrl)}<span aria-hidden> →</span>
          </a>
        )}
        {n.sign && <p className="nb-note-sign">{n.sign}</p>}
      </section>
    </div>
  );
}

/** Sections in the order the clan first wrote them, so the list reads the way
 *  it was laid out rather than alphabetically. */
function bySection(items: CatalogueItem[]): Array<[string, CatalogueItem[]]> {
  const groups = new Map<string, CatalogueItem[]>();
  for (const it of items) {
    const key = it.section || 'Wares';
    const list = groups.get(key);
    if (list) list.push(it);
    else groups.set(key, [it]);
  }
  return [...groups.entries()];
}

function PriceList({ board, items, tabs, onClose }: {
  board: Board; items: CatalogueItem[]; tabs: PriceTab[]; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  // Tabs with nothing on them aren't shown: an empty tab is a dead end.
  const tabbed = priceGroups(items, tabs).filter((g) => g.items.length > 0);
  const [tabId, setTabId] = useState(() => tabbed[0]?.id ?? '');
  const active = tabbed.find((g) => g.id === tabId) ?? tabbed[0];
  const showTabs = tabbed.length > 1;

  // A search looks through every tab, since someone hunting for one tome
  // shouldn't have to guess which tab it's under. Each heading then says
  // which tab its section came from.
  const term = q.trim().toLowerCase();
  const inTab = bySection(active?.items ?? []);

  // Within a tab, one section can be picked out; '' is all of them. Reset on
  // a change of tab, since the sections differ from tab to tab.
  const [sectionKey, setSectionKey] = useState('');
  const picked = inTab.some(([sec]) => sec === sectionKey) ? sectionKey : '';
  const showSections = !term && inTab.length > 1;

  const groups: Array<[string, CatalogueItem[]]> = term
    ? tabbed.flatMap((g) => bySection(
      g.items.filter((i) => `${g.name} ${i.section} ${i.name} ${i.note}`.toLowerCase().includes(term)),
    ).map(([section, list]): [string, CatalogueItem[]] => [showTabs ? `${g.name} · ${section}` : section, list]))
    : inTab.filter(([sec]) => !picked || sec === picked);

  return (
    <Overlay onClose={onClose} label="Price list" className="nb-overlay-list">
      <div className="nb-scroll">
        <span className="nb-scroll-rod" aria-hidden />
        <div className="nb-paper nb-scroll-sheet">
          <button type="button" className="nb-close" onClick={onClose} aria-label="Roll the list back up">×</button>
          {board.tagSmall && <p className="nb-smallcaps nb-list-small">{board.tagSmall}</p>}
          <h2 className="nb-list-title">{board.listTitle || 'Price list'}</h2>
          <Divider />

          {showTabs && (
            <div className="nb-tabs" role="tablist" aria-label="Price list tabs">
              {tabbed.map((g) => (
                <button
                  key={g.id || 'other'} type="button" role="tab"
                  aria-selected={!term && g.id === active?.id}
                  className="nb-tab"
                  onClick={() => { setTabId(g.id); setQ(''); setSectionKey(''); }}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {showSections && (
            <div className="nb-sections" role="group" aria-label="Sections">
              {[['', 'All'] as const, ...inTab.map(([sec]) => [sec, sec] as const)].map(([key, label]) => (
                <button
                  key={key || 'all'} type="button" className="nb-section-pick"
                  aria-pressed={picked === key} onClick={() => setSectionKey(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <input
              className="nb-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={showTabs ? 'Search every tab…' : 'Search the list…'} aria-label="Search the price list"
            />
          )}

          {items.length === 0 ? (
            <p className="nb-empty">The list is still being written. Ask at the stronghold.</p>
          ) : groups.length === 0 ? (
            <p className="nb-empty">Nothing on the list matches “{q.trim()}”.</p>
          ) : (
            groups.map(([section, list]) => (
              <section key={section} className="nb-list-section">
                <h3 className="nb-smallcaps nb-list-heading"><span>{section}</span></h3>
                <ul>
                  {list.map((it) => (
                    <li key={it.id} className="nb-row">
                      <span className="nb-row-name">
                        {it.name}
                        {it.note && <span className="nb-row-note">{it.note}</span>}
                      </span>
                      <span className="nb-leader" aria-hidden />
                      <span className="nb-row-price">
                        {it.price > 0
                          ? <>{it.price.toLocaleString()}<span className="nb-septims"> septims</span></>
                          : <span className="nb-ask">Ask</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {board.listFoot && <p className="nb-list-foot">{board.listFoot}</p>}
        </div>
        <span className="nb-scroll-rod" aria-hidden />
      </div>
    </Overlay>
  );
}

function Entrance({ board, notice, onEnter, onGuest, onClose }: {
  board: Board;
  notice?: string;
  onEnter: (password: string) => Promise<void>;
  onGuest?: () => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice ?? '');

  const fail = (e: unknown) => {
    setErr(e instanceof AuthError
      ? 'That is not the word. Check it with your chief.'
      : 'Could not reach the stronghold. Check your connection and try again.');
    setBusy(false);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onEnter(password.trim());
    } catch (e2) {
      fail(e2);
    }
  };

  const guest = async () => {
    if (!onGuest) return;
    setBusy(true);
    setErr('');
    try {
      await onGuest();
    } catch (e2) {
      fail(e2);
    }
  };

  return (
    <Overlay onClose={onClose} label="Clan entrance" className="nb-overlay-door">
      <div className="nb-paper nb-door">
        <span className="nb-nail nb-nail-c" aria-hidden />
        <button type="button" className="nb-close" onClick={onClose} aria-label="Close">×</button>
        <img className="nb-door-banner" src="/clan-banner.webp" alt="" />
        <p className="nb-smallcaps nb-list-small">{board.name || 'Clan Orgrimm'}</p>
        <h2 className="nb-door-title">{board.doorTitle || 'Clan entrance'}</h2>
        {board.doorText && <p className="nb-door-text">{board.doorText}</p>}

        {err && <p className="nb-door-err" role="alert">{err}</p>}

        <form onSubmit={submit} className="nb-door-form">
          <label htmlFor="nb-password" className="nb-smallcaps nb-door-label">The word</label>
          <input
            id="nb-password" className="nb-search" type="password" value={password} autoFocus
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            placeholder="Ask your chief"
          />
          <button type="submit" className="nb-button" disabled={busy || !password.trim()}>
            {busy ? 'Checking…' : 'Enter the stronghold'}
          </button>
        </form>

        {onGuest && (
          <button type="button" className="nb-link" onClick={() => void guest()} disabled={busy}>
            Or look around the war room as a guest — read only
          </button>
        )}
      </div>
    </Overlay>
  );
}

/** A modal sheet over the board: Escape and the dark around it both close it,
 *  and focus goes back where it came from. */
function Overlay({ onClose, label, className, children }: {
  onClose: () => void; label: string; className?: string; children: ReactNode;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); }, []);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onKey]);

  return (
    <div
      className={`nb-overlay ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={label}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div className="nb-divider" aria-hidden>
      <span /><i /><span />
    </div>
  );
}

/** Two war-axes crossed behind a pair of tusks — the clan's mark, drawn in the
 *  same thin ink as the rest of the poster. */
function Emblem() {
  return (
    <div className="nb-emblem" aria-hidden>
      <span className="nb-emblem-rule" />
      <img className="nb-banner" src="/clan-banner.webp" alt="The banner of Clan Orgrimm" />
      <span className="nb-emblem-rule" />
    </div>
  );
}
