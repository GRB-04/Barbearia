# Fila de Espera de Cadeira — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barbeiro entra em fila de espera para cadeira+período ocupado; quando vaga, recebe hold exclusivo com prazo (default 60 min, configurável na org) para confirmar a reserva.

**Architecture:** DB-centric (Abordagem A da spec `docs/superpowers/specs/2026-07-03-chair-waitlist-design.md`). Tabela `chair_waitlist` + triggers PL/pgSQL SECURITY DEFINER para promoção/enforcement/conversão + pg_cron para expiração. Frontend só lê/insere/cancela via Supabase client com RLS.

**Tech Stack:** Supabase Postgres (migrations via MCP `apply_migration` no projeto canônico `qrfggirhrunuaecvltub`), React 18 + TS + shadcn/ui, React Query não usado nos services atuais (padrão: async functions + useState).

## Global Constraints

- Banco canônico: projeto Supabase `qrfggirhrunuaecvltub`. Migrations aplicadas via MCP **E** salvas em `supabase/migrations/` com convenção `AAAAMMDD######_nome.sql`, commitadas.
- Default do hold: **60 minutos**, coluna `organizations.waitlist_hold_minutes`, CHECK 5–1440.
- Enum `waitlist_status`: `waiting | hold | converted | expired | cancelled`.
- Notificação: só in-app (tabela `notifications`, colunas: organization_id, user_id, title, body, type; `type='info'`).
- Regras de período espelham `chair_bookings`: end > start, mínimo 4h, mesmo dia (`::date` igual, mesmo critério do booking).
- RLS: padrão SECURITY DEFINER (helpers existentes: `current_barber_profile_id()`, `managed_location_id()`). NUNCA policy que consulta a própria tabela ou tabela que referencia de volta (recursão 42P17).
- `chair_booking_status` no banco NÃO tinha `rejected` (bug pré-existente: BookingsPage envia `rejected` e falha). Task 1 adiciona.
- Textos de UI em pt-BR.
- Commits frequentes, mensagens `feat:`/`fix:` em minúsculas, terminadas com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Enum `rejected` em chair_booking_status

**Files:**
- Create: `supabase/migrations/20260703000100_add_rejected_booking_status.sql`

**Interfaces:**
- Produces: valor `rejected` no enum `public.chair_booking_status` (usado pelos triggers da Task 3 e já esperado por `src/pages/BookingsPage.tsx:106`).

- [ ] **Step 1: Verificar estado atual (deve falhar/faltar)**

Via MCP `execute_sql` (project_id `qrfggirhrunuaecvltub`):
```sql
select array_agg(e.enumlabel order by e.enumsortorder)
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = 'chair_booking_status';
```
Esperado: `{pending,confirmed,cancelled,completed}` — sem `rejected`.

- [ ] **Step 2: Criar arquivo de migration**

Conteúdo de `supabase/migrations/20260703000100_add_rejected_booking_status.sql`:
```sql
-- BookingsPage envia status 'rejected' na rejeição do dono, mas o enum nunca
-- recebeu o valor — o UPDATE falhava. Triggers de contrato já tratam 'rejected'.
-- ADD VALUE não pode ser usado na mesma transação; por isso migration isolada.
alter type public.chair_booking_status add value if not exists 'rejected';
```

- [ ] **Step 3: Aplicar via MCP**

`apply_migration` com name `add_rejected_booking_status`, mesmo SQL.

- [ ] **Step 4: Verificar**

Repetir query do Step 1. Esperado: `{pending,confirmed,cancelled,completed,rejected}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260703000100_add_rejected_booking_status.sql
git commit -m "fix: add missing 'rejected' value to chair_booking_status enum"
```

---

### Task 2: Core da fila — coluna org, enum, tabela, RLS

**Files:**
- Create: `supabase/migrations/20260703000200_chair_waitlist_core.sql`

**Interfaces:**
- Produces: tabela `public.chair_waitlist` (colunas conforme spec), enum `public.waitlist_status`, coluna `organizations.waitlist_hold_minutes int`, função `public.my_waitlist_positions() returns table(entry_id uuid, queue_position bigint)`.
- Consumes: helpers existentes `current_barber_profile_id()`, `managed_location_id()`.

- [ ] **Step 1: Criar arquivo de migration**

Conteúdo de `supabase/migrations/20260703000200_chair_waitlist_core.sql`:
```sql
begin;

-- 1) Config da org: prazo do hold em minutos
alter table public.organizations
  add column if not exists waitlist_hold_minutes int not null default 60
  constraint organizations_waitlist_hold_minutes_check
  check (waitlist_hold_minutes between 5 and 1440);

-- 2) Enum de status da fila
do $$
begin
  if not exists (select 1 from pg_type where typname = 'waitlist_status') then
    create type public.waitlist_status as enum
      ('waiting', 'hold', 'converted', 'expired', 'cancelled');
  end if;
end
$$;

-- 3) Tabela
create table if not exists public.chair_waitlist (
  id uuid primary key default gen_random_uuid(),
  chair_id uuid not null references public.chairs(id) on delete cascade,
  barber_profile_id uuid not null references public.barber_profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  desired_start_at timestamptz not null,
  desired_end_at timestamptz not null,
  status public.waitlist_status not null default 'waiting',
  hold_expires_at timestamptz,
  notified_at timestamptz,
  converted_booking_id uuid references public.chair_bookings(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint chair_waitlist_time_order_check check (desired_end_at > desired_start_at),
  constraint chair_waitlist_minimum_4_hours_check
    check (desired_end_at - desired_start_at >= interval '4 hours'),
  -- mesmo critério de "mesmo dia" usado em is_booking_within_location_hours
  constraint chair_waitlist_same_day_check
    check (desired_start_at::date = desired_end_at::date)
);

comment on table public.chair_waitlist is
  'Fila de espera por cadeira+período. Promoção/expiração via triggers e pg_cron.';

-- 1 entrada ativa por barbeiro+cadeira
create unique index if not exists uq_chair_waitlist_active_per_barber_chair
  on public.chair_waitlist (chair_id, barber_profile_id)
  where status in ('waiting', 'hold');

create index if not exists idx_chair_waitlist_chair_status
  on public.chair_waitlist (chair_id, status);
create index if not exists idx_chair_waitlist_barber
  on public.chair_waitlist (barber_profile_id);
create index if not exists idx_chair_waitlist_location
  on public.chair_waitlist (location_id);
create index if not exists idx_chair_waitlist_org
  on public.chair_waitlist (organization_id);
create index if not exists idx_chair_waitlist_hold_expiry
  on public.chair_waitlist (hold_expires_at) where status = 'hold';

-- 4) Validação + denormalização no INSERT.
-- location_id/organization_id vêm da cadeira (não confia no client).
create or replace function public.validate_chair_waitlist_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_organization_id uuid;
begin
  select c.location_id, l.organization_id
  into v_location_id, v_organization_id
  from public.chairs c
  join public.locations l on l.id = c.location_id
  where c.id = new.chair_id;

  if v_location_id is null then
    raise exception 'Cadeira não encontrada.';
  end if;

  new.location_id := v_location_id;
  new.organization_id := v_organization_id;

  if new.desired_start_at <= now() then
    raise exception 'O período desejado deve estar no futuro.';
  end if;

  -- fila só faz sentido se há conflito real; sem conflito, reserve direto
  if not exists (
    select 1
    from public.chair_bookings cb
    where cb.chair_id = new.chair_id
      and cb.status in ('pending', 'confirmed')
      and tstzrange(cb.start_at, cb.end_at, '[)')
          && tstzrange(new.desired_start_at, new.desired_end_at, '[)')
  ) then
    raise exception 'Não há conflito neste período — reserve a cadeira diretamente.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_chair_waitlist_insert on public.chair_waitlist;
create trigger trg_validate_chair_waitlist_insert
before insert on public.chair_waitlist
for each row execute function public.validate_chair_waitlist_insert();

-- 5) Posição na fila do barbeiro logado (definer: barbeiro não vê entradas alheias)
create or replace function public.my_waitlist_positions()
returns table (entry_id uuid, queue_position bigint)
language sql
stable
security definer
set search_path = public
as $$
  select w.id,
         1 + count(w2.id)
  from public.chair_waitlist w
  left join public.chair_waitlist w2
    on w2.chair_id = w.chair_id
   and w2.status = 'waiting'
   and w2.created_at < w.created_at
  where w.barber_profile_id = public.current_barber_profile_id()
    and w.status in ('waiting', 'hold')
  group by w.id;
$$;

grant execute on function public.my_waitlist_positions() to authenticated;

-- 6) RLS
alter table public.chair_waitlist enable row level security;

drop policy if exists "chair_waitlist_select" on public.chair_waitlist;
create policy "chair_waitlist_select"
on public.chair_waitlist for select to authenticated
using (
  barber_profile_id = public.current_barber_profile_id()
  or exists (
    select 1 from public.organizations o
    where o.id = chair_waitlist.organization_id and o.owner_id = auth.uid()
  )
  or location_id = public.managed_location_id()
);

-- INSERT: só o próprio barbeiro, só como 'waiting', sem hold forjado
drop policy if exists "chair_waitlist_insert_own" on public.chair_waitlist;
create policy "chair_waitlist_insert_own"
on public.chair_waitlist for insert to authenticated
with check (
  barber_profile_id = public.current_barber_profile_id()
  and status = 'waiting'
  and hold_expires_at is null
  and converted_booking_id is null
);

-- UPDATE: barbeiro só pode CANCELAR a própria entrada
-- (with check exige status final = 'cancelled'; impede forjar hold/prazo).
-- Triggers SECURITY DEFINER (promoção/expiração/conversão) bypassam RLS.
drop policy if exists "chair_waitlist_update_own_cancel" on public.chair_waitlist;
create policy "chair_waitlist_update_own_cancel"
on public.chair_waitlist for update to authenticated
using (barber_profile_id = public.current_barber_profile_id())
with check (
  barber_profile_id = public.current_barber_profile_id()
  and status = 'cancelled'
);

commit;
```

- [ ] **Step 2: Aplicar via MCP** — `apply_migration`, name `chair_waitlist_core`.

- [ ] **Step 3: Testes SQL (transação com rollback)**

Via `execute_sql` — cada bloco deve produzir o resultado indicado:
```sql
begin;
do $$
declare
  v_chair uuid; v_barber uuid; v_other uuid; v_org uuid; v_loc uuid;
  v_start timestamptz; v_end timestamptz;
begin
  -- dados reais existentes
  select c.id, c.location_id, l.organization_id into v_chair, v_loc, v_org
  from public.chairs c join public.locations l on l.id = c.location_id limit 1;
  select id into v_barber from public.barber_profiles order by created_at limit 1;
  select id into v_other from public.barber_profiles where id <> v_barber order by created_at limit 1;

  v_start := date_trunc('day', now() + interval '2 day') + interval '10 hours';
  v_end   := v_start + interval '5 hours';

  -- T2.1: inserir SEM booking conflitante deve falhar
  begin
    insert into public.chair_waitlist (chair_id, barber_profile_id, location_id, organization_id, desired_start_at, desired_end_at)
    values (v_chair, v_barber, v_loc, v_org, v_start, v_end);
    raise exception 'T2.1 FALHOU: insert sem conflito passou';
  exception when others then
    if sqlerrm not like '%reserve a cadeira diretamente%' then raise; end if;
    raise notice 'T2.1 OK';
  end;

  -- cria booking conflitante direto (bypass validação de horário: insert como definer)
  -- trg_validate_chair_booking NÃO existe no banco vivo (drift descoberto na Task 2);
  -- desabilitar condicionalmente para o script funcionar em ambos os estados
  if exists (select 1 from pg_trigger where tgname = 'trg_validate_chair_booking'
             and tgrelid = 'public.chair_bookings'::regclass) then
    execute 'alter table public.chair_bookings disable trigger trg_validate_chair_booking';
  end if;
  insert into public.chair_bookings (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (v_chair, v_other, v_org, v_start, v_end, 'confirmed');
  if exists (select 1 from pg_trigger where tgname = 'trg_validate_chair_booking'
             and tgrelid = 'public.chair_bookings'::regclass) then
    execute 'alter table public.chair_bookings enable trigger trg_validate_chair_booking';
  end if;

  -- T2.2: agora insert deve passar e denormalizar location/org corretamente
  insert into public.chair_waitlist (chair_id, barber_profile_id, location_id, organization_id, desired_start_at, desired_end_at)
  values (v_chair, v_barber, gen_random_uuid(), gen_random_uuid(), v_start, v_end);
  if not exists (
    select 1 from public.chair_waitlist
    where chair_id = v_chair and barber_profile_id = v_barber
      and location_id = v_loc and organization_id = v_org and status = 'waiting'
  ) then
    raise exception 'T2.2 FALHOU: denormalização errada';
  end if;
  raise notice 'T2.2 OK';

  -- T2.3: segunda entrada ativa do mesmo barbeiro na mesma cadeira deve violar unique
  begin
    insert into public.chair_waitlist (chair_id, barber_profile_id, location_id, organization_id, desired_start_at, desired_end_at)
    values (v_chair, v_barber, v_loc, v_org, v_start + interval '1 day', v_end + interval '1 day');
    raise exception 'T2.3 FALHOU: duplicata ativa passou';
  exception when unique_violation then
    raise notice 'T2.3 OK';
  end;
end $$;
rollback;
```
Esperado: notices `T2.1 OK`, `T2.2 OK`, `T2.3 OK`. (Obs.: o insert do teste roda como service role — a validação de RLS de INSERT/UPDATE é coberta no Step 4.)

- [ ] **Step 4: Teste RLS por impersonação (rollback)**

```sql
begin;
-- pegar um barbeiro real e seu user_id
-- (rodar primeiro: select bp.id, bp.user_id from barber_profiles bp limit 1;)
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_ID_DO_BARBEIRO>","role":"authenticated"}';
-- barbeiro NÃO pode inserir entrada como hold
insert into public.chair_waitlist (chair_id, barber_profile_id, location_id, organization_id, desired_start_at, desired_end_at, status, hold_expires_at)
values ('<CHAIR_ID>', '<BARBER_PROFILE_ID>', '<LOC_ID>', '<ORG_ID>', now() + interval '1 day', now() + interval '1 day 5 hours', 'hold', now() + interval '10 years');
rollback;
```
Esperado: erro de RLS (`new row violates row-level security policy`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260703000200_chair_waitlist_core.sql
git commit -m "feat: chair_waitlist table, org hold config and rls"
```

---

### Task 3: Engine — promoção, enforcement, conversão, expiração

**Files:**
- Create: `supabase/migrations/20260703000300_chair_waitlist_engine.sql`

**Interfaces:**
- Consumes: tabela `chair_waitlist` (Task 2), enum `rejected` (Task 1), tabela `notifications`.
- Produces: `public.promote_next_waitlist_for_chair(p_chair_id uuid)`, `public.expire_waitlist_entries()` (chamada pelo cron da Task 4), triggers em `chair_bookings` e `chair_waitlist`.

- [ ] **Step 1: Criar arquivo de migration**

Conteúdo de `supabase/migrations/20260703000300_chair_waitlist_engine.sql`:
```sql
begin;

-- 1) Promoção: percorre a fila da cadeira em ordem de chegada e promove
-- toda entrada cujo período desejado esteja totalmente livre e sem hold ativo.
create or replace function public.promote_next_waitlist_for_chair(p_chair_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_hold_minutes int;
  v_user_id uuid;
  v_chair_identifier text;
begin
  for v_entry in
    select w.* from public.chair_waitlist w
    where w.chair_id = p_chair_id
      and w.status = 'waiting'
      and w.desired_start_at > now()
    order by w.created_at
    for update skip locked
  loop
    -- período ainda ocupado por booking ativo?
    if exists (
      select 1 from public.chair_bookings cb
      where cb.chair_id = p_chair_id
        and cb.status in ('pending', 'confirmed')
        and tstzrange(cb.start_at, cb.end_at, '[)')
            && tstzrange(v_entry.desired_start_at, v_entry.desired_end_at, '[)')
    ) then
      continue;
    end if;

    -- período já prometido a outro hold ativo?
    if exists (
      select 1 from public.chair_waitlist w2
      where w2.chair_id = p_chair_id
        and w2.id <> v_entry.id
        and w2.status = 'hold'
        and w2.hold_expires_at > now()
        and tstzrange(w2.desired_start_at, w2.desired_end_at, '[)')
            && tstzrange(v_entry.desired_start_at, v_entry.desired_end_at, '[)')
    ) then
      continue;
    end if;

    select coalesce(o.waitlist_hold_minutes, 60) into v_hold_minutes
    from public.organizations o where o.id = v_entry.organization_id;

    update public.chair_waitlist
    set status = 'hold',
        hold_expires_at = now() + make_interval(mins => v_hold_minutes),
        notified_at = now()
    where id = v_entry.id;

    select bp.user_id into v_user_id
    from public.barber_profiles bp where bp.id = v_entry.barber_profile_id;
    select c.identifier into v_chair_identifier
    from public.chairs c where c.id = p_chair_id;

    if v_user_id is not null then
      insert into public.notifications (organization_id, user_id, title, body, type)
      values (
        v_entry.organization_id,
        v_user_id,
        'Vaga liberada na fila de espera!',
        format(
          'A cadeira %s vagou no período %s–%s de %s. Você tem %s minutos para confirmar a reserva.',
          coalesce(v_chair_identifier, ''),
          to_char(v_entry.desired_start_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
          to_char(v_entry.desired_end_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
          to_char(v_entry.desired_start_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
          v_hold_minutes
        ),
        'info'
      );
    end if;
  end loop;
end;
$$;

-- 2) Booking liberado (cancelado/rejeitado) → tenta promover a fila
create or replace function public.on_chair_booking_released()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'rejected')
     and old.status in ('pending', 'confirmed') then
    perform public.promote_next_waitlist_for_chair(new.chair_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chair_booking_released_promote on public.chair_bookings;
create trigger trg_chair_booking_released_promote
after update on public.chair_bookings
for each row execute function public.on_chair_booking_released();

-- 3) Enforcement: hold ativo bloqueia booking de terceiros no período
create or replace function public.enforce_waitlist_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending', 'confirmed') and exists (
    select 1 from public.chair_waitlist w
    where w.chair_id = new.chair_id
      and w.status = 'hold'
      and w.hold_expires_at > now()
      and w.barber_profile_id <> new.barber_profile_id
      and tstzrange(w.desired_start_at, w.desired_end_at, '[)')
          && tstzrange(new.start_at, new.end_at, '[)')
  ) then
    raise exception 'Este horário está reservado temporariamente para outro barbeiro da fila de espera.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_waitlist_hold on public.chair_bookings;
create trigger trg_enforce_waitlist_hold
before insert on public.chair_bookings
for each row execute function public.enforce_waitlist_hold();

-- 4) Conversão: dono do hold reservou → entrada vira converted
create or replace function public.convert_waitlist_hold_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chair_waitlist w
  set status = 'converted', converted_booking_id = new.id
  where w.chair_id = new.chair_id
    and w.barber_profile_id = new.barber_profile_id
    and w.status = 'hold'
    and w.hold_expires_at > now()
    and tstzrange(w.desired_start_at, w.desired_end_at, '[)')
        && tstzrange(new.start_at, new.end_at, '[)');
  return new;
end;
$$;

drop trigger if exists trg_convert_waitlist_hold on public.chair_bookings;
create trigger trg_convert_waitlist_hold
after insert on public.chair_bookings
for each row execute function public.convert_waitlist_hold_on_booking();

-- 5) Hold liberado (cancelado/expirado) → promove o próximo
create or replace function public.on_waitlist_hold_released()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'hold' and new.status in ('cancelled', 'expired') then
    perform public.promote_next_waitlist_for_chair(new.chair_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_waitlist_hold_released on public.chair_waitlist;
create trigger trg_waitlist_hold_released
after update on public.chair_waitlist
for each row execute function public.on_waitlist_hold_released();

-- 6) Expiração periódica (chamada pelo pg_cron; segura para chamar a qualquer momento)
create or replace function public.expire_waitlist_entries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- entradas esperando um período que já começou
  update public.chair_waitlist
  set status = 'expired'
  where status = 'waiting' and desired_start_at <= now();

  -- holds vencidos (o trigger trg_waitlist_hold_released promove os próximos)
  update public.chair_waitlist
  set status = 'expired'
  where status = 'hold' and hold_expires_at <= now();
end;
$$;

commit;
```

- [ ] **Step 2: Aplicar via MCP** — `apply_migration`, name `chair_waitlist_engine`.

- [ ] **Step 3: Teste SQL de cenário completo (rollback)**

Via `execute_sql`:
```sql
begin;
do $$
declare
  v_chair uuid; v_loc uuid; v_org uuid;
  v_b1 uuid; v_b2 uuid; v_b3 uuid;
  v_start timestamptz; v_end timestamptz;
  v_booking uuid; v_entry1 uuid; v_entry2 uuid;
  v_status public.waitlist_status;
  v_notif_count int;
begin
  select c.id, c.location_id, l.organization_id into v_chair, v_loc, v_org
  from public.chairs c join public.locations l on l.id = c.location_id limit 1;
  select id into v_b1 from public.barber_profiles order by created_at limit 1;
  select id into v_b2 from public.barber_profiles where id <> v_b1 order by created_at limit 1;
  select id into v_b3 from public.barber_profiles where id not in (v_b1, v_b2) order by created_at limit 1;
  if v_b3 is null then v_b3 := v_b2; end if;

  v_start := date_trunc('day', now() + interval '2 day') + interval '10 hours';
  v_end   := v_start + interval '5 hours';

  -- trg_validate_chair_booking NÃO existe no banco vivo (drift descoberto na Task 2);
  -- desabilitar condicionalmente para o script funcionar em ambos os estados
  if exists (select 1 from pg_trigger where tgname = 'trg_validate_chair_booking'
             and tgrelid = 'public.chair_bookings'::regclass) then
    execute 'alter table public.chair_bookings disable trigger trg_validate_chair_booking';
  end if;

  -- b1 ocupa o slot
  insert into public.chair_bookings (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (v_chair, v_b1, v_org, v_start, v_end, 'confirmed') returning id into v_booking;

  -- b2 e b3 entram na fila (b2 primeiro)
  insert into public.chair_waitlist (chair_id, barber_profile_id, location_id, organization_id, desired_start_at, desired_end_at)
  values (v_chair, v_b2, v_loc, v_org, v_start, v_end) returning id into v_entry1;
  if v_b3 <> v_b2 then
    insert into public.chair_waitlist (chair_id, barber_profile_id, location_id, organization_id, desired_start_at, desired_end_at)
    values (v_chair, v_b3, v_loc, v_org, v_start, v_end) returning id into v_entry2;
  end if;

  -- T3.1: cancelamento promove b2 para hold + notificação
  update public.chair_bookings set status = 'cancelled' where id = v_booking;
  select status into v_status from public.chair_waitlist where id = v_entry1;
  if v_status <> 'hold' then raise exception 'T3.1 FALHOU: esperado hold, veio %', v_status; end if;
  select count(*) into v_notif_count from public.notifications
  where title like 'Vaga liberada%' and created_at > now() - interval '1 minute';
  if v_notif_count < 1 then raise exception 'T3.1 FALHOU: sem notificação'; end if;
  raise notice 'T3.1 OK';

  -- T3.2: terceiro (b1) tenta reservar o período durante hold de b2 → bloqueado
  begin
    insert into public.chair_bookings (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
    values (v_chair, v_b1, v_org, v_start, v_end, 'confirmed');
    raise exception 'T3.2 FALHOU: booking de terceiro passou durante hold';
  exception when others then
    if sqlerrm not like '%fila de espera%' then raise; end if;
    raise notice 'T3.2 OK';
  end;

  -- T3.3: dono do hold (b2) reserva → entrada converted
  insert into public.chair_bookings (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (v_chair, v_b2, v_org, v_start, v_end, 'confirmed');
  select status into v_status from public.chair_waitlist where id = v_entry1;
  if v_status <> 'converted' then raise exception 'T3.3 FALHOU: esperado converted, veio %', v_status; end if;
  raise notice 'T3.3 OK';

  -- T3.4: expiração de hold promove o próximo
  if v_entry2 is not null then
    -- reabre o slot e força um novo ciclo: cancela booking de b2
    update public.chair_bookings set status = 'cancelled'
    where chair_id = v_chair and barber_profile_id = v_b2 and status = 'confirmed';
    -- b3 deve ter sido promovido a hold
    select status into v_status from public.chair_waitlist where id = v_entry2;
    if v_status <> 'hold' then raise exception 'T3.4a FALHOU: esperado hold, veio %', v_status; end if;
    -- vence o hold na marra e roda a expiração
    update public.chair_waitlist set hold_expires_at = now() - interval '1 minute' where id = v_entry2;
    perform public.expire_waitlist_entries();
    select status into v_status from public.chair_waitlist where id = v_entry2;
    if v_status <> 'expired' then raise exception 'T3.4b FALHOU: esperado expired, veio %', v_status; end if;
    raise notice 'T3.4 OK';
  else
    raise notice 'T3.4 SKIP (menos de 3 barbeiros no banco)';
  end if;

  if exists (select 1 from pg_trigger where tgname = 'trg_validate_chair_booking'
             and tgrelid = 'public.chair_bookings'::regclass) then
    execute 'alter table public.chair_bookings enable trigger trg_validate_chair_booking';
  end if;
end $$;
rollback;
```
Esperado: `T3.1 OK`, `T3.2 OK`, `T3.3 OK`, `T3.4 OK` (ou SKIP).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260703000300_chair_waitlist_engine.sql
git commit -m "feat: waitlist promotion, hold enforcement and expiry engine"
```

---

### Task 4: pg_cron — expiração a cada 5 minutos

**Files:**
- Create: `supabase/migrations/20260703000400_chair_waitlist_cron.sql`

**Interfaces:**
- Consumes: `public.expire_waitlist_entries()` (Task 3).

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- pg_cron ainda não estava habilitado neste projeto.
create extension if not exists pg_cron;

-- idempotente: remove job antigo se existir
do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'expire-waitlist-entries';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'expire-waitlist-entries',
  '*/5 * * * *',
  $$select public.expire_waitlist_entries()$$
);
```

- [ ] **Step 2: Aplicar via MCP** — `apply_migration`, name `chair_waitlist_cron`.

- [ ] **Step 3: Verificar**

```sql
select jobname, schedule, command, active from cron.job where jobname = 'expire-waitlist-entries';
```
Esperado: 1 linha, schedule `*/5 * * * *`, active `t`.

Depois de ~6 min (opcional, não bloqueia): `select * from cron.job_run_details order by start_time desc limit 3;` — status `succeeded`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260703000400_chair_waitlist_cron.sql
git commit -m "feat: schedule waitlist expiry via pg_cron"
```

---

### Task 5: Types + service `waitlist.ts`

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regenerado)
- Create: `src/services/waitlist.ts`

**Interfaces:**
- Produces (consumido pelas Tasks 6–9):
  - `joinWaitlist(input: JoinWaitlistInput): Promise<void>`
  - `listMyWaitlist(): Promise<MyWaitlistEntry[]>`
  - `cancelWaitlistEntry(entryId: string): Promise<void>`
  - `listLocationWaitlist(locationId: string): Promise<LocationWaitlistEntry[]>`
- Consumes: padrão `getCurrentBarberProfileId` (copiar de `src/services/chairBookings.ts:32-53` — função é privada lá; duplicar é aceito no padrão atual do repo).

- [ ] **Step 1: Regenerar types**

Run: `npm run types`
Esperado: `src/integrations/supabase/types.ts` ganha `chair_waitlist`, `waitlist_status`, `waitlist_hold_minutes`, `my_waitlist_positions`. Conferir com grep por `chair_waitlist`.

- [ ] **Step 2: Criar `src/services/waitlist.ts`**

```typescript
import { supabase } from "@/integrations/supabase/client";

export type JoinWaitlistInput = {
  chairId: string;
  organizationId: string;
  locationId: string;
  desiredStartAt: string;
  desiredEndAt: string;
};

export type MyWaitlistEntry = {
  id: string;
  chair_id: string;
  desired_start_at: string;
  desired_end_at: string;
  status: string;
  hold_expires_at: string | null;
  created_at: string;
  chair_identifier: string;
  location_name: string;
  organization_id: string;
  queue_position: number | null;
};

export type LocationWaitlistEntry = {
  id: string;
  chair_id: string;
  chair_identifier: string;
  barber_name: string;
  desired_start_at: string;
  desired_end_at: string;
  status: string;
  hold_expires_at: string | null;
  created_at: string;
};

async function getCurrentBarberProfileId(): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Usuário não autenticado.");
  }

  const { data, error } = await supabase
    .from("barber_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    throw new Error("Perfil do barbeiro não encontrado.");
  }

  return data.id;
}

export function getFriendlyWaitlistError(message: string): string {
  const msg = (message || "").toLowerCase();
  if (msg.includes("uq_chair_waitlist_active_per_barber_chair") || msg.includes("duplicate key")) {
    return "Você já está na fila desta cadeira.";
  }
  if (msg.includes("reserve a cadeira diretamente")) {
    return "Este período está livre — reserve a cadeira diretamente.";
  }
  if (msg.includes("futuro")) {
    return "O período desejado deve estar no futuro.";
  }
  return message || "Erro ao entrar na fila.";
}

export async function joinWaitlist(input: JoinWaitlistInput): Promise<void> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { error } = await supabase.from("chair_waitlist").insert({
    chair_id: input.chairId,
    barber_profile_id: barberProfileId,
    organization_id: input.organizationId,
    location_id: input.locationId,
    desired_start_at: input.desiredStartAt,
    desired_end_at: input.desiredEndAt,
  });

  if (error) {
    throw new Error(getFriendlyWaitlistError(error.message));
  }
}

export async function listMyWaitlist(): Promise<MyWaitlistEntry[]> {
  const barberProfileId = await getCurrentBarberProfileId();

  const [entriesRes, positionsRes] = await Promise.all([
    supabase
      .from("chair_waitlist")
      .select("*, chairs(identifier, locations(name))")
      .eq("barber_profile_id", barberProfileId)
      .in("status", ["waiting", "hold"])
      .order("created_at", { ascending: false }),
    supabase.rpc("my_waitlist_positions"),
  ]);

  if (entriesRes.error) {
    throw new Error(entriesRes.error.message || "Erro ao carregar sua fila.");
  }

  const positionMap = new Map<string, number>();
  for (const p of positionsRes.data ?? []) {
    positionMap.set(p.entry_id, Number(p.queue_position));
  }

  return (entriesRes.data ?? []).map((row: any) => {
    const chair = Array.isArray(row.chairs) ? row.chairs[0] : row.chairs;
    const location = Array.isArray(chair?.locations) ? chair.locations[0] : chair?.locations;
    return {
      id: row.id,
      chair_id: row.chair_id,
      desired_start_at: row.desired_start_at,
      desired_end_at: row.desired_end_at,
      status: row.status,
      hold_expires_at: row.hold_expires_at,
      created_at: row.created_at,
      chair_identifier: chair?.identifier ?? "Cadeira",
      location_name: location?.name ?? "Local não informado",
      organization_id: row.organization_id,
      queue_position: positionMap.get(row.id) ?? null,
    };
  });
}

export async function cancelWaitlistEntry(entryId: string): Promise<void> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { error } = await supabase
    .from("chair_waitlist")
    .update({ status: "cancelled" })
    .eq("id", entryId)
    .eq("barber_profile_id", barberProfileId)
    .in("status", ["waiting", "hold"]);

  if (error) {
    throw new Error(error.message || "Erro ao sair da fila.");
  }
}

export async function listLocationWaitlist(
  locationId: string
): Promise<LocationWaitlistEntry[]> {
  const { data, error } = await supabase
    .from("chair_waitlist")
    .select("*, chairs(identifier), barber_profiles(full_name)")
    .eq("location_id", locationId)
    .in("status", ["waiting", "hold"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Erro ao carregar fila do ponto.");
  }

  return (data ?? []).map((row: any) => {
    const chair = Array.isArray(row.chairs) ? row.chairs[0] : row.chairs;
    const barber = Array.isArray(row.barber_profiles) ? row.barber_profiles[0] : row.barber_profiles;
    return {
      id: row.id,
      chair_id: row.chair_id,
      chair_identifier: chair?.identifier ?? "Cadeira",
      barber_name: barber?.full_name ?? "Barbeiro",
      desired_start_at: row.desired_start_at,
      desired_end_at: row.desired_end_at,
      status: row.status,
      hold_expires_at: row.hold_expires_at,
      created_at: row.created_at,
    };
  });
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit`
Esperado: sem erros novos (se `rpc("my_waitlist_positions")` reclamar de tipo, os types do Step 1 devem incluí-la em `Functions`; conferir antes de apelar para `as any`).

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts src/services/waitlist.ts
git commit -m "feat: waitlist service and regenerated db types"
```

---

### Task 6: Botão "Entrar na fila" no formulário de reserva

**Files:**
- Modify: `src/components/barber/ChairBookingForm.tsx`

**Interfaces:**
- Consumes: `joinWaitlist` (Task 5). `ExploreChairItem` já tem `chair_id`, `organization_id`, `location_id`.

- [ ] **Step 1: Adicionar estado e handler**

No `ChairBookingForm.tsx`, adicionar import:
```typescript
import { joinWaitlist } from "@/services/waitlist";
```
Adicionar estados junto aos existentes (`saving`, `error` — linhas ~122-124):
```typescript
const [conflictDetected, setConflictDetected] = useState(false);
const [joiningWaitlist, setJoiningWaitlist] = useState(false);
```
No `handleSubmit`, trocar o bloco de conflito (linhas 220-223):
```typescript
    if (hasConflict(s, f)) {
      setError("Essa cadeira já está reservada nesse horário.");
      setConflictDetected(true);
      return;
    }
    setConflictDetected(false);
```
Também setar `setConflictDetected(true)` no catch quando o erro for de overlap:
```typescript
    } catch (err: any) {
      console.error("Booking creation failed:", err);
      const friendly = getFriendlyBookingError(err.message ?? "");
      setError(friendly);
      if ((err.message ?? "").includes("chair_bookings_no_overlap_per_chair")) {
        setConflictDetected(true);
      }
    } finally {
```
Adicionar handler antes do `return`:
```typescript
  async function handleJoinWaitlist() {
    setJoiningWaitlist(true);
    setError("");
    try {
      const s = buildDate(date, start);
      const f = buildDate(date, end);
      await joinWaitlist({
        chairId: chair.chair_id,
        organizationId: chair.organization_id,
        locationId: chair.location_id,
        desiredStartAt: s.toISOString(),
        desiredEndAt: f.toISOString(),
      });
      toast.success("Você entrou na fila de espera! Avisaremos quando o horário vagar.");
      setConflictDetected(false);
      onCancel?.();
    } catch (err: any) {
      setError(err.message ?? "Erro ao entrar na fila.");
    } finally {
      setJoiningWaitlist(false);
    }
  }
```

- [ ] **Step 2: Renderizar o botão no bloco de erro**

Substituir o bloco de erro (linhas 355-359) por:
```tsx
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-xs font-medium space-y-2">
          <p>{error}</p>
          {conflictDetected && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={joiningWaitlist}
              onClick={handleJoinWaitlist}
            >
              {joiningWaitlist ? "Entrando na fila..." : "Entrar na fila de espera deste horário"}
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/barber/ChairBookingForm.tsx
git commit -m "feat: join waitlist from booking form on conflict"
```

---

### Task 7: Seção "Minha fila" no portal do barbeiro

**Files:**
- Create: `src/components/barber/MyWaitlistSection.tsx`
- Modify: `src/pages/barber/MyBookingsPage.tsx` (renderizar a seção no topo; página em `/barber/my-bookings`, ver `src/App.tsx:213`)

**Interfaces:**
- Consumes: `listMyWaitlist`, `cancelWaitlistEntry`, `MyWaitlistEntry` (Task 5); `createChairBooking` (`src/services/chairBookings.ts`), `createBookingPayment` (`src/services/payments.ts`).

- [ ] **Step 1: Criar `src/components/barber/MyWaitlistSection.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, Hourglass } from "lucide-react";
import {
  listMyWaitlist,
  cancelWaitlistEntry,
  type MyWaitlistEntry,
} from "@/services/waitlist";
import { createChairBooking } from "@/services/chairBookings";
import { createBookingPayment } from "@/services/payments";

function formatPeriod(startAt: string, endAt: string) {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const date = s.toLocaleDateString("pt-BR");
  const st = s.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const et = e.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} • ${st}–${et}`;
}

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return <span className="text-destructive">Prazo esgotado</span>;

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  return (
    <span className="font-mono font-semibold">
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </span>
  );
}

export default function MyWaitlistSection() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MyWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setEntries(await listMyWaitlist());
    } catch (e) {
      console.error("Erro ao carregar fila:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCancel(entryId: string) {
    setActioning(entryId);
    try {
      await cancelWaitlistEntry(entryId);
      toast.success("Você saiu da fila.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao sair da fila.");
    } finally {
      setActioning(null);
    }
  }

  async function handleBookNow(entry: MyWaitlistEntry) {
    setActioning(entry.id);
    try {
      const booking = await createChairBooking({
        chairId: entry.chair_id,
        organizationId: entry.organization_id,
        startAt: entry.desired_start_at,
        endAt: entry.desired_end_at,
      });
      try {
        await createBookingPayment(booking.id, 50.0, entry.organization_id);
        toast.success("Reserva criada! Redirecionando para pagamento...");
        navigate(`/barber/payment/${booking.id}`);
      } catch {
        toast.warning("Reserva criada, mas houve problema ao gerar cobrança.");
        await load();
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar reserva.");
      await load();
    } finally {
      setActioning(null);
    }
  }

  if (loading || entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Hourglass className="h-4 w-4" />
        Minha fila de espera
      </h2>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-xl border p-4 bg-card shadow-sm ${
              entry.status === "hold" ? "border-primary ring-1 ring-primary/30" : ""
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {entry.chair_identifier} • {entry.location_name}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatPeriod(entry.desired_start_at, entry.desired_end_at)}
                </p>
                {entry.status === "waiting" && entry.queue_position !== null && (
                  <Badge variant="secondary">{entry.queue_position}º na fila</Badge>
                )}
                {entry.status === "hold" && entry.hold_expires_at && (
                  <p className="text-xs text-primary">
                    Vaga liberada! Confirme em{" "}
                    <HoldCountdown expiresAt={entry.hold_expires_at} />
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {entry.status === "hold" && (
                  <Button
                    size="sm"
                    disabled={actioning === entry.id}
                    onClick={() => handleBookNow(entry)}
                  >
                    {actioning === entry.id ? "Reservando..." : "Reservar agora"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actioning === entry.id}
                  onClick={() => handleCancel(entry.id)}
                >
                  Sair da fila
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```
Obs.: valor fixo R$ 50,00 replica o MVP de `ChairBookingForm.tsx:254-255` (pricing real é item #2 do roadmap).

- [ ] **Step 2: Integrar em `MyBookingsPage.tsx`**

Adicionar import:
```tsx
import MyWaitlistSection from "@/components/barber/MyWaitlistSection";
```
O container principal é `<div className="space-y-6 p-6 max-w-6xl mx-auto">` (`MyBookingsPage.tsx:95`). Renderizar `<MyWaitlistSection />` como primeiro filho desse div, antes do header existente (linha 96).

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/barber/MyWaitlistSection.tsx src/pages/barber/MyBookingsPage.tsx
git commit -m "feat: my waitlist section with hold countdown and book-now"
```

---

### Task 8: Config do prazo do hold em Settings

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: coluna `organizations.waitlist_hold_minutes` (Task 2, já nos types via Task 5).

- [ ] **Step 1: Adicionar estado + handler**

Junto aos estados existentes (`SettingsPage.tsx:18-21`):
```typescript
const [holdMinutes, setHoldMinutes] = useState<string>("60");
const [savingHold, setSavingHold] = useState(false);
```
No `useEffect` de sync (linhas 24-29), adicionar:
```typescript
setHoldMinutes(String((organization as any).waitlist_hold_minutes ?? 60));
```
Handler (padrão de `handleAutoConfirmToggle`):
```typescript
  async function handleSaveHoldMinutes() {
    if (!organization?.id) return;
    const value = Number(holdMinutes);
    if (!Number.isInteger(value) || value < 5 || value > 1440) {
      toast.error("Informe um valor entre 5 e 1440 minutos.");
      return;
    }
    setSavingHold(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ waitlist_hold_minutes: value } as any)
        .eq("id", organization.id);
      if (error) throw error;
      toast.success("Prazo da fila de espera atualizado.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar prazo da fila.");
    } finally {
      setSavingHold(false);
    }
  }
```

- [ ] **Step 2: Adicionar card após o card "Confirmação de reservas" (linha ~176)**

```tsx
      {/* Waitlist hold */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4" />
            Fila de espera
          </CardTitle>
          <CardDescription>
            Quando uma reserva é cancelada, o primeiro barbeiro da fila recebe um prazo
            exclusivo para confirmar a vaga antes de passar ao próximo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="holdMinutes">Prazo para confirmar a vaga (minutos)</Label>
            <div className="flex gap-2">
              <Input
                id="holdMinutes"
                type="number"
                min={5}
                max={1440}
                value={holdMinutes}
                onChange={(e) => setHoldMinutes(e.target.value)}
                className="max-w-[140px]"
              />
              <Button onClick={handleSaveHoldMinutes} disabled={savingHold}>
                {savingHold ? "Salvando..." : "Salvar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Entre 5 e 1440 minutos. Padrão: 60.</p>
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`. Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: configurable waitlist hold duration in org settings"
```

---

### Task 9: Visão read-only da fila para dono e gerente

**Files:**
- Create: `src/components/LocationWaitlistSection.tsx`
- Modify: `src/pages/LocationDetailPage.tsx` (portal do dono)
- Modify: `src/pages/manager/ManagerChairsPage.tsx` (portal do gerente)

**Interfaces:**
- Consumes: `listLocationWaitlist`, `LocationWaitlistEntry` (Task 5). Gerente: `location_id` gerenciado já disponível nessas páginas (conferir como `ManagerChairsPage` obtém o location; usar a mesma fonte).

- [ ] **Step 1: Criar `src/components/LocationWaitlistSection.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hourglass } from "lucide-react";
import {
  listLocationWaitlist,
  type LocationWaitlistEntry,
} from "@/services/waitlist";

const statusLabel: Record<string, string> = {
  waiting: "Aguardando",
  hold: "Vaga oferecida",
};

function formatPeriod(startAt: string, endAt: string) {
  const s = new Date(startAt);
  const e = new Date(endAt);
  return `${s.toLocaleDateString("pt-BR")} • ${s.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}–${e.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function LocationWaitlistSection({ locationId }: { locationId: string }) {
  const [entries, setEntries] = useState<LocationWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listLocationWaitlist(locationId)
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch((e) => console.error("Erro ao carregar fila do ponto:", e))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locationId]);

  if (loading || entries.length === 0) return null;

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="h-4 w-4" />
          Fila de espera ({entries.length})
        </CardTitle>
        <CardDescription>
          Barbeiros aguardando vaga em cadeiras deste ponto — demanda além da capacidade atual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between rounded-lg border p-3 text-sm"
          >
            <div>
              <span className="font-medium">{entry.barber_name}</span>{" "}
              <span className="text-muted-foreground">— {entry.chair_identifier}</span>
              <p className="text-xs text-muted-foreground">
                {formatPeriod(entry.desired_start_at, entry.desired_end_at)}
              </p>
            </div>
            <Badge variant={entry.status === "hold" ? "default" : "secondary"}>
              {statusLabel[entry.status] ?? entry.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Integrar no `LocationDetailPage.tsx`**

O `id` do location vem de `useParams` (`LocationDetailPage.tsx:190`; rota `locations/:id`, `src/App.tsx:140`). Adicionar:
```tsx
import LocationWaitlistSection from "@/components/LocationWaitlistSection";
```
Renderizar após a seção de cadeiras, no fim do container principal:
```tsx
{id && <LocationWaitlistSection locationId={id} />}
```

- [ ] **Step 3: Integrar no `ManagerChairsPage.tsx`**

O location gerenciado vem de `const { managerLocationId } = useBarberProfile()` (`ManagerChairsPage.tsx:35`). Adicionar o mesmo import e renderizar no fim da página, após a lista de cadeiras:
```tsx
{managerLocationId && <LocationWaitlistSection locationId={managerLocationId} />}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` e `npm run build`. Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/LocationWaitlistSection.tsx src/pages/LocationDetailPage.tsx src/pages/manager/ManagerChairsPage.tsx
git commit -m "feat: read-only waitlist view for owner and manager"
```

---

### Task 10: Verificação final

**Files:** nenhum novo (correções pontuais se algo falhar).

- [ ] **Step 1: Build + testes existentes**

Run: `npm run build` e `npx vitest run`
Esperado: build ok; testes existentes (`src/test/example.test.ts`, `src/lib/managerPermissions.test.ts`) passando.

- [ ] **Step 2: Re-rodar cenário SQL completo da Task 3 Step 3** (com rollback) — confirma engine intacta após tudo aplicado.

- [ ] **Step 3: Advisors**

Via MCP `get_advisors` (type security) no projeto canônico. Esperado: nenhum alerta novo sobre `chair_waitlist` (RLS habilitada, policies presentes).

- [ ] **Step 4: Verificação manual (usar skill `verify` se disponível)**

Fluxo: barbeiro A reserva cadeira; barbeiro B tenta mesmo período → botão "Entrar na fila" → entra; dono cancela/rejeita a reserva de A → sino de notificação de B mostra "Vaga liberada"; "Minha fila" mostra hold com countdown; "Reservar agora" cria reserva + cobrança; Settings mostra e salva o prazo; LocationDetailPage do dono mostra a fila.

- [ ] **Step 5: Commit final de ajustes (se houver) e atualização de memória**

Atualizar `memory/regras_negocio.md` (nova regra: fila de espera) e `memory/funcionalidade_futura.md` (marcar item 10 como feito) + memória persistente do agente.
