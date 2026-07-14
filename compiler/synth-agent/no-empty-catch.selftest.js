module.exports = {
  name: "no-empty-catch",
  rule: require("./no-empty-catch.rule"),
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  valid: [
    // catch with a real statement
    "try { doThing(); } catch (e) { console.error(e); }",
    // catch that re-throws
    "try { doThing(); } catch (e) { throw e; }",
    // optional-catch-binding but with a statement
    "try { doThing(); } catch { handleError(); }",
    // nested try/catch, both non-empty
    "try { a(); } catch (e) { try { b(); } catch (e2) { log(e2); } }",
  ],
  invalid: [
    // truly empty catch with binding
    {
      code: "try { doThing(); } catch (e) {}",
      errors: [{ messageId: "emptyCatch" }],
    },
    // truly empty catch without binding (optional catch binding)
    {
      code: "try { doThing(); } catch {}",
      errors: [{ messageId: "emptyCatch" }],
    },
    // comment-only body counts as empty (no statement)
    {
      code: "try { doThing(); } catch (e) { /* ignore */ }",
      errors: [{ messageId: "emptyCatch" }],
    },
  ],
};
