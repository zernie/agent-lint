------------------------- MODULE AgentWindowStack -------------------------
\* The PROPOSED FIX modelled: a depth-aware STACK instead of the single flat
\* active-agent.json slot. Same events, same contracts, same invariant — but the
\* gate reads the STACK TOP, so Stop pops back to the parent instead of clearing
\* everything. TLC should report NoContractEscape HOLDS (no error).
\*
\* This is the "verify the fix before we ship it" half: the mini-checker AND TLC
\* both find the flat bug; this module shows the stack model passes the SAME
\* invariant over the SAME interleavings — the value of generate-and-check is that
\* you can certify the fix, not just find the bug.
\*
\* Run:
\*   java -jar tla2tools.jar AgentWindowStack.tla -config AgentWindowStack.cfg

EXTENDS Naturals, Sequences

CONSTANTS Agents, Tools, MaxDepth

Contracts ==
    [ a \in Agents |->
        CASE a = "writer" -> {"Read", "Write", "Edit"}
          [] a = "reader" -> {"Read", "Grep"}
          [] OTHER        -> {} ]

VARIABLES callStack, lastCall
vars == << callStack, lastCall >>

NoCall == [ tool |-> "none", allowedGate |-> TRUE, allowedTrue |-> TRUE ]

Init == /\ callStack = << >>
        /\ lastCall = NoCall

Permits(agent, tool) == tool \in Contracts[agent]

Open(agent) ==
    /\ Len(callStack) < MaxDepth
    /\ callStack' = Append(callStack, agent)
    /\ lastCall' = NoCall

Stop ==
    /\ Len(callStack) > 0
    /\ callStack' = SubSeq(callStack, 1, Len(callStack) - 1)   \* pop — back to parent
    /\ lastCall' = NoCall

\* The gate now reads the STACK TOP (the proposed fix), so gate == ground truth.
Call(tool) ==
    /\ Len(callStack) > 0
    /\ LET topAgent == callStack[Len(callStack)]
           gateOk   == Permits(topAgent, tool)
           trueOk   == Permits(topAgent, tool)
       IN lastCall' = [ tool |-> tool, allowedGate |-> gateOk, allowedTrue |-> trueOk ]
    /\ UNCHANGED callStack

Next == \/ \E a \in Agents : Open(a)
        \/ Stop
        \/ \E t \in Tools : Call(t)

Spec == Init /\ [][Next]_vars

NoContractEscape ==
    (lastCall.tool # "none") => (lastCall.allowedGate => lastCall.allowedTrue)

=============================================================================
