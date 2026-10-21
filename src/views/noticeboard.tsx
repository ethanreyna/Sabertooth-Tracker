import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AuthError, fetchBoard, loadBoard } from '@/sync';
import type { PublicBoard } from '@/sync';
import { ClanMark } from '@/components/clan-mark';
import { DEFAULT_BOARD } from '@/data';
import type { CatalogueItem, Noticeboard as Board } from '@/types';
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
  const { board, catalogue } = live ?? fetched;

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

  return (
    <div className="nb-scene" style={board.backdrop ? { ['--nb-backdrop' as string]: `url("${board.backdrop}")` } : undefined}>
      <div className="nb-wrap">
        <div className="nb-board">
          <span className="nb-rivet nb-rivet-tl" aria-hidden />
          <span className="nb-rivet nb-rivet-tr" aria-hidden />
          <span className="nb-rivet nb-rivet-bl" aria-hidden />
          <span className="nb-rivet nb-rivet-br" aria-hidden />

          <header className="nb-boardhead">
            <span>{board.name ? `The ${board.name} noticeboard` : 'The clan noticeboard'}</span>
            {board.where && <span>{board.where}</span>}
          </header>

          <div className="nb-grid">
            <MainPoster board={board} />

            <div className="nb-side">
              <PriceTag board={board} count={visible.length} onOpen={() => openList(true)} />
              {board.picture && <PinnedPicture board={board} />}
              <OffersNote board={board} />
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
                <span className="nb-plaque-small">Of the clan?</span>
                <span className="nb-plaque-big">Clan entrance</span>
              </button>
            )}
          </footer>
        </div>
      </div>

      {listOpen && <PriceList board={board} items={visible} onClose={() => openList(false)} />}
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
    board: { ...DEFAULT_BOARD, offers: [...DEFAULT_BOARD.offers] },
    catalogue: [],
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
    <article className="nb-paper nb-poster">
      <span className="nb-nail nb-nail-l" aria-hidden />
      <span className="nb-nail nb-nail-r" aria-hidden />
      <div className="nb-poster-frame">
        {board.motto && <p className="nb-smallcaps nb-motto">{board.motto}</p>}
        <Emblem />
        {board.name && <h1 className="nb-name">{board.name}</h1>}
        {board.tagline && <p className="nb-tagline">{board.tagline}</p>}
        <Divider />
        <div className="nb-welcome">
          {paragraphs(board.welcome).map((p, i) => <p key={i}>{p}</p>)}
        </div>
        {(board.signedBy || board.signedAs) && (
          <div className="nb-sign">
            <div>
              {board.signedBy && <p className="nb-signature">{board.signedBy}</p>}
              {board.signedAs && <p className="nb-smallcaps nb-signedas">{board.signedAs}</p>}
            </div>
            <WaxSeal />
          </div>
        )}
        <p className="nb-smallcaps nb-poster-foot">Forged in fire <span aria-hidden>✦</span> Paid in septims</p>
      </div>
    </article>
  );
}

function PriceTag({ board, count, onOpen }: { board: Board; count: number; onOpen: () => void }) {
  return (
    <button type="button" className="nb-tag" onClick={onOpen} aria-haspopup="dialog">
      <span className="nb-tag-rod" aria-hidden />
      <span className="nb-tag-cord" aria-hidden />
      <span className="nb-tag-card">
        {board.name && <span className="nb-smallcaps nb-tag-small">{board.name}</span>}
        <span className="nb-tag-big">Price list</span>
        <span className="nb-tag-rule" aria-hidden />
        <span className="nb-tag-hint">
          {count > 0 ? `Untie & peruse our wares · ${count}` : 'Untie & peruse our wares'}
        </span>
      </span>
    </button>
  );
}

function PinnedPicture({ board }: { board: Board }) {
  return (
    <figure className="nb-paper nb-picture">
      <span className="nb-nail nb-nail-c" aria-hidden />
      <img src={board.picture} alt={board.pictureCaption || 'A picture pinned to the board'} loading="lazy" />
      {(board.pictureCaption || board.pictureNote) && (
        <figcaption>
          {board.pictureCaption && <span className="nb-picture-caption">{board.pictureCaption}</span>}
          {board.pictureNote && <span className="nb-picture-note">{board.pictureNote}</span>}
        </figcaption>
      )}
    </figure>
  );
}

function OffersNote({ board }: { board: Board }) {
  if (!board.offersHeading && !board.offersIntro && board.offers.length === 0) return null;
  return (
    // The shadow sits on a wrapper: the torn edge is a clip-path, and a clip
    // takes the paper's own shadow off with everything else outside it.
    <div className="nb-shadow">
    <section className="nb-paper nb-note">
      <span className="nb-nail nb-nail-c" aria-hidden />
      <p className="nb-smallcaps nb-note-small">From the forge-table</p>
      {board.offersHeading && <h2 className="nb-note-heading">{board.offersHeading}</h2>}
      {board.offersIntro && <p className="nb-note-intro">{board.offersIntro}</p>}
      {board.offers.length > 0 && (
        <ol className="nb-offers">
          {board.offers.map((o, i) => (
            <li key={i}><span className="nb-offer-n">{String(i + 1).padStart(2, '0')}</span>{o}</li>
          ))}
        </ol>
      )}
      {board.offersSign && <p className="nb-note-sign">{board.offersSign}</p>}
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

function PriceList({ board, items, onClose }: { board: Board; items: CatalogueItem[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = term
    ? items.filter((i) => `${i.section} ${i.name} ${i.note}`.toLowerCase().includes(term))
    : items;
  const groups = bySection(shown);

  return (
    <Overlay onClose={onClose} label="Price list" className="nb-overlay-list">
      <div className="nb-scroll">
        <span className="nb-scroll-rod" aria-hidden />
        <div className="nb-paper nb-scroll-sheet">
          <button type="button" className="nb-close" onClick={onClose} aria-label="Roll the list back up">×</button>
          {board.name && <p className="nb-smallcaps nb-list-small">{board.name}</p>}
          <h2 className="nb-list-title">Price list</h2>
          <Divider />

          {items.length > 0 && (
            <input
              className="nb-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search the list…" aria-label="Search the price list"
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

          <p className="nb-list-foot">
            Prices in septims and subject to the forge.
            {board.where ? ` Find us at ${board.where}.` : ''}
          </p>
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
        <p className="nb-smallcaps nb-list-small">{board.name || 'Clan Orgrimm'}</p>
        <h2 className="nb-door-title">Clan entrance</h2>
        <p className="nb-door-text">For the clan only. Speak the word and the war room opens: the ledger, the map, the stores and the rest.</p>

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
      <ClanMark />
      <span className="nb-emblem-rule" />
    </div>
  );
}

/** A blob of red wax, pressed with a tusked jaw. */
function WaxSeal() {
  return (
    <svg className="nb-seal" viewBox="0 0 100 100" width="96" height="96" aria-hidden>
      <defs>
        <radialGradient id="nb-wax" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#b3262a" />
          <stop offset="55%" stopColor="#7d1418" />
          <stop offset="100%" stopColor="#4a0a0d" />
        </radialGradient>
      </defs>
      <path
        fill="url(#nb-wax)"
        d="M50 3 C58 3 61 8 68 8 C76 9 79 15 85 19 C92 25 90 31 95 38 C99 46 95 52 97 59 C98 68 91 71 88 78 C84 86 77 86 70 91 C62 96 56 93 49 97 C41 99 36 93 29 92 C21 90 18 84 12 79 C6 73 8 66 4 59 C1 51 5 45 4 38 C4 29 11 26 15 19 C20 12 27 13 33 8 C39 4 44 3 50 3 Z"
      />
      <circle cx="50" cy="50" r="31" fill="none" stroke="#4a0a0d" strokeOpacity="0.55" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="27" fill="none" stroke="#d65a5a" strokeOpacity="0.25" strokeWidth="1" />
      <g fill="none" stroke="#f0a59c" strokeOpacity="0.75" strokeLinecap="round">
        {/* an orc's jaw pressed into the wax: the brow, the jaw, two tusks */}
        <path d="M35 40 Q50 33 65 40" strokeWidth="3" />
        <path d="M34 61 Q50 71 66 61" strokeWidth="3" />
        <path d="M40 63 C36 55 37 47 43 42" strokeWidth="4.2" />
        <path d="M60 63 C64 55 63 47 57 42" strokeWidth="4.2" />
        <circle cx="44" cy="50" r="1.8" fill="#f0a59c" stroke="none" />
        <circle cx="56" cy="50" r="1.8" fill="#f0a59c" stroke="none" />
      </g>
    </svg>
  );
}
