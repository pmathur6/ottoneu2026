// Trade simulator optimizer — ported from proven Apps Script logic.
// Pure functions only, no sheet reads/writes.

export type Player = Record<string, string>;

export interface PositionCaps {
  UTIL: number;
  C: number;
  "1B": number;
  "2B": number;
  SS: number;
  MI: number;
  "3B": number;
  OF: number;
}

export interface OptimizerCaps {
  positions: PositionCaps;
  maxIP: number;
}

export interface BankedHitting {
  G: number;
  R: number;
  HR: number;
  obpNum: number; // sum of OBP * PA
  slgNum: number; // sum of SLG * PA
  PA: number;     // sum of AB * 1.13
}

export interface BankedPitching {
  IP: number;
  K: number;
  eraNum: number;  // sum of ERA * IP
  whipNum: number; // sum of WHIP * IP
  hr9Num: number;  // sum of HR9 * IP
}

export interface HitterAllocation {
  id: string;
  gAlloc: number;
  gTotal: number;
  positionsFilled: string[];
  blPA: number;
  blR: number;
  blHR: number;
  blOBP: number;
  blSLG: number;
  valor: number;
}

export interface PitcherAllocation {
  id: string;
  ipAlloc: number;
  ipTotal: number;
  role: "SP" | "RP" | "—";
  blK: number;
  blERA: number;
  blWHIP: number;
  blHR9: number;
  valor: number;
}

export interface OptimizedTeam {
  totalValor: number;
  categories: {
    R: number;
    HR: number;
    OBP: number;
    SLG: number;
    IP: number;
    K: number;
    ERA: number;
    WHIP: number;
    "HR/9": number;
  };
  hitterAllocations?: HitterAllocation[];
  pitcherAllocations?: PitcherAllocation[];
  rotoPoints?: Record<string, number>;
  totalRotoPoints?: number;
}

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, "").trim());
  return isNaN(n) ? 0 : n;
};

const truthy = (v: string | undefined): boolean => {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1";
};

interface HitterAlloc {
  id: string;
  gLeft: number;
  gTotal: number;
  elig: Record<string, boolean>;
  warG: Record<string, number>;
  blPA: number;
  blHR: number;
  blR: number;
  blOBP: number;
  blSLG: number;
  valor: number;
}

interface PitcherAlloc {
  id: string;
  ipLeft: number;
  ipTotal: number;
  bestWarIp: number;
  blK: number;
  blERA: number;
  blWHIP: number;
  blHR9: number;
  valor: number;
}

export function optimizeHitters(
  hitters: Player[],
  caps: PositionCaps,
  banked: Record<string, { G: number }>
): {
  valor: number;
  R: number;
  HR: number;
  obpNum: number;
  slgNum: number;
  PA: number;
  allocations: HitterAllocation[];
} {
  const POS = ["UTIL", "C", "1B", "2B", "SS", "MI", "3B", "OF"] as const;
  const fillOrder = ["C", "SS", "2B", "MI", "3B", "1B", "OF", "UTIL"];

  const players: HitterAlloc[] = hitters.map(p => {
    const g = num(p["BL_G"]);
    const elig: Record<string, boolean> = {};
    for (const pos of POS) {
      elig[pos] = pos === "UTIL" ? true : truthy(p[pos]);
    }
    elig["MI"] = /\b(2B|SS)\b/.test(p["Positions"] || "");
    const warG: Record<string, number> = {};
    for (const pos of POS) {
      const war = num(p["WAR_" + pos]);
      warG[pos] = g > 0 ? war / g : 0;
    }
    return {
      id: p["playerid"],
      gLeft: g,
      gTotal: g,
      elig,
      warG,
      blPA: num(p["BL_PA"]),
      blHR: num(p["BL_HR"]),
      blR: num(p["BL_R"]),
      blOBP: num(p["BL_OBP"]),
      blSLG: num(p["BL_SLG"]),
      valor: num(p["Total WAR"]),
    };
  });

  const capLeft: Record<string, number> = {};
  for (const pos of POS) {
    const bankedG = banked[pos]?.G ?? 0;
    capLeft[pos] = Math.max(0, (caps[pos as keyof PositionCaps] ?? 0) - bankedG);
  }

  const allocG: Record<string, number> = {};
  const allocPositions: Record<string, string[]> = {};

  for (const pos of fillOrder) {
    let cap = capLeft[pos] ?? 0;
    if (cap <= 0) continue;
    const candidates = players
      .filter(p => p.gLeft > 0 && p.elig[pos])
      .sort((a, b) => b.warG[pos] - a.warG[pos]);
    for (const p of candidates) {
      if (cap <= 0) break;
      const alloc = Math.min(cap, p.gLeft);
      if (alloc <= 0) continue;
      p.gLeft -= alloc;
      cap -= alloc;
      allocG[p.id] = (allocG[p.id] ?? 0) + alloc;
      if (!allocPositions[p.id]) allocPositions[p.id] = [];
      allocPositions[p.id].push(pos);
    }
    capLeft[pos] = cap;
  }

  let valor = 0, totalPA = 0, totalHR = 0, totalR = 0;
  let obpWeighted = 0, slgWeighted = 0;
  const allocations: HitterAllocation[] = [];
  for (const p of players) {
    const g = allocG[p.id] ?? 0;
    allocations.push({
      id: p.id,
      gAlloc: g,
      gTotal: p.gTotal,
      positionsFilled: allocPositions[p.id] ?? [],
      blPA: p.blPA,
      blR: p.blR,
      blHR: p.blHR,
      blOBP: p.blOBP,
      blSLG: p.blSLG,
      valor: p.valor,
    });
    if (g <= 0 || p.gTotal <= 0) continue;
    const share = g / p.gTotal;
    const allocPA = p.blPA * share;
    valor += p.valor * share;
    totalPA += allocPA;
    totalHR += p.blHR * share;
    totalR += p.blR * share;
    obpWeighted += p.blOBP * allocPA;
    slgWeighted += p.blSLG * allocPA;
  }

  return { valor, R: totalR, HR: totalHR, obpNum: obpWeighted, slgNum: slgWeighted, PA: totalPA, allocations };
}

export function optimizePitchers(
  pitchers: Player[],
  maxIP: number,
  bankedIP: number
): {
  valor: number;
  IP: number;
  K: number;
  eraNum: number;
  whipNum: number;
  hr9Num: number;
  allocations: PitcherAllocation[];
} {
  const remainingCap = Math.max(0, maxIP - bankedIP);

  const players = pitchers
    .map(p => {
      const ip = num(p["BL_IP"]);
      const spElig = truthy(p["SP"]);
      const rpElig = truthy(p["RP"]);
      const warSP = num(p["WAR_SP"]);
      const warRP = num(p["WAR_RP"]);
      const warIpSP = ip > 0 ? warSP / ip : 0;
      const warIpRP = ip > 0 ? warRP / ip : 0;
      let bestWarIp = warIpSP;
      let role: "SP" | "RP" | "—" = spElig ? "SP" : rpElig ? "RP" : "—";
      if (spElig && rpElig) {
        if (warIpRP > warIpSP) { bestWarIp = warIpRP; role = "RP"; }
        else { bestWarIp = warIpSP; role = "SP"; }
      } else if (rpElig) {
        bestWarIp = warIpRP;
        role = "RP";
      }
      return {
        id: p["playerid"],
        ipLeft: ip,
        ipTotal: ip,
        bestWarIp,
        role,
        blK: num(p["BL_SO"]),
        blERA: num(p["BL_ERA"]),
        blWHIP: num(p["BL_WHIP"]),
        blHR9: num(p["BL_HR/9"]),
        valor: num(p["Total WAR"]),
      };
    })
    .filter(p => p.ipTotal > 0)
    .sort((a, b) => b.bestWarIp - a.bestWarIp);

  let cap = remainingCap;
  let valor = 0, totalIP = 0, totalK = 0;
  let eraWeighted = 0, whipWeighted = 0, hr9Weighted = 0;
  const ipAllocMap: Record<string, number> = {};

  for (const p of players) {
    if (cap <= 0) break;
    const alloc = Math.min(cap, p.ipLeft);
    if (alloc <= 0) continue;
    const share = alloc / p.ipTotal;
    valor += p.valor * share;
    totalIP += alloc;
    totalK += p.blK * share;
    eraWeighted += p.blERA * alloc;
    whipWeighted += p.blWHIP * alloc;
    hr9Weighted += p.blHR9 * alloc;
    cap -= alloc;
    ipAllocMap[p.id] = alloc;
  }

  const allocations: PitcherAllocation[] = players.map(p => ({
    id: p.id,
    ipAlloc: ipAllocMap[p.id] ?? 0,
    ipTotal: p.ipTotal,
    role: p.role,
    blK: p.blK,
    blERA: p.blERA,
    blWHIP: p.blWHIP,
    blHR9: p.blHR9,
    valor: p.valor,
  }));

  return { valor, IP: totalIP, K: totalK, eraNum: eraWeighted, whipNum: whipWeighted, hr9Num: hr9Weighted, allocations };
}

export function optimizeTeam(
  hitters: Player[],
  pitchers: Player[],
  caps: OptimizerCaps,
  bankedHitting: BankedHitting,
  bankedPitching: BankedPitching,
  bankedByPos: Record<string, { G: number }>
): OptimizedTeam {
  const h = optimizeHitters(hitters, caps.positions, bankedByPos);
  const p = optimizePitchers(pitchers, caps.maxIP, bankedPitching.IP);

  const totalPA = h.PA + bankedHitting.PA;
  const totalIP = p.IP + bankedPitching.IP;

  return {
    totalValor: h.valor + p.valor,
    categories: {
      R:      h.R + bankedHitting.R,
      HR:     h.HR + bankedHitting.HR,
      OBP:    totalPA > 0 ? (h.obpNum + bankedHitting.obpNum) / totalPA : 0,
      SLG:    totalPA > 0 ? (h.slgNum + bankedHitting.slgNum) / totalPA : 0,
      IP:     p.IP + bankedPitching.IP,
      K:      p.K + bankedPitching.K,
      ERA:    totalIP > 0 ? (p.eraNum + bankedPitching.eraNum) / totalIP : 0,
      WHIP:   totalIP > 0 ? (p.whipNum + bankedPitching.whipNum) / totalIP : 0,
      "HR/9": totalIP > 0 ? (p.hr9Num + bankedPitching.hr9Num) / totalIP : 0,
    },
    hitterAllocations: h.allocations,
    pitcherAllocations: p.allocations,
  };
}

export function parseCaps(rows: string[][]): OptimizerCaps {
  const get = (rowIdx1: number) => {
    const val = rows[rowIdx1 - 1]?.[1] ?? "0";
    const n = parseFloat(String(val).replace(/[$,]/g, "").trim());
    return isNaN(n) ? 0 : n;
  };
  return {
    positions: {
      UTIL: get(108),
      C:    get(109),
      "1B": get(110),
      "2B": get(111),
      SS:   get(112),
      MI:   get(113),
      "3B": get(114),
      OF:   get(115),
    },
    maxIP: get(120),
  };
}

export function buildBankedHitting(
  teamProduction: Record<string, string>[],
  teamName: string
): { bankedHitting: BankedHitting; bankedByPos: Record<string, { G: number }> } {
  const hitterPositions = new Set(["C","1B","2B","SS","MI","3B","OF","UTIL"]);
  let R = 0, HR = 0, obpNum = 0, slgNum = 0, PA = 0, G = 0;
  const bankedByPos: Record<string, { G: number }> = {};
  for (const row of teamProduction) {
    const team = (row["TeamName"] || "").trim();
    const pos = (row["POS"] || "").trim().toUpperCase();
    if (team !== teamName) continue;
    if (!hitterPositions.has(pos)) continue;
    const g  = parseFloat(row["G"]   || "0") || 0;
    const ab = parseFloat(row["AB"]  || "0") || 0;
    const pa = ab * 1.13;
    const r  = parseFloat(row["R"]   || "0") || 0;
    const hr = parseFloat(row["HR"]  || "0") || 0;
    const obp = parseFloat(row["OBP"] || "0") || 0;
    const slg = parseFloat(row["SLG"] || "0") || 0;
    G      += g;
    R      += r;
    HR     += hr;
    PA     += pa;
    obpNum += obp * pa;
    slgNum += slg * pa;
    bankedByPos[pos] = { G: g };
  }
  return { bankedHitting: { G, R, HR, obpNum, slgNum, PA }, bankedByPos };
}

export function buildBankedPitching(
  teamProduction: Record<string, string>[],
  teamName: string
): BankedPitching {
  const pitcherPositions = new Set(["SP","RP"]);
  let IP = 0, K = 0, eraNum = 0, whipNum = 0, hr9Num = 0;
  for (const row of teamProduction) {
    const team = (row["TeamName"] || "").trim();
    const pos = (row["POS"] || "").trim().toUpperCase();
    if (team !== teamName) continue;
    if (!pitcherPositions.has(pos)) continue;
    const ip   = parseFloat(row["IP"]   || "0") || 0;
    const k    = parseFloat(row["K"]    || "0") || 0;
    const era  = parseFloat(row["ERA"]  || "0") || 0;
    const whip = parseFloat(row["WHIP"] || "0") || 0;
    const hr9  = parseFloat(row["HR9"]  || "0") || 0;
    IP     += ip;
    K      += k;
    eraNum  += era  * ip;
    whipNum += whip * ip;
    hr9Num  += hr9  * ip;
  }
  return { IP, K, eraNum, whipNum, hr9Num };
}

export type RotoCategory = "R" | "HR" | "OBP" | "SLG" | "K" | "ERA" | "WHIP" | "HR/9";
export const ROTO_CATS: RotoCategory[] = ["R","HR","OBP","SLG","K","ERA","WHIP","HR/9"];
export const ROTO_HIGHER_BETTER: RotoCategory[] = ["R","HR","OBP","SLG","K"];

export function rankTeams(
  allTeamStats: Record<string, OptimizedTeam["categories"]>
): Record<string, Record<string, number>> {
  const cats = ROTO_CATS;
  const higherBetter = new Set<string>(ROTO_HIGHER_BETTER);
  const rankings: Record<string, Record<string, number>> = {};
  for (const cat of cats) {
    const entries = Object.entries(allTeamStats).map(([team, stats]) => ({
      team,
      value: stats[cat as keyof typeof stats] as number,
    }));
    entries.sort((a, b) =>
      higherBetter.has(cat) ? a.value - b.value : b.value - a.value
    );
    let i = 0;
    while (i < entries.length) {
      let j = i;
      while (j < entries.length && entries[j].value === entries[i].value) j++;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) {
        if (!rankings[entries[k].team]) rankings[entries[k].team] = {};
        rankings[entries[k].team][cat] = avgRank;
      }
      i = j;
    }
  }
  return rankings;
}

// Parse Team Production sheet: hitter table cols A-I, pitcher table cols K-S.
// Returns flat row objects with TeamName/POS/etc keys; each row has either hitter or pitcher columns populated.
export function parseTeamProductionRows(rows: string[][]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  // skip header row 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    // Hitter side A-I (0-8): TeamID, TeamName, POS, G, AB, R, HR, OBP, SLG
    const hTeam = (r[1] || "").trim();
    const hPos = (r[2] || "").trim();
    if (hTeam && hPos && hPos.toLowerCase() !== "bench") {
      out.push({
        TeamID: r[0] ?? "",
        TeamName: hTeam,
        POS: hPos,
        G: r[3] ?? "",
        AB: r[4] ?? "",
        R: r[5] ?? "",
        HR: r[6] ?? "",
        OBP: r[7] ?? "",
        SLG: r[8] ?? "",
      });
    }
    // Pitcher side K-S (10-18): TeamID, TeamName, POS, G, IP, K, HR9, ERA, WHIP
    const pTeam = (r[11] || "").trim();
    const pPos = (r[12] || "").trim();
    if (pTeam && pPos && pPos.toLowerCase() !== "bench") {
      out.push({
        TeamID: r[10] ?? "",
        TeamName: pTeam,
        POS: pPos,
        G: r[13] ?? "",
        IP: r[14] ?? "",
        K: r[15] ?? "",
        HR9: r[16] ?? "",
        ERA: r[17] ?? "",
        WHIP: r[18] ?? "",
      });
    }
  }
  return out;
}

// Parse EOS Standings tab → projected full-season stats per team.
// Row 1 title, row 2 header, rows 3+ teams. Cols A-I: Team, R, HR, OBP, SLG, K, ERA, WHIP, HR9.
export function parseEosStandings(rows: string[][]): Record<string, OptimizedTeam["categories"]> {
  const out: Record<string, OptimizedTeam["categories"]> = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const team = (r[0] || "").trim();
    if (!team) continue;
    out[team] = {
      R: num(r[1]),
      HR: num(r[2]),
      OBP: num(r[3]),
      SLG: num(r[4]),
      IP: 0,
      K: num(r[5]),
      ERA: num(r[6]),
      WHIP: num(r[7]),
      "HR/9": num(r[8]),
    };
  }
  return out;
}
