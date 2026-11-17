# Launch recipe: Other languages

Part of `shark:debug-rca` › "Launch: one test under the debugger". Read the general recipe there first.

The server also has adapters for Go, Rust, Ruby, Java, .NET and C/C++. The recipe is the same: the project
interpreter or the debug build, one test, one process. Logpoints do not work in Java and .NET. Ruby does not stop
on uncaught exceptions by default.
