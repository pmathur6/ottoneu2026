import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchSheetRange } from "@/lib/sheets";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const HITTER_POS = ["C", "1B", "2B", "SS", "MI", "3B", "OF", "Util"];
const PITCHER_POS = ["SP", "RP"];

const HITTER_STATS = ["G", "AB", "R", "HR", "OBP", "SLG"] as const;
const PITCHER_STATS = ["G", "IP", "K", "HR9", "ERA", "WHIP"] as const;

// Higher-is-better
const HIGHER_BETTER = new Set(["R", "HR", "OBP", "SLG", "K", "AB", "G", "IP"]);
// Lower-is-better
const LOWER_BETTER = new Set(["ERA", "WHIP", "HR9", "HR/9"]);

const RATE_STATS = new Set(["OBP", "SLG", "ERA", "WHIP", "HR9", "HR/9"]);

function fmtVal(stat: string, v: string | number): string {
  if (v === "" || v == null) return "";
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  if (!isFinite(n)) return String(v);
  if (RATE_STATS.has(stat)) return n.toFixed(3);
  if (stat === "IP") return n.toFixed(1);
  return Math.round(n).toLocaleString();
}

function rankColor(rank: number | null, total = 12): string {
  if (rank == null) return "";
  if (rank <= 3) return "text-standings-green";
  if (rank >= total - 2) return "text-standings-red";
  return "";
}

type Row = Record<string, string>;

const TeamProduction = () => {
  const [team, setTeam] = useState<string>("");

  const { data: prodRaw, isLoading: prodLoading } = useQuery({
    queryKey: ["team-production-raw"],
    queryFn: () => fetchSheetRange("Team Production", "A1:S200"),
  });

  const { data: projRaw, isLoading: projLoading } = useQuery({
    queryKey: ["team-projections-raw"],
    queryFn: () => fetchSheetRange("Team Projections", "A1:AK300"),
  });

  // ---------- CURRENT (Team Production) ----------
  const current = useMemo(() => {
    if (!prodRaw || prodRaw.length < 2) {
      return { teams: [] as string[], hitterByTeam: {} as Record<string, Record<string, Row>>, pitcherByTeam: {} as Record<string, Record<string, Row>>, hitterRanks: {} as Record<string, Record<string, Record<string, number>>>, pitcherRanks: {} as Record<string, Record<string, Record<string, number>>> };
    }
    const rows = prodRaw.slice(1);
    const hitterByTeam: Record<string, Record<string, Row>> = {};
    const pitcherByTeam: Record<string, Record<string, Row>> = {};
    const teamSet = new Set<string>();

    for (const r of rows) {
      const tName = r[1]?.trim();
      const pos = r[2]?.trim();
      if (tName && pos) {
        teamSet.add(tName);
        if (!hitterByTeam[tName]) hitterByTeam[tName] = {};
        hitterByTeam[tName][pos] = {
          G: r[3] ?? "", AB: r[4] ?? "", R: r[5] ?? "", HR: r[6] ?? "", OBP: r[7] ?? "", SLG: r[8] ?? "",
        };
      }
      const pName = r[11]?.trim();
      const ppos = r[12]?.trim();
      if (pName && ppos) {
        teamSet.add(pName);
        if (!pitcherByTeam[pName]) pitcherByTeam[pName] = {};
        pitcherByTeam[pName][ppos] = {
          G: r[13] ?? "", IP: r[14] ?? "", K: r[15] ?? "", HR9: r[16] ?? "", ERA: r[17] ?? "", WHIP: r[18] ?? "",
        };
      }
    }

    // rankings: [pos][stat][team] = rank
    const rankFor = (byTeam: Record<string, Record<string, Row>>, positions: string[], stats: readonly string[]) => {
      const out: Record<string, Record<string, Record<string, number>>> = {};
      for (const pos of positions) {
        out[pos] = {};
        for (const stat of stats) {
          if (stat === "G" || stat === "IP" || stat === "AB") continue;
          const entries: { team: string; v: number }[] = [];
          for (const t of Object.keys(byTeam)) {
            const v = parseFloat(String(byTeam[t]?.[pos]?.[stat] ?? "").replace(/,/g, ""));
            if (isFinite(v)) entries.push({ team: t, v });
          }
          const higher = !LOWER_BETTER.has(stat);
          entries.sort((a, b) => higher ? b.v - a.v : a.v - b.v);
          out[pos][stat] = {};
          entries.forEach((e, i) => { out[pos][stat][e.team] = i + 1; });
        }
      }
      return out;
    };

    const hitterRanks = rankFor(hitterByTeam, HITTER_POS, HITTER_STATS);
    const pitcherRanks = rankFor(pitcherByTeam, PITCHER_POS, PITCHER_STATS);

    return {
      teams: Array.from(teamSet).sort(),
      hitterByTeam, pitcherByTeam, hitterRanks, pitcherRanks,
    };
  }, [prodRaw]);

  // ---------- LIVE STANDINGS (for totals) ----------
  const { data: liveRaw } = useQuery({
    queryKey: ["live-standings"],
    queryFn: () => fetchSheetRange("Live Standings", "A1:T50"),
  });

  const liveByTeam = useMemo(() => {
    if (!liveRaw) return {} as Record<string, Record<string, string>>;
    const idx = liveRaw.findIndex(r => r[0]?.trim() === "Team");
    if (idx < 0) return {} as Record<string, Record<string, string>>;
    const map: Record<string, Record<string, string>> = {};
    for (const r of liveRaw.slice(idx + 1)) {
      const t = r[0]?.trim();
      if (!t) continue;
      map[t] = {
        R: r[1]?.trim() ?? "",
        HR: r[2]?.trim() ?? "",
        OBP: r[3]?.trim() ?? "",
        SLG: r[4]?.trim() ?? "",
        K: r[5]?.trim() ?? "",
        ERA: r[6]?.trim() ?? "",
        WHIP: r[7]?.trim() ?? "",
        HR9: r[8]?.trim() ?? "",
      };
    }
    return map;
  }, [liveRaw]);

  // Live Standings rankings (cols 10-19): Team,R,HR,OBP,SLG,ERA,K,WHIP,HR9,Total
  const liveRanksByTeam = useMemo(() => {
    if (!liveRaw) return {} as Record<string, Record<string, string>>;
    const idx = liveRaw.findIndex(r => r[0]?.trim() === "Team");
    if (idx < 0) return {} as Record<string, Record<string, string>>;
    const map: Record<string, Record<string, string>> = {};
    const clean = (v: string) => (v ?? "").trim().replace(/\.0$/, "");
    for (const r of liveRaw.slice(idx + 1)) {
      const t = r[10]?.trim();
      if (!t) continue;
      map[t] = {
        R: clean(r[11]), HR: clean(r[12]), OBP: clean(r[13]), SLG: clean(r[14]),
        ERA: clean(r[15]), K: clean(r[16]), WHIP: clean(r[17]), HR9: clean(r[18]),
      };
    }
    return map;
  }, [liveRaw]);

  // EOS Standings rankings (cols 9-16): R,HR,OBP,SLG,K,ERA,WHIP,HR9
  const { data: eosRaw } = useQuery({
    queryKey: ["eos-standings"],
    queryFn: () => fetchSheetRange("EOS Standings", "A1:AA50"),
  });
  const eosRanksByTeam = useMemo(() => {
    if (!eosRaw) return {} as Record<string, Record<string, string>>;
    const idx = eosRaw.findIndex(r => r[0]?.trim() === "Team");
    if (idx < 0) return {} as Record<string, Record<string, string>>;
    const map: Record<string, Record<string, string>> = {};
    const clean = (v: string) => (v ?? "").trim().replace(/\.0$/, "");
    for (const r of eosRaw.slice(idx + 1)) {
      const t = r[0]?.trim();
      if (!t) continue;
      map[t] = {
        R: clean(r[9]), HR: clean(r[10]), OBP: clean(r[11]), SLG: clean(r[12]),
        K: clean(r[13]), ERA: clean(r[14]), WHIP: clean(r[15]), HR9: clean(r[16]),
      };
    }
    return map;
  }, [eosRaw]);

  // ---------- PROJECTED (Team Projections) ----------
  // Optimized Data: P-AA (cols 15-26). Hitter stats P-U (15-20): G,PA,R,HR,OBP,SLG.
  // Pitcher stats V-AA (21-26): G,IP,K,ERA,WHIP,HR9.
  // Rankings AB-AK (27-36): Hitter R,HR,OBP,SLG,Avg (27-31). Pitcher K,ERA,WHIP,HR9,Avg (32-36).
  const projected = useMemo(() => {
    if (!projRaw || projRaw.length < 3) {
      return { teams: [] as string[], hitterByTeam: {} as Record<string, Record<string, any>>, pitcherByTeam: {} as Record<string, Record<string, any>>, hitterTotals: {} as Record<string, Record<string, string>>, pitcherTotals: {} as Record<string, Record<string, string>> };
    }
    const rows = projRaw.slice(2);
    const hitterByTeam: Record<string, Record<string, any>> = {};
    const pitcherByTeam: Record<string, Record<string, any>> = {};
    const hitterTotals: Record<string, Record<string, string>> = {};
    const pitcherTotals: Record<string, Record<string, string>> = {};
    const teamSet = new Set<string>();

    for (const r of rows) {
      const team = r[0]?.trim();
      const type = r[2]?.trim();
      if (!team || !type) continue;

      if (type === "Total") {
        hitterTotals[team] = {
          G: r[15] ?? "", PA: r[16] ?? "", R: r[17] ?? "", HR: r[18] ?? "", OBP: r[19] ?? "", SLG: r[20] ?? "",
        };
        pitcherTotals[team] = {
          G: r[21] ?? "", IP: r[22] ?? "", K: r[23] ?? "", ERA: r[24] ?? "", WHIP: r[25] ?? "", HR9: r[26] ?? "",
        };
        continue;
      }

      const pos = r[1]?.trim();
      if (!pos) continue;
      teamSet.add(team);

      if (type === "Hitter") {
        if (!hitterByTeam[team]) hitterByTeam[team] = {};
        hitterByTeam[team][pos] = {
          stats: { G: r[15], PA: r[16], R: r[17], HR: r[18], OBP: r[19], SLG: r[20] },
          ranks: { R: r[27], HR: r[28], OBP: r[29], SLG: r[30], Avg: r[31] },
        };
      } else if (type === "Pitcher") {
        if (!pitcherByTeam[team]) pitcherByTeam[team] = {};
        pitcherByTeam[team][pos] = {
          stats: { G: r[21], IP: r[22], K: r[23], ERA: r[24], WHIP: r[25], HR9: r[26] },
          ranks: { K: r[32], ERA: r[33], WHIP: r[34], HR9: r[35], Avg: r[36] },
        };
      }
    }
    return { teams: Array.from(teamSet).sort(), hitterByTeam, pitcherByTeam, hitterTotals, pitcherTotals };
  }, [projRaw]);

  // Current totals: sum counting stats from position rows; rate stats from Live Standings
  const currentHitterTotal = useMemo(() => {
    if (!team) return {} as Record<string, string>;
    const t = current.hitterByTeam[team];
    if (!t) return {} as Record<string, string>;
    let g = 0, ab = 0, r = 0, hr = 0;
    for (const pos of HITTER_POS) {
      g += parseFloat(String(t[pos]?.G ?? "0").replace(/,/g, "")) || 0;
      ab += parseFloat(String(t[pos]?.AB ?? "0").replace(/,/g, "")) || 0;
      r += parseFloat(String(t[pos]?.R ?? "0").replace(/,/g, "")) || 0;
      hr += parseFloat(String(t[pos]?.HR ?? "0").replace(/,/g, "")) || 0;
    }
    const ls = liveByTeam[team];
    return {
      G: String(Math.round(g)),
      AB: String(Math.round(ab)),
      R: ls?.R ?? String(Math.round(r)),
      HR: ls?.HR ?? String(Math.round(hr)),
      OBP: ls?.OBP ?? "",
      SLG: ls?.SLG ?? "",
    };
  }, [team, current.hitterByTeam, liveByTeam]);

  const currentPitcherTotal = useMemo(() => {
    if (!team) return {} as Record<string, string>;
    const t = current.pitcherByTeam[team];
    if (!t) return {} as Record<string, string>;
    let g = 0, ip = 0, k = 0;
    for (const pos of PITCHER_POS) {
      g += parseFloat(String(t[pos]?.G ?? "0").replace(/,/g, "")) || 0;
      ip += parseFloat(String(t[pos]?.IP ?? "0").replace(/,/g, "")) || 0;
      k += parseFloat(String(t[pos]?.K ?? "0").replace(/,/g, "")) || 0;
    }
    const ls = liveByTeam[team];
    return {
      G: String(Math.round(g)),
      IP: ip.toFixed(1),
      K: ls?.K ?? String(Math.round(k)),
      HR9: ls?.HR9 ?? "",
      ERA: ls?.ERA ?? "",
      WHIP: ls?.WHIP ?? "",
    };
  }, [team, current.pitcherByTeam, liveByTeam]);

  const allTeams = useMemo(() => {
    const s = new Set<string>([...current.teams, ...projected.teams]);
    return Array.from(s).sort();
  }, [current.teams, projected.teams]);

  // Default team selection
  useEffect(() => {
    if (!team && allTeams.length) setTeam(allTeams[0]);
  }, [team, allTeams]);

  const isLoading = prodLoading || projLoading;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Team Production</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Team:</span>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {allTeams.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* CURRENT */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Current</h2>

            <ProductionTable
              title="Hitters — Stats"
              positions={HITTER_POS}
              statCols={HITTER_STATS as unknown as string[]}
              getCell={(pos, stat) => current.hitterByTeam[team]?.[pos]?.[stat] ?? ""}
              isRank={false}
              totalRow={currentHitterTotal}
            />
            <ProductionTable
              title="Hitters — Rankings"
              positions={HITTER_POS}
              statCols={HITTER_STATS as unknown as string[]}
              getCell={(pos, stat) => {
                const r = current.hitterRanks[pos]?.[stat]?.[team];
                return r ? String(r) : "";
              }}
              isRank
              totalRow={Object.fromEntries((HITTER_STATS as unknown as string[]).map(stat => {
                let sum = 0, any = false;
                for (const pos of HITTER_POS) {
                  const r = current.hitterRanks[pos]?.[stat]?.[team];
                  if (r) { sum += r; any = true; }
                }
                return [stat, any ? String(sum) : ""];
              }))}
            />

            <ProductionTable
              title="Pitchers — Stats"
              positions={PITCHER_POS}
              statCols={PITCHER_STATS as unknown as string[]}
              getCell={(pos, stat) => current.pitcherByTeam[team]?.[pos]?.[stat] ?? ""}
              isRank={false}
              totalRow={currentPitcherTotal}
            />
            <ProductionTable
              title="Pitchers — Rankings"
              positions={PITCHER_POS}
              statCols={PITCHER_STATS as unknown as string[]}
              getCell={(pos, stat) => {
                const r = current.pitcherRanks[pos]?.[stat]?.[team];
                return r ? String(r) : "";
              }}
              isRank
              totalRow={Object.fromEntries((PITCHER_STATS as unknown as string[]).map(stat => {
                let sum = 0, any = false;
                for (const pos of PITCHER_POS) {
                  const r = current.pitcherRanks[pos]?.[stat]?.[team];
                  if (r) { sum += r; any = true; }
                }
                return [stat, any ? String(sum) : ""];
              }))}
            />
          </section>

          {/* PROJECTED */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Projected</h2>

            <ProductionTable
              title="Hitters — Stats"
              positions={HITTER_POS}
              statCols={["G", "PA", "R", "HR", "OBP", "SLG"]}
              getCell={(pos, stat) => projected.hitterByTeam[team]?.[pos]?.stats?.[stat] ?? ""}
              isRank={false}
              totalRow={projected.hitterTotals[team]}
            />
            <ProductionTable
              title="Hitters — Rankings"
              positions={HITTER_POS}
              statCols={["R", "HR", "OBP", "SLG", "Avg"]}
              getCell={(pos, stat) => projected.hitterByTeam[team]?.[pos]?.ranks?.[stat] ?? ""}
              isRank
              totalRow={Object.fromEntries(["R", "HR", "OBP", "SLG", "Avg"].map(stat => {
                let sum = 0, any = false;
                for (const pos of HITTER_POS) {
                  const v = parseFloat(String(projected.hitterByTeam[team]?.[pos]?.ranks?.[stat] ?? ""));
                  if (isFinite(v)) { sum += v; any = true; }
                }
                return [stat, any ? String(Math.round(sum)) : ""];
              }))}
            />

            <ProductionTable
              title="Pitchers — Stats"
              positions={PITCHER_POS}
              statCols={["G", "IP", "K", "ERA", "WHIP", "HR9"]}
              getCell={(pos, stat) => projected.pitcherByTeam[team]?.[pos]?.stats?.[stat] ?? ""}
              isRank={false}
              totalRow={projected.pitcherTotals[team]}
            />
            <ProductionTable
              title="Pitchers — Rankings"
              positions={PITCHER_POS}
              statCols={["K", "ERA", "WHIP", "HR9", "Avg"]}
              getCell={(pos, stat) => projected.pitcherByTeam[team]?.[pos]?.ranks?.[stat] ?? ""}
              isRank
              totalRow={Object.fromEntries(["K", "ERA", "WHIP", "HR9", "Avg"].map(stat => {
                let sum = 0, any = false;
                for (const pos of PITCHER_POS) {
                  const v = parseFloat(String(projected.pitcherByTeam[team]?.[pos]?.ranks?.[stat] ?? ""));
                  if (isFinite(v)) { sum += v; any = true; }
                }
                return [stat, any ? String(Math.round(sum)) : ""];
              }))}
            />
          </section>
        </>
      )}
    </div>
  );
};

function ProductionTable({
  title, positions, statCols, getCell, isRank, totalRow,
}: {
  title: string;
  positions: string[];
  statCols: string[];
  getCell: (pos: string, stat: string) => string;
  isRank: boolean;
  totalRow?: Record<string, string>;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground px-3">POS</TableHead>
                {statCols.map(s => (
                  <TableHead key={s} className="text-xs font-semibold text-muted-foreground px-3 text-right">{s}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map(pos => (
                <TableRow key={pos} className="border-border hover:bg-accent/50">
                  <TableCell className="font-medium px-3 py-2 text-sm">{pos}</TableCell>
                  {statCols.map(stat => {
                    const raw = getCell(pos, stat);
                    if (isRank) {
                      const n = parseFloat(String(raw));
                      const color = isFinite(n) ? rankColor(Math.round(n)) : "";
                      return (
                        <TableCell key={stat} className={`px-3 py-2 text-sm font-mono text-right ${color}`}>
                          {isFinite(n) ? String(Math.round(n)) : ""}
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell key={stat} className="px-3 py-2 text-sm font-mono text-right">
                        {raw === "" ? "" : fmtVal(stat, raw)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {totalRow && (
                <TableRow className="border-t-2 border-border bg-muted/40">
                  <TableCell className="font-bold px-3 py-2 text-sm">Total</TableCell>
                  {statCols.map(stat => {
                    const raw = totalRow[stat] ?? "";
                    const display = raw === "" ? "" : (isRank ? String(Math.round(Number(raw))) : fmtVal(stat, raw));
                    return (
                      <TableCell key={stat} className="px-3 py-2 text-sm font-mono text-right font-bold">
                        {display}
                      </TableCell>
                    );
                  })}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default TeamProduction;
