import { resolve } from 'node:path';
import { lock, json, atomic, assert } from './core.mjs';

// Mutations serialize both routing and ownership. A failed proxy update never
// commits a new registry; apply must itself restore the previous config on failure.
export async function mutate(root, change, apply = async () => {}) {
  return lock(root, async () => {
    const file = resolve(root, 'registry.json');
    const previous = await json(file, { version: 1, stacks: {} });
    const next = structuredClone(previous);
    await change(next.stacks);
    await apply(next, previous);
    await atomic(file, JSON.stringify(next, null, 2));
    return next;
  });
}
export function register(stacks, stack) {
  assert(!stacks[stack.id], `Stack ${stack.id} already registered; use status/down or recover`);
  for (const other of Object.values(stacks)) {
    assert(!stack.ports.some(p => other.ports.includes(p)), 'Port collision with another registered stack');
    assert(!stack.services.some(s => other.services.some(o => o.hostname === s.hostname)), 'Hostname collision');
    assert(!stack.services.some(s => ['marketing','app','simulator'].includes(s.adapter) && other.services.some(o => o.path === s.path && ['marketing','app','simulator'].includes(o.adapter))), 'Native worktree already owned by another stack; create an isolated worktree');
  }
  stacks[stack.id] = stack;
}
export function unregister(stacks, id, token) {
  if (!stacks[id]) return;
  assert(stacks[id].token === token, 'Ownership token mismatch');
  delete stacks[id];
}
