# RuboCop — Reference

Shared linter reference for vigiles skills. Used by `strengthen` (find existing rules) and `pr-to-lint-rule` (write custom cops).

## Check Existing Gems First

Before writing a custom cop, search these gems — the pattern may already be covered:

| Gem                   | Scope                                  | Key cops to know                                                                                                                   |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `rubocop` (core)      | Style, Lint, Metrics, Naming, Security | `Style/FrozenStringLiteralComment`, `Lint/UnusedMethodArgument`, `Metrics/MethodLength`, `Naming/MethodName`, `Security/Eval`      |
| `rubocop-rails`       | Rails conventions                      | `Rails/HttpPositionalArguments`, `Rails/SkipsModelValidations`, `Rails/Output`, `Rails/HasAndBelongsToMany`, `Rails/DynamicFindBy` |
| `rubocop-rspec`       | RSpec test patterns                    | `RSpec/ExampleLength`, `RSpec/MultipleExpectations`, `RSpec/NestedGroups`, `RSpec/LetSetup`, `RSpec/MessageSpies`                  |
| `rubocop-minitest`    | Minitest patterns                      | `Minitest/AssertEmptyLiteral`, `Minitest/RefuteNil`, `Minitest/AssertInDelta`                                                      |
| `rubocop-performance` | Performance anti-patterns              | `Performance/StringReplacement`, `Performance/Detect`, `Performance/Count`, `Performance/FlatMap`, `Performance/CaseWhenSplat`     |
| `rubocop-rake`        | Rakefile patterns                      | `Rake/Desc`, `Rake/DuplicateTask`, `Rake/MethodDefinitionInTask`                                                                   |
| `rubocop-sorbet`      | Sorbet type checking                   | `Sorbet/ForbidSuperclassConstLiteral`, `Sorbet/ValidSigil`, `Sorbet/SignatureBuildOrder`                                           |
| `rubocop-graphql`     | GraphQL conventions                    | `GraphQL/FieldDescription`, `GraphQL/ObjectDescription`, `GraphQL/ArgumentDescription`                                             |
| `rubocop-factory_bot` | FactoryBot patterns                    | `FactoryBot/ConsistentParenthesesStyle`, `FactoryBot/CreateList`, `FactoryBot/SyntaxMethods`                                       |
| `rubocop-capybara`    | Capybara test patterns                 | `Capybara/CurrentPathExpectation`, `Capybara/VisibilityMatcher`, `Capybara/SpecificMatcher`                                        |

**Tip:** Many patterns can be handled by configuring existing cops rather than writing new ones. Check if an existing cop has configurable `AllowedMethods`, `AllowedPatterns`, or `Include`/`Exclude` options first.

## Cop Anatomy

Every RuboCop cop inherits from `RuboCop::Cop::Base`:

```ruby
# frozen_string_literal: true

module RuboCop
  module Cop
    module Custom
      # Disallow direct database queries outside the repository layer.
      #
      # @example
      #   # bad
      #   User.where(active: true)
      #
      #   # good
      #   UserRepository.active_users
      class NoDirectDbQuery < Base
        MSG = 'Use the repository pattern — call `%<model>sRepository` instead of `%<model>s.%<method>s`.'

        RESTRICT_ON_SEND = %i[where find find_by first last all count pluck].freeze

        # @!method ar_model_query?(node)
        def_node_matcher :ar_model_query?, <<~PATTERN
          (send (const nil? _) {:where :find :find_by :first :last :all :count :pluck} ...)
        PATTERN

        def on_send(node)
          return unless ar_model_query?(node)

          model = node.receiver.short_name
          add_offense(node, message: format(MSG, model: model, method: node.method_name))
        end
      end
    end
  end
end
```

### Key concepts

| Concept            | Purpose                                       | Notes                                                               |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------- |
| `MSG`              | Error message string                          | Use `format` with `%<name>s` for interpolation                      |
| `RESTRICT_ON_SEND` | Whitelist of method names                     | Performance optimization — cop only runs on matching `send` nodes   |
| `def_node_matcher` | AST pattern matcher                           | DSL for matching Ruby AST patterns — replaces manual node traversal |
| `def_node_search`  | Like `def_node_matcher` but finds all matches | Returns an enumerator of matching nodes                             |
| `add_offense`      | Report a violation                            | Accepts `node`, optional `message:` and `severity:`                 |

### Cop departments

| Department | When to use                                           |
| ---------- | ----------------------------------------------------- |
| `Lint`     | Code that is/will be broken                           |
| `Style`    | Code that works but violates a convention             |
| `Metrics`  | Complexity thresholds (method length, ABC size, etc.) |
| `Naming`   | Naming conventions                                    |
| `Security` | Security anti-patterns                                |
| `Custom`   | Your project-specific cops                            |

## Node Pattern DSL — Cheat Sheet

RuboCop's node pattern DSL is the primary way to match AST nodes:

| You want to detect    | Pattern                             | Notes                                         |
| --------------------- | ----------------------------------- | --------------------------------------------- |
| Method call `foo`     | `(send nil? :foo ...)`              | `nil?` = no receiver                          |
| Method call `obj.foo` | `(send _ :foo ...)`                 | `_` = any receiver                            |
| Method call `Foo.bar` | `(send (const nil? :Foo) :bar ...)` | Constant receiver                             |
| String literal `"x"`  | `(str "x")`                         |                                               |
| Symbol `:x`           | `(sym :x)`                          |                                               |
| Block `foo { }`       | `(block (send nil? :foo) ...)`      |                                               |
| Class definition      | `(class (const nil? :Name) ...)`    |                                               |
| `if` conditional      | `(if _ _ _)`                        | Three children: condition, if-body, else-body |
| Instance variable     | `(ivar :@name)`                     |                                               |
| Constant assignment   | `(casgn nil? :NAME _)`              |                                               |
| `require "x"`         | `(send nil? :require (str "x"))`    |                                               |

**Wildcards and captures:**

- `_` — matches any single node
- `...` — matches any number of nodes (rest)
- `$_` — capture a node into a variable
- `nil?` — matches nil (no receiver for top-level calls)
- `{:foo :bar}` — matches either `:foo` or `:bar`
- `(send _ {:puts :print :p} ...)` — matches puts/print/p on any receiver

**Pro tip:** Run `ruby-parse -e 'your_code_here'` to see the AST for any Ruby expression. The `parser` gem must be installed.

## Auto-Correct

### `extend AutoCorrector` — opt-in auto-fix

```ruby
class NoDirectDbQuery < Base
  extend AutoCorrector

  def on_send(node)
    return unless ar_model_query?(node)

    add_offense(node) do |corrector|
      model = node.receiver.short_name
      corrector.replace(node, "#{model}Repository.#{node.method_name}")
    end
  end
end
```

Available corrector methods:

| Method                                | What it does                     |
| ------------------------------------- | -------------------------------- |
| `corrector.replace(node, text)`       | Replace node with text           |
| `corrector.insert_before(node, text)` | Insert text before node          |
| `corrector.insert_after(node, text)`  | Insert text after node           |
| `corrector.remove(node)`              | Remove node                      |
| `corrector.wrap(node, before, after)` | Wrap node with before/after text |

Safety rules for auto-correct:

- **Mark unsafe corrections** with `def autocorrect_enabled? = false` or use the cop's `Safe` / `SafeAutoCorrect` metadata in `.rubocop.yml`
- **Never change runtime behavior.** If the fix might break code, don't auto-correct.
- RuboCop runs `rubocop -a` (safe only) vs `rubocop -A` (all including unsafe). Default to safe.

## Testing Cops

```ruby
# frozen_string_literal: true

require "rubocop"
require "rubocop/rspec/expect_offense"

RSpec.describe RuboCop::Cop::Custom::NoDirectDbQuery, :config do
  # Tests that valid code produces no offenses
  it "accepts repository pattern calls" do
    expect_no_offenses(<<~RUBY)
      UserRepository.active_users
    RUBY
  end

  # Tests that invalid code produces the right offense
  it "registers offense for direct AR query" do
    expect_offense(<<~RUBY)
      User.where(active: true)
      ^^^^^^^^^^^^^^^^^^^^^^^^ Use the repository pattern — call `UserRepository` instead of `User.where`.
    RUBY
  end

  # Tests auto-correction
  it "auto-corrects to repository call" do
    expect_offense(<<~RUBY)
      User.find(1)
      ^^^^^^^^^^^^ Use the repository pattern — call `UserRepository` instead of `User.find`.
    RUBY

    expect_correction(<<~RUBY)
      UserRepository.find(1)
    RUBY
  end
end
```

**Testing best practices:**

1. **Use `expect_offense` with caret markers.** The carets (`^`) must align with the exact offense location.
2. **Test edge cases.** Dynamic receivers, safe navigation (`&.`), chained methods, blocks.
3. **Test configuration.** If your cop respects `AllowedMethods`, test with and without the config.
4. **Use `:config` shared context** to get a default configuration object.

## Registration

### In `.rubocop.yml`

```yaml
require:
  - ./lib/rubocop/cop/custom/no_direct_db_query

Custom/NoDirectDbQuery:
  Enabled: true
  Include:
    - "app/**/*.rb"
  Exclude:
    - "app/repositories/**/*.rb"
```

### vigiles enforce() reference

```typescript
enforce(
  "rubocop/Custom/NoDirectDbQuery",
  "Use repository pattern for all DB queries.",
);
```

vigiles checks `rubocop --show-cops Custom/NoDirectDbQuery` and verifies `Enabled: true`.

## Edge Cases and Gotchas

### Safe vs unsafe cops

RuboCop distinguishes `Safe: true` (default) from `Safe: false`. Unsafe cops can produce false positives. When writing a custom cop that can't guarantee correctness (e.g., it doesn't understand metaprogramming), set:

```yaml
Custom/MyCop:
  Safe: false
  SafeAutoCorrect: false
```

### Metaprogramming blind spots

RuboCop's AST parser doesn't understand:

- `method_missing` / `respond_to_missing?`
- `define_method` with dynamic names
- `send` / `public_send` with variable method names
- ActiveRecord dynamic finders (`find_by_name` generated at runtime)

If your convention targets code that's often generated via metaprogramming, expect false negatives.

### Node matcher vs manual traversal

Use `def_node_matcher` for simple patterns. Switch to manual `node.children`, `node.each_descendant`, etc. when you need:

- Cross-method analysis (e.g., "if method A exists, method B must also exist")
- State tracking across the file (e.g., counting total occurrences)
- Complex conditional logic that the pattern DSL can't express

### Performance

- Always use `RESTRICT_ON_SEND` when targeting method calls — it skips the cop entirely for non-matching methods.
- Avoid `on_send` without `RESTRICT_ON_SEND` on large codebases — it fires for every method call.
- `def_node_search` iterates descendants and can be slow on deeply nested ASTs. Prefer `def_node_matcher` on specific node types.

### Monorepo considerations

- RuboCop resolves `.rubocop.yml` from the file being linted, walking up directories. Each sub-project can have its own config.
- vigiles checks `rubocop --show-cops <CopName>` from the project `basePath`. In a monorepo, run from each gem/app root.
- Custom cops must be `require`-able from the config file's location. Use relative paths or bundle them in a gem.

## Mapping PR Feedback to Cop Strategy

| PR comment pattern                         | Best approach                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| "Don't call X directly"                    | Check if an existing cop covers it; otherwise custom cop with `RESTRICT_ON_SEND` |
| "Use our wrapper for Y"                    | Custom cop — detect raw calls, suggest wrapper                                   |
| "Method too long"                          | `Metrics/MethodLength` — configure `Max:` threshold                              |
| "Missing frozen_string_literal"            | `Style/FrozenStringLiteralComment` — already exists                              |
| "Don't use `puts` in production"           | Custom cop or `Rails/Output` if using Rails                                      |
| "Always add description to GraphQL fields" | `rubocop-graphql` `GraphQL/FieldDescription`                                     |
| "Test files too complex"                   | `RSpec/ExampleLength`, `RSpec/NestedGroups` — configure thresholds               |
| "Naming convention violated"               | `Naming/*` cops — highly configurable                                            |
| "Security issue: eval"                     | `Security/Eval` — already exists                                                 |
| "Don't skip validations"                   | `Rails/SkipsModelValidations` — already exists                                   |
