import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useCallback } from "react";
import { fetchSheet, fetchSheetRange, fetchSheetRaw } from "@/lib/sheets";
import { Loader2, AlertCircle } from "lucide-react";
import RosterPanel from "@/components/trade/RosterPanel";
import TradeBasket from "@/components/trade/TradeBasket";
import TradeImpact from "@/components/trade/TradeImpact";
import OptimizedRoster from "@/components/trade/OptimizedRoster";
import {
  optimizeTeam, parseCaps, parseTeamProductionRows,
  buildBankedHitting, buildBankedPitching, rankTeams,
  type Player, type OptimizedTeam,
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

  const isLoading = hLoad || pLoad || aLoad || tpLoad;
  const error = hErr || pErr || aErr || tpErr;

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

  const teamProdRows = useMemo(() => teamProd ? parseTeamProductionRows(teamProd) : null, [teamProd]);
  

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
    if (!simulated || !caps || !teamProdRows || !eosBaseline) return null;
    const { a, b, ids } = simulated;
    const idSet = new Set(ids);

    // Pre-trade baseline: every team uses EOS Standings as-is.
    const beforeStats: Record<string, OptimizedTeam["categories"]> = { ...eosBaseline };

    // Helper: compute full season stats AND allocations for one team given its hitter/pitcher rosters.
    const fullSeasonFor = (teamName: string, hRoster: Player[], pRoster: Player[]) => {
      const { bankedHitting, bankedByPos } = buildBankedHitting(teamProdRows, teamName);
      const { bankedPitching, bankedByRole } = buildBankedPitching(teamProdRows, teamName);
      return {
        team: optimizeTeam(hRoster, pRoster, caps, bankedHitting, bankedPitching, bankedByPos),
        bankedByPos,
        bankedByRole,
      };
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

    // Detect whether the trade actually moves hitters and/or pitchers.
    const hittersInvolved = hMovingA.length > 0 || hMovingB.length > 0;
    const pitchersInvolved = pMovingA.length > 0 || pMovingB.length > 0;

    const optA = fullSeasonFor(a, postHittersA, postPitchersA);
    const optB = fullSeasonFor(b, postHittersB, postPitchersB);

    // After-trade stats: replace only A and B in baseline.
    const afterStats: Record<string, OptimizedTeam["categories"]> = { ...beforeStats };

    // If only hitters move, pitching cats stay at baseline. If only pitchers move, hitting cats stay at baseline.
    const HITTING_CATS = ["R", "HR", "OBP", "SLG"] as const;
    const PITCHING_CATS = ["IP", "K", "ERA", "WHIP", "HR/9"] as const;
    const mergeCats = (
      baseline: OptimizedTeam["categories"],
      computed: OptimizedTeam["categories"]
    ): OptimizedTeam["categories"] => {
      const out = { ...baseline };
      if (hittersInvolved) for (const c of HITTING_CATS) out[c] = computed[c];
      if (pitchersInvolved) for (const c of PITCHING_CATS) out[c] = computed[c];
      return out;
    };
    afterStats[a] = mergeCats(beforeStats[a] ?? optA.team.categories, optA.team.categories);
    afterStats[b] = mergeCats(beforeStats[b] ?? optB.team.categories, optB.team.categories);

    const rotoBefore = rankTeams(beforeStats);
    const rotoAfter = rankTeams(afterStats);

    const emptyCats: OptimizedTeam["categories"] = {
      R: 0, HR: 0, OBP: 0, SLG: 0, IP: 0, K: 0, ERA: 0, WHIP: 0, "HR/9": 0,
    };

    // Build a player lookup by id and the set of ids each team newly received.
    const playerLookup: Record<string, Player> = {};
    for (const p of [...allHitters, ...allPitchers]) playerLookup[p["playerid"]] = p;
    const movedToAIds = new Set([...hMovingB, ...pMovingB].map(p => p["playerid"]));
    const movedToBIds = new Set([...hMovingA, ...pMovingA].map(p => p["playerid"]));

    return {
      hittersInvolved,
      pitchersInvolved,
      playerLookup,
      teamA: {
        name: a,
        before: beforeStats[a] ?? emptyCats,
        after: afterStats[a],
        rotoBefore: rotoBefore[a] ?? {},
        rotoAfter: rotoAfter[a] ?? {},
        optimized: optA.team,
        bankedByPos: optA.bankedByPos,
        bankedByRole: optA.bankedByRole,
        movedInIds: movedToAIds,
      },
      teamB: {
        name: b,
        before: beforeStats[b] ?? emptyCats,
        after: afterStats[b],
        rotoBefore: rotoBefore[b] ?? {},
        rotoAfter: rotoAfter[b] ?? {},
        optimized: optB.team,
        bankedByPos: optB.bankedByPos,
        bankedByRole: optB.bankedByRole,
        movedInIds: movedToBIds,
      },
    };
  }, [simulated, caps, teamProdRows, eosBaseline, allHitters, allPitchers]);

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
        <>
          <TradeImpact teamA={impact.teamA} teamB={impact.teamB} />

          {impact.hittersInvolved && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Optimized Hitter Allocation (post-trade)</h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <OptimizedRoster
                  teamName={impact.teamA.name}
                  type="hitters"
                  allocations={impact.teamA.optimized.hitterAllocations ?? []}
                  playerLookup={impact.playerLookup}
                  movedInIds={impact.teamA.movedInIds}
                  bankedByPos={impact.teamA.bankedByPos}
                />
                <OptimizedRoster
                  teamName={impact.teamB.name}
                  type="hitters"
                  allocations={impact.teamB.optimized.hitterAllocations ?? []}
                  playerLookup={impact.playerLookup}
                  movedInIds={impact.teamB.movedInIds}
                  bankedByPos={impact.teamB.bankedByPos}
                />
              </div>
            </div>
          )}

          {impact.pitchersInvolved && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Optimized Pitcher Allocation (post-trade)</h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <OptimizedRoster
                  teamName={impact.teamA.name}
                  type="pitchers"
                  allocations={impact.teamA.optimized.pitcherAllocations ?? []}
                  playerLookup={impact.playerLookup}
                  movedInIds={impact.teamA.movedInIds}
                  bankedByRole={impact.teamA.bankedByRole}
                />
                <OptimizedRoster
                  teamName={impact.teamB.name}
                  type="pitchers"
                  allocations={impact.teamB.optimized.pitcherAllocations ?? []}
                  playerLookup={impact.playerLookup}
                  movedInIds={impact.teamB.movedInIds}
                  bankedByRole={impact.teamB.bankedByRole}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Trade;
