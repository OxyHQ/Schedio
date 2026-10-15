import { readFile, writeFile } from 'node:fs/promises';
import { openapi } from '../packages/contracts/src';
const path = new URL('../packages/contracts/openapi.json', import.meta.url);
const expected = `${JSON.stringify(openapi(), null, 2)}\n`;
if (process.argv.includes('--write')) await writeFile(path, expected);
else if ((await readFile(path, 'utf8')) !== expected)
  throw new Error('OpenAPI is stale; run bun run generate:openapi');
