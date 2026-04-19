import { useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
            selectedIds={selectedIds}
            onToggle={onTogglePlayer}
          />
          <PlayerTable
            title="Pitchers"
            players={teamPitchers}
            playingTimeKey="BL_IP"
            playingTimeLabel="IP"
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

function PlayerTable({
  title, players, playingTimeKey, playingTimeLabel, selectedIds, onToggle,
}: {
  title: string;
  players: Player[];
  playingTimeKey: string;
  playingTimeLabel: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="max-h-72 overflow-y-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Pos</TableHead>
              <TableHead className="text-right">VALOR</TableHead>
              <TableHead className="text-right">Salary</TableHead>
              <TableHead className="text-right">EV</TableHead>
              <TableHead className="text-right">Surplus</TableHead>
              <TableHead className="text-right">{playingTimeLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-4">
                  No {title.toLowerCase()}.
                </TableCell>
              </TableRow>
            ) : players.map(p => {
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
                  <TableCell className="text-right font-mono text-sm">{num(p["WAR"]).toFixed(1)}</TableCell>
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
