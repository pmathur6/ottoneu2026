import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSheet, fetchSheetRange, fetchSheetRaw } from "@/lib/sheets";
import { useState, useMemo, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Loader2 } from "lucide-react";
import {
  optimizeTeam, parseCaps, parseTeamProductionRows,
  buildBankedHitting, buildBankedPitching, rankTeams,
  type Player, type OptimizedTeam,
} from "@/lib/tradeOptimizer";

const LIVE_STATS_COLS = ["Team", "R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9"];
const LIVE_RANK_COLS = ["Team", "R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9", "Total"];
const CATEGORY_COLS = ["R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9", "HR/9"];

const EOS_STATS_COLS = ["Team", "R", "HR", "OBP", "SLG", "K", "ERA", "WHIP", "HR/9"];
const EOS_RANK_COLS = ["Team", "R", "HR", "OBP", "SLG", "K", "ERA", "WHIP", "HR/9", "Total"];

function getRankColor(val: number, totalTeams: number): string {
  if (val >= totalTeams - 3) return "text-standings-green";
  if (val <= 4) return "text-standings-red";
  return "";
}

function fmt(val: number, cat: string): string {
  if (cat === "OBP" || cat === "SLG") return val.toFixed(3);
  if (cat === "ERA" || cat === "WHIP" || cat === "HR/9") return val.toFixed(2);
  return Math.round(val).toString();
}

const Standings = () => {
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data: liveRaw, isLoading: liveLoading } = useQuery({
    queryKey: ["live-standings"],
    queryFn: async () => {
      const data = await fetchSheetRange("Live Standings", "A1:T50");
      setLastUpdated(new Date());
      return data;
    },
  });

  const { data: hitters, isLoading: hLoad } = useQuery({
    queryKey: ["blended-h"],
    queryFn: () => fetchSheet("Blended H"),
  });
  const { data: pitchers, isLoading: pLoad } = useQuery({
    queryKey: ["blended-p"],
    queryFn: () => fetchSheet("Blended P"),
  });
  const { data: assumptions, isLoading: aLoad } = useQuery({
    queryKey: ["assumptions-caps"],
    queryFn: () => fetchSheetRange("Assumptions", "B1:B125"),
  });
  const { data: teamProd, isLoading: tpLoad } = useQuery({
    queryKey: ["team-production"],
    queryFn: () => fetchSheetRaw("Team Production"),
  });

  const eosLoading = hLoad || pLoad || aLoad || tpLoad;
  const isLoading = liveLoading;

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["live-standings"] });
    queryClient.invalidateQueries({ queryKey: ["blended-h"] });
    queryClient.invalidateQueries({ queryKey: ["blended-p"] });
    queryClient.invalidateQueries({ queryKey: ["assumptions-caps"] });
    queryClient.invalidateQueries({ queryKey: ["team-production"] });
  }, [queryClient]);

  // Parse Live Standings - two side-by-side tables
  const { liveStats, liveRankings } = useMemo(() => {
    if (!liveRaw || liveRaw.length < 2) return { liveStats: [], liveRankings: [] };
    const headerIdx = liveRaw.findIndex(r => r[0]?.trim() === "Team");
    if (headerIdx < 0) return { liveStats: [], liveRankings: [] };
    const headerRow = liveRaw[headerIdx];
    const dataRows = liveRaw.slice(headerIdx + 1).filter(r => r[0]?.trim());
    const statsHeaders = headerRow.slice(0, 9).map(h => h?.trim() ?? "");
    const stats = dataRows.map(row =>
      Object.fromEntries(statsHeaders.map((h, i) => [h, row[i]?.trim() ?? ""]))
    );
    const rankHeadersRaw = headerRow.slice(10).map(h => h?.trim() ?? "").filter(Boolean);
    const rankings = dataRows.map(row => {
      const vals = row.slice(10);
      return Object.fromEntries(rankHeadersRaw.map((h, i) => [h, vals[i]?.trim() ?? ""]));
    });
    return { liveStats: stats, liveRankings: rankings };
  }, [liveRaw]);

  // EOS projections via optimizer
  const { eosStats, eosRankings } = useMemo(() => {
    if (!hitters || !pitchers || !assumptions || !teamProd) {
      return { eosStats: [] as Record<string, string>[], eosRankings: [] as Record<string, string>[] };
    }
    const allHitters: Player[] = (hitters ?? []).filter(p => (p["Roster"] || "").trim() !== "FA");
    const allPitchers: Player[] = (pitchers ?? []).filter(p => (p["Roster"] || "").trim() !== "FA");
    const teamSet = new Set<string>();
    allHitters.forEach(p => p["Roster"] && teamSet.add(p["Roster"]));
    allPitchers.forEach(p => p["Roster"] && teamSet.add(p["Roster"]));
    const teams = Array.from(teamSet).sort();

    const reshaped = assumptions.map(row => ["", row[0] ?? ""]);
    const caps = parseCaps(reshaped);
    const teamProdRows = parseTeamProductionRows(teamProd);

    const allStats: Record<string, OptimizedTeam["categories"]> = {};
    for (const t of teams) {
      const hRoster = allHitters.filter(p => p["Roster"] === t);
      const pRoster = allPitchers.filter(p => p["Roster"] === t);
      const { bankedHitting, bankedByPos } = buildBankedHitting(teamProdRows, t);
      const { bankedPitching } = buildBankedPitching(teamProdRows, t);
      const opt = optimizeTeam(hRoster, pRoster, caps, bankedHitting, bankedPitching, bankedByPos);
      allStats[t] = opt.categories;
    }

    const ranks = rankTeams(allStats);

    const statRows: Record<string, string>[] = [];
    const rankRows: Record<string, string>[] = [];
    for (const t of teams) {
      const cats = allStats[t];
      const r = ranks[t] ?? {};
      const total = ["R","HR","OBP","SLG","K","ERA","WHIP","HR/9"]
        .reduce((s, c) => s + (r[c] ?? 0), 0);
      statRows.push({
        Team: t,
        R: fmt(cats.R, "R"),
        HR: fmt(cats.HR, "HR"),
        OBP: fmt(cats.OBP, "OBP"),
        SLG: fmt(cats.SLG, "SLG"),
        K: fmt(cats.K, "K"),
        ERA: fmt(cats.ERA, "ERA"),
        WHIP: fmt(cats.WHIP, "WHIP"),
        "HR/9": fmt(cats["HR/9"], "HR/9"),
        __total: total.toFixed(1),
      });
      rankRows.push({
        Team: t,
        R: (r["R"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        HR: (r["HR"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        OBP: (r["OBP"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        SLG: (r["SLG"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        K: (r["K"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        ERA: (r["ERA"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        WHIP: (r["WHIP"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        "HR/9": (r["HR/9"] ?? 0).toFixed(1).replace(/\.0$/, ""),
        Total: total.toFixed(1).replace(/\.0$/, ""),
      });
    }

    // Sort both by total descending
    statRows.sort((a, b) => parseFloat(b.__total) - parseFloat(a.__total));
    rankRows.sort((a, b) => parseFloat(b.Total) - parseFloat(a.Total));
    statRows.forEach(r => { delete r.__total; });

    return { eosStats: statRows, eosRankings: rankRows };
  }, [hitters, pitchers, assumptions, teamProd]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Standings</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Live Standings</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StandingsTable title="Live Rankings" columns={LIVE_RANK_COLS} data={liveRankings} isRankings />
          <StandingsTable title="Live Stats" columns={LIVE_STATS_COLS} data={liveStats} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Projected Standings</h2>
        {eosLoading ? (
          <div className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Running optimizer for all 12 teams…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StandingsTable title="EOS Rankings" columns={EOS_RANK_COLS} data={eosRankings} isRankings />
            <StandingsTable title="EOS Stats" columns={EOS_STATS_COLS} data={eosStats} />
          </div>
        )}
      </section>
    </div>
  );
};

function StandingsTable({
  title,
  columns,
  data,
  isRankings = false,
}: {
  title: string;
  columns: string[];
  data: Record<string, string>[];
  isRankings?: boolean;
}) {
  const totalTeams = data.length;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {columns.map(col => {
                  const isTeam = col === "Team";
                  return (
                    <TableHead
                      key={col}
                      style={isTeam ? { position: "sticky" as const, left: 0, zIndex: 20 } : {}}
                      className={`text-xs font-semibold text-muted-foreground whitespace-nowrap px-3 ${
                        col === "Total" ? "font-bold text-foreground" : ""
                      }${isTeam ? " bg-card w-0" : ""}`}
                    >
                      {col}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                    No data available.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, i) => {
                  const teamName = row["Team"] ?? "";
                  const isYoshi = teamName.toLowerCase().includes("yoshi");
                  const lastIdx = columns.length - 1;
                  return (
                    <TableRow key={i} className="border-border hover:bg-accent/50">
                      {columns.map((col, colIdx) => {
                        const val = row[col] ?? "";
                        const num = parseFloat(val);
                        const isCat = isRankings && CATEGORY_COLS.includes(col) && !isNaN(num);
                        const isTotal = isRankings && col === "Total";
                        const colorClass = isCat ? getRankColor(num, totalTeams) : "";
                        const isTeam = col === "Team";
                        const isFirst = colIdx === 0;
                        const isLast = colIdx === lastIdx;
                        const yoshiBorder = isYoshi
                          ? `border-t border-b border-standings-gold ${isFirst ? "border-l" : ""} ${isLast ? "border-r" : ""}`
                          : "";
                        return (
                          <TableCell
                            key={col}
                            style={isTeam ? { position: "sticky" as const, left: 0, zIndex: 10 } : {}}
                            className={`whitespace-nowrap px-3 py-2 text-sm font-mono ${colorClass} ${
                              isTotal ? "font-bold" : ""
                            } ${isTeam ? "font-sans font-medium bg-card" : ""} ${yoshiBorder}`}
                          >
                            {val}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default Standings;
