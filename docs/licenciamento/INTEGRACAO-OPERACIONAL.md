# Preparação da integração operacional — 24/11/2026

A integração foi iniciada em cópia local. Ainda não há titularidade atribuída,
vínculo operacional, alteração de registros ou nova política aplicada aos dados
existentes. O proprietário legítimo da primeira fazenda precisa ser confirmado
pelo usuário; created_by, is_admin, nomes coincidentes e compra de licença não
substituem essa confirmação. A identidade de gestor da plataforma também não
concede propriedade sobre fazendas de clientes.

Foi preparado um inventário privado das funções e políticas da cópia: 58 funções
próprias, 44 com SECURITY DEFINER, 70 políticas públicas e seis instituições.
O levantamento anterior de 47 funções privilegiadas também incluía funções de
extensões; o novo relatório separa essas rotinas das funções da aplicação.
Os conteúdos e nomes de clientes ficam em checks.local, fora do Git.

scripts/audit-licensing-operational-local.mjs --local-only aceita somente o
contêiner e o banco restaurado local previamente identificados. Exporta o inventário
e um backup completo em formato pg_dump custom. Não vincula a CLI à nuvem, não
aplica SQL de alteração e não sobrescreve um ponto já existente. Manifesto, hash e
arquivo estão em checks.local/licensing-local/operational-bridge-2026-11-24.
Esse arquivo copia o ambiente restaurado local, não é um backup novo de produção.

O aplicativo atual usa a instituição do perfil para consultas, rotinas atômicas
e escopo offline. Não basta adicionar uma política permissiva ou ocultar botões:
as funções privilegiadas também precisam validar fazenda, identidade, papel,
licença e aparelho. A futura troca de fazenda não pode reatribuir perfil,
histórico ou fila pendente para outro tenant. O inventário prepara essa revisão.

A implementação operacional permanece pendente da escolha da primeira fazenda e
confirmação do email do proprietário. Nenhuma equivalência de identidade foi
presumida e a main/produção permanecem intactas.
