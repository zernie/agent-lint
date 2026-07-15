module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow empty catch blocks: a catch clause must contain at least one statement and must not silently swallow a caught error.",
    },
    schema: [],
    messages: {
      emptyCatch:
        "Empty catch block: a caught error must not be silently swallowed. Add at least one statement to the catch clause.",
    },
  },
  create(context) {
    return {
      CatchClause(node) {
        // node.body is the BlockStatement of the catch clause.
        // Comments are not statements, so a comment-only body still has
        // an empty `body` array and is reported.
        if (node.body && node.body.body.length === 0) {
          context.report({ node: node.body, messageId: "emptyCatch" });
        }
      },
    };
  },
};
