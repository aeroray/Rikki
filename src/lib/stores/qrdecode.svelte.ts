class QrDecodeStore {
  loading = $state(true);
  data = $state("");
  reason = $state<"empty" | "none" | null>(null);
  scannedKey = $state("");

  reset() {
    this.loading = true;
    this.data = "";
    this.reason = null;
    this.scannedKey = "";
  }
}

export const qrdecode = new QrDecodeStore();
