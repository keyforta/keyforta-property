import {
  Body1,
  Caption1,
  Card,
  FluentProvider,
  Spinner,
  Title3,
  makeStyles,
  tokens,
  webLightTheme,
} from '@fluentui/react-components';
import { resolveLocale } from '@keyforta/ui-core';
import { healthStrings } from './strings.js';

export type HealthWidgetState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty' }
  | { readonly checkedAt: string; readonly kind: 'populated' }
  | { readonly correlationId?: string; readonly kind: 'error' };

export interface HealthWidgetProps {
  readonly locale?: string;
  readonly state: HealthWidgetState;
}

const useStyles = makeStyles({
  card: {
    borderRadius: tokens.borderRadiusMedium,
    gap: tokens.spacingVerticalM,
    maxWidth: '32rem',
    minHeight: '9rem',
    padding: tokens.spacingHorizontalL,
    width: '100%',
  },
  page: {
    alignItems: 'center',
    backgroundColor: tokens.colorNeutralBackground2,
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: tokens.spacingHorizontalM,
  },
  status: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

export function HealthWidget({ locale = 'en', state }: HealthWidgetProps) {
  const styles = useStyles();
  const strings = resolveLocale(locale, healthStrings);

  return (
    <FluentProvider theme={webLightTheme}>
      <main className={styles.page}>
        <Card className={styles.card} aria-labelledby="health-title">
          <Title3 as="h1" id="health-title">{strings.title}</Title3>
          {state.kind === 'loading' && (
            <div aria-live="polite" aria-busy="true" role="status">
              <Spinner label={strings.loading} />
            </div>
          )}
          {state.kind === 'empty' && <Body1 role="status">{strings.empty}</Body1>}
          {state.kind === 'populated' && (
            <div aria-live="polite" role="status">
              <Body1 className={styles.status}>{strings.healthy}</Body1>
              <Caption1>{strings.checkedAt}: {state.checkedAt}</Caption1>
            </div>
          )}
          {state.kind === 'error' && (
            <div aria-live="assertive" role="alert">
              <Body1>{strings.error}</Body1>
              {state.correlationId && <Caption1>{state.correlationId}</Caption1>}
            </div>
          )}
        </Card>
      </main>
    </FluentProvider>
  );
}