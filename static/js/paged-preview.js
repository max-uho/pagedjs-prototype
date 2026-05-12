(function () {
  function getScrollAnchor() {
    const pages = [...document.querySelectorAll("#preview .pagedjs_page")];
    if (!pages.length) return { number: 1, offset: 0 };

    const viewportAnchor = 96;
    let current = pages[0];
    let currentIndex = 0;

    pages.forEach((page, index) => {
      const top = page.getBoundingClientRect().top;
      if (top <= viewportAnchor) {
        current = page;
        currentIndex = index;
      }
    });

    return {
      number: currentIndex + 1,
      offset: viewportAnchor - current.getBoundingClientRect().top
    };
  }

  function restoreScrollAnchor(anchor) {
    const restore = () => {
      const page = document.querySelector(`#preview .pagedjs_page:nth-child(${anchor.number})`);
      if (!page) return;

      const pageTop = window.scrollY + page.getBoundingClientRect().top;
      const target = pageTop + anchor.offset - 96;
      window.scrollTo({ top: Math.max(0, target), behavior: "auto" });
    };

    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
  }

  function collectRuntimeCss() {
    return [...document.querySelectorAll("style")]
      .map(node => node.textContent || "")
      .filter(css => css.includes("--tw-") && !css.includes("--pagedjs-"))
      .join("\n");
  }

  function createPagedStylesheetUrl(pageCss) {
    const css = `${collectRuntimeCss()}\n${pageCss}`;
    return URL.createObjectURL(new Blob([css], { type: "text/css" }));
  }

  function isPagedGeneratedStyle(node) {
    if (node.id === "print-preview-overrides") return false;
    const css = node.textContent || "";
    return css.includes("--pagedjs-") || css.trim() === "";
  }

  function parsePageSize(pageCss) {
    const match = pageCss.match(/@page[\s\S]*?size\s*:\s*([^;}{]+)[;}]?/i);
    const raw = match ? match[1].trim().replace(/\s+/g, " ") : "A5";
    const parts = raw.split(" ");
    const namedSizes = {
      a5: { width: "148mm", height: "210mm" },
      a4: { width: "210mm", height: "297mm" },
      letter: { width: "8.5in", height: "11in" }
    };

    if (parts.length >= 2 && /^\d/.test(parts[0]) && /^\d/.test(parts[1])) {
      return { css: `${parts[0]} ${parts[1]}`, width: parts[0], height: parts[1] };
    }

    const key = parts[0].toLowerCase();
    const base = namedSizes[key] || namedSizes.a5;
    const landscape = parts.includes("landscape");
    return {
      css: raw,
      width: landscape ? base.height : base.width,
      height: landscape ? base.width : base.height
    };
  }

  function ensurePrintOverride(pageCss) {
    const size = parsePageSize(pageCss);
    let style = document.querySelector("#print-preview-overrides");

    if (!style) {
      style = document.createElement("style");
      style.id = "print-preview-overrides";
      document.head.appendChild(style);
    }

    style.textContent = `
@media print {
  @page {
    size: ${size.css};
    margin: 0;
  }

  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    width: ${size.width} !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
  }

  body > *:not(#preview),
  #source {
    display: none !important;
  }

  #preview {
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }

  #preview .pagedjs_pages {
    display: block !important;
    width: ${size.width} !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    overflow: visible !important;
  }

  #preview .pagedjs_pages .pagedjs_page {
    display: block !important;
    width: ${size.width} !important;
    height: ${size.height} !important;
    min-height: ${size.height} !important;
    max-height: ${size.height} !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    outline: none !important;
    transform: none !important;
    zoom: 1 !important;
    break-after: page;
    page-break-after: always;
  }

  #preview .pagedjs_pages .pagedjs_page:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  #preview .pagedjs_sheet {
    width: ${size.width} !important;
    height: ${size.height} !important;
    min-height: ${size.height} !important;
    max-height: ${size.height} !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  #preview .pagedjs_pagebox {
    box-shadow: none !important;
    outline: none !important;
  }

  #preview .pagedjs_bleed,
  #preview .pagedjs_marks {
    display: none !important;
  }
}`;
  }

  function removeStalePagedStyles(keepStyles) {
    document.querySelectorAll("style").forEach(node => {
      if (isPagedGeneratedStyle(node) && !keepStyles.has(node)) {
        node.remove();
      }
    });
  }

  function cleanupStalePagedStylesAfterPaint(keepStyles) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => removeStalePagedStyles(keepStyles));
    });
  }

  function plainHtmlFromSource(source) {
    const clone = source.cloneNode(true);

    clone.querySelectorAll("template[x-for]").forEach(node => node.remove());
    clone.querySelectorAll("*").forEach(node => {
      [...node.attributes].forEach(attribute => {
        if (
          attribute.name.startsWith("x-") ||
          attribute.name.startsWith("@") ||
          attribute.name.startsWith(":")
        ) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    return clone.innerHTML;
  }

  async function renderPaged(sourceTemplate, doc, pageCss, nextTick) {
    const anchor = getScrollAnchor();
    const source = document.querySelector("#source");
    const preview = document.querySelector("#preview");

    if (window.Alpine && typeof window.Alpine.destroyTree === "function") {
      window.Alpine.destroyTree(source);
    }

    window.__pagedPreviewDoc = doc;
    source.setAttribute("x-data", "{ doc: window.__pagedPreviewDoc }");
    source.innerHTML = sourceTemplate;

    if (window.Alpine && typeof window.Alpine.initTree === "function") {
      window.Alpine.initTree(source);
    }

    await nextTick();

    const nextPreview = document.createElement("section");
    nextPreview.className = "preview-render-target";
    nextPreview.setAttribute("x-ignore", "");
    document.body.appendChild(nextPreview);

    const existingStyles = new Set(document.querySelectorAll("style"));
    const pagedStylesheetUrl = createPagedStylesheetUrl(pageCss);
    try {
      const previewer = new Paged.Previewer();
      const flow = await previewer.preview(
        plainHtmlFromSource(source),
        [pagedStylesheetUrl],
        nextPreview
      );
      const newStyles = new Set(
        [...document.querySelectorAll("style")].filter(node => !existingStyles.has(node))
      );

      preview.replaceChildren(...Array.from(nextPreview.childNodes));
      ensurePrintOverride(pageCss);
      cleanupStalePagedStylesAfterPaint(newStyles);
      restoreScrollAnchor({
        number: Math.min(anchor.number, flow.total),
        offset: anchor.offset
      });

      await nextTick();

      return flow.total;
    } finally {
      URL.revokeObjectURL(pagedStylesheetUrl);
      nextPreview.remove();
    }
  }

  window.PagedPreview = {
    renderPaged
  };
})();
