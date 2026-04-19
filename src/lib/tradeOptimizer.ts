// Trade simulator optimizer logic — pure functions, no React.

export type Player = Record<string, string>;

export interface PositionCaps {
  C: number;
  "1B": number;
  "2B": number;
  SS: number;
  MI: number;
  "3B": number;
  OF: number;
  UTIL: number;
}

export interface OptimizerCaps {
  positions: PositionCaps;
  maxIP: number;
}

export interface HitterTotals {
  valor: number;
  G: number;
  PA: number;
  HR: number;
  R: number;
  obpNum: number; // OBP * PA accumulator
  slgNum: number; // SLG * PA (using AB approx via PA)
}

export interface PitcherTotals {
  valor: number;
  IP: number;
  K: number;
  eraNum: number; // ER * 9 cumulative? we'll use weighted by IP
  whipNum: number;
  hr9Num: number;
}

export interface OptimizedTeam {
  hitters: HitterTotals;
  pitchers: PitcherTotals;
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
}

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const cleaned = String(v).replace(/[$,]/g, "").replace(/\((.+)\)/, "-$1").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const isEligibleHitter = (p: Player, pos: string): boolean => {
  const positions = p["Positions"] || "";
  if (pos === "MI") return /\b(2B|SS)\b/.test(positions);
  if (pos === "UTIL") {
    // UTIL = any hitter (not pitcher-only). Hitters dataset already excludes pitchers.
    return true;
  }
  // Match position abbreviation as a token (avoid matching SS in "SS/3B" etc.)
  const re = new RegExp(`(^|[^A-Z0-9])${pos}([^A-Z0-9]|$)`);
  return re.test(positions);
};

interface AllocatedGames {
  [playerId: string]: number; // games already used
}

function optimizeHitters(hitters: Player[], caps: PositionCaps): HitterTotals {
  const order: (keyof PositionCaps)[] = ["C", "SS", "2B", "MI", "3B", "1B", "OF", "UTIL"];
  const used: AllocatedGames = {};

  // Per-player allocated G total (used to weight rate stats)
  const allocG: AllocatedGames = {};

  let valor = 0;
  let totalG = 0;
  let totalPA = 0;
  let totalHR = 0;
  let totalR = 0;
  let obpWeighted = 0; // sum(OBP * PA_share)
  let slgWeighted = 0;

  for (const pos of order) {
    let cap = caps[pos] ?? 0;
    if (cap <= 0) continue;

    // Build candidates eligible for this position with VALOR/G desc
    const candidates = hitters
      .filter(p => {
        const blG = num(p["BL_G"]);
        const remaining = blG - (used[p["playerid"]] ?? 0);
        return remaining > 0 && isEligibleHitter(p, pos);
      })
      .map(p => {
        const playerValor = num(p["Total WAR"]);
        const blG = num(p["BL_G"]);
        const valorPerG = blG > 0 ? playerValor / blG : 0;
        return { p, valorPerG };
      })
      .sort((a, b) => b.valorPerG - a.valorPerG);

    for (const { p } of candidates) {
      if (cap <= 0) break;
      const id = p["playerid"];
      const blG = num(p["BL_G"]);
      const remaining = blG - (used[id] ?? 0);
      if (remaining <= 0) continue;
      const games = Math.min(cap, remaining);
      used[id] = (used[id] ?? 0) + games;
      allocG[id] = (allocG[id] ?? 0) + games;
      cap -= games;
    }
  }

  // Aggregate counting stats based on allocated games (proportional to BL totals)
  for (const p of hitters) {
    const id = p["playerid"];
    const g = allocG[id] ?? 0;
    if (g <= 0) continue;
    const blG = num(p["BL_G"]);
    if (blG <= 0) continue;
    const share = g / blG;
    const playerValor = num(p["Total WAR"]);
    const blPA = num(p["BL_PA"]);
    const blHR = num(p["BL_HR"]);
    const blR = num(p["BL_R"]);
    const blOBP = num(p["BL_OBP"]);
    const blSLG = num(p["BL_SLG"]);

    const allocPA = blPA * share;
    valor += playerValor * share;
    totalG += g;
    totalPA += allocPA;
    totalHR += blHR * share;
    totalR += blR * share;
    obpWeighted += blOBP * allocPA;
    slgWeighted += blSLG * allocPA;
  }

  return {
    valor,
    G: totalG,
    PA: totalPA,
    HR: totalHR,
    R: totalR,
    obpNum: obpWeighted,
    slgNum: slgWeighted,
  };
}

function optimizePitchers(pitchers: Player[], maxIP: number): PitcherTotals {
  const ranked = pitchers
    .map(p => {
      const playerValor = num(p["Total WAR"]);
      const ip = num(p["BL_IP"]);
      const valorPerIP = ip > 0 ? playerValor / ip : 0;
      return { p, valorPerIP, ip };
    })
    .filter(x => x.ip > 0)
    .sort((a, b) => b.valorPerIP - a.valorPerIP);

  let cap = maxIP;
  let valor = 0;
  let totalIP = 0;
  let totalK = 0;
  let eraWeighted = 0;
  let whipWeighted = 0;
  let hr9Weighted = 0;

  for (const { p, ip } of ranked) {
    if (cap <= 0) break;
    const used = Math.min(cap, ip);
    const share = used / ip;
    const playerValor = num(p["Total WAR"]);
    const k = num(p["BL_SO"]);
    const era = num(p["BL_ERA"]);
    const whip = num(p["BL_WHIP"]);
    const hr9 = num(p["BL_HR/9"]);

    valor += playerValor * share;
    totalIP += used;
    totalK += k * share;
    eraWeighted += era * used;
    whipWeighted += whip * used;
    hr9Weighted += hr9 * used;
    cap -= used;
  }

  return {
    valor,
    IP: totalIP,
    K: totalK,
    eraNum: eraWeighted,
    whipNum: whipWeighted,
    hr9Num: hr9Weighted,
  };
}

export function optimizeTeam(
  hitters: Player[],
  pitchers: Player[],
  caps: OptimizerCaps,
): OptimizedTeam {
  const h = optimizeHitters(hitters, caps.positions);
  const p = optimizePitchers(pitchers, caps.maxIP);

  return {
    hitters: h,
    pitchers: p,
    totalValor: h.valor + p.valor,
    categories: {
      R: h.R,
      HR: h.HR,
      OBP: h.PA > 0 ? h.obpNum / h.PA : 0,
      SLG: h.PA > 0 ? h.slgNum / h.PA : 0,
      IP: p.IP,
      K: p.K,
      ERA: p.IP > 0 ? p.eraNum / p.IP : 0,
      WHIP: p.IP > 0 ? p.whipNum / p.IP : 0,
      "HR/9": p.IP > 0 ? p.hr9Num / p.IP : 0,
    },
  };
}

// Parse caps from Assumptions tab. Pass the full sheet values (rows of strings).
// Rows 108-115 column B → UTIL, C, 1B, 2B, SS, MI, 3B, OF (1-indexed in spec).
// Row 120 column B → max IP.
export function parseCaps(rows: string[][]): OptimizerCaps {
  const get = (rowIdx1: number) => num(rows[rowIdx1 - 1]?.[1] ?? "0");
  return {
    positions: {
      UTIL: get(108),
      C: get(109),
      "1B": get(110),
      "2B": get(111),
      SS: get(112),
      MI: get(113),
      "3B": get(114),
      OF: get(115),
    },
    maxIP: get(120),
  };
}
