import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomic, assert, available } from './core.mjs';
import { localDatabase } from './environment.mjs';

export function compose(stack) {
  const database = new URL(localDatabase(stack)).pathname.slice(1);
  return { name: `cd-${stack.id}`, services: {
    postgres: { image: 'universal-local-dev/postgis:16', build: { context: resolve(dirname(fileURLToPath(import.meta.url)), '../templates/postgis') }, command: ['postgres','-c','jit=off'], environment: { POSTGRES_USER:'local', POSTGRES_PASSWORD:'local', POSTGRES_DB:database }, ports: [`127.0.0.1:${stack.databasePort}:5432`], volumes: ['postgres:/var/lib/postgresql/data'], healthcheck: { test: ['CMD-SHELL', `pg_isready -h 127.0.0.1 -U local -d ${database}`], interval:'2s', timeout:'2s', retries:60 } },
    redis: { image:'redis:7.4-alpine', ports:[`127.0.0.1:${stack.redisPort}:6379`], command:['redis-server','--save','','--appendonly','no'], healthcheck:{ test:['CMD','redis-cli','ping'], interval:'2s', timeout:'2s', retries:30 } },
  }, volumes: { postgres: {} } };
}
export async function dataCommand(root, stack, action, confirm) {
  assert(stack.profile === 'integration', 'Data commands require --profile integration');
  const config = resolve(root, 'stacks', stack.id, 'compose.json');
  await atomic(config, JSON.stringify(compose(stack),null,2));
  const context=stack.dockerContext || 'default';
  assert(/^[a-zA-Z0-9_-]+$/.test(context),'Invalid Docker context');
  let endpoint;
  try { endpoint=execFileSync('docker',['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
  catch { throw new Error('Local Docker context unavailable; configure dockerContext in the manifest'); }
  assert(endpoint.startsWith('unix:///'),'Integration requires a local Unix Docker socket; remote contexts refused');
  const env={PATH:process.env.PATH,HOME:process.env.HOME,DOCKER_HOST:endpoint,DOCKER_CONTEXT:''};
  let bin='docker',prefix=['compose'];
  try { execFileSync(bin,[...prefix,'version'],{env,stdio:'pipe'}); } catch { bin='docker-compose';prefix=[]; }
  const run = args => { try { return execFileSync(bin, [...prefix,'-p',`cd-${stack.id}`,'-f',config,...args], { env, encoding:'utf8', stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024 }); } catch { throw new Error(`Local compose ${action} failed; inspect compose for this stack (no remote database is used)`); } };
  if (action === 'data-up') { if (!run(['ps','-q']).trim()) { await available(stack.databasePort); await available(stack.redisPort); } run(['up','-d','--wait']); }
  else if (action === 'data-down') run(['down']);
  else if (action === 'data-reset') { assert(confirm === stack.id, `Reset requires --confirm ${stack.id}`); run(['down','--volumes']); }
  else throw new Error('Unknown data command');
}
