import { defineConfig } from 'vite';

import { widgetBuildConfig } from '@keyforta/build-utils';

export default defineConfig(widgetBuildConfig({ root: import.meta.dirname }));
