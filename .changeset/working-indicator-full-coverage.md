---
'@agent-devtools/widget-core': patch
---

Show the working ("typing") indicator during every idle period of a turn, not
only while waiting for the first response. Previously the three-dot indicator
was a one-shot placeholder pushed when the user submitted and removed on the
first assistant event, so in an agentic turn the surface looked frozen while a
tool executed and while the model round-tripped on a tool result. The indicator
is now a derived view of the conversation state: it sits at the tail whenever a
turn is in flight and the assistant is between visible actions (after submit,
while a tool runs, and during the model round-trip after a tool result), and is
dropped the moment text or tool input streams again or the turn ends. It is
deliberately not shown after a finished text block, since a turn that ends on
text emits its completion immediately and a dot there would only flash.
