export function validateCart(cart) {
  return Array.isArray(cart.items) && cart.items.length > 0;
}
export function cartTotalCents(cart) {
  return cart.items.reduce((s, i) => s + i.priceCents * i.qty, 0);
}
