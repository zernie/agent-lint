<!--
  Title must be a Conventional Commit — it drives semantic-release and is
  validated by .github/workflows/pr-title.yml. e.g. "fix(audit): …", "docs: …".

  The body below the auto-managed summary block is yours; pr-describe.yml only
  rewrites its own markers and leaves your prose alone.
-->

## What and why

<!-- What changes, and what problem it solves. A sentence or two is fine. -->

## Safety impact

<!--
  Required. vigiles executes untrusted harness code and, at the eval tier, lets a
  real model choose tool calls — so a change can quietly widen what gets through.

  Answer if this PR touches ANY of:
    - what a hook or compiled guard is allowed to permit (can it now fail open?)
    - what the sandbox confines, or what sandboxAvailable() reports
    - interceptTools / what a model is allowed to actually run
    - whether a read-only path (audit, lint) can now execute something

  Otherwise write: None.
-->

None.

## Checks

- [ ] `npm test` passes locally, or CI is green
- [ ] New behaviour has a test — or there's a note below saying why it doesn't
- [ ] Docs updated if this changes a rule, a CLI surface, or a documented guarantee
