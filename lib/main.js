"use babel";

import { CompositeDisposable } from "atom";
import { Matcher } from "./matcher.js";

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
      this.editors.set(editor, new Matcher(editor));
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
    for (const matcher of this.editors.values()) {
      matcher.destroy();
    }
    this.editors.clear();
  }

  serialize() {
  }
}

module.exports = new KeywordPairMatcher();
