// Synthesized from R5 (INTENTIONALLY NAIVE): only flags a string literal assigned to
// an identifier named exactly "password". Misses apiKey/token/member-expr assignments.
// This is here to demonstrate the abstain gate catching an unsound synthesis.
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Disallow hardcoded secrets (naive synthesis)" },
    schema: [],
    messages: { secret: "Hardcoded secret assigned to '{{name}}'." }
  },
  create(context) {
    return {
      "VariableDeclarator[id.name='password'][init.type='Literal']"(node) {
        if (typeof node.init.value === "string" && node.init.value.length > 0) {
          context.report({ node, messageId: "secret", data: { name: node.id.name } });
        }
      }
    };
  }
};
