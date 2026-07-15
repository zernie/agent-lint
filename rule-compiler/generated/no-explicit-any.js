// Synthesized from R9 (TypeScript): "Do not use the `any` type; use a specific type or `unknown`."
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Disallow the `any` type annotation" },
    schema: [],
    messages: { noAny: "Avoid the `any` type; use a specific type or `unknown`." }
  },
  create(context) {
    return { TSAnyKeyword(node) { context.report({ node, messageId: "noAny" }); } };
  }
};
