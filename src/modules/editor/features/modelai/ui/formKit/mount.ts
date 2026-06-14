// @ts-nocheck
import { formKitRegistry } from "@modelai/ui/formKit/registry";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";

const disposedRegistrations = new WeakSet<FormKitRegistration>();

export function unmountFormKit(registration?: FormKitRegistration) {
  if (!registration) {
    return;
  }

  formKitRegistry.unregister(registration.id);

  if (disposedRegistrations.has(registration)) {
    return;
  }

  disposedRegistrations.add(registration);
  registration.dispose?.();
}

export function mountFormKit(registration?: FormKitRegistration) {
  if (!registration) {
    return () => {};
  }

  formKitRegistry.register(registration);
  let unmounted = false;

  return () => {
    if (unmounted) return;
    unmounted = true;
    unmountFormKit(registration);
  };
}
