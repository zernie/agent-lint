// Synthesized from R4: "All exported functions must be prefixed with 'mk'."
module.exports = {
  meta: {
    type: "suggestion",
    docs: { description: "Require exported function declarations to be prefixed with 'mk'" },
    schema: [],
    messages: { prefix: "Exported function '{{name}}' must be prefixed with 'mk'." }
  },
  create(context) {
    function isMk(name) { return /^mk[A-Z0-9_]/.test(name); }
    return {
      ExportNamedDeclaration(node) {
        const d = node.declaration;
        if (d && d.type === "FunctionDeclaration" && d.id && !isMk(d.id.name)) {
          context.report({ node: d.id, messageId: "prefix", data: { name: d.id.name } });
        }
      }
    };
  }
};
