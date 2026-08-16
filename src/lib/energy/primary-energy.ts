// src/lib/energy/primary-energy.ts
// Official Korean primary energy conversion factors (MOTIE/KEMCO)
// Reference: 건축물 에너지효율등급 인증 및 제로에너지건축물 인증 기준

export const PRIMARY_ENERGY_FACTORS = {
  electricity: 2.75,        // kWh primary per kWh delivered
  gas: 1.1,                 // kWh primary per kWh delivered
  districtHeating: 0.728,   // kWh primary per kWh delivered
  districtCooling: 0.937,   // kWh primary per kWh delivered
  // P2-02: on-site renewable generation displaces grid electricity, so it
  // offsets primary energy at the ELECTRICITY primary factor. Substitution
  // is capped at the electric leg (accuracy wave) so a large PV array cannot
  // drive delivered/primary electric negative.
  renewable: 2.75,
} as const;

export interface DeliveredEnergy {
  electric: number;       // kWh/year — electricity for cooling, lighting, equipment
  gas: number;            // kWh/year — gas for heating, DHW
  districtHeating: number; // kWh/year
  districtCooling: number; // kWh/year
  renewable: number;       // kWh/year — on-site renewable generation
}

export interface PrimaryEnergyBreakdown {
  electric: number;        // kWh/year primary from electricity (after renewable substitution)
  gas: number;             // kWh/year primary from gas
  districtHeating: number; // kWh/year primary from district heating
  districtCooling: number; // kWh/year primary from district cooling
  renewable: number;       // kWh/year primary offset from renewables (≤ 0)
  total: number;           // sum of all primary energy contributions
}

export interface PrimaryEnergyResult {
  deliveredEnergy: DeliveredEnergy & { total: number };
  primaryEnergy: PrimaryEnergyBreakdown;
  primaryEnergyPerArea: number; // kWh/m²·year
  conversionFactorsUsed: typeof PRIMARY_ENERGY_FACTORS;
}

/**
 * Convert delivered energy (kWh/year) to primary energy using official
 * Korean conversion factors (MOTIE/KEMCO), then compute per-area intensity.
 *
 * @param delivered  Annual delivered energy by fuel type (kWh/year)
 * @param totalArea  Gross conditioned floor area (m²)
 */
export function calculatePrimaryEnergy(
  delivered: {
    electric: number;
    gas: number;
    districtHeating?: number;
    districtCooling?: number;
    renewable?: number;
  },
  totalArea: number
): PrimaryEnergyResult {
  const dh = delivered.districtHeating ?? 0;
  const dc = delivered.districtCooling ?? 0;
  const re = delivered.renewable ?? 0;

  // On-site renewable generation substitutes grid electricity: net it
  // against the electric leg BEFORE applying the 2.75 factor (capped so a
  // large PV array cannot drive electric consumption negative).
  const reUsed = Math.min(re, delivered.electric);
  const electricNet = delivered.electric - reUsed;

  const deliveredTotal = electricNet + delivered.gas + dh + dc;

  const primaryElectric = electricNet * PRIMARY_ENERGY_FACTORS.electricity;
  const primaryGas = delivered.gas * PRIMARY_ENERGY_FACTORS.gas;
  const primaryDH = dh * PRIMARY_ENERGY_FACTORS.districtHeating;
  const primaryDC = dc * PRIMARY_ENERGY_FACTORS.districtCooling;
  // Report the credit renewables earned (≤ 0). Already netted from electric,
  // so it is NOT added again into primaryTotal.
  const primaryRenewable =
    reUsed > 0 ? -reUsed * PRIMARY_ENERGY_FACTORS.renewable : 0;

  const primaryTotal = primaryElectric + primaryGas + primaryDH + primaryDC;

  const primaryEnergyPerArea =
    totalArea > 0 ? primaryTotal / totalArea : 0;

  return {
    deliveredEnergy: {
      electric: delivered.electric,
      gas: delivered.gas,
      districtHeating: dh,
      districtCooling: dc,
      renewable: re,
      total: deliveredTotal,
    },
    primaryEnergy: {
      electric: primaryElectric,
      gas: primaryGas,
      districtHeating: primaryDH,
      districtCooling: primaryDC,
      renewable: primaryRenewable,
      total: primaryTotal,
    },
    primaryEnergyPerArea,
    conversionFactorsUsed: PRIMARY_ENERGY_FACTORS,
  };
}
