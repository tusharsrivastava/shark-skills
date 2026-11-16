#!/usr/bin/env python3
"""Reading-level check for cookbook chapters (references/style.md, sections 1 and 6).

Usage: python3 readability.py <file.md> [<file.md> ...]
Uses only the Python standard library (3.9 or newer).

Checks prose only (code blocks and headings are skipped; inline code counts as one word):
  - a sentence in a numbered step has 20 words or fewer; another sentence has 25 or fewer (wrapped lines are
    joined first; table cells are not checked);
  - a paragraph has 4 sentences or fewer (a list item, a table row, or a line that starts with a bold label
    such as "**Check:**" starts a new unit);
  - a code block has 20 lines or fewer;
  - a numbered procedure has 7 steps or fewer;
  - no word from the "Do not use" table of references/style.md section 1.1 (also in table cells).
The number of technical terms in a sentence needs a human reader: this script does not check it.
Exit code 1 when a file has a finding.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

FORBIDDEN = [
    "should", "would", "could", "might", "may", "ensure", "ensures", "utilize", "utilise", "leverage",
    "perform", "performs", "obtain", "obtains", "fetch", "fetches", "provide", "provides", "require",
    "requires", "via", "prior to", "e.g.", "i.e.", "etc.", "expose", "exposes",
]  # fmt: skip
FORBIDDEN_RE = re.compile(r"(?<![\w.])(" + "|".join(re.escape(w) for w in FORBIDDEN) + r")(?![\w])", re.I)
SENTENCE_END = re.compile(r"(?<=[.!?])[\"'”’)]?\s+(?=[A-Z0-9\"'`(*])")  # a closing quote can follow
UNIT_START = re.compile(r"^(\d+\.\s|[-*]\s|\||\*\*[^*]+:\*\*|\*\*[^*]+\*\*$)")
NUMBERED = re.compile(r"^\d+\.\s")
MAX_PROCEDURE, MAX_DESCRIPTIVE, MAX_PARAGRAPH, MAX_CODE, MAX_STEPS = 20, 25, 4, 20, 7


def plain(text: str) -> str:
    text = re.sub(r"`[^`]*`", "CODE", text)  # inline code is one word
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)  # links: keep the label
    text = re.sub(r"<[^>]+>", "", text)  # html tags such as <sub>
    return text.replace("**", "").replace("*", "").strip()


def sentences(text: str) -> list[str]:
    return [s for s in SENTENCE_END.split(plain(text)) if re.search(r"\w", s)]


def word_count(sentence: str) -> int:
    return len(re.findall(r"[\w'’-]+", sentence))


@dataclass
class Report:
    path: Path
    findings: list[str] = field(default_factory=list)
    lengths: list[int] = field(default_factory=list)

    def add(self, line: int, message: str) -> None:
        self.findings.append(f"{self.path}:{line}: {message}")


def check_words(report: Report, number: int, text: str) -> None:
    for match in FORBIDDEN_RE.finditer(plain(re.sub(r"`[^`]*`", "", text))):
        report.add(number, f"do not use {match.group(1)!r} (style.md 1.1)")


def check_sentences(report: Report, number: int, line: str) -> int:
    """Check one unit: a paragraph or a list item, wrapped lines joined. Return its number of sentences."""
    limit = MAX_PROCEDURE if NUMBERED.match(line) else MAX_DESCRIPTIVE
    found = sentences(re.sub(r"^(\d+\.|[-*])\s+", "", line))
    for sentence in found:
        count = word_count(sentence)
        report.lengths.append(count)
        if count > limit:
            report.add(number, f"{count} words (max {limit}): {sentence[:70]}…")
    return len(found)


def prose_lines(report: Report, lines: list[str]) -> list[tuple[int, str]]:
    """The prose lines, with blank strings as paragraph breaks. Checks the code blocks on the way."""
    out: list[tuple[int, str]] = []
    in_code, start = False, 0
    for number, raw in enumerate(lines, 1):
        line = raw.strip()
        if line.startswith(("```", "~~~")):
            if in_code and number - start - 1 > MAX_CODE:
                report.add(start, f"code block has {number - start - 1} lines (max {MAX_CODE})")
            in_code, start = not in_code, number
            out.append((number, ""))
        elif not in_code:
            rule = re.fullmatch(r"\|?[|:\- ]+\|?", line or "x")
            skip = line.startswith(("#", "You are here:")) or line == "---" or rule
            out.append((number, "" if skip else re.sub(r"^>\s?", "", line)))
    return out


def units(lines: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Join wrapped lines: a unit is one paragraph, one list item, or one table row."""
    out: list[tuple[int, str]] = []
    for number, line in lines:
        if not line:
            out.append((number, ""))
        elif UNIT_START.match(line) or not out or not out[-1][1] or out[-1][1].startswith("|"):
            out.append((number, line))
        else:
            out[-1] = (out[-1][0], f"{out[-1][1]} {line}")
    return [u for u in out if u[1]]


def check_procedures(report: Report, raw_lines: list[str]) -> None:
    """A numbered procedure starts at "1." (or after a heading) and runs to its last numbered item."""
    count, first, in_code = 0, 0, False
    for number, raw in enumerate(raw_lines, 1):
        if raw.strip().startswith(("```", "~~~")):
            in_code = not in_code
        if in_code:
            continue
        item = re.match(r"^(\d+)\.\s", raw)  # only items at the left margin: nested lists are not steps
        if raw.startswith("#") or (item and item.group(1) == "1"):
            count, first = 0, number
        if item:
            count += 1
            if count == MAX_STEPS + 1:
                report.add(first, f"procedure has more than {MAX_STEPS} steps: split it into two sections")


def check(path: Path) -> Report:
    report = Report(path)
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    lines = prose_lines(report, raw_lines)
    for number, line in lines:
        if line:
            check_words(report, number, line)
    check_procedures(report, raw_lines)
    for number, unit in units(lines):
        if unit.startswith("|"):
            continue
        count = check_sentences(report, number, unit)
        is_paragraph = not re.match(r"^(\d+\.|[-*])\s", unit)
        if is_paragraph and count > MAX_PARAGRAPH:
            report.add(number, f"paragraph has {count} sentences (max {MAX_PARAGRAPH})")
    lengths = report.lengths or [0]
    average = sum(lengths) / len(lengths)
    print(f"{path}: {len(report.lengths)} sentences, {average:.1f} words on average, longest {max(lengths)}")
    return report


def main(paths: list[str]) -> int:
    if not paths:
        print(__doc__)
        return 2
    findings = [f for p in paths for f in check(Path(p)).findings]
    print(*findings, sep="\n")
    print(f"{len(findings)} finding(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
