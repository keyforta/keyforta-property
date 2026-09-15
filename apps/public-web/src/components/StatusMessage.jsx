import { MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';

export function StatusMessage({ className = '', intent = 'info', message, title }) {
  if (!message) return null;

  return (
    <MessageBar className={className} intent={intent} layout="multiline" role="status" aria-live="polite">
      <MessageBarBody>
        {title && <MessageBarTitle>{title}</MessageBarTitle>}
        {message}
      </MessageBarBody>
    </MessageBar>
  );
}
