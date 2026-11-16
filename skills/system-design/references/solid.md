# SOLID

Five principles for the structure of modules and classes. Robert C. Martin collected them (the acronym came
later, from Michael Feathers). Each section gives the principle in our words, the original source, the symptom
of a violation, and a check. The principles also apply at module and service level, not only to classes.

## S: Single Responsibility Principle (SRP)

**Principle.** A module has one, and only one, reason to change. A "reason" is one actor or one group of people
who ask for changes. Code that two actors change for different reasons belongs in two modules.

**Source.** Robert C. Martin, "The Single Responsibility Principle", 2014:
<http://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html>. First stated in his
papers on object-oriented design (late 1990s), which build on cohesion (Tom DeMarco, Meilir Page-Jones).

**Symptom.** Divergent Change: one file changes for unrelated requests. A change for the finance team breaks a
report for the operations team.

**Check.** For each module, name the actor who asks for its changes. If you name two, split the module.

## O: Open/Closed Principle (OCP)

**Principle.** A module is open for extension and closed for modification. You add a behaviour by adding code
(a new implementation of an interface, a new strategy, a new configuration row), not by editing working code.

**Source.** Bertrand Meyer, *Object-Oriented Software Construction*, Prentice Hall, 1988 (extension by
inheritance). Martin restated it with abstract interfaces in "Design Principles and Design Patterns", 2000:
<https://eli.sdsu.edu/courses/fall19/cs635/Principles_and_Patterns.pdf>.

**Symptom.** A switch on a type code that you edit each time a new kind arrives; Shotgun Surgery for each new case.

**Check.** Add the next likely case on paper. Count the files that you must edit. More than the new file and one
registration line is a sign of a violation. Do not apply OCP to a case that nobody asked for
(Speculative Generality).

## L: Liskov Substitution Principle (LSP)

**Principle.** A subtype must be usable in every place where its base type is used, with no change in the
correctness of the program. A subtype may not require more (stronger preconditions) or promise less (weaker
postconditions), and it must keep the invariants of the base type.

**Source.** Barbara Liskov, "Data Abstraction and Hierarchy", OOPSLA '87 keynote, *SIGPLAN Notices* 23(5), 1988.
Barbara Liskov and Jeannette Wing, "A Behavioral Notion of Subtyping", *ACM TOPLAS* 16(6), 1994:
<https://doi.org/10.1145/197320.197383>.

**Symptom.** Refused Bequest; a subclass that throws "not supported"; callers that check the concrete type
before they call.

**Check.** Run the test suite of the base type against each implementation (a contract test). Every
implementation of a port must pass the same tests, the fake included.

## I: Interface Segregation Principle (ISP)

**Principle.** A client must not depend on methods that it does not use. Many small, client-specific interfaces
are better than one large general interface.

**Source.** Robert C. Martin, "Design Principles and Design Patterns", 2000 (link above); first described in his
consulting work on a large printer system.

**Symptom.** A port with many methods, where each caller uses two; fakes in tests that leave most methods empty;
a change to one method forces a rebuild of unrelated clients.

**Check.** For each interface, list the methods that each client calls. If the client sets do not overlap, split
the interface by client.

## D: Dependency Inversion Principle (DIP)

**Principle.** High-level policy does not depend on low-level detail. Both depend on abstractions, and the
abstraction belongs to the high-level side. The domain defines the port; the infrastructure implements it.

**Source.** Robert C. Martin, "The Dependency Inversion Principle", *C++ Report*, 1996; restated in "Design
Principles and Design Patterns", 2000 (link above). The same idea is the core of ports and adapters (Alistair
Cockburn, "Hexagonal Architecture", 2005: <https://alistair.cockburn.us/hexagonal-architecture/>).

**Symptom.** Domain code imports a database driver, an HTTP client or a framework; unit tests need a real
database; a vendor change edits business rules.

**Check.** An import-contract tool (for example Python: `import-linter`; JS/TS: `dependency-cruiser`;
Java: `ArchUnit`; Go: package rules in `go vet` or `depguard`) proves that no inner layer imports an outer layer.

## How SOLID meets the rest of this skill

| Principle | Smell it prevents | Patterns that help |
|---|---|---|
| SRP | Divergent Change, Large Class | Facade, Mediator |
| OCP | Switch Statements, Shotgun Surgery | Strategy, Decorator, Chain of Responsibility, Visitor |
| LSP | Refused Bequest | Template Method (with care), composition over inheritance |
| ISP | Large Class, Middle Man | Adapter, Facade per client |
| DIP | Inappropriate Intimacy, Feature Envy across layers | Adapter, Abstract Factory, Bridge |
