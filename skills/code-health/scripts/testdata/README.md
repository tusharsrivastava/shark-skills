# Test data for the code-health scripts

- `src/`: two small source files.
- `lizard.csv`, `lizard.xml`, `lizard.warn`, `lizard.txt`: real output of lizard 1.25.0 on `src/` (`lizard --csv src`,
  `lizard --xml src`, `lizard -w -C 2 src`, `lizard src`), captured in a `python:3.12-slim` container.
- `fake-sast.mjs`, `fake-lizard.mjs`: stand-ins for Opengrep and `lizard --csv` in the unit tests, so that the tests
  need no analyzer on the machine.
