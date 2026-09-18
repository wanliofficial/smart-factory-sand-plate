import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./smoke-loader.mjs', pathToFileURL('./'));
