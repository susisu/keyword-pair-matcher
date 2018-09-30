# keyword-pair-matcher
Highlights keyword pairs, like [bracket-matcher](https://github.com/atom/bracket-matcher).

This package is not for a specific language, and thus does not provide default configuration of keyword pairs. Please configure them in `config.cson` for each language you like :)

For Shell Script:

``` coffee
".shell.source":
  "keyword-pair-matcher":
    keywordPairs: [
      "if..fi"
      "case..esac"
      "for..done"
      "while..done"
      "until..done"
      "select..done"
    ]
```

For OCaml:

``` coffee
".ocaml.source":
  "keyword-pair-matcher":
    keywordPairs: [
      "begin..end"
      "for..done"
      "while..done"
      "struct..end"
      "sig..end"
      "object..end"
    ]
```
