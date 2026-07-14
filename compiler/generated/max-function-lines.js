// Synthesized from R2: "Keep functions under 40 lines."
module.exports = {
  meta: {
    type: "suggestion",
    docs: { description: "Enforce a maximum function length in lines" },
    schema: [{ type: "integer", minimum: 1 }],
    messages: { tooLong: "Function spans {{lines}} lines; keep functions <= {{max}} lines." }
  },
  create(context) {
    const max = context.options[0] != null ? context.options[0] : 40;
    function check(node) {
      const lines = node.loc.end.line - node.loc.start.line + 1;
      if (lines > max) context.report({ node, messageId: "tooLong", data: { lines, max } });
    }
    return { FunctionDeclaration: check, FunctionExpression: check, ArrowFunctionExpression: check };
  }
};
