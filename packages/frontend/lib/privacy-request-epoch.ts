/** Discards replies from a previous session, including logout/login to the same account. */
export class PrivacyRequestEpoch {
  private epoch = 0;
  constructor(private readonly currentAccount: () => string | null) {}
  invalidate(): number {
    return ++this.epoch;
  }
  async load<T>(accountId: string, fetchValue: () => Promise<T>): Promise<T | undefined> {
    const epoch = this.epoch;
    if (this.currentAccount() !== accountId) return undefined;
    const value = await fetchValue();
    return epoch === this.epoch && this.currentAccount() === accountId ? value : undefined;
  }
}
