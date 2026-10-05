#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname,'..');
const temp = mkdtempSync(path.join(os.tmpdir(),'iot-production-env-self-test-'));
const release = path.join(temp,'release'); const runtimeEnv=path.join(temp,'runtime.env'); const backupEnv=path.join(temp,'backup.env'); const attestation=path.join(temp,'attestation.json'); const output=path.join(temp,'evidence.json'); const proc=path.join(temp,'overcommit');
function write(file,content,mode=0o640){mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,content,{mode});chmodSync(file,mode);}
function run(extra=[], env={}){return spawnSync(process.execPath,['scripts/create-production-environment-evidence.mjs',`--release=${release}`,`--env=${runtimeEnv}`,`--backup-env=${backupEnv}`,`--attestation=${attestation}`,`--output=${output}`,`--proc-overcommit=${proc}`,...extra],{cwd:root,encoding:'utf8',env:{...process.env,PRODUCTION_PREFLIGHT_SELF_TEST:'1',...env}});}
function expect(ok,msg,r){if(!ok)throw new Error(`${msg}\n${r?.stdout??''}${r?.stderr??''}`);}
const strong='A7v9K2pQ4mX8sR6tY3nW5cD1fH0jL9zB';
try{
  write(path.join(release,'release-manifest.json'),JSON.stringify({schemaVersion:1,sourceFingerprint:{packageLockSha256:'a'.repeat(64),baselineManifestSha256:'b'.repeat(64),repositoryTreeSha256:'c'.repeat(64)}}));
  write(proc,'1\n');
  write(runtimeEnv,[
    'NODE_ENV=production','HOST=127.0.0.1','PORT=3000','SWAGGER_ENABLED=false',`DATABASE_URL=postgresql://iot:${strong}@127.0.0.1:5432/iot`,`REDIS_URL=redis://iot:${strong}@127.0.0.1:6379`,
    `JWT_SECRET=${strong}`,'MQTT_BROKER_URL=mqtts://broker.iot-fixture.test:8883','MQTT_CLIENT_ID_PREFIX=iot-platform-api','MQTT_USERNAME=publisher',`MQTT_PASSWORD=${strong}`,`MQTT_WEBHOOK_SECRET=${strong}`,`METRICS_ACCESS_TOKEN=${strong}`,
    'CORS_ALLOWED_ORIGINS=https://app.iot-fixture.test','SCHEDULER_RUNTIME_ENABLED=true','AUTOMATION_RUNTIME_ENABLED=true','NOTIFICATION_RUNTIME_ENABLED=true','EMAIL_RELAY_URL=https://relay.iot-fixture.test/send',`EMAIL_RELAY_TOKEN=${strong}`,'EMAIL_FROM=no-reply@example.com'
  ].join('\n')+'\n');
  write(backupEnv,[`DATABASE_URL=postgresql://backup:${strong}@127.0.0.1:5432/iot`,'BACKUP_DIR=/var/backups/iot-platform','BACKUP_RETENTION_DAYS=35','BACKUP_GPG_RECIPIENT=backup@example.com','BACKUP_GNUPGHOME=/var/lib/postgresql/.gnupg'].join('\n')+'\n');
  write(attestation,JSON.stringify({schemaVersion:1,environment:'production',publicOrigin:'https://app.iot-fixture.test',mqttAclVerified:true,mqttCaHostnameVerified:true,dnsTlsVerified:true,offHostBackupVerified:true,monitoringAccessVerified:true,backupOwner:'ops-backup',monitoringOwner:'ops-monitoring',rollbackOwner:'ops-release',reviewedBy:'operator-a'},null,2));
  let r=run(); expect(r.status===0,'valid production environment fixture was rejected',r);
  r=spawnSync(process.execPath,['scripts/verify-production-environment-evidence.mjs',`--file=${output}`],{cwd:root,encoding:'utf8'}); expect(r.status===0,'generated environment evidence failed verification',r);
  const freshEvidence = JSON.parse(readFileSync(output,'utf8'));
  writeFileSync(output,JSON.stringify({...freshEvidence,observedAt:new Date(Date.now()-25*60*60*1000).toISOString()},null,2)+'\n');
  r=spawnSync(process.execPath,['scripts/verify-production-environment-evidence.mjs',`--file=${output}`],{cwd:root,encoding:'utf8'}); expect(r.status!==0 && `${r.stdout}${r.stderr}`.includes('older than 24 hours'),'stale production environment evidence was not rejected',r);
  writeFileSync(output,JSON.stringify(freshEvidence,null,2)+'\n');
  r=spawnSync(process.execPath,['scripts/verify-production-environment-current.mjs',`--evidence=${output}`,`--env=${runtimeEnv}`,`--backup-env=${backupEnv}`,`--proc-overcommit=${proc}`],{cwd:root,encoding:'utf8',env:{...process.env,PRODUCTION_PREFLIGHT_SELF_TEST:'1'}}); expect(r.status===0,'current environment did not match freshly generated evidence',r);
  const approvedRuntime = readFileSync(runtimeEnv,'utf8');
  writeFileSync(runtimeEnv,`${approvedRuntime}# drift after approval\n`);
  r=spawnSync(process.execPath,['scripts/verify-production-environment-current.mjs',`--evidence=${output}`,`--env=${runtimeEnv}`,`--backup-env=${backupEnv}`,`--proc-overcommit=${proc}`],{cwd:root,encoding:'utf8',env:{...process.env,PRODUCTION_PREFLIGHT_SELF_TEST:'1'}}); expect(r.status!==0 && `${r.stdout}${r.stderr}`.includes('runtime environment changed'),'stale environment approval did not reject changed runtime env',r);
  writeFileSync(runtimeEnv,approvedRuntime);
  write(proc,'0\n'); r=run(); expect(r.status!==0 && `${r.stdout}${r.stderr}`.includes('vm.overcommit_memory'),'redis host memory policy was not enforced',r); write(proc,'1\n');
  writeFileSync(runtimeEnv,readFileSync(runtimeEnv,'utf8').replace('AUTOMATION_RUNTIME_ENABLED=true','AUTOMATION_RUNTIME_ENABLED=false')); r=run(); expect(r.status!==0 && `${r.stdout}${r.stderr}`.includes('AUTOMATION_RUNTIME_ENABLED=true'),'disabled production business runtime was not rejected',r);
  console.log('PASS  valid production environment evidence is generated and verified.');
  console.log('PASS  production environment evidence older than 24 hours is rejected.');
  console.log('PASS  deployment-time environment drift after approval is rejected.');
  console.log('PASS  vm.overcommit_memory=1 is mandatory for production approval.');
  console.log('PASS  Scheduler/Automation/Notification runtimes must be enabled for production approval.');
} finally { rmSync(temp,{recursive:true,force:true}); }
