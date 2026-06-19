import { useMemo, useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { Player } from "@/lib/tradeOptimizer";

const num = (v: string | undefined) => {
  if (!v) return 0;
  const cleaned = String(v).replace(/[$,]/g, "").replace(/\((.+)\)/, "-$1").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const fmtMoney = (v: string | undefined) => {
  const n = num(v);
  if (n === 0 && !v) return "";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
};

interface Props {
  label: string;
  teams: string[];
  selectedTeam: string;
  onTeamChange: (t: string) => void;
  hitters: Player[];
  pitchers: Player[];
  selectedIds: Set<string>;
  onTogglePlayer: (id: string) => void;
}

export default function RosterPanel({
  label, teams, selectedTeam, onTeamChange,
  hitters, pitchers, selectedIds, onTogglePlayer,
}: Props) {
  const teamHitters = useMemo(
    () => hitters.filter(p => p["Roster"] === selectedTeam),
    [hitters, selectedTeam]
  );
  const teamPitchers = useMemo(
    () => pitchers.filter(p => p["Roster"] === selectedTeam),
    [pitchers, selectedTeam]
  );

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{label}</h2>
        <Select value={selectedTeam} onValueChange={onTeamChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select a team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTeam ? (
        <>
          <PlayerTable
            title="Hitters"
            players={teamHitters}
            playingTimeKey="BL_G"
            playingTimeLabel="G"
            statCols={HITTER_STATS}
            selectedIds={selectedIds}
            onToggle={onTogglePlayer}
          />
          <PlayerTable
            title="Pitchers"
            players={teamPitchers}
            playingTimeKey="BL_IP"
            playingTimeLabel="IP"
            statCols={PITCHER_STATS}
            selectedIds={selectedIds}
            onToggle={onTogglePlayer}
          />
        </>
      ) : (
        <p className="text-muted-foreground text-sm py-8 text-center">
          Select a team to view roster.
        </p>
      )}
    </div>
  );
}

type SortDir = "asc" | "desc";
type SortKey = "name" | "pos" | "valor" | "salary" | "ev" | "ytdev" | "surplus" | "pt" | "stat1" | "stat2" | "stat3" | "stat4" | "stat5";

type StatCol = { key: string; label: string; format: (n: number) => string };

const HITTER_STATS: StatCol[] = [
  { key: "BL_PA", label: "PA", format: n => Math.round(n).toString() },
  { key: "BL_HR", label: "HR", format: n => Math.round(n).toString() },
  { key: "BL_R", label: "R", format: n => Math.round(n).toString() },
  { key: "BL_OBP", label: "OBP", format: n => n.toFixed(3) },
  { key: "BL_SLG", label: "SLG", format: n => n.toFixed(3) },
];

const PITCHER_STATS: StatCol[] = [
  { key: "BL_SO", label: "SO", format: n => Math.round(n).toString() },
  { key: "BL_ERA", label: "ERA", format: n => n.toFixed(2) },
  { key: "BL_WHIP", label: "WHIP", format: n => n.toFixed(2) },
  { key: "BL_HR/9", label: "HR/9", format: n => n.toFixed(2) },
];

function PlayerTable({
  title, players, playingTimeKey, playingTimeLabel, statCols, selectedIds, onToggle,
}: {
  title: string;
  players: Player[];
  playingTimeKey: string;
  playingTimeLabel: string;
  statCols: StatCol[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("valor");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // default direction: text asc, numeric desc
      setSortDir(key === "name" || key === "pos" ? "asc" : "desc");
    }
  };

  const statSortKeys: SortKey[] = ["stat1", "stat2", "stat3", "stat4", "stat5"];

  const sorted = useMemo(() => {
    const getVal = (p: Player): string | number => {
      switch (sortKey) {
        case "name": return (p["PlayerName"] || "").toLowerCase();
        case "pos": return (p["Positions"] || "").toLowerCase();
        case "valor": return num(p["Total WAR"]);
        case "salary": return num(p["Current Salary"]);
        case "ev": return num(p["Expected Value"]);
        case "ytdev": return num(p["YTD Expected Value"]);
        case "surplus": return num(p["Surplus Value"]);
        case "pt": return num(p[playingTimeKey]);
        case "stat1":
        case "stat2":
        case "stat3":
        case "stat4":
        case "stat5": {
          const idx = statSortKeys.indexOf(sortKey);
          const col = statCols[idx];
          return col ? num(p[col.key]) : 0;
        }
      }
    };
    const arr = [...players];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return arr;
  }, [players, sortKey, sortDir, playingTimeKey, statCols]);

  const colSpan = 8 + statCols.length;

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="max-h-72 overflow-y-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHead label="Pos" colKey="pos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHead label="VALOR" colKey="valor" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHead label="Salary" colKey="salary" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHead label="EV" colKey="ev" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHead label="Surplus" colKey="surplus" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHead label={playingTimeLabel} colKey="pt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              {statCols.map((col, i) => (
                <SortableHead
                  key={col.key}
                  label={col.label}
                  colKey={statSortKeys[i]}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground text-sm py-4">
                  No {title.toLowerCase()}.
                </TableCell>
              </TableRow>
            ) : sorted.map(p => {
              const id = p["playerid"];
              const isSelected = selectedIds.has(id);
              const surplus = num(p["Surplus Value"]);
              return (
                <TableRow
                  key={id}
                  onClick={() => onToggle(id)}
                  className={`cursor-pointer hover:bg-accent/50 ${
                    isSelected ? "ring-2 ring-standings-gold ring-inset bg-accent/30" : ""
                  }`}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(id)}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer"
                    />
                  </TableCell>
                  <TableCell className="font-medium text-sm">{p["PlayerName"]}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p["Positions"]}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{num(p["Total WAR"]).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtMoney(p["Current Salary"])}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtMoney(p["Expected Value"])}</TableCell>
                  <TableCell className={`text-right font-mono text-sm ${
                    surplus > 0 ? "text-positive" : surplus < 0 ? "text-negative" : ""
                  }`}>
                    {fmtMoney(p["Surplus Value"])}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {playingTimeKey === "BL_IP"
                      ? num(p[playingTimeKey]).toFixed(1)
                      : Math.round(num(p[playingTimeKey]))}
                  </TableCell>
                  {statCols.map(col => (
                    <TableCell key={col.key} className="text-right font-mono text-sm">
                      {col.format(num(p[col.key]))}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortableHead({
  label, colKey, sortKey, sortDir, onSort, align = "left",
}: {
  label: string;
  colKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === colKey;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}
