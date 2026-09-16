import assert from 'node:assert/strict';
import test from 'node:test';

import { createWidgetBridge } from '../src/index.js';

test('only accepts strict versioned messages from the configured parent origin', () => {
  const sent = [];
  const parent = { postMessage: (...message) => sent.push(message) };
  const bridge = createWidgetBridge({
    origin: 'https://connector.example.test',
    resourceUri: 'ui://keyforta/system/health',
    window: { parent },
  });
  const received = [];

  bridge.ready();
  assert.deepEqual(sent, [[{
    kind: 'widget.ready',
    protocolVersion: 1,
    resourceUri: 'ui://keyforta/system/health',
  }, 'https://connector.example.test']]);
  assert.equal(bridge.receive({
    data: { kind: 'host.locale', locale: 'fr', protocolVersion: 1 },
    origin: 'https://attacker.example.test',
    source: parent,
  }, (message) => received.push(message)), false);
  assert.equal(bridge.receive({
    data: { kind: 'host.locale', locale: 'fr', protocolVersion: 1 },
    origin: 'https://connector.example.test',
    source: parent,
  }, (message) => received.push(message)), true);
  assert.deepEqual(received, [{ kind: 'host.locale', locale: 'fr', protocolVersion: 1 }]);
});
