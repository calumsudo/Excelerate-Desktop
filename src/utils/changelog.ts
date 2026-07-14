import changelogRaw from "../../CHANGELOG.md?raw";

export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

const VERSION_HEADER_RE = /^## \[([^\]]+)\]\([^)]*\)\s*\(([^)]+)\)/;
const SECTION_HEADER_RE = /^### (.+)/;
const COMMIT_LINK_RE = /\s*\(\[[0-9a-f]{6,}\]\([^)]*\)\)\s*$/;
const SCOPE_PREFIX_RE = /^\*\*([^*]+)\*\*\s*/;

function stripCommitLink(line: string): string {
  return line.replace(COMMIT_LINK_RE, "").replace(SCOPE_PREFIX_RE, "$1 ").trim();
}

export function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const versionBlocks = raw.split(/\n(?=## \[)/g);

  for (const block of versionBlocks) {
    const headerMatch = block.match(VERSION_HEADER_RE);
    if (!headerMatch) continue;
    const [, version, date] = headerMatch;

    const sections: ChangelogSection[] = [];
    const sectionBlocks = block.split(/\n(?=### )/g).slice(1);

    for (const sectionBlock of sectionBlocks) {
      const sectionHeaderMatch = sectionBlock.match(SECTION_HEADER_RE);
      if (!sectionHeaderMatch) continue;

      const items = sectionBlock
        .split("\n")
        .filter((line) => line.trim().startsWith("* "))
        .map((line) => stripCommitLink(line.trim().slice(2)));

      if (items.length > 0) {
        sections.push({ heading: sectionHeaderMatch[1].trim(), items });
      }
    }

    entries.push({ version, date, sections });
  }

  return entries;
}

export function getChangelogEntries(): ChangelogEntry[] {
  return parseChangelog(changelogRaw);
}
