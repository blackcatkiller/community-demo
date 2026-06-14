// @ts-nocheck
import type { FormKitRegistration } from "./runtime";

type Listener = () => void;

class FormKitRegistry {
  // The viewport currently hosts one active form at a time.
  private active?: FormKitRegistration;
  private readonly listeners = new Set<Listener>();

  getActive() {
    return this.active;
  }

  register(registration: FormKitRegistration) {
    if (this.active === registration) return;
    this.active = registration;
    this.emit();
  }

  unregister(id?: string) {
    if (!this.active) return;
    if (id && this.active.id !== id) return;
    this.active = undefined;
    this.emit();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach(listener => listener());
  }
}

export const formKitRegistry = new FormKitRegistry();
