import { useQuery } from "@tanstack/react-query";
import { fetchSheet } from "@/lib/sheets";
import { useState, useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const HITTER_COLS = [
  "Name", "Team", "YTD_G", "YTD_PA", "YTD_HR", "YTD_R", "YTD_OBP", "YTD_SLG",
  "YTD_wOBA", "YTD_xwOBA", "YTD_AVG", "YTD_BABIP", "YTD_wRC+",
  "ROS_G", "ROS_PA", "ROS_HR", "ROS_R", "ROS_OBP", "ROS_SLG", "ROS_wRC+",
  "BL_G", "BL_PA", "BL_HR", "BL_R", "BL_OBP", "BL_SLG",
  "Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason",
];

const PITCHER_COLS = [
  "Name", "Team", "YTD_IP", "YTD_ERA", "YTD_SO", "YTD_WHIP", "YTD_HR/9", "YTD_K/9",
  "YTD_FIP", "YTD_xFIP", "YTD_xERA", "YTD_BABIP",
  "ROS_IP", "ROS_SO", "ROS_ERA", "ROS_WHIP", "ROS_HR/9",
  "BL_IP", "BL_SO", "BL_ERA", "BL_WHIP", "BL_HR/9",
  "Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason",
];

function getWarColor(val: number): string {
  if (val >= 5) return "text-war-purple font-bold";
  if (val >= 2) return "text-war-blue font-semibold";
  if (val >= 0) return "text-war-gray";
  return "text-war-red";
}

function getValueColor(val: number): string {
  if (val > 0) return "text-positive";
  if (val < 0) return "text-negative";
  return "";
}

function formatCell(col: string, value: string) {
  const num = parseFloat(value);
  if (col === "Total WAR" && !isNaN(num)) {
    return <span className={getWarColor(num)}>{value}</span>;
  }
  if ((col === "Surplus Value" || col === "Chg. vs. Preseason") && !isNaN(num)) {
    return <span className={getValueColor(num)}>{value}</span>;
  }
  return value;
}

const Rosters = () => {
  const [team, setTeam] = useState<string>("");

  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ["roster-info"],
    queryFn: () => fetchSheet("Roster Info"),
  });

  const { data: hitters, isLoading: hLoading } = useQuery({
    queryKey: ["blended-h"],
    queryFn: () => fetchSheet("Blended H"),
  });

  const { data: pitchers, isLoading: pLoading } = useQuery({
    queryKey: ["blended-p"],
    queryFn: () => fetchSheet("Blended P"),
  });

  const isLoading = rosterLoading || hLoading || pLoading;

  const teams = useMemo(() => {
    if (!roster) return [];
    const s = new Set(roster.map(r => r["Fantasy Team"] || r["Team"] || "").filter(Boolean));
    return Array.from(s).sort();
  }, [roster]);

  const rosterMap = useMemo(() => {
    if (!roster) return new Set<string>();
    return new Set(
      roster
        .filter(r => (r["Fantasy Team"] || r["Team"]) === team)
        .map(r => r["Name"] || r["Player"] || "")
    );
  }, [roster, team]);

  const teamHitters = useMemo(
    () => (hitters ?? []).filter(h => rosterMap.has(h["Name"] || "")),
    [hitters, rosterMap]
  );

  const teamPitchers = useMemo(
    () => (pitchers ?? []).filter(p => rosterMap.has(p["Name"] || "")),
    [pitchers, rosterMap]
  );

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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Rosters</h1>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="w-64 bg-card border-border">
            <SelectValue placeholder="Select a team" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {teams.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!team && (
        <p className="text-muted-foreground text-center py-20 text-lg">
          Select a team to view its roster.
        </p>
      )}

      {team && (
        <>
          <DataTable title="Hitters" columns={HITTER_COLS} data={teamHitters} />
          <DataTable title="Pitchers" columns={PITCHER_COLS} data={teamPitchers} />
        </>
      )}
    </div>
  );
};

function DataTable({ title, columns, data }: { title: string; columns: string[]; data: Record<string, string>[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {columns.map(col => (
                  <TableHead key={col} className="text-xs font-semibold text-muted-foreground whitespace-nowrap px-3">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                    No players found.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, i) => (
                  <TableRow key={i} className="border-border hover:bg-accent/50">
                    {columns.map(col => (
                      <TableCell key={col} className="whitespace-nowrap px-3 py-2 text-sm font-mono">
                        {formatCell(col, row[col] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default Rosters;
