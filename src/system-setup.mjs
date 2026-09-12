import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { atomic, assert } from './core.mjs';
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
const xml = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function prepareSystem(host) {
  assert(process.platform === 'darwin', 'Automated system installer currently supports macOS; see Linux guide');
  const prefix=execFileSync('brew',['--prefix','dnsmasq'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const binary=resolve(prefix,'sbin/dnsmasq');
  const systemId=host.systemId || 'local-dev';
  const serviceLabel=host.serviceLabel || 'dev.local.dns';
  assert(/^[a-z0-9-]+$/.test(systemId) && /^[a-z0-9.-]+$/.test(serviceLabel), 'Invalid local service identity');
  const config=`/etc/${systemId}/dnsmasq.conf`;
  const plist=`/Library/LaunchDaemons/${serviceLabel}.plist`;
  const resolver=`/etc/resolver/${host.domain}`;
  const directory=resolve(host.root,'system');
  await atomic(resolve(directory,'dnsmasq.conf'),await readFile(resolve(host.root,'dnsmasq.conf'),'utf8'));
  await atomic(resolve(directory,'resolver'),'nameserver 127.0.0.1\n');
  const p=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${serviceLabel}</string><key>ProgramArguments</key><array><string>${xml(binary)}</string><string>--keep-in-foreground</string><string>--conf-file=${config}</string><string>--pid-file=/var/run/${systemId}-dns.pid</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>\n`;
  await atomic(resolve(directory,'dns.plist'),p);
  const files=[[resolve(directory,'dnsmasq.conf'),config],[resolve(directory,'resolver'),resolver],[resolve(directory,'dns.plist'),plist]];
  // Refuse pre-existing unrelated files. Back up each owned input for exact
  // rollback checks; never edit /etc/resolv.conf or Homebrew's default configs.
  const script=`#!/bin/sh\nset -eu\n[ "$(id -u)" = 0 ] || { echo 'Run with sudo after reviewing this script'; exit 1; }\n${files.map(([a,b])=>`if [ -e ${quote(b)} ] && ! cmp -s ${quote(a)} ${quote(b)}; then echo 'Refusing existing unrelated file: ${b}'; exit 1; fi`).join('\n')}\n${quote(binary)} --test --conf-file=${quote(resolve(directory,'dnsmasq.conf'))}\nmkdir -p /etc/${systemId} /etc/resolver\n${files.map(([a,b])=>`install -o root -g wheel -m 644 ${quote(a)} ${quote(b)}`).join('\n')}\nlaunchctl print system/${serviceLabel} >/dev/null 2>&1 || launchctl bootstrap system ${quote(plist)}\ndscacheutil -flushcache\necho 'Installed owned DNS service and scoped resolver; configure Tailscale split DNS and trust separately.'\n`;
  const rollback=`#!/bin/sh\nset -eu\n[ "$(id -u)" = 0 ] || exit 1\n${files.map(([a,b])=>`if [ -e ${quote(b)} ] && ! cmp -s ${quote(a)} ${quote(b)}; then echo 'Changed file retained: ${b}'; exit 1; fi`).join('\n')}\nlaunchctl bootout system ${quote(plist)} 2>/dev/null || true\n${files.map(([,b])=>`rm -f ${quote(b)}`).join('\n')}\nrmdir /etc/${systemId} 2>/dev/null || true\ndscacheutil -flushcache\necho 'Owned DNS removed. CA and Caddy state retained; remove only after all stacks and device trust are retired.'\n`;
  await atomic(resolve(directory,'install.sh'),script);await atomic(resolve(directory,'rollback.sh'),rollback);
  return {install:resolve(directory,'install.sh'),rollback:resolve(directory,'rollback.sh'),files:files.map(([,b])=>b)};
}
