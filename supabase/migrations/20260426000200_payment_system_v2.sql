begin;

-- =========================================================
-- 1) ENUM PARA MÉTODOS DE PAGAMENTO
-- =========================================================
do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'payment_method_type'
  ) then
    create type public.payment_method_type as enum (
      'pix',
      'card',
      'cash'
    );
  end if;
end
$$;

-- =========================================================
-- 2) ATUALIZAÇÃO DA TABELA DE PAYMENTS
-- =========================================================
alter table public.payments 
  add column if not exists booking_id uuid references public.chair_bookings(id) on delete set null,
  add column if not exists payment_method public.payment_method_type default 'pix',
  add column if not exists external_id text;

-- Índices para performance
create index if not exists idx_payments_booking_id on public.payments(booking_id);
create index if not exists idx_payments_external_id on public.payments(external_id);

-- =========================================================
-- 3) TRIGGER PARA CONFIRMAÇÃO AUTOMÁTICA DE BOOKING
-- =========================================================
create or replace function public.confirm_booking_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Se o status do pagamento mudou para 'paid' e existe um booking_id
  if (new.status = 'paid' and (old.status is null or old.status <> 'paid') and new.booking_id is not null) then
    update public.chair_bookings
    set status = 'confirmed'
    where id = new.booking_id
      and status = 'pending'; -- Apenas se estiver pendente
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_confirm_booking_on_payment on public.payments;

create trigger trg_confirm_booking_on_payment
after insert or update on public.payments
for each row
execute function public.confirm_booking_on_payment();

-- =========================================================
-- 4) RLS PARA PAYMENTS (Harden)
-- =========================================================
-- Permitir que o barbeiro veja seus próprios pagamentos via booking
create policy "barbers_view_own_payments"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.chair_bookings cb
    where cb.id = payments.booking_id
      and cb.barber_profile_id = public.current_barber_profile_id()
  )
);

commit;
