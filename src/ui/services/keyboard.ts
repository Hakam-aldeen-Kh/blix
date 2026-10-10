/**
 * Dev Tools — reading a keyboard event.
 *
 * Pure helpers: no React, no module state. The panel's shortcuts are single
 * unmodified keys, which is only safe while each of these questions has a
 * strict answer — where the event came from, whether somebody is typing, and
 * which key it actually was.
 */

/**
 * Where an event really started.
 *
 * `event.target` is retargeted to the host element when the event crosses out
 * of a shadow root, so an `<input>` inside a web component reads as its
 * custom-element wrapper. The first entry of the composed path is the element
 * the user is actually in.
 */
export function eventTarget(e: Event): EventTarget | null {
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  return path[0] ?? e.target;
}

/**
 * Whether the key is going into text: an IME composition in progress, an
 * editable element, or a form control that takes typing — `<select>` included,
 * which jumps to an option on a letter key.
 */
export function isTypingEvent(e: KeyboardEvent): boolean {
  // 229 is what a keydown reports mid-composition in browsers that leave
  // `isComposing` unset on it.
  if (e.isComposing || e.keyCode === 229) return true;
  const target = eventTarget(e);
  if (!target || typeof (target as Element).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Whether the event started inside `root`. */
export function isInside(root: Element | null, e: Event): boolean {
  if (!root) return false;
  const target = eventTarget(e);
  return (
    target !== null &&
    typeof (target as Node).nodeType === "number" &&
    root.contains(target as Node)
  );
}

const LATIN_LETTER = /^[A-Za-z]$/;
/** One printable ASCII character — what a Latin layout produces for a key. */
const ASCII_PRINTABLE = /^[ -~]$/;

/**
 * The key a shortcut should be matched against.
 *
 * `event.key` is the character the active layout produces, so on an Arabic,
 * Hebrew or Cyrillic layout the `r` key reports a letter no shortcut is bound
 * to — and every shortcut, the Ctrl+backquote toggle and Ctrl/⌘+K included, is
 * dead until the developer switches layout. For the keys the panel binds, the
 * *physical* key (`event.code`) decides instead whenever the layout did not
 * produce the Latin character itself:
 *
 * - **Letters.** A Latin letter is used as typed, so AZERTY, QWERTZ and Dvorak
 *   keep following the letter printed on the key. Anything else on a letter key
 *   — an Arabic letter, a ligature such as "لأ", or the punctuation Shift gives
 *   on a non-Latin layout ("}" on the C key) — becomes that key's letter, upper
 *   case with Shift. That is how `c` and `⇧C` stay two commands.
 * - **Digits.** Arabic-Indic and other non-ASCII digits become the key's digit.
 * - **Slash, question mark, backquote and Space** come from the Slash,
 *   Backquote and Space keys when the layout put a non-ASCII character there.
 *
 * Two deliberate limits, both so a Latin layout never loses a key it has today:
 *
 * - `?` is always taken as typed. AZERTY has it on Shift+M, a letter key, and
 *   no non-Latin layout types `?` from a letter key that Blix binds.
 * - On the digit, Slash and Backquote keys an ASCII character is left alone.
 *   QWERTZ types `/` with Shift+7 and `-` on the Slash key; rewriting those to
 *   `7` and `/` would take the `/` shortcut away from a German keyboard.
 *
 * Everything else — Escape, Enter, the arrows — is `event.key` unchanged.
 */
export function shortcutKey(e: KeyboardEvent): string {
  const key = e.key;
  const code = e.code;

  if (/^Key[A-Z]$/.test(code)) {
    if (LATIN_LETTER.test(key) || key === "?") return key;
    const letter = code.slice(3);
    return e.shiftKey ? letter : letter.toLowerCase();
  }

  // From here on an ASCII character is what the layout meant.
  if (ASCII_PRINTABLE.test(key)) return key;

  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code === "Slash") return e.shiftKey ? "?" : "/";
  if (code === "Backquote") return "`";
  if (code === "Space") return " ";
  return key;
}
