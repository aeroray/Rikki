class QrDecodeStore {
  loading = $state(false);
  data = $state("");
  reason = $state<"empty" | "none" | null>(null);
  scannedKey = $state("");

  reset() {
    this.loading = false;
    this.data = "";
    this.reason = null;
    this.scannedKey = "";
  }
}

export const qrdecode = new QrDecodeStore();
