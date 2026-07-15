// Synthesized from R10: "Never use eslint-disable to suppress linting."
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Disallow eslint-disable directive comments" },
    schema: [],
    messages: { noDisable: "Do not suppress lint with an eslint-disable directive." }
  },
  create(context) {
    const sc = context.sourceCode || context.getSourceCode();
    return {
      "Program:exit"() {
        for (const c of sc.getAllComments()) {
          if (/eslint-disable/.test(c.value)) context.report({ node: c, messageId: "noDisable" });
        }
      }
    };
  }
};
