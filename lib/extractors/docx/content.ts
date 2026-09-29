/** What an element reads to: text, or a link with the key that decides which neighbouring links it merges with */
export type Piece = string | { link: string; text: string };

/**
 * The text written inside one element, built piece by piece. mammoth's HTML writes adjacent links to one target as a
 * single <a>, which the HTML extractor spaces out as a whole, so a link joins the link written just before it when
 * their keys match; any text between them, but not an empty piece, keeps them apart.
 */
export class Content {
  private readonly parts: string[] = [];
  private lastLink: string | undefined;

  add(piece: Piece): void {
    if (typeof piece === 'string') {
      if (piece.length === 0) return;
      this.parts.push(piece);
      this.lastLink = undefined;
      return;
    }
    // An empty link writes nothing
    if (piece.text.length === 0) return;
    if (this.lastLink === piece.link && this.parts.at(-1) === ' ') {
      // Joined into the link before: its trailing space moves after this part
      this.parts[this.parts.length - 1] = piece.text;
      this.parts.push(' ');
    } else {
      this.parts.push(' ', piece.text, ' ');
      this.lastLink = piece.link;
    }
  }

  toString(): string {
    return this.parts.join('');
  }
}
