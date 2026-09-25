import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppStore } from './app-store.ts';

test('le azioni restano stabili e chiamano sempre l’implementazione più recente', () => {
  const store = createAppStore({ count: 0, read: () => 'prima' });
  const first = store.get().read;
  store.set({ count: 0, read: () => 'dopo' });
  assert.equal(store.get().read, first);
  assert.equal(first(), 'dopo');
});

test('nessuna notifica se cambiano solo le identità delle funzioni', () => {
  const store = createAppStore({ count: 0, action: () => undefined });
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  store.set({ count: 0, action: () => undefined });
  assert.equal(notified, 0);
  store.set({ count: 1, action: () => undefined });
  assert.equal(notified, 1);
  assert.equal(store.get().count, 1);
});

test('unsubscribe interrompe le notifiche', () => {
  const store = createAppStore({ value: 'a' });
  let notified = 0;
  const unsubscribe = store.subscribe(() => {
    notified += 1;
  });
  unsubscribe();
  store.set({ value: 'b' });
  assert.equal(notified, 0);
});
