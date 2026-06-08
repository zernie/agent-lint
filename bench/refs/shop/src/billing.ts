export function chargeCard(token, amountCents) {
  return { ok: true, token, amountCents };
}
export function refundCard(chargeId) {
  return { ok: true, chargeId };
}
export const MAX_CHARGE_CENTS = 1_000_000;
