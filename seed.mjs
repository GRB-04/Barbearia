// Seed completo — cria usuários e perfis/associações corretas
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://qrfggirhrunuaecvltub.supabase.co",
  "sb_publishable_hv4wqGCrJFhcdpe6TTtysA_D9SKavUk"
);

const USERS = {
  owner:        { email: "dono.teste.e2e@gmail.com",     password: "Teste@2026!" },
  barber:       { email: "barbeiro@gmail.com",           password: "123456" },
  barber2:      { email: "barbeiro2@gmail.com",          password: "123456" },
  manager:      { email: "gerente@gmail.com",            password: "123456" },
  receptionist: { email: "recepcionista@gmail.com",     password: "123456" },
};

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Login failed for ${email}: ${error.message}`);
  return data.user;
}

async function ensureProfile(user, fullName, role) {
  // Cria ou atualiza o perfil (executado logado como o próprio usuário)
  const { data: existing } = await supabase
    .from("barber_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    console.log(`  ✅ Perfil de ${role} já existe (id: ${existing.id})`);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("barber_profiles")
    .insert({
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      phone: "+55 11 99999-9999",
      role: role,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Erro ao criar perfil de ${role}: ${error.message}`);
  console.log(`  ✅ Perfil de ${role} criado (id: ${created.id})`);
  return created.id;
}

async function main() {
  console.log("=== INICIANDO SEED COMPLETO E IDEMPOTENTE ===\n");

  // 1. Logar e preparar cada usuário
  console.log("Preparando usuários e perfis...");
  
  const ownerUser = await login(USERS.owner.email, USERS.owner.password);
  const ownerProfileId = await ensureProfile(ownerUser, "Dono Teste", "owner");
  await supabase.auth.signOut();

  const barberUser = await login(USERS.barber.email, USERS.barber.password);
  const barberProfileId = await ensureProfile(barberUser, "Barbeiro Teste", "barber");
  await supabase.auth.signOut();

  const barber2User = await login(USERS.barber2.email, USERS.barber2.password);
  const barber2ProfileId = await ensureProfile(barber2User, "Barbeiro 2 Teste", "barber");
  await supabase.auth.signOut();

  const managerUser = await login(USERS.manager.email, USERS.manager.password);
  const managerProfileId = await ensureProfile(managerUser, "Gerente Teste", "manager");
  await supabase.auth.signOut();

  const receptionistUser = await login(USERS.receptionist.email, USERS.receptionist.password);
  const receptionistProfileId = await ensureProfile(receptionistUser, "Recepcionista Teste", "receptionist");
  await supabase.auth.signOut();

  // 2. Logar como Dono para criar a estrutura e associações
  console.log("\nConfigurando estrutura da barbearia (logado como dono)...");
  await login(USERS.owner.email, USERS.owner.password);

  // Organização
  let orgId;
  const { data: existingOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", ownerUser.id)
    .maybeSingle();

  if (existingOrg) {
    orgId = existingOrg.id;
    console.log(`  ✅ Organização existente: BarberHouse (${orgId})`);
  } else {
    const { data: newOrg, error } = await supabase
      .from("organizations")
      .insert({ name: "BarberHouse", owner_id: ownerUser.id })
      .select("id")
      .single();
    if (error) throw error;
    orgId = newOrg.id;
    console.log(`  ✅ Organização criada: BarberHouse (${orgId})`);
  }

  // Unidade (Location)
  let locationId;
  const { data: existingLoc } = await supabase
    .from("locations")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (existingLoc) {
    locationId = existingLoc.id;
    console.log(`  ✅ Unidade existente: Unidade Centro Teste (${locationId})`);
  } else {
    const { data: newLoc, error } = await supabase
      .from("locations")
      .insert({
        name: "Unidade Centro Teste",
        organization_id: orgId,
        address: "Rua Teste, 123",
        capacity: 2,
        status: "active",
        operating_hours: {
          monday:    { open: true,  start: "08:00", end: "18:00" },
          tuesday:   { open: true,  start: "08:00", end: "18:00" },
          wednesday: { open: true,  start: "08:00", end: "18:00" },
          thursday:  { open: true,  start: "08:00", end: "22:00" },
          friday:    { open: true,  start: "08:00", end: "22:00" },
          saturday:  { open: true,  start: "08:00", end: "22:00" },
          sunday:    { open: false, start: "08:00", end: "18:00" },
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    locationId = newLoc.id;
    console.log(`  ✅ Unidade criada: Unidade Centro Teste (${locationId})`);
  }

  // Cadeiras
  const { data: existingChairs } = await supabase
    .from("chairs")
    .select("identifier")
    .eq("location_id", locationId);

  const existingIdentifiers = existingChairs?.map(c => c.identifier) ?? [];
  for (const identifier of ["A1", "A2"]) {
    if (existingIdentifiers.includes(identifier)) {
      console.log(`  ✅ Cadeira ${identifier} já existe`);
    } else {
      const { error } = await supabase
        .from("chairs")
        .insert({ identifier, location_id: locationId, resources: {}, status: "available" });
      if (error) throw error;
      console.log(`  ✅ Cadeira ${identifier} criada`);
    }
  }

  // Associações de Barbeiros na Organização (organization_barbers)
  console.log("\nAssociando barbeiros na organização...");
  
  const barbersToLink = [
    {
      profileId: barberProfileId,
      userId: barberUser.id,
      email: USERS.barber.email,
      name: "Barbeiro Teste",
      role: "barber",
      permissions: {},
      locId: null
    },
    {
      profileId: barber2ProfileId,
      userId: barber2User.id,
      email: USERS.barber2.email,
      name: "Barbeiro 2 Teste",
      role: "barber",
      permissions: {},
      locId: null
    },
    {
      profileId: managerProfileId,
      userId: managerUser.id,
      email: USERS.manager.email,
      name: "Gerente Teste",
      role: "manager",
      permissions: { can_view_financials: true },
      locId: locationId
    },
    {
      profileId: receptionistProfileId,
      userId: receptionistUser.id,
      email: USERS.receptionist.email,
      name: "Recepcionista Teste",
      role: "receptionist",
      permissions: {},
      locId: null
    }
  ];

  for (const b of barbersToLink) {
    const { data: existingLink } = await supabase
      .from("organization_barbers")
      .select("id")
      .eq("barber_profile_id", b.profileId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (existingLink) {
      console.log(`  ✅ Vínculo de ${b.email} já existe`);
    } else {
      const { error } = await supabase
        .from("organization_barbers")
        .insert({
          barber_profile_id: b.profileId,
          user_id: b.userId,
          organization_id: orgId,
          location_id: b.locId,
          email: b.email,
          full_name: b.name,
          role: b.role,
          permissions: b.permissions,
        });
      if (error && error.code !== '23505') throw error;  // ignora duplicata
      console.log(`  ✅ Vínculo de ${b.email} criado com sucesso!`);
    }
  }

  await supabase.auth.signOut();
  console.log("\n=== SEED COMPLETO REALIZADO COM SUCESSO ===");
}

main().catch(console.error);
