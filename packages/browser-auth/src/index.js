import { BrowserCacheLocation, InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

export function completeBrowserEntraRedirect() {
  return broadcastResponseToMainFrame();
}

function normalizeConfiguration(configuration) {
  const clientId = configuration?.clientId?.trim();
  const authority = configuration?.authority?.trim();
  const apiScope = configuration?.apiScope?.trim();
  if (!clientId || !authority || !apiScope) return null;
  let authorityUrl;
  try {
    authorityUrl = new URL(authority);
    if (authorityUrl.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return {
    apiScope,
    clientId,
    authority: authority.replace(/\/+$/, ''),
    knownAuthority: authorityUrl.hostname,
    redirectUri: configuration.redirectUri || globalThis.location?.origin || '',
    postLogoutRedirectUri: configuration.postLogoutRedirectUri || globalThis.location?.origin || '',
  };
}

export function createBrowserEntraAuth(configuration) {
  const config = normalizeConfiguration(configuration);
  let client;
  let initialization;
  let snapshot = config
    ? { status: 'loading', account: null, message: '' }
    : { status: 'unavailable', account: null, message: 'Microsoft Entra sign-in is not configured.' };
  const listeners = new Set();
  const publish = (nextSnapshot) => {
    snapshot = Object.freeze(nextSnapshot);
    for (const listener of listeners) listener(snapshot);
  };
  const fail = (error) => publish({
    status: 'error',
    account: null,
    message: error instanceof Error ? error.message : 'Microsoft Entra authentication failed.',
  });

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize() {
      if (!config) return snapshot;
      if (!initialization) initialization = (async () => {
        try {
          client = new PublicClientApplication({
            auth: {
              authority: config.authority,
              clientId: config.clientId,
              knownAuthorities: [config.knownAuthority],
              navigateToLoginRequestUrl: true,
              postLogoutRedirectUri: config.postLogoutRedirectUri,
              redirectUri: config.redirectUri,
            },
            cache: { cacheLocation: BrowserCacheLocation.MemoryStorage, storeAuthStateInCookie: false },
          });
          await client.initialize();
          const redirectResult = await client.handleRedirectPromise();
          let account = redirectResult?.account || client.getActiveAccount() || client.getAllAccounts()[0];
          if (!account) {
            // MemoryStorage does not survive a page reload, so the in-memory
            // account list is empty here even for a still-valid session.
            // ssoSilent() re-establishes the session from the browser's
            // existing Microsoft Entra session cookie (not from any
            // client-side persisted token store) so a refresh does not force
            // the user to sign in again while their Entra session is valid.
            try {
              const silentResult = await client.ssoSilent({ scopes: [config.apiScope] });
              account = silentResult?.account || null;
            } catch {
              account = null;
            }
          }
          if (account) client.setActiveAccount(account);
          publish({
            status: account ? 'signed-in' : 'signed-out',
            account: account && Object.freeze({
              name: account.name || '',
              username: account.username || '',
              email: account.idTokenClaims?.email || '',
            }),
            message: '',
          });
        } catch (error) {
          fail(error);
        }
        return snapshot;
      })();
      return initialization;
    },
    async signIn() {
      if (!client || !config) return;
      publish({ status: 'authenticating', account: null, message: '' });
      try {
        const result = await client.loginPopup({ scopes: [config.apiScope] });
        client.setActiveAccount(result.account);
        publish({
          status: 'signed-in',
          account: Object.freeze({
            name: result.account.name || '',
            username: result.account.username || '',
            email: result.account.idTokenClaims?.email || '',
          }),
          message: '',
        });
      } catch (error) {
        fail(error);
      }
    },
    async getAccessToken() {
      if (!client || !config) throw new Error('Microsoft Entra sign-in is unavailable.');
      const account = client.getActiveAccount();
      if (!account) throw new Error('Sign in before continuing.');
      try {
        return (await client.acquireTokenSilent({ account, scopes: [config.apiScope] })).accessToken;
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          return (await client.acquireTokenPopup({ account, scopes: [config.apiScope] })).accessToken;
        }
        throw error;
      }
    },
    async signOut() {
      if (!client) return;
      const account = client.getActiveAccount();
      publish({ status: 'signed-out', account: null, message: '' });
      await client.logoutPopup({ account });
    },
  });
}