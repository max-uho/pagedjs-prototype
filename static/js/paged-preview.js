(function () {
  function getScrollAnchor() {
    const pages = [...document.querySelectorAll("#preview .pagedjs_page")];
    if (!pages.length) return { number: 1, offset: 0 };

    const viewportAnchor = window.scrollY + 96;
    let current = pages[0];
    let currentIndex = 0;

    pages.forEach((page, index) => {
      const top = window.scrollY + page.getBoundingClientRect().top;
      if (top <= viewportAnchor) {
        current = page;
        currentIndex = index;
      }
    });

    const pageTop = window.scrollY + current.getBoundingClientRect().top;
    return {
      number: currentIndex + 1,
      offset: viewportAnchor - pageTop
    };
  }

  function restoreScrollAnchor(anchor) {
    requestAnimationFrame(() => {
      const page = document.querySelector(`#preview .pagedjs_page:nth-child(${anchor.number})`);
      if (!page) return;

      const pageTop = window.scrollY + page.getBoundingClientRect().top;
      const target = pageTop + anchor.offset - 96;
      window.scrollTo({ top: Math.max(0, target), behavior: "instant" });
    });
  }

  async function renderPaged(renderSourceHtml, doc, nextTick) {
    const anchor = getScrollAnchor();
    const source = document.querySelector("#source");
    const preview = document.querySelector("#preview");

    source.innerHTML = renderSourceHtml(doc);
    await nextTick();

    const nextPreview = document.createElement("section");
    nextPreview.className = "preview-render-target";
    document.body.appendChild(nextPreview);

    try {
      const previewer = new Paged.Previewer();
      const flow = await previewer.preview(source.innerHTML, [], nextPreview);

      preview.replaceChildren(...Array.from(nextPreview.childNodes));
      restoreScrollAnchor({
        number: Math.min(anchor.number, flow.total),
        offset: anchor.offset
      });

      return flow.total;
    } finally {
      nextPreview.remove();
    }
  }

  window.PagedPreview = {
    renderPaged
  };
})();
