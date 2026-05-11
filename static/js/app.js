(function () {
  async function fetchDocument() {
    const response = await fetch("/api/document", { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load document: ${response.status}`);
    return response.json();
  }

  async function fetchTemplate() {
    const response = await fetch("/api/template", { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load template: ${response.status}`);
    return response.text();
  }

  async function fetchPageCss() {
    const response = await fetch("/api/page-css", { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load page CSS: ${response.status}`);
    return response.text();
  }

  window.app = function app() {
    return {
      doc: { title: "", subtitle: "", sections: [] },
      sourceTemplate: "",
      pageCss: "",
      pageCount: 0,
      isRendering: false,
      events: null,

      async init() {
        await this.refresh();
        this.connectEvents();
      },

      async refresh() {
        const [nextDoc, nextTemplate, nextPageCss] = await Promise.all([
          fetchDocument(),
          fetchTemplate(),
          fetchPageCss()
        ]);

        this.doc = nextDoc;
        this.sourceTemplate = nextTemplate;
        this.pageCss = nextPageCss;
        await this.renderPaged();
      },

      connectEvents() {
        if (this.events) this.events.close();

        this.events = new EventSource("/api/events");
        this.events.addEventListener("document", () => {
          this.refresh().catch(error => console.error(error));
        });
      },

      async renderPaged() {
        if (this.isRendering) return;
        this.isRendering = true;

        try {
          this.pageCount = await window.PagedPreview.renderPaged(
            this.sourceTemplate,
            this.doc,
            this.pageCss,
            () => this.$nextTick()
          );
        } finally {
          this.isRendering = false;
        }
      }
    };
  };
})();
