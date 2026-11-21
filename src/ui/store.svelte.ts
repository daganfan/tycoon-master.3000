type Modal =
  | { kind: 'offline'; time: string; cash: string }
  | { kind: 'export'; code: string }
  | { kind: 'import'; error?: string; onImport: (code: string) => void }
  | { kind: 'reset' };

/** Shared reactive UI state between the HUD and the game/world. */
export const ui = $state<{
  loading: string;
  hint: string;
  focused: boolean;
  tree: boolean;
  modal: Modal | null;
  focusMain?: () => void;
  unfocus?: () => void;
  /** Return all furniture/props to their home spots. */
  tidy?: () => void;
  /** True while Tidy Up is running or cooling down. */
  tidyBusy?: () => boolean;
}>({ loading: 'Booting up…', hint: '', focused: false, tree: false, modal: null });
