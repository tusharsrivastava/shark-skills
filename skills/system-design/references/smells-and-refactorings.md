# Code smells and the refactorings that fix them

Smell names and groups follow <https://refactoring.guru/refactoring/smells>; technique names and groups follow
<https://refactoring.guru/refactoring/techniques> (after Martin Fowler, *Refactoring*, 1999 and 2018). The
summaries are ours. Smell pages: `https://refactoring.guru/smells/<slug>`. Technique pages:
`https://refactoring.guru/<slug>`.

**How to use.** In a review, name the smell, the file and line, and one refactoring. Apply one refactoring per
commit, with the tests green before and after (`shark:commit-blocks`). A refactoring changes structure, never
behaviour.

## Part 1: smells → fixes

### [Bloaters](https://refactoring.guru/refactoring/smells/bloaters)
Code that grew too large to read or change safely.

| Smell | Sign (our words) | Refactorings that fix it |
|---|---|---|
| [Long Method](https://refactoring.guru/smells/long-method) | A function that you must scroll to understand. | Extract Method, Replace Temp with Query, Decompose Conditional, Replace Method with Method Object |
| [Large Class](https://refactoring.guru/smells/large-class) | A class or module with many fields and reasons to change. | Extract Class, Extract Subclass, Extract Interface |
| [Primitive Obsession](https://refactoring.guru/smells/primitive-obsession) | Strings and numbers stand for money, dates, ids, states. | Replace Data Value with Object, Replace Type Code with Class, Introduce Parameter Object |
| [Long Parameter List](https://refactoring.guru/smells/long-parameter-list) | Many arguments, often passed through unchanged. | Introduce Parameter Object, Preserve Whole Object, Replace Parameter with Method Call |
| [Data Clumps](https://refactoring.guru/smells/data-clumps) | The same group of values travels together everywhere. | Extract Class, Introduce Parameter Object |

### [Object-Orientation Abusers](https://refactoring.guru/refactoring/smells/oo-abusers)
Object features used in a way that works against them.

| Smell | Sign (our words) | Refactorings that fix it |
|---|---|---|
| [Switch Statements](https://refactoring.guru/smells/switch-statements) | The same branch on a type or a name repeats in many places. | Replace Conditional with Polymorphism, Replace Type Code with State/Strategy, Replace Parameter with Explicit Methods |
| [Temporary Field](https://refactoring.guru/smells/temporary-field) | A field that has a value only in some situations. | Extract Class, Introduce Null Object |
| [Refused Bequest](https://refactoring.guru/smells/refused-bequest) | A subclass uses little of its parent, or refuses parts of it. | Replace Inheritance with Delegation, Push Down Method, Push Down Field |
| [Alternative Classes with Different Interfaces](https://refactoring.guru/smells/alternative-classes-with-different-interfaces) | Two classes do the same job with different method names. | Rename Method, Move Method, Extract Superclass |

### [Change Preventers](https://refactoring.guru/refactoring/smells/change-preventers)
One change forces edits in many places.

| Smell | Sign (our words) | Refactorings that fix it |
|---|---|---|
| [Divergent Change](https://refactoring.guru/smells/divergent-change) | One module changes for many unrelated reasons (SRP). | Extract Class |
| [Shotgun Surgery](https://refactoring.guru/smells/shotgun-surgery) | One change needs small edits in many modules (one rule in many places). | Move Method, Move Field, Inline Class |
| [Parallel Inheritance Hierarchies](https://refactoring.guru/smells/parallel-inheritance-hierarchies) | Each new subclass in one tree needs a twin in another tree. | Move Method, Move Field |

### [Dispensables](https://refactoring.guru/refactoring/smells/dispensables)
Code that you can remove, and the system gets better.

| Smell | Sign (our words) | Refactorings that fix it |
|---|---|---|
| [Comments](https://refactoring.guru/smells/comments) | A comment explains what unclear code does. | Extract Variable, Extract Method, Rename Method, Introduce Assertion |
| [Duplicate Code](https://refactoring.guru/smells/duplicate-code) | The same logic in two places; they drift apart. | Extract Method, Pull Up Method, Form Template Method, Substitute Algorithm |
| [Lazy Class](https://refactoring.guru/smells/lazy-class) | A class that does too little to justify itself. | Inline Class, Collapse Hierarchy |
| [Data Class](https://refactoring.guru/smells/data-class) | Only fields; the rules that use them live elsewhere. | Move Method, Encapsulate Field, Encapsulate Collection, Remove Setting Method |
| [Dead Code](https://refactoring.guru/smells/dead-code) | Code that nothing calls, or an old path kept "just in case". | Delete it; Remove Parameter; Inline Class |
| [Speculative Generality](https://refactoring.guru/smells/speculative-generality) | Hooks and abstractions for cases that nobody asked for. | Collapse Hierarchy, Inline Class, Inline Method, Remove Parameter |

Note: value objects (Money, DateRange) are not Data Class; they own their rules (arithmetic, rounding, checks).

### [Couplers](https://refactoring.guru/refactoring/smells/couplers)
Modules that know too much about each other.

| Smell | Sign (our words) | Refactorings that fix it |
|---|---|---|
| [Feature Envy](https://refactoring.guru/smells/feature-envy) | A method uses another object's data more than its own. | Move Method, Extract Method |
| [Inappropriate Intimacy](https://refactoring.guru/smells/inappropriate-intimacy) | A module reads another module's internals (not its facade). | Move Method, Move Field, Hide Delegate, Replace Inheritance with Delegation |
| [Message Chains](https://refactoring.guru/smells/message-chains) | `a.b().c().d()`: a caller knows a long path of nesting. | Hide Delegate, Extract Method, Move Method |
| [Middle Man](https://refactoring.guru/smells/middle-man) | A class that only forwards calls. | Remove Middle Man, Inline Method |
| [Incomplete Library Class](https://refactoring.guru/smells/incomplete-library-class) | A library lacks a method that you need, and you cannot edit it. | Introduce Foreign Method, Introduce Local Extension (an adapter) |

### Production smells (not in the catalogue; from our own rebuilds)

| Smell | Sign | Fix |
|---|---|---|
| Display-text parsing | A regex reads money, dates or ids back from text that the system made. | Store the native value; format only at the edge. |
| Shape-guessing reader | Several readers each know the nesting of one external result. | One typed reader + a contract test against the real writer. |
| Name branch | `if customer == "X"` in shared code or a shared prompt. | Move the rule to configuration or a spec (Strategy). |
| Live old path | The replaced code still runs behind a switch. | Delete it; compare by measurement. |
| Split unit of work | A write commits, then the event or job is sent outside the transaction. | Transactional outbox in the same unit of work. |

See [production-lessons.md](production-lessons.md) for the reason and the check of each.

## Part 2: technique groups

### [Composing Methods](https://refactoring.guru/refactoring/techniques/composing-methods)
Make long functions short and clear.
Extract Method, Inline Method, Extract Variable, Inline Temp, Replace Temp with Query, Split Temporary Variable,
Remove Assignments to Parameters, Replace Method with Method Object, Substitute Algorithm.

### [Moving Features between Objects](https://refactoring.guru/refactoring/techniques/moving-features-between-objects)
Put each behaviour in the module that owns its data.
Move Method, Move Field, Extract Class, Inline Class, Hide Delegate, Remove Middle Man, Introduce Foreign Method,
Introduce Local Extension.

### [Organizing Data](https://refactoring.guru/refactoring/techniques/organizing-data)
Replace raw values with types that carry their rules.
Change Value to Reference, Change Reference to Value, Duplicate Observed Data, Self Encapsulate Field,
Replace Data Value with Object, Replace Array with Object, Change Unidirectional Association to Bidirectional,
Change Bidirectional Association to Unidirectional, Encapsulate Field, Encapsulate Collection,
Replace Magic Number with Symbolic Constant, Replace Type Code with Class, Replace Type Code with Subclasses,
Replace Type Code with State/Strategy, Replace Subclass with Fields.

### [Simplifying Conditional Expressions](https://refactoring.guru/refactoring/techniques/simplifying-conditional-expressions)
Make branches flat and named.
Consolidate Conditional Expression, Consolidate Duplicate Conditional Fragments, Decompose Conditional,
Replace Conditional with Polymorphism, Remove Control Flag, Replace Nested Conditional with Guard Clauses,
Introduce Null Object, Introduce Assertion.

### [Simplifying Method Calls](https://refactoring.guru/refactoring/techniques/simplifying-method-calls)
Make interfaces small, honest and easy to call.
Add Parameter, Remove Parameter, Rename Method, Separate Query from Modifier, Parameterize Method,
Introduce Parameter Object, Preserve Whole Object, Remove Setting Method, Replace Parameter with Explicit Methods,
Replace Parameter with Method Call, Hide Method, Replace Constructor with Factory Method,
Replace Error Code with Exception, Replace Exception with Test.

Note: Separate Query from Modifier is also the production rule "reads have no side effects".

### [Dealing with Generalization](https://refactoring.guru/refactoring/techniques/dealing-with-generalization)
Move behaviour up or down a hierarchy, or replace inheritance with composition.
Pull Up Field, Pull Up Method, Pull Up Constructor Body, Push Down Field, Push Down Method, Extract Subclass,
Extract Superclass, Extract Interface, Collapse Hierarchy, Form Template Method,
Replace Inheritance with Delegation, Replace Delegation with Inheritance.

## Large-scale refactoring steps

For a change across modules, use these in addition to the techniques above:

- **Parallel change (expand/contract)**: add the new shape, move callers, remove the old shape.
  <https://martinfowler.com/bliki/ParallelChange.html>
- **Branch by abstraction**: put a port in front of the old code, build the new implementation behind it, switch,
  then delete the old implementation and, if no longer needed, the port.
  <https://martinfowler.com/bliki/BranchByAbstraction.html>
- **Port audit** before the new code replaces the old: list each rule that the deleting commits remove
  (`shark:port-audit`).
