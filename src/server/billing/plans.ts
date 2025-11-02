export type PlanCode = "STARTER"|"SALES_BOOST"|"EXPANSION";
export type PlanCfg = { code: PlanCode; monthlyInvites: number };

export function getPlanConfig(code: PlanCode): PlanCfg {
  switch (code) {
    case "STARTER": return { code:"STARTER", monthlyInvites: 120 };
    case "SALES_BOOST": return { code:"SALES_BOOST", monthlyInvites: 250 };
    case "EXPANSION": return { code:"EXPANSION", monthlyInvites: 600 };
    default: return { code:"STARTER", monthlyInvites: 120 };
  }
}
