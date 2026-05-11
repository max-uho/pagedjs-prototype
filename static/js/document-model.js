(function () {
  function makeParagraph(sectionIndex, paragraphIndex, revision = 0) {
    const sentences = [
      `This paragraph belongs to section ${sectionIndex + 1} and is generated from the JSON document model.`,
      "It is intentionally verbose so that Paged.js has enough content to fragment into many pages.",
      "The template is Alpine-driven, but the pagination output is produced by Paged.js.",
      `Revision ${revision} changes the text without replacing the whole application shell.`,
      "Stable page restoration is handled by measuring the page closest to the viewport center before the update."
    ];

    return {
      id: `s${sectionIndex}-p${paragraphIndex}`,
      text: sentences.join(" ")
    };
  }

  function makeDoc(revision = 0) {
    return {
      title: `JSON → Alpine → Paged.js — Revision ${revision}`,
      subtitle: "A tiny single-file prototype using CDN dependencies. The document is deliberately long enough to create at least twenty pages.",
      sections: Array.from({ length: 24 }, (_, sectionIndex) => ({
        id: `section-${sectionIndex}`,
        kicker: `Section ${String(sectionIndex + 1).padStart(2, "0")}`,
        title: `A paginated section generated from JSON ${revision ? `#${revision}` : ""}`,
        metric: `${80 + sectionIndex + revision}%`,
        note: "This card uses break-inside: avoid, so it should move as a single block when possible.",
        paragraphs: Array.from({ length: 5 }, (_, paragraphIndex) => makeParagraph(sectionIndex, paragraphIndex, revision))
      }))
    };
  }

  function shuffledDoc(doc, revision) {
    const words = ["fragments", "blocks", "pages", "flows", "anchors", "templates"];
    const next = JSON.parse(JSON.stringify(doc));

    next.sections = next.sections.map((section, index) => ({
      ...section,
      title: `${section.title} · ${words[(index + revision) % words.length]}`,
      metric: `${Math.round(60 + Math.random() * 40)}%`
    }));

    return next;
  }

  window.DocumentModel = {
    makeDoc,
    shuffledDoc
  };
})();
