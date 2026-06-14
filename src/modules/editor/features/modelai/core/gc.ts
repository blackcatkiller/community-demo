// @ts-nocheck
export interface Deletable {
  delete(): void;
}

export interface IDisposable {
  dispose(): void;
}

export function isDeletable(value: unknown): value is Deletable {
  return typeof (value as any)?.delete === "function";
}

export function isDisposable(value: unknown): value is IDisposable {
  return typeof (value as any)?.dispose === "function";
}

export const gc = <R>(
  action: (collect: <T extends Deletable | IDisposable>(resource: T) => T) => R
): R => {
  const resources = new Set<Deletable | IDisposable>();
  const collectResource = <T extends Deletable | IDisposable>(resource: T) => {
    resources.add(resource);
    return resource;
  };
  try {
    return action(collectResource);
  } finally {
    for (const resource of resources) {
      if (isDeletable(resource)) resource.delete();
      else if (isDisposable(resource)) resource.dispose();
    }
    resources.clear();
  }
};
