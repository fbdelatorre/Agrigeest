import test from 'node:test';import assert from 'node:assert/strict';import {comparableFunction,comparePublicFunctions,comparePublicPolicies} from '../scripts/release-sql-comparison.mjs';
const fn=body=>'CREATE OR REPLACE FUNCTION public.test() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO \'\' AS $function$'+body+'$function$;';
test('comments and spacing do not hide executable changes or changes inside SQL literals',()=>{
 const original=fn("BEGIN RETURN 'unchanged -- text'; END");
 assert.equal(comparableFunction(original),comparableFunction(fn("-- comment\nBEGIN /* outer /* nested */ comment */ RETURN   'unchanged -- text'; END")));
 assert.notEqual(comparableFunction(original),comparableFunction(fn("BEGIN RETURN 'changed -- text'; END")));
 assert.notEqual(comparableFunction(fn('BEGIN RETURN a - -b; END')),comparableFunction(fn('BEGIN RETURN a--b\n; END')));
 assert.notEqual(comparableFunction(fn('BEGIN RETURN a b; END')),comparableFunction(fn('BEGIN RETURN ab; END')));
 assert.notEqual(comparableFunction(fn('BEGIN RETURN a + - b; END')),comparableFunction(fn('BEGIN RETURN a +- b; END')));
 assert.notEqual(comparableFunction(fn('BEGIN RETURN $q$-- literal A$q$; END')),comparableFunction(fn('BEGIN RETURN $q$-- literal B$q$; END')));
 assert.notEqual(comparableFunction(original),comparableFunction(original.replace('SECURITY DEFINER','SECURITY INVOKER')));
});
test('policy checks include role, command, read and write restrictions',()=>{
 const policy={schemaname:'public',tablename:'records',policyname:'own',permissive:'PERMISSIVE',roles:['authenticated'],cmd:'ALL',qual:'owner_id = auth.uid()',with_check:'owner_id = auth.uid()'};
 assert.deepEqual(comparePublicPolicies([policy],[{...policy}]),[]);
 for(const change of [{roles:['public']},{cmd:'SELECT'},{qual:'true'},{with_check:null},{permissive:'RESTRICTIVE'}])assert.equal(comparePublicPolicies([policy],[{...policy,...change}])[0].kind,'changed');
 assert.equal(comparePublicPolicies([policy],[])[0].kind,'missing');assert.equal(comparePublicPolicies([],[policy])[0].kind,'new');
});
test('new, removed and changed signatures remain explicit review items',()=>{
 const previous=[{name:'test',signature:'',definition:fn('BEGIN RETURN 1; END')}];
 assert.equal(comparePublicFunctions(previous,[{name:'public.test',arguments:'',definition:fn('-- info\nBEGIN RETURN 1; END')}])[0].kind,'comments-or-whitespace');
 assert.equal(comparePublicFunctions(previous,[{name:'public.test',arguments:'',definition:fn('BEGIN RETURN 2; END')}])[0].kind,'code-review-required');
 assert.equal(comparePublicFunctions(previous,[])[0].kind,'missing-or-signature-changed');
});
