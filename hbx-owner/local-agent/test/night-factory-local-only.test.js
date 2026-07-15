const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..', '..', '..');
const agentSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const localLabSource = fs.readFileSync(path.join(rootDir, 'hbx-local-lab', 'server.js'), 'utf8');
const opsControlSource = fs.readFileSync(path.join(rootDir, 'ops-control', 'server.js'), 'utf8');
const backendModuleSource = fs.readFileSync(
  path.join(rootDir, 'backend', 'src', 'webscraping', 'webscraping.module.ts'),
  'utf8',
);
const backendAppSource = fs.readFileSync(path.join(rootDir, 'backend', 'src', 'app.module.ts'), 'utf8');
const prismaSchema = fs.readFileSync(path.join(rootDir, 'backend', 'prisma', 'schema.prisma'), 'utf8');

test('Night Factory só pode ser acionada explicitamente no HBX Owner 127.0.0.1:3107', () => {
  assert.match(agentSource, /const HOST = "127\.0\.0\.1";/);
  assert.match(agentSource, /const PORT = 3107;/);
  assert.match(agentSource, /if \(!TOKEN\)[\s\S]*process\.exit\(1\);/);
  assert.doesNotMatch(agentSource, /HBX_OWNER_LOCAL_AGENT_PORT/);
  assert.match(agentSource, /server\.listen\(PORT, HOST,/);
  assert.match(agentSource, /url\.pathname === "\/owner\/fabrica\/start"/);
  assert.match(agentSource, /startEnricher\(\{ budget:/);
  assert.match(agentSource, /if \(row\.contactAccessGranted !== true\) continue;/);
  assert.equal((agentSource.match(/startEnricher\(/g) || []).length, 2, 'definição + rota manual do Owner');
  assert.equal((agentSource.match(/ponteWorker\.start\(\)/g) || []).length, 1, 'Ponte só inicia pela rota manual');
  assert.doesNotMatch(agentSource, /server\.listen\([\s\S]{0,400}ponteWorker\.start\(\)/);
});

test('Local Lab nasce como filho controlado e morre com o HBX Owner', () => {
  assert.match(agentSource, /detached: false/);
  assert.match(agentSource, /HBX_LOCAL_LAB_HOST: "127\.0\.0\.1"/);
  assert.match(agentSource, /HBX_LOCAL_LAB_CONTROL_TOKEN: localLabControlToken/);
  assert.match(agentSource, /HBX_OWNER_PARENT_PID: String\(process\.pid\)/);
  assert.doesNotMatch(agentSource, /localLabChild\.unref\(/);
  assert.match(agentSource, /process\.once\("exit"[\s\S]*killPidWindows\(localLabChild\.pid\)/);
  assert.match(agentSource, /for \(const signal of \["SIGINT", "SIGTERM"\]\)/);
  assert.match(agentSource, /await stopEnricher\(\)/);
  assert.match(agentSource, /await stopLocalLab\(\)/);

  assert.match(localLabSource, /const LOOPBACK_HOST = '127\.0\.0\.1'/);
  assert.match(localLabSource, /HBX_LOCAL_LAB_HOST_BLOCKED/);
  assert.match(localLabSource, /HBX_LOCAL_LAB_CONTROL_TOKEN_REQUIRED/);
  assert.match(localLabSource, /HBX_OWNER_PARENT_PID_REQUIRED/);
  assert.match(localLabSource, /createOwnerWatchdog/);
  assert.match(localLabSource, /owner_process_gone/);
  assert.match(localLabSource, /owner_heartbeat_expired/);
  assert.match(localLabSource, /cancelActiveJobs\(reason\)/);
});

test('não existe ponte de execução do Local Lab, importação ou Night Factory pelo VPS', () => {
  for (const source of [agentSource, opsControlSource]) {
    assert.doesNotMatch(source, /lead-harvest\/import/);
    assert.doesNotMatch(source, /email-lab\/vps/);
    assert.doesNotMatch(source, /send-to-vps|push-all-to-vps|import-all-from-vps|transfer\/status/);
  }
  assert.doesNotMatch(opsControlSource, /\/api\/email-lab/);
  assert.doesNotMatch(opsControlSource, /OPS_CONTROL_LOCAL_LAB/);
  assert.doesNotMatch(opsControlSource, /WebscrapingCampaign|RadarFactoryCursor|RadarFactoryWorkLog/);
  assert.doesNotMatch(agentSource, /backendRequest\("POST", "\/modules\/owner\/fabrica\/start"/);
  assert.doesNotMatch(agentSource, /backendRequest\("POST", "\/modules\/owner\/night-factory\/run-now"/);
  assert.doesNotMatch(agentSource, /\/owner\/night-factory\//);
  assert.doesNotMatch(agentSource, /\/modules\/owner\/night-factory\//);
  assert.doesNotMatch(agentSource, /\/owner\/radar\/distribution|radar-auto-distribution/);
});

test('VPS backend não contém factory, campanha autônoma, reward, order ou sweep executável', () => {
  assert.doesNotMatch(backendModuleSource, /RadarFabrica(Service|Controller)/);
  assert.doesNotMatch(backendAppSource, /NightFactoryModule/);
  assert.match(backendAppSource, /LeadsBankModule/);
  assert.doesNotMatch(prismaSchema, /model NightFactoryRewardClaim/);
  assert.doesNotMatch(prismaSchema, /model NightOrder/);
  assert.doesNotMatch(prismaSchema, /model RadarFactoryCursor/);
  assert.doesNotMatch(prismaSchema, /model RadarFactoryWorkLog/);
  assert.doesNotMatch(prismaSchema, /model WebscrapingCampaign(?:Task|Batch)?/);
  assert.equal(fs.existsSync(path.join(rootDir, 'hbx-scraping-engine', 'app', 'services', 'sweep_service.py')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'backend', 'scripts', 'cleanup-vps-autonomous-factory.js')), false);
});
