import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { Player } from "@/lib/tradeOptimizer";

const num = (v: string | undefined) => {
  if (!v) return 0;
  const cleaned = String(v).replace(/[$,]/g, "").replace(/\((.+)\)/, "-$1").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const fmtMoney = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(0)}`;

interface Props {
  teamA: string;
  teamB: string;
  givesA: Player[]; // players Team A is giving up
  givesB: Player[];
  onRemove: (id: string) => void;
  onSimulate: () => void;
  canSimulate: boolean;
}

export default function TradeBasket({
  teamA, teamB, givesA, givesB, onRemove, onSimulate, canSimulate,
}: Props) {
  const sumValor = (players: Player[]) =>
    players.reduce((s, p) => s + num(p["Total WAR"]), 0);
  const sumSalary = (players: Player[]) =>
    players.reduce((s, p) => s + num(p["Current Salary"]), 0);
  const sumSurplus = (players: Player[]) =>
    players.reduce((s, p) => s + num(p["Surplus Value"]), 0);

  const valorA = sumValor(givesA);
  const valorB = sumValor(givesB);
  const salaryA = sumSalary(givesA);
  const salaryB = sumSalary(givesB);
  const surplusA = sumSurplus(givesA);
  const surplusB = sumSurplus(givesB);

  // Net deltas from each team's perspective: receives - gives
  const netValorA = valorB - valorA;
  const netValorB = valorA - valorB;
  const netSalaryA = salaryB - salaryA;
  const netSalaryB = salaryA - salaryB;
  const netSurplusA = surplusB - surplusA;
  const netSurplusB = surplusA - surplusB;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h2 className="text-lg font-semibold">Trade Basket</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BasketSide
          title={`${teamA || "Team A"} gives`}
          players={givesA}
          onRemove={onRemove}
          netValor={netValorA}
          netSalary={netSalaryA}
          netSurplus={netSurplusA}
        />
        <BasketSide
          title={`${teamB || "Team B"} gives`}
          players={givesB}
          onRemove={onRemove}
          netValor={netValorB}
          netSalary={netSalaryB}
          netSurplus={netSurplusB}
        />
      </div>
      <Button
        onClick={onSimulate}
        disabled={!canSimulate}
        className="w-full"
        size="lg"
      >
        Simulate Trade
      </Button>
    </div>
  );
}

function BasketSide({
  title, players, onRemove, netValor, netSalary, netSurplus,
}: {
  title: string;
  players: Player[];
  onRemove: (id: string) => void;
  netValor: number;
  netSalary: number;
  netSurplus: number;
}) {
  return (
    <div className="space-y-2 rounded border p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {players.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No players selected.
        </p>
      ) : (
        <ul className="space-y-1">
          {players.map(p => (
            <li key={p["playerid"]} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/40 last:border-0">
              <span className="font-medium truncate">{p["PlayerName"]}</span>
              <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                <span>{num(p["Total WAR"]).toFixed(1)} V</span>
                <span className="text-muted-foreground">{fmtMoney(num(p["Current Salary"]))}</span>
                <button onClick={() => onRemove(p["playerid"])} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border pt-2 space-y-1 text-xs font-mono">
        <DeltaRow label="Net VALOR" value={netValor} fmt={(n) => n.toFixed(1)} />
        <DeltaRow label="Net Salary" value={netSalary} fmt={fmtMoney} />
        <DeltaRow label="Net Surplus" value={netSurplus} fmt={fmtMoney} />
      </div>
    </div>
  );
}

function DeltaRow({ label, value, fmt }: { label: string; value: number; fmt: (n: number) => string }) {
  const colorClass = value > 0.001 ? "text-positive" : value < -0.001 ? "text-negative" : "text-muted-foreground";
  const sign = value > 0.001 ? "+" : "";
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={colorClass}>{sign}{fmt(value)}</span>
    </div>
  );
}
