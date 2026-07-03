-- BookingsPage envia status 'rejected' na rejeição do dono, mas o enum nunca
-- recebeu o valor — o UPDATE falhava. Triggers de contrato já tratam 'rejected'.
-- ADD VALUE não pode ser usado na mesma transação; por isso migration isolada.
alter type public.chair_booking_status add value if not exists 'rejected';
