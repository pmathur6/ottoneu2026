import type { FullSeasonCategories, Category } from "@/lib/tradeOptimizer";
import { ALL_CATS, HIGHER_BETTER } from "@/lib/tradeOptimizer";

interface TeamPayload {
  name: string;
  before: FullSeasonCategories;
  after: FullSeasonCategories;
  rotoBefore: Record<Category, number>;
  rotoAfter: Record<Category, number>;
}

interface Props {
  teamA: TeamPayload;
  teamB: TeamPayload;
}

const CAT_FORMAT: Record<Category, (n: number) => string> = {
  R: n => Math.round(n).toLocaleString(),
  HR: n => Math.round(n).toLocaleString(),
  K: n => Math.round(n).toLocaleString(),
  OBP: n => n.toFixed(3),
  SLG: n => n.toFixed(3),
  ERA: n => n.toFixed(2),
  WHIP: n => n.toFixed(2),
  HR9: n => n.toFixed(2),
};

const CAT_LABEL: Record<Category, string> = {
  R: "R", HR: "HR", OBP: "OBP", SLG: "SLG",
  K: "K", ERA: "ERA", WHIP: "WHIP", HR9: "HR/9",
};

const fmtRoto = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : n.toFixed(1));
const fmtRotoChange = (n: number) =>
  (n > 0 ? "+" : "") + n.toFixed(1);

export default function TradeImpact({ teamA, teamB }: Props) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h2 className="text-lg font-semibold">Trade Impact</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamImpact payload={teamA} />
        <TeamImpact payload={teamB} />
      </div>
    </div>
  );
}

function TeamImpact({ payload }: { payload: TeamPayload }) {
  const { name, before, after, rotoBefore, rotoAfter } = payload;

  const rows = ALL_CATS.map(cat => {
    const beforeStat = before[cat];
    const afterStat = after[cat];
    const rb = rotoBefore[cat] ?? 0;
    const ra = rotoAfter[cat] ?? 0;
    return {
      cat,
      beforeStat,
      afterStat,
      statChange: afterStat - beforeStat,
      rb,
      ra,
      rotoChange: ra - rb,
    };
  });

  const totalRotoBefore = rows.reduce((s, r) => s + r.rb, 0);
  const totalRotoAfter = rows.reduce((s, r) => s + r.ra, 0);
  const totalRotoChange = totalRotoAfter - totalRotoBefore;

  const verdict = totalRotoChange > 1.5 ? "WIN" : totalRotoChange < -1.5 ? "LOSS" : "NEUTRAL";
  const verdictClass =
    verdict === "WIN" ? "bg-positive text-primary-foreground" :
    verdict === "LOSS" ? "bg-negative text-primary-foreground" :
    "bg-yellow-500 text-black";

  return (
    <div className="rounded border p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold">{name}</h3>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-sm ${
            totalRotoChange > 0.001 ? "text-positive" :
            totalRotoChange < -0.001 ? "text-negative" : "text-muted-foreground"
          }`}>
            {fmtRotoChange(totalRotoChange)} pts
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-wider ${verdictClass}`}>
            {verdict}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-left font-semibold py-1 pr-2">Cat</th>
              <th className="text-right font-semibold py-1 px-1">Before</th>
              <th className="text-right font-semibold py-1 px-1">After</th>
              <th className="text-right font-semibold py-1 px-1">Δ Stat</th>
              <th className="text-right font-semibold py-1 px-1">Pts Bef</th>
              <th className="text-right font-semibold py-1 px-1">Pts Aft</th>
              <th className="text-right font-semibold py-1 pl-1">Δ Pts</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map(r => {
              const higherBetter = HIGHER_BETTER.includes(r.cat);
              const statImproved = higherBetter ? r.statChange > 0 : r.statChange < 0;
              const statWorsened = higherBetter ? r.statChange < 0 : r.statChange > 0;
              const statClass = Math.abs(r.statChange) < 0.0005
                ? "text-muted-foreground"
                : statImproved ? "text-positive" : statWorsened ? "text-negative" : "";
              const ptsClass = r.rotoChange > 0.001 ? "text-positive"
                : r.rotoChange < -0.001 ? "text-negative" : "text-muted-foreground";
              const fmt = CAT_FORMAT[r.cat];
              return (
                <tr key={r.cat} className="border-b border-border/40">
                  <td className="text-left py-1 pr-2 font-sans text-muted-foreground">{CAT_LABEL[r.cat]}</td>
                  <td className="text-right py-1 px-1">{fmt(r.beforeStat)}</td>
                  <td className="text-right py-1 px-1">{fmt(r.afterStat)}</td>
                  <td className={`text-right py-1 px-1 ${statClass}`}>
                    {r.statChange > 0 ? "+" : ""}{fmt(r.statChange)}
                  </td>
                  <td className="text-right py-1 px-1">{fmtRoto(r.rb)}</td>
                  <td className="text-right py-1 px-1">{fmtRoto(r.ra)}</td>
                  <td className={`text-right py-1 pl-1 ${ptsClass}`}>{fmtRotoChange(r.rotoChange)}</td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td className="text-left py-2 pr-2 font-sans">Total</td>
              <td colSpan={3}></td>
              <td className="text-right py-2 px-1">{fmtRoto(totalRotoBefore)}</td>
              <td className="text-right py-2 px-1">{fmtRoto(totalRotoAfter)}</td>
              <td className={`text-right py-2 pl-1 ${
                totalRotoChange > 0.001 ? "text-positive" :
                totalRotoChange < -0.001 ? "text-negative" : "text-muted-foreground"
              }`}>
                {fmtRotoChange(totalRotoChange)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
