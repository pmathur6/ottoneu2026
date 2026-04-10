import { useQuery } from "@tanstack/react-query";
import { fetchSheet } from "@/lib/sheets";
import { useState, useMemo, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, X, ChevronDown, ChevronRight } from "lucide-react";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const POSITIONS = ["Util", "C", "1B", "2B", "SS", "3B", "OF", "SP", "RP"];

const HITTER_COLS = [
  "PlayerName", "Positions", "Roster",
  "Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason",
  "YTD_G", "YTD_PA", "YTD_HR", "YTD_R", "YTD_OBP", "YTD_SLG",
  "YTD_wOBA", "YTD_xwOBA", "YTD_AVG", "YTD_BABIP", "YTD_wRC+",
  "ROS_G", "ROS_PA", "ROS_HR", "ROS_R", "ROS_OBP", "ROS_SLG", "ROS_wRC+",
  "BL_G", "BL_PA", "BL_HR", "BL_R", "BL_OBP", "BL_SLG",
];

const PITCHER_COLS = [
  "PlayerName", "Positions", "Roster",
  "Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason",
  "YTD_IP", "YTD_ERA", "YTD_SO", "YTD_WHIP", "YTD_HR/9", "YTD_K/9",
  "YTD_FIP", "YTD_xFIP", "YTD_xERA", "YTD_BABIP",
  "ROS_IP", "ROS_SO", "ROS_ERA", "ROS_WHIP", "ROS_HR/9",
  "BL_IP", "BL_SO", "BL_ERA", "BL_WHIP", "BL_HR/9",
];

// Sticky columns: PlayerName, Pos, Roster
const STICKY_COLS = new Set(["PlayerName", "Positions", "Roster"]);

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
    if (/OBP|SLG|wOBA|xwOBA|AVG|BABIP/i.test(col)) return num.toFixed(3);
    if (/wRC\+/.test(col)) return Math.round(num).toString();
    if (/ERA|FIP|WHIP|HR\/9|K\/9/i.test(col)) return num.toFixed(2);
  }
  return value;
}

function getSection(col: string): string | null {
  if (STICKY_COLS.has(col)) return "sticky";
  if (["Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason"].includes(col)) return "overview";
  if (col.startsWith("YTD_")) return "YTD";
  if (col.startsWith("ROS_")) return "ROS";
  if (col.startsWith("BL_")) return "BL";
  return null;
}

function getSectionLabel(section: string): string {
  switch (section) {
    case "overview": return "Overview";
    case "YTD": return "Year-to-Date";
    case "ROS": return "Rest-of-Season";
    case "BL": return "Blended";
    default: return "";
  }
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    onChange(
      selected.includes(val)
        ? selected.filter(v => v !== val)
        : [...selected, val]
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[140px] justify-between bg-card border-border text-sm">
          {selected.length === 0 ? label : `${label} (${selected.length})`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 space-y-1 max-h-72 overflow-y-auto" align="start">
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground" onClick={() => onChange([])}>
            <X className="h-3 w-3 mr-1" /> Clear all
          </Button>
        )}
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
            <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
            {opt}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const Rosters = () => {
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);

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

  const filterByTeamAndPos = useCallback((rows: Record<string, string>[]) => {
    let filtered = rows;
    if (selectedTeams.length > 0) {
      filtered = filtered.filter(r => selectedTeams.includes(r["Roster"] || ""));
    }
    if (selectedPositions.length > 0) {
      filtered = filtered.filter(r => {
        const pos = r["Positions"] || "";
        return selectedPositions.some(sp => pos.includes(sp));
      });
    }
    return filtered;
  }, [selectedTeams, selectedPositions]);

  const teamHitters = useMemo(
    () => filterByTeamAndPos(hitters ?? []),
    [hitters, filterByTeamAndPos]
  );

  const teamPitchers = useMemo(
    () => filterByTeamAndPos(pitchers ?? []),
    [pitchers, filterByTeamAndPos]
  );

  const hasFilters = selectedTeams.length > 0 || selectedPositions.length > 0;

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
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Rosters</h1>
        <MultiSelectFilter label="Teams" options={teams} selected={selectedTeams} onChange={setSelectedTeams} />
        <MultiSelectFilter label="Position" options={POSITIONS} selected={selectedPositions} onChange={setSelectedPositions} />
        {hasFilters && (
          <div className="flex gap-1 flex-wrap">
            {selectedTeams.map(t => (
              <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => setSelectedTeams(prev => prev.filter(x => x !== t))}>
                {t} <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
            {selectedPositions.map(p => (
              <Badge key={p} variant="outline" className="cursor-pointer" onClick={() => setSelectedPositions(prev => prev.filter(x => x !== p))}>
                {p} <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {!hasFilters && (
        <p className="text-muted-foreground text-center py-20 text-lg">
          Select a team or position to view rosters.
        </p>
      )}

      {hasFilters && (
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
  const [collapsed, setCollapsed] = useState(false);

  const handleSort = useCallback((col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); }
    else if (sortDir === "asc") { setSortDir("desc"); }
    else { setSortCol(null); setSortDir(null); }
  }, [sortCol, sortDir]);

  const toggleCol = useCallback((col: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  }, []);

  const visibleCols = useMemo(() => columns.filter(c => !hiddenCols.has(c)), [columns, hiddenCols]);

  const sortedData = useMemo(() => {
    if (!sortCol || !sortDir) return data;
    const parseNum = (v: string) => {
      const cleaned = v.replace(/[$,]/g, "").replace(/\((.+)\)/, "-$1").trim();
      return parseFloat(cleaned);
    };
    return [...data].sort((a, b) => {
      const aVal = a[sortCol] ?? "";
      const bVal = b[sortCol] ?? "";
      const aNum = parseNum(aVal);
      const bNum = parseNum(bVal);
      let cmp: number;
      if (!isNaN(aNum) && !isNaN(bNum)) cmp = aNum - bNum;
      else cmp = aVal.localeCompare(bVal);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [data, sortCol, sortDir]);

  // Build section header row
  const sectionHeaders = useMemo(() => {
    const headers: { label: string; colSpan: number }[] = [];
    let curSection = "";
    let curSpan = 0;
    for (const col of visibleCols) {
      const section = getSection(col) ?? "";
      if (section !== curSection) {
        if (curSpan > 0) headers.push({ label: getSectionLabel(curSection), colSpan: curSpan });
        curSection = section;
        curSpan = 1;
      } else {
        curSpan++;
      }
    }
    if (curSpan > 0) headers.push({ label: getSectionLabel(curSection), colSpan: curSpan });
    return headers;
  }, [visibleCols]);

  // Compute sticky left offsets for the first 3 sticky cols
  const stickyLeftOffsets = useMemo(() => {
    const widths = [120, 60, 100]; // PlayerName, Pos, Roster approx widths
    const offsets: Record<string, number> = {};
    let cumulative = 0;
    const stickyCols = visibleCols.filter(c => STICKY_COLS.has(c));
    stickyCols.forEach((col, i) => {
      offsets[col] = cumulative;
      cumulative += widths[i] ?? 80;
    });
    return offsets;
  }, [visibleCols]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1 text-lg font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          {title}
        </button>
        {!collapsed && (
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
                  disabled={STICKY_COLS.has(col)}
                  onCheckedChange={() => toggleCol(col)}
                >
                  {col}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {!collapsed && (
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto relative">
          <Table>
            <TableHeader>
              {/* Section header row */}
              <TableRow className="border-border hover:bg-transparent">
                {sectionHeaders.map((sh, i) => (
                  <TableHead
                    key={i}
                    colSpan={sh.colSpan}
                    className={`text-center text-xs font-bold uppercase tracking-widest py-1 ${
                      sh.label ? "text-primary" : "text-transparent"
                    } ${i > 0 && sh.label ? "border-l-2 border-border" : ""}`}
                  >
                    {sh.label || "\u00A0"}
                  </TableHead>
                ))}
              </TableRow>
              {/* Column header row */}
              <TableRow className="border-border hover:bg-transparent">
                {visibleCols.map((col, idx) => {
                  const prevCol = idx > 0 ? visibleCols[idx - 1] : null;
                  const curSection = getSection(col);
                  const prevSection = prevCol ? getSection(prevCol) : null;
                  const isDivider = curSection !== null && prevSection !== null && curSection !== prevSection && curSection !== "sticky";
                  const isSticky = STICKY_COLS.has(col);
                  const stickyStyle = isSticky
                    ? { position: "sticky" as const, left: stickyLeftOffsets[col] ?? 0, zIndex: 20 }
                    : {};
                  return (
                    <TableHead
                      key={col}
                      style={stickyStyle}
                      className={`text-xs font-semibold text-muted-foreground whitespace-nowrap px-3 cursor-pointer select-none hover:text-foreground transition-colors${isDivider ? " border-l-2 border-border" : ""}${isSticky ? " bg-card" : ""}`}
                      onClick={() => handleSort(col)}
                    >
                      {col === "Roster" ? "Team" : col}
                      {sortCol === col && (
                        <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </TableHead>
                  );
                })}
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
                    {visibleCols.map((col, idx) => {
                      const prevCol = idx > 0 ? visibleCols[idx - 1] : null;
                      const curSection = getSection(col);
                      const prevSection = prevCol ? getSection(prevCol) : null;
                      const isDivider = curSection !== null && prevSection !== null && curSection !== prevSection && curSection !== "sticky";
                      const isSticky = STICKY_COLS.has(col);
                      const stickyStyle = isSticky
                        ? { position: "sticky" as const, left: stickyLeftOffsets[col] ?? 0, zIndex: 10 }
                        : {};
                      return (
                        <TableCell
                          key={col}
                          style={stickyStyle}
                          className={`whitespace-nowrap px-3 py-2 text-sm font-mono${isDivider ? " border-l-2 border-border" : ""}${isSticky ? " bg-card" : ""}`}
                        >
                          {formatCell(col, row[col] ?? "")}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      )}
    </div>
  );
}

export default Rosters;
