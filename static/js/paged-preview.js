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
    const css = node.textContent || "";
    return css.includes("--pagedjs-") || css.trim() === "";
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
