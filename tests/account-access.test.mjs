import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {minimumRegistrationPasswordLength,registrationPasswordHint,accountAccessProblem,validRegistrationPassword} from '../src/features/licensing/accountAccess.ts';
test('registration guidance matches the actual local Auth password policy and explains 422 rejections',async()=>{
 const config=await readFile('licensing-server-local/supabase/config.toml','utf8');assert.equal(minimumRegistrationPasswordLength,Number(config.match(/^minimum_password_length\s*=\s*(\d+)/m)[1]));assert.match(registrationPasswordHint,/8 caracteres/);
 for(const error of [{code:'weak_password',status:422},{message:'Password should be at least 12 characters.'},{message:'PASSWORD_TOO_SHORT'}])assert.match(accountAccessProblem(error,true),/pelo menos 8 caracteres/);
 assert.match(accountAccessProblem({code:'user_already_exists'},true),/convite continua salvo/);assert.match(accountAccessProblem({code:'email_not_confirmed'},false),/Confirme seu email/);assert.match(accountAccessProblem({code:'over_email_send_rate_limit'},true),/Aguarde/);assert.match(accountAccessProblem({message:'Failed to fetch'},true),/Docker/);
 assert.ok(!accountAccessProblem({message:'private-diagnostic-should-not-leak'},true).includes('private-diagnostic'));
});

test('registration needs eight characters, letters and digits without requiring symbol or mixed case',()=>{for(const password of ['abcdefgh','12345678','Abc1234','!!!!1234'])assert.equal(validRegistrationPassword(password),false);for(const password of ['abcd1234','ABCD1234','Senha123','Abc1234!'])assert.equal(validRegistrationPassword(password),true);});
