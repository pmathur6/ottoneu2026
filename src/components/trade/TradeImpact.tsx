import type { OptimizedTeam } from "@/lib/tradeOptimizer";

interface Props {
  teamAName: string;
  teamBName: string;
  preA: OptimizedTeam;
  postA: OptimizedTeam;
  preB: OptimizedTeam;
  postB: OptimizedTeam;
}

const fmt = (n: number, decimals = 1) => n.toFixed(decimals);
const fmtRate = (n: number) => n.toFixed(3);

export default function TradeImpact({
  teamAName, teamBName, preA, postA, preB, postB,
}: Props) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h2 className="text-lg font-semibold">Trade Impact</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamImpact name={teamAName} pre={preA} post={postA} />
        <TeamImpact name={teamBName} pre={preB} post={postB} />
      </div>
    </div>
  );
}

function TeamImpact({ name, pre, post }: { name: string; pre: OptimizedTeam; post: OptimizedTeam }) {
  const valorDelta = post.totalValor - pre.totalValor;
  const verdict = valorDelta > 0.5 ? "WIN" : valorDelta < -0.5 ? "LOSS" : "EVEN";
  const verdictClass =
    verdict === "WIN" ? "bg-positive text-primary-foreground" :
    verdict === "LOSS" ? "bg-negative text-primary-foreground" :
    "bg-muted text-muted-foreground";

  return (
    <div className="rounded border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{name}</h3>
        <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-wider ${verdictClass}`}>
          {verdict}
        </span>
      </div>

      <div className="rounded bg-muted/40 p-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Optimized VALOR</div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono">{fmt(pre.totalValor)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono font-bold">{fmt(post.totalValor)}</span>
          <span className={`font-mono text-sm ml-auto ${valorDelta > 0 ? "text-positive" : valorDelta < 0 ? "text-negative" : ""}`}>
            {valorDelta > 0 ? "+" : ""}{fmt(valorDelta)}
          </span>
        </div>
      </div>

      <CategoryTable
        title="Hitting"
        rows={[
          ["R", pre.categories.R, post.categories.R, 0, true],
          ["HR", pre.categories.HR, post.categories.HR, 0, true],
          ["OBP", pre.categories.OBP, post.categories.OBP, 3, true],
          ["SLG", pre.categories.SLG, post.categories.SLG, 3, true],
        ]}
      />
      <CategoryTable
        title="Pitching"
        rows={[
          ["IP", pre.categories.IP, post.categories.IP, 1, true],
          ["K", pre.categories.K, post.categories.K, 0, true],
          ["ERA", pre.categories.ERA, post.categories.ERA, 2, false],
          ["WHIP", pre.categories.WHIP, post.categories.WHIP, 3, false],
          ["HR/9", pre.categories["HR/9"], pre.categories["HR/9"] && post.categories["HR/9"], 2, false],
        ] as Array<[string, number, number, number, boolean]>}
      />
    </div>
  );
}

function CategoryTable({ title, rows }: {
  title: string;
  rows: Array<[string, number, number, number, boolean]>;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-xs">
        <div className="font-semibold text-muted-foreground">Cat</div>
        <div className="font-semibold text-muted-foreground text-right">Pre</div>
        <div className="font-semibold text-muted-foreground text-right">Post</div>
        <div className="font-semibold text-muted-foreground text-right">Δ</div>
        {rows.map(([label, pre, post, decimals, higherBetter]) => {
          const delta = post - pre;
          const isPositive = higherBetter ? delta > 0 : delta < 0;
          const isNegative = higherBetter ? delta < 0 : delta > 0;
          const colorClass = Math.abs(delta) < 0.0005 ? "text-muted-foreground" :
            isPositive ? "text-positive" : isNegative ? "text-negative" : "";
          const fmtFn = decimals === 3 ? fmtRate : (n: number) => fmt(n, decimals);
          return (
            <div key={label} className="contents font-mono">
              <div>{label}</div>
              <div className="text-right">{fmtFn(pre)}</div>
              <div className="text-right">{fmtFn(post)}</div>
              <div className={`text-right ${colorClass}`}>
                {delta > 0 ? "+" : ""}{fmtFn(delta)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
