import { hostToWidgetMessageSchema, widgetToHostMessageSchema } from '@keyforta/contracts';

export function createWidgetBridge({ origin, resourceUri, window }) {
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new TypeError('Widget bridge requires an exact HTTPS host origin');
  }
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin) {
    throw new TypeError('Widget bridge requires an exact HTTPS host origin');
  }

  function send(message) {
    const parsed = widgetToHostMessageSchema.parse({ ...message, resourceUri });
    window.parent.postMessage(parsed, origin);
  }

  function receive(event, onMessage) {
    if (event.source !== window.parent || event.origin !== origin) return false;
    const parsed = hostToWidgetMessageSchema.safeParse(event.data);
    if (!parsed.success) return false;
    onMessage(parsed.data);
    return true;
  }

  return Object.freeze({
    receive,
    ready: () => send({ kind: 'widget.ready', protocolVersion: 1 }),
    resize: (height) => send({ height, kind: 'widget.resize', protocolVersion: 1 }),
  });
}
