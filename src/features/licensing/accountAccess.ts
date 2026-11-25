// Deve acompanhar a política do Supabase usado pelo portal de preparação.
export const minimumRegistrationPasswordLength=8;
export const registrationPasswordHint='Use uma senha com pelo menos '+minimumRegistrationPasswordLength+' caracteres, incluindo pelo menos uma letra e um número. Não é obrigatório usar símbolo.';
export const validRegistrationPassword=(password:string)=>password.length>=minimumRegistrationPasswordLength&&/[a-zA-Z]/.test(password)&&/[0-9]/.test(password);
export function accountAccessProblem(error:unknown,register:boolean):string{
 const item=error&&typeof error==='object'?error as {code?:unknown;message?:unknown;name?:unknown}:{};
 const code=typeof item.code==='string'?item.code:'',message=typeof item.message==='string'?item.message:'';
 if(code==='weak_password'||['PASSWORD_TOO_SHORT','PASSWORD_LETTERS_DIGITS_REQUIRED'].includes(message)||/Password should be at least \d+ characters/i.test(message))return registrationPasswordHint+' Se ela ainda for recusada, escolha uma senha menos comum.';
 if(['user_already_exists','email_exists'].includes(code))return 'Já existe uma conta com este email. Use Já tenho conta — entrar. O convite continua salvo.';
 if(code==='email_not_confirmed')return 'Confirme seu email antes de entrar. No teste, procure a mensagem na caixa local de emails.';
 if(code==='email_address_invalid')return 'O servidor recusou o endereço de email. Confira o destinatário do convite.';
 if(['over_email_send_rate_limit','over_request_rate_limit'].includes(code))return 'Foram feitas muitas tentativas. Aguarde alguns minutos antes de tentar novamente. O convite continua salvo.';
 if(code==='invalid_credentials')return 'Email ou senha não conferem. Use os dados da conta que recebeu o convite.';
 if(item.name==='AuthRetryableFetchError'||/Failed to fetch|fetch failed|NetworkError/i.test(message))return 'Não foi possível conectar ao serviço local. Confira se o Docker e o servidor estão funcionando; depois tente novamente.';
 return register?'Não foi possível concluir o cadastro. Confira os dados; se já tem conta, use Entrar.':'Não foi possível entrar. Confira email, senha, confirmação do email e conexão.';
}
