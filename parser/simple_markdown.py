META_KEYS = {"kicker", "metric", "note"}


def parse_document(markdown_text):
    frontmatter, body = split_frontmatter(markdown_text)
    sections = parse_sections(body)

    return {
        "title": frontmatter.get("title", "Untitled document"),
        "subtitle": frontmatter.get("subtitle", ""),
        "sections": sections,
    }


def split_frontmatter(markdown_text):
    normalized = markdown_text.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")

    if not lines or lines[0].strip() != "---":
        return {}, normalized

    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return parse_key_values(lines[1:index]), "\n".join(lines[index + 1 :])

    return {}, normalized


def parse_key_values(lines):
    values = {}
    for line in lines:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        if key:
            values[key] = value.strip().strip("\"'")
    return values


def parse_sections(body):
    sections = []
    current = None
    paragraph_lines = []

    def flush_paragraph():
        if current is None or not paragraph_lines:
            paragraph_lines.clear()
            return

        text = " ".join(line.strip() for line in paragraph_lines if line.strip())
        if text:
            current["paragraphs"].append(
                {
                    "id": f"{current['id']}-p{len(current['paragraphs'])}",
                    "text": text,
                }
            )
        paragraph_lines.clear()

    for raw_line in body.split("\n"):
        line = raw_line.rstrip()

        if line.startswith("## "):
            flush_paragraph()
            section_index = len(sections)
            current = {
                "id": f"section-{section_index}",
                "kicker": f"Section {section_index + 1:02d}",
                "title": line[3:].strip(),
                "metric": "",
                "note": "",
                "paragraphs": [],
            }
            sections.append(current)
            continue

        if current is None:
            continue

        if not line.strip():
            flush_paragraph()
            continue

        if not current["paragraphs"] and not paragraph_lines and ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            if key in META_KEYS:
                current[key] = value.strip()
                continue

        paragraph_lines.append(line)

    flush_paragraph()
    return sections
