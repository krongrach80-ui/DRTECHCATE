import serverless from 'serverless-http';
import { createApp } from '../../apps/api/src/app';
import { getEnv } from '../../apps/api/src/config/env';

process.env.ALLOW_BEARER_IN_PROD = 'true';

let serverlessHandler: any = null;

function getHandler() {
  if (!serverlessHandler) {
    const env = getEnv();
    if (env.USE_LOCAL_STORAGE) {
      import('../../apps/api/src/lib/localStorage/localPersistenceEngine')
        .then(({ activateLocalPersistenceEngine }) => {
          activateLocalPersistenceEngine();
        })
        .catch(() => {});
    }
    const app = createApp();
    serverlessHandler = serverless(app, {
      basePath: '/api',
    });
  }
  return serverlessHandler;
}

export const handler = async (event: any, context: any) => {
  const h = getHandler();
  return h(event, context);
};

export default handler;
