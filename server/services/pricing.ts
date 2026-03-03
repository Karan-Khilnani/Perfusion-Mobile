export interface PricingResult {
  customerPrice: number;
  marginPercent: number;
  marginAmount: number;
}

export function calculateCustomerPrice(
  baseCost: number,
  customerPriceOverride: string | number | null | undefined,
  marginOverride: string | number | null | undefined,
  defaultMarginPercent: number
): PricingResult {
  if (customerPriceOverride != null && customerPriceOverride !== "") {
    const cp = typeof customerPriceOverride === "string" ? parseFloat(customerPriceOverride) : customerPriceOverride;
    if (!isNaN(cp) && cp > 0) {
      const marginAmount = cp - baseCost;
      const marginPercent = baseCost > 0 ? (marginAmount / baseCost) * 100 : 0;
      return { customerPrice: cp, marginPercent: Math.round(marginPercent * 100) / 100, marginAmount };
    }
  }

  if (marginOverride != null && marginOverride !== "") {
    const mo = typeof marginOverride === "string" ? parseFloat(marginOverride) : marginOverride;
    if (!isNaN(mo)) {
      const marginAmount = (baseCost * mo) / 100;
      const customerPrice = baseCost + marginAmount;
      return { customerPrice, marginPercent: mo, marginAmount };
    }
  }

  const marginAmount = (baseCost * defaultMarginPercent) / 100;
  const customerPrice = baseCost + marginAmount;
  return { customerPrice, marginPercent: defaultMarginPercent, marginAmount };
}

export function deriveMarginFromPrice(baseCost: number, customerPrice: number): number {
  if (baseCost <= 0) return 0;
  return Math.round(((customerPrice - baseCost) / baseCost) * 100 * 100) / 100;
}

export function derivePriceFromMargin(baseCost: number, marginPercent: number): number {
  return Math.round((baseCost + (baseCost * marginPercent) / 100) * 100) / 100;
}
