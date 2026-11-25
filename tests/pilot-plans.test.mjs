import test from 'node:test';import assert from 'node:assert/strict';import {pilotPlanStatus,pilotPlanProblem} from '../src/features/licensing/pilotPlans.ts';
test('plan guidance distinguishes active, expired, cancelled and pending approval without promising automatic reactivation',()=>{
 assert.equal(pilotPlanStatus({status:'active',active:true}),'Ativa');assert.match(pilotPlanStatus({status:'active',active:false}),/Validade encerrada/);assert.match(pilotPlanStatus({status:'cancelled',active:false}),/somente consulta/);assert.match(pilotPlanStatus({status:'reactivation_requested',active:false}),/aguardando aprovação/);
 assert.match(pilotPlanProblem({message:'OWNER_REQUIRED'}),/Somente o titular/);assert.match(pilotPlanProblem({message:'PLAN_VERSION_CHANGED'}),/Atualize/);assert.match(pilotPlanProblem({message:'PILOT_COMPLIMENTARY_ONLY'}),/apenas para licenças gratuitas/);assert.ok(!pilotPlanProblem({message:'private-server-detail'}).includes('private-server-detail'));
});
