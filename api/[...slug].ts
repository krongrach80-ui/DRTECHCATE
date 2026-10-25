// @ts-expect-error - bundled CommonJS entry
import handler, { config } from './index.js';

export { config };
export default handler;
