/*
  # Tornar campo description opcional na tabela maintenances

  1. Alterações
    - Remover restrição NOT NULL do campo `description` na tabela `maintenances`
    - O campo description agora pode ser nulo, pois a informação relevante está no tipo de manutenção
*/

-- Tornar o campo description opcional
ALTER TABLE maintenances
  ALTER COLUMN description DROP NOT NULL;
