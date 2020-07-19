"use strict";

module.exports = {
  overrides: [
    {
      files  : ["*.js"],
      extends: [
        "@susisu/eslint-config/preset/es",
      ],
      parserOptions: {
        ecmaVersion: 2019,
        sourceType : "script",
      },
      env: {
        es6 : true,
        node: true,
      },
    },
    {
      files        : ["lib/*.js"],
      parserOptions: {
        sourceType: "module",
      },
      env: {
        browser: true,
      },
      globals: {
        atom: true,
      },
    },
    {
      files        : ["spec/*.js"],
      parserOptions: {
        sourceType: "module",
      },
      env: {
        browser: true,
        jasmine: true,
      },
      globals: {
        atom           : true,
        waitsForPromise: true,
      },
      rules: {
        "max-len": "off",
      },
    },
  ],
};
