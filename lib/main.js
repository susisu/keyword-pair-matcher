"use babel";

import { CompositeDisposable } from "atom";
import { EditorController } from "./editor-controller.js";

class KeywordPairMatcher {
  constructor() {
    this.editors = new Map();
    this.subscriptions = new CompositeDisposable();
  }

  activate() {
    this.subscriptions.add(atom.workspace.observeTextEditors(editor => {
      if (this.editors.has(editor)) {
        return;
      }
      this.editors.set(editor, new EditorController(editor));
      editor.onDidDestroy(() => {
        if (this.editors.has(editor)) {
          this.editors.get(editor).destroy();
          this.editors.delete(editor);
        }
      });
    }));
  }

  deactivate() {
    this.subscriptions.dispose();
    for (const ctrl of this.editors.values()) {
      ctrl.destroy();
    }
    this.editors.clear();
  }

  serialize() {
  }
}

module.exports = new KeywordPairMatcher();
