const ts = require('typescript');

module.exports = {
  process(src) {
    return {
      code: ts.transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  },
};
