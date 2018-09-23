"use babel";

import { Point, Range } from "atom";
import { PKGNAME } from "../lib/constants.js";

function prepareEditor(name, text) {
  return atom.workspace.open(name)
    .then(editor => {
      editor.setText(text);
      return editor;
    });
}

describe("keyword-pair-matcher", () => {
  beforeEach(() => {
    waitsForPromise(() => atom.packages.activatePackage("keyword-pair-matcher"));
    atom.config.set(`${PKGNAME}.keywordPairs`, ["begin/end", "def/end", "do/done"]);
    atom.config.set(`${PKGNAME}.highlightMatchingLineNumber`, false);
  });

  describe("go-to-matching-keyword", () => {
    it("should move the cursor to the keyword that matches the one under the cursor", () => {
      const text = [
        "def",
        "  foo",
        "  do",
        "    begin",
        "      bar",
        "    end",
        "    baz",
        "  done",
        "end"
      ].join("\n");
      waitsForPromise(() => prepareEditor("test", text).then(editor => {
        editor.setCursorBufferPosition(new Point(0, 0));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-matching-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(8, 0));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-matching-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(0, 0));
      }));
    });

    it("should move the cursor to the enclosing keyword if no keyword under the cursor", () => {
      const text = [
        "def",
        "  foo",
        "end"
      ].join("\n");
      waitsForPromise(() => prepareEditor("test", text).then(editor => {
        editor.setCursorBufferPosition(new Point(1, 2));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-matching-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(0, 0));
      }));
    });

    it("should ignore end keywords without start keywords", () => {
      const text = [
        "def",
        "  done",
        "end"
      ].join("\n");
      waitsForPromise(() => prepareEditor("test", text).then(editor => {
        editor.setCursorBufferPosition(new Point(0, 0));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-matching-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(2, 0));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-matching-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(0, 0));
      }));
    });
  });

  describe("go-to-enclosing-keyword", () => {
    it("should move the cursor to the enclosing keyword", () => {
      const text = [
        "def",
        "  foo",
        "end"
      ].join("\n");
      waitsForPromise(() => prepareEditor("test", text).then(editor => {
        editor.setCursorBufferPosition(new Point(1, 2));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-enclosing-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(0, 0));
      }));
    });

    it("should go up if there is a keyword under the cursor", () => {
      const text = [
        "def",
        "  do",
        "    foo",
        "  done",
        "end"
      ].join("\n");
      waitsForPromise(() => prepareEditor("test", text).then(editor => {
        editor.setCursorBufferPosition(new Point(3, 2));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-enclosing-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(1, 2));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:go-to-enclosing-keyword`);
        expect(editor.getCursorBufferPosition()).toEqual(new Point(0, 0));
      }));
    });
  });

  describe("select-inside-pair", () => {
    it("should select the text inside the enclosing keyword pair", () => {
      const text = [
        "def",
        "  foo",
        "  do",
        "    begin",
        "      bar",
        "    end",
        "    baz",
        "  done",
        "end"
      ].join("\n");
      waitsForPromise(() => prepareEditor("test", text).then(editor => {
        editor.setCursorBufferPosition(new Point(0, 0));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:select-inside-pair`);
        expect(editor.getSelectedBufferRange()).toEqual(new Range(
          new Point(0, 3),
          new Point(8, 0)
        ));
        editor.setCursorBufferPosition(new Point(4, 6));
        atom.commands.dispatch(editor.getElement(), `${PKGNAME}:select-inside-pair`);
        expect(editor.getSelectedBufferRange()).toEqual(new Range(
          new Point(3, 9),
          new Point(5, 4)
        ));
      }));
    });
  });
});
