(function () {
  async function fetchDocument() {
    const response = await fetch("/api/document", { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load document JSON: ${response.status}`);
    return response.json();
  }

  async function saveDocument(doc) {
    const response = await fetch("/api/document", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(doc)
    });

    if (!response.ok) throw new Error(`Failed to save document JSON: ${response.status}`);
    return response.json();
  }

  function getRevision(doc) {
    const match = String(doc.title || "").match(/Revision\s+(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  window.app = function app() {
    return {
      doc: { title: "", subtitle: "", sections: [] },
      revision: 0,
      sourceReady: false,
      pageCount: 0,
      isRendering: false,
      events: null,

      async init() {
        this.sourceReady = true;
        await this.loadJson();
        this.connectEvents();

        window.demoUpdate = () => this.mutateJson();
        window.demoShuffleTitles = () => this.shuffleTitles();
        window.demoSetJson = (nextDoc) => this.setJson(nextDoc);
        window.demoGetJson = () => JSON.parse(JSON.stringify(this.doc));

        console.log("Ready. Try demoUpdate(), demoShuffleTitles(), demoGetJson(), or demoSetJson({...}).");
      },

      async loadJson() {
        const nextDoc = await fetchDocument();
        this.doc = nextDoc;
        this.revision = getRevision(nextDoc);
        await this.renderPaged();
      },

      connectEvents() {
        if (this.events) this.events.close();

        this.events = new EventSource("/api/events");
        this.events.addEventListener("document", () => {
          this.loadJson().catch(error => console.error(error));
        });
      },

      async renderPaged() {
        if (this.isRendering) return;
        this.isRendering = true;

        try {
          this.pageCount = await window.PagedPreview.renderPaged(
            window.HtmlRenderer.renderSourceHtml,
            this.doc,
            () => this.$nextTick()
          );
        } finally {
          this.isRendering = false;
        }
      },

      async setJson(nextDoc) {
        await saveDocument(nextDoc);
      },

      async mutateJson() {
        this.revision += 1;
        await this.setJson(window.DocumentModel.makeDoc(this.revision));
      },

      async shuffleTitles() {
        await this.setJson(window.DocumentModel.shuffledDoc(this.doc, this.revision));
      }
    };
  };
})();
