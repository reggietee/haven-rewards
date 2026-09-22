import { useEffect, useRef } from "react";
import type { Tier } from "../config";
export default function Celebration({
  tier,
  reduced,
}: {
  tier: Tier;
  reduced: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (reduced) return;
    const canvas = ref.current!,
      ctx = canvas.getContext("2d")!;
    const w = window.innerWidth,
      h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    const colors = ["#f8d786", "#e8c160", "#faf0d1", "#b4a5fa", "#6c96ff"];
    const count = [0, 45, 85, 130, 175, 230][tier];
    const particles = Array.from({ length: count }, (_, i) => {
      const angle = Math.random() * Math.PI * 2,
        speed = (2 + Math.random() * 7) * (tier >= 4 ? 1.4 : 1);
      return {
        x: tier >= 3 && i % 3 === 0 ? (i % 2 ? 0.15 : 0.85) * w : w / 2,
        y: tier >= 3 && i % 3 === 0 ? h * 0.25 : h * 0.48,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        life: 90 + Math.random() * 130,
        color: colors[i % 5],
        size: 2 + Math.random() * 4,
        rotation: Math.random() * 6,
        stream: tier === 5 && i % 6 === 0,
      };
    });
    let frame = 0,
      last = performance.now(),
      elapsed = 0;
    const draw = (now: number) => {
      if (document.hidden) {
        last = now;
        frame = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min(2, (now - last) / 16.67);
      last = now;
      elapsed += dt;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.07 * dt;
        p.rotation += 0.04 * dt;
        p.life -= dt;
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, p.life / 45);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(0, 0, p.size, p.stream ? 32 : p.size * 1.6);
        ctx.restore();
      }
      if (elapsed < 280) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [tier, reduced]);
  return (
    <div
      className={`celebration celebration-${tier} ${reduced ? "reduced" : ""}`}
      aria-hidden="true"
    >
      <canvas ref={ref} />
      {tier >= 4 && <div className="shockwave" />}
      {tier === 5 && (
        <>
          <div className="grand-flash" />
          <div className="grand-wordmark">
            <img className="grand-logo" src="/brand/haven.png" alt="" />
            <span>MAKE ROOM FOR MORE.</span>
          </div>
        </>
      )}
    </div>
  );
}
