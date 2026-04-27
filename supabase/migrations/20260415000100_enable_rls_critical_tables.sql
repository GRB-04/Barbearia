-- Habilitar RLS nas tabelas críticas
-- Motivo: RLS foi desabilitado na migração anterior, permitindo que dados fossem acessados sem controle
-- Esta migration restaura a segurança re-habilitando RLS em todas as tabelas com políticas definidas

ALTER TABLE public.barber_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
