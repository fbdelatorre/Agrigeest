import test from 'node:test';import assert from 'node:assert/strict';import {licensingReleaseReadiness} from '../scripts/release-readiness.mjs';
const localEvidence={restoreVerified:true,failedMigrationRolledBack:true,laterRecordPreserved:true,sourceKind:'local-pilot'};
test('passing a local rehearsal never implies permission to publish commercial licensing',()=>{
 const result=licensingReleaseReadiness(localEvidence);assert.equal(result.ready,false);assert.ok(result.blocking.includes('source'));assert.ok(result.blocking.includes('backend'));assert.ok(result.blocking.includes('rollback'));assert.equal(result.checks.find(c=>c.id==='restore').passed,true);assert.equal(result.checks.find(c=>c.id==='atomicity').passed,true);
});
test('a failed update test does not substitute for a validated operational rollback or current production files',()=>{
 const evidence={...localEvidence,sourceKind:'verified-production-snapshot',productionOwnershipConfirmed:true,productionBackendVerified:true,productionBillingVerified:true,clientUpgradeVerified:true};
 assert.deepEqual(licensingReleaseReadiness(evidence).blocking,['files','rollback']);
 assert.equal(licensingReleaseReadiness({...evidence,productionFilesVerified:true,productionRollbackVerified:true}).ready,true);
 assert.equal(licensingReleaseReadiness({...evidence,productionFilesVerified:'true',productionRollbackVerified:'true'}).ready,false);
 assert.equal(licensingReleaseReadiness().ready,false);
});
