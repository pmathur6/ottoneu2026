import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useCallback } from "react";
import { fetchSheet, fetchSheetRange } from "@/lib/sheets";
import { Loader2, AlertCircle } from "lucide-react";
import RosterPanel from "@/components/trade/RosterPanel";
import TradeBasket from "@/components/trade/TradeBasket";
import TradeImpact from "@/components/trade/TradeImpact";
import { optimizeTeam, parseCaps, type Player } from "@/lib/tradeOptimizer";

const Trade = () => {
  const { data: hitters, isLoading: hLoad, error: hErr } = useQuery({
    queryKey: ["blended-h"],
    queryFn: () => fetchSheet("Blended H"),
  });
  const { data: pitchers, isLoading: pLoad, error: pErr } = useQuery({
    queryKey: ["blended-p"],
    queryFn: () => fetchSheet("Blended P"),
  });
  const { data: assumptions, isLoading: aLoad, error: aErr } = useQuery({
    queryKey: ["assumptions-caps"],
    queryFn: () => fetchSheetRange("Assumptions", "B1:B125"),
  });

  const isLoading = hLoad || pLoad || aLoad;
  const error = hErr || pErr || aErr;

  // Filter out FA
  const allHitters = useMemo<Player[]>(
    () => (hitters ?? []).filter(p => (p["Roster"] || "").trim() !== "FA"),
    [hitters]
  );
  const allPitchers = useMemo<Player[]>(
    () => (pitchers ?? []).filter(p => (p["Roster"] || "").trim() !== "FA"),
    [pitchers]
  );

  const teams = useMemo(() => {
    const s = new Set<string>();
    allHitters.forEach(p => p["Roster"] && s.add(p["Roster"]));
    allPitchers.forEach(p => p["Roster"] && s.add(p["Roster"]));
    return Array.from(s).sort();
  }, [allHitters, allPitchers]);

  const caps = useMemo(() => {
    if (!assumptions) return null;
    // fetchSheetRange returns column B values as single-element rows (since range is B1:B125)
    // Reshape into [empty, B-value] format expected by parseCaps which reads col index 1.
    const reshaped = assumptions.map(row => ["", row[0] ?? ""]);
    return parseCaps(reshaped);
  }, [assumptions]);

  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [simulated, setSimulated] = useState<{ a: string; b: string; ids: string[] } | null>(null);

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSimulated(null);
  }, []);

  // Reset selections that no longer belong to selected teams when teams change
  const handleTeamAChange = (t: string) => {
    setTeamA(t);
    setSelectedIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        const player = [...allHitters, ...allPitchers].find(p => p["playerid"] === id);
        if (player && (player["Roster"] === t || player["Roster"] === teamB)) next.add(id);
      });
      return next;
    });
    setSimulated(null);
  };
  const handleTeamBChange = (t: string) => {
    setTeamB(t);
    setSelectedIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        const player = [...allHitters, ...allPitchers].find(p => p["playerid"] === id);
        if (player && (player["Roster"] === teamA || player["Roster"] === t)) next.add(id);
      });
      return next;
    });
    setSimulated(null);
  };

  // Dedupe by playerid for display so dual-eligible players (e.g. Ohtani) only appear once.
  const dedupe = (players: Player[]) => {
    const seen = new Set<string>();
    const out: Player[] = [];
    for (const p of players) {
      const id = p["playerid"];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(p);
    }
    return out;
  };

  const givesA = useMemo(() => {
    return dedupe(
      [...allHitters, ...allPitchers].filter(
        p => selectedIds.has(p["playerid"]) && p["Roster"] === teamA
      )
    );
  }, [allHitters, allPitchers, selectedIds, teamA]);

  const givesB = useMemo(() => {
    return dedupe(
      [...allHitters, ...allPitchers].filter(
        p => selectedIds.has(p["playerid"]) && p["Roster"] === teamB
      )
    );
  }, [allHitters, allPitchers, selectedIds, teamB]);

  const canSimulate = !!teamA && !!teamB && teamA !== teamB && (givesA.length > 0 || givesB.length > 0);

  const onSimulate = () => {
    setSimulated({ a: teamA, b: teamB, ids: Array.from(selectedIds) });
  };

  const impact = useMemo(() => {
    if (!simulated || !caps) return null;
    const { a, b, ids } = simulated;
    const idSet = new Set(ids);

    const teamHittersA = allHitters.filter(p => p["Roster"] === a);
    const teamPitchersA = allPitchers.filter(p => p["Roster"] === a);
    const teamHittersB = allHitters.filter(p => p["Roster"] === b);
    const teamPitchersB = allPitchers.filter(p => p["Roster"] === b);

    // Players being moved
    const hMovingA = teamHittersA.filter(p => idSet.has(p["playerid"]));
    const pMovingA = teamPitchersA.filter(p => idSet.has(p["playerid"]));
    const hMovingB = teamHittersB.filter(p => idSet.has(p["playerid"]));
    const pMovingB = teamPitchersB.filter(p => idSet.has(p["playerid"]));

    // Post-trade rosters
    const postHittersA = teamHittersA.filter(p => !idSet.has(p["playerid"])).concat(hMovingB);
    const postPitchersA = teamPitchersA.filter(p => !idSet.has(p["playerid"])).concat(pMovingB);
    const postHittersB = teamHittersB.filter(p => !idSet.has(p["playerid"])).concat(hMovingA);
    const postPitchersB = teamPitchersB.filter(p => !idSet.has(p["playerid"])).concat(pMovingA);

    return {
      preA: optimizeTeam(teamHittersA, teamPitchersA, caps),
      postA: optimizeTeam(postHittersA, postPitchersA, caps),
      preB: optimizeTeam(teamHittersB, teamPitchersB, caps),
      postB: optimizeTeam(postHittersB, postPitchersB, caps),
    };
  }, [simulated, caps, allHitters, allPitchers]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading trade data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-destructive font-medium">Failed to load Sheets data.</p>
        <p className="text-muted-foreground text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Trade Simulator</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RosterPanel
          label="Team A"
          teams={teams}
          selectedTeam={teamA}
          onTeamChange={handleTeamAChange}
          hitters={allHitters}
          pitchers={allPitchers}
          selectedIds={selectedIds}
          onTogglePlayer={togglePlayer}
        />
        <RosterPanel
          label="Team B"
          teams={teams}
          selectedTeam={teamB}
          onTeamChange={handleTeamBChange}
          hitters={allHitters}
          pitchers={allPitchers}
          selectedIds={selectedIds}
          onTogglePlayer={togglePlayer}
        />
      </div>

      <TradeBasket
        teamA={teamA}
        teamB={teamB}
        givesA={givesA}
        givesB={givesB}
        onRemove={togglePlayer}
        onSimulate={onSimulate}
        canSimulate={canSimulate}
      />

      {impact && simulated && (
        <TradeImpact
          teamAName={simulated.a}
          teamBName={simulated.b}
          preA={impact.preA}
          postA={impact.postA}
          preB={impact.preB}
          postB={impact.postB}
        />
      )}
    </div>
  );
};

export default Trade;
