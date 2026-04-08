import { useQuery } from "@tanstack/react-query";
import { fetchSheet } from "@/lib/sheets";
import { useState, useMemo, useCallback } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2 } from "lucide-react";

const HITTER_COLS = [
  "PlayerName", "Team",
  "Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason",
  "YTD_G", "YTD_PA", "YTD_HR", "YTD_R", "YTD_OBP", "YTD_SLG",
  "YTD_wOBA", "YTD_xwOBA", "YTD_AVG", "YTD_BABIP", "YTD_wRC+",
  "ROS_G", "ROS_PA", "ROS_HR", "ROS_R", "ROS_OBP", "ROS_SLG", "ROS_wRC+",
  "BL_G", "BL_PA", "BL_HR", "BL_R", "BL_OBP", "BL_SLG",
];

const PITCHER_COLS = [
  "PlayerName", "Team",
  "Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason",
  "YTD_IP", "YTD_ERA", "YTD_SO", "YTD_WHIP", "YTD_HR/9", "YTD_K/9",
  "YTD_FIP", "YTD_xFIP", "YTD_xERA", "YTD_BABIP",
  "ROS_IP", "ROS_SO", "ROS_ERA", "ROS_WHIP", "ROS_HR/9",
  "BL_IP", "BL_SO", "BL_ERA", "BL_WHIP", "BL_HR/9",
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
  if (!isNaN(num)) {
    // 3 decimal: OBP, SLG, wOBA, xwOBA, AVG, BABIP
    if (/OBP|SLG|wOBA|xwOBA|AVG|BABIP/i.test(col)) {
      return num.toFixed(3);
    }
    // whole number: wRC+
    if (/wRC\+/.test(col)) {
      return Math.round(num).toString();
    }
    // 2 decimal: ERA, FIP, xFIP, xERA, WHIP, HR/9, K/9
    if (/ERA|FIP|WHIP|HR\/9|K\/9/i.test(col)) {
      return num.toFixed(2);
    }
  }
  return value;
}

function getSection(col: string): string | null {
  if (col.startsWith("YTD_")) return "YTD";
  if (col.startsWith("ROS_")) return "ROS";
  if (col.startsWith("BL_")) return "BL";
  return null;
}


const Rosters = () => {
  const [team, setTeam] = useState<string>("");

  const { data: hitters, isLoading: hLoading } = useQuery({
    queryKey: ["blended-h"],
    queryFn: () => fetchSheet("Blended H"),
  });

  const { data: pitchers, isLoading: pLoading } = useQuery({
    queryKey: ["blended-p"],
    queryFn: () => fetchSheet("Blended P"),
  });

  const isLoading = hLoading || pLoading;

  const teams = useMemo(() => {
    const all = [...(hitters ?? []), ...(pitchers ?? [])];
    const s = new Set(all.map(r => r["Roster"] || "").filter(Boolean));
    return Array.from(s).sort();
  }, [hitters, pitchers]);

  const teamHitters = useMemo(
    () => (hitters ?? []).filter(h => h["Roster"] === team),
    [hitters, team]
  );

  const teamPitchers = useMemo(
    () => (pitchers ?? []).filter(p => p["Roster"] === team),
    [pitchers, team]
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

type SortDir = "asc" | "desc" | null;

function DataTable({ title, columns, data }: { title: string; columns: string[]; data: Record<string, string>[] }) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());

  const handleSort = useCallback((col: string) => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortCol(null);
      setSortDir(null);
    }
  }, [sortCol, sortDir]);

  const toggleCol = useCallback((col: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }, []);

  const visibleCols = useMemo(() => columns.filter(c => !hiddenCols.has(c)), [columns, hiddenCols]);

  const sortedData = useMemo(() => {
    if (!sortCol || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortCol] ?? "";
      const bVal = b[sortCol] ?? "";
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      let cmp: number;
      if (!isNaN(aNum) && !isNaN(bNum)) {
        cmp = aNum - bNum;
      } else {
        cmp = aVal.localeCompare(bVal);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [data, sortCol, sortDir]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings2 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            {columns.map(col => (
              <DropdownMenuCheckboxItem
                key={col}
                checked={!hiddenCols.has(col)}
                disabled={col === "PlayerName"}
                onCheckedChange={() => toggleCol(col)}
              >
                {col}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {visibleCols.map(col => (
                  <TableHead
                    key={col}
                    className="text-xs font-semibold text-muted-foreground whitespace-nowrap px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort(col)}
                  >
                    {col}
                    {sortCol === col && (
                      <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleCols.length} className="text-center text-muted-foreground py-8">
                    No players found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((row, i) => (
                  <TableRow key={i} className="border-border hover:bg-accent/50">
                    {visibleCols.map(col => (
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
