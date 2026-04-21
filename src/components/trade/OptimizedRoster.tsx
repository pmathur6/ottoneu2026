import type { HitterAllocation, PitcherAllocation, Player } from "@/lib/tradeOptimizer";

interface Props {
  teamName: string;
  type: "hitters" | "pitchers";
  allocations: HitterAllocation[] | PitcherAllocation[];
  playerLookup: Record<string, Player>; // playerid -> player row (for name)
  movedInIds: Set<string>; // players newly received from the trade
}

const fmtInt = (n: number) => Math.round(n).toLocaleString();
const fmt2 = (n: number) => n.toFixed(2);
const fmt3 = (n: number) => n.toFixed(3);

function nameFor(id: string, lookup: Record<string, Player>): string {
  const p = lookup[id];
  if (!p) return id;
  return p["Name"] || p["Player"] || p["PlayerName"] || id;
}

export default function OptimizedRoster({ teamName, type, allocations, playerLookup, movedInIds }: Props) {
  if (type === "hitters") {
    const rows = (allocations as HitterAllocation[])
      .slice()
      .sort((a, b) => b.gAlloc - a.gAlloc || b.valor - a.valor);

    const totals = rows.reduce(
      (acc, r) => {
        if (r.gAlloc <= 0 || r.gTotal <= 0) return acc;
        const share = r.gAlloc / r.gTotal;
        acc.gAlloc += r.gAlloc;
        acc.PA += r.blPA * share;
        acc.R += r.blR * share;
        acc.HR += r.blHR * share;
        acc.obpNum += r.blOBP * (r.blPA * share);
        acc.slgNum += r.blSLG * (r.blPA * share);
        acc.valor += r.valor * share;
        return acc;
      },
      { gAlloc: 0, PA: 0, R: 0, HR: 0, obpNum: 0, slgNum: 0, valor: 0 }
    );

    return (
      <div className="rounded border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30">
          <h4 className="text-sm font-semibold">{teamName} — Optimized Hitters (ROS)</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="text-left font-semibold py-1.5 px-2">Player</th>
                <th className="text-left font-semibold py-1.5 px-2">Pos Used</th>
                <th className="text-right font-semibold py-1.5 px-2">G Alloc</th>
                <th className="text-right font-semibold py-1.5 px-2">G Tot</th>
                <th className="text-right font-semibold py-1.5 px-2">PA</th>
                <th className="text-right font-semibold py-1.5 px-2">R</th>
                <th className="text-right font-semibold py-1.5 px-2">HR</th>
                <th className="text-right font-semibold py-1.5 px-2">OBP</th>
                <th className="text-right font-semibold py-1.5 px-2">SLG</th>
                <th className="text-right font-semibold py-1.5 px-2">VALOR</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map(r => {
                const share = r.gTotal > 0 ? r.gAlloc / r.gTotal : 0;
                const used = r.gAlloc > 0;
                const moved = movedInIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border/40 ${!used ? "text-muted-foreground" : ""} ${moved ? "bg-primary/10" : ""}`}
                  >
                    <td className="text-left py-1 px-2 font-sans">
                      {nameFor(r.id, playerLookup)}
                      {moved && <span className="ml-1 text-[10px] text-primary font-bold">NEW</span>}
                      {!used && <span className="ml-1 text-[10px] uppercase tracking-wider">unused</span>}
                    </td>
                    <td className="text-left py-1 px-2 font-sans">{r.positionsFilled.join("/") || "—"}</td>
                    <td className="text-right py-1 px-2">{r.gAlloc.toFixed(0)}</td>
                    <td className="text-right py-1 px-2">{r.gTotal.toFixed(0)}</td>
                    <td className="text-right py-1 px-2">{fmtInt(r.blPA * share)}</td>
                    <td className="text-right py-1 px-2">{fmtInt(r.blR * share)}</td>
                    <td className="text-right py-1 px-2">{fmtInt(r.blHR * share)}</td>
                    <td className="text-right py-1 px-2">{fmt3(r.blOBP)}</td>
                    <td className="text-right py-1 px-2">{fmt3(r.blSLG)}</td>
                    <td className="text-right py-1 px-2">{r.valor.toFixed(2)}</td>
                  </tr>
                );
              })}
              <tr className="font-bold bg-muted/20">
                <td className="text-left py-1.5 px-2 font-sans" colSpan={2}>Total</td>
                <td className="text-right py-1.5 px-2">{totals.gAlloc.toFixed(0)}</td>
                <td className="text-right py-1.5 px-2"></td>
                <td className="text-right py-1.5 px-2">{fmtInt(totals.PA)}</td>
                <td className="text-right py-1.5 px-2">{fmtInt(totals.R)}</td>
                <td className="text-right py-1.5 px-2">{fmtInt(totals.HR)}</td>
                <td className="text-right py-1.5 px-2">{totals.PA > 0 ? fmt3(totals.obpNum / totals.PA) : "—"}</td>
                <td className="text-right py-1.5 px-2">{totals.PA > 0 ? fmt3(totals.slgNum / totals.PA) : "—"}</td>
                <td className="text-right py-1.5 px-2">{totals.valor.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Pitchers
  const rows = (allocations as PitcherAllocation[])
    .slice()
    .sort((a, b) => b.ipAlloc - a.ipAlloc || b.valor - a.valor);

  const totals = rows.reduce(
    (acc, r) => {
      if (r.ipAlloc <= 0 || r.ipTotal <= 0) return acc;
      const share = r.ipAlloc / r.ipTotal;
      acc.ipAlloc += r.ipAlloc;
      acc.K += r.blK * share;
      acc.eraNum += r.blERA * r.ipAlloc;
      acc.whipNum += r.blWHIP * r.ipAlloc;
      acc.hr9Num += r.blHR9 * r.ipAlloc;
      acc.valor += r.valor * share;
      return acc;
    },
    { ipAlloc: 0, K: 0, eraNum: 0, whipNum: 0, hr9Num: 0, valor: 0 }
  );

  return (
    <div className="rounded border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30">
        <h4 className="text-sm font-semibold">{teamName} — Optimized Pitchers (ROS)</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b">
            <tr>
              <th className="text-left font-semibold py-1.5 px-2">Player</th>
              <th className="text-left font-semibold py-1.5 px-2">Role</th>
              <th className="text-right font-semibold py-1.5 px-2">IP Alloc</th>
              <th className="text-right font-semibold py-1.5 px-2">IP Tot</th>
              <th className="text-right font-semibold py-1.5 px-2">K</th>
              <th className="text-right font-semibold py-1.5 px-2">ERA</th>
              <th className="text-right font-semibold py-1.5 px-2">WHIP</th>
              <th className="text-right font-semibold py-1.5 px-2">HR/9</th>
              <th className="text-right font-semibold py-1.5 px-2">VALOR</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map(r => {
              const share = r.ipTotal > 0 ? r.ipAlloc / r.ipTotal : 0;
              const used = r.ipAlloc > 0;
              const moved = movedInIds.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-b border-border/40 ${!used ? "text-muted-foreground" : ""} ${moved ? "bg-primary/10" : ""}`}
                >
                  <td className="text-left py-1 px-2 font-sans">
                    {nameFor(r.id, playerLookup)}
                    {moved && <span className="ml-1 text-[10px] text-primary font-bold">NEW</span>}
                    {!used && <span className="ml-1 text-[10px] uppercase tracking-wider">unused</span>}
                  </td>
                  <td className="text-left py-1 px-2 font-sans">{r.role}</td>
                  <td className="text-right py-1 px-2">{r.ipAlloc.toFixed(1)}</td>
                  <td className="text-right py-1 px-2">{r.ipTotal.toFixed(1)}</td>
                  <td className="text-right py-1 px-2">{fmtInt(r.blK * share)}</td>
                  <td className="text-right py-1 px-2">{fmt2(r.blERA)}</td>
                  <td className="text-right py-1 px-2">{fmt2(r.blWHIP)}</td>
                  <td className="text-right py-1 px-2">{fmt2(r.blHR9)}</td>
                  <td className="text-right py-1 px-2">{r.valor.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr className="font-bold bg-muted/20">
              <td className="text-left py-1.5 px-2 font-sans" colSpan={2}>Total</td>
              <td className="text-right py-1.5 px-2">{totals.ipAlloc.toFixed(1)}</td>
              <td className="text-right py-1.5 px-2"></td>
              <td className="text-right py-1.5 px-2">{fmtInt(totals.K)}</td>
              <td className="text-right py-1.5 px-2">{totals.ipAlloc > 0 ? fmt2(totals.eraNum / totals.ipAlloc) : "—"}</td>
              <td className="text-right py-1.5 px-2">{totals.ipAlloc > 0 ? fmt2(totals.whipNum / totals.ipAlloc) : "—"}</td>
              <td className="text-right py-1.5 px-2">{totals.ipAlloc > 0 ? fmt2(totals.hr9Num / totals.ipAlloc) : "—"}</td>
              <td className="text-right py-1.5 px-2">{totals.valor.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
