import test from 'node:test';import assert from 'node:assert/strict';
import {approvedCheckoutUrl} from '../src/features/licensing/checkoutUrl.ts';
test('payment navigation accepts only an exact Sandbox checkout and never arbitrary OS targets',()=>{
 const prefix='https://sandbox.asaas.com/checkoutSession/show?id=';
 assert.equal(approvedCheckoutUrl(prefix+'abc-123_X'),prefix+'abc-123_X');
 for(const bad of [null,undefined,42,'javascript:alert(1)','file:///C:/Windows/system32/cmd.exe','https://sandbox.asaas.com.evil.test/checkoutSession/show?id=a','https://asaas.com/checkoutSession/show?id=a','http://sandbox.asaas.com/checkoutSession/show?id=a',prefix,prefix+'abc\n',prefix+'abc%22',prefix+'abc&other=value',prefix+'abc#x',prefix+'abc/../x',prefix+'ábc',prefix+'a'.repeat(201)])assert.equal(approvedCheckoutUrl(bad),null,String(bad));
});
