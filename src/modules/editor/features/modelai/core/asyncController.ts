// @ts-nocheck
export interface AsyncResult {
  status: "success" | "fail" | "cancel";
  message?: string;
}

export class AsyncController {
  private readonly failListeners = new Set<(state: AsyncResult) => void>();
  private readonly successListeners = new Set<(state: AsyncResult) => void>();
  private resultValue: AsyncResult | undefined;

  get result() {
    return this.resultValue;
  }

  readonly fail = (message?: string) => {
    this.notifyListeners(this.failListeners, "fail", message);
  };

  readonly cancel = (message?: string) => {
    this.notifyListeners(this.failListeners, "cancel", message);
  };

  readonly success = (message?: string) => {
    this.notifyListeners(this.successListeners, "success", message);
  };

  private notifyListeners(
    listeners: Set<(result: AsyncResult) => void>,
    status: AsyncResult["status"],
    message?: string
  ) {
    if (this.resultValue === undefined) {
      this.resultValue = { status, message };
      [...listeners].forEach(listener => listener(this.resultValue!));
    }
  }

  onCancelled(listener: (result: AsyncResult) => void): void {
    this.failListeners.add(listener);
  }

  onCompleted(listener: (result: AsyncResult) => void): void {
    this.successListeners.add(listener);
  }

  dispose() {
    this.failListeners.clear();
    this.successListeners.clear();
  }
}
