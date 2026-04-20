import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useCallback } from "react";
import { fetchSheet, fetchSheetRange, fetchSheetRaw } from "@/lib/sheets";
import { Loader2, AlertCircle } from "lucide-react";
import RosterPanel from "@/components/trade/RosterPanel";
import TradeBasket from "@/components/trade/TradeBasket";
import TradeImpact from "@/components/trade/TradeImpact";
import {
  optimizeTeam, parseCaps, parseTeamProduction, parseEosStandings,
  combineFullSeason, computeRotoPoints,
  type Player, type FullSeasonCategories,
} from "@/lib/tradeOptimizer";

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
  const { data: teamProd, isLoading: tpLoad, error: tpErr } = useQuery({
    queryKey: ["team-production"],
    queryFn: () => fetchSheetRaw("Team Production"),
  });
  const { data: eosStand, isLoading: esLoad, error: esErr } = useQuery({
    queryKey: ["eos-standings"],
    queryFn: () => fetchSheetRaw("EOS Standings"),
  });

  const isLoading = hLoad || pLoad || aLoad || tpLoad || esLoad;
  const error = hErr || pErr || aErr || tpErr || esErr;

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
    const reshaped = assumptions.map(row => ["", row[0] ?? ""]);
    return parseCaps(reshaped);
  }, [assumptions]);

  const banked = useMemo(() => teamProd ? parseTeamProduction(teamProd) : null, [teamProd]);
  const eosBaseline = useMemo(() => eosStand ? parseEosStandings(eosStand) : null, [eosStand]);

  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loanAtoB, setLoanAtoB] = useState(0);
  const [loanBtoA, setLoanBtoA] = useState(0);
  const [simulated, setSimulated] = useState<{ a: string; b: string; ids: string[] } | null>(null);

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSimulated(null);
  }, []);

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

  const givesA = useMemo(() => dedupe(
    [...allHitters, ...allPitchers].filter(p => selectedIds.has(p["playerid"]) && p["Roster"] === teamA)
  ), [allHitters, allPitchers, selectedIds, teamA]);

  const givesB = useMemo(() => dedupe(
    [...allHitters, ...allPitchers].filter(p => selectedIds.has(p["playerid"]) && p["Roster"] === teamB)
  ), [allHitters, allPitchers, selectedIds, teamB]);

  const canSimulate = !!teamA && !!teamB && teamA !== teamB && (givesA.length > 0 || givesB.length > 0);

  const onSimulate = () => {
    setSimulated({ a: teamA, b: teamB, ids: Array.from(selectedIds) });
  };

  // ===================================================================
  // Build full season projected stats for all 12 teams.
  // Baseline = EOS Standings raw stats (already full-season projection).
  // Post-trade = recompute Team A & Team B using banked + ROS optimizer; other 10 unchanged.
  // ===================================================================
  const impact = useMemo(() => {
    if (!simulated || !caps || !banked || !eosBaseline) return null;
    const { a, b, ids } = simulated;
    const idSet = new Set(ids);

    // Pre-trade baseline: every team uses EOS Standings as-is.
    const beforeStats: Record<string, FullSeasonCategories> = { ...eosBaseline };

    // Helper: compute full season stats for one team given its hitter/pitcher rosters.
    const fullSeasonFor = (teamName: string, hRoster: Player[], pRoster: Player[]): FullSeasonCategories => {
      const teamBanked = banked[teamName] ?? {
        hitting: { R: 0, HR: 0, AB: 0, obpNum: 0, slgNum: 0, paWeight: 0 },
        pitching: { IP: 0, K: 0, eraNum: 0, whipNum: 0, hr9Num: 0 },
      };
      const ros = optimizeTeam(hRoster, pRoster, caps);
      return combineFullSeason(teamBanked, ros);
    };

    // Pre-trade rosters
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

    // After-trade stats: replace only A and B in baseline.
    const afterStats: Record<string, FullSeasonCategories> = { ...beforeStats };
    afterStats[a] = fullSeasonFor(a, postHittersA, postPitchersA);
    afterStats[b] = fullSeasonFor(b, postHittersB, postPitchersB);

    const rotoBefore = computeRotoPoints(beforeStats);
    const rotoAfter = computeRotoPoints(afterStats);

    return {
      teamA: {
        name: a,
        before: beforeStats[a] ?? { R: 0, HR: 0, OBP: 0, SLG: 0, K: 0, ERA: 0, WHIP: 0, HR9: 0 },
        after: afterStats[a],
        rotoBefore: rotoBefore[a],
        rotoAfter: rotoAfter[a],
      },
      teamB: {
        name: b,
        before: beforeStats[b] ?? { R: 0, HR: 0, OBP: 0, SLG: 0, K: 0, ERA: 0, WHIP: 0, HR9: 0 },
        after: afterStats[b],
        rotoBefore: rotoBefore[b],
        rotoAfter: rotoAfter[b],
      },
    };
  }, [simulated, caps, banked, eosBaseline, allHitters, allPitchers]);

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
        loanAtoB={loanAtoB}
        loanBtoA={loanBtoA}
        onLoanAChange={setLoanAtoB}
        onLoanBChange={setLoanBtoA}
        onRemove={togglePlayer}
        onSimulate={onSimulate}
        canSimulate={canSimulate}
      />

      {impact && simulated && (
        <TradeImpact teamA={impact.teamA} teamB={impact.teamB} />
      )}
    </div>
  );
};

export default Trade;
