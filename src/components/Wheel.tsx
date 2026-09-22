import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WHEEL_PRIZES } from "../config";
import {
  idleAdvance,
  landingRotation,
  spinProgress,
  TAU,
} from "../lib/wheelMath";
import { tick } from "../lib/audio";
export interface WheelProps {
  index?: number;
  idle?: boolean;
  suspended?: boolean;
  spinning: boolean;
  reduced: boolean;
  onFinish: () => void;
  tier?: number;
}
export function wheelArt() {
  const c = document.createElement("canvas");
  c.width = c.height = 1536;
  const ctx = c.getContext("2d")!;
  const r = 768,
    step = TAU / WHEEL_PRIZES.length;
  ctx.translate(r, r);
  WHEEL_PRIZES.forEach((p, i) => {
    const start = -Math.PI / 2 + (i - 0.5) * step;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r - 12, start, start + step);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 100, 0, 0, r);
    if (p.tier === 5) {
      g.addColorStop(0, "#f5d793");
      g.addColorStop(1, "#b58c3c");
    } else {
      g.addColorStop(0, i % 2 ? "#242047" : "#302852");
      g.addColorStop(1, i % 2 ? "#141426" : "#241f3b");
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#ac885a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.rotate(start + step / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.tier === 5 ? "#201a1c" : "#f8e9c5";
    ctx.font = "600 42px Manrope, sans-serif";
    ctx.fillText(p.short, r - 70, 0);
    ctx.fillStyle = p.tier === 5 ? "#352616" : "#baa680";
    ctx.beginPath();
    ctx.arc(r - 32, 0, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
  });
  return c;
}
function Disk({
  rotation,
  tier,
  reduced,
}: {
  rotation: React.RefObject<number>;
  tier: number;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(wheelArt());
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ clock, camera }) => {
    if (group.current) group.current.rotation.z = rotation.current;
    camera.position.x = reduced ? 0 : Math.sin(clock.elapsedTime * 0.3) * 0.045;
    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      7.3 - (tier >= 3 ? 0.12 * tier : 0),
      0.04,
    );
    camera.lookAt(0, 0, 0);
  });
  return (
    <group rotation={[0.06, -0.12, 0]}>
      <group ref={group}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 0.28, 96]} />
          <meshStandardMaterial
            color="#a87f42"
            metalness={0.82}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0, 0.15]}>
          <circleGeometry args={[2.44, 96]} />
          <meshStandardMaterial
            map={texture}
            metalness={0.35}
            roughness={0.48}
          />
        </mesh>
        <mesh position={[0, 0, 0.16]}>
          <torusGeometry args={[2.48, 0.065, 10, 96]} />
          <meshStandardMaterial
            color="#f6d68c"
            metalness={0.86}
            roughness={0.23}
          />
        </mesh>
        <mesh position={[0, 0, 0.19]}>
          <torusGeometry args={[2.32, 0.012, 6, 96]} />
          <meshStandardMaterial
            color="#c7a463"
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>
        {Array.from({ length: 52 }, (_, i) => (
          <mesh
            key={i}
            position={[
              Math.cos((i / 52) * TAU) * 2.48,
              Math.sin((i / 52) * TAU) * 2.48,
              0.21,
            ]}
          >
            <sphereGeometry args={[0.024, 6, 5]} />
            <meshStandardMaterial
              color="#ffe4a4"
              emissive="#ffc568"
              emissiveIntensity={tier >= 2 ? 2 : 0.6}
            />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.56, 0.6, 0.18, 48]} />
        <meshStandardMaterial color="#dfb969" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.32]}>
        <circleGeometry args={[0.59, 48]} />
        <meshStandardMaterial color="#eaca82" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.34]}>
        <torusGeometry args={[0.52, 0.016, 8, 48]} />
        <meshStandardMaterial color="#f8df9b" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}
class WebGLBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export default function Wheel({
  index = 0,
  idle = false,
  suspended = false,
  spinning,
  reduced,
  onFinish,
  tier = 0,
}: WheelProps) {
  const rotation = useRef(0),
    [angle, setAngle] = useState(0),
    [hidden, setHidden] = useState(document.hidden),
    [supported, setSupported] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const running = !hidden && inView && !suspended;
  const finish = useRef(onFinish);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting),
    );
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  finish.current = onFinish;
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      setSupported(!!gl);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setSupported(false);
    }
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!idle || !running || reduced) return;
    let frame = 0,
      previous = performance.now();
    const animate = (now: number) => {
      rotation.current += idleAdvance(now - previous);
      previous = now;
      if (stage.current) stage.current.dataset.angle = String(rotation.current);
      if (!supported) setAngle(rotation.current);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [idle, running, reduced, supported]);
  useEffect(() => {
    if (!spinning) {
      if (!idle && tier) {
        rotation.current = (index * TAU) / WHEEL_PRIZES.length;
        setAngle(rotation.current);
      }
      return;
    }
    const start = performance.now(),
      duration = reduced ? 1100 : 6800,
      from = rotation.current,
      end = landingRotation(index, WHEEL_PRIZES.length, from);
    let frame = 0,
      last = -1;
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      rotation.current = from + (end - from) * spinProgress(t);
      if (stage.current) stage.current.dataset.angle = String(rotation.current);
      const crossing = Math.floor(
        (rotation.current + TAU / WHEEL_PRIZES.length / 2) /
          (TAU / WHEEL_PRIZES.length),
      );
      if (crossing !== last && !document.hidden) {
        tick();
        last = crossing;
      }
      if (!document.hidden && !supported) setAngle(rotation.current);
      if (t < 1) frame = requestAnimationFrame(animate);
      else finish.current();
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [spinning, index, reduced, supported, idle, tier]);
  const art = useMemo(() => wheelArt().toDataURL("image/png"), []);
  const fallback = (
    <div className="flat-wheel">
      <img
        alt="Prize wheel"
        src={art}
        style={{ transform: `rotate(${-angle}rad)` }}
      />
      <div className="flat-hub" />
    </div>
  );
  return (
    <div
      ref={stage}
      data-mode={idle ? "idle" : spinning ? "spinning" : "rest"}
      data-rendering={
        running && ((idle && !reduced) || spinning || (tier >= 3 && !reduced))
          ? "active"
          : "paused"
      }
      className={`wheel-stage tier-light-${tier}`}
      role="img"
      aria-label={
        spinning
          ? "Prize wheel spinning"
          : `Prize wheel${tier ? ": " + WHEEL_PRIZES[index].name : ""}`
      }
    >
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="wheel-shadow" />
      <div className="wheel-canvas">
        {supported ? (
          <WebGLBoundary
            fallback={fallback}
            onFailure={() => setSupported(false)}
          >
            <Canvas
              dpr={[1, 1.5]}
              frameloop={
                !running
                  ? "never"
                  : spinning || (!reduced && (idle || tier >= 3))
                    ? "always"
                    : "demand"
              }
              camera={{ position: [0, 0, 7.3], fov: 43 }}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: "low-power",
              }}
              onCreated={({ gl }) =>
                gl.domElement.addEventListener("webglcontextlost", () =>
                  setSupported(false),
                )
              }
            >
              <ambientLight intensity={1.6} />
              <directionalLight
                position={[-3, 5, 6]}
                intensity={3}
                color="#ffe5ac"
              />
              <pointLight
                position={[4, -1, 3]}
                intensity={tier >= 4 ? 45 : 20}
                color="#a096ff"
              />
              <Disk rotation={rotation} tier={tier} reduced={reduced} />
            </Canvas>
          </WebGLBoundary>
        ) : (
          fallback
        )}
      </div>
      <div className="pointer" />
      <div className="hub-label" aria-hidden="true">
        <span>H</span>
        <small>HAVEN</small>
      </div>
      <div className="wheel-plinth" />
    </div>
  );
}
