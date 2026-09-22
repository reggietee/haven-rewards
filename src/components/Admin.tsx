import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  adjustUnit,
  initialize,
  pause,
  retire,
  savePrizes,
} from "../lib/engine";
import { getReadiness, login, syncNow, type Readiness } from "../lib/sync";
import { exportCsv } from "../lib/csv";
import { supportsOfflineUnlock } from "../lib/operator";
import {
  END,
  FEATURED_COUNT,
  PRIZES,
  START,
  currency,
  matchesPublishedPrizes,
  type Prize,
} from "../config";
interface Props {
  onClose: () => void;
  onPreview: (p: Prize) => void;
  onTest: () => void;
  cached: boolean;
}
export default function Admin({ onClose, onPreview, onTest, cached }: Props) {
  const device = useLiveQuery(() => db.device.get("device"));
  const schedules = useLiveQuery(() => db.schedules.toArray());
  const units = useLiveQuery(() => db.units.toArray()) ?? [];
  const entries = useLiveQuery(() => db.entries.toArray()) ?? [];
  const pending =
    useLiveQuery(() => db.queue.where("status").equals("pending").count()) ?? 0;
  const [unlocked, setUnlocked] = useState(false),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState<Readiness>({
      configured: false,
      adminConfigured: false,
    }),
    [confirm, setConfirm] = useState<{
      label: string;
      word: string;
      run: () => Promise<unknown>;
    } | null>(null),
    [word, setWord] = useState(""),
    [draft, setDraft] = useState<Prize[]>([]),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    void getReadiness().then(setReady);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (device) setDraft(structuredClone(device.prizes));
  }, [device?.prizes]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  const ask = (label: string, word: string, action: () => Promise<unknown>) => {
    setWord("");
    setConfirm({ label, word, run: action });
  };
  useEffect(() => {
    if (unlocked && device?.authExpires && device.authExpires <= now)
      setUnlocked(false);
  }, [device?.authExpires, now, unlocked]);
  return (
    <div
      className="admin-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Booth controls"
    >
      <header>
        <div>
          <p className="eyebrow">HAVEN · OPERATOR ONLY</p>
          <h1>Booth controls</h1>
        </div>
        <button onClick={onClose}>Close controls ×</button>
      </header>
      {!unlocked ? (
        <form
          className="pin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await login(pin);
              setPin("");
              setUnlocked(true);
            });
          }}
        >
          <h2>Unlock this device</h2>
          <p>
            {supportsOfflineUnlock()
              ? "Enter your operator PIN each time. The first unlock requires a connection. An authorized device can verify the same PIN offline for seven days."
              : "Network preview: enter your operator PIN each time while connected to the preview server. Offline unlocking requires HTTPS or localhost."}
          </p>
          <label>
            Operator PIN
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              minLength={8}
              maxLength={20}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            Unlock
          </button>
          <p className="muted">
            {ready.adminConfigured
              ? "PIN configured."
              : "Server PIN is not configured or the server is offline. See README setup."}
          </p>
          {error && <p role="alert">{error}</p>}
        </form>
      ) : (
        <main className="admin-content">
          <div className="operator-warning">
            Use only this initialized iPad for the real event. Clearing Safari
            site data deletes the authoritative local store. Keep this device
            secured in Guided Access.
          </div>
          <section className="readiness">
            <h2>Readiness</h2>
            <dl>
              <div>
                <dt>App shell</dt>
                <dd>
                  {cached
                    ? "Cached · offline ready"
                    : "Not confirmed · load online first"}
                </dd>
              </div>
              <div>
                <dt>IndexedDB</dt>
                <dd>{device ? "Ready" : "Unavailable"}</dd>
              </div>
              <div>
                <dt>Event</dt>
                <dd>
                  {device?.retired
                    ? "Retired"
                    : schedules?.length
                      ? "Initialized · schedule locked"
                      : "Not initialized"}
                </dd>
              </div>
              <div>
                <dt>Sheets</dt>
                <dd>
                  {ready.configured
                    ? "Configured"
                    : "Local-only / server unavailable"}
                </dd>
              </div>
              <div>
                <dt>Queue</dt>
                <dd>{pending} pending</dd>
              </div>
              <div>
                <dt>Last successful sync</dt>
                <dd>
                  {device?.lastSync
                    ? new Date(device.lastSync).toLocaleString()
                    : "Not yet"}
                </dd>
              </div>
              <div>
                <dt>Installed</dt>
                <dd>
                  {matchMedia("(display-mode: standalone)").matches
                    ? "Standalone PWA"
                    : "Safari · Share → Add to Home Screen"}
                </dd>
              </div>
              <div>
                <dt>Device ID for pairing</dt>
                <dd className="mono">{device?.deviceId}</dd>
              </div>
            </dl>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await syncNow(true);
                  setReady(await getReadiness());
                })
              }
            >
              Retry synchronization
            </button>
          </section>
          <section>
            <h2>Real event</h2>
            {device && !matchesPublishedPrizes(device.prizes) && (
              <p role="alert" className="operator-warning">
                This device’s prize pool differs from the published{" "}
                {FEATURED_COUNT}-prize rules. New entries are disabled. Any
                initialized schedule and saved records are preserved. Export
                existing records and resolve the rules/configuration mismatch
                before using this device for the contest.
              </p>
            )}
            <p>
              {new Date(now).toLocaleString("en-CA", {
                timeZone: "America/Toronto",
              })}{" "}
              Eastern ·{" "}
              {now < Date.parse(START)
                ? "Before event"
                : now >= Date.parse(END)
                  ? "Event closed"
                  : `Hour ${Math.floor((now - Date.parse(START)) / 3600000) + 1} of 4`}
            </p>
            <p>
              {entries.length} entries ·{" "}
              {units.filter((u) => u.awardedTo).length} featured prizes awarded
              · {units.filter((u) => !u.awardedTo && !u.disabled).length}{" "}
              remaining
            </p>
            <div className="button-row">
              {!schedules?.length && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    ask(
                      "Initialize the real event on this device? Confirm the public rules match the quantities and values below. The release schedule cannot be regenerated.",
                      "INITIALIZE",
                      () => initialize(),
                    )
                  }
                >
                  Initialize real event
                </button>
              )}
              <button
                disabled={busy || device?.retired}
                onClick={() => void run(() => pause(!device?.paused))}
              >
                {device?.paused ? "Resume spins" : "Pause spins"}
              </button>
            </div>
          </section>
          <section>
            <h2>Test studio</h2>
            <p>
              Preview any result without consuming real inventory or recording a
              real entry.
            </p>
            <button onClick={onTest}>Open test entry flow</button>
            <div className="preview-grid">
              {PRIZES.map((p) => (
                <button key={p.id} onClick={() => onPreview(p)}>
                  <small>
                    {p.tier === 5 ? "GRAND PRIZE" : `TIER ${p.tier}`}
                  </small>
                  {p.name}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2>Inventory</h2>
            <p>
              {schedules?.length
                ? "The schedule is immutable. You may withdraw or restore only existing unawarded units. No additional units can be created."
                : "Edit values and quantities before initialization. Update the public rules source and redeploy if these differ from the published pool."}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Prize</th>
                    <th>Value CAD</th>
                    <th>Quantity</th>
                    <th>Awarded / remaining</th>
                    <th>Adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.map((p, i) => {
                    const list = units.filter((u) => u.prizeId === p.id);
                    const available = list.find(
                        (u) => !u.awardedTo && !u.disabled,
                      ),
                      withdrawn = list.find((u) => !u.awardedTo && u.disabled);
                    return (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          {schedules?.length ? (
                            currency(p.value)
                          ) : (
                            <input
                              aria-label={`${p.name} value`}
                              type="number"
                              min="0"
                              value={p.value}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d.map((q, j) =>
                                    i === j
                                      ? { ...q, value: Number(e.target.value) }
                                      : q,
                                  ),
                                )
                              }
                            />
                          )}
                        </td>
                        <td>
                          {p.quantity === null ? (
                            "Unlimited"
                          ) : schedules?.length ? (
                            p.quantity
                          ) : (
                            <input
                              aria-label={`${p.name} quantity`}
                              type="number"
                              min="0"
                              max="200"
                              value={p.quantity}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d.map((q, j) =>
                                    i === j
                                      ? {
                                          ...q,
                                          quantity: Number(e.target.value),
                                        }
                                      : q,
                                  ),
                                )
                              }
                            />
                          )}
                        </td>
                        <td>
                          {list.filter((u) => u.awardedTo).length} /{" "}
                          {p.quantity === null
                            ? "∞"
                            : list.filter((u) => !u.awardedTo && !u.disabled)
                                .length}
                        </td>
                        <td>
                          {!!schedules?.length && (
                            <div className="button-row">
                              {available && (
                                <button
                                  onClick={() =>
                                    ask(
                                      `Withdraw one unawarded ${p.name}? This reduces available inventory.`,
                                      "WITHDRAW",
                                      () => adjustUnit(available.id, true),
                                    )
                                  }
                                >
                                  −1
                                </button>
                              )}
                              {withdrawn && (
                                <button
                                  onClick={() =>
                                    ask(
                                      `Restore one withdrawn ${p.name}? Its original release time remains unchanged.`,
                                      "RESTORE",
                                      () => adjustUnit(withdrawn.id, false),
                                    )
                                  }
                                >
                                  +1
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!schedules?.length && (
              <button onClick={() => void run(() => savePrizes(draft))}>
                Save prize configuration
              </button>
            )}
          </section>
          <section>
            <h2>Exports & review</h2>
            <p>
              Export every tab for an event backup. Consents includes both
              opted-in and not-opted-in records with the exact proof text. Keep
              exports private.
            </p>
            <div className="button-row">
              {(
                ["Entries", "Consents", "Spins", "Inventory", "Audit"] as const
              ).map((tab) => (
                <button
                  key={tab}
                  onClick={() => void run(() => exportCsv(tab))}
                >
                  Export {tab}
                </button>
              ))}
            </div>
            <h3>Likely duplicate names</h3>
            {entries.filter((e) => e.duplicateName).length ? (
              <ul>
                {entries
                  .filter((e) => e.duplicateName)
                  .map((e) => (
                    <li key={e.id}>
                      {e.first} {e.last} · {e.email}
                    </li>
                  ))}
              </ul>
            ) : (
              <p>No likely duplicates flagged.</p>
            )}
            <p>
              Excluded-person review stays on the protected server-side sheet
              and is never returned to this device.
            </p>
          </section>
          <section>
            <h2>Close and purge event</h2>
            <p>
              After exports and synchronization, permanently retire this event
              and purge local entrant/consent data. Inventory, prize codes and
              audit evidence remain; the schedule can never be reinitialized
              here.
            </p>
            <button
              className="danger"
              onClick={() =>
                ask(
                  "Permanently retire the event and delete local personal records? Export all five tabs first. This cannot be undone.",
                  "BACKED UP",
                  async () => {
                    setWord("");
                    setConfirm({
                      label:
                        "Final confirmation: end the event permanently and purge personal records on this device.",
                      word: "PURGE",
                      run: () => retire(),
                    });
                  },
                )
              }
            >
              Retire and purge…
            </button>
          </section>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </main>
      )}
      {confirm && (
        <div className="confirm-overlay">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (word === confirm.word) {
                const action = confirm.run;
                setConfirm(null);
                void run(action);
              }
            }}
          >
            <h2>Confirm operator action</h2>
            <p>{confirm.label}</p>
            <label>
              Type {confirm.word}
              <input
                autoFocus
                value={word}
                autoComplete="off"
                onChange={(e) => setWord(e.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="primary"
                disabled={word !== confirm.word || busy}
              >
                Confirm
              </button>
              <button type="button" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
