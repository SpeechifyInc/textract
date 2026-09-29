/** A complex field (fldChar begin/separate/end), as mammoth tracks it */
export interface Field {
  type: 'begin' | 'hyperlink' | 'checkbox' | 'unknown';
  /** A hyperlink field's target */
  link?: string;
}

/**
 * mammoth's parse of a complex field's instruction (the w:instrText between begin and separate).
 * @param instruction the instruction text
 * @returns the field it declares
 */
export function parseInstruction(instruction: string): Field {
  const href = /\s*HYPERLINK "(.*)"/.exec(instruction);
  if (href) return { type: 'hyperlink', link: `href:${href[1]} ` };
  const anchor = /\s*HYPERLINK\s+\\l\s+"(.*)"/.exec(instruction);
  if (anchor) return { type: 'hyperlink', link: `anchor:${anchor[1]} ` };
  if (/\s*FORMCHECKBOX\s*/.test(instruction)) return { type: 'checkbox' };
  return { type: 'unknown' };
}
