"use babel";

import { CompositeDisposable, Point, Range } from "atom";
import { PKGNAME } from "./constants.js";

// generates a function that checks if the given keyword is valid
const generateIsValidKeyword = keywordCharSet => {
  const keywordValidationRegex = new RegExp(`^[${keywordCharSet}]+$`, "u");
  return keyword => keywordValidationRegex.test(keyword);
};

// parses keyword pairs
const parsePairs = (rawPairs, keywordCharSet) => {
  const isValidKeyword = generateIsValidKeyword(keywordCharSet);
  return rawPairs.map(rawPair => rawPair.split("..", 2).map(keyword => keyword.trim()))
    .filter(pair => pair.length === 2 && isValidKeyword(pair[0]) && isValidKeyword(pair[1]));
};
const oldParsePairs = (rawPairs, keywordCharSet) => {
  const isValidKeyword = generateIsValidKeyword(keywordCharSet);
  return rawPairs.map(rawPair => rawPair.split("/", 2).map(keyword => keyword.trim()))
    .filter(pair => pair.length === 2 && isValidKeyword(pair[0]) && isValidKeyword(pair[1]));
};

// escapes regex special characters in the string
const escapeRegexChars = str => str.replace(/([\^$\\.*+?()[\]{}|])/g, "\\$1");

// generates maps from each start (end) keyword to a set of the matching end (start) keywords
// also generates a regex that matches all start and end keywords
const generateMatches = (pairs, keywordCharSet) => {
  const startMatches = new Map();
  const endMatches = new Map();
  const keywords = new Set();
  for (const [start, end] of pairs) {
    // ignore if conflict
    if (start === end || endMatches.has(start) || startMatches.has(end)) {
      continue;
    }
    if (!startMatches.has(start)) {
      startMatches.set(start, new Set());
    }
    if (!endMatches.has(end)) {
      endMatches.set(end, new Set());
    }
    startMatches.get(start).add(end);
    endMatches.get(end).add(start);
    keywords.add(start).add(end);
  }
  const keywordPattern = [...keywords].map(escapeRegexChars).join("|");
  const keywordRegex = new RegExp(`(${keywordPattern})(?![${keywordCharSet}])`, "ug");
  return {
    startMatches,
    endMatches,
    keywordRegex,
  };
};

// generates a regex that matches a keyword at the end of string
const generateLastKeywordRegex = keywordCharSet => new RegExp(`[${keywordCharSet}]*$`, "u");
// generates a regex that matches a keyword character
const generateKeywordCharRegex = keywordCharSet => new RegExp(`[${keywordCharSet}]`, "u");
// generates a regex that matches a non-keyword character
const generateNonKeywordCharRegex = keywordCharSet => new RegExp(`[^${keywordCharSet}]`, "u");

// constants for traversal
const MAX_ROWS = 10000;
const FORWARD_MAX_ROWS = new Point(MAX_ROWS, 0);
const BACKWARD_MAX_ROWS = new Point(-MAX_ROWS, 0);
const BACKWARD_ONE_CHAR = new Point(0, -1);

// checks if the scope is in a commend or a string
const isScopeCommentedOrString = scopesArray => {
  for (const scope of scopesArray.reverse()) {
    const components = scope.split(".");
    if (components.includes("embedded") && components.includes("source")) {
      return false;
    }
    if (components.includes("comment") || components.includes("string")
      || components.includes("symbol")) {
      return true;
    }
  }
  return false;
};

export class Matcher {
  constructor(editor) {
    this.editor = editor;
    this.gutter = editor.gutterWithName("line-number");

    this.keywordCharSet = "";
    this.startMatches = null;
    this.endMatches = null;
    this.keywordRegex = null;
    this.updateMatches([]);

    this.highlighted = false;
    this.startMarker = null;
    this.endMarker = null;

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      editor.getBuffer().onDidChangeText(() => {
        this.update();
      }),
      editor.onDidChangeSelectionRange(() => {
        this.update();
      }),
      editor.onDidAddCursor(() => {
        this.update();
      }),
      editor.onDidRemoveCursor(() => {
        this.update();
      }),
      editor.onDidTokenize(() => {
        this.update();
      }),
      editor.onDidChangeGrammar(() => {
        this.observeConfig();
      }),
      atom.commands.add(this.editor.element, {
        [`${PKGNAME}:go-to-matching-keyword`]: () => {
          this.goToMatchingKeyword();
        },
        [`${PKGNAME}:go-to-enclosing-keyword`]: () => {
          this.goToEnclosingKeyword();
        },
        [`${PKGNAME}:select-inside-pair`]: () => {
          this.selectInsidePair();
        },
      })
    );

    this.configSubscriptions = null;
    this.observeConfig();
  }

  destroy() {
    this.subscriptions.dispose();
    this.configSubscriptions.dispose();
  }

  observeConfig() {
    if (this.configSubscriptions) {
      this.configSubscriptions.dispose();
    }
    this.configSubscriptions = new CompositeDisposable();
    const opts = {
      scope: this.editor.getRootScopeDescriptor(),
    };
    this.configSubscriptions.add(
      atom.config.observe(`${PKGNAME}.keywordCharacterSet`, opts, rawCharSet => {
        this.updateCharSet(rawCharSet);
        this.updateMatches(atom.config.get(`${PKGNAME}.keywordPairs`, opts));
        this.update();
      }),
      atom.config.observe(`${PKGNAME}.keywordPairs`, opts, rawPairs => {
        this.updateMatches(rawPairs);
        this.update();
      })
    );
  }

  updateCharSet(rawCharSet) {
    try {
      RegExp(`[${escapeRegexChars(rawCharSet)}]`);
    } catch (err) {
      atom.notifications.addError("keyword-pair-matcher", {
        dismissable: true,
        detail     : `Error in keyword character set:\n${String(err)}`,
      });
      this.keywordCharSet = "";
      return;
    }
    this.keywordCharSet = escapeRegexChars(rawCharSet);
  }

  updateMatches(rawPairs) {
    let pairs = parsePairs(rawPairs, this.keywordCharSet);
    const usingDeprecatedSyntax = pairs.length === 0
      && rawPairs.length > 0 && rawPairs.every(rawPair => /\//.test(rawPair));
    if (usingDeprecatedSyntax) {
      atom.notifications.addWarning("keyword-pair-matcher", {
        dismissable: true,
        detail     : "Keyword pairs separated by slash (/) are deprecated. Use dots (..) instead.",
      });
      pairs = oldParsePairs(rawPairs, this.keywordCharSet);
    }
    const { startMatches, endMatches, keywordRegex } = generateMatches(pairs, this.keywordCharSet);
    this.startMatches = startMatches;
    this.endMatches = endMatches;
    this.keywordRegex = keywordRegex;
  }

  update() {
    this.reset();
    if (this.editor.isFoldedAtCursorRow()) {
      return;
    }
    const findResult = this.findKeywordUnderCursor();
    if (!findResult) {
      return;
    }
    let start = null;
    let end = null;
    if (this.startMatches.has(findResult.keyword)) {
      start = findResult;
      end = this.findMatchingEndKeyword(findResult);
    } else if (this.endMatches.has(findResult.keyword)) {
      start = this.findMatchingStartKeyword(findResult);
      end = findResult;
    }
    if (!start || !end) {
      return;
    }
    this.highlighted = true;
    this.startMarker = this.createMarker(start.range);
    this.endMarker = this.createMarker(end.range);
  }

  reset() {
    if (this.highlighted) {
      this.editor.destroyMarker(this.startMarker.id);
      this.editor.destroyMarker(this.endMarker.id);
    }
    this.highlighted = false;
    this.startMarker = null;
    this.endMarker = null;
  }

  findKeywordUnderCursor() {
    const pos = this.editor.getCursorBufferPosition();
    if (this.isCommentedOrString(pos)) {
      return null;
    }
    const line = this.editor.lineTextForBufferRow(pos.row);
    if (typeof line !== "string") {
      return null;
    }
    const nextNonKeywordOffset = line.substring(pos.column)
      .search(generateNonKeywordCharRegex(this.keywordCharSet));
    const startIndex = line.substring(0, pos.column)
      .search(generateLastKeywordRegex(this.keywordCharSet));
    const endIndex = nextNonKeywordOffset >= 0 ? pos.column + nextNonKeywordOffset : line.length;
    if (startIndex === endIndex) {
      return null;
    } else {
      return {
        range  : new Range(new Point(pos.row, startIndex), new Point(pos.row, endIndex)),
        keyword: line.substring(startIndex, endIndex),
      };
    }
  }

  findMatchingEndKeyword({ keyword, range }) {
    const keywordCharRegex = generateKeywordCharRegex(this.keywordCharSet);
    const scanRange = new Range(range.end, range.end.traverse(FORWARD_MAX_ROWS));
    const stack = [keyword];
    let result = null;
    this.editor.scanInBufferRange(this.keywordRegex, scanRange, scanResult => {
      const { range, matchText, stop } = scanResult;
      if (this.isCommentedOrString(range.start)) {
        return;
      }
      // return if the match is not a whole keyword
      const prevChar = this.editor.getTextInBufferRange(
        new Range(range.start.traverse(BACKWARD_ONE_CHAR), range.start)
      );
      if (keywordCharRegex.test(prevChar)) {
        return;
      }
      if (this.startMatches.has(matchText)) {
        stack.push(matchText);
      } else if (this.endMatches.has(matchText)) {
        if (this.endMatches.get(matchText).has(stack[stack.length - 1])) {
          stack.pop();
        }
        if (stack.length === 0) {
          result = {
            keyword: matchText,
            range,
          };
          stop();
        }
      }
    });
    return result;
  }

  findMatchingStartKeyword({ keyword, range }) {
    const keywordCharRegex = generateKeywordCharRegex(this.keywordCharSet);
    const scanRange = new Range(range.start.traverse(BACKWARD_MAX_ROWS), range.start);
    const stack = [keyword];
    let result = null;
    this.editor.backwardsScanInBufferRange(this.keywordRegex, scanRange, scanResult => {
      const { range, matchText, stop } = scanResult;
      if (this.isCommentedOrString(range.start)) {
        return;
      }
      // return if the match is not a whole keyword
      const prevChar = this.editor.getTextInBufferRange(
        new Range(range.start.traverse(BACKWARD_ONE_CHAR), range.start)
      );
      if (keywordCharRegex.test(prevChar)) {
        return;
      }
      if (this.endMatches.has(matchText)) {
        stack.push(matchText);
      } else if (this.startMatches.has(matchText)) {
        // ignore end keywords without start keywords
        while (stack.length > 0 && !this.startMatches.get(matchText).has(stack[stack.length - 1])) {
          stack.pop();
        }
        if (stack.length === 0) {
          stop();
          return;
        }
        // assert(this.startMatches.get(matchText).has(stack[stack.length - 1]));
        stack.pop();
        if (stack.length === 0) {
          result = {
            keyword: matchText,
            range,
          };
          stop();
        }
      }
    });
    return result;
  }

  findEnclosingStartKeyword(pos) {
    const keywordCharRegex = generateKeywordCharRegex(this.keywordCharSet);
    const scanRange = new Range(pos.traverse(BACKWARD_MAX_ROWS), pos);
    const stack = [];
    let result = null;
    this.editor.backwardsScanInBufferRange(this.keywordRegex, scanRange, scanResult => {
      const { range, matchText, stop } = scanResult;
      if (this.isCommentedOrString(range.start)) {
        return;
      }
      // return if the match is not a whole keyword
      const prevChar = this.editor.getTextInBufferRange(
        new Range(range.start.traverse(BACKWARD_ONE_CHAR), range.start)
      );
      if (keywordCharRegex.test(prevChar)) {
        return;
      }
      if (this.endMatches.has(matchText)) {
        stack.push(matchText);
      } else if (this.startMatches.has(matchText)) {
        // ignore end keywords without start keywords
        while (stack.length > 0 && !this.startMatches.get(matchText).has(stack[stack.length - 1])) {
          stack.pop();
        }
        if (stack.length === 0) {
          result = {
            keyword: matchText,
            range,
          };
          stop();
          return;
        }
        // assert(this.startMatches.get(matchText).has(stack[stack.length - 1]));
        stack.pop();
      }
    });
    return result;
  }

  createMarker(range) {
    const marker = this.editor.markBufferRange(range);
    this.editor.decorateMarker(marker, {
      type : "highlight",
      class: PKGNAME,
    });
    const opts = {
      scope: this.editor.getRootScopeDescriptor(),
    };
    if (atom.config.get(`${PKGNAME}.highlightMatchingLineNumber`, opts) && this.gutter) {
      this.gutter.decorateMarker(marker, {
        type : "highlight",
        class: PKGNAME,
      });
    }
    return marker;
  }

  isCommentedOrString(pos) {
    return isScopeCommentedOrString(
      this.editor.scopeDescriptorForBufferPosition(pos).getScopesArray()
    );
  }

  goToMatchingKeyword() {
    if (!this.highlighted) {
      this.goToEnclosingKeyword();
      return;
    }
    const pos = this.editor.getCursorBufferPosition();
    const startRange = this.startMarker.getBufferRange();
    const endRange = this.endMarker.getBufferRange();
    if (startRange.start.isLessThanOrEqual(pos) && startRange.end.isGreaterThanOrEqual(pos)) {
      this.editor.setCursorBufferPosition(endRange.start);
    } else if (endRange.start.isLessThanOrEqual(pos) && endRange.end.isGreaterThanOrEqual(pos)) {
      this.editor.setCursorBufferPosition(startRange.start);
    }
  }

  goToEnclosingKeyword() {
    const pos = this.editor.getCursorBufferPosition();
    const start = this.findEnclosingStartKeyword(pos);
    if (start) {
      this.editor.setCursorBufferPosition(start.range.start);
    }
  }

  selectInsidePair() {
    const pos = this.editor.getCursorBufferPosition();
    let startRange = null;
    let endRange = null;
    if (this.highlighted) {
      startRange = this.startMarker.getBufferRange();
      endRange = this.endMarker.getBufferRange();
    } else {
      const start = this.findEnclosingStartKeyword(pos);
      const end = start ? this.findMatchingEndKeyword(start) : null;
      if (start && end) {
        startRange = start.range;
        endRange = end.range;
      }
    }
    if (startRange && endRange) {
      this.editor.setSelectedBufferRange(new Range(startRange.end, endRange.start));
    }
  }
}
