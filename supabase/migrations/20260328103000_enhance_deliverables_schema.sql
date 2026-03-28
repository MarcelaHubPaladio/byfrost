-- Adiciona nome e referência do template nos entregáveis para melhor visualização
ALTER TABLE public.deliverables 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS template_id UUID;

-- Comentário para documentação do sistema
COMMENT ON COLUMN public.deliverables.name IS 'Cópia denormalizada do nome do template para visualização estável.';
