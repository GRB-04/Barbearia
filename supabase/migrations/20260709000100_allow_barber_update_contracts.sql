-- Permitir que o barbeiro atualize seu próprio contrato (para assinatura e cancelamento)
create policy "contracts_update_barber"
on public.contracts
for update
to authenticated
using (
  barber_profile_id = public.current_barber_profile_id()
)
with check (
  barber_profile_id = public.current_barber_profile_id()
);
