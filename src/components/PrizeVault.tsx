import {
  currency,
  PRIZES,
  matchesPublishedPrizes,
  type DisplayTier,
  type Prize,
} from "../config";
import type { Unit } from "../lib/db";
import { Brand } from "./Brand";

const metals: {
  id: DisplayTier;
  name: string;
  emblem: string;
  caption: string;
}[] = [
  { id: "platinum", name: "Platinum", emblem: "✧", caption: "Headline prizes" },
  { id: "gold", name: "Gold", emblem: "◇", caption: "Premium partner prizes" },
  { id: "silver", name: "Silver", emblem: "□", caption: "Haven experiences" },
  {
    id: "bronze",
    name: "Bronze",
    emblem: "○",
    caption: "A day at Haven. And more.",
  },
];

export function PrizeVault({
  prizes,
  units,
  remaining,
  live,
  closed,
  reduced,
}: {
  prizes: Prize[];
  units: Unit[];
  remaining: number;
  live: boolean;
  closed: boolean;
  reduced: boolean;
}) {
  // Older device snapshots retain their actual inventory and celebration tier.
  // Presentation comes from explicit catalogue fields, never price or release time.
  const catalogue = matchesPublishedPrizes(prizes) ? prizes : PRIZES;
  const inventoryLive = live && matchesPublishedPrizes(prizes);
  const cards = catalogue
    .map((p) => {
      const presentation = PRIZES.find((q) => q.id === p.id)!;
      return {
        ...p,
        displayTier: presentation.displayTier,
        displayName: presentation.displayName,
        displayOrder: presentation.displayOrder,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <section
      id="prize-vault"
      className="prize-vault"
      aria-labelledby="vault-title"
    >
      <header className="vault-header">
        <p className="eyebrow">THE DEMO DAY COLLECTION</p>
        <h2 id="vault-title">Today’s Prize Vault</h2>
        <p className="vault-legend">Platinum · Gold · Silver · Bronze</p>
        <p className="vault-summary">
          <strong>
            {catalogue.reduce((n, p) => n + (p.quantity ?? 0), 0)} featured
            prizes
            {inventoryLive && !closed ? ` · ${remaining} remaining` : ""}
          </strong>
          <span>Everyone wins at least a Haven Coworking Day Pass</span>
          {closed && <span>The contest has closed.</span>}
        </p>
      </header>
      <div className="vault-collection">
        {metals.map((metal, chapter) => (
          <section
            key={metal.id}
            className={`vault-section metal-${metal.id}`}
            aria-labelledby={`vault-${metal.id}`}
          >
            <header className="vault-chapter">
              <span className="tier-emblem" aria-hidden="true">
                {metal.emblem}
              </span>
              <div>
                <p className="eyebrow">
                  0{chapter + 1} / {metal.caption}
                </p>
                <h3 id={`vault-${metal.id}`}>{metal.name}</h3>
              </div>
            </header>
            <div className="vault-grid">
              {cards
                .filter((p) => p.displayTier === metal.id)
                .map((p) => {
                  const count = units.filter(
                    (u) => u.prizeId === p.id && !u.awardedTo && !u.disabled,
                  ).length;
                  const depleted =
                    inventoryLive && p.quantity !== null && count === 0;
                  return (
                    <article
                      key={p.id}
                      data-prize-id={p.id}
                      className={`vault-card ${p.tier === 5 ? "vault-grand" : ""} ${depleted ? "vault-awarded" : ""}`}
                    >
                      <div className="vault-card-top">
                        <span className="vault-metal-label">
                          {metal.emblem} {metal.name}
                        </span>
                        {p.tier === 5 && (
                          <span className="grand-badge">Grand Prize</span>
                        )}
                      </div>
                      <div className="vault-marks">
                        {p.sponsor === "nfih" && (
                          <>
                            <Brand name="haven" />
                            <span>+</span>
                          </>
                        )}
                        <Brand name={p.sponsor} />
                      </div>
                      <h4>{p.displayName}</h4>
                      <div className="vault-card-bottom">
                        <strong className="vault-value">
                          {currency(p.value)}
                          <small>
                            {(p.quantity ?? 0) > 1 ? " each" : " value"}
                          </small>
                        </strong>
                        <span className="vault-count">
                          {p.quantity === null
                            ? "Unlimited fallback"
                            : inventoryLive
                              ? `${count} remaining`
                              : `${p.quantity} in today’s prize pool`}
                        </span>
                      </div>
                      {p.quantity === null && (
                        <p className="vault-pass-note">
                          Every eligible entrant wins at least one Haven
                          Coworking Day Pass.
                        </p>
                      )}
                    </article>
                  );
                })}
            </div>
            {chapter === 0 && (
              <button
                className="back-to-spin"
                onClick={() => {
                  window.scrollTo({
                    top: 0,
                    behavior: reduced ? "instant" : "smooth",
                  });
                  document
                    .querySelector<HTMLInputElement>('input[name="first"]')
                    ?.focus({ preventScroll: true });
                }}
              >
                Back to spin ↑
              </button>
            )}
          </section>
        ))}
        <p className="vault-fine-print">
          Approximate values in CAD before HST. All prizes are potential and
          subject to the official rules, eligibility and skill-testing
          requirements. Wheel segments do not represent the odds of winning.
        </p>
      </div>
    </section>
  );
}
