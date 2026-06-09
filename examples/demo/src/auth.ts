export function verifyToken(token: string): boolean {
  return token.length > 0;
}
// note: there is no `refreshSession` here — it was renamed away.
