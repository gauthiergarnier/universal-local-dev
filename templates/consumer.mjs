#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const version=spawnSync('local-dev',['version'],{encoding:'utf8'});
if(version.error || version.stdout.trim()!=='1.0.0') {console.error('Install universal-local-dev 1.0.0; see https://github.com/gauthiergarnier/universal-local-dev');process.exit(1);}
const child=spawnSync('local-dev',process.argv.slice(2),{stdio:'inherit'});
process.exit(child.status ?? 1);
