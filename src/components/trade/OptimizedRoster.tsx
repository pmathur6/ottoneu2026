import type {
  HitterAllocation,
  PitcherAllocation,
  Player,
  BankedByPos,
  BankedByRole,
} from "@/lib/tradeOptimizer";

interface Props {
  teamName: string;
  type: "hitters" | "pitchers";
  allocations: HitterAllocation[] | PitcherAllocation[];
  playerLookup: Record<string, Player>; // playerid -> player row (for name)
  movedInIds: Set<string>; // players newly received from the trade
  bankedByPos?: Record<string, BankedByPos>;
  bankedByRole?: Record<string, BankedByRole>;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString();
const fmt2 = (n: number) => n.toFixed(2);
const fmt3 = (n: number) => n.toFixed(3);

function nameFor(id: string, lookup: Record<string, Player>): string {
  const p = lookup[id];
  if (!p) return id;
  return p["Name"] || p["Player"] || p["PlayerName"] || id;
}

const HITTER_POS_ORDER = ["C", "1B", "2B", "SS", "MI", "3B", "OF", "UTIL"];
const PITCHER_ROLE_ORDER = ["SP", "RP"];

export default function OptimizedRoster({
  teamName,
  type,
  allocations,
  playerLookup,
  movedInIds,
  bankedByPos,
  bankedByRole,
}: Props) {
  if (type === "hitters") {
    const hitterAllocs = allocations as HitterAllocation[];

    // Build per-position rows: one row per (player, position slot allocated)
    type HRow = {
      key: string;
      id: string;
      pos: string;
      gAlloc: number;
      gTotal: number;
      paAlloc: number;
      rAlloc: number;
      hrAlloc: number;
      obp: number;
      slg: number;
      valor: number | null; // valor only on full-player; we attribute proportionally per slot
      moved: boolean;
      used: boolean;
    };
    const playerRows: HRow[] = [];
    for (const a of hitterAllocs) {
      const moved = movedInIds.has(a.id);
      if (a.positionAllocations.length === 0) {
        // Unused player — single row
        playerRows.push({
          key: `${a.id}-unused`,
          id: a.id,
          pos: "—",
          gAlloc: 0,
          gTotal: a.gTotal,
          paAlloc: 0,
          rAlloc: 0,
          hrAlloc: 0,
          obp: a.blOBP,
          slg: a.blSLG,
          valor: 0,
          moved,
          used: false,
        });
      } else {
        for (const slot of a.positionAllocations) {
          const share = a.gTotal > 0 ? slot.gAlloc / a.gTotal : 0;
          playerRows.push({
            key: `${a.id}-${slot.pos}`,
            id: a.id,
            pos: slot.pos,
            gAlloc: slot.gAlloc,
            gTotal: a.gTotal,
            paAlloc: a.blPA * share,
            rAlloc: a.blR * share,
            hrAlloc: a.blHR * share,
            obp: a.blOBP,
            slg: a.blSLG,
            valor: a.valor * share,
            moved,
            used: slot.gAlloc > 0,
          });
        }
      }
    }
    // Sort: used first (by gAlloc desc), then unused
    playerRows.sort((a, b) => {
      if (a.used !== b.used) return a.used ? -1 : 1;
      return b.gAlloc - a.gAlloc;
    });

    // Build YTD rows per position from bankedByPos
    type YRow = {
      pos: string;
      G: number;
      PA: number;
      R: number;
      HR: number;
      OBP: number;
      SLG: number;
    };
    const ytdRows: YRow[] = [];
    for (const pos of HITTER_POS_ORDER) {
      const b = bankedByPos?.[pos];
      if (!b) continue;
      ytdRows.push({
        pos,
        G: b.G,
        PA: b.AB * 1.13,
        R: b.R,
        HR: b.HR,
        OBP: b.OBP,
        SLG: b.SLG,
      });
    }

    // Totals = YTD rows + player rows
    const totals = { gAlloc: 0, PA: 0, R: 0, HR: 0, obpNum: 0, slgNum: 0, valor: 0 };
    for (const y of ytdRows) {
      totals.gAlloc += y.G;
      totals.PA += y.PA;
      totals.R += y.R;
      totals.HR += y.HR;
      totals.obpNum += y.OBP * y.PA;
      totals.slgNum += y.SLG * y.PA;
    }
    for (const r of playerRows) {
      if (!r.used) continue;
      totals.gAlloc += r.gAlloc;
      totals.PA += r.paAlloc;
      totals.R += r.rAlloc;
      totals.HR += r.hrAlloc;
      totals.obpNum += r.obp * r.paAlloc;
      totals.slgNum += r.slg * r.paAlloc;
      totals.valor += r.valor ?? 0;
    }

    return (
      <div className="rounded border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30">
          <h4 className="text-sm font-semibold">{teamName} — Optimized Hitters (YTD + ROS)</h4>
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
              {ytdRows.map(y => (
                <tr key={`ytd-${y.pos}`} className="border-b border-border/40 bg-muted/40 italic">
                  <td className="text-left py-1 px-2 font-sans">YTD</td>
                  <td className="text-left py-1 px-2 font-sans">{y.pos}</td>
                  <td className="text-right py-1 px-2">{y.G.toFixed(0)}</td>
                  <td className="text-right py-1 px-2"></td>
                  <td className="text-right py-1 px-2">{fmtInt(y.PA)}</td>
                  <td className="text-right py-1 px-2">{fmtInt(y.R)}</td>
                  <td className="text-right py-1 px-2">{fmtInt(y.HR)}</td>
                  <td className="text-right py-1 px-2">{fmt3(y.OBP)}</td>
                  <td className="text-right py-1 px-2">{fmt3(y.SLG)}</td>
                  <td className="text-right py-1 px-2"></td>
                </tr>
              ))}
              {playerRows.map(r => (
                <tr
                  key={r.key}
                  className={`border-b border-border/40 ${!r.used ? "text-muted-foreground" : ""} ${r.moved ? "bg-primary/10" : ""}`}
                >
                  <td className="text-left py-1 px-2 font-sans">
                    {nameFor(r.id, playerLookup)}
                    {r.moved && <span className="ml-1 text-[10px] text-primary font-bold">NEW</span>}
                    {!r.used && <span className="ml-1 text-[10px] uppercase tracking-wider">unused</span>}
                  </td>
                  <td className="text-left py-1 px-2 font-sans">{r.pos}</td>
                  <td className="text-right py-1 px-2">{r.gAlloc.toFixed(0)}</td>
                  <td className="text-right py-1 px-2">{r.gTotal.toFixed(0)}</td>
                  <td className="text-right py-1 px-2">{fmtInt(r.paAlloc)}</td>
                  <td className="text-right py-1 px-2">{fmtInt(r.rAlloc)}</td>
                  <td className="text-right py-1 px-2">{fmtInt(r.hrAlloc)}</td>
                  <td className="text-right py-1 px-2">{fmt3(r.obp)}</td>
                  <td className="text-right py-1 px-2">{fmt3(r.slg)}</td>
                  <td className="text-right py-1 px-2">{r.used ? (r.valor ?? 0).toFixed(2) : ""}</td>
                </tr>
              ))}
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

  // ===== Pitchers =====
  const pitcherAllocs = (allocations as PitcherAllocation[])
    .slice()
    .sort((a, b) => {
      const aUsed = a.ipAlloc > 0 ? 1 : 0;
      const bUsed = b.ipAlloc > 0 ? 1 : 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      return b.ipAlloc - a.ipAlloc || b.valor - a.valor;
    });

  // YTD rows per role
  type PYRow = {
    role: string;
    IP: number;
    K: number;
    ERA: number;
    WHIP: number;
    HR9: number;
  };
  const ytdPRows: PYRow[] = [];
  for (const role of PITCHER_ROLE_ORDER) {
    const b = bankedByRole?.[role];
    if (!b) continue;
    ytdPRows.push({ role, IP: b.IP, K: b.K, ERA: b.ERA, WHIP: b.WHIP, HR9: b.HR9 });
  }

  const totalsP = { ipAlloc: 0, K: 0, eraNum: 0, whipNum: 0, hr9Num: 0, valor: 0 };
  for (const y of ytdPRows) {
    totalsP.ipAlloc += y.IP;
    totalsP.K += y.K;
    totalsP.eraNum += y.ERA * y.IP;
    totalsP.whipNum += y.WHIP * y.IP;
    totalsP.hr9Num += y.HR9 * y.IP;
  }
  for (const r of pitcherAllocs) {
    if (r.ipAlloc <= 0 || r.ipTotal <= 0) continue;
    const share = r.ipAlloc / r.ipTotal;
    totalsP.ipAlloc += r.ipAlloc;
    totalsP.K += r.blK * share;
    totalsP.eraNum += r.blERA * r.ipAlloc;
    totalsP.whipNum += r.blWHIP * r.ipAlloc;
    totalsP.hr9Num += r.blHR9 * r.ipAlloc;
    totalsP.valor += r.valor * share;
  }

  return (
    <div className="rounded border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30">
        <h4 className="text-sm font-semibold">{teamName} — Optimized Pitchers (YTD + ROS)</h4>
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
            {ytdPRows.map(y => (
              <tr key={`ytd-${y.role}`} className="border-b border-border/40 bg-muted/40 italic">
                <td className="text-left py-1 px-2 font-sans">YTD</td>
                <td className="text-left py-1 px-2 font-sans">{y.role}</td>
                <td className="text-right py-1 px-2">{y.IP.toFixed(1)}</td>
                <td className="text-right py-1 px-2"></td>
                <td className="text-right py-1 px-2">{fmtInt(y.K)}</td>
                <td className="text-right py-1 px-2">{fmt2(y.ERA)}</td>
                <td className="text-right py-1 px-2">{fmt2(y.WHIP)}</td>
                <td className="text-right py-1 px-2">{fmt2(y.HR9)}</td>
                <td className="text-right py-1 px-2"></td>
              </tr>
            ))}
            {pitcherAllocs.map(r => {
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
                  <td className="text-right py-1 px-2">{used ? r.valor.toFixed(2) : ""}</td>
                </tr>
              );
            })}
            <tr className="font-bold bg-muted/20">
              <td className="text-left py-1.5 px-2 font-sans" colSpan={2}>Total</td>
              <td className="text-right py-1.5 px-2">{totalsP.ipAlloc.toFixed(1)}</td>
              <td className="text-right py-1.5 px-2"></td>
              <td className="text-right py-1.5 px-2">{fmtInt(totalsP.K)}</td>
              <td className="text-right py-1.5 px-2">{totalsP.ipAlloc > 0 ? fmt2(totalsP.eraNum / totalsP.ipAlloc) : "—"}</td>
              <td className="text-right py-1.5 px-2">{totalsP.ipAlloc > 0 ? fmt2(totalsP.whipNum / totalsP.ipAlloc) : "—"}</td>
              <td className="text-right py-1.5 px-2">{totalsP.ipAlloc > 0 ? fmt2(totalsP.hr9Num / totalsP.ipAlloc) : "—"}</td>
              <td className="text-right py-1.5 px-2">{totalsP.valor.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
