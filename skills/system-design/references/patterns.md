# Design patterns (22)

The names and the three groups follow the catalogue at <https://refactoring.guru/design-patterns/catalog>
(based on Gamma, Helm, Johnson, Vlissides, *Design Patterns*, 1994, without Interpreter). The summaries are
ours. Read the linked page for structure, diagrams and code.

**Rule.** Add a pattern only for a named force (SKILL.md step 3). Write: force → pattern → cost. A pattern with
no force is Speculative Generality.

## Creational

| Pattern | Intent (one line) | Use when | Watch out |
|---|---|---|---|
| [Factory Method](https://refactoring.guru/design-patterns/factory-method) | Subclasses or a hook decide which concrete product to create. | A framework must create objects whose type the caller supplies. | A function that returns the object is often enough. |
| [Abstract Factory](https://refactoring.guru/design-patterns/abstract-factory) | One interface creates a family of related objects that must match. | You swap whole families (one vendor's adapters, test fakes vs real). | Adding a new product type edits every factory. |
| [Builder](https://refactoring.guru/design-patterns/builder) | Build a complex object step by step, then get a finished, valid object. | Many optional parts, or one build process with several outputs. | Do not let a half-built object escape; validate in `build()`. |
| [Prototype](https://refactoring.guru/design-patterns/prototype) | Create new objects by copying a configured instance. | Setup is costly, or the concrete class is unknown to the caller. | Deep vs shallow copy errors share state by accident. |
| [Singleton](https://refactoring.guru/design-patterns/singleton) | One instance with one global access point. | A process truly has one of a thing (a registry filled at startup). | Hidden global state; hard to test; prefer injection from one wiring place. |

## Structural

| Pattern | Intent (one line) | Use when | Watch out |
|---|---|---|---|
| [Adapter](https://refactoring.guru/design-patterns/adapter) | Wrap an object so that it fits the interface that a client expects. | Each external system behind a port (ports and adapters). | The adapter translates; it holds no business rule. |
| [Bridge](https://refactoring.guru/design-patterns/bridge) | Split one hierarchy into abstraction and implementation that vary apart. | Two dimensions change independently (channel × message kind). | Too early, it doubles the class count for nothing. |
| [Composite](https://refactoring.guru/design-patterns/composite) | Treat a tree of parts and single parts through one interface. | Nested structures: menus, rule groups, price components. | Operations that make no sense for a leaf weaken LSP. |
| [Decorator](https://refactoring.guru/design-patterns/decorator) | Add behaviour by wrapping an object in objects with the same interface. | Cross-cutting layers: retry, cache, metrics, logging around a port. | Order of wrappers matters; test the composed stack. |
| [Facade](https://refactoring.guru/design-patterns/facade) | One simple entry point in front of a complex subsystem. | The public API of a module; other modules call only this. | A facade that grows every feature becomes a God object. |
| [Flyweight](https://refactoring.guru/design-patterns/flyweight) | Share the common, immutable part of many small objects. | Measured memory pressure from very many similar objects. | Only after a measurement; shared state must be immutable. |
| [Proxy](https://refactoring.guru/design-patterns/proxy) | A stand-in that controls access to the real object. | Lazy load, access check, remote call, rate limit. | Hides latency and failure; make remote calls visible in the type. |

## Behavioral

| Pattern | Intent (one line) | Use when | Watch out |
|---|---|---|---|
| [Chain of Responsibility](https://refactoring.guru/design-patterns/chain-of-responsibility) | Pass a request along handlers until one handles it. | Middleware, validation steps, routing by first match. | A request that no handler takes must fail loudly. |
| [Command](https://refactoring.guru/design-patterns/command) | Turn a request into an object that you can store, queue, retry or undo. | Jobs, queued actions, idempotent retries, audit logs. | Commands must be data in native types, serialisable and versioned. |
| [Iterator](https://refactoring.guru/design-patterns/iterator) | Walk a collection without exposing its internal structure. | Paging over large results, streams. | Most languages provide it; do not hand-roll. |
| [Mediator](https://refactoring.guru/design-patterns/mediator) | Components talk through one coordinator, not to each other. | Many-to-many calls between parts of a workflow. | The mediator itself can become a God object. |
| [Memento](https://refactoring.guru/design-patterns/memento) | Save and restore an object's state without exposing its internals. | Undo, snapshots, checkpoints of a long process. | Snapshot size and versioning of stored state. |
| [Observer](https://refactoring.guru/design-patterns/observer) | Subscribers get a notice when a subject changes. | Domain events to other modules (through an outbox across processes). | In-process listeners that write hide side effects and break units of work. |
| [State](https://refactoring.guru/design-patterns/state) | Behaviour changes with the internal state; each state is its own object. | An explicit lifecycle (draft → confirmed → cancelled). | Keep the transition table in one place and test it as a table. |
| [Strategy](https://refactoring.guru/design-patterns/strategy) | Choose one of several interchangeable algorithms at runtime. | Per-tenant or per-config behaviour chosen by configuration, not by name checks. | A dict of functions is often enough. |
| [Template Method](https://refactoring.guru/design-patterns/template-method) | A base defines the steps; subclasses fill in some steps. | A fixed process with a few varying steps. | Inheritance couples tightly; prefer Strategy for new code. |
| [Visitor](https://refactoring.guru/design-patterns/visitor) | Add operations over a fixed set of types without editing the types. | Compilers, exporters, validators over a stable tree. | Adding a new type edits every visitor. |

## Patterns that production systems need often

These are not in the catalogue above, but the production lessons rely on them
(see [production-lessons.md](production-lessons.md)):

- Ports and adapters (Alistair Cockburn): <https://alistair.cockburn.us/hexagonal-architecture/>
- Unit of Work (Martin Fowler, *PoEAA*): <https://martinfowler.com/eaaCatalog/unitOfWork.html>
- Money (Martin Fowler, *PoEAA*): <https://martinfowler.com/eaaCatalog/money.html>
- Transactional outbox (Chris Richardson): <https://microservices.io/patterns/data/transactional-outbox.html>
