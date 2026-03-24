/**
 * Sentix Plugin Registry
 *
 * Manages command registration, hook execution, and plugin loading.
 * Loading order: src/commands/ → src/plugins/ → .sentix/plugins/ (project-local)
 */

const commands = new Map();
const hooks = new Map();

/**
 * Register a CLI command.
 * @param {string} name - Command name (e.g., "init", "run")
 * @param {{ description: string, usage: string, run: (args: string[], ctx: object) => Promise<void> }} opts
 */
export function registerCommand(name, opts) {
  commands.set(name, opts);
}

/**
 * Register a lifecycle hook.
 * @param {string} name - Hook name (e.g., "before:command", "after:command")
 * @param {(info: object) => Promise<void>} fn - Hook handler
 */
export function registerHook(name, fn) {
  if (!hooks.has(name)) hooks.set(name, []);
  hooks.get(name).push(fn);
}

/**
 * Get a registered command by name.
 * @param {string} name
 * @returns {object|undefined}
 */
export function getCommand(name) {
  return commands.get(name);
}

/**
 * Get all registered commands.
 * @returns {Map}
 */
export function getAllCommands() {
  return commands;
}

/**
 * Run all hooks for a given event.
 * @param {string} name - Hook event name
 * @param {object} info - Context passed to hooks
 */
export async function runHooks(name, info) {
  const fns = hooks.get(name) || [];
  for (const fn of fns) {
    await fn(info);
  }
}
