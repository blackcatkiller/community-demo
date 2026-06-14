// @ts-nocheck
export type ShortcutMap = Readonly<Record<string, string>>;

export interface ShortcutProfile {
  id: string;
  label: string;
  map: ShortcutMap;
}

export const DEFAULT_SHORTCUT_PROFILE: ShortcutProfile = {
  id: "default",
  label: "Default",
  map: {
    "ctrl+z": "edit.undo",
    "ctrl+y": "edit.redo",
    "ctrl+shift+z": "edit.redo",
    l: "measure.length",
    a: "measure.angle",
    c: "measure.connectivity",
    s: "measure.slope",
    delete: "modify.deleteNode",
    backspace: "modify.deleteNode"
  }
};

export const shortcutProfiles: readonly ShortcutProfile[] = [
  DEFAULT_SHORTCUT_PROFILE
];

export function getShortcutProfile(id: string): ShortcutProfile | undefined {
  return shortcutProfiles.find(profile => profile.id === id);
}
