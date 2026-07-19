import './style.css';
import { bootstrapApp } from './app/App';
import { logger } from '@core/logger';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Root element (#app) not found.');
}

bootstrapApp(root).catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : 'Failed to start the app.');
  console.error(error);
});
