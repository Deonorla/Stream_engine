import { useEffect, useState } from "react";

function useCountUp(target, duration = 1600, active = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(id);
      } else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [active, target, duration]);
  return value;
}

export default function LandingStats({
  tokenSymbol = "USDC",
  settlement = "soroban-sac",
  routeCount = 0,
  assetCount = 0,
  contractCount = 0,
}) {
  const routesValue = useCountUp(routeCount, 1600, true);
  const assetsValue = useCountUp(assetCount, 1600, true);
  const contractsValue = useCountUp(contractCount, 1600, true);

  const stats = [
    {
      label: "Protected Routes",
      value: routesValue.toLocaleString(),
    },
    {
      label: "Indexed Assets",
      value: assetsValue.toLocaleString(),
    },
    {
      label: `${tokenSymbol} Settlement`,
      value: settlement,
    },
    {
      label: "Contracts Live",
      value: contractsValue.toLocaleString(),
    },
  ];

  return (
    <section className="w-full bg-surface-900 border-y border-surface-700 py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="space-y-1">
              <p className="text-3xl font-mono font-bold text-stream-400 tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs text-surface-400 uppercase tracking-widest">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
