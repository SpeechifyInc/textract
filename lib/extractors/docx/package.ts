import type JSZip from 'jszip';
import { walkXml } from './xml.js';

/*
 * Finding parts in the DOCX package the way mammoth does: relationships first, then a fallback path.
 */

/** Relationship types are matched exactly, Transitional only, as mammoth does; other parts use the fallback path */
export const RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

export interface Relationships {
  /** Targets by relationship type, in document order */
  byType: Map<string, string[]>;
  /** Targets by relationship id, as a hyperlink's r:id names them */
  byId: Map<string, string>;
}

/**
 * Splits a zip path into its folder and name, as mammoth's zipfile.splitPath does.
 * @param partPath path in the zip
 * @returns folder ('' at the root) and name
 */
export function splitPath(partPath: string): {
  dirname: string;
  basename: string;
} {
  const slash = partPath.lastIndexOf('/');
  return slash === -1
    ? { dirname: '', basename: partPath }
    : {
        dirname: partPath.slice(0, slash),
        basename: partPath.slice(slash + 1),
      };
}

/**
 * Joins zip paths as mammoth's zipfile.joinPath does: an absolute path starts over, and nothing is normalized.
 * @param paths the paths, empty ones skipped
 * @returns the joined path
 */
function joinPath(...paths: string[]): string {
  let relevant: string[] = [];
  for (const segment of paths) {
    if (!segment) continue;
    if (segment.startsWith('/')) relevant = [segment];
    else relevant.push(segment);
  }
  return relevant.join('/');
}

/**
 * Reads the relationships of a part (word/_rels/document.xml.rels for word/document.xml, _rels/.rels for the
 * package). A missing part has none.
 * @param zip the DOCX package
 * @param partPath path of the part, '' for the package
 * @returns the relationships by type and by id
 */
export async function readRelationships(
  zip: JSZip,
  partPath: string,
): Promise<Relationships> {
  const relationships: Relationships = { byType: new Map(), byId: new Map() };
  const { dirname, basename } = splitPath(partPath);
  const xml = await zip
    .file(joinPath(dirname, '_rels', `${basename}.rels`))
    ?.async('string');
  if (!xml) return relationships;
  walkXml(xml, (name, attributes, ancestors) => {
    if (name !== 'relationships:Relationship' || ancestors.length !== 1) return;
    const { Id: id, Type: type, Target: target } = attributes;
    if (target === undefined) return;
    if (id !== undefined) relationships.byId.set(id, target);
    if (type !== undefined) {
      const targets = relationships.byType.get(type);
      if (targets) targets.push(target);
      else relationships.byType.set(type, [target]);
    }
  });
  return relationships;
}

/**
 * mammoth's findPartPath: the first target of the type that exists in the package, or else the fallback path.
 * @param zip the DOCX package
 * @param relationships relationships of the part the target is relative to
 * @param type relationship type
 * @param basePath folder of that part
 * @param fallbackPath path used when no target exists
 * @returns path of the part, which may not exist
 */
export function findPartPath(
  zip: JSZip,
  relationships: Relationships,
  type: string,
  basePath: string,
  fallbackPath: string,
): string {
  for (const target of relationships.byType.get(type) ?? []) {
    const partPath = joinPath(basePath, target).replace(/^\//, '');
    if (zip.file(partPath)) return partPath;
  }
  return fallbackPath;
}
