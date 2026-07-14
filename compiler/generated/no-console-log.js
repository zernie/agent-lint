// Synthesized from R1: "Never use console.log; use the project logger."
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Disallow console.log; use the project logger" },
    schema: [],
    messages: { noConsoleLog: "Use the project logger instead of console.log." }
  },
  create(context) {
    return {
      "CallExpression[callee.object.name='console'][callee.property.name='log']"(node) {
        context.report({ node, messageId: "noConsoleLog" });
      }
    };
  }
};
