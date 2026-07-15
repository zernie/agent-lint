// Synthesized from R3: "Do not import from the deprecated design system (@acme/legacy-ui)."
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Disallow imports from a deprecated module" },
    schema: [{ type: "object", properties: { module: { type: "string" } }, additionalProperties: false }],
    messages: { deprecated: "Import from '{{module}}' is deprecated; use the new design system." }
  },
  create(context) {
    const banned = (context.options[0] && context.options[0].module) || "@acme/legacy-ui";
    return {
      ImportDeclaration(node) {
        if (node.source.value === banned) context.report({ node, messageId: "deprecated", data: { module: banned } });
      }
    };
  }
};
