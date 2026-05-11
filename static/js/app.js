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

  window.app = function app() {
    return {
      doc: { title: "", subtitle: "", sections: [] },
      sourceTemplate: "",
      pageCount: 0,
      isRendering: false,
      events: null,

      async init() {
        await this.refresh();
        this.connectEvents();
      },

      async refresh() {
        const [nextDoc, nextTemplate] = await Promise.all([
          fetchDocument(),
          fetchTemplate()
        ]);

        this.doc = nextDoc;
        this.sourceTemplate = nextTemplate;
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
            () => this.$nextTick()
          );
        } finally {
          this.isRendering = false;
        }
      }
    };
  };
})();
