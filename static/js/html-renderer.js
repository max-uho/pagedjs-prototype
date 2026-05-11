(function () {
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderSourceHtml(doc) {
    const e = (value) => escapeHtml(value);
    const sections = doc.sections.map(section => `
      <section class="chapter">
        <p class="mb-3 text-[8pt] font-semibold uppercase tracking-[0.22em] text-slate-400">${e(section.kicker)}</p>
        <h2 class="mb-4 text-[22pt] font-semibold leading-tight tracking-tight">${e(section.title)}</h2>

        ${section.paragraphs.map(paragraph => `
          <p class="mb-4 text-[10.5pt] leading-relaxed text-slate-700">${e(paragraph.text)}</p>
        `).join("")}

        <div class="avoid-break my-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p class="mb-2 text-[8pt] font-semibold uppercase tracking-[0.18em] text-slate-400">JSON value</p>
          <p class="text-[20pt] font-semibold tabular-nums">${e(section.metric)}</p>
          <p class="mt-2 text-[9pt] leading-relaxed text-slate-500">${e(section.note)}</p>
        </div>
      </section>
    `).join("");

    return `
      <header class="running-header text-[9pt] text-slate-500">
        <span>${e(doc.title)}</span>
      </header>

      <section class="mb-10">
        <p class="mb-3 text-[9pt] uppercase tracking-[0.25em] text-slate-400">Live JSON document</p>
        <h1 class="mb-4 text-[30pt] font-semibold leading-none tracking-tight">${e(doc.title)}</h1>
        <p class="text-[12pt] leading-relaxed text-slate-600">${e(doc.subtitle)}</p>
      </section>

      ${sections}
    `;
  }

  window.HtmlRenderer = {
    renderSourceHtml
  };
})();
