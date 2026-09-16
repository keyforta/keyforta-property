export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export type JsonObject = { readonly [key: string]: JsonValue };

export type WidgetResourceUri =
  `ui://keyforta/${string}/${string}`;

export interface SafeToolError extends JsonObject {
  readonly code: string;
  readonly correlationId: string;
  readonly messageKey: string;
  readonly retryable: boolean;
}

export interface ToolTextContent extends JsonObject {
  readonly text: string;
  readonly type: 'text';
}

export interface ToolResultMeta<
  TWidgetData extends JsonObject = JsonObject,
> extends JsonObject {
  readonly 'openai/outputTemplate': WidgetResourceUri;
  readonly widgetData: TWidgetData;
}

export interface ToolResult<
  TStructuredContent extends JsonObject = JsonObject,
  TWidgetData extends JsonObject = JsonObject,
> extends JsonObject {
  readonly _meta: ToolResultMeta<TWidgetData>;
  readonly content: readonly ToolTextContent[];
  readonly structuredContent: TStructuredContent;
}

export interface WidgetContentSecurityPolicy extends JsonObject {
  readonly connectDomains: readonly string[];
  readonly resourceDomains: readonly string[];
}

export interface WidgetAccessibilityMetadata extends JsonObject {
  readonly descriptionKey: string;
  readonly titleKey: string;
}

export interface WidgetResourceDescriptor extends JsonObject {
  readonly accessibility: WidgetAccessibilityMetadata;
  readonly contractVersion: 1;
  readonly csp: WidgetContentSecurityPolicy;
  readonly mimeType: 'text/html+skybridge';
  readonly uri: WidgetResourceUri;
}

export interface ToolExecutionContext {
  readonly correlationId: string;
  readonly grantedScopes: readonly string[];
  readonly locale: string;
  readonly principalReference: string;
}

export interface WidgetReadyMessage extends JsonObject {
  readonly kind: 'widget.ready';
  readonly protocolVersion: 1;
  readonly resourceUri: WidgetResourceUri;
}

export interface WidgetResizeMessage extends JsonObject {
  readonly height: number;
  readonly kind: 'widget.resize';
  readonly protocolVersion: 1;
  readonly resourceUri: WidgetResourceUri;
}

export interface HostThemeMessage extends JsonObject {
  readonly kind: 'host.theme';
  readonly protocolVersion: 1;
  readonly theme: 'dark' | 'high-contrast' | 'light';
}

export interface HostLocaleMessage extends JsonObject {
  readonly kind: 'host.locale';
  readonly locale: string;
  readonly protocolVersion: 1;
}

export type WidgetToHostMessage = WidgetReadyMessage | WidgetResizeMessage;
export type HostToWidgetMessage = HostLocaleMessage | HostThemeMessage;