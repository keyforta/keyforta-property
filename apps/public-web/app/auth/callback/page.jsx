"use client";

import { completeBrowserEntraRedirect } from '@keyforta/browser-auth';
import { useEffect } from 'react';

export default function AuthenticationCallbackPage() {
  useEffect(() => {
    completeBrowserEntraRedirect().catch(() => {
      document.body.textContent = 'Authentication could not be completed. Close this window and try again.';
    });
  }, []);

  return null;
}