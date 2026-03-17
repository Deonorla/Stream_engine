import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GlobeScene, CITIES, latLonToVec3 } from "./GlobeScene";
import * as THREE from "three";

const TYPED_PHRASES = [
  "second by second.",
  "stream by stream.",
  "agent by agent.",
  "one stream at a time.",
];

// Invisible component inside Canvas — projects city 3D pos to screen coords
function CityProjector({ cityIndex, onProject }) {
  const { camera, size } = useThree();
  const vec = useRef(new THREE.Vector3());
  const sizeW = size.width;
  const sizeH = size.height;

  useEffect(() => {
    const city = CITIES[cityIndex];
    const pos3d = latLonToVec3(city.lat, city.lon, 1.01);
    vec.current.copy(pos3d).project(camera);
    const x = (vec.current.x * 0.5 + 0.5) * sizeW;
    const y = (-vec.current.y * 0.5 + 0.5) * sizeH;
    if (vec.current.z < 1)
      onProject({ x, y, city, containerW: sizeW, containerH: sizeH });
    else onProject(null);
  }, [cityIndex, sizeW, sizeH]);

  return null;
}

export default function LandingHero({
  networkName = "Westend Asset Hub",
  tokenSymbol = "USDC",
  paymentAssetId = 31337,
  routeCount = 0,
  assetCount = 0,
}) {
  const [cityIndex, setCityIndex] = useState(0);
  const [projected, setProjected] = useState(null);
  const [visible, setVisible] = useState(false);
  const [typed, setTyped] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const typingRef = useRef(null);
  const legend = useMemo(() => ([
    { color: "bg-flowpay-500", label: `${tokenSymbol} Payments` },
    { color: "bg-accent-500", label: "AI Calls" },
    { color: "bg-success-500", label: "RWA Yields" },
  ]), [tokenSymbol]);
  const overviewLabel = assetCount > 0 ? "indexed assets" : "protected routes";
  const overviewValue = assetCount > 0 ? assetCount : routeCount;

  // Typing effect
  useEffect(() => {
    const phrase = TYPED_PHRASES[phraseIdx];
    let i = 0;
    setTyped("");
    const type = () => {
      i++;
      setTyped(phrase.slice(0, i));
      if (i < phrase.length) {
        typingRef.current = setTimeout(type, 60);
      } else {
        // pause then erase
        typingRef.current = setTimeout(() => {
          const erase = () => {
            i--;
            setTyped(phrase.slice(0, i));
            if (i > 0) typingRef.current = setTimeout(erase, 30);
            else
              typingRef.current = setTimeout(
                () => setPhraseIdx((p) => (p + 1) % TYPED_PHRASES.length),
                300,
              );
          };
          typingRef.current = setTimeout(erase, 1800);
        }, 0);
      }
    };
    typingRef.current = setTimeout(type, 400);
    return () => clearTimeout(typingRef.current);
  }, [phraseIdx]);

  // Cycle to a new random city every 2.5s
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCityIndex(Math.floor(Math.random() * CITIES.length));
      }, 350);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  // Show card once projected position arrives
  useEffect(() => {
    if (projected) setVisible(true);
  }, [projected]);

  return (
    <section className="relative min-h-screen w-full bg-surface-950 overflow-hidden flex flex-col items-center justify-center pt-16">
      <div
        className="absolute inset-0 bg-grid bg-[size:40px_40px] opacity-[0.03] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 70% at 50% 55%, rgba(59,130,246,0.08) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* ── Headline ── */}
      <div className="relative z-10 text-center px-4 pt-3 md:pt-12 pb-0 animate-slide-up">
        {/* <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-flowpay-500/30 bg-flowpay-500/10 text-flowpay-300 text-xs font-mono mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" aria-hidden="true" />
          Live · Polkadot · x402 · AI-Powered
        </div> */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.05] mb-3">
          Money moves{" "}
          <span
            style={{
              background: "linear-gradient(90deg,#3b82f6,#a855f7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {typed}
            <span className="animate-pulse">|</span>
          </span>
        </h1>
        <p className="text-base text-surface-400 max-w-md mx-auto leading-relaxed">
          AI agents. Streaming payments. Real-world assets. All on {networkName}.
        </p>
        <p className="text-sm text-surface-500 max-w-lg mx-auto mt-3 leading-relaxed">
          Browse {routeCount || 0} paid routes, settle in {tokenSymbol}, and inspect {assetCount || 0} indexed rental assets from one runtime.
        </p>
      </div>

      {/* ── Globe ── */}
      <div
        className="relative w-full"
        style={{ height: "clamp(300px, 55vw, 72vh)" }}
        aria-label="Live global payment network"
        role="img"
      >
        <Canvas
          camera={{ position: [0, 0, 2.8], fov: 45 }}
          style={{ background: "transparent", width: "100%", height: "100%" }}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "high-performance",
          }}
          frameloop="always"
          dpr={[1, 1.5]}
        >
          <Suspense fallback={null}>
            <GlobeScene />
            <CityProjector cityIndex={cityIndex} onProject={setProjected} />
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              autoRotate={true}
              autoRotateSpeed={0.6}
              rotateSpeed={0.5}
            />
          </Suspense>
        </Canvas>

        {/* Single city card — pinned left or right, SVG line to city on globe */}
        {projected && (
          <div
            className="absolute inset-0 pointer-events-none hidden sm:block"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.35s" }}
          >
            {(() => {
              const side =
                projected.x > projected.containerW / 2 ? "right" : "left";
              const cardW = 152;
              const cardH = 68;
              const cardY = Math.max(
                16,
                Math.min(
                  projected.y - cardH / 2,
                  projected.containerH - cardH - 16,
                ),
              );
              // card anchor point (the tip of the line on the card side)
              const cardAnchorX =
                side === "left"
                  ? cardW + 12
                  : projected.containerW - cardW - 12;
              const cardAnchorY = cardY + cardH / 2;
              return (
                <>
                  {/* SVG connector */}
                  <svg className="absolute inset-0 w-full h-full overflow-visible">
                    <line
                      x1={cardAnchorX}
                      y1={cardAnchorY}
                      x2={projected.x}
                      y2={projected.y}
                      stroke={projected.city.color}
                      strokeWidth="1"
                      strokeOpacity="0.5"
                      strokeDasharray="4 3"
                    />
                    <circle
                      cx={projected.x}
                      cy={projected.y}
                      r="3"
                      fill={projected.city.color}
                      opacity="0.9"
                    />
                  </svg>
                  {/* Card */}
                  <div
                    className="absolute bg-surface-900/90 backdrop-blur-sm border rounded-xl px-3 py-2.5"
                    style={{
                      width: cardW,
                      top: cardY,
                      ...(side === "left" ? { left: 12 } : { right: 12 }),
                      borderColor: projected.city.color + "44",
                      borderLeftColor: projected.city.color,
                      borderLeftWidth: "2px",
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                        style={{ background: projected.city.color }}
                      />
                      <span
                        className="font-mono text-[10px] font-bold"
                        style={{ color: projected.city.color }}
                      >
                        {projected.city.type}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-white font-semibold leading-tight">
                      {projected.city.detail}
                    </p>
                    <p className="font-mono text-[10px] text-surface-500 mt-0.5">
                      {projected.city.label}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Live counter — top center */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className="flex items-center gap-2 bg-surface-900/80 backdrop-blur border border-surface-700 rounded-full px-4 py-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse"
              aria-hidden="true"
            />
            <span className="font-mono text-xs text-surface-400">
              {overviewLabel}
            </span>
            <span className="font-mono text-sm font-bold text-flowpay-400 tabular-nums">
              {overviewValue.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Legend — bottom left */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 pointer-events-none z-10">
          {legend.map((l) => (
            <div
              key={l.label}
              className="flex items-center gap-2 bg-surface-900/80 backdrop-blur border border-surface-700 rounded-lg px-3 py-1.5"
            >
              <span
                className={`w-2 h-2 rounded-full ${l.color}`}
                aria-hidden="true"
              />
              <span className="font-mono text-[10px] text-surface-400">
                {l.label}
              </span>
            </div>
          ))}
        </div>

        {/* Drag hint — bottom right */}
        <div className="absolute bottom-4 right-4 pointer-events-none z-10">
          <span className="font-mono text-[10px] text-surface-600 flex items-center gap-1">
            <svg
              width="10"
              height="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M15 15l6 6m-6-6v4.8m0-4.8h4.8M9 20.2V15m0 0H4.2M9 15l-6 6M15 4.2V9m0 0h4.8M15 9l6-6M9 9H4.2M9 9V4.2M9 9l-6-6"
                strokeLinecap="round"
              />
            </svg>
            drag to rotate
          </span>
        </div>
      </div>

      {/* ── CTAs ── */}
      <div className="relative z-10 text-center px-4 pb-10 space-y-4 animate-fade-in">
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            {
              label: "x402 Streaming",
              cls: "border-flowpay-500/40 text-flowpay-300 bg-flowpay-500/10",
            },
            {
              label: "RWA Studio",
              cls: "border-success-500/40 text-success-300 bg-success-500/10",
            },
            {
              label: `${tokenSymbol} asset ${paymentAssetId}`,
              cls: "border-pink-500/40 text-pink-300 bg-pink-500/10",
            },
          ].map((p) => (
            <span
              key={p.label}
              className={`text-xs font-mono px-3 py-1 rounded-full border ${p.cls}`}
            >
              {p.label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            to="/app"
            className="group relative px-8 py-3.5 rounded-xl font-semibold text-white overflow-hidden focus:outline-none focus:ring-2 focus:ring-flowpay-500/50"
            style={{ background: "linear-gradient(135deg,#3b82f6,#a855f7)" }}
            aria-label="Launch Stream Engine"
          >
            <span className="relative z-10">Launch App →</span>
            <span
              className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300"
              aria-hidden="true"
            />
          </Link>
          <Link
            to="/app/docs"
            className="px-8 py-3.5 rounded-xl font-semibold border border-surface-600 text-surface-300 hover:border-flowpay-500/60 hover:text-white transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-flowpay-500/50"
          >
            View Docs
          </Link>
        </div>
      </div>
    </section>
  );
}
