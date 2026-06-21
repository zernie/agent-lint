---------------------------- MODULE AgentWindow ----------------------------
\* The "what we'd GENERATE from a spec" artifact: a TLA+ model of the vigiles
\* agent-runtime active-agent window protocol (src/adapters/claude-code/
\* agent-runtime.ts). This is the model a `vigiles verify --model` command would
\* EMIT from the typed railway/agent specs; here it is hand-written to show the
\* shape and to be runnable under TLC if a user has the toolchain.
\*
\* TLC is NOT installed in the dev environment used to author this
\* (`which tlc` → nothing), so the RUNNABLE evidence is the Node mini-checker
\* (mini-checker.mjs / liveness-checker.mjs) which finds the SAME counterexample.
\* This file documents the spec→TLA+ mapping and is what we'd hand to TLC.
\*
\* To run (if you have the TLA+ tools):
\*   java -jar tla2tools.jar AgentWindow.tla -config AgentWindow.cfg
\*
\* MAPPING from the typed spec to this model:
\*   agent("writer", { tools: ["Read","Write","Edit"] })  ->  Contracts["writer"]
\*   the PreToolUse rail (decidePreToolUse)               ->  Allowed(agent, tool)
\*   PreToolUse(Task)  -> setActiveAgent                  ->  Open action
\*   SubagentStop      -> clearActiveAgent                ->  Stop action
\*   .vigiles/active-agent.json (single slot)             ->  the FLAT 'active' var
\*   the proposed depth-aware fix                         ->  the 'callStack' var

EXTENDS Naturals, Sequences

CONSTANTS Agents,          \* e.g. {"writer", "reader"}
          Tools,           \* e.g. {"Read", "Write", "Bash"}
          MaxDepth         \* nesting bound, e.g. 3

\* Each agent's allowed-tools contract (the compiled `tools:` allowlist).
\* In the generated model this is emitted from each agent() spec. Keyed over the
\* CONSTANT Agents (TLC model values), so we map by name rather than a record
\* literal (record keys are strings; Agents are model values).
Contracts ==
    [ a \in Agents |->
        CASE a = "writer" -> {"Read", "Write", "Edit"}
          [] a = "reader" -> {"Read", "Grep"}
          [] OTHER        -> {} ]

VARIABLES
    active,      \* FLAT model: the single active-agent slot (an Agent or "none")
    callStack,   \* GROUND TRUTH: the real nesting stack (a sequence of Agents)
    lastCall     \* record of the most recent gate decision, for the invariant

vars == << active, callStack, lastCall >>

NoCall == [ tool |-> "none", allowedFlat |-> TRUE, allowedTrue |-> TRUE ]

Init ==
    /\ active = "none"
    /\ callStack = << >>
    /\ lastCall = NoCall

\* decidePreToolUse: a contract permits a tool iff the tool is in the allowlist.
Permits(agent, tool) == tool \in Contracts[agent]

\* Open: PreToolUse(Task) dispatches a subagent. FLAT overwrites the slot; the
\* ground-truth stack pushes. Bounded by MaxDepth.
Open(agent) ==
    /\ Len(callStack) < MaxDepth
    /\ active' = agent
    /\ callStack' = Append(callStack, agent)
    /\ lastCall' = NoCall

\* Stop: SubagentStop. FLAT clears the WHOLE slot (rmSync of the single file);
\* the ground-truth stack pops one frame.
Stop ==
    /\ Len(callStack) > 0
    /\ active' = "none"                         \* the FLAT bug: clears everything
    /\ callStack' = SubSeq(callStack, 1, Len(callStack) - 1)
    /\ lastCall' = NoCall

\* Call: a tool call, gated by BOTH the flat slot and the ground-truth top.
Call(tool) ==
    /\ Len(callStack) > 0
    /\ LET flatAgent  == active
           trueAgent  == callStack[Len(callStack)]
           flatOk     == flatAgent = "none" \/ Permits(flatAgent, tool)
           trueOk     == Permits(trueAgent, tool)
       IN lastCall' = [ tool |-> tool, allowedFlat |-> flatOk, allowedTrue |-> trueOk ]
    /\ UNCHANGED << active, callStack >>

Next ==
    \/ \E a \in Agents : Open(a)
    \/ Stop
    \/ \E t \in Tools : Call(t)

Spec == Init /\ [][Next]_vars

\* ---- The SAFETY invariant the type tier cannot express ----
\* No CONTRACT ESCAPE: the gate must never ALLOW (flat) a call the truly-running
\* subagent FORBIDS. Under nesting the FLAT model violates this; TLC reports the
\* shortest trace (the same one the Node checker prints:
\*   Open(writer); Open(writer); Stop; Call(Bash)).
NoContractEscape ==
    (lastCall.tool # "none") => (lastCall.allowedFlat => lastCall.allowedTrue)

\* ---- The LIVENESS property ----
\* Whenever the stack returns to empty (control back at top level), the FLAT slot
\* must be clear too. (A weak-fairness liveness check; the orphaned-window defect
\* L1 in liveness-checker.mjs.)
NoStaleWindow == (Len(callStack) = 0) => (active = "none")

=============================================================================
