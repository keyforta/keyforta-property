import { hostToWidgetMessageSchema } from '@keyforta/contracts';
import type {
  HostToWidgetMessage,
  WidgetReadyMessage,
  WidgetResourceUri,
  WidgetToHostMessage,
} from '@keyforta/types';

export interface WidgetBridgeOptions {
  readonly allowedOrigin: string;
  readonly hostWindow: Pick<Window, 'postMessage'>;
  readonly resourceUri: WidgetResourceUri;
  readonly sourceWindow: MessageEventSource;
}

export function parseHostMessage(
  event: Pick<MessageEvent, 'data' | 'origin' | 'source'>,
  options: Pick<WidgetBridgeOptions, 'allowedOrigin' | 'sourceWindow'>,
): HostToWidgetMessage | undefined {
  if (event.origin !== options.allowedOrigin || event.source !== options.sourceWindow) {
    return undefined;
  }

  const result = hostToWidgetMessageSchema.safeParse(event.data);
  return result.success ? result.data : undefined;
}

export function createWidgetBridge(options: WidgetBridgeOptions) {
  const listeners = new Set<(message: HostToWidgetMessage) => void>();

  const receive = (event: MessageEvent) => {
    const message = parseHostMessage(event, options);
    if (message) listeners.forEach((listener) => listener(message));
  };

  const post = (message: WidgetToHostMessage) => {
    options.hostWindow.postMessage(message, options.allowedOrigin);
  };

  return {
    onMessage(listener: (message: HostToWidgetMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready() {
      const message: WidgetReadyMessage = {
        kind: 'widget.ready',
        protocolVersion: 1,
        resourceUri: options.resourceUri,
      };
      post(message);
    },
    receive,
  };
}

export function resolveLocale<T>(
  requestedLocale: string,
  tables: Readonly<Record<string, T>>,
  fallbackLocale = 'en',
): T {
  const exact = tables[requestedLocale];
  if (exact) return exact;

  const language = tables[requestedLocale.toLowerCase().split('-')[0] ?? ''];
  const fallback = tables[fallbackLocale];
  if (language) return language;
  if (fallback) return fallback;
  throw new Error(`Missing locale fallback: ${fallbackLocale}`);
}