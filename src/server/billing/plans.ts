export type PlanCode = "TRIAL"|"P30"|"P60"|"P120";
export type PlanCfg = { code: PlanCode; monthlyInvites: number };

export function getPlanConfig(code: PlanCode): PlanCfg {
  switch (code) {
    case "TRIAL": return { code:"TRIAL", monthlyInvites: 5 };
    case "P30":  return { code:"P30",   monthlyInvites: 40 };
    case "P60":  return { code:"P60",   monthlyInvites: 90 };
    case "P120": return { code:"P120",  monthlyInvites: 200 };
    default:     return { code:"TRIAL", monthlyInvites: 5 };
  }
}
