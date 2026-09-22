import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import QRCode from "qrcode";
import { registerSW } from "virtual:pwa-register";
import {
  AGE_TEXT,
  CLAIM_TEXT,
  CONSENT_TEXT,
  END,
  PRIZES,
  WHEEL_PRIZES,
  FEATURED_COUNT,
  matchesPublishedPrizes,
  START,
  currency,
  type Prize,
} from "./config";
import { db, HavenDB, type Spin } from "./lib/db";
import { award, complete, enter, initialize, setup } from "./lib/engine";
import { startSync, syncNow } from "./lib/sync";
import {
  celebrationSound,
  isMuted,
  setMuted,
  spinSound,
  unlockAudio,
} from "./lib/audio";
import { Brand, Sponsors } from "./components/Brand";
import { PrizeVault } from "./components/PrizeVault";
const Wheel = lazy(() => import("./components/Wheel"));
import Celebration from "./components/Celebration";
const Admin = lazy(() => import("./components/Admin"));
const Rules = lazy(() => import("./components/Rules"));
const testDb = new HavenDB("haven-demo-day-test-v3");
const EMPTY = { first: "", last: "", email: "", age: false, waitlist: false };
type Screen = "welcome" | "ready" | "spinning" | "result";
export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome"),
    [form, setForm] = useState({ ...EMPTY }),
    [entryId, setEntryId] = useState<string>(),
    [outcome, setOutcome] = useState<Spin>(),
    [preview, setPreview] = useState<Prize>(),
    [test, setTest] = useState(false),
    [admin, setAdmin] = useState(false),
    [rules, setRules] = useState(location.pathname === "/rules"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [muted, setMute] = useState(isMuted()),
    [cached, setCached] = useState(false),
    [qr, setQr] = useState(""),
    [count, setCount] = useState(15),
    [now, setNow] = useState(Date.now()),
    [dbReady, setDbReady] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, rules, admin]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const revealField = () => {
      if (document.activeElement instanceof HTMLInputElement)
        document.activeElement.scrollIntoView({
          block: "nearest",
          behavior: "instant",
        });
    };
    viewport?.addEventListener("resize", revealField);
    return () => viewport?.removeEventListener("resize", revealField);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const store = test ? testDb : db;
  const device = useLiveQuery(() => store.device.get("device"), [test]);
  const schedule = useLiveQuery(() => store.schedules.toArray(), [test]);
  const units = useLiveQuery(() => store.units.toArray(), [test]);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const lock = useRef(false),
    taps = useRef({ count: 0, last: 0 });
  const prize = preview ?? outcome?.prize;
  const index = WHEEL_PRIZES.findIndex((p) => p.id === prize?.id);
  const activeTime = test ? Date.parse(END) - 1000 : now;
  const open =
    !!schedule?.length &&
    !!device &&
    matchesPublishedPrizes(device.prizes) &&
    !device?.paused &&
    !device?.retired &&
    activeTime >= Date.parse(START) &&
    activeTime < Date.parse(END);
  const remaining = schedule?.length
    ? (units?.filter((u) => !u.awardedTo && !u.disabled).length ??
      FEATURED_COUNT)
    : (device?.prizes ?? PRIZES).reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  useEffect(() => {
    let disposed = false;
    void setup()
      .then(async (device) => {
        if (disposed) return;
        setDbReady(true);
        if (device.activeEntryId) {
          const spin = await db.spins
            .where("entryId")
            .equals(device.activeEntryId)
            .first();
          if (disposed) return;
          setEntryId(device.activeEntryId);
          if (spin) {
            setOutcome(spin);
            setScreen("result");
          } else setScreen("ready");
        }
      })
      .catch(() =>
        setError("Local storage is unavailable. Please ask booth staff."),
      );
    const stop = startSync();
    const timer = setInterval(() => {
      setNow(Date.now());
      setOnline(navigator.onLine);
    }, 1000);
    void QRCode.toDataURL(location.origin + "/rules", {
      width: 140,
      margin: 1,
      color: { dark: "#161523", light: "#f5f1e8" },
    }).then(setQr);
    registerSW({
      onOfflineReady() {
        setCached(true);
      },
    });
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(async () => {
        const names = await caches.keys();
        setCached(names.some((n) => n.includes("precache")));
      });
    }
    void navigator.storage?.persist?.();
    return () => {
      disposed = true;
      stop();
      clearInterval(timer);
    };
  }, []);
  async function reset() {
    setForm({ ...EMPTY });
    setEntryId(undefined);
    setOutcome(undefined);
    setPreview(undefined);
    setScreen("welcome");
    setError("");
    setBusy(false);
    lock.current = false;
    setCount(15);
    try {
      await complete(store);
      void syncNow();
    } catch {
      setError("Please ask booth staff before the next entry.");
    }
  }
  useEffect(() => {
    if (screen !== "result") return;
    const deadline = Date.now() + 15000;
    setCount(15);
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCount(left);
      if (!left) {
        clearInterval(timer);
        void reset();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [screen]);
  useEffect(() => {
    if (screen !== "ready") return;
    const timer = setTimeout(() => void reset(), 90000);
    return () => clearTimeout(timer);
  }, [screen]);
  // Hide all personal form state when backgrounded. A committed entry resumes by ID only.
  useEffect(() => {
    const clear = () => {
      if (document.hidden) setForm({ ...EMPTY });
    };
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    unlockAudio();
    try {
      const entry = await enter(
        form,
        store,
        test ? Date.parse(END) - 1000 : Date.now(),
      );
      setEntryId(entry.id);
      setForm({ ...EMPTY });
      setScreen("ready");
      void syncNow();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save. Please ask booth staff.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function spin() {
    if (lock.current || !entryId) return;
    lock.current = true;
    setBusy(true);
    setError("");
    unlockAudio();
    try {
      const result = await award(
        entryId,
        store,
        test ? Date.parse(END) - 1000 : Date.now(),
      );
      setOutcome(result);
      setScreen("spinning");
      spinSound();
      void syncNow();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to spin. Please ask booth staff.",
      );
      lock.current = false;
      setBusy(false);
    }
  }
  const reveal = () => {
    setScreen("result");
    setBusy(false);
    celebrationSound(prize?.tier ?? 1);
  };
  const openAdmin = () => {
    if (screen !== "welcome") return;
    const time = Date.now();
    taps.current = {
      count: time - taps.current.last < 1000 ? taps.current.count + 1 : 1,
      last: time,
    };
    if (taps.current.count >= 5) {
      taps.current.count = 0;
      setForm({ ...EMPTY });
      setAdmin(true);
    }
  };
  async function startTest() {
    await setup(testDb);
    await initialize(testDb);
    await complete(testDb);
    setTest(true);
    setAdmin(false);
    setForm({ ...EMPTY });
    setOutcome(undefined);
    setEntryId(undefined);
    setPreview(undefined);
    setScreen("welcome");
    lock.current = false;
  }
  function showPreview(p: Prize) {
    unlockAudio();
    setPreview(p);
    setOutcome(undefined);
    setForm({ ...EMPTY });
    setAdmin(false);
    setTest(true);
    setScreen("spinning");
    spinSound();
  }
  if (rules)
    return (
      <Suspense fallback={<div className="loading">Opening rules…</div>}>
        <Rules
          onClose={() => {
            if (location.pathname === "/rules") location.href = "/";
            else setRules(false);
          }}
        />
      </Suspense>
    );
  return (
    <div className={`app screen-${screen} ${test ? "test-mode" : ""}`}>
      <header className="kiosk-header">
        <button
          className="logo-button"
          onClick={openAdmin}
          aria-label="Haven Workspace"
        >
          <img
            className="brand brand-haven-icon"
            src="/brand/haven-logo-2-dk.png"
            alt="Haven Workspace"
          />
        </button>
        <div className="event-label">
          <span>NFIH DEMO DAY 2026</span>
          <small>NIAGARA FALLS · SEPTEMBER 22</small>
        </div>
        <button
          className="sound-button"
          onClick={() => {
            unlockAudio();
            setMuted(!muted);
            setMute(!muted);
          }}
          aria-pressed={muted}
          aria-label={muted ? "Turn sound on" : "Mute sound"}
        >
          <span aria-hidden="true">{muted ? "♩" : "♫"}</span> Sound{" "}
          {muted ? "off" : "on"}
        </button>
      </header>
      {test && (
        <div className="test-banner">
          TEST MODE · No real prizes or entries{" "}
          <button
            onClick={() => {
              void reset().then(() => {
                setTest(false);
                setAdmin(true);
              });
            }}
          >
            Exit test
          </button>
        </div>
      )}
      <main id="entry-hero" className="kiosk-main">
        <motion.section
          className="spectacle"
          layout={reduced ? false : "position"}
          transition={{ duration: 0.55, ease: "easeInOut" }}
        >
          {screen !== "welcome" && (
            <div className="hero-copy">
              <p className="eyebrow">SPIN YOUR WAY TO HAVEN</p>
              <h1>
                {screen === "ready"
                  ? "Your wheel awaits."
                  : screen === "spinning"
                    ? "Your spin."
                    : "Your prize reveal."}
              </h1>
            </div>
          )}
          <Suspense
            fallback={
              <div className="wheel-stage loading">Preparing your wheel…</div>
            }
          >
            <Wheel
              index={index < 0 ? 0 : index}
              idle={screen === "welcome"}
              suspended={admin || rules}
              spinning={screen === "spinning"}
              reduced={reduced}
              onFinish={reveal}
              tier={screen === "result" ? prize?.tier : 0}
            />
          </Suspense>
          <div className="wheel-caption">
            <span className="caption-star">✦</span>
            <p>
              <strong>
                {!test && now >= Date.parse(END)
                  ? "Thanks for spinning with Haven."
                  : `${remaining} featured prizes ${schedule?.length ? "still in play" : "in play today"}`}
              </strong>
              {!test && now >= Date.parse(END) && (
                <span>The Demo Day contest has closed.</span>
              )}
            </p>
          </div>
        </motion.section>
        <section
          className={`flow-panel ${screen === "result" ? "result-panel" : ""}`}
          aria-live="polite"
        >
          <Suspense fallback={null}>
            {screen === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: reduced ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="panel-heading">
                  <h1>
                    Spin Your Way <br />
                    to <span>Haven.</span>
                  </h1>
                </div>
                <form onSubmit={submit} autoComplete="off">
                  <div className="name-fields">
                    <label>
                      First name
                      <input
                        name="first"
                        aria-label="First name"
                        value={form.first}
                        maxLength={80}
                        required
                        autoComplete="off"
                        autoCapitalize="words"
                        onChange={(e) =>
                          setForm({ ...form, first: e.target.value })
                        }
                        placeholder="First name"
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        name="last"
                        aria-label="Last name"
                        value={form.last}
                        maxLength={80}
                        required
                        autoComplete="off"
                        autoCapitalize="words"
                        onChange={(e) =>
                          setForm({ ...form, last: e.target.value })
                        }
                        placeholder="Last name"
                      />
                    </label>
                  </div>
                  <label>
                    Email address
                    <input
                      name="email"
                      aria-label="Email address"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      maxLength={254}
                      required
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="check-row required-check">
                    <input
                      type="checkbox"
                      required
                      checked={form.age}
                      onChange={(e) =>
                        setForm({ ...form, age: e.target.checked })
                      }
                    />
                    <span>
                      {AGE_TEXT}{" "}
                      <button
                        type="button"
                        className="inline-link"
                        onClick={() => setRules(true)}
                      >
                        Read rules ↗
                      </button>
                    </span>
                  </label>
                  <label className="check-row consent-check">
                    <input
                      type="checkbox"
                      checked={form.waitlist}
                      onChange={(e) =>
                        setForm({ ...form, waitlist: e.target.checked })
                      }
                    />
                    <span>
                      <strong>
                        Haven.fm · Be in the know <em>OPTIONAL</em>
                      </strong>
                      {CONSENT_TEXT}
                    </span>
                  </label>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    className="primary entry-submit"
                    disabled={busy || !dbReady || !open}
                  >
                    <span className="entry-action">
                      {busy ? "Saving your entry…" : "Enter & Spin"}
                      {!open && !busy && (
                        <small>
                          {!test && now >= Date.parse(END)
                            ? "The contest has closed"
                            : !test && now < Date.parse(START)
                              ? "Opens September 22 · 3–7 p.m."
                              : "Please ask booth staff to open the wheel"}
                        </small>
                      )}
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                  {device?.paused && (
                    <p className="error">
                      The wheel is paused. Please ask booth staff.
                    </p>
                  )}
                </form>
                <p className="privacy-note">
                  Your name and email are used to administer the contest and
                  contact you about your potential prize. Marketing is optional.
                </p>
              </motion.div>
            )}
            {screen === "ready" && (
              <motion.div
                key="ready"
                className="spin-prompt"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <p className="eyebrow">YOUR ENTRY IS SAVED</p>
                <div className="ready-symbol" aria-hidden="true">
                  ✦
                </div>
                <h2>
                  Your moment
                  <br />
                  is here.
                </h2>
                <p>
                  One tap is all it takes.
                  <br />
                  Let’s see what’s waiting for you.
                </p>
                <button
                  className="primary spin-button"
                  disabled={busy}
                  onClick={() => void spin()}
                >
                  SPIN THE WHEEL <span>↗</span>
                </button>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <p className="fine-print">
                  Every eligible entrant receives a potential prize.
                  <br />
                  Eligibility and skill-testing requirements apply.
                </p>
              </motion.div>
            )}
            {screen === "spinning" && (
              <div className="spin-prompt spinning-copy">
                <p className="eyebrow">THE POSSIBILITIES ARE SPINNING</p>
                <div className="orbit-symbol" aria-hidden="true">
                  ✦
                </div>
                <h2>Here we go.</h2>
                <p>
                  Your potential prize is safely recorded.
                  <br />
                  Enjoy the moment.
                </p>
                <div className="spin-progress" />
              </div>
            )}
            {screen === "result" && prize && (
              <motion.div
                key="result"
                className={`result-content result-tier-${prize.tier}`}
                initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <p className="eyebrow">
                  {preview
                    ? "CELEBRATION PREVIEW"
                    : prize.tier === 5
                      ? "THE GRAND PRIZE MOMENT"
                      : "A LITTLE MORE HAVEN IN YOUR LIFE"}
                </p>
                <p className="result-lead">
                  {prize.approval ? "You spun:" : "Look what you spun!"}
                </p>
                <h2>{prize.name}</h2>
                <p className="prize-value">
                  {currency(prize.value)} CAD{" "}
                  <span>approximate value before HST</span>
                </p>
                {prize.sponsor !== "haven" && (
                  <Brand name={prize.sponsor} className="result-sponsor" />
                )}
                <p className="prize-claim">{prize.claim}</p>
                <div className="prize-code">
                  <span>
                    {preview
                      ? "TEST ONLY · NO PRIZE AWARDED"
                      : "YOUR POTENTIAL PRIZE CODE"}
                  </span>
                  <strong>{preview ? "PREVIEW" : outcome?.code}</strong>
                </div>
                <p className="claim-detail">{CLAIM_TEXT}</p>
                <p className="follow-up">
                  Haven will contact you, normally within three business days.
                </p>
                <button className="primary" onClick={() => void reset()}>
                  Done <span>Next guest in {count}s</span>
                </button>
              </motion.div>
            )}
          </Suspense>
        </section>
        {screen === "welcome" && (
          <a
            className="explore-prizes"
            href="#prize-vault"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("prize-vault")
                ?.scrollIntoView({ behavior: reduced ? "instant" : "smooth" });
            }}
          >
            Explore today’s prizes <span aria-hidden="true">↓</span>
          </a>
        )}
      </main>
      {screen === "welcome" && (
        <PrizeVault
          prizes={device?.prizes ?? PRIZES}
          remaining={remaining}
          units={units ?? []}
          live={
            units !== undefined &&
            !!schedule?.length &&
            (test || now >= Date.parse(START))
          }
          reduced={reduced}
          closed={!test && now >= Date.parse(END)}
        />
      )}
      <footer className="kiosk-footer">
        <Sponsors />
        <div className="disclosure">
          <p>
            <strong>NO PURCHASE NECESSARY.</strong> Canadian residents, 18+. One
            spin per person.
            <br />
            Potential prizes subject to eligibility, a skill-testing question
            and applicable approval.
          </p>
          <button
            onClick={() => setRules(true)}
            className="rules-qr"
            aria-label="Read official rules"
          >
            {qr && <img src={qr} alt="QR code for official rules" />}
            <span>
              Official
              <br />
              rules ↗
            </span>
          </button>
        </div>
        <span
          className="connection-dot"
          title={online ? "Online" : "Offline · entries saved on device"}
          aria-label={online ? "Online" : "Offline"}
        />
      </footer>
      {screen === "result" && prize && (
        <Celebration tier={prize.tier} reduced={reduced} />
      )}
      {admin && (
        <Suspense fallback={<div className="loading">Opening controls…</div>}>
          <Admin
            onClose={() => setAdmin(false)}
            onPreview={showPreview}
            onTest={() =>
              void startTest().catch(() =>
                setError("Unable to open test mode."),
              )
            }
            cached={cached}
          />
        </Suspense>
      )}
    </div>
  );
}
