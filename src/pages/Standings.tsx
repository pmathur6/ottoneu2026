import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSheetRange } from "@/lib/sheets";
import { useState, useMemo, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Loader2 } from "lucide-react";

const LIVE_STATS_COLS = ["Team", "R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9"];
const LIVE_RANK_COLS = ["Team", "R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9", "Total"];
const CATEGORY_COLS = ["R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9", "HR/9"];

const EOS_STATS_COLS = ["Team", "R", "HR", "OBP", "SLG", "K", "ERA", "WHIP", "HR9"];
const EOS_RANK_COLS = ["Team", "R", "HR", "OBP", "SLG", "K", "ERA", "WHIP", "HR9", "Total"];

function getRankColor(val: number, totalTeams: number): string {
  if (val >= totalTeams - 3) return "text-standings-green";
  if (val <= 4) return "text-standings-red";
  return "";
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

  const { data: eosRaw, isLoading: eosLoading } = useQuery({
    queryKey: ["eos-standings"],
    queryFn: () => fetchSheetRange("EOS Standings", "A1:AA50"),
  });

  const isLoading = liveLoading;

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["live-standings"] });
    queryClient.invalidateQueries({ queryKey: ["eos-standings"] });
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

  // Parse EOS Standings tab - stats cols 0-8, rankings cols 9-17 (incl Total)
  const { eosStats, eosRankings } = useMemo(() => {
    if (!eosRaw || eosRaw.length < 2) {
      return { eosStats: [] as Record<string, string>[], eosRankings: [] as Record<string, string>[] };
    }
    const headerIdx = eosRaw.findIndex(r => r[0]?.trim() === "Team");
    if (headerIdx < 0) return { eosStats: [], eosRankings: [] };
    const dataRows = eosRaw.slice(headerIdx + 1).filter(r => r[0]?.trim());

    const stats = dataRows.map(row => ({
      Team: row[0]?.trim() ?? "",
      R: row[1]?.trim() ?? "",
      HR: row[2]?.trim() ?? "",
      OBP: row[3]?.trim() ?? "",
      SLG: row[4]?.trim() ?? "",
      K: row[5]?.trim() ?? "",
      ERA: row[6]?.trim() ?? "",
      WHIP: row[7]?.trim() ?? "",
      HR9: row[8]?.trim() ?? "",
      __total: row[17]?.trim() ?? "0",
    }));
    const rankings = dataRows.map(row => ({
      Team: row[0]?.trim() ?? "",
      R: (row[9]?.trim() ?? "").replace(/\.0$/, ""),
      HR: (row[10]?.trim() ?? "").replace(/\.0$/, ""),
      OBP: (row[11]?.trim() ?? "").replace(/\.0$/, ""),
      SLG: (row[12]?.trim() ?? "").replace(/\.0$/, ""),
      K: (row[13]?.trim() ?? "").replace(/\.0$/, ""),
      ERA: (row[14]?.trim() ?? "").replace(/\.0$/, ""),
      WHIP: (row[15]?.trim() ?? "").replace(/\.0$/, ""),
      HR9: (row[16]?.trim() ?? "").replace(/\.0$/, ""),
      Total: (row[17]?.trim() ?? "").replace(/\.0$/, ""),
    }));

    stats.sort((a, b) => parseFloat(b.__total) - parseFloat(a.__total));
    rankings.sort((a, b) => parseFloat(b.Total) - parseFloat(a.Total));
    stats.forEach(r => { delete (r as Record<string, string>).__total; });

    return { eosStats: stats as Record<string, string>[], eosRankings: rankings };
  }, [eosRaw]);

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
            <span>Loading EOS standings…</span>
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
