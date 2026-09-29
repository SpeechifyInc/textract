import { walkXml } from './xml.js';

export type ListTag = 'ul' | 'ol';

export interface ListLevel {
  isOrdered: boolean;
  level: string;
}

/**
 * What mammoth reads from styles.xml and numbering.xml to turn numbered paragraphs into nested <ul>/<ol> lists.
 * Plain objects on purpose: mammoth indexes levels by paragraph style over its objects' key order.
 */
export interface Lists {
  paragraphStyleNames: Record<string, string | null>;
  numberingStyleNumIds: Record<string, string | undefined>;
  nums: Record<string, string | undefined>;
  abstractNums: Record<
    string,
    { levels: Record<string, ListLevel>; numStyleLink?: string }
  >;
  levelsByParagraphStyle: Record<string, ListLevel>;
}

/** Paragraph styles mammoth's default style map maps before its list rules: such a paragraph is never a list item */
const HEADING_STYLE_IDS = new Set([
  'Heading1',
  'Heading2',
  'Heading3',
  'Heading4',
  'Heading5',
  'Heading6',
  'Heading',
]);
const NON_LIST_STYLE_NAMES = new Set([
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`Heading ${n}`, `heading ${n}`]),
  'Heading',
  'footnote text',
  'endnote text',
  'annotation text',
  'Footnote',
  'Endnote',
]);

/**
 * mammoth's numbering.findLevel, following a numbering-style link at most a few times.
 * @param lists styles and numbering
 * @param numId w:numId
 * @param level w:ilvl
 * @returns the list level, or null
 */
function findListLevel(
  lists: Lists,
  numId: string,
  level: string,
): ListLevel | null {
  let id: string | undefined = numId;
  for (let hops = 0; hops < 10 && id !== undefined; hops++) {
    const abstractNumId: string | undefined = lists.nums[id];
    const abstractNum: Lists['abstractNums'][string] | undefined =
      abstractNumId === undefined
        ? undefined
        : lists.abstractNums[abstractNumId];
    if (!abstractNum) return null;
    if (abstractNum.numStyleLink === undefined)
      return abstractNum.levels[level] ?? null;
    id = lists.numberingStyleNumIds[abstractNum.numStyleLink];
  }
  return null;
}

/**
 * Reads styles.xml and numbering.xml, as far as mammoth uses them for lists.
 * @param stylesXml styles part, if any
 * @param numberingXml numbering part, if any
 * @returns the list model
 */
export function readLists(
  stylesXml: string | undefined,
  numberingXml: string | undefined,
): Lists {
  const lists: Lists = {
    paragraphStyleNames: {},
    numberingStyleNumIds: {},
    nums: {},
    abstractNums: {},
    levelsByParagraphStyle: {},
  };
  const parent = (ancestors: string[], ...names: string[]): boolean =>
    names.every(
      (name, i) => ancestors[ancestors.length - names.length + i] === name,
    );

  if (stylesXml) {
    let style:
      | {
          type?: string;
          styleId?: string;
          name?: string | null;
          numId?: string;
          seenName?: boolean;
          seenNumId?: boolean;
        }
      | undefined;
    walkXml(
      stylesXml,
      (name, attributes, ancestors) => {
        if (name === 'w:style')
          style = {
            type: attributes['w:type'],
            styleId: attributes['w:styleId'],
            name: null,
          };
        else if (
          style &&
          name === 'w:name' &&
          parent(ancestors, 'w:style') &&
          !style.seenName
        ) {
          style.seenName = true;
          style.name = attributes['w:val'] ?? null;
        } else if (
          style &&
          name === 'w:numId' &&
          parent(ancestors, 'w:style', 'w:pPr', 'w:numPr') &&
          !style.seenNumId
        ) {
          style.seenNumId = true;
          style.numId = attributes['w:val'];
        }
      },
      (name) => {
        if (name !== 'w:style' || !style?.styleId) return;
        // The first definition of a style id wins
        if (
          style.type === 'paragraph' &&
          !(style.styleId in lists.paragraphStyleNames)
        ) {
          lists.paragraphStyleNames[style.styleId] = style.name ?? null;
        } else if (
          style.type === 'numbering' &&
          !(style.styleId in lists.numberingStyleNumIds)
        ) {
          lists.numberingStyleNumIds[style.styleId] = style.numId;
        }
        style = undefined;
      },
    );
  }

  if (numberingXml) {
    let abstract:
      | {
          id?: string;
          levels: Record<string, ListLevel & { paragraphStyleId?: string }>;
          withoutIndex?: ListLevel & { paragraphStyleId?: string };
          numStyleLink?: string;
        }
      | undefined;
    let level: { ilvl?: string; numFmt?: string; pStyle?: string } | undefined;
    let num: { numId?: string; abstractNumId?: string } | undefined;
    walkXml(
      numberingXml,
      (name, attributes, ancestors) => {
        if (name === 'w:abstractNum')
          abstract = { id: attributes['w:abstractNumId'], levels: {} };
        else if (abstract && name === 'w:lvl')
          level = { ilvl: attributes['w:ilvl'] };
        else if (
          level &&
          name === 'w:numFmt' &&
          parent(ancestors, 'w:lvl') &&
          level.numFmt === undefined
        )
          level.numFmt = attributes['w:val'] ?? '';
        else if (
          level &&
          name === 'w:pStyle' &&
          parent(ancestors, 'w:lvl') &&
          level.pStyle === undefined
        )
          level.pStyle = attributes['w:val'];
        else if (
          abstract &&
          name === 'w:numStyleLink' &&
          parent(ancestors, 'w:abstractNum') &&
          abstract.numStyleLink === undefined
        )
          abstract.numStyleLink = attributes['w:val'];
        else if (name === 'w:num') num = { numId: attributes['w:numId'] };
        else if (
          num &&
          name === 'w:abstractNumId' &&
          parent(ancestors, 'w:num') &&
          num.abstractNumId === undefined
        )
          num.abstractNumId = attributes['w:val'];
      },
      (name) => {
        if (name === 'w:lvl' && abstract && level) {
          const read = {
            isOrdered: level.numFmt !== 'bullet',
            level: level.ilvl ?? '0',
            paragraphStyleId: level.pStyle,
          };
          if (level.ilvl === undefined) abstract.withoutIndex = read;
          else abstract.levels[level.ilvl] = read;
          level = undefined;
        } else if (name === 'w:abstractNum' && abstract) {
          if (
            abstract.withoutIndex &&
            abstract.levels[abstract.withoutIndex.level] === undefined
          ) {
            abstract.levels[abstract.withoutIndex.level] =
              abstract.withoutIndex;
          }
          if (abstract.id !== undefined)
            lists.abstractNums[abstract.id] = {
              levels: abstract.levels,
              numStyleLink: abstract.numStyleLink,
            };
          abstract = undefined;
        } else if (name === 'w:num' && num) {
          if (num.numId !== undefined)
            lists.nums[num.numId] = num.abstractNumId;
          num = undefined;
        }
      },
    );
    // mammoth indexes every level by its paragraph style over its objects' key order; the last one wins
    for (const abstractNum of Object.values(lists.abstractNums)) {
      for (const styleLevel of Object.values(
        abstractNum.levels,
      ) as (ListLevel & {
        paragraphStyleId?: string;
      })[]) {
        if (styleLevel.paragraphStyleId != null)
          lists.levelsByParagraphStyle[styleLevel.paragraphStyleId] =
            styleLevel;
      }
    }
  }
  return lists;
}

/**
 * The list level mammoth maps a paragraph to, if its default style map makes it a list item at all.
 * @param lists styles and numbering
 * @param paragraph the paragraph's style and numbering (pPr/pStyle, pPr/numPr)
 * @param paragraph.styleId w:pStyle
 * @param paragraph.numId w:numId
 * @param paragraph.ilvl w:ilvl
 * @returns its depth (1-5) and list tag, or undefined for a plain paragraph
 */
export function listLevel(
  lists: Lists,
  { styleId, numId, ilvl }: { styleId?: string; numId?: string; ilvl?: string },
): { depth: number; tag: ListTag } | undefined {
  if (styleId !== undefined) {
    const name = lists.paragraphStyleNames[styleId] ?? null;
    if (
      HEADING_STYLE_IDS.has(styleId) ||
      (name !== null && NON_LIST_STYLE_NAMES.has(name))
    )
      return undefined;
  }
  let level: ListLevel | null = null;
  if (ilvl !== undefined && numId !== undefined)
    level = findListLevel(lists, numId, ilvl);
  else if (styleId !== undefined && lists.levelsByParagraphStyle[styleId])
    level = lists.levelsByParagraphStyle[styleId];
  else if (numId !== undefined) level = findListLevel(lists, numId, '0');
  if (!level) return undefined;
  // The default style map has list rules for levels 1-5; a deeper level is a plain paragraph
  const index = Number(level.level);
  if (!Number.isInteger(index) || index < 0 || index > 4) return undefined;
  return { depth: index + 1, tag: level.isOrdered ? 'ol' : 'ul' };
}

/**
 * How many block markers a written paragraph opens: one for a <p> or heading; for a list item, one per <li> it
 * opens. A list item's path is ul|ol > li per level above it, then ul or ol > li:fresh; mammoth's HTML writer
 * merges each non-fresh element into the matching one the previous block left open.
 * @param previous the list the block before left open in this container, if it was a list item
 * @param list the paragraph's list level, if it is a list item
 * @returns the list this paragraph leaves open, and its marker count
 */
export function openBlock(
  previous: ListTag[] | undefined,
  list: { depth: number; tag: ListTag } | undefined,
): { listPath: ListTag[] | undefined; markers: number } {
  if (!list) return { listPath: undefined, markers: 1 };
  const listPath: ListTag[] = [];
  let reused = 0;
  let merging = true;
  for (let i = 0; i < list.depth; i++) {
    const last = i === list.depth - 1;
    const wanted: ListTag | undefined = last ? list.tag : undefined; // above the item's own level, ul|ol
    if (
      merging &&
      previous !== undefined &&
      i < previous.length &&
      (wanted === undefined || previous[i] === wanted)
    ) {
      listPath.push(previous[i]);
      // the <li> above this level is reused too, unless this is the item's own (fresh) <li>
      if (!last) reused++;
    } else {
      merging = false;
      listPath.push(wanted ?? 'ul');
    }
  }
  return { listPath, markers: list.depth - reused };
}
