-- ============================================================
-- BLACK SKULL BIER - SISTEMA DE PONTO
-- Schema completo para Supabase (Postgres)
-- ============================================================
-- Execute este arquivo inteiro no SQL Editor do Supabase
-- (Dashboard > SQL Editor > New query > colar tudo > Run)
-- ============================================================

-- ------------------------------------------------------------
-- EXTENSÕES NECESSÁRIAS
-- ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------
create type tipo_vinculo as enum ('CLT', 'MEI');
create type tipo_registro_dia as enum ('SIMPLES', 'LIVRE'); -- simples = entrada/saida, livre = multiplas batidas
create type tipo_perfil as enum ('MASTER', 'GESTOR', 'COLABORADOR');
create type tipo_batida as enum ('ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA', 'ENTRADA_LIVRE', 'SAIDA_LIVRE');
create type tipo_ausencia as enum ('FALTA', 'FOLGA', 'ATESTADO', 'OUTRO');
create type periodo_mei as enum ('SEMANAL', 'QUINZENAL');

-- ------------------------------------------------------------
-- TABELA: perfis
-- Estende auth.users do Supabase com dados de perfil/permissão.
-- Toda conta que faz login (Master ou Gestor) tem uma linha aqui.
-- ------------------------------------------------------------
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  tipo tipo_perfil not null default 'GESTOR',
  criado_em timestamptz not null default now()
);

comment on table perfis is 'Usuarios com login no painel administrativo: MASTER ou GESTOR';

-- ------------------------------------------------------------
-- TABELA: colaboradores
-- Pessoas que batem ponto no quiosque. NÃO têm login/senha do
-- Supabase Auth - se identificam por PIN na tela do quiosque.
-- ------------------------------------------------------------
create table colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text,
  pin text not null, -- PIN curto (4 dígitos) para confirmar identidade no quiosque
  foto_url text, -- foto de perfil exibida na lista do quiosque
  vinculo tipo_vinculo not null default 'CLT',
  tipo_registro tipo_registro_dia not null default 'SIMPLES',

  -- Jornada fixa (usada apenas quando vinculo = CLT)
  horario_entrada time,
  horario_saida_almoco time,
  horario_volta_almoco time,
  horario_saida time,
  dias_trabalho int[] default '{1,2,3,4,5}', -- 0=domingo .. 6=sabado

  -- Gestor responsável (para perfil GESTOR ver só sua equipe)
  gestor_id uuid references perfis(id) on delete set null,

  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on table colaboradores is 'Funcionarios que batem ponto no quiosque via PIN';
create index idx_colaboradores_gestor on colaboradores(gestor_id);

-- ------------------------------------------------------------
-- TABELA: registros_ponto
-- Cada batida individual de ponto.
-- ------------------------------------------------------------
create table registros_ponto (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  tipo tipo_batida not null,
  data_hora timestamptz not null default now(),
  foto_url text, -- foto capturada no momento da batida
  origem text not null default 'ONLINE', -- ONLINE ou OFFLINE_SYNC (veio do local storage)
  editado_por uuid references perfis(id), -- preenchido se um admin corrigiu manualmente
  criado_em timestamptz not null default now()
);

comment on table registros_ponto is 'Batidas de ponto individuais de cada colaborador';
create index idx_registros_colaborador on registros_ponto(colaborador_id, data_hora);

-- ------------------------------------------------------------
-- TABELA: ausencias
-- Faltas, folgas e atestados, lançados pelo Gestor/Master.
-- ------------------------------------------------------------
create table ausencias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  data date not null,
  tipo tipo_ausencia not null,
  motivo text,
  lancado_por uuid references perfis(id),
  criado_em timestamptz not null default now()
);

comment on table ausencias is 'Faltas, folgas e atestados registrados pelo gestor/master';
create index idx_ausencias_colaborador on ausencias(colaborador_id, data);

-- ------------------------------------------------------------
-- TABELA: config_relatorio_mei
-- Guarda a preferência de período (semanal/quinzenal) por
-- colaborador MEI, para geração de relatório.
-- ------------------------------------------------------------
create table config_relatorio_mei (
  colaborador_id uuid primary key references colaboradores(id) on delete cascade,
  periodo periodo_mei not null default 'QUINZENAL'
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- A chave "anon" do Supabase é pública (vai ficar no código do
-- GitHub Pages). RLS é o que impede qualquer visitante de ler
-- ou alterar dados sem permissão. Habilitamos em todas as tabelas.
-- ============================================================

alter table perfis enable row level security;
alter table colaboradores enable row level security;
alter table registros_ponto enable row level security;
alter table ausencias enable row level security;
alter table config_relatorio_mei enable row level security;

-- ------------------------------------------------------------
-- Função auxiliar: retorna o tipo de perfil do usuário logado
-- ------------------------------------------------------------
create or replace function meu_tipo_perfil()
returns tipo_perfil
language sql
security definer
stable
as $$
  select tipo from perfis where id = auth.uid()
$$;

create or replace function sou_master()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from perfis where id = auth.uid() and tipo = 'MASTER')
$$;

-- ------------------------------------------------------------
-- POLÍTICAS: perfis
-- Master vê e gerencia todos. Gestor vê só o próprio registro.
-- ------------------------------------------------------------
create policy "master_le_todos_perfis" on perfis
  for select using (sou_master() or id = auth.uid());

create policy "master_insere_perfis" on perfis
  for insert with check (sou_master());

create policy "master_atualiza_perfis" on perfis
  for update using (sou_master());

create policy "master_remove_perfis" on perfis
  for delete using (sou_master());

-- ------------------------------------------------------------
-- POLÍTICAS: colaboradores
-- - Leitura pública (anon) é necessária para a tela do quiosque
--   exibir a lista de nomes/fotos para seleção, SEM exigir login.
--   O PIN não é exposto na listagem pública (ver view abaixo).
-- - Master vê/edita todos. Gestor vê/edita só os da sua equipe.
-- ------------------------------------------------------------

-- Leitura ampla para autenticados (painel) - master vê tudo, gestor só sua equipe
create policy "leitura_colaboradores_autenticado" on colaboradores
  for select using (
    auth.role() = 'authenticated' and (sou_master() or gestor_id = auth.uid())
  );

-- Leitura pública restrita (sem auth) apenas para alimentar o quiosque
-- Feita via view segura "quiosque_colaboradores" (ver abaixo), não direto na tabela.

create policy "gestor_insere_colaboradores" on colaboradores
  for insert with check (
    auth.role() = 'authenticated' and (sou_master() or gestor_id = auth.uid())
  );

create policy "gestor_atualiza_colaboradores" on colaboradores
  for update using (
    auth.role() = 'authenticated' and (sou_master() or gestor_id = auth.uid())
  );

create policy "master_remove_colaboradores" on colaboradores
  for delete using (sou_master());

-- ------------------------------------------------------------
-- VIEW pública para o quiosque: expõe só id, nome, foto.
-- NUNCA expor o PIN aqui.
-- ------------------------------------------------------------
create view quiosque_colaboradores as
  select id, nome, foto_url
  from colaboradores
  where ativo = true;

grant select on quiosque_colaboradores to anon, authenticated;

-- ------------------------------------------------------------
-- Função segura (RPC) para validar PIN sem nunca expor a
-- tabela colaboradores (com pin) ao público.
-- Retorna o id do colaborador se o PIN bater, senão null.
-- ------------------------------------------------------------
create or replace function validar_pin_colaborador(p_colaborador_id uuid, p_pin text)
returns uuid
language sql
security definer
stable
as $$
  select id from colaboradores
  where id = p_colaborador_id and pin = p_pin and ativo = true
$$;

grant execute on function validar_pin_colaborador(uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Função RPC: retorna apenas o tipo_registro (SIMPLES/LIVRE) de
-- um colaborador, sem expor PIN ou outros dados sensíveis.
-- Usada pelo quiosque para decidir quais botões mostrar.
-- ------------------------------------------------------------
create or replace function tipo_registro_colaborador(p_colaborador_id uuid)
returns tipo_registro_dia
language sql
security definer
stable
as $$
  select tipo_registro from colaboradores
  where id = p_colaborador_id and ativo = true
$$;

grant execute on function tipo_registro_colaborador(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Função RPC: retorna os tipos de batida já registrados HOJE
-- (fuso de Brasília) para um colaborador. Usada pelo quiosque
-- para sugerir automaticamente o próximo registro esperado
-- (Entrada -> Saída almoço -> Volta almoço -> Saída), em vez de
-- deixar o colaborador adivinhar qual botão apertar.
-- ------------------------------------------------------------
create or replace function batidas_hoje_colaborador(p_colaborador_id uuid)
returns text[]
language sql
security definer
stable
as $$
  select coalesce(array_agg(tipo::text order by data_hora), '{}')
  from registros_ponto
  where colaborador_id = p_colaborador_id
    and (data_hora at time zone 'America/Sao_Paulo')::date
        = (now() at time zone 'America/Sao_Paulo')::date
$$;

grant execute on function batidas_hoje_colaborador(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- POLÍTICAS: registros_ponto
-- - Inserção pública (anon) liberada: é o próprio quiosque
--   batendo o ponto, sem login. Validação do colaborador_id
--   acontece via validar_pin_colaborador antes de inserir.
-- - Leitura: pública apenas para o "espelho" do dia atual no
--   quiosque (não implementado aqui por padrão); leitura completa
--   só para autenticados (painel).
-- ------------------------------------------------------------
create policy "quiosque_insere_registro" on registros_ponto
  for insert with check (true);

create policy "leitura_registros_autenticado" on registros_ponto
  for select using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

create policy "gestor_atualiza_registros" on registros_ponto
  for update using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

create policy "gestor_remove_registros" on registros_ponto
  for delete using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- POLÍTICAS: ausencias
-- ------------------------------------------------------------
create policy "leitura_ausencias_autenticado" on ausencias
  for select using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

create policy "gestor_insere_ausencias" on ausencias
  for insert with check (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

create policy "gestor_atualiza_ausencias" on ausencias
  for update using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

create policy "gestor_remove_ausencias" on ausencias
  for delete using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- POLÍTICAS: config_relatorio_mei
-- ------------------------------------------------------------
create policy "leitura_config_mei" on config_relatorio_mei
  for select using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

create policy "gestor_upsert_config_mei" on config_relatorio_mei
  for insert with check (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

create policy "gestor_atualiza_config_mei" on config_relatorio_mei
  for update using (
    auth.role() = 'authenticated' and (
      sou_master() or
      colaborador_id in (select id from colaboradores where gestor_id = auth.uid())
    )
  );

-- ============================================================
-- STORAGE: bucket para fotos (perfil + batidas de ponto)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('fotos-ponto', 'fotos-ponto', true)
on conflict (id) do nothing;

create policy "leitura_publica_fotos" on storage.objects
  for select using (bucket_id = 'fotos-ponto');

create policy "insercao_publica_fotos" on storage.objects
  for insert with check (bucket_id = 'fotos-ponto');

create policy "gestor_remove_fotos" on storage.objects
  for delete using (bucket_id = 'fotos-ponto' and auth.role() = 'authenticated');

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
