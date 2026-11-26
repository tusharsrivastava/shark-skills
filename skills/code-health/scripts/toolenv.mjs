/**
 * The shark tool folder: the analyzers and the Python debug adapter that shark installs for the user, the same on
 * each machine and kept across plugin updates.
 *
 *   <data>/bin       Opengrep (the release binary, SHA-256 checked)
 *   <data>/venv      a Python virtual environment with the pinned Lizard (hash checked)
 *   <data>/debugpy   the pinned pure-Python debugpy, for the project's own interpreter through PYTHONPATH
 *
 * <data> is the plugin data folder that Claude Code gives to hooks and MCP servers (`CLAUDE_PLUGIN_DATA`,
 * `~/.claude/plugins/data/<plugin>-<marketplace>/`). A script that the agent runs by hand does not get that variable.
 * So the SessionStart hook records the plugin root in the data folder (`plugin-root`), and a script finds the folder
 * whose record names its own plugin root. Without a record: the folder from the install path of the plugin.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const id = (s) => s.replace(/[^\w.-]/g, "-");
const RECORD = "plugin-root";

function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

const configDir = (env) => env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), ".claude");

/** SessionStart: writes the plugin root into the data folder, so that a script run by hand finds the folder. */
export function recordDataDir(env = process.env, pluginRoot = PLUGIN_ROOT) {
  if (!env.CLAUDE_PLUGIN_DATA) return false;
  mkdirSync(env.CLAUDE_PLUGIN_DATA, { recursive: true });
  writeFileSync(join(env.CLAUDE_PLUGIN_DATA, RECORD), `${real(pluginRoot)}\n`);
  return true;
}

/** The data folder whose record names this plugin root, or null. */
function recorded(env, root) {
  const base = join(configDir(env), "plugins", "data");
  let names = [];
  try {
    names = readdirSync(base);
  } catch {
    return null;
  }
  for (const name of names) {
    try {
      if (readFileSync(join(base, name, RECORD), "utf8").trim() === root) return join(base, name);
    } catch {
      /* no record */
    }
  }
  return null;
}

/** The plugin data folder of shark. */
export function dataDir(env = process.env, pluginRoot = PLUGIN_ROOT) {
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  const root = real(pluginRoot);
  const found = recorded(env, root);
  if (found) return found;
  // An installed plugin: <config>/plugins/cache/<marketplace>/<plugin>/<version>.
  const m = /^(.*)[\\/]plugins[\\/]cache[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/][^\\/]+$/.exec(root);
  if (m) return join(m[1], "plugins", "data", `${id(m[3])}-${id(m[2])}`);
  // A plugin loaded from a folder (development, evals).
  return join(configDir(env), "plugins", "data", "shark-local");
}

export function toolDirs(data = dataDir()) {
  return { data, bin: join(data, "bin"), venvBin: join(data, "venv", "bin"), debugpy: join(data, "debugpy") };
}

const prepend = (dirs, value) => [...dirs, ...(value ? value.split(delimiter).filter((p) => p && !dirs.includes(p)) : [])].join(delimiter);

/** `env` with the tool folders first on PATH, when they exist. The project's commands keep their own tools. */
export function toolEnv(env = process.env, data = dataDir(env)) {
  const t = toolDirs(data);
  const dirs = [t.bin, t.venvBin].filter((d) => existsSync(d));
  return dirs.length ? { ...env, PATH: prepend(dirs, env.PATH) } : { ...env };
}

/** `env` with the shark debugpy first on PYTHONPATH, when it is installed: any Python can then `import debugpy`. */
export function debugpyEnv(env = process.env, data = dataDir(env)) {
  const t = toolDirs(data);
  return existsSync(join(t.debugpy, "debugpy")) ? { ...env, PYTHONPATH: prepend([t.debugpy], env.PYTHONPATH) } : { ...env };
}
