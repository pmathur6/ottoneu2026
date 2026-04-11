import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSheetRange } from "@/lib/sheets";
import { useState, useMemo, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";

const LIVE_STATS_COLS = ["Team", "R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9"];
const LIVE_RANK_COLS = ["Team", "R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9", "Total"];
const CATEGORY_COLS = ["R", "HR", "OBP", "SLG", "ERA", "K", "WHIP", "HR9"];

// For rankings: higher is better for all rank values (they're already ranks 1-12)
// But we color based on rank value: rank 1-4 = top (green), 9-12 = bottom (red)
// Actually rankings: lower number = better rank. So top 4 = values 1-4 green, bottom 4 = 9-12 red
function getRankColor(val: number, totalTeams: number): string {
  if (val >= totalTeams - 3) return "text-standings-green";
  if (val <= 4) return "text-standings-red";
  return "";
}

function parseTable(raw: string[][], headerRowIdx: number, dataStartIdx: number): Record<string, string>[] {
  if (raw.length <= headerRowIdx) return [];
  const headers = raw[headerRowIdx];
  const rows = raw.slice(dataStartIdx);
  return rows
    .filter(r => r.some(c => c?.trim()))
    .map(row => Object.fromEntries(headers.map((h, i) => [h?.trim() ?? "", row[i]?.trim() ?? ""])));
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
    queryFn: async () => {
      const data = await fetchSheetRange("EOS Standings", "A1:S50");
      setLastUpdated(new Date());
      return data;
    },
  });

  const isLoading = liveLoading || eosLoading;

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["live-standings"] });
    queryClient.invalidateQueries({ queryKey: ["eos-standings"] });
  }, [queryClient]);

  // Parse Live Standings - two side-by-side tables
  const { liveStats, liveRankings } = useMemo(() => {
    if (!liveRaw || liveRaw.length < 2) return { liveStats: [], liveRankings: [] };

    // Find header row (row with "Team" in col A)
    const headerIdx = liveRaw.findIndex(r => r[0]?.trim() === "Team");
    if (headerIdx < 0) return { liveStats: [], liveRankings: [] };

    const headerRow = liveRaw[headerIdx];
    const dataRows = liveRaw.slice(headerIdx + 1).filter(r => r[0]?.trim());

    // First table: cols A-I (indices 0-8)
    const statsHeaders = headerRow.slice(0, 9).map(h => h?.trim() ?? "");
    const stats = dataRows.map(row =>
      Object.fromEntries(statsHeaders.map((h, i) => [h, row[i]?.trim() ?? ""]))
    );

    // Second table: cols K onward (index 10+)
    const rankHeadersRaw = headerRow.slice(10).map(h => h?.trim() ?? "").filter(Boolean);
    const rankings = dataRows.map(row => {
      const vals = row.slice(10);
      return Object.fromEntries(rankHeadersRaw.map((h, i) => [h, vals[i]?.trim() ?? ""]));
    });

    return { liveStats: stats, liveRankings: rankings };
  }, [liveRaw]);

  // Parse EOS Standings - two side-by-side tables
  const { eosStats, eosRankings } = useMemo(() => {
    if (!eosRaw || eosRaw.length < 3) return { eosStats: [], eosRankings: [] };

    // Headers at row 2 (index 1), data from row 3 (index 2), team names in col A
    const headerRow = eosRaw[1];
    const dataRows = eosRaw.slice(2).filter(r => r[0]?.trim());

    // EOS Stats: A (team) + B-I (indices 1-8)
    const statsHeaders = ["Team", ...(headerRow?.slice(1, 9).map(h => h?.trim() ?? "") ?? [])];
    const stats = dataRows.map(row =>
      Object.fromEntries(statsHeaders.map((h, i) => [h, i === 0 ? row[0]?.trim() ?? "" : row[i]?.trim() ?? ""]))
    );

    // EOS Rankings: A (team) + J-S (indices 9-18)
    const rankHeadersRaw = headerRow?.slice(9, 19).map(h => h?.trim() ?? "").filter(Boolean) ?? [];
    const rankHeaders = ["Team", ...rankHeadersRaw];
    const rankings = dataRows.map(row => {
      const obj: Record<string, string> = { Team: row[0]?.trim() ?? "" };
      rankHeadersRaw.forEach((h, i) => { obj[h] = row[9 + i]?.trim() ?? ""; });
      return obj;
    });

    return { eosStats: stats, eosRankings: rankings };
  }, [eosRaw]);

  const eosStatsCols = useMemo(() => {
    if (eosStats.length === 0) return [];
    return Object.keys(eosStats[0]);
  }, [eosStats]);

  const eosRankCols = useMemo(() => {
    if (eosRankings.length === 0) return [];
    return Object.keys(eosRankings[0]);
  }, [eosRankings]);

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
      {/* Header */}
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

      {/* Live Standings */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Live Standings</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StandingsTable title="Live Rankings" columns={LIVE_RANK_COLS} data={liveRankings} isRankings />
          <StandingsTable title="Live Stats" columns={LIVE_STATS_COLS} data={liveStats} />
        </div>
      </section>

      {/* Projected Standings */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Projected Standings</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StandingsTable title="EOS Rankings" columns={eosRankCols} data={eosRankings} isRankings sortByTotal />
          <StandingsTable title="EOS Stats" columns={eosStatsCols} data={eosStats} />
        </div>
      </section>
    </div>
  );
};

function StandingsTable({
  title,
  columns,
  data,
  isRankings = false,
  sortByTotal = false,
}: {
  title: string;
  columns: string[];
  data: Record<string, string>[];
  isRankings?: boolean;
  sortByTotal?: boolean;
}) {
  const totalTeams = data.length;

  const sortedData = useMemo(() => {
    if (!sortByTotal) return data;
    return [...data].sort((a, b) => {
      const aVal = parseFloat(a["Total"] ?? "0");
      const bVal = parseFloat(b["Total"] ?? "0");
      return bVal - aVal; // highest total first (rank 12 = best)
    });
  }, [data, sortByTotal]);

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
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                    No data available.
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((row, i) => {
                  const teamName = row["Team"] ?? "";
                  const isYoshi = teamName.toLowerCase().includes("yoshi");
                  return (
                    <TableRow
                      key={i}
                      className={`border-border hover:bg-accent/50 ${
                        isYoshi ? "ring-1 ring-standings-gold ring-inset" : ""
                      }`}
                    >
                      {columns.map(col => {
                        const val = row[col] ?? "";
                        const num = parseFloat(val);
                        const isCat = isRankings && CATEGORY_COLS.includes(col) && !isNaN(num);
                        const isTotal = isRankings && col === "Total";
                        const colorClass = isCat ? getRankColor(num, totalTeams) : "";

                        const isTeam = col === "Team";
                        return (
                          <TableCell
                            key={col}
                            style={isTeam ? { position: "sticky" as const, left: 0, zIndex: 10 } : {}}
                            className={`whitespace-nowrap px-3 py-2 text-sm font-mono ${colorClass} ${
                              isTotal ? "font-bold" : ""
                            } ${isTeam ? `font-sans font-medium bg-card ${isYoshi ? "ring-1 ring-standings-gold ring-inset" : ""}` : ""}`}
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
