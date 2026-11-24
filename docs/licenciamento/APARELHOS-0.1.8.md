# Autorizações de instalações — preparação 0.1.8

O usuário confirmou em 23/11/2026 que cada instalação/navegador ocupa uma vaga.
Não se usa MAC, IMEI, fingerprint ou pareamento entre aplicativos. Windows e
navegador no mesmo computador ocupam duas vagas. Outra conta/perfil de navegador
possui armazenamento próprio e precisa de autorização própria. Sair e entrar
na mesma conta/instalação permite reutilizar a vaga ao autorizar novamente.

## Implementado e limitado ao teste

O portal do titular mostra Aparelhos autorizados em cada licença Sandbox. Sugere
um nome, permite autorizar/renomear esta instalação, atualizar a lista e revogar
uma autorização. A consulta ao servidor é a fonte do uso/limite, não localStorage.
Fazenda: 6 vagas; consultoria: 5; cada adicional já concedido: mais 2. A mudança
financeira pendente não aumenta o limite antes da conciliação existente.

As migrações 10 e 11 criam somente uma tabela privada de dispositivos e funções
de licenciamento. Nenhuma linha operacional, perfil de fazenda ou RLS operacional
é alterada. A aplicação ocorreu apenas nos bancos locais PostgreSQL 17/15.
Não existe registro automático nem bloqueio do AgriGest principal nesta entrega.
O botão do titular permite testar a autorização explicitamente. Funcionários,
convites, vínculos de fazendas/consultoria e autorizações offline serão integrados
em etapas próprias; não se considera essa parte pronta por exibir uma cota.

## Autorização e preservação

O servidor exige titular com email verificado, conta não bloqueada, sessão Auth
existente e não vencida, licença Sandbox ativa e capacidade disponível. A sessão
vem do JWT validado pelo Supabase, não de um parâmetro recebido do cliente.
A validação de auth.sessions também recusa JWT antigo após logout, conforme
https://supabase.com/docs/guides/auth/sessions.

Uma identificação aleatória da instalação e um segredo de 256 bits ficam no
armazenamento local, separados por servidor, conta e licença. Só o hash do segredo
fica no banco. Reutilizar uma autorização exige esse segredo; uma autorização é
vinculada à sessão atual e não permite o uso por outra sessão sem nova validação.
A tabela privada não tem acesso direto por anon, authenticated ou service_role;
as funções devolvem apenas o necessário, sem sessão ou hash. O proprietário de
outra licença não lista, autoriza, renomeia nem revoga esses aparelhos.

Cadastro/revogação travam a licença no banco, junto das alterações de cota.
Pedidos repetidos reutilizam o registro; uma mesma sessão não cadastra várias
instalações na licença. Revogar mantém o registro e gera auditoria, liberando a
vaga sem excluir conta, dispositivo local ou lançamentos. Licença cancelada ou
vencida mantém a consulta/revogação e impede nova autorização. Redução para uma
cota menor que o uso exige escolher revogações; device_access não aprova acesso
enquanto a cota estiver excedida. A lista mostra até 500 registros, priorizando
todos os ativos (máximo comercial atual de 206) e os revogados mais recentes.

Isso identifica instalações autorizadas; não atesta hardware físico. Copiar
credenciais/armazenamento ou limpar dados não pode ser tratado como identificação
infalível de um computador. Ao perder a identificação local, o titular revoga o
registro antigo e autoriza o novo. A interface não orienta apagar dados pendentes.

## Verificação

- 18 testes Node: limites 6/5/+2, prova/sessão, isolamento, repetição, renomeação,
  revogação, licença vencida/cancelada, cota reduzida e modo Sandbox.
- API local com Auth real: nove sessões simultâneas disputaram seis vagas;
  seis foram autorizadas e três recusadas. Revogação liberou a vaga e manteve o
  histórico. JWT ainda não vencido, mas com sessão encerrada, recebeu recusa.
- Interface compilada sob CSP com Auth/RLS reais: sugestão de nome, autorização,
  recarga sem duplicação de vaga, renomeação e revogação. Sem chamadas Asaas.
- Contrato PostgreSQL 15 com fixtures desfeitos por ROLLBACK. A comparação da
  cópia restaurada confirmou 62 tabelas, 70 políticas e RLS públicos preservados.

Ponto Git anterior: agrigest-antes-aparelhos-2026-11-23. Bundle privado e backups
dos schemas antes das duas migrações estão em checks.local/licensing-local.
Main e produção permanecem intactas.
